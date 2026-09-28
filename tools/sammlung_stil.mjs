// Stil-Analyse der Stunts-Wettbewerbsstrecken (nur lokal: liest trk_local/, nie im Repo) + Ähnlichkeits-Tor.
// 1) Merkmale je Korpus-Strecke, gewichtet nach Beliebtheit (Fahrer im Scoreboard) → NUR Aggregate nach
//    assets/sammlung_stil.json (Häufigkeiten, Verteilungen, Übergänge). Muster (Elementfolgen) nur, wenn sie in
//    ≥ 5 Strecken von ≥ 3 verschiedenen Designern vorkommen – seltene Muster sind Handschrift einzelner Designer.
// 2) Ähnlichkeits-Tor (für tools/build_sammlung.mjs und tests/node/test_sammlung.mjs):
//    (a) Jaccard der Fahrbahnfelder, 8 Lagen (4 Drehungen × Spiegelung), Schwerpunkte übereinander ± 3 Felder,
//        Zeilen als 30-Bit-Masken;
//    (b) längster gemeinsamer Streckenabschnitt als Tokenfolge entlang der Fahrlinie (Token = Elementart +
//        relative Abbiegerichtung + Höhenwechsel, gleiche gerade Tokens hintereinander = ein Token), zyklisch,
//        gegen die Folge, ihr Spiegelbild und beide Fahrtrichtungen.
//    Kalibriert über alle Paare von Korpus-Strecken verschiedener Designer; Grenze = 95. Perzentil, höchstens
//    Jaccard 0,35 bzw. 6 Token (es gilt die strengere).
// Aufruf: node tools/sammlung_stil.mjs            → assets/sammlung_stil.json + Bericht auf der Konsole
//         node tools/sammlung_stil.mjs --kalib     → nur Kalibrierung (Verteilungen der Paar-Maße)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseTrk } from '../src/track/trk.js';
import { trkToLayout, placeAll } from '../src/track/trkimport.js';
import { KINDS, CODES } from '../src/track/trkelems.js';
import { pieceCells, PIECES } from '../src/track/pieces.js';
import '../src/track/pieces_trk.js';
import { TILE } from '../src/track/defs.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const POP_FILE = path.join(ROOT, 'trk_local', 'zak_popularity.json');
export const ABS_MAX = { jac: 0.35, lcs: 6 };      // absolute Obergrenzen (Regel 4)
export const MOTIF_MIN = { tracks: 5, designers: 3 };  // Regel 3

// ---------- Korpus laden (nur lokal) ----------
export function haveCorpus() { return fs.existsSync(POP_FILE); }
export function loadCorpus() {
  const pop = JSON.parse(fs.readFileSync(POP_FILE, 'utf8'));
  const out = [];
  for (const t of pop.tracks) {
    if (!t.file) continue;
    const f = path.join(ROOT, t.file);
    if (!fs.existsSync(f)) continue;
    const bytes = new Uint8Array(fs.readFileSync(f));
    const trk = parseTrk(bytes, t.file);
    const { layout } = trkToLayout(trk);
    out.push({ id: t.id, designer: t.designer, racers: t.racers || 0, rank: t.rank, name: t.name, file: t.file, raw: bytes, trk, layout });
  }
  return out;
}

// ---------- (a) Fahrbahnfelder als 30-Bit-Zeilen in 8 Lagen ----------
const M30 = 0x3FFFFFFF;
const ORIENT = [
  (i, j) => [i, j], (i, j) => [29 - j, i], (i, j) => [29 - i, 29 - j], (i, j) => [j, 29 - i],
  (i, j) => [29 - i, j], (i, j) => [j, i], (i, j) => [i, 29 - j], (i, j) => [29 - j, 29 - i],
];
function popcnt(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24; }
// Alle Felder, die ein Strecken-Element belegt (auch Füllfelder mehrteiliger Elemente; ohne Szenerie)
export function trackCells(trk) {
  const set = new Set();
  for (const pe of placeAll(trk).inst) for (const [i, j] of pe.cells) if (i >= 0 && j >= 0 && i < 30 && j < 30) set.add(j * 30 + i);
  return [...set].map((k) => [k % 30, (k / 30) | 0]);
}
function maskOf(cells) {
  const rows = new Uint32Array(30);
  let si = 0, sj = 0;
  for (const [i, j] of cells) { rows[j] = (rows[j] | (1 << i)) >>> 0; si += i; sj += j; }
  return { rows, n: cells.length, ci: si / Math.max(1, cells.length), cj: sj / Math.max(1, cells.length) };
}
export function masks(trk) {
  const cells = trackCells(trk);
  return ORIENT.map((f) => maskOf(cells.map(([i, j]) => f(i, j))));
}
// Größte Überdeckung (Jaccard) von A (Lage 0) mit B in allen 8 Lagen und Verschiebungen um den Schwerpunkt
export function maxJaccard(A, B) {
  const a = A[0];
  let best = 0;
  for (const b of B) {
    const dx0 = Math.round(a.ci - b.ci), dy0 = Math.round(a.cj - b.cj);
    for (let dy = dy0 - 3; dy <= dy0 + 3; dy++) {
      for (let dx = dx0 - 3; dx <= dx0 + 3; dx++) {
        if (dx >= 30 || dx <= -30) continue;
        let inter = 0;
        for (let r = Math.max(0, dy); r < Math.min(30, 30 + dy); r++) {
          let x = b.rows[r - dy];
          if (!x) continue;
          x = dx >= 0 ? (x << dx) & M30 : x >>> -dx;
          const y = a.rows[r] & x;
          if (y) inter += popcnt(y);
        }
        const j = inter / (a.n + b.n - inter);
        if (j > best) best = j;
      }
    }
  }
  return best;
}

// ---------- (b) Tokenfolge entlang der Fahrlinie ----------
// Elementart = Elementtyp der .TRK-Tabelle (Hochstraßen-, Brücken-, Dammrampe verschieden …); nur Start/Ziel zählt
// als Straße (liegt mitten in einer Geraden). Die gröbere Variante ('grob': alle Rampen = Rampe usw.) bleibt zum
// Vergleich; kalibriert und geprüft wird mit 'fein'.
export const KCLASS = { sf: 'road', solid: 'elev', span: 'elev', pobst: 'pipe', elramp: 'ramp', bramp: 'ramp', sramp: 'ramp' };
// Token-Art: 'grob' (Klassen oben) oder 'fein' (Elementart der .TRK-Tabelle, nur Start/Ziel = Straße)
export const TOKEN = { mode: 'fein' };
const FINE = { sf: 'road' };
export function pieceToken(p) {
  const cls = (TOKEN.mode === 'fein' ? FINE : KCLASS)[p.kind] || p.kind;
  let turn = 0;
  if (!PIECES[p.type].gap) {
    const nx = pieceCells(p.type, p.i, p.j, p.d, p.m || 1).next;
    const dd = (nx[2] - p.d + 4) % 4;
    turn = dd === 1 ? 1 : dd === 3 ? -1 : 0;
  }
  const dh = p.h1 - p.lvl > 0.25 ? 1 : p.h1 - p.lvl < -0.25 ? -1 : 0;
  const ch = p.kind === 'chicane' ? (p.m > 0 ? 1 : -1) : 0;
  return { cls, turn, dh, ch };
}
export const tokStr = (t) => `${t.cls}${t.turn ? (t.turn > 0 ? '>R' : '>L') : ''}${t.dh ? (t.dh > 0 ? '+' : '-') : ''}${t.ch ? (t.ch > 0 ? '~R' : '~L') : ''}`;
const straight = (t) => !t.turn && !t.dh;
// Folge der Tokens (zyklisch), gleiche gerade Tokens hintereinander zusammengefasst
export function pathTokens(layout) {
  const raw = layout.pieces.map(pieceToken);
  const out = [];
  for (const t of raw) {
    const last = out[out.length - 1];
    if (last && straight(t) && straight(last) && tokStr(t) === tokStr(last)) continue;
    out.push(t);
  }
  // zyklisch: Lauf über den Anfang hinweg ebenfalls zusammenfassen
  while (out.length > 1 && straight(out[0]) && tokStr(out[0]) === tokStr(out[out.length - 1])) out.pop();
  return out;
}
// Varianten: gespiegelt (links ↔ rechts), rückwärts gefahren (Reihenfolge umgekehrt, links ↔ rechts, hoch ↔ runter;
// die Schikane bleibt rückwärts „erst rechts“), beides
function variant(tokens, mirror, reverse) {
  let v = tokens.map((t) => ({ ...t, turn: mirror !== reverse ? -t.turn : t.turn, dh: reverse ? -t.dh : t.dh, ch: mirror ? -t.ch : t.ch }));
  if (reverse) v = v.reverse();
  return v;
}
const DICT = new Map();
const tokId = (t) => { const s = tokStr(t); if (!DICT.has(s)) DICT.set(s, DICT.size + 1); return DICT.get(s); };
export function tokenSets(layout) {
  const t = pathTokens(layout);
  return [[false, false], [true, false], [false, true], [true, true]].map(([m, r]) => Int32Array.from(variant(t, m, r), tokId));
}
// Längster gemeinsamer zusammenhängender Abschnitt zweier zyklischer Folgen (höchstens min(n, m) lang)
let dpA = new Int16Array(0), dpB = new Int16Array(0);
export function lcsCyclic(a, b) {
  const n = a.length, m = b.length, cap = Math.min(n, m);
  if (!n || !m) return 0;
  const M2 = 2 * m;
  if (dpA.length < M2 + 1) { dpA = new Int16Array(M2 + 1); dpB = new Int16Array(M2 + 1); }
  let prev = dpA, cur = dpB, best = 0;
  prev.fill(0, 0, M2 + 1);
  for (let i = 0; i < 2 * n; i++) {
    const x = a[i % n];
    cur[0] = 0;
    for (let j = 0; j < M2; j++) {
      if (b[j % m] === x) {
        let v = prev[j] + 1;
        if (v > cap) v = cap;
        cur[j + 1] = v;
        if (v > best) { best = v; if (best >= cap) return cap; }
      } else cur[j + 1] = 0;
    }
    const t = prev; prev = cur; cur = t;
  }
  return best;
}
// A (nur Lage 0 nötig) gegen alle 4 Varianten von B
export function maxLcs(A, B) {
  let best = 0;
  for (const b of B) { const v = lcsCyclic(A[0], b); if (v > best) best = v; }
  return best;
}
// 6er-Folgen (zyklisch) als Zahlen: Token-Ids < 64 → 36 Bit. „Gemeinsamer Abschnitt ≥ 6“ ⇔ gemeinsame 6er-Folge;
// damit prüft das Tor eine Kandidatin gegen beliebig viele Strecken in O(Länge) statt O(Länge²) je Strecke.
export const GRAM = 6;
export function grams(seq, n = GRAM) {
  const out = [], m = seq.length;
  if (m < n) return out;
  for (let k = 0; k < m; k++) { let g = 0; for (let q = 0; q < n; q++) g = g * 64 + (seq[(k + q) % m] & 63); out.push(g); }
  return out;
}
// Tor mit Gedächtnis: Korpus + angenommene Strecken. check() → { lcsOk, jac } (jac mit Abbruch über der Grenze)
export class Gate {
  constructor(limit) { this.limit = limit; this.grams = new Set(); this.fps = []; }
  add(fp) { for (const v of fp.t) for (const g of grams(v)) this.grams.add(g); this.fps.push(fp); }
  lcsOk(fp) { if (this.limit.lcs >= GRAM) throw new Error('Grenze ≥ 6: Zahlen-Set nur für 5'); for (const g of grams(fp.t[0])) if (this.grams.has(g)) return false; return true; }
  jacOk(fp) { for (const o of this.fps) if (maxJaccard(fp.m, o.m) > this.limit.jac) return false; return true; }
}

// Fingerabdruck einer Strecke fürs Tor: Masken (8 Lagen) + Tokenfolgen (4 Varianten)
export function fingerprint(trk, layout) {
  return { m: masks(trk), t: tokenSets(layout || trkToLayout(trk).layout) };
}
// Vergleich zweier Fingerabdrücke → { jac, lcs }
export function similarity(A, B) { return { jac: maxJaccard(A.m, B.m), lcs: maxLcs(A.t, B.t) }; }

const pct = (arr, p) => { const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
// Kalibrierung über alle Paare verschiedener Designer → Verteilungen + Grenzen
export function calibrate(corpus, log = () => {}) {
  const fps = corpus.map((c) => fingerprint(c.trk, c.layout));
  const J = [], L = [];
  const t0 = Date.now();
  for (let a = 0; a < corpus.length; a++) {
    for (let b = a + 1; b < corpus.length; b++) {
      if (corpus[a].designer === corpus[b].designer) continue;
      const s = similarity(fps[a], fps[b]);
      J.push(s.jac); L.push(s.lcs);
    }
    if (a % 50 === 0) log(`  Kalibrierung ${a}/${corpus.length} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
  const stat = (x) => ({ median: pct(x, 0.5), p95: pct(x, 0.95), p99: pct(x, 0.99), max: Math.max(...x) });
  const js = stat(J), ls = stat(L);
  return {
    pairs: J.length, jac: js, lcs: ls,
    limit: { jac: Math.min(js.p95, ABS_MAX.jac), lcs: Math.min(ls.p95, ABS_MAX.lcs) },
    fps,
  };
}

// ---------- Merkmale einer Strecke (Korpus und Sammlung gleich gemessen) ----------
// Stunt-Arten (für Abstände und Symbole): Looping, Korkenzieher, Wendel, Röhre (Abschnitt), Sprung
const STUNT_TOK = new Set(['loop', 'corklr', 'corkud', 'gap']);
const ELEV = new Set(['elev', 'solid', 'span', 'elcorner', 'spanroad']);
const SCEN_KINDS = ['palm', 'cactus', 'pine', 'tennis', 'gas', 'barn', 'office', 'windmill', 'ship', 'diner'];
// Zählmerkmale (Anzahl auf dem Fahrweg) → Namen im Modell
export const COUNT_KEYS = ['loop', 'corklr', 'corkud', 'pipe', 'tunnel', 'slalom', 'chicane', 'jump', 'hump', 'bridge', 'elev', 'hwy', 'bankC', 'bankR', 'sharp', 'large', 'elcorner', 'cross', 'overpass', 'split', 'slope'];
export function features(trk, layout, meters = null) {
  const P = layout.pieces;
  const toks = pathTokens(layout);
  const c = Object.fromEntries(COUNT_KEYS.map((k) => [k, 0]));
  let dirt = 0, icy = 0, n = 0, turnR = 0, turnL = 0, dhN = 0, maxLvl = 0;
  const runs = [], gaps = [];
  let run = 0, lastStunt = -1, pos = 0, firstStunt = -1;
  for (let k = 0; k < P.length; k++) {
    const p = P[k], kind = p.kind;
    const cells = PIECES[p.type].gap || PIECES[p.type].cells.length;
    if (kind !== 'gap') { n++; if (p.surf === 'dirt') dirt++; if (p.surf === 'icy') icy++; }
    maxLvl = Math.max(maxLvl, p.lvl, p.h1);
    const t = pieceToken(p);
    if (t.turn > 0) turnR++; if (t.turn < 0) turnL++;
    if (t.dh) dhN++;
    // gerade Straßenläufe (eben, ohne Sonderelement)
    if ((kind === 'road' || kind === 'sf') && !t.dh) run++; else { if (run) runs.push(run); run = 0; }
    if (kind === 'road' && t.dh) c.slope++;
    if (kind === 'loop') c.loop++;
    if (kind === 'corklr') c.corklr++;
    if (kind === 'corkud') c.corkud++;
    if (kind === 'pipeT' && p.into) c.pipe++;
    if (kind === 'tunnel') c.tunnel++;
    if (kind === 'slalom') c.slalom++;
    if (kind === 'chicane') c.chicane++;
    if (kind === 'gap') c.jump++;
    if (kind === 'hwyT' && p.into) c.hwy++;
    if (kind === 'bankC') c.bankC++;
    if (kind === 'bankR') c.bankR++;
    if (kind === 'sharp') c.sharp++;
    if (kind === 'large') c.large++;
    if (kind === 'elcorner') c.elcorner++;
    if (kind === 'cross') c.cross++;
    if (kind === 'spanroad') c.overpass++;
    if (kind === 'ssplit' || kind === 'lsplit') c.split++;
    if (ELEV.has(kind)) c.elev++;
    // Buckel: Rampe hoch, direkt Rampe runter (ohne Lücke)
    const nx = P[(k + 1) % P.length];
    if (KCLASS[kind] === 'ramp' && t.dh > 0 && nx && KCLASS[nx.kind] === 'ramp' && pieceToken(nx).dh < 0) c.hump++;
    // Brücke/Hochstraße: Rampe hoch, danach Hochstraße
    if (KCLASS[kind] === 'ramp' && t.dh > 0 && nx && ELEV.has(nx.kind)) c.bridge++;
    const isStunt = STUNT_TOK.has(kind) || (kind === 'pipeT' && p.into);
    if (isStunt) { if (lastStunt >= 0) gaps.push(pos - lastStunt); else firstStunt = pos; lastStunt = pos; }
    pos += cells;
  }
  if (run) runs.push(run);
  if (lastStunt >= 0 && firstStunt >= 0 && lastStunt !== firstStunt) gaps.push(pos - lastStunt + firstStunt);
  // Gelände + Szenerie
  let hill = 0, water = 0, scen = 0;
  const sk = Object.fromEntries(SCEN_KINDS.map((k) => [k, 0]));
  for (let k = 0; k < 900; k++) {
    const t = trk.terr[k];
    if (t >= 6) hill++;
    if (t >= 1 && t <= 5) water++;
    const e = CODES.get(trk.elem[k]);
    if (e && KINDS[e.kind].scenery && sk[e.kind] !== undefined) { scen++; sk[e.kind]++; }
  }
  const cells = trackCells(trk);
  let i0 = 30, i1 = -1, j0 = 30, j1 = -1;
  for (const [i, j] of cells) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  const bw = i1 - i0 + 1, bh = j1 - j0 + 1;
  return {
    elements: n, tokens: toks.length, meters, cells: cells.length, bboxW: Math.max(bw, bh), bboxH: Math.min(bw, bh),
    fill: cells.length / Math.max(1, bw * bh), counts: c, dirt: dirt / Math.max(1, n), icy: icy / Math.max(1, n),
    turnR, turnL, heightChanges: dhN, maxLvl, runs, stuntGaps: gaps, hill: hill / 900, water: water / 900,
    horizon: trk.horizon, scenery: scen, scenKinds: sk,
  };
}

// Gewichtete Quantile/Mittel
function wq(vals, ws, qs) {
  const idx = vals.map((v, k) => k).filter((k) => ws[k] > 0).sort((a, b) => vals[a] - vals[b]);
  const tot = idx.reduce((s, k) => s + ws[k], 0);
  return qs.map((q) => { let acc = 0; for (const k of idx) { acc += ws[k]; if (acc >= q * tot) return vals[k]; } return vals[idx[idx.length - 1]]; });
}
const wmean = (vals, ws) => { let s = 0, w = 0; vals.forEach((v, k) => { s += v * ws[k]; w += ws[k]; }); return s / Math.max(1e-9, w); };
const r3 = (x) => Math.round(x * 1000) / 1000;
function dist(vals, ws) {
  const [p10, p25, p50, p75, p90] = wq(vals, ws, [0.1, 0.25, 0.5, 0.75, 0.9]);
  const m = wmean(vals, ws);
  const sd = Math.sqrt(wmean(vals.map((v) => (v - m) * (v - m)), ws));
  return { mean: r3(m), sd: r3(sd), p10: r3(p10), p25: r3(p25), p50: r3(p50), p75: r3(p75), p90: r3(p90) };
}
// Histogramm (gewichtet, normiert) über ganzzahlige Werte, Rest in „max+“
function hist(lists, ws, max) {
  const h = new Array(max + 1).fill(0);
  let tot = 0;
  lists.forEach((l, k) => { for (const v of l) { h[Math.min(max, v)] += ws[k]; tot += ws[k]; } });
  return h.map((x) => r3(x / Math.max(1e-9, tot)));
}

// Muster-Zählung (Regel 3): Tokenfolge (als Strings) → { tracks, designers } über alle 4 Varianten
export function motifCounts(corpus, patterns) {
  const out = {};
  const seqs = corpus.map((c) => {
    const t = pathTokens(c.layout);
    return [[false, false], [true, false], [false, true], [true, true]].map(([m, r]) => variant(t, m, r).map(tokStr));
  });
  for (const [name, pat] of Object.entries(patterns)) {
    const tr = new Set(), des = new Set();
    corpus.forEach((c, k) => {
      for (const s of seqs[k]) {
        const n = s.length;
        let hit = false;
        for (let a = 0; a < n && !hit; a++) { let ok = true; for (let q = 0; q < pat.length && ok; q++) ok = s[(a + q) % n] === pat[q]; if (ok) hit = true; }
        if (hit) { tr.add(c.id); des.add(c.designer); break; }
      }
    });
    out[name] = { tracks: tr.size, designers: des.size, ok: tr.size >= MOTIF_MIN.tracks && des.size >= MOTIF_MIN.designers };
  }
  return out;
}

// Stil-Modell aus dem Korpus (nur Aggregate)
export function styleModel(corpus, feats) {
  const ws = corpus.map((c) => Math.max(1, c.racers));
  const F = (fn) => dist(feats.map(fn), ws);
  const counts = Object.fromEntries(COUNT_KEYS.map((k) => [k, F((f) => f.counts[k])]));
  // Anteil der Strecken (gewichtet) mit mindestens einem Element dieser Art
  const share = Object.fromEntries(COUNT_KEYS.map((k) => [k, r3(wmean(feats.map((f) => (f.counts[k] > 0 ? 1 : 0)), ws))]));
  const hor = [0, 0, 0, 0, 0, 0];
  feats.forEach((f, k) => { hor[f.horizon] += ws[k]; });
  const htot = hor.reduce((a, b) => a + b, 0);
  // Szenerie-Arten je Horizont (gewichtet, normiert)
  const scenByHorizon = {};
  for (let h = 0; h < 6; h++) {
    const acc = Object.fromEntries(SCEN_KINDS.map((s) => [s, 0]));
    let tot = 0;
    feats.forEach((f, k) => { if (f.horizon !== h) return; for (const s of SCEN_KINDS) { acc[s] += f.scenKinds[s] * ws[k]; tot += f.scenKinds[s] * ws[k]; } });
    if (tot > 0) scenByHorizon[h] = Object.fromEntries(SCEN_KINDS.map((s) => [s, r3(acc[s] / tot)]));
  }
  // Übergänge zwischen Token-Klassen (ohne Richtung/Höhe): nur Paare aus ≥ 5 Strecken von ≥ 3 Designern
  const bi = new Map();
  corpus.forEach((c, k) => {
    const t = pathTokens(c.layout).map((x) => x.cls);
    const seen = new Set();
    for (let a = 0; a < t.length; a++) {
      const key = t[a] + '>' + t[(a + 1) % t.length];
      if (!bi.has(key)) bi.set(key, { w: 0, tr: new Set(), des: new Set() });
      const e = bi.get(key);
      e.w += ws[k];
      if (!seen.has(key)) { seen.add(key); e.tr.add(c.id); e.des.add(c.designer); }
    }
  });
  const trans = {};
  let dropped = 0;
  for (const [key, e] of bi) {
    if (e.tr.size < MOTIF_MIN.tracks || e.des.size < MOTIF_MIN.designers) { dropped++; continue; }
    const [a, b] = key.split('>');
    (trans[a] = trans[a] || {})[b] = e.w;
  }
  for (const a of Object.keys(trans)) { const s = Object.values(trans[a]).reduce((x, y) => x + y, 0); for (const b of Object.keys(trans[a])) trans[a][b] = r3(trans[a][b] / s); }
  // Gelände je Horizont (gewichtete Mittel): Alpen hügeliger, Tropen nasser …
  const terrainByHorizon = {};
  for (let h = 0; h < 6; h++) {
    const ks = feats.map((f, k) => (f.horizon === h ? k : -1)).filter((k) => k >= 0);
    if (!ks.length) continue;
    terrainByHorizon[h] = { hill: r3(wmean(ks.map((k) => feats[k].hill), ks.map((k) => ws[k]))), water: r3(wmean(ks.map((k) => feats[k].water), ks.map((k) => ws[k]))), n: ks.length };
  }
  return {
    tracks: corpus.length, designers: new Set(corpus.map((c) => c.designer)).size, weights: 'Fahrer im Scoreboard (racers)', tile: TILE,
    terrainByHorizon,
    length: { elements: F((f) => f.elements), meters: F((f) => f.meters || 0), tokens: F((f) => f.tokens) },
    shape: { cells: F((f) => f.cells), bboxW: F((f) => f.bboxW), bboxH: F((f) => f.bboxH), fill: F((f) => f.fill), grid: F((f) => f.cells / 900) },
    counts, share,
    surface: { dirt: F((f) => f.dirt), icy: F((f) => f.icy), dirtShare: r3(wmean(feats.map((f) => (f.dirt > 0 ? 1 : 0)), ws)), icyShare: r3(wmean(feats.map((f) => (f.icy > 0 ? 1 : 0)), ws)) },
    turns: { rightShare: r3(wmean(feats.map((f) => f.turnR / Math.max(1, f.turnR + f.turnL)), ws)) },
    straightRuns: hist(feats.map((f) => f.runs), ws, 8),
    stuntGap: hist(feats.map((f) => f.stuntGaps), ws, 20),
    height: { changes: F((f) => f.heightChanges), level2Share: r3(wmean(feats.map((f) => (f.maxLvl >= 2 ? 1 : 0)), ws)) },
    terrain: { hill: F((f) => f.hill), water: F((f) => f.water), hillShare: r3(wmean(feats.map((f) => (f.hill > 0 ? 1 : 0)), ws)), waterShare: r3(wmean(feats.map((f) => (f.water > 0 ? 1 : 0)), ws)) },
    horizon: hor.map((x) => r3(x / htot)),
    scenery: { count: F((f) => f.scenery), byHorizon: scenByHorizon },
    transitions: trans, transitionsDropped: dropped,
  };
}

// Top 50 (nach Fahrern) gegen den Rest: ungewichtete Mittel ausgewählter Merkmale
export function topVsRest(corpus, feats, top = 50) {
  const order = corpus.map((c, k) => k).sort((a, b) => corpus[b].racers - corpus[a].racers);
  const T = new Set(order.slice(0, top));
  const rows = [
    ['Elemente', (f) => f.elements], ['Länge (m)', (f) => f.meters || 0], ['Felder belegt', (f) => f.cells], ['Box (lange Seite)', (f) => f.bboxW],
    ['Loopings', (f) => f.counts.loop], ['Korkenzieher (Rolle)', (f) => f.counts.corklr], ['Wendel', (f) => f.counts.corkud], ['Röhren', (f) => f.counts.pipe],
    ['Sprünge', (f) => f.counts.jump], ['Buckel', (f) => f.counts.hump], ['Tunnel-Felder', (f) => f.counts.tunnel], ['Slalom', (f) => f.counts.slalom],
    ['Schikanen', (f) => f.counts.chicane], ['Steilkurven', (f) => f.counts.bankC], ['Hochstraßen-Felder', (f) => f.counts.elev], ['Autobahnen', (f) => f.counts.hwy],
    ['Kurven eng', (f) => f.counts.sharp], ['Kurven weit', (f) => f.counts.large], ['Kreuzungen + Überführungen', (f) => f.counts.cross + f.counts.overpass],
    ['Höhenwechsel', (f) => f.heightChanges], ['Hügel-Anteil', (f) => f.hill], ['Wasser-Anteil', (f) => f.water], ['Szenerie', (f) => f.scenery],
    ['Schotter/Eis-Anteil', (f) => f.dirt + f.icy],
  ];
  const mean = (ks, fn) => ks.reduce((s, k) => s + fn(feats[k]), 0) / Math.max(1, ks.length);
  const sd = (ks, fn) => { const m = mean(ks, fn); return Math.sqrt(ks.reduce((s, k) => s + (fn(feats[k]) - m) ** 2, 0) / Math.max(1, ks.length - 1)); };
  const top50 = [...T], rest = order.filter((k) => !T.has(k));
  return rows.map(([name, fn]) => {
    const a = mean(top50, fn), b = mean(rest, fn);
    // Effektstärke (Unterschied in gepoolten Standardabweichungen) – ehrliche Einordnung „klein/verrauscht“
    const s = Math.sqrt((sd(top50, fn) ** 2 + sd(rest, fn) ** 2) / 2) || 1;
    return { name, top: r3(a), rest: r3(b), d: r3((a - b) / s) };
  });
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!haveCorpus()) { console.log('trk_local/zak_popularity.json fehlt – Stil-Analyse nur lokal möglich.'); process.exit(0); }
  const args = process.argv.slice(2);
  const t0 = Date.now();
  const corpus = loadCorpus();
  console.log(`Korpus: ${corpus.length} Strecken, ${new Set(corpus.map((c) => c.designer)).size} Designer (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  if (args.includes('--kalib')) {
    const k = calibrate(corpus, console.log);
    console.log(`Paare verschiedener Designer: ${k.pairs}`);
    console.log('Jaccard', k.jac, 'Token', k.lcs, 'Grenzen', k.limit, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    process.exit(0);
  }
  const { buildTrack } = await import('../src/track/build.js');
  const feats = corpus.map((c) => features(c.trk, c.layout, Math.round(buildTrack(c.layout, { treeCount: 0 }).line.total)));
  const model = styleModel(corpus, feats);
  // Formbausteine des Generators gegen den Korpus prüfen (Regel 3)
  const { MOTIFS } = await import('../src/track/trkgen.js').catch(() => ({ MOTIFS: {} }));
  model.motifs = motifCounts(corpus, MOTIFS || {});
  const tvr = topVsRest(corpus, feats);
  model.topVsRest = tvr;
  model.created = new Date().toISOString().slice(0, 10);
  const outFile = path.join(ROOT, 'assets', 'sammlung_stil.json');
  fs.writeFileSync(outFile, JSON.stringify(model, null, 1) + '\n');
  console.log(`→ ${path.relative(ROOT, outFile)} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log('\nWas beliebte Strecken ausmachen – Top 50 (nach Fahrern) gegen den Rest (Mittelwerte, d = Effektstärke):');
  console.log('| Merkmal | Top 50 | Rest | d |\n|---|---|---|---|');
  for (const r of tvr) console.log(`| ${r.name} | ${r.top} | ${r.rest} | ${r.d > 0 ? '+' : ''}${r.d} |`);
  console.log('\nMuster (Regel 3):');
  for (const [k, v] of Object.entries(model.motifs)) console.log(`  ${v.ok ? '✅' : '❌'} ${k.padEnd(18)} ${v.tracks} Strecken, ${v.designers} Designer`);
  console.log(`\nÜbergänge: ${Object.values(model.transitions).reduce((s, o) => s + Object.keys(o).length, 0)} erlaubt, ${model.transitionsDropped} verworfen (< ${MOTIF_MIN.tracks} Strecken oder < ${MOTIF_MIN.designers} Designer)`);
}
