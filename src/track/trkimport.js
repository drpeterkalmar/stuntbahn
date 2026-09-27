// .TRK → Layout für buildTrack(): Elemente platzieren, Fahrweg ab Start/Ziel über das Raster verfolgen
// (Abzweige: der Weg, der zurück ins Ziel führt und die meisten Felder abdeckt; Lücken geradeaus = Sprung),
// Checkpoints ableiten, nicht befahrene Elemente als Deko, Szenerie + Gelände übernehmen.
// Reines JS (Node-Tests, Korpus-Prüfung).
import { DIRS } from './defs.js';
import { pieceCells, PIECES } from './pieces.js';
import './pieces_trk.js';
import { CODES, KINDS, TERRAIN, placeElement } from './trkelems.js';
import { TrkError, trkHash, HORIZONS } from './trk.js';

export const IMPORT_LH = 5;      // Höhe einer Ebene (Hügel = Hochstraße) in Metern
const MAX_GAP = 6;               // Sprünge über höchstens so viele freie Felder
const MAX_STEPS = 80000;         // Suchbudget der Wegsuche

// Ecken [NW, NE, SW, SE] je Seite (E, S, W, N)
const SIDE_CORNERS = [[1, 3], [2, 3], [0, 2], [0, 1]];

export function tileCorners(terr, i, j) {
  if (i < 0 || j < 0 || i > 29 || j > 29) return TERRAIN[0].c;
  return (TERRAIN[terr[j * 30 + i]] || TERRAIN[0]).c;
}
export function edgeLevel(terr, i, j, side) {
  const c = tileCorners(terr, i, j), [a, b] = SIDE_CORNERS[side];
  return (c[a] + c[b]) / 2;
}

// Alle Elemente platzieren; Wege mit Aus-/Einfahrt und absoluten Höhen (Ebenen) versehen
export function placeAll(trk) {
  const inst = [], scenery = [], unknown = new Map();
  for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
    const code = trk.elem[j * 30 + i];
    if (!code) continue;
    const e = CODES.get(code);
    if (!e) { unknown.set(code, (unknown.get(code) || 0) + 1); continue; }
    const K = KINDS[e.kind];
    if (K.filler) continue;
    const pe = placeElement(code, i, j);
    if (K.scenery) {
      const c = tileCorners(trk.terr, i, j);
      scenery.push({ kind: e.kind, code, i, j, facing: pe.facing, lvl: (c[0] + c[1] + c[2] + c[3]) / 4, water: !!(TERRAIN[trk.terr[j * 30 + i]] || {}).water });
      continue;
    }
    pe.id = inst.length;
    inst.push(pe);
  }
  for (const pe of inst) for (const r of pe.routes) {
    const nx = pieceCells(r.t, r.i, r.j, r.d, r.m).next;
    r.ni = nx[0]; r.nj = nx[1]; r.nd = nx[2];
    const ei = nx[0] - DIRS[nx[2]][0], ej = nx[1] - DIRS[nx[2]][1];
    r.l0 = edgeLevel(trk.terr, r.i, r.j, (r.d + 2) % 4) + r.h0;
    r.l1 = edgeLevel(trk.terr, ei, ej, nx[2]) + r.h1;
    r.inst = pe.id;
    r.key = pe.id + ':' + r.lane;
  }
  // Nachbarn je Weg (für Portale, Überhöhung, offene Rampen-Enden)
  const by = indexRoutes(inst), byExit = new Map();
  for (const pe of inst) for (const r of pe.routes) {
    const k = r.ni + ',' + r.nj + ',' + r.nd;
    if (!byExit.has(k)) byExit.set(k, []);
    byExit.get(k).push(r);
  }
  for (const pe of inst) for (const r of pe.routes) {
    const nx = (by.get(r.ni + ',' + r.nj + ',' + r.nd) || []).find((q) => q.inst !== r.inst && Math.abs(q.l0 - r.l1) < 0.3);
    const pv = (byExit.get(r.i + ',' + r.j + ',' + r.d) || []).find((q) => q.inst !== r.inst && Math.abs(q.l1 - r.l0) < 0.3);
    r.nk = nx ? inst[nx.inst].kind : null;
    r.pk = pv ? inst[pv.inst].kind : null;
    if (r.h1 > r.h0 && !nx) r.kick = 1;       // Rampe endet im Nichts → Schanze
    if (r.h0 > r.h1 && !pv) r.land = 1;       // Rampe beginnt im Nichts → Landung
  }
  return { inst, scenery, unknown };
}

function indexRoutes(inst) {
  const by = new Map();
  for (const pe of inst) for (const r of pe.routes) {
    const k = r.i + ',' + r.j + ',' + r.d;
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(r);
  }
  return by;
}

// Fahrweg suchen (Tiefensuche; verzweigt nur an Abzweigen und Sprüngen)
export function tracePath(inst, start) {
  const by = indexRoutes(inst);
  const used = new Set(), path = [];
  let best = null, steps = 0, truncated = false;
  const cellsOf = (r) => PIECES[r.t].cells.length;
  let cells = 0, gaps = 0, drops = 0;
  const record = (closed) => {
    const score = (closed ? 1e6 : 0) + cells - 4 * gaps - 2 * drops;
    if (!best || score > best.score) best = { score, closed, steps: path.map((p) => ({ r: p.r, gap: p.gap, drop: p.drop })), gaps, drops, cells };
  };
  const cands = (r) => {
    const list = by.get(r.ni + ',' + r.nj + ',' + r.nd) || [];
    const lvl = list.filter((q) => Math.abs(q.l0 - r.l1) < 0.3);
    if (lvl.length) return lvl.map((q) => ({ q, gap: 0, drop: 0 }));
    // Stufe nach unten = Absprung auf tiefere Fahrbahn; nach oben nur minimal
    return list.filter((q) => q.l0 < r.l1 + 0.3).map((q) => ({ q, gap: 0, drop: r.l1 - q.l0 }));
  };
  const gapCands = (r) => {
    const [dx, dy] = DIRS[r.nd];
    for (let k = 1; k <= MAX_GAP; k++) {
      const i = r.ni + dx * k, j = r.nj + dy * k;
      if (i < -1 || j < -1 || i > 30 || j > 30) break;
      const list = (by.get(i + ',' + j + ',' + r.nd) || []).filter((q) => q.l0 <= r.l1 + 0.6);
      if (list.length) return list.map((q) => ({ q, gap: k, drop: 0 }));
    }
    return [];
  };
  const visit = (r, gap, drop) => {
    if (++steps > MAX_STEPS) { truncated = true; return; }
    path.push({ r, gap, drop });
    used.add(r.key);
    cells += cellsOf(r) + gap; if (gap) gaps++; if (drop > 0.3) drops++;
    let next = cands(r);
    if (!next.length) next = gapCands(r);
    let went = false;
    for (const c of next) {
      if (c.q === start) { record(true); went = true; continue; }
      if (used.has(c.q.key)) continue;
      went = true;
      visit(c.q, c.gap, c.drop);
    }
    if (!went) record(false);
    path.pop();
    used.delete(r.key);
    cells -= cellsOf(r) + gap; if (gap) gaps--; if (drop > 0.3) drops--;
  };
  visit(start, 0, 0);
  if (best) best.truncated = truncated;
  return best;
}

const routePiece = (r, pe) => {
  const o = { type: r.t, i: r.i, j: r.j, d: r.d, m: r.m, lvl: r.l0, h1: r.l1, surf: r.surf, kind: pe.kind, code: pe.code };
  for (const k of ['sup', 'deco', 'into', 'obst', 'side', 'b0', 'b1', 'cross', 'over', 'under', 'rev', 'pk', 'nk', 'kick', 'land']) if (r[k] !== undefined && r[k] !== null) o[k] = r[k];
  if (pe.kind === 'ssplit' || pe.kind === 'lsplit') o.noKerb = 1;
  return o;
};

// Hauptfunktion: geparste Strecke → Layout + Bericht
export function trkToLayout(trk, opt = {}) {
  const { inst, scenery, unknown } = placeAll(trk);
  const sfs = inst.filter((pe) => pe.kind === 'sf');
  if (!sfs.length) throw new TrkError('Keine Start/Ziel-Linie gefunden – die Strecke ist so nicht fahrbar.');
  // Start: erste Start/Ziel-Linie in Fahrtrichtung; falls sie keinen Rundkurs ergibt, andere probieren
  let best = null, startInst = null;
  for (const pe of sfs) {
    for (const r of pe.routes) {
      const res = tracePath(inst, r);
      const better = res && (!best || res.score > best.score + (r.rev ? 5e5 : 0));
      if (better) { best = res; startInst = pe; }
      if (best && best.closed && !r.rev) break;
    }
    if (best && best.closed) break;
  }
  if (!best || best.steps.length < 2) throw new TrkError('Von Start/Ziel aus führt keine Fahrbahn weiter.');
  // Stücke in Fahrreihenfolge
  const pieces = [];
  const usedLanes = new Set();
  const onPath = new Set();
  best.steps.forEach((st, k) => {
    const r = st.r, pe = inst[r.inst];
    if (st.gap && k > 0) {
      const p = best.steps[k - 1].r;
      pieces.push({ type: 'tr_gap' + st.gap, i: p.ni, j: p.nj, d: p.nd, m: 1, lvl: p.l1, h1: r.l0, kind: 'gap' });
    }
    const pc = routePiece(r, pe);
    if (st.drop > 0.3) pc.drop = st.drop;
    if (k === 0) pc.start = 1;
    const prev = best.steps[k - 1] || (best.closed ? best.steps[best.steps.length - 1] : null);
    const next = best.steps[k + 1] || (best.closed ? best.steps[0] : null);
    pc.pk = st.gap ? 'gap' : prev ? inst[prev.r.inst].kind : null;
    pc.nk = next && next.gap ? 'gap' : next ? inst[next.r.inst].kind : null;
    if (pc.nk === 'gap' && r.h1 > r.h0) pc.kick = 1;
    if (pc.nk === 'gap' && Math.abs(r.l1 - r.l0) < 0.01) pc.lipEnd = 1;   // waagrecht in eine Lücke: Absprungkante
    if (pc.pk === 'gap' && r.h0 > r.h1) pc.land = 1;
    pieces.push(pc);
    usedLanes.add(r.key);
    onPath.add(r.inst);
  });
  // Szenerie unter Sprunglücken niedrig bauen (im Original fliegt man über Häuser, Schiffe, Windmühlen)
  const gapCells = new Set();
  for (const pc of pieces) if (pc.type.startsWith('tr_gap')) {
    const k = PIECES[pc.type].gap;
    for (let q = 0; q < k; q++) gapCells.add((pc.i + DIRS[pc.d][0] * q) + ',' + (pc.j + DIRS[pc.d][1] * q));
  }
  for (const sc of scenery) if (gapCells.has(sc.i + ',' + sc.j)) sc.low = 1;
  // Elemente unter einer Sprunglücke: hohe Deko (Stahlbügel, Portale) weglassen
  const under = (pc) => pieceCells(pc.type, pc.i, pc.j, pc.d, pc.m || 1).cells.some(([ci, cj]) => gapCells.has(ci + ',' + cj));
  // Checkpoints: bei 1/4, 2/4, 3/4 der Strecke, bevorzugt auf geraden Straßen
  const cum = [];
  let acc = 0;
  for (const pc of pieces) { cum.push(acc); acc += Math.max(1, PIECES[pc.type].cells.length); }
  const cps = [];
  for (const q of [0.25, 0.5, 0.75]) {
    const want = acc * q;
    let bi = -1, bd = 1e9;
    pieces.forEach((pc, k) => {
      if (k === 0 || pc.cp || pc.type.startsWith('tr_gap')) return;
      const straight = pc.type === 'tr_road' && !pc.deco && pc.lvl === pc.h1;
      const d = Math.abs(cum[k] - want) + (straight ? 0 : 2.5);
      if (d < bd) { bd = d; bi = k; }
    });
    if (bi > 0) { pieces[bi].cp = 1; cps.push(bi); }
  }
  // Deko: nicht befahrene Spuren (je Spur ein Weg), auf der Strecke liegende Kreuzungen/Abzweige abgesenkt
  const decor = [];
  for (const pe of inst) {
    const lanes = new Map();
    for (const r of pe.routes) if (!usedLanes.has(r.key) && (!lanes.has(r.lane) || lanes.get(r.lane).rev)) lanes.set(r.lane, r);
    for (const r of lanes.values()) {
      const pc = routePiece(r, pe);
      if (onPath.has(pe.id) && (pe.kind === 'cross' || pe.kind === 'ssplit' || pe.kind === 'lsplit')) pc.sub = 1;
      decor.push(pc);
    }
  }
  for (const pc of [...pieces, ...decor]) if (!pc.type.startsWith('tr_gap') && under(pc)) pc.underJump = 1;
  const counts = {};
  for (const pc of pieces) if (pc.kind) counts[pc.kind] = (counts[pc.kind] || 0) + 1;
  const key = 'trk-' + trkHash(trk.bytes);
  const layout = {
    pieces, decor, scenery, trk: { terr: trk.terr, horizon: trk.horizon }, levelH: IMPORT_LH, seed: parseInt(trkHash(trk.bytes).slice(0, 6), 36) || 1,
    meta: { key, name: trk.name, diffName: HORIZONS[trk.horizon] || '', imported: true, closed: best.closed },
  };
  const report = {
    closed: best.closed, gaps: best.gaps, drops: best.drops, truncated: best.truncated, pieces: pieces.length, decor: decor.length,
    scenery: scenery.length, unknown: [...unknown.entries()], counts, cps: cps.length, elements: inst.length,
    unusedElements: inst.filter((pe) => !onPath.has(pe.id)).length, startCode: startInst && startInst.code,
  };
  return { layout, report };
}
