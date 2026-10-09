// Original-Stunt-Hindernisse (n33, Peter 08.10.2026: „Mehr Original-Stunts-Hindernisse: Zickzack-Barriere, Spirale, Röhre mit
// Wand in der Mitte, um eine Überkopf-Spirale zu erzwingen“). Gleiche Konventionen wie pieces.js: lokale Koordinaten
// f = vorwärts ab Einfahrtskante, r = rechts, y = hoch. Nur Generator-Version 2 (defs.js HINDERNIS2/GEN_V) setzt die
// Teile – alte Strecken-Codes, Sammlung und .TRK bleiben bitgleich (die .TRK-Slalom-Deko in pieces_trk.js unverändert).
//
// 1) zigzag / zigzag2 – Zickzack-Barriere: Betonblöcke abwechselnd von rechts und links in die Fahrbahn (über die Mitte
//    hinaus), gelb-schwarz markiert. Die Blöcke kollidieren (Aufprall → Crash/Zurückspulen wie an den Sprung-Hindernissen
//    n21). Die Fahrlinie bleibt gerade; die befahrbare Breite (lo/hi) ist an jedem Block auf die freie Seite verengt – die
//    Ideallinie (Minimal-Krümmung, ai/ideal.js) fährt daraus von selbst den Slalom, das Tempo-Profil nimmt das Tempo-Fenster
//    aus der Krümmung dieser Linie (ai/profile.js), Autopilot und Leicht fahren sie nach.
// 2) tube_wall – Röhre mit Mittelwand: in der Röhrenmitte sperrt eine Wand die untere Hälfte des Querschnitts. Die Linie
//    führt als 360°-Rolle die Rohrwand hinauf, kopfüber über die Decke (über die Wand hinweg) und auf der anderen Seite
//    wieder hinunter – wie die Korkenzieher-Rolle (pieces_trk.js buildCorkLR), nur dass die Röhre selbst die Fahrbahn ist.
//    Damit die Decke trägt, wird der Querschnitt hinter dem Portal kreisrund (flacher Boden ±b → 0; eine flache Decke hätte
//    keinen Anpressdruck): Radius R = halbe Röhrenhöhe. Mindesttempo oben (Anpressdruck ≥ PROF.nmin) und Höchsttempo
//    (Rollrate PROF.rollMax) rechnet das Tempo-Profil aus der Linie (wie im Korkenzieher). Zu langsam → fällt von der Decke →
//    Crash → Zurückspulen.
import { TILE, ROAD_HW, MAT } from './defs.js';
import { PIECES, tubeGeom } from './pieces.js';
import { smootherstep } from '../core/util.js';

const T = TILE, PI = Math.PI, HW = ROAD_HW;
const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

// ---------- 1) Zickzack-Barriere ----------
// n Blöcke im Abstand sp (m), mittig im Stück; Block lb m lang (längs), ragt d m vom Fahrbahnrand in die Fahrbahn (14,6 m
// breit → über die Mitte hinaus), h m hoch. gap: Abstand Linie ↔ Blockfläche (wie die 1,3 m zur Fahrbahnkante), ahead:
// so weit vor/hinter dem Block gilt die Verengung (halbe Wagenlänge + Reserve). Gewählt mit tools/hindernis_mess.mjs fest
// (Plan-Tempo im Slalom, festes Tempo bis zur ersten Berührung, Abstand Karosserie ↔ Block mit dem Autopiloten):
//   5 × 22 m, 8,6 m tief: Plan 55 km/h, ab 80 km/h Aufprall, Autopilot 0,33 m Abstand (zu eng, zu langsam)
//   5 × 24 m, 8,0 m tief: Plan 70 km/h, ab 100 km/h Aufprall, Autopilot 0,42 m
//   5 × 26 m, 8,0 m tief: Plan 75 km/h, bis 100 km/h ohne Berührung, Autopilot 0,49 m  ← gewählt
//   4 × 30 m, 8,0 m tief: Plan 85 km/h (nur 4 Blöcke)
// Optik (Blockhöhe, Kappe, Streifen) am Bild offen (VORBAU-Übergabe).
export const ZIGZAG = { n: 5, cells: 3, sp: 26, lb: 3.2, d: 8.0, h: 1.3, gap: 1.3, ahead: 2.6 };
// Kurze, sanftere Variante (Stufe Sanft, 2 Felder): 3 Blöcke, reichen genau bis zur Mitte – Plan 90 km/h, bis 120 km/h
// ohne Berührung
export const ZIGZAG2 = { n: 3, cells: 2, sp: 24, lb: 3.2, d: 7.3, h: 1.3, gap: 1.3, ahead: 2.6 };
const zDef = (type) => (type === 'zigzag2' ? ZIGZAG2 : ZIGZAG);
// Für Messungen (Node): Form ändern, STUNT_ZICKZACK_FORM="n,sp,lb,d,gap" bzw. STUNT_ZICKZACK2_FORM
export function setZigzag(o, kurz = false) { Object.assign(kurz ? ZIGZAG2 : ZIGZAG, o); }
for (const [e, kurz] of [['STUNT_ZICKZACK_FORM', false], ['STUNT_ZICKZACK2_FORM', true]]) {
  const v = globalThis.process && globalThis.process.env && globalThis.process.env[e];
  if (v) { const [n, sp, lb, d, gap] = v.split(',').map(Number); setZigzag({ n, sp, lb, d, gap }, kurz); }
}
// Lage der Blöcke: [{ f, side }] (side +1 = von rechts); pc.m wählt die Seite des ersten Blocks
export function zigzagBlocks(type, m = 1) {
  const Z = zDef(type), L = Z.cells * T, f0 = (L - (Z.n - 1) * Z.sp) / 2;
  return Array.from({ length: Z.n }, (_, k) => ({ f: f0 + k * Z.sp, side: (k % 2 ? -1 : 1) * (m < 0 ? -1 : 1) }));
}
// Befahrbare Breite der Linie an Stelle f: { lo, hi } (Wagenmitte, relativ zur Fahrbahnmitte); M wie build.js
export function zigzagBounds(type, f, m = 1, M = 1.3) {
  const Z = zDef(type);
  let lo = -HW + M, hi = HW - M;
  for (const b of zigzagBlocks(type, m)) {
    if (Math.abs(f - b.f) > Z.lb / 2 + Z.ahead) continue;
    const face = HW - Z.d;   // Blockfläche, vom eigenen Rand aus gemessen
    if (b.side > 0) hi = Math.min(hi, face - Z.gap); else lo = Math.max(lo, -face + Z.gap);
  }
  return { lo, hi };
}
function buildZigzag(pb) {
  const type = pb.pc.type, Z = zDef(type), L = Z.cells * T;
  const S = lin(0, L, Math.round(L)).map((f) => ({ f, y: 0, r: 0, ...zigzagBounds(type, f, pb.m) }));
  pb.path(S, { profile: 'road', kind: 'zigzag' });
  for (const b of zigzagBlocks(type, pb.m)) {
    // Block: vom Fahrbahnrand (+0,6 m über die Kante, deckt die Bankett-Fuge) bis d in die Fahrbahn
    const r0 = b.side * (HW + 0.6), r1 = b.side * (HW - Z.d), rc = (r0 + r1) / 2, lr = Math.abs(r1 - r0);
    pb.box(b.f, Z.h / 2, rc, Z.lb, Z.h, lr, MAT.WALL, { collide: true });
    // Kappe (dunkler Beton) – Blockform wie Leitwand-Elemente
    pb.box(b.f, Z.h + 0.06, rc, Z.lb + 0.12, 0.12, lr + 0.12, MAT.CONCRETE, {});
    // gelb-schwarze Warnflächen: Stirnseite zur Anfahrt (−f) und Innenseite zur freien Gasse
    const f0 = b.f - Z.lb / 2, rIn = r1, hh = Z.h - 0.05;
    pb.markPoly([[f0, 0.05, r0], [f0, 0.05, r1], [f0, hh, r1], [f0, hh, r0]], [-1, 0, 0], [0, 0, 1], [0, 1, 0]);
    pb.markPoly([[f0, 0.05, rIn], [f0 + Z.lb, 0.05, rIn], [f0 + Z.lb, hh, rIn], [f0, hh, rIn]], [0, 0, -b.side], [1, 0, 0], [0, 1, 0]);
  }
  pb.obstacleInfo({ kind: 'zigzag', blocks: zigzagBlocks(type, pb.m).map((b) => ({ ...b, lb: Z.lb, d: Z.d, h: Z.h })) });
}

// ---------- 2) Röhre mit Mittelwand ----------
// len: Länge der Rolle (m, mittig im Stück), morph: Übergang Röhren-Querschnitt (Portal) → Kreis davor/dahinter, top: Oberkante
// der Wand als Anteil des Radius (1 = halbe Röhrenhöhe), th: Wanddicke. Länge 56 m: Fenster ~60–100 km/h (Korkenzieher
// 50–76 km/h), tools/hindernis_mess.mjs.
// ease: Anteil am Anfang/Ende der Rolle, auf dem die Drehrate weich anläuft (sonst knickte die Linie am Rolleneingang
// schlagartig um ~32° zur Seite: Profil 67 km/h am Eingang); die Drehrate in der Mitte steigt dafür um 1/(1 − ease)
export const TUBE_WALL = { len: 56, morph: 8, top: 1.0, th: 0.8, hw: 3.5, ease: 0.2 };
export function tubeWallGeom(ss) {
  const TG = tubeGeom(ss), fr0 = T - TUBE_WALL.len / 2, fr1 = T + TUBE_WALL.len / 2;
  return { ...TG, fr0, fr1, Rr: TG.R, wallTop: TUBE_WALL.top * TG.R, fp0: 4, fp1: 2 * T - 4 };
}
// Halbe Bodenbreite der Röhre an Stelle f (Portal: b, in der Rolle 0 = Kreis); nie ganz 0 (kein entartetes Fahrbahn-Segment)
export function tubeWallFloor(G, f) {
  const k = Math.max(smootherstep((G.fr0 - f) / TUBE_WALL.morph), smootherstep((f - G.fr1) / TUBE_WALL.morph));
  return Math.max(0.02, G.b * k);
}
// Phase der Rolle (0 … 1) über dem Weg u (0 … 1): Drehrate ∝ smootherstep-Rampe an beiden Enden (Anteil ease), dazwischen
// gleichmäßig. Tabelle je ease einmal numerisch integriert
const phCache = new Map();
export function tubeWallPhase(u, e = TUBE_WALL.ease) {
  if (!(e > 0)) return u;
  let tab = phCache.get(e);
  if (!tab) {
    const N = 2000, w = (x) => smootherstep(x / e) * smootherstep((1 - x) / e);
    tab = new Float64Array(N + 1);
    for (let k = 1; k <= N; k++) tab[k] = tab[k - 1] + w((k - 0.5) / N);
    for (let k = 0; k <= N; k++) tab[k] /= tab[N];
    phCache.set(e, tab);
  }
  const x = Math.max(0, Math.min(1, u)) * (tab.length - 1), k = Math.min(tab.length - 2, Math.floor(x));
  return tab[k] + (tab[k + 1] - tab[k]) * (x - k);
}
// Punkt der Rolle bei Phase ph (0 … 2π): Lage auf dem Kreis (r, y) und Fahrbahn-Normale (zur Röhrenachse)
export function tubeWallRoll(G, ph) {
  return { r: G.Rr * Math.sin(ph), y: G.Rr * (1 - Math.cos(ph)), up: [0, Math.cos(ph), -Math.sin(ph)] };
}
function buildTubeWall(pb) {
  const G = tubeWallGeom(pb.ss), L = 2 * T, inTube = (f) => (f > 3 && f < L - 3 ? 1 : 0);
  const S = [];
  // Einfahrt: gerade auf dem Boden (Spielraum schrumpft mit dem Boden)
  for (const f of lin(0, G.fr0, Math.max(6, Math.round(G.fr0 / 1.5)))) {
    const w = Math.max(0.3, G.lim * tubeWallFloor(G, f) / G.b);
    S.push({ f, y: 0, r: 0, tube: inTube(f), lo: -w, hi: w, prof: 'none' });
  }
  // Rolle: rechts die Wand hinauf, oben kopfüber über die Mittelwand, links hinunter (pc.m < 0: gespiegelt)
  const N = Math.max(100, Math.round(TUBE_WALL.len / 0.4)), m = pb.m < 0 ? -1 : 1;
  for (let q = 1; q <= N; q++) {
    const u = q / N, R = tubeWallRoll(G, 2 * PI * tubeWallPhase(u));
    S.push({ f: G.fr0 + TUBE_WALL.len * u, y: R.y, r: m * R.r, up: [0, R.up[1], m * R.up[2]], hw: TUBE_WALL.hw, tube: 1, lo: -0.3, hi: 0.3, prof: 'none' });
  }
  for (const f of lin(G.fr1, L, Math.max(6, Math.round((L - G.fr1) / 1.5))).slice(1)) {
    const w = Math.max(0.3, G.lim * tubeWallFloor(G, f) / G.b);
    S.push({ f, y: 0, r: 0, tube: inTube(f), lo: -w, hi: w, prof: 'none' });
  }
  pb.path(S, { profile: 'tube', kind: 'tube' });
  // Fahrbahn vor/hinter dem Portal und die Röhre selbst als Bänder (aufrechter Querschnitt, rollt nicht mit der Linie)
  pb.ribbon(lin(0, G.fp0, 2).map((f) => ({ f, y: 0, r: 0 })), { profile: 'road' });
  pb.ribbon(lin(G.fp1, L, 2).map((f) => ({ f, y: 0, r: 0 })), { profile: 'road' });
  const fs = lin(G.fp0, G.fp1, Math.round((G.fp1 - G.fp0) / 1.6));
  pb.ribbon(fs.map((f) => ({ f, y: 0, r: 0, tb: tubeWallFloor(G, f) })), { profile: 'tube' });
  // Mittelwand: Kreis-Abschnitt unter der Oberkante (etwas in den Mantel hinein, keine Fuge), Vorder-/Rückseite + Oberkante
  const fc = T, th = TUBE_WALL.th, Rw = G.Rr + 0.15, yT = G.wallTop, nA = 16;
  const a0 = Math.asin(Math.max(-1, Math.min(1, (yT - G.Rr) / Rw)));   // Winkel der Oberkante (rechts)
  const poly = [];
  for (let k = 0; k <= nA; k++) { const a = a0 - (PI + 2 * a0) * k / nA; poly.push([Rw * Math.cos(a), G.Rr + Rw * Math.sin(a)]); }
  const P = (f, q) => pb.W(f, q[1], q[0]);
  const face = (f, nf) => {
    for (let k = 1; k < poly.length - 1; k++) {
      const A = P(f, poly[0]), B = P(f, poly[k]), C = P(f, poly[k + 1]);
      triOut(pb, A, B, C, pb.Wv([nf, 0, 0]), MAT.WALL, true);
    }
  };
  face(fc - th / 2, -1); face(fc + th / 2, 1);
  const tl = poly[0], tr = poly[poly.length - 1];
  const q0 = P(fc - th / 2, tl), q1 = P(fc - th / 2, tr), q2 = P(fc + th / 2, tr), q3 = P(fc + th / 2, tl), up = pb.Wv([0, 1, 0]);
  triOut(pb, q0, q1, q2, up, MAT.WALL, true); triOut(pb, q0, q2, q3, up, MAT.WALL, true);
  // Warnstreifen: Vorderseite (zur Anfahrt) etwas kleiner als die Wand (nicht durch den Mantel), Oberkante
  const Rm = G.Rr - 0.05, a0m = Math.asin(Math.max(-1, Math.min(1, (yT - 0.05 - G.Rr) / Rm))), mp = [];
  for (let k = 0; k <= nA; k++) { const a = a0m - (PI + 2 * a0m) * k / nA; mp.push([fc - th / 2, G.Rr + Rm * Math.sin(a), Rm * Math.cos(a)]); }
  pb.markPoly(mp, [-1, 0, 0], [0, 0, 1], [0, 1, 0]);
  pb.markPoly([[fc - th / 2, yT, tl[0] - 0.1], [fc - th / 2, yT, tr[0] + 0.1], [fc + th / 2, yT, tr[0] + 0.1], [fc + th / 2, yT, tl[0] - 0.1]], [0, 1, 0], [0, 0, 1], [1, 0, 0]);
  pb.portal(G.fp0); pb.portal(G.fp1);
  pb.obstacleInfo({ kind: 'tube_wall', f: fc, top: yT, R: G.Rr, fr0: G.fr0, fr1: G.fr1 });
}
// Dreieck mit Außennormale nOut (Wicklung passend gedreht)
function triOut(pb, A, B, C, nOut, mat, collide) {
  const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  if (cx * nOut[0] + cy * nOut[1] + cz * nOut[2] >= 0) pb.tri(A, B, C, mat, collide); else pb.tri(A, C, B, mat, collide);
}

// ---------- Registrieren ----------
const straightCells = (k) => Array.from({ length: k }, (_, a) => [a, 0]);
const PH = {
  zigzag: { name: 'Zickzack-Barriere', cells: straightCells(ZIGZAG.cells), next: [ZIGZAG.cells, 0], turn: 0, dl: 0, stunt: 1, build: buildZigzag },
  zigzag2: { name: 'Zickzack-Barriere (kurz)', cells: straightCells(ZIGZAG2.cells), next: [ZIGZAG2.cells, 0], turn: 0, dl: 0, stunt: 1, build: buildZigzag },
  tube_wall: { name: 'Röhre mit Wand', cells: straightCells(2), next: [2, 0], turn: 0, dl: 0, stunt: 1, build: buildTubeWall },
};
for (const [k, v] of Object.entries(PH)) PIECES[k] = v;
export const HIND_TYPES = new Set(Object.keys(PH));
