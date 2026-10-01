// Streckenelemente für 3D-Strecken (n19, 30.09.2026): Spirale, Überführung, Achterbahn-Wellen, Steil-Auf-/Abfahrt,
// Klippensprung, Steilwand (Wallride) und Hochstraßen-Kurven. Gleiche Konventionen wie pieces.js: lokale Koordinaten
// f = vorwärts ab Einfahrtskante, r = rechts, y = hoch relativ zur Einfahrtshöhe; pc.lvl = Ebene an der Einfahrt,
// pc.h1 = Ebene an der Ausfahrt (Ebene = LEVEL_H = 6 m, Durchfahrtshöhe unter einer Hochstraße).
//
// Geometrie, Querschnitte (PROFILES_3D, von build.js eingebunden) und Materialwahl (MAT3) stehen hier beisammen:
// Der Kino-Look (n17) kann die neuen Teile über MAT3 an einer Stelle umfärben, ohne die Formen anzufassen.
import { TILE, ROAD_HW, MAT, WORLD_SCALE } from './defs.js';
import { PIECES, HOOK, JUMP, JUMP_T, kickerY, jumpWindow } from './pieces.js';
import { AIR, flightPath, pathAt } from '../physics/air.js';
import { CAR_DEF } from '../physics/car.js';
import { smootherstep } from '../core/util.js';

const T = TILE, PI = Math.PI, HW = ROAD_HW, WS = WORLD_SCALE;
const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const nS = (n) => Math.max(1, Math.round(n * WS));
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const cs = (t) => 0.5 - 0.5 * Math.cos(PI * clamp01(t));
const AIR_DRAG = CAR_DEF.dragK / CAR_DEF.mass;

// Material je Rolle (Grafik + Physik-Oberfläche). n17: hier umstellen, die Formen bleiben.
export const MAT3 = {
  road: MAT.ROAD,          // Fahrbahn (Hochstraße, Spirale, Rampen, Wellen)
  barrier: MAT.WALL,       // Brüstung/Bande der Hochstraßen
  deck: MAT.CONCRETE,      // Deck-Unterseite und -Seiten
  pier: MAT.CONCRETE,      // Pfeiler, Pfeilerköpfe
  kicker: MAT.METAL,       // Klippen-Schanze und Landehang (wie die Schanze)
  cliff: MAT.CONCRETE,     // Klippenfuß (Unterbau von Schanze und Landehang)
  wallFace: MAT.ROAD,      // Steilwand: befahrene Fläche
  wallBack: MAT.CONCRETE,  // Steilwand: Rückseite/Stützmauer
  apron: MAT.ROAD,         // Steilwand: flacher Auslauf innen (wer zu langsam ist, rutscht hierhin)
  lip: MAT.WALL,           // Steilwand: Oberkante
};
// Brüstung der 3D-Hochstraßen (m): innen / außen in Kurven. Höher als bei der alten Brücke (0,9 m), damit auch
// „Leicht“ auf mehreren Ebenen nicht hinunterfällt (n19 B „höhere Banden“).
export const DECK3 = { lo: 1.15, hi: 1.55, bot: 1.1, pt: 0.4 };

// ---------- Querschnitte (x = rechts, y = Fahrbahn-Normale), werden in build.js PROFILES eingehängt ----------
function mirror(segs) {
  return segs.map((s) => ({ ...s, a: [-s.b[0], s.b[1]], b: [-s.a[0], s.a[1]], na: s.nb && [-s.nb[0], s.nb[1]], nb: s.na && [-s.na[0], s.na[1]] }));
}
export const PROFILES_3D = {
  // Hochstraße mit hoher Brüstung; in Kurven (o.turn) außen höher
  deck3(s, o) {
    const hw = s.hw, { pt, bot } = DECK3, t = o.turn || 0;
    const hr = t < 0 ? DECK3.hi : DECK3.lo, hl = t > 0 ? DECK3.hi : DECK3.lo;
    const b = -bot;
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT3.road, col: 1, road: 1 },
      { a: [hw, 0], b: [hw, hr], mat: MAT3.barrier, col: 1 },
      { a: [hw, hr], b: [hw + pt, hr], mat: MAT3.barrier, col: 1 },
      { a: [hw + pt, hr], b: [hw + pt, b], mat: MAT3.deck, col: 1 },
      { a: [hw + pt, b], b: [-hw - pt, b], mat: MAT3.deck, col: 1 },
      { a: [-hw - pt, b], b: [-hw - pt, hl], mat: MAT3.deck, col: 1 },
      { a: [-hw - pt, hl], b: [-hw, hl], mat: MAT3.barrier, col: 1 },
      { a: [-hw, hl], b: [-hw, 0], mat: MAT3.barrier, col: 1 },
    ];
  },
  // Steilwand (für Rechtskurve gebaut, links gespiegelt): geneigte Fahrbahn, innen ein waagrechter Auslauf auf
  // Bodenhöhe, außen Oberkante + senkrechte Stützmauer bis zum Boden
  wall3(s, o) {
    const hw = s.hw, b = Math.abs(s.bank || 0), wA = 7.5, wh = 0.7, wt = 0.5;
    // Weltlage im Rahmen: Oben = (sinβ, cosβ) mit β = −b (rechte Seite unten)
    const sb = -Math.sin(b), cb = Math.cos(b);
    const apron = [hw + wA * cb, wA * Math.sin(b)];
    const apronLo = [apron[0] + 0.6 * sb, apron[1] - 0.6 * cb];
    const top = [-hw - wt, wh];
    const h = Math.max(0.3, (s.hg || 0) + top[0] * sb + top[1] * cb + 0.2);
    const foot = [top[0] - h * sb, top[1] - h * cb];
    const segs = [
      { a: [-hw, 0], b: [hw, 0], mat: MAT3.wallFace, col: 1, road: 1 },
      { a: [hw, 0], b: apron, mat: MAT3.apron, col: 1, road: 1 },
      { a: apron, b: apronLo, mat: MAT.PAD, col: 0 },
      { a: [-hw, wh], b: [-hw, 0], mat: MAT3.lip, col: 1 },
      { a: top, b: [-hw, wh], mat: MAT3.lip, col: 1 },
      { a: foot, b: top, mat: MAT3.wallBack, col: 1 },
    ];
    return (o.turn || 1) > 0 ? segs : mirror(segs);
  },
};

// ---------- Pfeiler ----------
// Pfeilerpaar quer zur Fahrtrichtung (Kurswinkel phi) unter einer Hochstraße: Oberkante an der Deck-Unterseite (auch
// bei Querneigung beta), Fuß im Gelände. Kein Pfeiler, wo darunter eine andere Fahrbahn liegt – weder eines anderen
// Stücks (pb.below, Kreuzungen) noch dieses Stücks selbst (opt.avoid, Spirale): „Pfeiler stehen nie auf der unteren
// Fahrbahn“.
export function pier(pb, f, r, y, phi = 0, beta = 0, opt = {}) {
  const w = opt.w ?? 2.6 * HW / 4.5, sn = Math.sin(phi), c = Math.cos(phi), bot = DECK3.bot;
  let placed = 0;
  for (const s of [-w, w]) {
    const pf = f - sn * s, pr = r + c * s;
    const top = y + s * Math.sin(beta) - bot * Math.cos(beta);
    const g = pb.ground(pf, pr) - pb.base;
    const h = top - g;
    if (h < 1.5) continue;
    if (pb.below && pb.below(pf, pr, top)) continue;
    if (opt.avoid && opt.avoid(pf, pr, top)) continue;
    pb.box(pf, (top + g) / 2, pr, 1.2, h, 1.2, MAT3.pier, { collide: true, rotY: phi });
    placed++;
  }
  if (placed === 2 && Math.abs(beta) < 0.05) pb.box(f, y - bot - 0.45, r, 1.6, 0.9, 2 * w + 2.4, MAT3.pier, { collide: true, rotY: phi });
  return placed;
}
// Pfeiler entlang einer Fahrlinie (Samples mit f, y, r, bank, hw) etwa alle step m (Draufsicht), wo das Deck hoch genug
// liegt; eigene tiefere Fahrbahn (Spirale) wird ausgespart
export function supportAlong(pb, S, opt = {}) {
  const step = opt.step ?? 13;
  let acc = 0, next = opt.first ?? step / 2;
  const avoid = (pf, pr, top) => {
    for (const q of S) if (q.y < top - 2.2 && Math.hypot(q.f - pf, q.r - pr) < (q.hw ?? HW) + 1.8) return true;
    return false;
  };
  for (let i = 1; i < S.length; i++) {
    const a = S[i - 1], b = S[i];
    acc += Math.hypot(b.f - a.f, b.r - a.r);
    if (acc < next) continue;
    if (opt.skip && opt.skip(b)) continue;
    next = acc + step;
    pier(pb, b.f, b.r, b.y, Math.atan2(b.r - a.r, b.f - a.f), b.bank || 0, { avoid });
  }
}

const dlOf = (pc) => ((pc.h1 ?? pc.lvl ?? 0) - (pc.lvl || 0));

// ---------- Hochstraßen-Kurven (turnS/turnL auf lvl > 0, siehe pieces.js) ----------
export function buildDeckTurn(pb, radius) {
  const m = pb.m, len = radius * PI / 2, n = Math.max(10, Math.round(len / 1.2));
  const S = lin(0, PI / 2, n).map((th) => ({ f: radius * Math.sin(th), y: 0, r: m * (radius - radius * Math.cos(th)) }));
  pb.path(S, { profile: 'deck3', turn: m });
  supportAlong(pb, S, { step: Math.min(16, len / 2) });
}
// Gerade Hochstraße (straight/checkpoint auf lvl > 0): hohe Brüstung, Pfeiler neben einer unterquerten Fahrbahn
export function deckPiers(pb) {
  const k = Math.max(1, Math.round(T / 20));
  for (let q = 0; q < k; q++) pier(pb, T * (q + 0.5) / k, 0, 0, 0, 0);
}

// ---------- 1) Spirale ----------
// Gerade (1 Feld) → voller Kreis (Radius ½ Feld, überhöht bis SPIRAL.bank) mit Anstieg/Abstieg um 1–2 Ebenen →
// Gerade (1 Feld) auf der neuen Ebene. Belegt 2×2 Felder wie die Wendel des Klassikers (tr_corkud), die Ausfahrt
// liegt über (bzw. unter) der Einfahrt – Abstand dort eine volle Ebene (Höhe per Kosinus-Übergang: an den Enden fast
// waagrecht). Querneigung erst nach dem Überlappungsbereich, damit die untere Fahrbahn dort frei bleibt.
export const SPIRAL = { bank: 17 * PI / 180, hw: HW - 0.2 };
function buildSpiral(pb) {
  const m = pb.m, R = T / 2, H = dlOf(pb.pc) * pb.LH, hw = SPIRAL.hw;
  const S = [];
  for (const f of lin(0, T, nS(10))) S.push({ f, y: 0, r: 0, hw });
  const N = nS(84);
  for (let k = 1; k <= N; k++) {
    const u = k / N, psi = 2 * PI * u;
    const b = SPIRAL.bank * smootherstep((u - 0.1) / 0.2) * smootherstep((0.9 - u) / 0.2);
    S.push({ f: T + R * Math.sin(psi), y: H * cs(u), r: m * (R - R * Math.cos(psi)), bank: -m * b, hw, spiral: 1 });
  }
  for (const f of lin(T, 2 * T, nS(10)).slice(1)) S.push({ f, y: H, r: 0, hw });
  pb.path(S, { profile: 'deck3', turn: m, hw, kind: 'spiral' });
  supportAlong(pb, S, { step: 12 });
}

// ---------- 2) Steil-Auffahrt / -Abfahrt ----------
// Über 2–4 Felder 1–3 Ebenen hinauf oder hinunter (smootherstep: oben und unten waagrecht), Hochstraßen-Querschnitt
// mit Pfeilern. Bergab ein Sprint mit Tempo-Gewinn; die Kuppe oben begrenzt das Tempo über den Mindest-Anpressdruck.
function buildSlope(pb, cells) {
  const L = cells * T, H = dlOf(pb.pc) * pb.LH;
  const S = lin(0, L, Math.round(L / 2)).map((f) => ({ f, y: H * smootherstep(f / L), r: 0 }));
  pb.path(S, { profile: 'deck3', kind: 'slope' });
  supportAlong(pb, S, { step: 13 });
}

// ---------- 3) Achterbahn-Wellen ----------
// WAVE.n Kuppen (Sinus²) hintereinander, Wellenlänge WAVE.len m, Höhe WAVE.h m, davor/dahinter flach. Das Tempo-
// Profil lässt an den Kuppen einen leicht negativen Anpressdruck zu (WAVE.nmin) → kurze Luftphase über jeder Kuppe.
export const WAVE = { n: 4, len: 26, h: 1.9, nmin: -0.35, cells: 3 };
function buildWaves(pb) {
  const L = WAVE.cells * T, span = WAVE.n * WAVE.len, f0 = (L - span) / 2;
  const hy = (f) => (f > f0 && f < f0 + span ? WAVE.h * Math.sin(PI * (f - f0) / WAVE.len) ** 2 : 0);
  const S = lin(0, L, Math.round(L / 0.8)).map((f) => ({ f, y: hy(f), r: 0, wave: f > f0 - 4 && f < f0 + span + 4 ? 1 : 0 }));
  pb.path(S, { profile: 'road', kerbIn: true, kind: 'waves' });
  pb.mound(0, L, hy, HW + 1.5, 6);
}

// ---------- 4) Klippensprung ----------
// Schanze wie die Standard-Schanze (gleiche Lippe JUMP.lipDeg, gleiche Luft-Physik AIR/flightPath – eine Konstante für
// beide) auf Ebene n, Landung eine oder zwei Ebenen tiefer. Der Landehang beginnt wie die Landerampe der Schanze
// (Kuppe CLIFF.yk m über der Absprung-Ebene, CLIFF.xk m hinter der Lippe), fällt dann mit CLIFF.alpha ab (Kuppe mit
// Radius Rk) und geht mit einem Bogen (Radius Ra) in den flachen Auslauf auf −D über. Parameter per Suche über
// Kuppe/Neigung/Radien auf das breiteste Tempo-Fenster gewählt (Aufprall senkrecht zur Fläche ≤ vnMax m/s; das Auto
// verträgt ~13 m/s): D = 6 m → 13,4 … 18,9 m/s, D = 12 m ebenso (Standard-Schanze 14,2 … 19,5). Steiler (wie eine
// Skisprung-Anlage) wäre sanfter, fängt aber nur ein ~3 m/s schmales Fenster – der Hang muss bis −D reichen.
// Unterbau massiv bis zum Boden (Klippe), unter der Lücke Wasser, wenn unten Boden ist.
// n21: mit der neuen, flachen Lippe (11°, pieces.js JUMP) neu gesucht (tests/out/n21/cliff.mjs, gleiche Feldzahl 3/4 wie
// bis n19, damit 3D-Codes ihr Layout behalten): Kuppe tiefer und näher, Hang flacher → D = 6 m 53–97 km/h, D = 12 m
// 53–111 km/h. Bis n19 (28°-Lippe): { xk: 18, yk: 3.0, alpha: 17° } → 48–64 bzw. 48–65 km/h.
export const CLIFF = { xk: 10, yk: 0.5, alpha: 8 * PI / 180, Rk: 40, Ra: 25, vnMax: 8.5, runout: 26, a0: 8 };
const CLIFF_N19 = { xk: 18, yk: 3.0, alpha: 17 * PI / 180, Rk: 20, Ra: 25 };
if (JUMP.span === 60) Object.assign(CLIFF, CLIFF_N19);   // ?schanze=alt: Klippe wie bis n19
const cliffCache = new Map();
function cliffHill(D) {
  const { xk, yk, alpha, Rk, Ra } = CLIFF, sa = Math.sin(alpha), ca = Math.cos(alpha), ta = Math.tan(alpha);
  const x1 = xk + Rk * sa, y1 = yk - Rk * (1 - ca);
  const y2 = -D + Ra * (1 - ca), x2 = x1 + (y1 - y2) / ta, x3 = x2 + Ra * sa;
  const f = (x) => {
    if (x <= xk) return yk;
    if (x <= x1) { const dx = x - xk; return yk - (Rk - Math.sqrt(Rk * Rk - dx * dx)); }
    if (x <= x2) return y1 - (x - x1) * ta;
    if (x <= x3) { const dx = x3 - x; return -D + (Ra - Math.sqrt(Math.max(0, Ra * Ra - dx * dx))); }
    return -D;
  };
  return { f, xe: x3 };
}
export function cliffDesign(D) {
  const key = `${D}|${AIR.factor}|${JUMP.lipDeg}`;
  if (cliffCache.has(key)) return cliffCache.get(key);
  const th = JUMP.lipDeg * PI / 180, lipY = JUMP.lipH, { xk } = CLIFF;
  const H = cliffHill(D), hill = H.f, xe = H.xe;
  // Tempo-Fenster wie jumpWindow: Flugbahn der Radaufstandspunkte, Landung auf dem Hang; gültig, wenn weder vor dem Hang
  // noch an der Kante und der Aufprall senkrecht zur Fläche höchstens vnMax m/s
  const landAt = (v) => {
    const Q = flightPath(lipY, th, v, { xMax: xe + 80, yMin: -D - 6, drag: AIR_DRAG });
    for (let k = 1; k < Q.x.length; k++) {
      const x = Q.x[k], y = Q.y[k];
      if (x < xk) { if (y < -D + 0.3) return { fail: 'kurz' }; continue; }
      if (x - xk < 0.8 && y < hill(xk) + 0.55) return { fail: 'Kante' };
      if (y <= hill(x)) {
        const s = hill(x + 0.5) - hill(x - 0.5);
        return { x, t: Q.t[k], vn: (Q.vy[k] - s * Q.vx[k]) / Math.sqrt(1 + s * s) };
      }
    }
    return { fail: 'weit' };
  };
  let best = null, cur = null, bv = 0, bvn = 1e9;
  for (let v = 8; v <= 40; v += 0.1) {
    const r = landAt(v);
    const ok = !r.fail && r.vn > -CLIFF.vnMax && r.x < xe + CLIFF.runout - 6;
    if (ok) { if (!cur) cur = { a: v, b: v }; else cur.b = v; if (!best || cur.b - cur.a > best.b - best.a) best = { ...cur }; } else cur = null;
    if (ok && Math.abs(r.vn) < bvn) { bvn = Math.abs(r.vn); bv = v; }
  }
  const vmin = best ? best.a : 0, vmax = best ? best.b : 0;
  const vbest = best ? Math.min(vmax, Math.max(vmin, bv)) : 0;
  const len = JUMP.lipF + xe + CLIFF.runout;         // Schanze + Flug/Hang + Auslauf (ohne Anfahrt; bis n19 Schanze JUMP_T)
  const cells = Math.ceil((len + CLIFF.a0) / T);
  const d = { D, xk, xe, hill, lipY, cells, win: { vmin, vmax, vbest, air: best ? landAt(vbest).t : 0 }, len };
  cliffCache.set(key, d);
  return d;
}
function buildCliff(pb) {
  const pc = pb.pc, D = -dlOf(pc) * pb.LH, C = cliffDesign(D);
  const L = PIECES[pc.type].cells.length * T, J = JUMP.lipF;   // Anlauf-Bogen der Standard-Schanze (bis n19 JUMP_T = 20 m)
  const a0 = Math.max(2, (L - C.len) / 2);         // Anfahrt auf der oberen Ebene (Rest hinten: längerer Auslauf)
  const s = [];
  // Gelände-Strecken (n22): Plateau-Abfahrt – oben und unten liegt Gelände, keine Hochstraße, Landehang als Straße
  const up = (y) => !pb.gel && y + pb.lvl * pb.LH > 1.2;
  for (const f of lin(0, a0, Math.max(2, Math.round(a0 / 2))).slice(0, -1)) s.push({ f, y: 0, r: 0, surf: 1, prof: up(0) ? 'deck3' : 'road' });
  for (const f of lin(0, J, 40)) { const k = kickerY(f); s.push({ f: a0 + f, y: k.y, r: 0, surf: 1, prof: 'ramp', ...(f < 2 ? {} : { lo: -0.15, hi: 0.15 }) }); }
  const lip = kickerY(J), fl = a0 + J;
  const P = flightPath(lip.y, Math.atan(lip.slope), C.win.vbest || jumpWindow().vbest, { xMax: C.xk + 1, drag: AIR_DRAG });
  for (const x of lin(0, C.xk, Math.max(8, Math.round(C.xk / 3))).slice(1, -1)) {
    s.push({ f: fl + x, y: Math.max(C.hill(C.xk), pathAt(P, x).y), r: 0, surf: 0, air: 1, lo: 0, hi: 0 });
  }
  for (const x of lin(C.xk, C.xe, Math.max(12, Math.round((C.xe - C.xk) / 1.2)))) {
    s.push({ f: fl + x, y: C.hill(x), r: 0, surf: 1, prof: pb.gel ? 'road' : 'ramp', ...(x - C.xk < C.xe - C.xk - 4 ? { lo: -0.6, hi: 0.6 } : {}) });
  }
  const f3 = fl + C.xe, low = !pb.gel && (pb.lvl - D / pb.LH) * pb.LH > 1.2;
  for (const f of lin(f3, L, Math.max(4, Math.round((L - f3) / 2))).slice(1)) s.push({ f, y: -D, r: 0, surf: 1, prof: low ? 'deck3' : 'road' });
  pb.path(s, { profile: 'ramp', kind: 'cliff' });
  if (up(0)) supportAlong(pb, s.filter((q) => q.f < a0 + 1), { step: 12 });
  if (low) supportAlong(pb, s.filter((q) => q.f > f3 - 1), { step: 13, first: 4 });
  // Wasser in der Lücke, wenn unten Boden ist (wie bei der Schanze); sonst stürzt man ins Gelände (Reset)
  if (pb.lvl * pb.LH - D < 0.5 && !pb.gel) pb.pit(fl - 1, fl + C.xk + 1, HW + 3);
  pb.jumpInfo({ lipF: fl, lipY: lip.y, lipDeg: JUMP.lipDeg, landF: fl + C.xk, win: C.win, cliff: D });
}

// ---------- 5) Steilwand (Wallride) ----------
// 90°-Kurve (2×2 Felder, Radius 1,5 Felder) mit Querneigung bis WALL.bank: am Ein- und Ausgang verwunden, in der Mitte
// eine Wand. Innen liegt ein waagrechter Auslauf auf Bodenhöhe – wer zu langsam ist, rutscht dorthin (sicher, keine
// Kante). Mindesttempo (nicht abrutschen) aus Haftung und Neigung liefert das Tempo-Profil (vmin).
export const WALL = { bank: 68 * PI / 180, twist: 0.4, hw: HW + 0.4, nmin: 0.15 };
function buildWall(pb) {
  const m = pb.m, radius = 1.5 * T, hw = WALL.hw, n = Math.round(radius * PI / 2 / 0.9);
  const S = lin(0, PI / 2, n).map((th) => {
    const u = th / (PI / 2);
    const b = WALL.bank * smootherstep(u / WALL.twist) * smootherstep((1 - u) / WALL.twist);
    return { f: radius * Math.sin(th), y: hw * Math.sin(b), r: m * (radius - radius * Math.cos(th)), bank: -m * b, hw, wave: 2 };
  });
  pb.path(S, { profile: 'wall3', turn: m, hw, kind: 'wall' });
}

// ---------- Registrieren ----------
const C4 = [[0, 0], [1, 0], [0, 1], [1, 1]];
const straightCells = (k) => Array.from({ length: k }, (_, a) => [a, 0]);
const P3 = {
  spiral: { name: 'Spirale', cells: C4, next: [2, 0], turn: 0, stunt: 1, d3: 1, build: buildSpiral },
  slope2: { name: 'Rampe', cells: straightCells(2), next: [2, 0], turn: 0, d3: 1, build: (pb) => buildSlope(pb, 2) },
  slope3: { name: 'Steilrampe', cells: straightCells(3), next: [3, 0], turn: 0, stunt: 1, d3: 1, build: (pb) => buildSlope(pb, 3) },
  slope4: { name: 'Steilrampe lang', cells: straightCells(4), next: [4, 0], turn: 0, stunt: 1, d3: 1, build: (pb) => buildSlope(pb, 4) },
  waves: { name: 'Achterbahn-Wellen', cells: straightCells(WAVE.cells), next: [WAVE.cells, 0], turn: 0, stunt: 1, d3: 1, build: buildWaves },
  cliff: { name: 'Klippensprung', cells: straightCells(3), next: [3, 0], turn: 0, stunt: 1, d3: 1, build: buildCliff },
  cliff2: { name: 'Klippensprung (2 Ebenen)', cells: straightCells(3), next: [3, 0], turn: 0, stunt: 1, d3: 1, build: buildCliff },
  wall: { name: 'Steilwand', cells: C4, next: [1, 2], turn: 1, stunt: 1, d3: 1, build: buildWall },
};
// Klippensprung: Länge aus der Flugbahn (Landehang + Auslauf); passt er nicht in 3 Felder, nimmt er 4
for (const [k, D] of [['cliff', 6], ['cliff2', 12]]) {
  const c = cliffDesign(D).cells;
  if (c > 3) { P3[k].cells = straightCells(c); P3[k].next = [c, 0]; }
}
for (const [k, v] of Object.entries(P3)) PIECES[k] = v;
HOOK.deckTurn = buildDeckTurn;
HOOK.deckPiers = deckPiers;

// Anzeige-Name eines Stücks mit Richtung (Rampe hinauf/hinunter)
export function name3(pc) {
  const P = PIECES[pc.type], dl = dlOf(pc);
  if (/^slope/.test(pc.type)) return (Math.abs(dl) >= 2 ? 'Steil' : '') + (dl > 0 ? 'auffahrt' : 'abfahrt').replace(/^./, (c) => (Math.abs(dl) >= 2 ? c : c.toUpperCase()));
  if (pc.type === 'spiral') return 'Spirale ' + (dl > 0 ? 'hinauf' : 'hinunter');
  return P ? P.name : pc.type;
}
