// Streckenelemente ("Bausteine") auf dem 30×30-Raster.
// Lokale Koordinaten je Element: f = vorwärts ab Einfahrtskante, r = rechts, y = hoch (Meter).
// Jedes Element beschreibt: belegte Felder (a vorwärts, b rechts), Ausfahrt, Höhenwechsel und
// baut Fahrlinie + Geometrie über den Piece-Builder (pb, siehe build.js).
import { TILE, LEVEL_H, ROAD_HW, MAT, WORLD_SCALE, STUNT_SCALE, stuntK, TUBE_OBST } from './defs.js';
import { smoothstep, smootherstep, clamp } from '../core/util.js';
import { AIR, flightPath, pathAt } from '../physics/air.js';
import { CAR_DEF } from '../physics/car.js';

const T = TILE;
const PI = Math.PI;
// Stützpunkt-Anzahl eines Stücks, dessen Länge mit dem Maßstab wächst: gleiche Dichte (m je Punkt) wie beim
// alten 20-m-Feld (n = Anzahl bei Maßstab 1) → Maßstab 1 baut exakt die alten Strecken
const nS = (n) => Math.max(1, Math.round(n * WORLD_SCALE));
// Auto-Maßstab des alten 20-m-Rasters: Punktdichte der Looping-Anfahrt, Anlauf-Länge des Schanzen-Fensters im
// Tempo-Profil (bis n19 auch Bogen/Lücke/Landung der Schanze, seit n21 JUMP unten)
export const JUMP_T = 20;

// ---------- Looping: Klothoiden-Form (Krümmung ~ sin), je Stunt-Maßstab einmal vorberechnet ----------
// Bis n25 fest: Bogenlänge 56 m, Höhe 14,5 m, Spur ±2,25 m, Spurversatz 2,95 m. n26: × Stunt-Maßstab k (1,6 → 90 m
// Bogen, 23 m hoch, Spur 7,2 m breit, Versatz 4,3 m) – die Form bleibt, das Mindesttempo oben wächst mit √k (Radius am
// Scheitel × k).
const loopCache = new Map();
export function loopGeom(k = STUNT_SCALE) {
  if (loopCache.has(k)) return loopCache.get(k);
  const S = 56 * k, N = 1400;
  let tot = 0;
  const w = (t) => Math.sin(PI * t);
  for (let i = 0; i < N; i++) tot += w((i + 0.5) / N);
  const k0 = 2 * PI / (S * tot / N);
  const pts = [];
  let th = 0, f = 0, y = 0;
  for (let i = 0; i <= N; i++) {
    pts.push({ f, y, th });
    if (i === N) break;
    const ds = S / N, kk = k0 * w((i + 0.5) / N);
    f += Math.cos(th + 0.5 * kk * ds) * ds;
    y += Math.sin(th + 0.5 * kk * ds) * ds;
    th += kk * ds;
  }
  const dF = pts[N].f;
  let H = 0;
  for (const p of pts) H = Math.max(H, p.y);
  // Spurversatz = halbe Spurbreite + 0,7 m wie bis n25: die Lücke zwischen Auf- und Abfahrt-Spur am Boden bleibt so schmal
  // wie bisher (mit Versatz × k rollte ein geradeaus fahrendes Auto zwischen den Spuren unter dem Looping durch)
  const g = { S, N, pts, dF, H, shift: 2.25 * k + 0.7, hw: 2.25 * k, k };
  loopCache.set(k, g);
  return g;
}
export const LOOP = loopGeom(STUNT_SCALE);

// ---------- Röhre: Querschnitt (flacher Boden ±b, Viertelkreise Radius R, Wand th), bis n25 2,2 / 3,5 / 0,45 m ----------
// n26: × Stunt-Maßstab (1,6 → Boden 7 m, 11,2 m hoch, 18 m breit); Spielraum der Linie ±lim (bis n25 1,2 m)
export function tubeGeom(k = STUNT_SCALE) {
  return { b: 2.2 * k, R: 3.5 * k, th: 0.45 * stuntK(k, 0.5), lim: 1.2 * k };
}
// ---------- Röhre mit Hindernis: Buckel quer über den Boden (sin²-Profil, Länge len, Höhe h, Mitte bei c) ----------
// .TRK „Röhre mit Hindernis“ (pobst, pieces_trk.js buildPipe): 12 m lang, 0,95 m hoch, mittig im Feld – bleibt so
// (Sammlung/.TRK behalten ihre Zeiten). n29: generierte Röhre (PIECES.tube) mit eigenem Buckel in der Mitte (f = T),
// Form aus derselben Funktion. Höhe/Länge nach Fahrgefühl (tools/roehre_mess.mjs), nicht mit dem Stunt-Maßstab: der
// Hüpfer hängt am Auto (Steigung h·π/len → Abwurf v·Steigung), nicht an der Röhre. Der .TRK-Buckel (Steigung 0,25) warf das
// Auto schon mit 80 km/h 3 m hoch, mit 150 km/h 7,7 m an die Decke (Crash); 0,45 m auf 16 m (Steigung 0,09): 80 / 150 /
// 220 km/h → 0,4 / 1,0 / 1,7 m Luft, Decke ≥ 8 m entfernt (ROEHRE_BERICHT.md)
export const TUBE_HUMP_TRK = { h: 0.95, len: 12 };
export const TUBE_HUMP = { on: TUBE_OBST, h: 0.45, len: 16 };
// Für Tests/Messungen (Node): Buckel an/aus bzw. Form ändern
export function setTubeHump(o) { Object.assign(TUBE_HUMP, o); }
{
  const e = globalThis.process && globalThis.process.env && globalThis.process.env.STUNT_BUCKEL;   // Node: "h,len"
  if (e) { const [h, len] = e.split(',').map(Number); if (h > 0 && len > 0) setTubeHump({ h, len }); }
}
export function humpY(f, c, H = TUBE_HUMP) {
  const b0 = c - H.len / 2;   // (Rechenweg wie bis n28 in buildPipe: .TRK-Röhren bleiben bitgleich)
  return f > b0 && f < b0 + H.len ? H.h * Math.sin(PI * (f - b0) / H.len) ** 2 : 0;
}

// ---------- Sprung: Schanze, Lücke mit Hindernissen, Landerampe (3 Felder) ----------
// n21 (Peter 30.09.2026: „Sprungschanze ist derzeit eher eine orbitale Startrampe“ – „mach die Sprünge länger und stell
// flache Hindernisse oder Wassergräben mit Schiffen rein“): Schanze auf das echte Tempo des Autos ausgelegt – flache
// Lippe (11°), kurzer Anlauf-Bogen am Anfang des Elements, lange Lücke mit Hindernissen (obstacles.js), lange Landerampe
// bis zum Ende des Elements. Das Element bleibt 3 Felder lang (alte Strecken-Codes behalten ihr Layout); Anlauf ist die
// Gerade davor. Bei vbest ~157 km/h: Scheitel ~4 m, Flug ~2,3 s, Weite ~100 m (tools/jump_measure.mjs).
// Bis n19 (27.09.2026, „höher springen“): 28°-Lippe in Auto-Maßstab (20 m Bogen, 20 m Lücke, 20 m Landerampe 3,5 m hoch),
// in der Mitte des Elements, vbest ~61 km/h – mit dem doppelt so schnellen Auto ein Katapult (162 km/h → 24 m hoch).
// Davor (bis 27.09.2026): { kickStart: 4, lipDeg: 15, landH: 2.5, landLen: 18 }, Landung landH·u², Ziel 45 %.
// Lagen im Element: Anlauf-Bogen kickStart … lipF, Luft bis landF, Landerampe landF … landF + landLen (f ab Element-
// Anfang, Element span m lang, mittig im Feld). URL ?schanze=alt = Schanze bis n19 (samt ?lip=…), ohne Hindernisse.
export const JUMP_N21 = { kickStart: 0, lipF: 15, lipDeg: 11, landF: 75, landH: 2.5, landLen: 45, aim: 0.85, landShape: 'smooth', span: 120, obstacles: true };
// Kurzer Anlauf (n21): liegt vor der Schanze keine Gerade (Bodenwellen, Kuppe, Schikane, Röhre …), erreicht das Auto
// auf den 15 m Bogen die ~140 km/h nicht (Prüffahrt hätte die Schanze entschärft). Dann beginnt der Bogen erst nach
// 30 m Anlauf im Element: Lücke 30 m, Fenster ~111–143 km/h, Scheitel ~2,7 m – gleiche Lippe, gleiche Landerampe.
export const JUMP_N21_KURZ = { kickStart: 30, lipF: 45 };
export const JUMP_N19 = { kickStart: 4, lipF: 20, lipDeg: 28, landF: 40, landH: 3.5, landLen: 20, aim: 0.85, landShape: 'smooth', span: 60, obstacles: false };
// n26 (Stunt-Maßstab): Schanze höher, gleiche 3 Felder – steilere Lippe (15° nach 16 m Bogen, 2,1 statt 1,4 m hoch),
// Landerampe 4 statt 2,5 m hoch, ab 78 m (42 m lang). Bei vbest Scheitel ~5,7 m über der Lippe (~7,7 m über Grund statt
// ~5,5), Flug ~2,75 s statt 2,3, ~98 m weit (mehr gibt das Element nicht her), Fenster ~122–144 km/h statt 140–168:
// weniger Anlauf nötig (Mittel n24). Steiler wäre höher, aber mit Übertempo (Mittel bis 264 km/h) wieder eine „orbitale
// Startrampe“ (n21): bei 240 km/h ~21 m statt ~11 m (n24 Sprung-Hilfe zieht zurück, Hinweis im HUD).
// Zwischen k = 1 und 1,6 linear (jumpDef), darüber wie 1,6. Kurzer Anlauf: Bogen ab 30 m wie n21 (JUMP_KURZ).
export const JUMP_N26 = { kickStart: 0, lipF: 16, lipDeg: 15, landF: 78, landH: 4, landLen: 42, aim: 0.85, landShape: 'smooth', span: 120, obstacles: true };
export function jumpDef(k = STUNT_SCALE) {
  const t = Math.max(0, Math.min(1, (k - 1) / 0.6)), mix = (a, b) => a + (b - a) * t;
  if (t <= 0) return { ...JUMP_N21 };
  const J = { ...JUMP_N21 };
  for (const q of ['lipF', 'lipDeg', 'landF', 'landH', 'landLen']) J[q] = mix(JUMP_N21[q], JUMP_N26[q]);
  return J;
}
const JUMP_STD = jumpDef(STUNT_SCALE);
const JUMP_KURZ = STUNT_SCALE > 1 ? { kickStart: JUMP_N21_KURZ.kickStart, lipF: JUMP_N21_KURZ.kickStart + (JUMP_STD.lipF - JUMP_STD.kickStart) } : JUMP_N21_KURZ;
const OLD_LAND = { landH: 2.5, landLen: 18, aim: 0.45, landShape: 'quad' };
export const SCHANZE_ALT = !!(globalThis.location && globalThis.location.search && new URLSearchParams(globalThis.location.search).get('schanze') === 'alt');
export const JUMP = {
  ...(SCHANZE_ALT ? JUMP_N19 : JUMP_STD),
  get lipH() { return kickerY(this.lipF, this).y; }, // Lippenhöhe folgt aus dem Kreisbogen (11° → 1,4 m; bis n19 28° → 3,8 m)
};
// Schanze mit kurzem Anlauf (vor ihr liegt keine Gerade): gleiche Werte, Bogen später (nur n21-Schanze)
// (auch, wenn danach keine Gerade kommt: aus ~160 km/h reicht die Landerampe nicht zum Abbremsen vor Bodenwellen + Looping)
export function jumpFor(prevType, nextType) {
  const plain = (t) => !t || t === 'straight' || t === 'checkpoint' || t === 'start';
  if ((plain(prevType) && plain(nextType)) || JUMP.span !== JUMP_N21.span) return JUMP;
  const J = { ...JUMP, ...JUMP_KURZ };
  Object.defineProperty(J, 'lipH', { get() { return kickerY(this.lipF, this).y; } });
  return J;
}
// Für Tests/Messungen (Node): Schanze umschalten ('alt' = bis n19, sonst n21); Tempo-Fenster rechnen sich neu
export function setSchanze(alt) { Object.assign(JUMP, alt ? JUMP_N19 : JUMP_STD); }
export function setLip(deg) {
  JUMP.lipDeg = Math.max(5, Math.min(35, deg));
  if (deg <= 18 && JUMP.span === JUMP_N19.span) Object.assign(JUMP, OLD_LAND);
}
{
  const q = globalThis.location && globalThis.location.search;
  const v = q ? +new URLSearchParams(q).get('lip') : 0;
  if (v >= 5 && v <= 35) setLip(v);
}
export function kickerY(f, J = JUMP) { // Kreisbogen von Steigung 0 bis lipDeg, endet an der Lippe (f ab Anfang der Schanze)
  const L = J.lipF - J.kickStart, th = J.lipDeg * PI / 180, R = L / th;
  if (f <= J.kickStart) return { y: 0, slope: 0 };
  const a = (f - J.kickStart) / R;
  const s = Math.min(a, th);
  return { y: R * (1 - Math.cos(s)), slope: Math.tan(s) };
}
export function landY(x, J = JUMP) { // x ab Vorderkante der Landung; 'smooth': oben/unten flach, Mitte am steilsten
  const L = J.landLen;
  if (x <= 0) return J.landH;
  if (x >= L) return 0;
  const u = 1 - x / L;
  return J.landH * (J.landShape === 'smooth' ? u * u * (3 - 2 * u) : u * u);
}

// Tempo-Fenster der Standard-Schanze (Lippe bei lipF, Landung ab landF): Flugbahn der Radaufstandspunkte mit derselben
// Luft-Physik wie das Auto (flightPath). vbest landet bei JUMP.aim der Landerampe. Dazu die Decke für Hindernisse in der
// Lücke: tiefste Flugbahn aller Tempi im Fenster je Meter (ceil[x], x ab Lippe).
const AIR_DRAG = CAR_DEF.dragK / CAR_DEF.mass;
const jwCache = new Map();
export function jumpWindow(J0 = JUMP) {
  const JUMP = J0;   // (Name wie bisher; Standard = aktuelle Schanze)
  const key = `${AIR.factor}|${JUMP.lipDeg}|${JUMP.lipF}|${JUMP.kickStart}|${JUMP.landF}|${JUMP.landH}|${JUMP.landLen}|${JUMP.aim}|${JUMP.landShape}`;
  if (jwCache.has(key)) return jwCache.get(key);
  const th = JUMP.lipDeg * PI / 180, lipY = JUMP.lipH, gap = JUMP.landF - JUMP.lipF;
  const landAt = (v) => {
    const P = flightPath(lipY, th, v, { xMax: gap + JUMP.landLen + 60, yMin: -1, drag: AIR_DRAG });
    for (let k = 1; k < P.x.length; k++) {
      const x = P.x[k], y = P.y[k];
      const fl = x - gap;           // Position relativ zur Vorderkante der Landung
      if (fl < 0) { if (y < 0) return { fail: 'kurz' }; continue; }
      if (fl < 0.6 && y < JUMP.landH + 0.55) return { fail: 'Kante' };
      if (y <= landY(fl, JUMP)) return { fl, t: P.t[k], apex: Math.max(...P.y) - lipY, P };
    }
    return { fl: 1e9 };
  };
  let vmin = 0, vmax = 0, vbest = 0, bestErr = 1e9, best = null;
  const target = JUMP.landLen * JUMP.aim;
  const ceil = new Float32Array(Math.ceil(gap) + 1).fill(1e9);
  // Suchbereich 8–90 m/s (bis n19 8–70; davor 10–40)
  for (let v = 8; v <= 90; v += 0.1) {
    const r = landAt(v);
    const ok = !r.fail && r.fl > 1.5 && r.fl < JUMP.landLen + 8;
    if (ok && !vmin) vmin = v;
    if (ok) {
      vmax = v;
      for (let x = 0; x <= gap; x++) ceil[x] = Math.min(ceil[x], pathAt(r.P, x).y);
    }
    if (ok && Math.abs(r.fl - target) < bestErr) { bestErr = Math.abs(r.fl - target); vbest = v; best = r; }
  }
  const w = { vmin, vmax, vbest, air: best ? best.t : 0, apex: best ? best.apex : 0, fl: best ? best.fl : 0, ceil };
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

// Pfeiler unter einer Hochstraße bei f: vom Boden (lokal -Basis) bis Unterkante Deck (lokal -1). Abstand und
// Querbalken folgen der Fahrbahnbreite (bis 27.09.2026 fest ±2,6 m / 7,6 m bei ROAD_HW 4,5)
function pillars(pb, f, r0 = 0) {
  const bottom = -(pb.lvl * pb.LH + 0.06), top = -1.0, h = top - bottom;
  if (h < 1.5) return;
  const w = 2.6 * ROAD_HW / 4.5;
  for (const r of [-w, w]) pb.box(f, (top + bottom) / 2, r + r0, 1.1, h, 1.1, MAT.CONCRETE, { collide: true });
  pb.box(f, top - 0.45, r0, 1.6, 0.9, 2 * ROAD_HW - 1.4, MAT.CONCRETE, { collide: true });
}
// Pfeilerpaare alle ~20 m (im 20-m-Feld eines in der Mitte)
function deckPillars(pb) { const k = Math.max(1, Math.round(T / 20)); for (let q = 0; q < k; q++) pillars(pb, T * (q + 0.5) / k); }

// Erweiterungen der 3D-Teile (pieces_3d.js setzt sie; kein Import von dort – sonst Import-Zyklus): Hochstraßen-
// Kurven und -Geraden mit hoher Brüstung und Pfeilern neben unterquerten Fahrbahnen. Auf Ebene 0 bleibt alles wie bisher.
export const HOOK = {};

export const PIECES = {
  // ---------------- Grundelemente ----------------
  straight: {
    name: 'Gerade', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0,
    build(pb) {
      if (pb.gx && HOOK.gelStraight && HOOK.gelStraight(pb)) return;   // Gelände (n22): Tunnel / Brücke über ein Tal
      if (pb.lvl > 0 && HOOK.deckPiers) { pb.path(straightSamples(T), { profile: 'deck3' }); HOOK.deckPiers(pb); return; }
      pb.path(straightSamples(T), { profile: pb.lvl > 0 ? 'deck' : 'road' });
      if (pb.lvl > 0) deckPillars(pb);
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
      const d3 = (pb.lvl > 0 || !!(pb.gx && pb.gx.bridge)) && HOOK.deckPiers;   // n22: auch auf einer Geländebrücke
      pb.path(straightSamples(T), { profile: d3 ? 'deck3' : pb.lvl > 0 ? 'deck' : 'road', mark: 'cp', markAt: 10 });
      pb.checkpoint(10);
      pb.gate('cp', 10);
      if (d3) HOOK.deckPiers(pb);
      else if (pb.lvl > 0) deckPillars(pb);
    },
  },
  turnS: {
    name: 'Kurve eng', cells: [[0, 0]], next: [0, 1], turn: 1, dl: 0,
    build(pb) {
      if ((pb.lvl > 0 || (pb.gx && pb.gx.bridge)) && HOOK.deckTurn) return HOOK.deckTurn(pb, T / 2);
      pb.path(arcSamples(T / 2, pb.m, 0.8), { profile: 'road', kerbIn: true, kerbOut: true, turn: pb.m });
    },
  },
  turnL: {
    name: 'Kurve weit', cells: [[0, 0], [1, 0], [0, 1], [1, 1]], next: [1, 2], turn: 1, dl: 0,
    build(pb) {
      if ((pb.lvl > 0 || (pb.gx && pb.gx.bridge)) && HOOK.deckTurn) return HOOK.deckTurn(pb, 1.5 * T);
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
        // Innenkante bleibt am Boden: Mittellinie um hw*sin(b) angehoben. Gelände (n22): Drehung um die Mittellinie –
        // die Innenkante taucht in die Mulde, die Mittellinie bleibt im Höhenverlauf (sonst Kuppe am Kurveneingang)
        return { ...p, y: pb.gel ? 0 : hw * Math.sin(b), bank: -pb.m * b, hw };
      });
      // Gelände (n22): Steilkurve in einer Mulde – außen Randstein und Platte, das Gelände steigt dahinter weiter an
      pb.path(s, { profile: pb.gel ? 'bankedG' : 'banked', turn: pb.m, hw });
    },
  },
  chicane: {
    name: 'Schikane', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0,
    build(pb) {
      // Versatz wächst mit dem Feld (Form bleibt), Fahrbahn schmaler als normal im selben Verhältnis
      const A = 7.5 * WORLD_SCALE, hw = 3.7 * ROAD_HW / 4.5;
      const s = lin(0, 2 * T, nS(50)).map((f) => ({ f, y: 0, r: pb.m * A * Math.sin(PI * f / (2 * T)) ** 2, hw }));
      pb.path(s, { profile: 'road', kerbIn: true, kerbOut: true, hw });
    },
  },
  bumps: {
    name: 'Bodenwellen', cells: [[0, 0]], next: [1, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      // drei Wellen à 5 m (Auto-Maßstab) mittig im Feld; bis 27.09.2026 bei f 2,5 … 17,5 im 20-m-Feld
      // n26: kräftiger – Länge und Höhe gedämpft mit dem Stunt-Maßstab (1,6 → ×1,3: drei Wellen à 6,5 m, 0,55 m hoch).
      // Mit ×1,6 (8 m, 0,67 m) überschlug sich der Original-Bot öfter (12 Seeds: 99,3 → 96,6 % geschafft; ×1,3: 97,8 %)
      const k = stuntK(pb.ss, 0.5), wl = 5 * k, wh = 0.42 * k, b0 = T / 2 - 1.5 * wl;
      const s = lin(0, T, nS(60)).map((f) => ({ f, y: (f > b0 && f < b0 + 3 * wl) ? wh * Math.sin(PI * (f - b0) / wl) ** 2 : 0, r: 0 }));
      pb.path(s, { profile: 'road' });
    },
  },
  crest: {
    name: 'Kuppe', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      // gleiche Form im größeren Feld (Kuppen-Tempo wächst wie bei Kurven mit √Maßstab); n26: höher, stark gedämpft mit
      // dem Stunt-Maßstab (1,6 → ×1,18: 6,8 → 8,0 m). Mehr nicht: die Bodenhaftung bei Tempo (n21) hält das Auto mit
      // 180 km/h bis ×1,24 am Boden, ab ×1,3 hebt es ab (test_haftung)
      const H = 3.4 * WORLD_SCALE * stuntK(pb.ss, 0.3);
      const hy = (f) => H * Math.sin(PI * f / (2 * T)) ** 2;
      const s = lin(0, 2 * T, nS(40)).map((f) => ({ f, y: hy(f), r: 0 }));
      pb.path(s, { profile: 'road' });
      pb.mound(0, 2 * T, hy, hwRoad + 1.5, 9);
    },
  },
  // ---------------- Höhe ----------------
  rampUp: {
    name: 'Rampe hoch', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 1,
    build(pb) {
      const s = lin(0, 2 * T, nS(40)).map((f) => ({ f, y: LEVEL_H * smootherstep(f / (2 * T)), r: 0 }));
      pb.path(s, { profile: 'rampwall' });
    },
  },
  rampDown: {
    name: 'Rampe runter', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: -1,
    build(pb) {
      const s = lin(0, 2 * T, nS(40)).map((f) => ({ f, y: -LEVEL_H * smootherstep(f / (2 * T)), r: 0 }));
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
      // Schanze mittig im Element (n21: füllt die 3 Felder; bis n19 60 m in Auto-Maßstab, davor/dahinter gerade Straße)
      const J = jumpFor(pb.prev && pb.prev.type, pb.next && pb.next.type), a0 = Math.max(0, (3 * T - J.span) / 2), land1 = J.landF + J.landLen;
      const s = a0 > 0.5 ? straightSamples(a0).slice(0, -1).map((q) => ({ ...q, surf: 1, prof: 'road' })) : [];
      const fix = (f) => (f < 2 ? {} : { lo: -0.15, hi: 0.15 });
      for (const f of lin(0, J.lipF, J === JUMP ? 40 : 100)) { const k = kickerY(f, J); s.push({ f: a0 + f, y: k.y, r: 0, surf: 1, prof: f < J.kickStart ? 'road' : 'ramp', ...fix(f) }); }
      // Flugphase: Linie ohne Fahrbahn (Flugbahn bei vbest nur für Kamera/Anzeige, Physik fliegt frei)
      const lip = kickerY(J.lipF, J), gap = J.landF - J.lipF, win = jumpWindow(J);
      const P = flightPath(lip.y, Math.atan(lip.slope), win.vbest, { xMax: gap + 1, drag: AIR_DRAG });
      for (const x of lin(0, gap, Math.max(10, Math.round(gap / 2))).slice(1, -1)) {
        s.push({ f: a0 + J.lipF + x, y: Math.max(landY(0, J), pathAt(P, x).y), r: 0, surf: 0, air: 1, lo: 0, hi: 0 });
      }
      for (const x of lin(0, J.landLen, Math.max(30, Math.round(J.landLen / 1.5)))) s.push({ f: a0 + J.landF + x, y: landY(x, J), r: 0, surf: 1, prof: x < J.landLen ? 'ramp' : 'road', ...(x < 12 ? { lo: -0.6, hi: 0.6 } : {}) });
      const f3 = a0 + land1;
      if (3 * T - f3 > 0.5) for (const q of straightSamples(3 * T - f3).slice(1)) s.push({ ...q, f: f3 + q.f, surf: 1, prof: 'road' });
      pb.path(s, { profile: 'ramp', kind: 'jump' });
      // Lücke: Hindernisse je Strecke und Stelle per Zufall (obstacles.js; ohne → Wassergraben wie bis n19)
      const ceil = (f) => win.ceil[Math.max(0, Math.min(win.ceil.length - 1, Math.round(f - a0 - J.lipF)))];
      // Gelände (n22): Schluchtsprung – unter der Lücke eine tiefe Schlucht mit Fluss und Schiffen (gelaende.js)
      const gorge = pb.gel && pb.pc.g === 'gorge';
      if (gorge) pb.gorge(a0 + J.lipF, a0 + J.landF);
      const kind = J.obstacles && HOOK.gapObstacles ? HOOK.gapObstacles(pb, { f0: a0 + J.lipF, f1: a0 + J.landF, ceil, lipY: lip.y, landH: J.landH, ...(gorge ? { kind: 'fluss', floorY: HOOK.gorgeWater } : {}) }) : null;
      if (!kind && !gorge) pb.pit(a0 + J.lipF - 1, a0 + J.landF + 1, ROAD_HW + 3);
      pb.jumpInfo({ lipF: a0 + J.lipF, lipY: lip.y, lipDeg: J.lipDeg, landF: a0 + J.landF, landLen: J.landLen, obstacle: kind, ...(J !== JUMP ? { win, short: true } : {}) });
    },
  },
  loop: {
    name: 'Looping', cells: [[0, 0], [1, 0]], next: [2, 0], turn: 0, dl: 0, stunt: 1,
    build(pb) {
      // Spur im Looping liegt links (−a) beim Hochfahren und rechts (+a) beim Herunterkommen;
      // Wechsel oben (hoher Anpressdruck). Anfahrt/Ausfahrt: breite Straße, Ideallinie wechselt dort.
      // n26: Looping im Stunt-Maßstab (loopGeom), mittig im Stück
      const L = loopGeom(pb.ss), f0 = (2 * T - L.dF) / 2, a = L.shift * pb.m, M = 1.3;
      // Anfahrt/Ausfahrt im größeren Feld länger: gleiche Punktdichte wie im 20-m-Feld (8 Punkte)
      const nA = Math.max(8, Math.round(8 * f0 / ((2 * JUMP_T * L.k - L.dF) / 2)));
      const s = [];
      const road = (f, r) => ({ f, y: 0, r, hw: hwRoad, prof: 'none', lo: -hwRoad + M - r, hi: hwRoad - M - r });
      // n26 (Stunt-Maßstab > 1): Der volle Spurversatz a wird erst dort gebraucht, wo Auf- und Abfahrt-Spur sich in der
      // Draufsicht kreuzen (t ≈ 0,15, ~1,7 m hoch); an der Einfahrt liegt die Abfahrt-Spur noch ~8 m darüber. Der Versatz
      // verteilt sich deshalb über Anfahrt + die ersten tA der Schleife (Spur biegt im Bauwerk sanft weiter nach außen):
      // Schlenker so sanft wie bis n25 (Krümmung 0,020 statt 0,036 1/m) – mit dem Versatz 4,3 m allein auf der 26-m-Anfahrt
      // schoss ein verzögert lenkender Fahrer (Original-Bot) über die Spur hinaus an die Bande (Aufprall an der Einfahrt ×3).
      const tA = L.k > 1 ? 0.13 : 0, D0 = f0 + tA * L.S;
      for (const f of lin(0, f0, nA)) s.push(road(f, -a * smootherstep(f / D0)));
      const step = 4;
      // Banden an der Einfahrt auf den ersten 8 m flach anlaufen lassen (wf: Anteil der Höhe; keine stumpfe Stirnseite)
      const taper = L.k > 1 ? 8 : 0;
      for (let i = step; i <= L.N; i += step) {
        const p = L.pts[i], t = i / L.N;
        let r = -a + 2 * a * smootherstep((t - 0.28) / 0.44);
        if (t < tA) r = -a * smootherstep((f0 + t * L.S) / D0);
        else if (t > 1 - tA) r = a * smootherstep((2 * T - f0 - L.dF + (1 - t) * L.S) / D0);
        const q = { f: f0 + p.f, y: p.y, r, up: [-Math.sin(p.th), Math.cos(p.th), 0], hw: L.hw, loop: 1, prof: 'loopLane' };
        if (taper && t * L.S < taper) q.wf = Math.max(0.08, smoothstep(0, 1, t * L.S / taper));
        s.push(q);
      }
      const f1 = f0 + L.dF;
      for (const f of lin(f1, 2 * T, nA).slice(1)) s.push(road(f, tA ? a * smootherstep((2 * T - f) / D0) : a * (1 - smootherstep((f - f1) / (2 * T - f1)))));
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
      const lim = tubeGeom(pb.ss).lim;   // n26: Spielraum wächst mit dem Querschnitt (bis n25 ±1,2 m)
      const tube = (f) => (f > 3 && f < 2 * T - 3 ? 1 : 0);
      if (!TUBE_HUMP.on) {
        const s = lin(0, 2 * T, nS(20)).map((f) => ({ f, y: 0, r: 0, tube: tube(f), lo: -lim, hi: lim }));
        pb.path(s, { profile: 'tube', kind: 'tube' });
      } else {
        // n29: Buckel mittig (f = T). Außerhalb dieselben Stützpunkte wie die glatte Röhre, auf dem Buckel dichter;
        // die Linie läuft darüber (Profil tubeHump, Fahrbahn folgt der Steigung), der Rohrmantel bleibt waagrecht
        // (tubeShell ohne Boden, genau über dem Buckel – kein doppelter Boden, keine Stufe)
        // Übergang Röhre ↔ Buckel-Lauf 0,8 m vor/hinter dem Buckel, wo die Linie noch eben ist (beide Nachbarn auf dem
        // Boden): dort steht der Querschnitt senkrecht wie der Mantel darüber – am Buckel-Fuß selbst war er um die Steigung
        // zum nächsten Punkt verkantet (feine Naht an der Decke)
        const H = TUBE_HUMP, h0 = T - H.len / 2, h1 = T + H.len / 2, e0 = h0 - 0.8, e1 = h1 + 0.8;
        const fs = lin(0, 2 * T, nS(20)).filter((f) => f < e0 - 0.5 || f > e1 + 0.5).concat(lin(e0, e1, Math.max(26, Math.round((e1 - e0) / 0.4)))).sort((a, b) => a - b);
        const s = fs.map((f) => {
          // wave 4: Tempo-Profil ohne Kuppen-/Lastgrenze (profile.js), auch 3 m davor/dahinter (Krümmungsfenster ±2,5 m)
          const y = humpY(f, T);
          return { f, y, hy: y, r: 0, tube: tube(f), lo: -lim, hi: lim, ...(f >= e0 - 1e-9 && f < e1 - 1e-9 ? { prof: 'tubeHump' } : {}), ...(f > h0 - 3 && f < h1 + 3 ? { wave: 4 } : {}) };
        });
        pb.path(s, { profile: 'tube', kind: 'tube' });
        pb.ribbon(lin(e0, e1, 4).map((f) => ({ f, y: 0, r: 0 })), { profile: 'tubeShell' });
        pb.hump({ f0: h0, f1: h1, c: T, h: H.h, len: H.len, hw: tubeGeom(pb.ss).b });
      }
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
