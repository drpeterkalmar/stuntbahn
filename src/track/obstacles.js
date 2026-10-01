// Hindernisse in Sprunglücken (n21, Peter 30.09.2026: „stell ein paar flache Hindernisse oder Wassergräben mit Schiffen
// usw. rein. Sei kreativ.“). Eigene Funktion, nicht fest in der Schanze verdrahtet: gapObstacles(pb, opt) baut eine
// Variante in eine beliebige Lücke f0 … f1 (Element-Koordinaten f vorwärts, r rechts, y hoch über der Fahrbahn-Basis);
// n22 (Gelände) kann sie genauso über echte Täler legen (opt.floorY = Boden der Lücke, opt.kind = feste Variante).
// Regeln:
// - Alles bleibt unter der Decke ceil(f) (tiefste Flugbahn aller Tempi im Fenster, pieces.js jumpWindow) minus CLEAR m –
//   Lehre n3: eine Palme in der Lücke streifte das Auto. Was nicht darunter passt, wird weggelassen.
// - Hauptkörper kollidieren (zu kurz gesprungen → Aufprall/„Zu kurz“ → Reset, race.js), Kleinkram nicht.
// - Grundkörper mit Vertexfarben (MAT.PAINT) in die Batches der Strecke: keine eigenen Draw-Calls, keine Downloads.
// Varianten (je Sprung per Seed): Kanal mit Schiffen, Busse in Reihe, Bauernhof (Heuballen + Traktor), Hafen (Container),
// Bahnübergang (Güterzug im Einschnitt), Zirkus (Zelt, Wagen). URL ?hindernis=kanal|busse|… erzwingt eine Variante.
import { MAT, ROAD_HW } from './defs.js';
import { HOOK } from './pieces.js';

const PI = Math.PI;
export const CLEAR = 1.0;   // m Abstand unter der tiefsten Flugbahn (Radaufstandspunkte; Nase kippt im Flug ~15° ab)
export const OBSTACLES = ['kanal', 'busse', 'bauernhof', 'hafen', 'zug', 'zirkus'];
export const OBSTACLE_NAMES = { kanal: 'Kanal mit Schiffen', busse: 'Busse', bauernhof: 'Bauernhof', hafen: 'Hafen', zug: 'Bahnübergang', zirkus: 'Zirkus' };
const URL_KIND = (() => {
  const q = globalThis.location && globalThis.location.search;
  const v = q ? new URLSearchParams(q).get('hindernis') : null;
  return OBSTACLES.includes(v) ? v : null;
})();

const C = {
  hull: [0.12, 0.16, 0.24], hullRed: [0.5, 0.1, 0.07], white: [0.86, 0.85, 0.82], deck: [0.36, 0.3, 0.24], glass: [0.16, 0.22, 0.3],
  busY: [0.86, 0.62, 0.06], busR: [0.62, 0.1, 0.08], busB: [0.12, 0.3, 0.55], busW: [0.84, 0.84, 0.8], tyre: [0.06, 0.06, 0.06],
  hay: [0.78, 0.66, 0.34], hayDark: [0.62, 0.5, 0.24], green: [0.12, 0.42, 0.14], red: [0.6, 0.1, 0.07], wood: [0.36, 0.24, 0.14],
  ctr: [[0.66, 0.16, 0.1], [0.12, 0.34, 0.58], [0.1, 0.46, 0.3], [0.84, 0.6, 0.12], [0.5, 0.5, 0.52], [0.62, 0.3, 0.12]],
  rail: [0.32, 0.3, 0.28], sleeper: [0.3, 0.22, 0.15], ballast: [0.42, 0.4, 0.37], loco: [0.7, 0.12, 0.1], wagon: [0.36, 0.22, 0.14], tank: [0.82, 0.82, 0.8],
  tentA: [0.8, 0.12, 0.1], tentB: [0.93, 0.9, 0.82], caravan: [0.88, 0.8, 0.5], gold: [0.82, 0.64, 0.2],
};

// Seed-Hash → Variante (gleiche Strecke = gleiche Hindernisse)
export function obstacleKind(seed, i, j, d) {
  let h = (seed >>> 0) * 2654435761 ^ (i * 73856093) ^ (j * 19349663) ^ (d * 83492791);
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13;
  return OBSTACLES[(h >>> 0) % OBSTACLES.length];
}

// Baukasten im Element-Rahmen auf pb (build.js): Quader/Zylinder mit Vertexfarben, Kollision wahlweise
function kit(pb) {
  const F = pb.F, R = pb.R, U = [0, 1, 0];
  const n3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  let tris = 0;
  // Quader: Mitte (f, y, r), Kanten lf (vorwärts) / ly / lr (quer); yaw um die Hochachse
  const box = (f, y, r, lf, ly, lr, col, collide = false, yaw = 0, mat = MAT.PAINT) => {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const A0 = n3([F[0] * cs + R[0] * sn, 0, F[2] * cs + R[2] * sn]), A2 = n3([R[0] * cs - F[0] * sn, 0, R[2] * cs - F[2] * sn]);
    pb.wbox(pb.W(f, y, r), [A0, U, A2], [lf / 2, ly / 2, lr / 2], mat, collide, mat === MAT.PAINT ? col : null);
    tris += 12;
  };
  // liegender Zylinder (Achse quer = r, oder vorwärts = f), Mitte (f, y, r)
  const cylH = (f, y, r, rad, len, col, axis = 'r', seg = 10, collide = false) => {
    const ax = axis === 'r' ? R : F, side = axis === 'r' ? F : R;
    const c = pb.W(f, y, r), P = (a, s) => [c[0] + side[0] * Math.cos(a) * rad + ax[0] * s * len / 2, c[1] + Math.sin(a) * rad, c[2] + side[2] * Math.cos(a) * rad + ax[2] * s * len / 2];
    for (let k = 0; k < seg; k++) {
      const a0 = 2 * PI * k / seg, a1 = 2 * PI * (k + 1) / seg;
      pb.tri(P(a0, -1), P(a1, -1), P(a1, 1), MAT.PAINT, false, col); pb.tri(P(a0, -1), P(a1, 1), P(a0, 1), MAT.PAINT, false, col);
      for (const s of [-1, 1]) pb.tri([c[0] + ax[0] * s * len / 2, c[1], c[2] + ax[2] * s * len / 2], s > 0 ? P(a0, s) : P(a1, s), s > 0 ? P(a1, s) : P(a0, s), MAT.PAINT, false, col);
      tris += 4;
    }
    if (collide) colBox(f, y, r, axis === 'r' ? 2 * rad : len, 2 * rad, axis === 'r' ? len : 2 * rad);
  };
  // stehender Kegelstumpf (Zelt, Mast), Fuß bei y
  const cone = (f, y, r, rad0, rad1, h, cols, seg = 12) => {
    const c = pb.W(f, y, r);
    for (let k = 0; k < seg; k++) {
      const a0 = 2 * PI * k / seg, a1 = 2 * PI * (k + 1) / seg, col = cols[k % cols.length];
      const p = (a, rad, yy) => [c[0] + Math.cos(a) * rad, c[1] + yy, c[2] + Math.sin(a) * rad];
      pb.tri(p(a0, rad0, 0), p(a1, rad1, h), p(a1, rad0, 0), MAT.PAINT, false, col);
      if (rad1 > 0.01) pb.tri(p(a0, rad0, 0), p(a0, rad1, h), p(a1, rad1, h), MAT.PAINT, false, col);
      tris += 2;
    }
  };
  // nur Kollision: Quader (unsichtbar)
  const colBox = (f, y, r, lf, ly, lr) => {
    const P = (a, b, c) => pb.W(f + a * lf / 2, y + b * ly / 2, r + c * lr / 2);
    const faces = [[[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]], [[-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]],
      [[-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]], [[1, -1, -1], [1, -1, 1], [1, 1, 1], [1, 1, -1]],
      [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]], [[-1, -1, -1], [-1, -1, 1], [1, -1, 1], [1, -1, -1]]];
    for (const q of faces) { const v = q.map((a) => P(...a)); pb.colTri(v[0], v[2], v[1], MAT.PAINT); pb.colTri(v[0], v[3], v[2], MAT.PAINT); }
  };
  return { box, cylH, cone, colBox, get tris() { return tris; } };
}

// ---- Modelle (Mitte am Boden bei (f, y0, r), Länge quer zur Fahrtrichtung, wenn yaw = 0 → entlang r) ----
function bus(k, f, y0, r, col, len = 11.5) {
  const w = 2.5, h = 3.0;
  k.box(f, y0 + 0.55 + (h - 0.55) / 2, r, w, h - 0.55, len, col, true);
  k.box(f, y0 + 1.95, r, w + 0.04, 0.9, len - 1.2, C.glass, false, 0, MAT.GLASS);
  k.box(f, y0 + h + 0.06, r, w - 0.3, 0.12, len - 0.6, C.busW);
  for (const s of [-1, 1]) for (const q of [-0.32, 0.3]) k.box(f + s * (w / 2 - 0.15), y0 + 0.5, r + q * len, 0.32, 1.0, 1.0, C.tyre);
  k.box(f, y0 + 0.35, r, w - 0.2, 0.3, len - 0.4, C.tyre);
}
function container(k, f, y0, r, col, len = 12.2, collide = true) {
  const w = 2.44, h = 2.6;
  k.box(f, y0 + h / 2, r, w, h, len, col, collide);
  for (const q of [-0.5, 0.5]) k.box(f, y0 + h / 2, r + q * (len - 0.15), w + 0.06, h + 0.04, 0.12, [col[0] * 0.7, col[1] * 0.7, col[2] * 0.7]);
  for (let q = -4; q <= 4; q++) k.box(f, y0 + h / 2, r + q * len / 10, w + 0.05, h - 0.3, 0.08, [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
}

// ---- Varianten: (k, pb, o, top) mit o = { f0, f1, ceil(f), floorY }, top(fa, fb) = höchste erlaubte Oberkante ----
const VARIANTS = {
  // Kanal quer unter der Lücke (Wasser 2,6 m unter dem Rand), darauf ein Lastkahn mit Containern und ein Schlepper
  kanal(k, pb, o, top) {
    const G = o.f1 - o.f0, fa = o.f0 + 6, fb = o.f1 - 4, hw = ROAD_HW + 14;
    pb.pit(fa, fb, hw, { depth: 3.8, slope: 3 });
    const wy = -2.6;
    // Lastkahn längs des Kanals (quer zur Fahrt): Rumpf + Deck + Container (eine Lage)
    const fk = o.f0 + G * 0.42, kl = 30, kw = 7.5;
    if (top(fk - kw / 2, fk + kw / 2) > wy + 1.4 + 2.6) {
      k.box(fk, wy + 0.4, -3, kw, 1.8, kl, C.hull, true);
      k.box(fk, wy - 0.45, -3, kw - 0.3, 0.3, kl - 0.5, C.hullRed);
      k.box(fk, wy + 1.35, -3, kw + 0.1, 0.12, kl + 0.1, C.white);
      k.box(fk, wy + 2.1, -3 - kl / 2 + 2.5, kw - 1.4, 1.6, 3.5, C.white, true);
      k.box(fk, wy + 2.3, -3 - kl / 2 + 2.5, kw - 1.36, 0.5, 3.55, C.glass, false, 0, MAT.GLASS);
      for (let q = 0; q < 3; q++) container(k, fk, wy + 1.4, -3 - kl / 2 + 7.5 + q * 6.6, C.ctr[q], 6.1);
    }
    // Schlepper (kleiner Rumpf, Steuerhaus), versetzt weiter hinten
    const fs = o.f0 + G * 0.7, sw = 4.6;
    if (top(fs - sw / 2, fs + sw / 2) > wy + 3.6) {
      k.box(fs, wy + 0.45, 9, sw, 1.7, 13, C.hullRed, true);
      k.box(fs, wy + 1.35, 9, sw + 0.08, 0.12, 13.1, C.white);
      k.box(fs, wy + 2.3, 11, sw - 1.2, 1.8, 4.2, C.white, true);
      k.box(fs, wy + 2.6, 11, sw - 1.16, 0.6, 4.25, C.glass, false, 0, MAT.GLASS);
      k.box(fs, wy + 3.6, 12.2, 0.7, 1.0, 0.7, C.hull);
    }
    return 'kanal';
  },
  // Busse Seite an Seite quer zur Fahrt (wie bei den großen Motorrad-Sprüngen), so viele die Decke erlaubt
  busse(k, pb, o, top) {
    const cols = [C.busY, C.busY, C.busR, C.busB, C.busY, C.busW];
    let n = 0;
    for (let f = o.f0 + 8; f <= o.f1 - 6; f += 2.9) if (top(f - 1.3, f + 1.3) >= o.floorY + 3.1) { bus(k, f, o.floorY, (n % 2) * 0.6 - 0.3, cols[n % cols.length]); n++; }
    return n ? 'busse' : null;
  },
  // Bauernhof: Rundballen (liegend, in Reihen und gestapelt), Traktor mit Anhänger, Zaun
  bauernhof(k, pb, o, top) {
    const G = o.f1 - o.f0, y0 = o.floorY;
    for (let row = 0; row < 3; row++) {
      const f = o.f0 + 10 + row * 6;
      for (let q = -3; q <= 3; q++) {
        const rad = 0.85, stack = top(f - 1, f + 1) > y0 + 3.6 && (q % 2 === 0) ? 2 : 1;
        for (let s = 0; s < stack; s++) k.cylH(f + (s ? 0.9 : 0), y0 + rad + s * 1.55, q * 2.6, rad, 1.25, (q + row) % 2 ? C.hay : C.hayDark, 'r', 10, true);
      }
    }
    // Traktor (grün) mit Anhänger voller Heu, quer
    const ft = o.f0 + G * 0.62;
    if (top(ft - 2, ft + 2) > y0 + 3.2) {
      k.box(ft, y0 + 1.4, 3, 1.8, 1.2, 3.2, C.green, true);
      k.box(ft, y0 + 2.4, 4.0, 1.7, 1.3, 1.5, C.glass, false, 0, MAT.GLASS);
      k.box(ft, y0 + 3.08, 4.0, 1.9, 0.1, 1.8, C.green);
      k.cylH(ft, y0 + 0.85, 4.4, 0.85, 2.3, C.tyre, 'f', 12, true);
      k.cylH(ft, y0 + 0.5, 1.8, 0.5, 2.0, C.tyre, 'f', 10, true);
      k.box(ft, y0 + 1.25, -3.2, 2.3, 0.3, 6.5, C.red, true);
      for (let q = 0; q < 3; q++) k.box(ft, y0 + 2.0, -5.5 + q * 2.2, 2.0, 1.2, 2.0, C.hay, true);
      k.cylH(ft, y0 + 0.45, -3.2, 0.45, 2.4, C.tyre, 'f', 8);
    }
    for (const s of [-1, 1]) for (let f = o.f0 + 4; f <= o.f1 - 3; f += 3) { k.box(f, y0 + 0.6, s * (ROAD_HW + 5), 0.15, 1.2, 0.15, C.wood); }
    for (const s of [-1, 1]) k.box((o.f0 + o.f1) / 2, y0 + 0.95, s * (ROAD_HW + 5), G - 6, 0.12, 0.08, C.wood);
    return 'bauernhof';
  },
  // Hafen: 40-Fuß-Container quer in Reihen (eine Lage; wo die Decke reicht, zwei), dazu ein Gabelstapler
  hafen(k, pb, o, top) {
    const y0 = o.floorY;
    let n = 0;
    for (let f = o.f0 + 9; f <= o.f1 - 6; f += 3.0) {
      const t = top(f - 1.3, f + 1.3);
      if (t < y0 + 2.7) continue;
      const c = C.ctr[(n * 7 + 3) % C.ctr.length];
      container(k, f, y0, (n % 3 - 1) * 0.8, c);
      if (t >= y0 + 5.4 && n % 2) container(k, f, y0 + 2.6, (n % 3 - 1) * 0.8 + 1.5, C.ctr[(n * 5 + 1) % C.ctr.length], 12.2);
      n++;
    }
    for (let q = -12; q <= 12; q++) k.box((o.f0 + o.f1) / 2 + q * 2.4, y0 + 0.02, 0, 0.12, 0.04, 2 * ROAD_HW + 8, [0.85, 0.75, 0.2]);   // Markierung
    return n ? 'hafen' : null;
  },
  // Bahnübergang: zwei Gleise im flachen Einschnitt quer unter der Lücke, Güterzug und Kesselwagen
  zug(k, pb, o, top) {
    const G = o.f1 - o.f0, depth = 1.8, hw = ROAD_HW + 16, fa = o.f0 + 9, fb = o.f1 - 7;
    pb.pit(fa, fb, hw, { depth, slope: 4, water: false });
    const yb = o.floorY - depth;
    const tracks = [o.f0 + G * 0.4, o.f0 + G * 0.62];
    tracks.forEach((ft, ti) => {
      k.box(ft, yb + 0.1, 0, 4.2, 0.2, 2 * hw - 4, C.ballast);   // Schotterbett
      for (const s of [-0.72, 0.72]) k.box(ft + s, yb + 0.33, 0, 0.08, 0.16, 2 * hw - 4, C.rail);
      for (let r = -hw + 3; r <= hw - 3; r += 1.2) k.box(ft, yb + 0.25, r, 2.4, 0.1, 0.25, C.sleeper);
      if (top(ft - 1.6, ft + 1.6) < yb + 4.4) return;
      // Zug: Lok + Wagen entlang des Gleises (quer zur Fahrt)
      const L0 = ti ? 2 : -18;
      if (ti === 0) {
        k.box(ft, yb + 2.3, L0, 3.0, 3.4, 16, C.loco, true);
        k.box(ft, yb + 3.3, L0 + 7.2, 3.04, 0.8, 1.2, C.glass, false, 0, MAT.GLASS);
        for (let q = 1; q <= 2; q++) k.box(ft, yb + 2.2, L0 + q * 15.5, 2.9, 3.2, 14.5, C.wagon, true);
      } else {
        for (let q = 0; q < 3; q++) { const rr = L0 - 14 + q * 13.5; k.cylH(ft, yb + 2.4, rr, 1.45, 12, C.tank, 'r', 12, true); k.box(ft, yb + 0.9, rr, 2.6, 0.5, 12.5, C.tyre); }
      }
    });
    return 'zug';
  },
  // Zirkus: gestreiftes Zelt mitten unter dem Scheitel, Wohnwagen, Manege-Bande
  zirkus(k, pb, o, top) {
    const G = o.f1 - o.f0, y0 = o.floorY, fc = o.f0 + G * 0.5;
    const hT = Math.min(5.0, top(fc - 9, fc + 9) - y0);
    if (hT >= 3.0) {
      const wall = Math.min(1.8, hT * 0.4);
      k.cone(fc, y0, 0, 9, 9, wall, [C.tentA, C.tentB], 16);
      k.cone(fc, y0 + wall, 0, 9, 0.6, hT - wall, [C.tentA, C.tentB], 16);
      k.colBox(fc, y0 + hT * 0.4, 0, 14, hT * 0.8, 14);
    }
    for (const [df, r] of [[-17, 6], [-15, -8], [16, 7], [18, -6]]) {
      const f = fc + df;
      if (top(f - 2, f + 2) < y0 + 3.0) continue;
      k.box(f, y0 + 1.5, r, 2.4, 2.2, 6.5, C.caravan, true);
      k.box(f, y0 + 2.65, r, 2.5, 0.12, 6.6, C.tentA);
      k.box(f, y0 + 1.8, r, 2.44, 0.6, 4.5, C.glass, false, 0, MAT.GLASS);
      k.cylH(f, y0 + 0.4, r, 0.4, 2.6, C.tyre, 'f', 8);
    }
    for (let a = 0; a < 24; a++) { const t = 2 * PI * a / 24; k.box(fc + Math.cos(t) * 12, y0 + 0.4, Math.sin(t) * 12, 0.5, 0.8, 3.2, a % 2 ? C.tentA : C.gold, false, -t); }
    return hT >= 3.0 ? 'zirkus' : null;
  },
};

// Hindernis-Variante in die Lücke bauen. o: { f0, f1, ceil(f) (Flugbahn-Decke, y relativ zur Fahrbahn-Basis), floorY
// (Boden, Standard 0), kind (fest) }. Liefert den Namen der Variante (oder null, wenn nichts darunter passt).
export function gapObstacles(pb, o) {
  if (pb.decor) return null;
  const kind = o.kind || URL_KIND || pb.pc.obst || obstacleKind(pb.seed || 0, pb.pc.i, pb.pc.j, pb.pc.d);
  const opt = { floorY: 0, ...o };
  const top = (fa, fb) => { let m = 1e9; for (let f = Math.floor(fa); f <= Math.ceil(fb); f++) m = Math.min(m, opt.ceil(f)); return m - CLEAR; };
  const k = kit(pb);
  const r = VARIANTS[kind](k, pb, opt, top);
  gapObstacles.lastTris = k.tris;
  return r;
}
HOOK.gapObstacles = gapObstacles;
