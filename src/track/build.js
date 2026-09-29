// Baut aus einem Layout (Liste platzierter Elemente) alles, was Spiel, Physik und Grafik brauchen:
// Fahrlinie mit Rahmen (Tangente/Normale/Rechts), Render-Geometrie (je Material + Chunk),
// Kollisionsdreiecke (identisch zur Render-Geometrie), Gelände-Höhenfeld, Bäume, Checkpoints.
// Reines JS ohne DOM/three.js → läuft auch in Node (Tests, Generator-Prüfung).
import { TILE, LEVEL_H, ROAD_HW, ROAD_Y, GRID, DIRS, tileX, tileZ, MAT, ROAD_MATS, SURF_MAT, GRIP, WORLD_SCALE, WORLD_HALF } from './defs.js';
import { PIECES, JUMP, LOOP, pieceCells } from './pieces.js';
import './pieces_trk.js';
import { buildTrkTerrain, carveUnderRoads } from './trkterrain.js';
import { buildScenery } from './scenery.js';
import { adaptiveGrid, gridExt, FINE_DT } from './terrgrid.js';
import { clamp, smoothstep, makeNoise2, rng } from '../core/util.js';
import { GRIP_ALT } from '../physics/car.js';

const WS = WORLD_SCALE;
// Chunk-Kante wächst mit dem Maßstab: gleich viele Draw-Calls wie im alten Raster (bis 27.09.2026: 100 m)
const CHUNK = 100 * WS;

// ---------- kleine Vektorhelfer (Arrays [x,y,z]) ----------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

class Batch {
  constructor(mat, road) { this.mat = mat; this.pos = []; this.nrm = []; this.uv = []; this.road = road ? [] : null; this.col = mat === MAT.PAINT ? [] : null; this.idx = []; this.nv = 0; }
  v(p, n, u, v, rd, col) {
    this.pos.push(p[0], p[1], p[2]); this.nrm.push(n[0], n[1], n[2]); this.uv.push(u, v);
    if (this.road) this.road.push(...(rd || [0, 0, 0, 999]));
    if (this.col) this.col.push(...(col || [0.8, 0.8, 0.8]));
    return this.nv++;
  }
}

// Verwundene Fahrbahn (Steilkurven-Übergänge, Korkenzieher): Ein Viereck zwischen zwei Querschnitten ist dort
// windschief; als zwei Dreiecke entsteht ein Knick – bei 12 m Breite und 1 m Stützpunktabstand ein Sägezahn von
// mehreren Zentimetern, auf dem die Räder 30-mal je Sekunde aufschlugen und abwechselnd ohne Last waren (Auto hob am
// Steilkurven-Eingang ab, n14). Solche Fahrbahn-Segmente werden über den ganzen Lauf quer in so viele Streifen
// geteilt, dass der Knick unter TWIST_TOL bleibt (Grafik und Kollision gleich). Ebene Fahrbahn bleibt ein Segment.
const TWIST_TOL = 0.01, TWIST_MAX = 24;
function splitTwisted(S, profs) {
  if (GRIP_ALT) return profs;   // ?grip=1: Fahrbahn wie bis n13 (Vergleich)
  const nseg = profs[0].length, split = new Array(nseg).fill(1);
  const at = (s, a) => add(add(s.p, mul(s.B, a[0])), mul(s.N, a[1]));
  for (let k = 0; k < nseg; k++) {
    if (!profs[0][k].road) continue;
    let dmax = 0;
    for (let i = 1; i < S.length; i++) {
      const A0 = at(S[i - 1], profs[i - 1][k].a), B0 = at(S[i - 1], profs[i - 1][k].b), A1 = at(S[i], profs[i][k].a), B1 = at(S[i], profs[i][k].b);
      const n = cross(sub(B0, A0), sub(A1, A0)), l = Math.hypot(n[0], n[1], n[2]);
      if (l > 1e-9) dmax = Math.max(dmax, Math.abs(dot(sub(B1, A0), n)) / l);
    }
    split[k] = Math.min(TWIST_MAX, Math.max(1, Math.ceil(dmax / (4 * TWIST_TOL))));
  }
  if (split.every((x) => x === 1)) return profs;
  const lerp2 = (p, q, u) => [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
  return profs.map((pr) => pr.flatMap((sg, k) => {
    const m = split[k];
    if (m === 1) return [sg];
    return Array.from({ length: m }, (_, q) => ({ ...sg, a: lerp2(sg.a, sg.b, q / m), b: lerp2(sg.a, sg.b, (q + 1) / m), na: sg.na && sg.nb ? lerp2(sg.na, sg.nb, q / m) : sg.na, nb: sg.na && sg.nb ? lerp2(sg.na, sg.nb, (q + 1) / m) : sg.nb }));
  }));
}

// ---------- Querschnitte (Profile) im Rahmen: x = rechts, y = Fahrbahn-Normale ----------
function mirrorSegs(segs) {
  return segs.map((s) => ({ ...s, a: [-s.b[0], s.b[1]], b: [-s.a[0], s.a[1]], na: s.nb && [-s.nb[0], s.nb[1]], nb: s.na && [-s.na[0], s.na[1]] }));
}
function arcSegs(cx, cy, rad, a0, a1, n, mat, col, inward) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const t0 = a0 + (a1 - a0) * k / n, t1 = a0 + (a1 - a0) * (k + 1) / n;
    const p0 = [cx + rad * Math.cos(t0), cy + rad * Math.sin(t0)], p1 = [cx + rad * Math.cos(t1), cy + rad * Math.sin(t1)];
    const s = inward ? -1 : 1;
    out.push({ a: p0, b: p1, mat, col, na: [s * Math.cos(t0), s * Math.sin(t0)], nb: [s * Math.cos(t1), s * Math.sin(t1)] });
  }
  return out;
}
const PROFILES = {
  road(s, o) {
    const hw = s.hw, segs = [{ a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 }];
    let xl = -hw, xr = hw, yl = 0, yr = 0;
    const kw = 1.1, kh = 0.05;
    const inR = (o.turn || 0) > 0, inL = (o.turn || 0) < 0;
    const kerbR = (o.kerbIn && (inR || !o.turn)) || (o.kerbOut && inL);
    const kerbL = (o.kerbIn && (inL || !o.turn)) || (o.kerbOut && inR);
    if (kerbR) { segs.push({ a: [hw, 0], b: [hw + kw, kh], mat: MAT.KERB, col: 1, kerb: 1 }); xr = hw + kw; yr = kh; }
    if (kerbL) { segs.push({ a: [-hw - kw, kh], b: [-hw, 0], mat: MAT.KERB, col: 1, kerb: 1 }); xl = -hw - kw; yl = kh; }
    segs.push({ a: [xr, yr], b: [xr + 0.45, -0.55], mat: MAT.PAD, col: 0 });
    segs.push({ a: [xl - 0.45, -0.55], b: [xl, yl], mat: MAT.PAD, col: 0 });
    return segs;
  },
  deck(s) {
    const hw = s.hw, ph = 0.9, pt = 0.35, bot = -1.0;
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw, ph], mat: MAT.WALL, col: 1 },
      { a: [hw, ph], b: [hw + pt, ph], mat: MAT.WALL, col: 1 },
      { a: [hw + pt, ph], b: [hw + pt, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [hw + pt, bot], b: [-hw - pt, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - pt, bot], b: [-hw - pt, ph], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - pt, ph], b: [-hw, ph], mat: MAT.WALL, col: 1 },
      { a: [-hw, ph], b: [-hw, 0], mat: MAT.WALL, col: 1 },
    ];
  },
  rampwall(s) {
    const hw = s.hw, ph = 0.9, pt = 0.35, bot = -Math.max(0.6, s.hg + 0.6);
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw, ph], mat: MAT.WALL, col: 1 },
      { a: [hw, ph], b: [hw + pt, ph], mat: MAT.WALL, col: 1 },
      { a: [hw + pt, ph], b: [hw + pt, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - pt, bot], b: [-hw - pt, ph], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - pt, ph], b: [-hw, ph], mat: MAT.WALL, col: 1 },
      { a: [-hw, ph], b: [-hw, 0], mat: MAT.WALL, col: 1 },
    ];
  },
  banked(s, o) {
    // für Rechtskurve (Außen = links) gebaut, Linkskurve gespiegelt
    const hw = s.hw, wh = 1.3, wt = 0.4;
    const depth = (2 * hw * Math.abs(Math.sin(s.bank)) + 0.3) / Math.max(0.5, Math.cos(s.bank)) + 0.6;
    const segs = [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw + 0.5, -0.7], mat: MAT.PAD, col: 0 },
      { a: [-hw, wh], b: [-hw, 0], mat: MAT.WALL, col: 1 },
      { a: [-hw - wt, wh], b: [-hw, wh], mat: MAT.WALL, col: 1 },
      { a: [-hw - wt, -depth], b: [-hw - wt, wh], mat: MAT.CONCRETE, col: 1 },
    ];
    return (o.turn || 1) > 0 ? segs : mirrorSegs(segs);
  },
  loopLane(s) {
    const hw = s.hw, wh = 0.55, wt = 0.25, bot = -0.4;
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw, wh], mat: MAT.WALL, col: 1 },
      { a: [hw, wh], b: [hw + wt, wh], mat: MAT.WALL, col: 1 },
      { a: [hw + wt, wh], b: [hw + wt, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [hw + wt, bot], b: [-hw - wt, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - wt, bot], b: [-hw - wt, wh], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - wt, wh], b: [-hw, wh], mat: MAT.WALL, col: 1 },
      { a: [-hw, wh], b: [-hw, 0], mat: MAT.WALL, col: 1 },
    ];
  },
  tube() {
    const b = 2.2, R = 3.5, H = 2 * R, th = 0.45, n = 10;
    const inner = [
      { a: [-b, 0], b: [b, 0], mat: MAT.ROAD, col: 1, road: 1 },
      ...arcSegs(b, R, R, -Math.PI / 2, Math.PI / 2, n, MAT.CONCRETE, 1, true),
      { a: [b, H], b: [-b, H], mat: MAT.CONCRETE, col: 1 },
      ...arcSegs(-b, R, R, Math.PI / 2, 1.5 * Math.PI, n, MAT.CONCRETE, 1, true),
    ];
    const Ro = R + th;
    const outer = [
      ...arcSegs(-b, R, Ro, 1.5 * Math.PI, Math.PI / 2, n, MAT.CONCRETE, 0, false),
      { a: [-b, R + Ro], b: [b, R + Ro], mat: MAT.CONCRETE, col: 0 },
      ...arcSegs(b, R, Ro, Math.PI / 2, -Math.PI / 2, n, MAT.CONCRETE, 0, false),
    ];
    return inner.concat(outer);
  },
  causeway(s) {
    // Straße auf Damm (über Wasser/Senke) ohne Brüstung: kreuzende Spuren behindern sich nicht
    const hw = s.hw, bot = -Math.max(0.6, s.hg + 0.4);
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw + 0.6, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw - 0.6, bot], b: [-hw, 0], mat: MAT.CONCRETE, col: 1 },
    ];
  },
  hump(s) {
    // Buckel im Röhrenboden: Fahrbahn oben, Seiten bis unter den Boden
    const hw = s.hw;
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw, -1.3], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw, -1.3], b: [-hw, 0], mat: MAT.CONCRETE, col: 1 },
    ];
  },
  ramp(s) {
    const hw = s.hw, bot = -Math.max(0.3, s.hg + 0.3);
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.METAL, col: 1 },
      { a: [hw, 0], b: [hw, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw, bot], b: [-hw, 0], mat: MAT.CONCRETE, col: 1 },
    ];
  },
};

// ---------- Hauptfunktion ----------
export function buildTrack(layout, opt = {}) {
  const LH = layout.levelH ?? LEVEL_H;
  // Importierte Strecke: Gelände steht vorher fest (Pfeiler/Dämme reichen bis zum Boden)
  let trkTerr = null;
  if (layout.trk) {
    const occ = new Uint8Array(GRID * GRID);
    for (const pc of [...layout.pieces, ...(layout.decor || [])]) for (const [ci, cj] of pieceCells(pc.type, pc.i, pc.j, pc.d, pc.m || 1).cells) if (ci >= 0 && cj >= 0 && ci < GRID && cj < GRID) occ[cj * GRID + ci] = 1;
    for (const sc of layout.scenery || []) occ[sc.j * GRID + sc.i] = 1;
    trkTerr = buildTrkTerrain(layout.trk, LH, layout.seed || 1, occ);
  }
  const groundAt = trkTerr ? (x, z) => trkTerr.heightFn(x, z) : () => 0;
  const batches = new Map();
  const colPos = [], colNrm = [], colMat = [];
  const line = [];           // Samples der Fahrlinie (Welt)
  const shapes = [];         // Geländeformen (Grube, Hügel, Teich)
  const decals = [];         // Portale/Banner für die Grafik
  const jumps = [];
  const cpMarks = [];        // {pieceIdx, s}
  let startMark = null;
  const occupied = new Uint8Array(GRID * GRID);
  const pieceInfo = [];

  const batch = (chunk, mat) => {
    const k = chunk + '|' + mat;
    let b = batches.get(k);
    if (!b) { b = new Batch(mat, ROAD_MATS.has(mat)); b.chunk = chunk; batches.set(k, b); }
    return b;
  };
  // Importe füllen das ganze Raster: größere Chunks halten die Draw-Calls < 200
  const CH = layout.trk ? 2 * CHUNK : CHUNK;
  const chunkOf = (x, z) => Math.floor((x + 1000 * WS) / CH) + ',' + Math.floor((z + 1000 * WS) / CH);
  const addColTri = (p0, p1, p2, n0, n1, n2, mat) => {
    colPos.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    colNrm.push(n0[0], n0[1], n0[2], n1[0], n1[1], n1[2], n2[0], n2[1], n2[2]);
    colMat.push(mat);
  };

  // Deko-Stücke (nicht befahrene Teile importierter Strecken): Geometrie ohne Fahrlinie
  const buildPiece = (pc, pidx, decor) => {
    const P = PIECES[pc.type];
    if (!P) throw new Error('Unbekanntes Element ' + pc.type);
    const m = pc.m || 1, lvl = pc.lvl || 0, d = pc.d;
    const F = [DIRS[d][0], 0, DIRS[d][1]];
    const R = [DIRS[(d + 1) % 4][0], 0, DIRS[(d + 1) % 4][1]];
    const E = [tileX(pc.i) - F[0] * TILE / 2, 0, tileZ(pc.j) - F[2] * TILE / 2];
    // abgesenkte Deko-Spur (Kreuzung/Abzweig unter der befahrenen Spur) gegen Z-Fighting
    const base = lvl * LH + ROAD_Y - (pc.sub ? 0.025 : 0);
    const surfMat = pc.surf ? SURF_MAT[pc.surf] : null;
    const W = (f, y, r) => [E[0] + F[0] * f + R[0] * r, y + base, E[2] + F[2] * f + R[2] * r];
    const Wv = (v) => [F[0] * v[0] + R[0] * v[2], v[1], F[2] * v[0] + R[2] * v[2]];
    const nd = (d + (P.turn ? (m > 0 ? 1 : 3) : 0)) % 4;
    const exitDir = [DIRS[nd][0], 0, DIRS[nd][1]];
    const cells = P.cells.map(([a, b]) => [pc.i + DIRS[d][0] * a + DIRS[(d + 1) % 4][0] * b * m, pc.j + DIRS[d][1] * a + DIRS[(d + 1) % 4][1] * b * m]);
    for (const [ci, cj] of cells) if (ci >= 0 && cj >= 0 && ci < GRID && cj < GRID) occupied[cj * GRID + ci] = 1;
    const ctr = W(TILE / 2, 0, 0);
    const chunk = chunkOf(ctr[0], ctr[2]);
    const info = { type: pc.type, idx: pidx, lineStart: line.length, lineEnd: -1, cells, chunk, stunt: !!P.stunt };
    if (!decor) pieceInfo.push(info);

    // ----- Box (Quader) in lokalen Achsen -----
    const addBox = (f, y, r, lf, ly, lr, mat, o = {}) => {
      const c = W(f, y, r);
      const ax = [F, [0, 1, 0], R], hs = [lf / 2, ly / 2, lr / 2];
      const rotY = o.rotY || 0;
      let A = ax;
      if (rotY) { const cs = Math.cos(rotY), sn = Math.sin(rotY); A = [add(mul(F, cs), mul(R, sn)), [0, 1, 0], add(mul(R, cs), mul(F, -sn))]; }
      if (o.pitch) { const cs = Math.cos(o.pitch), sn = Math.sin(o.pitch); A = [add(mul(A[0], cs), mul(A[1], sn)), add(mul(A[1], cs), mul(A[0], -sn)), A[2]]; }
      const b = batch(chunk, mat);
      for (let ax0 = 0; ax0 < 3; ax0++) for (const sg of [-1, 1]) {
        const a1 = (ax0 + 1) % 3, a2 = (ax0 + 2) % 3;
        const n = mul(A[ax0], sg);
        const cF = add(c, mul(A[ax0], sg * hs[ax0]));
        const u = mul(A[a1], hs[a1]), v = mul(A[a2], hs[a2]);
        const q = [add(add(cF, mul(u, -1)), mul(v, -1)), add(add(cF, u), mul(v, -1)), add(add(cF, u), v), add(add(cF, mul(u, -1)), v)];
        const ul = 2 * hs[a1], vl = 2 * hs[a2];
        const i0 = b.v(q[0], n, 0, 0), i1 = b.v(q[1], n, ul, 0), i2 = b.v(q[2], n, ul, vl), i3 = b.v(q[3], n, 0, vl);
        // Wicklung so, dass Normale nach außen zeigt
        const fn = cross(sub(q[1], q[0]), sub(q[2], q[0]));
        if (dot(fn, n) > 0) b.idx.push(i0, i1, i2, i0, i2, i3); else b.idx.push(i0, i2, i1, i0, i3, i2);
        if (o.collide) {
          if (dot(fn, n) > 0) { addColTri(q[0], q[1], q[2], n, n, n, mat); addColTri(q[0], q[2], q[3], n, n, n, mat); }
          else { addColTri(q[0], q[2], q[1], n, n, n, mat); addColTri(q[0], q[3], q[2], n, n, n, mat); }
        }
      }
    };

    // ----- Fahrlinie + Bänder -----
    const addPath = (samples, o) => {
      const n = samples.length;
      const S = samples.map((s) => {
        const p = W(s.f, s.y, s.r);
        return {
          p, up: s.up ? norm(Wv(s.up)) : [0, 1, 0], bank: s.bank || 0, hw: s.hw ?? o.hw ?? ROAD_HW,
          surf: s.surf ?? 1, air: s.air || 0, loop: s.loop || 0, tube: s.tube || 0, f: s.f,
          hg: s.y + lvl * LH - (trkTerr ? groundAt(p[0], p[2]) : 0), prof: s.prof || (o.profile === 'loop' ? (s.loop ? 'loopLane' : 'road') : o.profile === 'tube' ? (s.tube ? 'tube' : 'road') : o.profile),
          lo: s.lo, hi: s.hi, bankH: s.bankH,
        };
      });
      // Randtangenten exakt waagrecht in Ein-/Ausfahrtsrichtung (glatte Übergänge) – außer das Stück
      // beginnt/endet geneigt (Schanzenlippe, Landerampe): dann aus den Nachbarpunkten
      const sloped = (a, b) => { const d = sub(S[b].p, S[a].p); return Math.abs(d[1]) > 0.06 * Math.hypot(d[0], d[2]); };
      for (let i = 0; i < n; i++) {
        const s = S[i];
        let T;
        if (i === 0) T = n > 1 && sloped(0, 1) ? norm(sub(S[1].p, S[0].p)) : F.slice();
        else if (i === n - 1) T = sloped(n - 2, n - 1) ? norm(sub(S[n - 1].p, S[n - 2].p)) : exitDir.slice();
        else T = norm(sub(S[i + 1].p, S[i - 1].p));
        let N = norm(sub(s.up, mul(T, dot(s.up, T))));
        let B = cross(T, N);
        if (s.bank) {
          const c = Math.cos(s.bank), sn = Math.sin(s.bank);
          const B2 = add(mul(B, c), mul(N, sn)), N2 = sub(mul(N, c), mul(B, sn));
          B = B2; N = N2;
        }
        s.T = T; s.N = N; s.B = B;
      }
      // in die globale Linie übernehmen (Deko: keine Fahrlinie)
      const grip = GRIP[o.surfMat ?? surfMat ?? MAT.ROAD] ?? 1.25;
      for (let i = 0; i < n && !decor; i++) {
        const s = S[i];
        if (line.length && i === 0) {
          const last = line[line.length - 1];
          if (Math.hypot(last.p[0] - s.p[0], last.p[1] - s.p[1], last.p[2] - s.p[2]) < 0.05) continue;
        }
        const M = 1.3;
        let lo = s.lo ?? (-s.hw + M), hi = s.hi ?? (s.hw - M);
        if (lo > hi) lo = hi = (lo + hi) / 2;
        line.push({ p: s.p, T: s.T, N: s.N, B: s.B, hw: s.hw, lo, hi, air: s.air, loop: s.loop, tube: s.tube, piece: pidx, f: s.f, surf: s.surf, kind: o.kind || '', grip });
      }
      // Läufe gleicher Oberfläche/Profil bauen
      let i0 = 0;
      while (i0 < n - 1) {
        if (!S[i0].surf) { i0++; continue; }
        let i1 = i0;
        while (i1 + 1 < n && S[i1 + 1].surf && S[i1 + 1].prof === S[i0].prof) i1++;
        // gemeinsame Grenz-Samples: bis zum nächsten Profilwechsel inkl. dessen erstes Sample
        let iend = i1;
        if (i1 + 1 < n && S[i1 + 1].surf) iend = i1 + 1;
        if (iend > i0 && S[i0].prof !== 'none') buildRun(S.slice(i0, iend + 1), S[i0].prof, o);
        // Kappen an Lücken (Schanze/Landung)
        if (S[i0].prof === 'ramp' && i0 > 0 && !S[i0 - 1].surf) addCap(S[i0], -1);
        if (S[i1].prof === 'ramp' && i1 + 1 < n && !S[i1 + 1].surf) addCap(S[i1], 1);
        i0 = iend > i1 ? i1 + 1 : i1 + 1;
      }
    };

    const addCap = (s, dir) => { // senkrechte Stirnfläche von der Fahrbahn bis in die Grube
      const b = batch(chunk, MAT.CONCRETE);
      const hw = s.hw, bottom = -3.8 - base;
      const pL = add(s.p, mul(s.B, -hw)), pR = add(s.p, mul(s.B, hw));
      const qL = [pL[0], bottom + base, pL[2]], qR = [pR[0], bottom + base, pR[2]];
      const nrm = mul(s.T, dir);
      const quad = dir > 0 ? [pL, pR, qR, qL] : [pR, pL, qL, qR];
      const i = [b.v(quad[0], nrm, 0, 0), b.v(quad[1], nrm, 2 * hw, 0), b.v(quad[2], nrm, 2 * hw, 4), b.v(quad[3], nrm, 0, 4)];
      const fn = cross(sub(quad[1], quad[0]), sub(quad[2], quad[0]));
      if (dot(fn, nrm) > 0) b.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]); else b.idx.push(i[0], i[2], i[1], i[0], i[3], i[2]);
      addColTri(quad[0], quad[1], quad[2], nrm, nrm, nrm, MAT.CONCRETE);
      addColTri(quad[0], quad[2], quad[3], nrm, nrm, nrm, MAT.CONCRETE);
    };

    const buildRun = (S, prof, o) => {
      const pf = PROFILES[prof];
      let profs = S.map((s) => pf(s, o));
      const nseg0 = profs[0].length;
      for (const pr of profs) if (pr.length !== nseg0) throw new Error('Profil-Segmentzahl variiert: ' + prof);
      profs = splitTwisted(S, profs);
      const nseg = profs[0].length;
      // Bogenlänge entlang des Laufs (für UV v)
      const sAlong = [0];
      for (let i = 1; i < S.length; i++) sAlong.push(sAlong[i - 1] + Math.hypot(...sub(S[i].p, S[i - 1].p)));
      const sBase = (info.sBase || 0);
      const sm = o.surfMat ?? surfMat;
      for (let k = 0; k < nseg; k++) {
        const seg0 = profs[0][k];
        const smat = seg0.road && sm != null ? sm : seg0.mat;
        const b = batch(chunk, smat);
        let prevA = -1, prevB = -1, prevPA, prevPB, prevNA, prevNB;
        let uOff = 0;
        for (let i = 0; i < S.length; i++) {
          const s = S[i], sg = profs[i][k];
          const pa = add(add(s.p, mul(s.B, sg.a[0])), mul(s.N, sg.a[1]));
          const pbb = add(add(s.p, mul(s.B, sg.b[0])), mul(s.N, sg.b[1]));
          const d2 = [sg.b[0] - sg.a[0], sg.b[1] - sg.a[1]];
          const segLen = Math.hypot(d2[0], d2[1]) || 1e-6;
          const n2 = [-d2[1] / segLen, d2[0] / segLen];
          const na2 = sg.na || n2, nb2 = sg.nb || n2;
          const nA = norm(add(mul(s.B, na2[0]), mul(s.N, na2[1])));
          const nB = norm(add(mul(s.B, nb2[0]), mul(s.N, nb2[1])));
          const v = sAlong[i] + sBase;
          let ia, ib;
          if (sg.road) {
            // aRoad = (quer x, hw + 100*Typ, s entlang, Abstand zur Markierung); Typ: 0 normal, 1 Start, 2 CP, +10 schmal
            const typ = (o.mark === 'start' ? 1 : o.mark === 'cp' ? 2 : 0) + (s.hw < 3.2 ? 10 : 0);
            const md = o.mark && o.markAt != null ? (s.f - o.markAt) : 999;
            ia = b.v(pa, nA, sg.a[0], v, [sg.a[0], s.hw + 100 * typ, v, md]);
            ib = b.v(pbb, nB, sg.b[0], v, [sg.b[0], s.hw + 100 * typ, v, md]);
          } else {
            ia = b.v(pa, nA, uOff, v);
            ib = b.v(pbb, nB, uOff + segLen, v);
          }
          if (i > 0) {
            b.idx.push(prevA, prevB, ia, prevB, ib, ia);
            if (sg.col) {
              addColTri(prevPA, prevPB, pa, prevNA, prevNB, nA, sg.kerb ? MAT.KERB : smat);
              addColTri(prevPB, pbb, pa, prevNB, nB, nA, sg.kerb ? MAT.KERB : smat);
            }
          }
          prevA = ia; prevB = ib; prevPA = pa; prevPB = pbb; prevNA = nA; prevNB = nB;
        }
      }
      info.sBase = sBase + sAlong[sAlong.length - 1];
    };

    const addRibbon = (samples, o) => {
      const S = samples.map((s) => { const p = W(s.f, s.y, s.r); return { p, up: [0, 1, 0], bank: 0, hw: s.hw ?? ROAD_HW, surf: 1, f: s.f, hg: s.y + lvl * LH - (trkTerr ? groundAt(p[0], p[2]) : 0), prof: o.profile }; });
      for (let i = 0; i < S.length; i++) {
        const T = i === 0 ? norm(sub(S[1].p, S[0].p)) : i === S.length - 1 ? norm(sub(S[i].p, S[i - 1].p)) : norm(sub(S[i + 1].p, S[i - 1].p));
        S[i].T = T; S[i].N = [0, 1, 0]; S[i].B = cross(T, [0, 1, 0]);
      }
      buildRun(S, o.profile, o);
    };
    // Quader in Weltlage (Mittelpunkt c, Achsen ax[3] normiert, halbe Kantenlängen hs[3])
    const wbox = (c, ax, hs, mat, collide, col) => {
      const b = batch(chunk, mat);
      for (let a0 = 0; a0 < 3; a0++) for (const sg of [-1, 1]) {
        const a1 = (a0 + 1) % 3, a2 = (a0 + 2) % 3;
        const n = mul(ax[a0], sg);
        const cF = add(c, mul(ax[a0], sg * hs[a0]));
        const u = mul(ax[a1], hs[a1]), v = mul(ax[a2], hs[a2]);
        const q = [add(add(cF, mul(u, -1)), mul(v, -1)), add(add(cF, u), mul(v, -1)), add(add(cF, u), v), add(add(cF, mul(u, -1)), v)];
        const ul = 2 * hs[a1], vl = 2 * hs[a2];
        const ii = [b.v(q[0], n, 0, 0, null, col), b.v(q[1], n, ul, 0, null, col), b.v(q[2], n, ul, vl, null, col), b.v(q[3], n, 0, vl, null, col)];
        const fn = cross(sub(q[1], q[0]), sub(q[2], q[0]));
        const ok = dot(fn, n) > 0;
        if (ok) b.idx.push(ii[0], ii[1], ii[2], ii[0], ii[2], ii[3]); else b.idx.push(ii[0], ii[2], ii[1], ii[0], ii[3], ii[2]);
        if (collide) {
          if (ok) { addColTri(q[0], q[1], q[2], n, n, n, mat); addColTri(q[0], q[2], q[3], n, n, n, mat); }
          else { addColTri(q[0], q[2], q[1], n, n, n, mat); addColTri(q[0], q[3], q[2], n, n, n, mat); }
        }
      }
    };
    const pb = {
      m, lvl, pc, LH, decor, T: TILE, base, F, R, E,
      W, Wv, wbox,
      ground: (f, r) => { const q = W(f, 0, r); return groundAt(q[0], q[2]); },
      lastLine: () => line[line.length - 1],
      tri: (p0, p1, p2, mat, collide, col) => {
        const b = batch(chunk, mat);
        const nrm = norm(cross(sub(p1, p0), sub(p2, p0)));
        const uvs = [[p0[0] + p0[2], p0[1]], [p1[0] + p1[2], p1[1]], [p2[0] + p2[2], p2[1]]];
        const ii = [p0, p1, p2].map((p, k) => b.v(p, nrm, uvs[k][0] * 0.5, uvs[k][1] * 0.5, null, col));
        b.idx.push(ii[0], ii[1], ii[2]);
        if (collide) addColTri(p0, p1, p2, nrm, nrm, nrm, mat);
      },
      path: addPath,
      ribbon: addRibbon,
      box: addBox,
      startLine: (f) => { if (!decor) startMark = { piece: pidx, f }; },
      checkpoint: (f) => { if (!decor) cpMarks.push({ piece: pidx, f }); },
      gate: (type, f) => {
        const c = W(f, 0, 0);
        decals.push({ type, p: c, F, R, lvl });
        const span = ROAD_HW + 1.6, h = 6.2;
        for (const sgn of [-1, 1]) addBox(f, h / 2, sgn * span, 0.5, h, 0.5, MAT.STEEL, { collide: true });
        addBox(f, h + 0.55, 0, 0.7, 1.1, 2 * span + 0.5, MAT.STEEL, { collide: false });
      },
      pad: (f0, f1, r0, r1) => {
        const b = batch(chunk, MAT.PAD);
        const y = -0.035;
        const q = [W(f0, y, r0), W(f1, y, r0), W(f1, y, r1), W(f0, y, r1)];
        const up = [0, 1, 0];
        const i = q.map((p, k) => b.v(p, up, [0, f1 - f0, f1 - f0, 0][k], [0, 0, r1 - r0, r1 - r0][k]));
        const fn = cross(sub(q[1], q[0]), sub(q[2], q[0]));
        if (fn[1] > 0) b.idx.push(i[0], i[1], i[2], i[0], i[2], i[3]); else b.idx.push(i[0], i[2], i[1], i[0], i[3], i[2]);
        if (fn[1] > 0) { addColTri(q[0], q[1], q[2], up, up, up, MAT.PAD); addColTri(q[0], q[2], q[3], up, up, up, MAT.PAD); }
        else { addColTri(q[0], q[2], q[1], up, up, up, MAT.PAD); addColTri(q[0], q[3], q[2], up, up, up, MAT.PAD); }
      },
      pit: (f0, f1, hwid) => {
        shapes.push({ type: 'pit', E, F, R, f0, f1, hw: hwid, depth: 3.8, slope: 2.5, base: 0 });
      },
      mound: (f0, f1, hy, hwid, slope) => {
        const N = 40, arr = [];
        for (let k = 0; k <= N; k++) arr.push(hy(f0 + (f1 - f0) * k / N));
        shapes.push({ type: 'mound', E, F, R, f0, f1, arr, hw: hwid, slope });
      },
      river: (f0, f1) => { shapes.push({ type: 'pond', E, F, R, f0, f1, c: [(f0 + f1) / 2, 0], rx: (f1 - f0) * 0.45, rz: 30 * WS, depth: 3 }); },
      arch: (len) => {
        // Bogenhöhe wächst mit √Maßstab (Spannweite = Feld), Segmente/Hänger mit der Länge
        const H = 7.5 * Math.sqrt(WS), hw = ROAD_HW + 0.55, n = Math.round(10 * WS), nh = Math.round(8 * WS);
        for (const sgn of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            const f0 = len * k / n, f1 = len * (k + 1) / n;
            const y0 = 0.9 + H * Math.sin(Math.PI * f0 / len), y1 = 0.9 + H * Math.sin(Math.PI * f1 / len);
            const fm = (f0 + f1) / 2, ym = (y0 + y1) / 2, L = Math.hypot(f1 - f0, y1 - y0);
            addBox(fm, ym, sgn * hw, L + 0.1, 0.45, 0.45, MAT.STEEL, { pitch: Math.atan2(y1 - y0, f1 - f0) });
          }
          for (let k = 1; k < nh; k++) {
            const f = len * k / nh, y1 = 0.9 + H * Math.sin(Math.PI * f / len);
            addBox(f, (0.9 + y1) / 2, sgn * hw, 0.12, y1 - 0.9, 0.12, MAT.STEEL, {});
          }
        }
        // Querriegel oben
        addBox(len / 2, 0.9 + H, 0, 0.35, 0.35, 2 * hw, MAT.STEEL, {});
      },
      loopSupports: (f0) => {
        // Stahlrahmen seitlich des Loopings + Querträger über dem Scheitel
        const fc = f0 + LOOP.dF / 2, top = LOOP.H + 1.3, off = Math.max(7.6, ROAD_HW + 2.1);   // außerhalb der Platte
        for (const sgn of [-1, 1]) {
          addBox(fc - 3, top / 2, sgn * off, 0.6, top, 0.6, MAT.STEEL, { collide: true });
          addBox(fc + 3, top / 2, sgn * off, 0.6, top, 0.6, MAT.STEEL, { collide: true });
          addBox(fc, top - 0.3, sgn * off, 6.6, 0.6, 0.6, MAT.STEEL, {});
          addBox(fc, 4.0, sgn * off, 6.6, 0.4, 0.4, MAT.STEEL, {});
        }
        addBox(fc, top + 0.2, 0, 1.0, 0.6, 2 * off + 0.6, MAT.STEEL, {});
      },
      jumpInfo: (j) => { if (!decor) jumps.push({ piece: pidx, ...j, E, F, R, base }); },
      portal: (f, facingOpt) => {
        // Betonfassade um die Röhrenöffnung (Ring zwischen Innenkontur und Rechteck)
        const b0 = 2.2, R0 = 3.5, Wx = Math.max(7.2, ROAD_HW + 1.6), Yb = -0.5, Yt = 2 * R0 + 1.4, n = 10;   // Fassade deckt die Fahrbahn
        const pts = [];
        for (let k = 0; k <= 4; k++) pts.push([-b0 + 2 * b0 * k / 4, 0]);
        for (let k = 1; k <= n; k++) { const t = -Math.PI / 2 + Math.PI * k / n; pts.push([b0 + R0 * Math.cos(t), R0 + R0 * Math.sin(t)]); }
        for (let k = 1; k <= 4; k++) pts.push([b0 - 2 * b0 * k / 4, 2 * R0]);
        for (let k = 1; k <= n; k++) { const t = Math.PI / 2 + Math.PI * k / n; pts.push([-b0 + R0 * Math.cos(t), R0 + R0 * Math.sin(t)]); }
        const proj = (p) => {
          const dx = p[0], dy = p[1] - R0;
          let t = 1e9;
          if (dx > 1e-6) t = Math.min(t, Wx / dx); if (dx < -1e-6) t = Math.min(t, -Wx / dx);
          if (dy > 1e-6) t = Math.min(t, (Yt - R0) / dy); if (dy < -1e-6) t = Math.min(t, (Yb - R0) / dy);
          return [dx * t, R0 + dy * t];
        };
        const facing = facingOpt ?? (f < TILE ? -1 : 1);
        const nrm = mul(F, facing);
        const bt = batch(chunk, MAT.CONCRETE);
        const toW = (q) => W(f, q[1], q[0]);
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k], c = pts[k + 1], ao = proj(a), co = proj(c);
          const quad = [toW(a), toW(c), toW(co), toW(ao)];
          const ii = quad.map((p, q) => bt.v(p, nrm, [a[0], c[0], co[0], ao[0]][q], [a[1], c[1], co[1], ao[1]][q]));
          const fn = cross(sub(quad[1], quad[0]), sub(quad[2], quad[0]));
          const ok = dot(fn, nrm) > 0;
          if (ok) bt.idx.push(ii[0], ii[1], ii[2], ii[0], ii[2], ii[3]); else bt.idx.push(ii[0], ii[2], ii[1], ii[0], ii[3], ii[2]);
          if (ok) { addColTri(quad[0], quad[1], quad[2], nrm, nrm, nrm, MAT.CONCRETE); addColTri(quad[0], quad[2], quad[3], nrm, nrm, nrm, MAT.CONCRETE); }
          else { addColTri(quad[0], quad[2], quad[1], nrm, nrm, nrm, MAT.CONCRETE); addColTri(quad[0], quad[3], quad[2], nrm, nrm, nrm, MAT.CONCRETE); }
        }
        // Dicke der Fassade: Deckel oben + Seiten
        addBox(f + facing * 0.3, Yt + 0.0 - 0.25, 0, 0.6, 0.5, 2 * Wx, MAT.CONCRETE, { collide: true });
        for (const sg of [-1, 1]) addBox(f + facing * 0.3, (Yt + Yb) / 2, sg * (Wx - 0.25), 0.6, Yt - Yb, 0.5, MAT.CONCRETE, { collide: true });
      },
    };
    info.lineStart = line.length;
    P.build(pb);
    info.lineEnd = line.length - 1;
    info.exitDir = exitDir;
    // Checkpoint importierter Strecken: Mitte des Stücks
    if (pc.cp && !decor && info.lineEnd >= info.lineStart) {
      const mid = line[(info.lineStart + info.lineEnd) >> 1];
      cpMarks.push({ piece: pidx, f: mid.f });
    }
  };
  layout.pieces.forEach((pc, k) => buildPiece(pc, k, false));
  (layout.decor || []).forEach((pc, k) => buildPiece(pc, -1 - k, true));
  // Szenerie (Häuser, Bäume, Windmühle …) importierter Strecken
  const sceneryTrees = [];
  if (layout.scenery && layout.scenery.length) {
    buildScenery(layout.scenery, { batch, chunkOf, addColTri, groundAt, LH, trees: sceneryTrees, decals });
  }

  // ----- Linie: Bogenlänge, Arrays -----
  const n = line.length;
  const L = {
    n, px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n),
    tx: new Float32Array(n), ty: new Float32Array(n), tz: new Float32Array(n),
    nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
    bx: new Float32Array(n), by: new Float32Array(n), bz: new Float32Array(n),
    s: new Float32Array(n), hw: new Float32Array(n), lo: new Float32Array(n), hi: new Float32Array(n), air: new Uint8Array(n), loop: new Uint8Array(n), tube: new Uint8Array(n),
    piece: new Uint16Array(n), grip: new Float32Array(n), total: 0, closed: false,
  };
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const q = line[i];
    if (i > 0) acc += Math.hypot(q.p[0] - line[i - 1].p[0], q.p[1] - line[i - 1].p[1], q.p[2] - line[i - 1].p[2]);
    L.px[i] = q.p[0]; L.py[i] = q.p[1]; L.pz[i] = q.p[2];
    L.tx[i] = q.T[0]; L.ty[i] = q.T[1]; L.tz[i] = q.T[2];
    L.nx[i] = q.N[0]; L.ny[i] = q.N[1]; L.nz[i] = q.N[2];
    L.bx[i] = q.B[0]; L.by[i] = q.B[1]; L.bz[i] = q.B[2];
    L.s[i] = acc; L.hw[i] = q.hw; L.lo[i] = q.lo; L.hi[i] = q.hi; L.air[i] = q.air; L.loop[i] = q.loop; L.tube[i] = q.tube; L.piece[i] = q.piece; L.grip[i] = q.grip ?? 1.25;
  }
  L.total = acc;
  // Rundkurs? (Ende == Anfang)
  if (n > 2) {
    const dx = L.px[n - 1] - L.px[0], dy = L.py[n - 1] - L.py[0], dz = L.pz[n - 1] - L.pz[0];
    L.closed = Math.hypot(dx, dy, dz) < 0.5;
  }
  const idxAt = (pieceIdx, f) => {
    const pi = pieceInfo[pieceIdx];
    let best = pi.lineStart, bd = 1e9;
    for (let i = pi.lineStart; i <= pi.lineEnd; i++) { const dd = Math.abs(line[i].f - f); if (dd < bd) { bd = dd; best = i; } }
    return best;
  };
  const checkpoints = cpMarks.map((c) => ({ idx: idxAt(c.piece, c.f) }));
  const start = startMark ? { idx: idxAt(startMark.piece, startMark.f) } : { idx: 0 };
  for (const j of jumps) {
    if (j.gen) {
      // Sprung über Lücke (Import): Lippe = letzter Punkt vor der Luftstrecke, Landung = erster danach
      const pi = pieceInfo[j.piece];
      j.lipIdx = Math.max(0, pi.lineStart - 1);
      j.landIdx = Math.min(line.length - 1, pi.lineEnd + 1);
      continue;
    }
    j.lipIdx = idxAt(j.piece, j.lipF);
    j.landIdx = idxAt(j.piece, j.landF);
  }

  // ----- Gelände -----
  const terrain = trkTerr || buildTerrain(occupied, shapes, layout.seed || 1);
  // ----- Bäume ----- (Import: Tannen aus der Szenerie + Wald außerhalb des Rasters)
  // Anzahl wächst mit der Fläche (Maßstab²), damit die große Welt gleich dicht bewaldet ist; Bäume selbst
  // behalten ihre Größe. Die Grafik dünnt auf Qualitätsstufe 0 aus (world.js).
  const tc = (n) => Math.round(n * WS * WS);
  const trees = trkTerr ? sceneryTrees.concat(placeTrees(terrain, layout.seed || 1, opt.treeCount ?? tc(420), WORLD_HALF + 25 * WS)) : placeTrees(terrain, layout.seed || 1, opt.treeCount ?? tc(520));

  // ----- Batches finalisieren -----
  const outBatches = [];
  for (const b of batches.values()) {
    if (!b.idx.length) continue;
    outBatches.push({
      mat: b.mat, chunk: b.chunk,
      pos: new Float32Array(b.pos), nrm: new Float32Array(b.nrm), uv: new Float32Array(b.uv),
      road: b.road ? new Float32Array(b.road) : null,
      col: b.col ? new Float32Array(b.col) : null,
      idx: b.nv > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx),
    });
  }
  if (trkTerr) carveUnderRoads(trkTerr, outBatches, (m) => ROAD_MATS.has(m));
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = 0;
  for (let i = 0; i < colPos.length; i += 3) {
    minX = Math.min(minX, colPos[i]); maxX = Math.max(maxX, colPos[i]);
    maxY = Math.max(maxY, colPos[i + 1]);
    minZ = Math.min(minZ, colPos[i + 2]); maxZ = Math.max(maxZ, colPos[i + 2]);
  }
  return {
    layout, line: L, batches: outBatches,
    col: { pos: new Float32Array(colPos), nrm: new Float32Array(colNrm), mat: new Uint8Array(colMat) },
    checkpoints, start, jumps, decals, shapes, terrain, trees, pieces: pieceInfo,
    bounds: { minX, maxX, minZ, maxZ, maxY },
  };
}

// ---------- Gelände ----------
export function buildTerrain(occupied, shapes, seed) {
  // Abstand jedes Feldes zur Strecke (in Feldern), 8er-Nachbarschaft
  const D = new Float32Array(GRID * GRID).fill(99);
  const q = [];
  for (let k = 0; k < GRID * GRID; k++) if (occupied[k]) { D[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % GRID, j = (k / GRID) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
      const nk = nj * GRID + ni, nd = D[k] + (di && dj ? 1.414 : 1);
      if (nd < D[nk]) { D[nk] = nd; q.push(nk); }
    }
  }
  const noise = makeNoise2(seed * 7 + 3);
  const distTiles = (x, z) => {
    const fi = (x - tileX(0)) / TILE, fj = (z - tileZ(0)) / TILE;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    const tx = fi - i0, tz = fj - j0;
    const g = (i, j) => (i < 0 || j < 0 || i >= GRID || j >= GRID) ? 99 : D[j * GRID + i];
    const a = g(i0, j0), b = g(i0 + 1, j0), c = g(i0, j0 + 1), dd = g(i0 + 1, j0 + 1);
    const out = Math.max(Math.abs(x) - WORLD_HALF, Math.abs(z) - WORLD_HALF, 0) / TILE;
    const v = Math.min(99, (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + dd * tx) * tz);
    return Math.min(v, 30) + out;
  };
  // Landschaft wächst geometrisch ähnlich mit (Breite und Höhe ×Maßstab: gleiche Hangneigung, gleiche Silhouette)
  const baseH = (x, z) => {
    const dt = distTiles(x, z);
    const mask = smoothstep(1.4, 4.5, dt);
    const u = x / WS, v = z / WS, r = Math.hypot(u, v);
    const hills = 13 * Math.pow(noise.fbm(u / 230 + 11, v / 230 - 7, 4) * 0.5 + 0.5, 1.6) + 5 * noise.fbm(u / 90, v / 90, 3);
    const rim = 70 * smoothstep(420, 950, r) * (0.7 + 0.3 * noise.fbm(u / 300, v / 300, 2));
    return WS * (mask * Math.max(0, hills) + rim);
  };
  const shapeH = (x, z, h) => {
    for (const s of shapes) {
      const dx = x - s.E[0], dz = z - s.E[2];
      const f = dx * s.F[0] + dz * s.F[2], r = dx * s.R[0] + dz * s.R[2];
      if (s.type === 'pit') {
        const df = Math.max(s.f0 - f, f - s.f1, 0), dr = Math.max(Math.abs(r) - s.hw, 0);
        const e = Math.max(df, dr);
        if (e < s.slope) {
          const inner = Math.max(s.f0 + s.slope - f, f - (s.f1 - s.slope), Math.abs(r) - (s.hw - s.slope));
          const t = inner <= 0 ? 1 : 1 - clamp(inner / s.slope, 0, 1);
          h = Math.min(h, -s.depth * smoothstep(0, 1, t));
        }
      } else if (s.type === 'mound') {
        if (f >= s.f0 - 12 && f <= s.f1 + 12) {
          const ff = clamp((f - s.f0) / (s.f1 - s.f0), 0, 1) * (s.arr.length - 1);
          const k = Math.floor(ff), t = ff - k;
          const top = (s.arr[k] * (1 - t) + s.arr[Math.min(k + 1, s.arr.length - 1)] * t) - 0.12;
          const dr = Math.max(Math.abs(r) - s.hw, 0);
          const df = Math.max(s.f0 - f, f - s.f1, 0);
          const v = top - (dr + df) / 2.2 * 1.0;
          if (v > h) h = v;
        }
      } else if (s.type === 'pond') {
        const u = (f - s.c[0]) / s.rx, w = r / s.rz;
        const e = Math.hypot(u, w);
        if (e < 1) h = Math.min(h, -s.depth * smoothstep(1, 0.55, e));
      }
    }
    return h;
  };
  const heightFn = (x, z) => shapeH(x, z, baseH(x, z));

  // Inneres Raster (Physik + Grafik): 5 m über das Streckenfeld + Rand. Physik überall exakt; die Grafik zeichnet
  // adaptiv (terrgrid.js): fein bis FINE_DT Felder um die Strecke (Gruben/Kuppen/Teiche liegen darin) und wo das
  // Gelände stark gekrümmt ist, sonst 20-m-Blöcke
  const ext = gridExt(WORLD_HALF + 60 * WS, 5), step = 5;
  const fineBlock = (x0, z0, x1, z1) => Math.min(distTiles(x0, z0), distTiles(x1, z0), distTiles(x0, z1), distTiles(x1, z1), distTiles((x0 + x1) / 2, (z0 + z1) / 2)) < FINE_DT;
  const { nx, H, Hv, fine, nb } = adaptiveGrid(ext, step, heightFn, fineBlock);
  const height = (x, z) => {
    const fx = (x + ext) / step, fz = (z + ext) / step;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nx - 1) return heightFn(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = H[j * nx + i], b = H[j * nx + i + 1], c = H[(j + 1) * nx + i], d = H[(j + 1) * nx + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
  };
  const waters = shapes.filter((s) => s.type === 'pit' || s.type === 'pond').map((s) => {
    if (s.type === 'pit') return { E: s.E, F: s.F, R: s.R, f0: s.f0 - 1, f1: s.f1 + 1, r0: -s.hw - 1, r1: s.hw + 1, y: -2.6 };
    return { E: s.E, F: s.F, R: s.R, f0: s.c[0] - s.rx, f1: s.c[0] + s.rx, r0: -s.rz, r1: s.rz, y: -1.4 };
  });
  return { ext, step, nx, H, Hv, height, heightFn, distTiles, waters, fine, nb };
}

function placeTrees(terrain, seed, count, keepOut = 0) {
  const r = rng(seed * 13 + 5);
  const noise = makeNoise2(seed * 3 + 1);
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 30) {
    tries++;
    const x = r.range(-560 * WS, 560 * WS), z = r.range(-560 * WS, 560 * WS);
    if (keepOut && Math.abs(x) < keepOut && Math.abs(z) < keepOut) continue;
    // Abstand zur Strecke in Metern wie im 20-m-Raster (≥ 17 m hinter dem belegten Feld, bis 70 m lichter):
    // in Feldern gerechnet stünden die Bäume in der großen Welt erst 54 m neben der Straße (leerer Streifen)
    const dt = terrain.distTiles(x, z);
    if (dt < 0.5 + 17 / TILE) continue;
    const dens = noise.fbm(x / (140 * WS), z / (140 * WS), 3) * 0.5 + 0.5;
    const near = dt < 0.5 + 70 / TILE ? 0.55 : 1;
    if (r() > dens * dens * 2.2 * near) continue;
    const y = terrain.height(x, z);
    if (y < -0.5) continue;
    let ok = true;
    for (const w of terrain.waters) {
      const dx = x - w.E[0], dz = z - w.E[2];
      const f = dx * w.F[0] + dz * w.F[2], rr = dx * w.R[0] + dz * w.R[2];
      if (f > w.f0 - 6 && f < w.f1 + 6 && rr > w.r0 - 6 && rr < w.r1 + 6) { ok = false; break; }
    }
    if (!ok) continue;
    out.push({ x, y, z, s: r.range(0.75, 1.35), rot: r.range(0, Math.PI), v: r.int(2) });
  }
  return out;
}
