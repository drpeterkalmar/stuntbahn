// Baut aus einem Layout (Liste platzierter Elemente) alles, was Spiel, Physik und Grafik brauchen:
// Fahrlinie mit Rahmen (Tangente/Normale/Rechts), Render-Geometrie (je Material + Chunk),
// Kollisionsdreiecke (identisch zur Render-Geometrie), Gelände-Höhenfeld, Bäume, Checkpoints.
// Reines JS ohne DOM/three.js → läuft auch in Node (Tests, Generator-Prüfung).
import { TILE, LEVEL_H, ROAD_HW, ROAD_Y, GRID, DIRS, tileX, tileZ, MAT, ROAD_MATS, SURF_MAT, GRIP, WORLD_SCALE, WORLD_HALF, STUNT_SCALE, stuntK } from './defs.js';
import { PIECES, JUMP, loopGeom, tubeGeom, pieceCells } from './pieces.js';
import './pieces_trk.js';
import './obstacles.js';   // Hindernisse in Sprunglücken (n21, HOOK.gapObstacles)
import { PROFILES_3D } from './pieces_3d.js';
import { buildTrkTerrain, carveUnderRoads } from './trkterrain.js';
import { buildScenery } from './scenery.js';
import { adaptiveGrid, gridExt, FINE_DT } from './terrgrid.js';
import { clamp, smoothstep, smootherstep, makeNoise2, rng } from '../core/util.js';
import { GRIP_ALT } from '../physics/car.js';
import { makeLandscape, planElevation, buildGelTerrain, ENV } from './gelaende.js';
import { PROFILES_GEL } from './pieces_gel.js';   // Gelände-Teile (n22): Halfpipe, Tunnel, Geländebrücke
import './pieces_hind.js';   // n33: Zickzack-Barriere, Röhre mit Wand (nur Generator-Version 2)

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
const HUMP_SIDE = 1.6;   // Breite der Seiten-Schräge am Röhren-Buckel (n29, PROFILES.tubeHump)
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
  loopLane(s, o, ss = 1) {
    // Spur in Looping/Korkenzieher-Rolle; n26: Bande wächst gedämpft mit dem Stunt-Maßstab (0,55 → 0,72 m bei 1,6)
    // s.wf (n26): Banden-Höhe an der Einfahrt anlaufend (0 … 1)
    const hw = s.hw, wh = 0.55 * stuntK(ss, 0.5) * (s.wf ?? 1), wt = 0.25, bot = -0.4;
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
  tube(s, o, ss = 1) {
    // Querschnitt: flacher Boden ±b, Viertelkreise Radius R, Decke auf 2R (n26: × Stunt-Maßstab, tubeGeom)
    // s.tb (n33, Röhre mit Wand): halbe Bodenbreite an dieser Stelle (→ 0 = Kreis); ohne s.tb wie bisher
    const { R, th } = tubeGeom(ss), b = s.tb ?? tubeGeom(ss).b, H = 2 * R, n = 10;
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
  // Buckel quer im Boden der generierten Röhre (n29): Fahrbahn über die ganze Bodenbreite ±b, seitlich je eine flache
  // Schräge (HUMP_SIDE m breit) hinunter auf den Viertelkreis des Mantels – keine Stufe, an der ein Rad am Wandfuß hängen
  // bleibt; dahinter (im Mantel verborgen) bis unter den Boden. s.hy = Buckel-Höhe dieses Punkts über dem Röhrenboden.
  // Der Mantel darüber kommt ohne Boden (tubeShell) – kein doppelter Boden
  tubeHump(s, o, ss = 1) {
    const { b, R } = tubeGeom(ss), w = HUMP_SIDE, ya = R - Math.sqrt(R * R - w * w) - (s.hy || 0);
    return [
      { a: [-b, 0], b: [b, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [b, 0], b: [b + w, ya], mat: MAT.CONCRETE, col: 1 },
      { a: [b + w, ya], b: [b + w, -1.3], mat: MAT.CONCRETE, col: 0 },
      { a: [-b - w, -1.3], b: [-b - w, ya], mat: MAT.CONCRETE, col: 0 },
      { a: [-b - w, ya], b: [-b, 0], mat: MAT.CONCRETE, col: 1 },
    ];
  },
  tubeShell(s, o, ss = 1) { return PROFILES.tube(s, o, ss).slice(1); },
  ramp(s) {
    const hw = s.hw, bot = -Math.max(0.3, s.hg + 0.3);
    return [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.METAL, col: 1 },
      { a: [hw, 0], b: [hw, bot], mat: MAT.CONCRETE, col: 1 },
      { a: [-hw, bot], b: [-hw, 0], mat: MAT.CONCRETE, col: 1 },
    ];
  },
};

Object.assign(PROFILES, PROFILES_3D, PROFILES_GEL);   // Querschnitte der 3D-Teile (pieces_3d.js) und Gelände-Teile (n22)

// Fahrbahnen unter einem Punkt (3D-Strecken, n19): Pfeiler einer Hochstraße dürfen nicht auf einer tieferen Fahrbahn
// stehen. Belegung je Feld aus dem Layout; gerade Stücke als Streifen entlang ihrer Achse (Kreuzungen sind immer
// rechtwinklig über Geraden), andere Stücke sperren das ganze Feld. Nur für Stücke, die mehrfach belegte Felder
// haben – flache Strecken bleiben unverändert.
const STRIP_TYPES = new Set(['straight', 'checkpoint', 'start']);
function belowIndex(layout, LH) {
  const cellMap = new Map();
  const all = [...layout.pieces.map((pc, k) => [pc, k]), ...(layout.decor || []).map((pc, k) => [pc, -1 - k])];
  for (const [pc, k] of all) {
    if (!PIECES[pc.type]) continue;
    const lo = Math.min(pc.lvl || 0, pc.h1 ?? pc.lvl ?? 0) * LH + ROAD_Y;
    for (const [ci, cj] of pieceCells(pc.type, pc.i, pc.j, pc.d, pc.m || 1).cells) {
      const key = ci + ',' + cj;
      if (!cellMap.has(key)) cellMap.set(key, []);
      cellMap.get(key).push({ k, pc, lo, ci, cj });
    }
  }
  // (x, z, y) liegt über einer Fahrbahn eines anderen Stücks (mindestens 2 m tiefer)?
  return (self, x, z, y) => {
    const i0 = Math.floor(x / TILE + GRID / 2), j0 = Math.floor(z / TILE + GRID / 2);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const L = cellMap.get((i0 + di) + ',' + (j0 + dj));
      if (!L) continue;
      for (const q of L) {
        if (q.k === self || q.lo > y - 2) continue;
        const cx = tileX(q.ci), cz = tileZ(q.cj), dx = x - cx, dz = z - cz;
        if (STRIP_TYPES.has(q.pc.type)) {
          const D = DIRS[q.pc.d], along = dx * D[0] + dz * D[1], across = -dx * D[1] + dz * D[0];
          if (Math.abs(along) <= TILE / 2 + 0.5 && Math.abs(across) < ROAD_HW + 1.8) return true;
        } else if (Math.abs(dx) < TILE / 2 + 1 && Math.abs(dz) < TILE / 2 + 1) return true;
      }
    }
    return false;
  };
}

// ---------- Hauptfunktion ----------
export function buildTrack(layout, opt = {}) {
  const LH = layout.levelH ?? LEVEL_H;
  // Stunt-Maßstab (n26): je Strecke (layout.stuntScale, z. B. Importe) oder global (defs.js STUNT_SCALE)
  const SS = layout.stuntScale ?? STUNT_SCALE;
  // Gelände-Strecken (n22, gelaende.js): erst flach bauen (Fahrlinie), daraus den Höhenverlauf je Stück planen, dann
  // ein zweites Mal bauen – jedes Stück um seinen Verlauf D(f) angehoben (Sockel-Stücke um einen festen Wert)
  let gel = null;
  if (layout.gel && !opt._flat) {
    const land = makeLandscape(layout.seed || 1, layout.diff || 2);
    const p1 = buildTrack(layout, { ...opt, _flat: true });
    gel = { land, plan: planElevation(layout, p1.line, p1._line, p1.pieces, land, layout.diff || 2) };
  }
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
  // n26 (nur Prüfwerkzeuge, opt.tagCol): Stück je Kollisionsdreieck (Index ins Layout, Deko-Stücke −1 − k, danach −1e6)
  const colPiece = opt.tagCol ? [] : null;
  let curPiece = -1;
  const line = [];           // Samples der Fahrlinie (Welt)
  const shapes = [];         // Geländeformen (Grube, Hügel, Teich)
  const decals = [];         // Portale/Banner für die Grafik
  const jumps = [];
  const humps = [];          // Buckel in Röhren (n29): { piece, f0, f1, c, H, hw, idx0, idx1, idxC }
  const marks = [];          // n33: gelb-schwarze Warnflächen (Zickzack-Blöcke, Röhren-Wand) für gfx/jumpdeck.js: { pos, nrm, uv }
  const obstacles = [];      // n33: Zickzack-Barrieren und Röhren-Wände: { piece, kind, …, idx0, idx1 (, idxW) }
  const cpMarks = [];        // {pieceIdx, s}
  let startMark = null;
  const occupied = new Uint8Array(GRID * GRID);
  const pieceInfo = [];
  let belowAt = null;   // erst bei Bedarf (Pfeiler der 3D-Teile)

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
    if (colPiece) colPiece.push(curPiece);
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
    // Gelände (n22): Höhenverlauf dieses Stücks – Sockel (fest) oder Tabelle D(f) über die Mittellinie (Kurven: f aus
    // dem Winkel um den Kurvenmittelpunkt); waagrecht bleibt alles, wie es ist
    const gx = gel && !decor ? gel.plan.pieces[pidx] : null;
    let Dat = null;
    if (gx) {
      const tab = (f) => { const fs = gx.fs, us = gx.us, nn = fs.length; if (f <= fs[0]) return us[0]; if (f >= fs[nn - 1]) return us[nn - 1]; let a = 0, b = nn - 1; while (b - a > 1) { const mm = (a + b) >> 1; if (fs[mm] <= f) a = mm; else b = mm; } return us[a] + (us[b] - us[a]) * (f - fs[a]) / (fs[b] - fs[a]); };
      if (gx.rigid) { const c = gx.c; Dat = () => c; }
      else if (gx.turnR) { const Rt = gx.turnR, mt = gx.m; Dat = (f, r) => tab(Rt * Math.sin(clamp(Math.atan2(f, Rt - mt * r), 0, Math.PI / 2))); }
      else Dat = (f) => tab(f);
    }
    const W = Dat ? (f, y, r) => [E[0] + F[0] * f + R[0] * r, y + base + Dat(f, r), E[2] + F[2] * f + R[2] * r] : (f, y, r) => [E[0] + F[0] * f + R[0] * r, y + base, E[2] + F[2] * f + R[2] * r];
    // Boden unter einem Weltpunkt relativ zum (unangehobenen) Stück: Gelände-Strecken messen gegen die Landschaft
    const gAt = Dat ? (x, z) => { const dx = x - E[0], dz = z - E[2]; return gel.land.h(x, z) - Dat(dx * F[0] + dz * F[2], dx * R[0] + dz * R[2]); } : groundAt;
    const tiltAt = Dat && pc.tilt0 != null ? (f) => pc.tilt0 + (pc.tilt1 - pc.tilt0) * smootherstep(f / TILE) : null;
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
          p, up: s.up ? norm(Wv(s.up)) : [0, 1, 0], bank: (s.bank || 0) + (tiltAt ? tiltAt(s.f) : 0), hw: s.hw ?? o.hw ?? ROAD_HW,
          surf: s.surf ?? 1, air: s.air || 0, loop: s.loop || 0, tube: s.tube || 0, wave: s.wave || 0, f: s.f,
          hg: s.y + lvl * LH - (trkTerr || Dat ? gAt(p[0], p[2]) : 0), prof: s.prof || (o.profile === 'loop' ? (s.loop ? 'loopLane' : 'road') : o.profile === 'tube' ? (s.tube ? 'tube' : 'road') : o.profile),
          lo: s.lo, hi: s.hi, bankH: s.bankH, ex: s.ex, wf: s.wf, hy: s.hy, tb: s.tb,
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
        line.push({ p: s.p, T: s.T, N: s.N, B: s.B, hw: s.hw, lo, hi, air: s.air, loop: s.loop, tube: s.tube, wave: s.wave, piece: pidx, f: s.f, surf: s.surf, kind: o.kind || '', grip });
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
      let profs = S.map((s) => pf(s, o, SS));
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
            const typ = (o.mark === 'start' ? 1 : o.mark === 'cp' ? 2 : 0) + (s.hw < 3.2 || prof === 'loopLane' ? 10 : 0);
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
      const S = samples.map((s) => { const p = W(s.f, s.y, s.r); return { p, up: [0, 1, 0], bank: 0, hw: s.hw ?? ROAD_HW, surf: 1, f: s.f, hg: s.y + lvl * LH - (trkTerr || Dat ? gAt(p[0], p[2]) : 0), prof: o.profile, tb: s.tb }; });
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
      m, lvl, pc, LH, decor, T: TILE, base, F, R, E, ss: SS,
      W, Wv, wbox,
      // Gelände-Strecke (n22): gel = an, gx = Plan dieses Stücks (Brücke, Tunnel, Portale …), D(f) = Anhebung
      gel: !!gel, gx, D: Dat,
      ground: (f, r) => { const q = W(f, 0, r); return gAt(q[0], q[2]); },
      below: gel ? null : (f, r, y) => { if (!belowAt) belowAt = belowIndex(layout, LH); const q = W(f, y, r); return belowAt(pidx, q[0], q[2], q[1]); },
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
      // Grube unter einer Lücke (Wasser 1,2 m unter dem Rand); o.depth/o.slope anders, o.water false = trockener Einschnitt
      pit: (f0, f1, hwid, o = {}) => {
        shapes.push({ type: 'pit', E, F, R, f0, f1, hw: hwid, depth: o.depth ?? 3.8, slope: o.slope ?? 2.5, base: 0, water: o.water !== false, ...(Dat ? { dy: Dat((f0 + f1) / 2, 0) } : {}) });
      },
      // Schlucht unter einer Sprunglücke (Gelände-Strecken, gelaende.js): Fluss in der Sohle
      gorge: (f0, f1) => { if (Dat) shapes.push({ type: 'gorge', E, F, R, f0, f1, dy: Dat((f0 + f1) / 2, 0) }); },
      // nur Kollision (unsichtbar), Dreieck in Weltlage (Hindernisse in Sprunglücken, obstacles.js)
      colTri: (p0, p1, p2, mat) => { const nrm = norm(cross(sub(p1, p0), sub(p2, p0))); addColTri(p0, p1, p2, nrm, nrm, nrm, mat); },
      seed: layout.seed || 0,
      prev: decor ? null : layout.pieces[(pidx - 1 + layout.pieces.length) % layout.pieces.length],   // Stück davor (Schanze: Anlauf)
      next: decor ? null : layout.pieces[(pidx + 1) % layout.pieces.length],
      mound: (f0, f1, hy, hwid, slope) => {
        const N = 40, arr = [];
        for (let k = 0; k <= N; k++) arr.push(hy(f0 + (f1 - f0) * k / N));
        shapes.push({ type: 'mound', E, F, R, f0, f1, arr, hw: hwid, slope, ...(Dat ? { dy: Dat((f0 + f1) / 2, 0) } : {}) });
      },
      river: (f0, f1) => { shapes.push({ type: 'pond', E, F, R, f0, f1, c: [(f0 + f1) / 2, 0], rx: (f1 - f0) * 0.45, rz: 30 * WS, depth: 3, ...(Dat ? { dy: Dat((f0 + f1) / 2, 0) } : {}) }); },
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
        // Stahlrahmen seitlich des Loopings + Querträger über dem Scheitel. n26: wachsen mit dem Looping (Stunt-Maßstab):
        // Abstand außerhalb der breiteren Spuren, Stützen-Abstand, Profil und ein Riegel mehr je ~10 m Höhe
        const LP = loopGeom(SS), k = SS, fc = f0 + LP.dF / 2, top = LP.H + 1.3 * k;
        const off = Math.max(7.6, ROAD_HW + 2.1, LP.shift + LP.hw + 1.4);   // außerhalb der Platte und der Spuren
        const sp = 3 * k, th = 0.6 * Math.sqrt(k), nR = Math.max(1, Math.round((top - 4) / 10));
        for (const sgn of [-1, 1]) {
          addBox(fc - sp, top / 2, sgn * off, th, top, th, MAT.STEEL, { collide: true });
          addBox(fc + sp, top / 2, sgn * off, th, top, th, MAT.STEEL, { collide: true });
          addBox(fc, top - 0.3, sgn * off, 2 * sp + th, th, th, MAT.STEEL, {});
          for (let q = 0; q < nR; q++) addBox(fc, 4.0 + q * (top - 4.0) / nR, sgn * off, 2 * sp + th, 0.4, 0.4, MAT.STEEL, {});
        }
        addBox(fc, top + 0.2, 0, 1.0 * Math.sqrt(k), th, 2 * off + th, MAT.STEEL, {});
      },
      jumpInfo: (j) => { if (!decor) jumps.push({ piece: pidx, ...j, E, F, R, base: Dat ? base + Dat(j.lipF, 0) : base }); },
      // Buckel im Röhrenboden (n29): Lage für Warnstreifen (gfx/jumpdeck.js), Tests und Messungen
      hump: (h) => { if (!decor) humps.push({ piece: pidx, ...h }); },
      // Warnfläche (n33, nur Optik): ebenes, konvexes Vieleck aus Punkten [f, y, r] (lokal), Normale nl [f, y, r] (lokal);
      // Textur-Koordinaten in Metern längs der lokalen Achsen ua/va, lift m vor der Fläche (kein Z-Fighting)
      markPoly: (pts, nl, ua, va, lift = 0.02) => {
        if (decor) return;
        const nw = norm(Wv(nl)), pos = [], uv = [];
        for (const q of pts) {
          const w = W(q[0], q[1], q[2]);
          pos.push(w[0] + nw[0] * lift, w[1] + nw[1] * lift, w[2] + nw[2] * lift);
          uv.push(q[0] * ua[0] + q[1] * ua[1] + q[2] * ua[2], q[0] * va[0] + q[1] * va[1] + q[2] * va[2]);
        }
        marks.push({ pos, nrm: nw, uv });
      },
      // Hindernis-Stück (n33): Lage für HUD, Highlights, Kulissen, Tests (Linien-Indizes nach dem Bau)
      obstacleInfo: (o) => { if (!decor) obstacles.push({ piece: pidx, E, F, R, base, ...o }); },
      portal: (f, facingOpt) => {
        // Betonfassade um die Röhrenöffnung (Ring zwischen Innenkontur und Rechteck)
        // n26: Öffnung = Röhren-Querschnitt des Stunt-Maßstabs (bis n25 b 2,2 / R 3,5 m), Fassade mindestens so breit
        const TG = tubeGeom(SS), b0 = TG.b, R0 = TG.R, Wx = Math.max(7.2, ROAD_HW + 1.6, SS > 1 ? b0 + R0 + TG.th + 1.2 : 0), Yb = -0.5, Yt = 2 * R0 + 1.4 * Math.sqrt(SS), n = 10;   // Fassade deckt die Fahrbahn
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
    curPiece = pidx;   // Deko-Stücke: −1 − k
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
  curPiece = -1e6;   // danach (Szenerie, Gelände-Bauten): kein Stück
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
    s: new Float32Array(n), hw: new Float32Array(n), lo: new Float32Array(n), hi: new Float32Array(n), air: new Uint8Array(n), loop: new Uint8Array(n), tube: new Uint8Array(n), wave: new Uint8Array(n),
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
    L.s[i] = acc; L.hw[i] = q.hw; L.lo[i] = q.lo; L.hi[i] = q.hi; L.air[i] = q.air; L.loop[i] = q.loop; L.tube[i] = q.tube; L.wave[i] = q.wave || 0; L.piece[i] = q.piece; L.grip[i] = q.grip ?? 1.25;
  }
  L.total = acc;
  // Rundkurs? (Ende == Anfang)
  if (n > 2) {
    const dx = L.px[n - 1] - L.px[0], dy = L.py[n - 1] - L.py[0], dz = L.pz[n - 1] - L.pz[0];
    L.closed = Math.hypot(dx, dy, dz) < 0.5;
  }
  // Gelände-Strecke, erster (flacher) Bau: nur die Fahrlinie wird gebraucht
  if (opt._flat) return { line: L, _line: line, pieces: pieceInfo, stuntScale: SS };
  // Kuppen mit Luftphase (n22): dort wie auf den Achterbahn-Wellen leicht negativer Anpressdruck im Tempo-Profil erlaubt,
  // keine Saugkraft (race.js haftOffAt) – die kurze Luftphase am Scheitel ist gewollt
  if (gel) for (const z of gel.plan.zones) {
    const pi = pieceInfo[z.k], sm = L.s[(pi.lineStart + pi.lineEnd) >> 1], half = (z.s1 - z.s0) / 2;
    for (let i = 0; i < n; i++) if (Math.abs(L.s[i] - sm) < half && !L.air[i]) L.wave[i] = 3;
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
    // Ende der Sprung-Zone (Hüpfer gesperrt, keine Saugkraft, Stunt-Zone): ganze Landerampe + 10 m (n21: 45 m lang;
    // bis n19 fest 12 Punkte hinter der Landung)
    if (j.landLen) j.endIdx = idxAt(j.piece, j.landF + j.landLen + 10);
  }
  for (const h of humps) { h.idx0 = idxAt(h.piece, h.f0); h.idx1 = idxAt(h.piece, h.f1); h.idxC = idxAt(h.piece, h.c); }
  for (const o of obstacles) {
    const pi = pieceInfo[o.piece];
    o.idx0 = pi.lineStart; o.idx1 = pi.lineEnd;
    if (o.kind === 'tube_wall') { o.idxW = idxAt(o.piece, o.f); o.idxR0 = idxAt(o.piece, o.fr0); o.idxR1 = idxAt(o.piece, o.fr1); }
    if (o.kind === 'zigzag') o.blockIdx = o.blocks.map((b) => idxAt(o.piece, b.f));
  }

  // ----- Gelände -----
  const terrain = trkTerr || (gel ? buildGelTerrain({ line: L, layout, plan: gel.plan, land: gel.land, shapes, occupied, pieces: pieceInfo }) : buildTerrain(occupied, shapes, layout.seed || 1));
  // Leitplanken, wo es neben der Fahrbahn hinuntergeht (Gelände-Strecken)
  if (gel) addRails(L, terrain, layout, gel.plan, batch, chunkOf, addColTri);
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
  if (gel) carveUnderRoads(terrain, outBatches, (m) => ROAD_MATS.has(m));
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9, maxY = 0;
  for (let i = 0; i < colPos.length; i += 3) {
    minX = Math.min(minX, colPos[i]); maxX = Math.max(maxX, colPos[i]);
    maxY = Math.max(maxY, colPos[i + 1]);
    minZ = Math.min(minZ, colPos[i + 2]); maxZ = Math.max(maxZ, colPos[i + 2]);
  }
  return {
    layout, line: L, batches: outBatches,
    col: { pos: new Float32Array(colPos), nrm: new Float32Array(colNrm), mat: new Uint8Array(colMat), ...(colPiece ? { piece: Int32Array.from(colPiece) } : {}) },
    checkpoints, start, jumps, humps, decals, shapes, terrain, trees, pieces: pieceInfo, stuntScale: SS,
    ...(marks.length ? { marks } : {}), ...(obstacles.length ? { obstacles } : {}),
    bounds: { minX, maxX, minZ, maxZ, maxY },
    ...(gel ? { gel } : {}),
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
  const waters = shapes.filter((s) => (s.type === 'pit' && s.water !== false) || s.type === 'pond').map((s) => {
    if (s.type === 'pit') return { E: s.E, F: s.F, R: s.R, f0: s.f0 - 1, f1: s.f1 + 1, r0: -s.hw - 1, r1: s.hw + 1, y: -2.6 };
    return { E: s.E, F: s.F, R: s.R, f0: s.c[0] - s.rx, f1: s.c[0] + s.rx, r0: -s.rz, r1: s.rz, y: -1.4 };
  });
  return { ext, step, nx, H, Hv, height, heightFn, distTiles, waters, fine, nb };
}

// Leitplanken (Gelände-Strecken, n22, Brief: „Randsteine/Leitplanken wo es runtergeht“): wo das Gelände RAIL.probe m
// neben der Fahrbahnkante mehr als RAIL.drop m tiefer liegt (Damm, Hangseite, Plateau-Kante), steht auf dieser Seite
// eine Stahl-Leitplanke (Holm 0,45–0,8 m, Pfosten alle RAIL.post m). Kollision als senkrechte Wand bis 0,85 m. Nicht an
// Stunt-Sockeln, Brücken (eigene Brüstung), im Tunnel, an Sprüngen und Loopings. Läufe kürzer als RAIL.minLen entfallen,
// Lücken bis RAIL.gap m werden geschlossen.
const RAIL = { off: 1.15, drop: 1.6, probe: 7, minLen: 24, gap: 14, post: 4, y0: 0.45, y1: 0.8, col: 0.85 };
function addRails(L, terrain, layout, plan, batch, chunkOf, addColTri) {
  const n = L.n, P = layout.pieces, rails = [];
  const ok = (i) => { const pl = plan.pieces[L.piece[i]] || {}; return !L.air[i] && !L.loop[i] && !L.tube[i] && !pl.rigid && !pl.bridge && !pl.tunnel; };
  const side = (i, sg, l) => { const bl = Math.hypot(L.bx[i], L.bz[i]) || 1; return [L.px[i] + L.bx[i] / bl * sg * l, L.py[i] + L.by[i] / bl * sg * l, L.pz[i] + L.bz[i] / bl * sg * l]; };
  for (const sg of [-1, 1]) {
    const need = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!ok(i)) continue;
      const e = side(i, sg, L.hw[i] + RAIL.off), q = side(i, sg, L.hw[i] + RAIL.probe);
      if (e[1] - terrain.height(q[0], q[2]) > RAIL.drop) need[i] = 1;
    }
    // Lücken schließen, kurze Läufe weglassen (über die Bogenlänge)
    let i = 0;
    while (i < n) {
      if (!need[i]) { i++; continue; }
      let e = i;
      for (;;) {
        let k = e + 1;
        while (k < n && !need[k] && ok(k) && L.s[k] - L.s[e] < RAIL.gap) k++;
        if (k < n && need[k]) e = k; else break;
      }
      if (L.s[e] - L.s[i] >= RAIL.minLen) rails.push({ sg, a: i, b: e });
      i = e + 1;
    }
  }
  const up = [0, 1, 0];
  for (const { sg, a, b } of rails) {
    let last = -1e9, prev = null, postAt = -1e9;
    for (let i = a; i <= b; i++) {
      if (L.s[i] - last < 1.8 && i !== b) continue;
      last = L.s[i];
      const p = side(i, sg, L.hw[i] + RAIL.off);
      const bl = Math.hypot(L.bx[i], L.bz[i]) || 1, nrm = [-sg * L.bx[i] / bl, 0, -sg * L.bz[i] / bl];   // zur Fahrbahn
      if (prev) {
        const bt = batch(chunkOf(p[0], p[2]), MAT.STEEL);
        const q0 = [prev.p[0], prev.p[1] + RAIL.y0, prev.p[2]], q1 = [p[0], p[1] + RAIL.y0, p[2]], q2 = [p[0], p[1] + RAIL.y1, p[2]], q3 = [prev.p[0], prev.p[1] + RAIL.y1, prev.p[2]];
        for (const f of [1, -1]) {
          const nn = [nrm[0] * f, 0, nrm[2] * f];
          const v = [q0, q1, q2, q3].map((qq, k) => bt.v(qq, nn, k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0));
          const fn = cross(sub(q1, q0), sub(q2, q0));
          if (dot(fn, nn) > 0) bt.idx.push(v[0], v[1], v[2], v[0], v[2], v[3]); else bt.idx.push(v[0], v[2], v[1], v[0], v[3], v[2]);
          // Kollision: Wand vom Boden bis RAIL.col (beidseitig)
          const c0 = [prev.p[0], prev.p[1] - 0.4, prev.p[2]], c1 = [p[0], p[1] - 0.4, p[2]], c2 = [p[0], p[1] + RAIL.col, p[2]], c3 = [prev.p[0], prev.p[1] + RAIL.col, prev.p[2]];
          const cn = cross(sub(c1, c0), sub(c2, c0));
          if (dot(cn, nn) > 0) { addColTri(c0, c1, c2, nn, nn, nn, MAT.STEEL); addColTri(c0, c2, c3, nn, nn, nn, MAT.STEEL); }
          else { addColTri(c0, c2, c1, nn, nn, nn, MAT.STEEL); addColTri(c0, c3, c2, nn, nn, nn, MAT.STEEL); }
        }
      }
      if (L.s[i] - postAt >= RAIL.post) {
        postAt = L.s[i];
        // Pfosten (schmaler Quader hinter dem Holm)
        const bt = batch(chunkOf(p[0], p[2]), MAT.STEEL), o = [p[0] - nrm[0] * 0.12, p[1], p[2] - nrm[2] * 0.12];
        const ax = [nrm[0], 0, nrm[2]], az = [-nrm[2], 0, nrm[0]], hs = [0.07, 0.06];
        for (const [A, h] of [[ax, hs[0]], [az, hs[1]]]) for (const f of [1, -1]) {
          const nn = mul(A, f), c = add(o, mul(A, f * h)), w = A === ax ? az : ax, hw2 = A === ax ? hs[1] : hs[0];
          const qd = [add(c, mul(w, -hw2)), add(c, mul(w, hw2)), add(add(c, mul(w, hw2)), [0, RAIL.y1 + 0.05 + 0.4, 0]), add(add(c, mul(w, -hw2)), [0, RAIL.y1 + 0.05 + 0.4, 0])].map((qq) => [qq[0], qq[1] - 0.4, qq[2]]);
          const v = qd.map((qq, k) => bt.v(qq, nn, k === 1 || k === 2 ? 0.1 : 0, k >= 2 ? 1 : 0));
          const fn = cross(sub(qd[1], qd[0]), sub(qd[2], qd[0]));
          if (dot(fn, nn) > 0) bt.idx.push(v[0], v[1], v[2], v[0], v[2], v[3]); else bt.idx.push(v[0], v[2], v[1], v[0], v[3], v[2]);
        }
      }
      prev = { p };
    }
  }
  void up;
  return rails.length;
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
    if (terrain.wet ? terrain.wet(x, z) : y < -0.5) continue;
    // Gelände-Strecken: keine Bäume an Felshängen (über ~40°)
    if (terrain.gel && Math.max(Math.abs(terrain.height(x + 3, z) - terrain.height(x - 3, z)), Math.abs(terrain.height(x, z + 3) - terrain.height(x, z - 3))) / 6 > 0.85) continue;
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
