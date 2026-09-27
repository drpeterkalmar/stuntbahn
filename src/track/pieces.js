// Streckenelemente ("Bausteine") auf dem 30×30-Raster.
// Lokale Koordinaten je Element: f = vorwärts ab Einfahrtskante, r = rechts, y = hoch (Meter).
// Jedes Element beschreibt: belegte Felder (a vorwärts, b rechts), Ausfahrt, Höhenwechsel und
// baut Fahrlinie + Geometrie über den Piece-Builder (pb, siehe build.js).
import { TILE, LEVEL_H, ROAD_HW, MAT } from './defs.js';
import { smoothstep, smootherstep, clamp } from '../core/util.js';
import { AIR, flightPath } from '../physics/air.js';
import { CAR_DEF } from '../physics/car.js';

const T = TILE;
const PI = Math.PI;

// ---------- Looping: Klothoiden-Form (Krümmung ~ sin), einmal vorberechnet ----------
export const LOOP = (() => {
  const S = 56, N = 1400;
  let tot = 0;
  const w = (t) => Math.sin(PI * t);
  for (let i = 0; i < N; i++) tot += w((i + 0.5) / N);
  const k0 = 2 * PI / (S * tot / N);
  const pts = [];
  let th = 0, f = 0, y = 0;
  for (let i = 0; i <= N; i++) {
    pts.push({ f, y, th });
    if (i === N) break;
    const ds = S / N, k = k0 * w((i + 0.5) / N);
    f += Math.cos(th + 0.5 * k * ds) * ds;
    y += Math.sin(th + 0.5 * k * ds) * ds;
    th += k * ds;
  }
  const dF = pts[N].f;
  let H = 0;
  for (const p of pts) H = Math.max(H, p.y);
  return { S, N, pts, dF, H, shift: 2.95, hw: 2.25 };
})();

// ---------- Sprung: Schanze (Feld 1), Lücke (Feld 2..), Landung (letztes Feld) ----------
// Höhere Sprünge (27.09.2026, Original-Stunts-Gefühl): steilere Lippe + Luft-Faktor (physics/air.js),
// Landerampe so hoch wie die Lippe (Rampe → Lücke → Rampe wie im Original) und über das ganze Feld,
// Ziel weiter hinten → Scheitel ~2×, Flugzeit ~+65 %, Weite ~+15 % (Messung: tools/jump_measure.mjs).
// Bis dahin: { kickStart: 4, lipH: 2.1, lipDeg: 15, landH: 2.5, landLen: 18 }, Landung landH·u²,
// Ziel 45 % der Landung, Anzeige-Parabel fest −0.012·x².
// URL: ?lip=… Lippenwinkel; ≤ 18° zusätzlich die alte Landerampe → ?lip=15&air=1 = exakt der alte Sprung.
const OLD_LAND = { landH: 2.5, landLen: 18, aim: 0.45, landShape: 'quad' };
export const JUMP = {
  kickStart: 4, lipDeg: 28, landH: 3.5, landLen: 20, aim: 0.85, landShape: 'smooth',
  get lipH() { return kickerY(T).y; }, // Lippenhöhe folgt aus dem Kreisbogen (15° → 2.1 m, 28° → 3.8 m)
};
export function setLip(deg) {
  JUMP.lipDeg = Math.max(8, Math.min(35, deg));
  if (deg <= 18) Object.assign(JUMP, OLD_LAND);
}
{
  const q = globalThis.location && globalThis.location.search;
  const v = q ? +new URLSearchParams(q).get('lip') : 0;
  if (v >= 8 && v <= 35) setLip(v);
}
function kickerY(f) { // Kreisbogen von Steigung 0 bis lipDeg, endet bei f = T
  const L = T - JUMP.kickStart, th = JUMP.lipDeg * PI / 180, R = L / th;
  if (f <= JUMP.kickStart) return { y: 0, slope: 0 };
  const a = (f - JUMP.kickStart) / R;
  const s = Math.min(a, th);
  return { y: R * (1 - Math.cos(s)), slope: Math.tan(s) };
}
export function landY(x) { // x ab Vorderkante der Landung; 'smooth': oben/unten flach, Mitte ~15°
  const L = JUMP.landLen;
  if (x <= 0) return JUMP.landH;
  if (x >= L) return 0;
  const u = 1 - x / L;
  return JUMP.landH * (JUMP.landShape === 'smooth' ? u * u * (3 - 2 * u) : u * u);
}

// Tempo-Fenster der Standard-Schanze (Lippe bei f=T, Landung ab f=2T): Flugbahn der Radaufstandspunkte
// mit derselben Luft-Physik wie das Auto (flightPath). vbest landet bei JUMP.aim der Landerampe.
const AIR_DRAG = CAR_DEF.dragK / CAR_DEF.mass;
const jwCache = new Map();
export function jumpWindow() {
  const key = `${AIR.factor}|${JUMP.lipDeg}|${JUMP.landH}|${JUMP.landLen}|${JUMP.aim}|${JUMP.landShape}`;
  if (jwCache.has(key)) return jwCache.get(key);
  const th = JUMP.lipDeg * PI / 180, lipY = JUMP.lipH;
  const landAt = (v) => {
    const P = flightPath(lipY, th, v, { xMax: 90, yMin: -1, drag: AIR_DRAG });
    for (let k = 1; k < P.x.length; k++) {
      const x = P.x[k], y = P.y[k];
      const fl = x - T;             // Position relativ zur Vorderkante der Landung
      if (fl < 0) { if (y < 0) return { fail: 'kurz' }; continue; }
      if (fl < 0.6 && y < JUMP.landH + 0.55) return { fail: 'Kante' };
      if (y <= landY(fl)) return { fl, t: P.t[k], apex: Math.max(...P.y) - lipY };
    }
    return { fl: 90 };
  };
  let vmin = 0, vmax = 0, vbest = 0, bestErr = 1e9, best = null;
  const target = JUMP.landLen * JUMP.aim;
  // Suchbereich 8–70 m/s (bis 27.09.2026: 10–40; das Auto fährt jetzt bis ~160 m/s, Fenster liegt bei ~17 m/s)
  for (let v = 8; v <= 70; v += 0.1) {
    const r = landAt(v);
    const ok = !r.fail && r.fl > 1.5 && r.fl < JUMP.landLen + 8;
    if (ok && !vmin) vmin = v;
    if (ok) vmax = v;
    if (ok && Math.abs(r.fl - target) < bestErr) { bestErr = Math.abs(r.fl - target); vbest = v; best = r; }
  }
  const w = { vmin, vmax, vbest, air: best ? best.t : 0, apex: best ? best.apex : 0, fl: best ? best.fl : 0 };
  jwCache.set(key, w);
  return w;
}

// Hilfen
const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const hwRoad = ROAD_HW;

function straightSamples(len, step = 2) {
  const n = Math.max(1, Math.round(len / step));
  return lin(0, len, n).map((f) => ({ f, y: 0, r: 0 }));
}

function arcSamples(radius, m, step = 1) {
  const len = radius * PI / 2;
  const n = Math.max(8, Math.round(len / step));
  return lin(0, PI / 2, n).map((th) => ({ f: radius * Math.sin(th), y: 0, r: m * (radius - radius * Math.cos(th)), th }));
}

// Pfeiler unter einer Hochstraße bei f: vom Boden (lokal -Basis) bis Unterkante Deck (lokal -1)
function pillars(pb, f, r0 = 0) {
  const bottom = -(pb.lvl * LEVEL_H + 0.06), top = -1.0, h = top - bottom;
  if (h < 1.5) return;
  for (const r of [-2.6, 2.6]) pb.box(f, (top + bottom) / 2, r + r0, 1.1, h, 1.1, MAT.CONCRETE, { collide: true });
  pb.box(f, top - 0.45, r0, 1.6, 0.9, 7.6, MAT.CONCRETE, { collide: true });
}

export const PIECES = {
  // ---------------- Grundelemente ----------------
  straight: {
    name: 'Gerade', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0,
    build(pb) {
      pb.path(straightSamples(T), { profile: pb.lvl > 0 ? 'deck' : 'road' });
      if (pb.lvl > 0) pillars(pb, T / 2);
    },
  },
  start: {
    name: 'Start/Ziel', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0,
    build(pb) {
      pb.path(straightSamples(T), { profile: 'road', mark: 'start', markAt: 12 });
      pb.startLine(12);
      pb.gate('start', 12);
    },
  },
  checkpoint: {
    name: 'Checkpoint', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0,
    build(pb) {
      pb.path(straightSamples(T), { profile: pb.lvl > 0 ? 'deck' : 'road', mark: 'cp', markAt: 10 });
      pb.checkpoint(10);
      pb.gate('cp', 10);
      if (pb.lvl > 0) pillars(pb, T / 2);
    },
  },
  turnS: {
    name: 'Kurve eng', cells: [[0, 0]], next: [0, 1], turn: 1, dl: 0,
    build(pb) {
      pb.path(arcSamples(T / 2, pb.m, 0.8), { profile: 'road', kerbIn: true, kerbOut: true, turn: pb.m });
    },
  },
  turnL: {
    name: 'Kurve weit', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], next: [1, 2], turn: 1, dl: 0,
    build(pb) {
      pb.path(arcSamples(1.5 * T, pb.m, 1.2), { profile: 'road', kerbIn: true, kerbOut: true, turn: pb.m });
    },
  },
  bank: {
    name: 'Steilkurve', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], next: [1, 2], turn: 1, dl: 0, stunt: 1,
    build(pb) {
      const maxB = 30 * PI / 180, hw = hwRoad + 0.5;
      const s = arcSamples(1.5 * T, pb.m, 1.0).map((p) => {
        const u = p.th / (PI / 2);
        const b = maxB * smootherstep(u / 0.3) * smootherstep((1 - u) / 0.3);
        // Innenkante bleibt am Boden: Mittellinie um hw*sin(b) angehoben
        return { ...p, y: hw * Math.sin(b), bank: -pb.m * b, hw };
      });
      pb.path(s, { profile: 'banked', turn: pb.m, hw });
    },
  },
  chicane: {
    name: 'Schikane', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0,
    build(pb) {
      const A = 7.5, hw = 3.7;
      const s = lin(0, 2 * T, 50).map((f) => ({ f, y: 0, r: pb.m * A * Math.sin(PI * f / (2 * T)) ** 2, hw }));
      pb.path(s, { profile: 'road', kerbIn: true, kerbOut: true, hw });
    },
  },
  bumps: {
    name: 'Bodenwellen', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      const s = lin(0, T, 60).map((f) => ({ f, y: (f > 2.5 && f < 17.5) ? 0.42 * Math.sin(PI * (f - 2.5) / 5) ** 2 : 0, r: 0 }));
      pb.path(s, { profile: 'road' });
    },
  },
  crest: {
    name: 'Kuppe', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      const H = 3.4;
      const hy = (f) => H * Math.sin(PI * f / (2 * T)) ** 2;
      const s = lin(0, 2 * T, 40).map((f) => ({ f, y: hy(f), r: 0 }));
      pb.path(s, { profile: 'road' });
      pb.mound(0, 2 * T, hy, hwRoad + 1.5, 9);
    },
  },
  // ---------------- Höhe ----------------
  rampUp: {
    name: 'Rampe hoch', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 1,
    build(pb) {
      const s = lin(0, 2 * T, 40).map((f) => ({ f, y: LEVEL_H * smootherstep(f / (2 * T)), r: 0 }));
      pb.path(s, { profile: 'rampwall' });
    },
  },
  rampDown: {
    name: 'Rampe runter', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: -1,
    build(pb) {
      const s = lin(0, 2 * T, 40).map((f) => ({ f, y: -LEVEL_H * smootherstep(f / (2 * T)), r: 0 }));
      pb.path(s, { profile: 'rampwall' });
    },
  },
  bridge: {
    name: 'Brücke', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0, needLevel: 1,
    build(pb) {
      pb.path(straightSamples(T), { profile: 'deck' });
      pb.arch(T);
      pb.river(0, T);
    },
  },
  // ---------------- Stunts ----------------
  jump: {
    name: 'Sprungschanze', cells: [[0, 0], [1, 0], [2, 0]], next: [3, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      const s = [];
      const fix = (f) => (f < 2 ? {} : { lo: -0.15, hi: 0.15 });
      for (const f of lin(0, T, 40)) { const k = kickerY(f); s.push({ f, y: k.y, r: 0, surf: 1, prof: f < JUMP.kickStart ? 'road' : 'ramp', ...fix(f) }); }
      // Flugphase: Linie ohne Fahrbahn (Flugbahn bei vbest nur für Kamera/Anzeige, Physik fliegt frei)
      const lip = kickerY(T);
      const P = flightPath(lip.y, Math.atan(lip.slope), jumpWindow().vbest, { xMax: T + 1, drag: AIR_DRAG });
      for (const f of lin(T, 2 * T, 10).slice(1, -1)) {
        const x = f - T;
        let k = 1; while (k < P.x.length - 1 && P.x[k] < x) k++;
        const u = (x - P.x[k - 1]) / Math.max(1e-6, P.x[k] - P.x[k - 1]);
        s.push({ f, y: Math.max(landY(0), P.y[k - 1] + (P.y[k] - P.y[k - 1]) * u), r: 0, surf: 0, air: 1, lo: 0, hi: 0 });
      }
      for (const f of lin(2 * T, 3 * T, 30)) s.push({ f, y: landY(f - 2 * T), r: 0, surf: 1, prof: f - 2 * T < JUMP.landLen ? 'ramp' : 'road', ...(f - 2 * T < 12 ? { lo: -0.6, hi: 0.6 } : {}) });
      pb.path(s, { profile: 'ramp', kind: 'jump' });
      pb.pit(T - 1, 2 * T + 1, 7.5);
      pb.jumpInfo({ lipF: T, lipY: lip.y, lipDeg: JUMP.lipDeg, landF: 2 * T });
    },
  },
  loop: {
    name: 'Looping', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      // Spur im Looping liegt links (−a) beim Hochfahren und rechts (+a) beim Herunterkommen;
      // Wechsel oben (hoher Anpressdruck). Anfahrt/Ausfahrt: breite Straße, Ideallinie wechselt dort.
      const L = LOOP, f0 = (2 * T - L.dF) / 2, a = L.shift * pb.m, M = 1.3;
      const s = [];
      const road = (f, r) => ({ f, y: 0, r, hw: hwRoad, prof: 'none', lo: -hwRoad + M - r, hi: hwRoad - M - r });
      for (const f of lin(0, f0, 8)) s.push(road(f, -a * smootherstep(f / f0)));
      const step = 4;
      for (let i = step; i <= L.N; i += step) {
        const p = L.pts[i], t = i / L.N;
        const r = -a + 2 * a * smootherstep((t - 0.28) / 0.44);
        s.push({ f: f0 + p.f, y: p.y, r, up: [-Math.sin(p.th), Math.cos(p.th), 0], hw: L.hw, loop: 1, prof: 'loopLane' });
      }
      const f1 = f0 + L.dF;
      for (const f of lin(f1, 2 * T, 8).slice(1)) s.push(road(f, a * (1 - smootherstep((f - f1) / (2 * T - f1)))));
      pb.path(s, { profile: 'loop', kind: 'loop' });
      // Fahrbahn vor/nach dem Looping (volle Breite, Mitte r=0) + Betonplatte darunter
      pb.ribbon(straightSamples(f0, 1.5), { profile: 'road' });
      pb.ribbon(straightSamples(2 * T - f1, 1.5).map((q) => ({ ...q, f: q.f + f1 })), { profile: 'road' });
      pb.pad(f0 - 0.5, f1 + 0.5, -hwRoad - 1.5, hwRoad + 1.5);
      pb.loopSupports(f0);
    },
  },
  tube: {
    name: 'Röhre', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      const s = lin(0, 2 * T, 20).map((f) => ({ f, y: 0, r: 0, tube: f > 3 && f < 2 * T - 3 ? 1 : 0, lo: -1.2, hi: 1.2 }));
      pb.path(s, { profile: 'tube', kind: 'tube' });
      pb.portal(4); pb.portal(2 * T - 4);
    },
  },
};

// Hilfsfunktion für den Generator: Richtung/Felder in Welt-Raster
export function pieceCells(type, i, j, d, m = 1) {
  const P = PIECES[type];
  const F = [[1, 0], [0, 1], [-1, 0], [0, -1]][d];
  const R = [[1, 0], [0, 1], [-1, 0], [0, -1]][(d + 1) % 4];
  const cells = P.cells.map(([a, b]) => [i + F[0] * a + R[0] * b * m, j + F[1] * a + R[1] * b * m]);
  const [na, nb] = P.next;
  const ni = i + F[0] * na + R[0] * nb * m, nj = j + F[1] * na + R[1] * nb * m;
  const nd = (d + (P.turn ? (m > 0 ? 1 : 3) : 0)) % 4;
  return { cells, next: [ni, nj, nd] };
}

export { clamp };
