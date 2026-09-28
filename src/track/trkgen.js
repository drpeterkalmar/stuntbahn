// Generator für eigene .TRK-Strecken der „Sammlung“ im Stil der Stunts-Wettbewerbe.
// Seed + Stil-Modell (assets/sammlung_stil.json: nur Häufigkeiten/Verteilungen aus dem Korpus) → echte .TRK-Bytes
// über den TrackDesigner. Der Generator startet nie von einer fremden Strecke: die Form entsteht allein aus dem Seed.
//  1) Skelett: geschlossener Weg über das 30×30-Raster – eine „Schildkröte“ läuft gerade Stücke und Kurven,
//     darf eigene Geraden rechtwinklig kreuzen, A* schließt den Rundkurs. Nicht benachbarte Wegfelder berühren
//     sich nie (Platz für 2×2-Elemente, Gelände, Szenerie).
//  2) Belegung: Kreuzung oder Überführung, Hochstraßen/Brücken (Rampen, Wendel), Kurvenarten (eng, weit,
//     Steilkurve mit Übergängen, Schikane), Hügel-Abschnitte (Hang hoch/runter), gerade Bausteine (Looping,
//     Korkenzieher, Röhre, Autobahn, Tunnel, Slalom, Sprung, Buckel, Steilstraße) nach den Häufigkeiten des Modells.
//  3) Gelände aus Eckhöhen (Hügel mit Hängen, ohne Sattel) + Wasser mit Uferecken, 4) Szenerie passend zum Horizont.
// Deterministisch je (Seed, Modell). Reines JS ohne DOM.
import { rng } from '../core/util.js';
import { TrackDesigner } from './trkdesign.js';
import { TERRAIN } from './trkelems.js';

// Formbausteine als Tokenfolgen (wie tools/sammlung_stil.mjs misst). Die Stil-Analyse zählt jeden im Korpus;
// nur Bausteine aus ≥ 5 Strecken von ≥ 3 Designern (Regel 3) nutzt der Generator (style.motifs[name].ok).
export const MOTIFS = {
  sprung: ['ramp+', 'gap', 'ramp-'],
  buckel: ['ramp+', 'ramp-'],
  roehre: ['pipeT', 'pipe', 'pipeT'],
  autobahn: ['hwyT', 'hwy', 'hwyT'],
  steilkurve: ['bankT', 'bankC>R', 'bankT'],
  steilkurve2: ['bankT', 'bankC>R', 'bankC>R', 'bankT'],
  steilkurveR: ['bankT', 'bankR', 'bankC>R', 'bankT'],
  steilstrasse: ['bankT', 'bankR', 'bankT'],
  hochstrasse: ['ramp+', 'elev', 'ramp-'],
  hochkurve: ['elev', 'elcorner>R', 'elev'],
  rampenkurve: ['ramp+', 'elcorner>R'],
  ueberfuehrung: ['ramp+', 'spanroad', 'ramp-'],
  wendelHoch: ['corkud+', 'elev'],
  wendelRunter: ['elev', 'corkud-'],
  huegel: ['road+', 'road'],
  huegelRunter: ['road', 'road-'],
  sKurve: ['sharp>R', 'sharp>L'],
  kreuzung: ['road', 'cross', 'road'],
};

const N = 30;
const D = [[1, 0], [0, 1], [-1, 0], [0, -1]];          // E S W N (wie DIRS in defs.js)
const K = (i, j) => j * N + i;
const inG = (i, j, m = 0) => i >= m && j >= m && i < N - m && j < N - m;
const RIGHT = (d) => (d + 1) & 3, LEFT = (d) => (d + 3) & 3;

// Wörter für Namen (eigene, Stil wie trackName in generator.js). Adjektiv-Stamm + Endung nach Geschlecht.
const ADJ = ['Wild', 'Donnernd', 'Flink', 'Kühn', 'Rasend', 'Schwindelnd', 'Golden', 'Tollkühn', 'Brausend', 'Sausend', 'Verwegen',
  'Heulend', 'Rostig', 'Staubig', 'Glühend', 'Frech', 'Stürmisch', 'Silbern', 'Wirbelnd', 'Launisch', 'Kantig', 'Neblig', 'Knifflig',
  'Tosend', 'Luftig', 'Steil', 'Zackig', 'Lang', 'Kurz', 'Verdreht', 'Blau', 'Rot', 'Grün', 'Eisig', 'Sonnig', 'Wackelig',
  'Mutig', 'Übermütig', 'Schlau', 'Grimmig', 'Munter', 'Heimlich', 'Hohl', 'Zornig', 'Flatternd', 'Gewagt'];
const NOUN = [
  ['Schleife', 'f'], ['Talfahrt', 'f'], ['Kurvenhatz', 'f'], ['Achterbahn', 'f'], ['Stuntmeile', 'f'], ['Pistenjagd', 'f'],
  ['Hügelhatz', 'f'], ['Flugschanze', 'f'], ['Ringfahrt', 'f'], ['Wirbelbahn', 'f'], ['Kesseljagd', 'f'], ['Sprungmeile', 'f'],
  ['Brückenhatz', 'f'], ['Uferpiste', 'f'], ['Hangpartie', 'f'], ['Schikane', 'f'], ['Rennpiste', 'f'], ['Kiesgrube', 'f'],
  ['Kurvenkette', 'f'], ['Rampenjagd', 'f'], ['Seerunde', 'f'], ['Talsperre', 'f'],
  ['Wirbel', 'm'], ['Ritt', 'm'], ['Sprung', 'm'], ['Kreisel', 'm'], ['Parcours', 'm'], ['Hüpfer', 'm'], ['Kurs', 'm'],
  ['Korkenzieher', 'm'], ['Steilhang', 'm'], ['Rundkurs', 'm'], ['Brummer', 'm'], ['Hochweg', 'm'], ['Damm', 'm'], ['Graben', 'm'],
  ['Rennsteig', 'm'], ['Looping', 'm'], ['Tunnelblick', 'm'], ['Uferweg', 'm'],
  ['Rennen', 'n'], ['Kreuz', 'n'], ['Karussell', 'n'], ['Labyrinth', 'n'], ['Rodeo', 'n'], ['Gewitter', 'n'], ['Hochplateau', 'n'],
  ['Wettrennen', 'n'], ['Stuntfestival', 'n'], ['Viadukt', 'n'], ['Hindernis', 'n'], ['Manöver', 'n'],
];
const END = { f: 'e', m: 'er', n: 'es' };
// n-te Namensvariante eines Seeds (Build nimmt die erste freie, die nicht zu nah an einem Original liegt)
export function trkName(seed, variant = 0) {
  const r = rng((seed >>> 0) * 7331 + 17 + variant * 104729);
  const [noun, g] = r.pick(NOUN);
  return r.pick(ADJ) + END[g] + ' ' + noun;
}

// ---------- kleine Helfer ----------
function wpick(r, entries) {           // [[wert, gewicht], …]
  let tot = 0;
  for (const [, w] of entries) tot += Math.max(0, w);
  if (tot <= 0) return entries.length ? entries[0][0] : null;
  let x = r() * tot;
  for (const [v, w] of entries) { x -= Math.max(0, w); if (x <= 0) return v; }
  return entries[entries.length - 1][0];
}
// Wert aus Quantilen des Modells ziehen (p10 … p90, linear dazwischen, Ränder leicht erweitert)
function fromQ(r, q) {
  const pts = [[0, q.p10 - (q.p25 - q.p10) * 0.6], [0.1, q.p10], [0.25, q.p25], [0.5, q.p50], [0.75, q.p75], [0.9, q.p90], [1, q.p90 + (q.p90 - q.p75) * 0.6]];
  const u = r();
  for (let k = 1; k < pts.length; k++) if (u <= pts[k][0]) { const [a, va] = pts[k - 1], [b, vb] = pts[k]; return va + (vb - va) * (u - a) / (b - a); }
  return q.p90;
}

// Binärer Heap für A*
class Heap {
  constructor() { this.a = []; }
  push(x, p) { const a = this.a; a.push([p, x]); let i = a.length - 1; while (i > 0) { const q = (i - 1) >> 1; if (a[q][0] <= a[i][0]) break; [a[q], a[i]] = [a[i], a[q]]; i = q; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, rr = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (rr < a.length && a[rr][0] < a[m][0]) m = rr; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top[1];
  }
  get size() { return this.a.length; }
}

// =====================================================================================================
// 1) Skelett
// =====================================================================================================
function trySkeleton(r, P) {
  const M = 1;
  const occ = new Int16Array(N * N).fill(-1);
  const path = [];
  const moves = [];
  const push = (i, j, din) => {
    const k = K(i, j), idx = path.length;
    if (idx && path[idx - 1].dout < 0) path[idx - 1].dout = din;   // Vorgänger fährt hierher
    path.push({ i, j, din, dout: -1, cross: -1 });
    if (occ[k] < 0) occ[k] = idx; else { path[occ[k]].cross = idx; path[idx].cross = occ[k]; }
  };
  const pop = () => {
    const c = path.pop();
    if (c.cross >= 0) path[c.cross].cross = -1; else occ[K(c.i, c.j)] = -1;
  };
  const d0 = r.int(4);
  const i0 = 5 + r.int(20), j0 = 5 + r.int(20);
  push(i0, j0, d0);
  // gerader Lauf ab Kopf h: Zellen oder null. Kreuzen erlaubt (nur mitten im Lauf, rechtwinklig über gerade Zellen)
  const runPlan = (h, dir, L, crossOK) => {
    const cells = [], keys = [];
    let x = h.i, y = h.j;
    for (let s = 0; s < L; s++) { x += D[dir][0]; y += D[dir][1]; if (!inG(x, y, M)) return null; cells.push([x, y]); keys.push(K(x, y)); }
    const hk = K(h.i, h.j);
    for (let s = 0; s < L; s++) {
      const [cx, cy] = cells[s], k = keys[s];
      if (occ[k] >= 0) {
        if (!crossOK || s === 0 || s === L - 1) return null;
        const pi = occ[k], p = path[pi];
        if (pi < 2 || pi >= path.length - 2 || p.cross >= 0 || p.din !== p.dout || (p.din & 1) === (dir & 1)) return null;
        const pp = path[pi - 1], pn = path[pi + 1];
        if (pp.din !== pp.dout || pn.din !== pn.dout || pp.cross >= 0 || pn.cross >= 0) return null;
        continue;
      }
      for (const [dx, dy] of D) {
        const qx = cx + dx, qy = cy + dy;
        if (!inG(qx, qy)) continue;
        const q = K(qx, qy);
        if (occ[q] < 0) continue;
        if (s === 0 && q === hk) continue;
        if (s > 0 && q === keys[s - 1]) continue;       // Kreuzungszelle direkt davor
        if (s < L - 1 && q === keys[s + 1]) continue;   // Kreuzungszelle direkt dahinter
        return null;
      }
    }
    return cells;
  };
  const target = P.cells;
  const turtleLen = Math.round(target * (0.6 + 0.2 * r()));
  const first = runPlan(path[0], d0, 3 + r.int(3), false);
  if (!first) return null;
  path[0].dout = d0;
  for (const [x, y] of first) push(x, y, d0);
  moves.push(first.length);
  let steps = 0, jog = 0;
  const rot = r() < 0.5 ? 1 : -1;       // bevorzugter Drehsinn (Rundkurs), nur leicht
  while (path.length < turtleLen) {
    if (++steps > 600) return null;
    const h = path[path.length - 1];
    const late = Math.max(0, (path.length / turtleLen - 0.45) / 0.55);
    let best = null, bs = -1e9;
    // gezielt kreuzen (Achterschleife, Überführung): alle Läufe prüfen, die rechtwinklig über eine eigene Gerade führen
    if (!jog && path.length > 12 && r() < P.crossP) {
      const xs = [];
      for (const t of [1, -1]) for (let L = 3; L <= 11; L++) {
        const dir = t > 0 ? RIGHT(h.din) : LEFT(h.din);
        const cells = runPlan(h, dir, L, true);
        if (cells && cells.some(([x, y]) => occ[K(x, y)] >= 0)) xs.push({ t, L, dir, cells });
      }
      if (xs.length) best = xs[r.int(xs.length)];
    }
    for (let q = 0; q < 12 && !best; q++) {
      const t = jog ? -jog : (r() < 0.5 + 0.08 * rot ? 1 : -1);
      let L;
      if (jog) L = 2 + r.int(4);
      else if (r() < P.jogP) L = 1;
      else L = Math.max(2, Math.round(fromQ(r, P.run)));
      const dir = t > 0 ? RIGHT(h.din) : LEFT(h.din);
      const cells = runPlan(h, dir, L, r() < P.crossP);
      if (!cells) continue;
      const [ex, ey] = cells[cells.length - 1];
      let space = 0;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = ex + dx + D[dir][0] * 2, y = ey + dy + D[dir][1] * 2; if (inG(x, y, 1) && occ[K(x, y)] < 0) space++; }
      const home = Math.abs(ex - i0) + Math.abs(ey - j0);
      const crossed = cells.some(([x, y]) => occ[K(x, y)] >= 0);
      const sc = r() * 1.2 + space / 49 * 1.1 - late * home / 18 * 1.6 + (crossed ? 1.2 : 0) + (t === rot ? 0.1 : 0);
      if (sc > bs) { bs = sc; best = { t, L, dir, cells }; }
    }
    if (!best) {
      // zurücknehmen
      if (moves.length <= 1) return null;
      const n = moves.pop();
      for (let q = 0; q < n; q++) pop();
      path[path.length - 1].dout = -1;
      jog = 0;
      continue;
    }
    h.dout = best.dir;
    for (const [x, y] of best.cells) push(x, y, best.dir);
    moves.push(best.cells.length);
    jog = best.L === 1 && !jog ? best.t : 0;
  }
  if (jog) { const n = moves.pop(); for (let q = 0; q < n; q++) pop(); path[path.length - 1].dout = -1; }
  // Schluss per A*: vom Kopf zum Feld vor dem Start, dann in Startrichtung hinein
  for (let tries = 0; tries < 4; tries++) {
    const done = closeLoop(path, occ, d0, P);
    if (done) {
      for (const c of done) push(c.i, c.j, c.din);
      for (let k = 0; k < path.length - 1; k++) if (path[k].dout < 0) path[k].dout = path[k + 1].din;
      path[path.length - 1].dout = d0;
      if (checkPath(path)) return { path, d0 };
      return null;
    }
    if (moves.length <= 2) return null;
    const n = moves.pop();
    for (let q = 0; q < n; q++) pop();
    path[path.length - 1].dout = -1;
  }
  return null;
}

// A*: Kopf (letzte Zelle) → Zelle vor dem Start; Knoten = Zelle × Einfahrtsrichtung × „letzter Zug war Kurve“
function closeLoop(path, occ, d0, P) {
  const h = path[path.length - 1], s = path[0];
  const pi = s.i - D[d0][0], pj = s.j - D[d0][1];
  if (!inG(pi, pj, 1) || occ[K(pi, pj)] >= 0) return null;
  const hk = K(h.i, h.j), sk = K(s.i, s.j);
  const okCell = (i, j, from) => {
    if (!inG(i, j, 1) || occ[K(i, j)] >= 0) return false;
    for (const [dx, dy] of D) {
      const x = i + dx, y = j + dy;
      if (!inG(x, y)) continue;
      const q = K(x, y);
      if (occ[q] < 0 || q === from) continue;
      if (q === sk && i === pi && j === pj) continue;
      return false;
    }
    return true;
  };
  const id = (k, d, lt) => (k * 4 + d) * 2 + lt;
  const g = new Float32Array(900 * 8).fill(1e9), prev = new Int32Array(900 * 8).fill(-1);
  const heap = new Heap();
  const st = id(hk, h.din, 0);
  g[st] = 0;
  heap.push(st, 0);
  let goal = -1, exp = 0;
  while (heap.size && exp < 30000) {
    const u = heap.pop();
    exp++;
    const lt = u & 1, d = (u >> 1) & 3, k = u >> 3;
    const ci = k % N, cj = (k / N) | 0;
    if (ci === pi && cj === pj && k !== hk) {
      if (((d0 - d + 4) & 3) !== 2) { goal = u; break; }
      continue;
    }
    for (const t of [0, 1, -1]) {
      const nd = t === 0 ? d : t > 0 ? RIGHT(d) : LEFT(d);
      // Kopf darf abbiegen; sonst keine Kurve direkt nach einer Kurve (außer Gegenkurve = S-Kurve)
      const ni = ci + D[nd][0], nj = cj + D[nd][1];
      if (!okCell(ni, nj, k)) continue;
      const cost = 1 + (t ? P.turnCost : 0) + (t && lt ? P.turnCost * 1.5 : 0);
      const v = id(K(ni, nj), nd, t ? 1 : 0);
      const ng = g[u] + cost;
      if (ng < g[v]) { g[v] = ng; prev[v] = u; heap.push(v, ng + Math.abs(ni - pi) + Math.abs(nj - pj)); }
    }
  }
  if (goal < 0) return null;
  const out = [];
  for (let u = goal; u !== st; u = prev[u]) { const k = u >> 3; out.push({ i: k % N, j: (k / N) | 0, din: (u >> 1) & 3 }); }
  out.reverse();
  return out;
}

// Weg prüfen: Nachbarschaft (nur aufeinanderfolgende Felder berühren sich), Kreuzungen rechtwinklig über Geraden
function checkPath(path) {
  const n = path.length;
  const at = new Map();
  for (let k = 0; k < n; k++) { const c = path[k]; const q = K(c.i, c.j); if (!at.has(q)) at.set(q, []); at.get(q).push(k); }
  for (let k = 0; k < n; k++) {
    const c = path[k], nx = path[(k + 1) % n];
    if (nx.i !== c.i + D[c.dout][0] || nx.j !== c.j + D[c.dout][1] || nx.din !== c.dout) return false;
    if (((c.dout - c.din + 4) & 3) === 2) return false;
  }
  const near = (a, b) => { const d = Math.abs(a - b); return Math.min(d, n - d) <= 1; };
  for (let k = 0; k < n; k++) {
    const c = path[k], same = at.get(K(c.i, c.j));
    if (same.length > 2) return false;
    if (same.length === 2) {
      const o = path[same[0] === k ? same[1] : same[0]];
      if (c.din !== c.dout || o.din !== o.dout || (c.din & 1) === (o.din & 1)) return false;
    }
    for (const [dx, dy] of D) {
      const l = at.get(K(c.i + dx, c.j + dy));
      if (!l) continue;
      for (const b of l) {
        if (near(k, b)) continue;
        // Nachbar einer Kreuzung auf dem jeweils anderen Durchgang
        const cr = same.length === 2 ? (same[0] === k ? same[1] : same[0]) : -1;
        if (cr >= 0 && near(cr, b)) continue;
        const lb = at.get(K(path[b].i, path[b].j));
        if (lb.length === 2) { const ob = lb[0] === b ? lb[1] : lb[0]; if (near(ob, k)) continue; }
        return false;
      }
    }
  }
  return true;
}

// =====================================================================================================
// 2) Belegung
// =====================================================================================================
// Rampen- und Hochstraßen-Arten (Häufigkeit grob wie im Korpus); je Ende und Feld unabhängig gewürfelt
const RAMPS = [['bramp', 0.5], ['elramp', 0.28], ['sramp', 0.22]];
const DECKS = [['elev', 0.55], ['span', 0.25], ['solid', 0.2]];

function assign(r, sk, P) {
  const path = sk.path, n = path.length;
  const mod = (k) => ((k % n) + n) % n;
  const at = (k) => path[mod(k)];
  const isTurn = (k) => at(k).din !== at(k).dout;
  const turnOf = (k) => { const c = at(k); return c.dout === RIGHT(c.din) ? 1 : c.dout === LEFT(c.din) ? -1 : 0; };
  const own = new Int16Array(n).fill(-1);
  const zone = new Int8Array(n);            // 0 Boden, 1 Hügel (Plateau), 2 Hochstraße
  const grid = new Int8Array(900);          // 1 Wegfeld, 2 Fußabdruck-Zusatzfeld
  for (const c of path) grid[K(c.i, c.j)] = 1;
  const items = [];
  const isFree = (k, len = 1) => { for (let q = 0; q < len; q++) if (own[mod(k + q)] >= 0) return false; return true; };
  const straightFree = (k) => !isTurn(k) && own[mod(k)] < 0 && at(k).cross < 0;
  const claim = (k, len, it, extra = []) => {
    it.k = mod(k); it.len = len; it.extra = extra;
    const idn = items.length;
    items.push(it);
    for (let q = 0; q < len; q++) own[mod(k + q)] = idn;
    for (const [x, y] of extra) grid[K(x, y)] = 2;
    return it;
  };
  const cellFree = (x, y) => inG(x, y) && grid[K(x, y)] === 0;
  // Nachbarfelder eines Wegfelds: vorn, rechts, links
  const side = (k, s2) => { const c = at(k), d = s2 === 0 ? c.din : s2 > 0 ? RIGHT(c.din) : LEFT(c.din); return [c.i + D[d][0], c.j + D[d][1], d, k]; };
  const stubList = [];
  const stubs = (cells) => { if (!cells.every(([x, y]) => cellFree(x, y))) return false; for (const c of cells) { grid[K(c[0], c[1])] = 3; stubList.push(c); } return true; };
  const cnt = {};
  const count = (k, v = 1) => { cnt[k] = (cnt[k] || 0) + v; };

  // Start/Ziel
  claim(0, 1, { kind: 'sf' });

  // --- weite Kurve an Kurvenfeld k möglich? → Innenfeld
  const innerOf = (k) => {
    const a = at(k - 1), b = at(k), c = at(k + 1);
    return [a.i + c.i - b.i, a.j + c.j - b.j];
  };
  const largeOK = (k) => {
    if (!isTurn(k) || own[mod(k)] >= 0) return false;
    if (!straightFree(k - 1) || !straightFree(k + 1)) return false;
    const [x, y] = innerOf(k);
    return cellFree(x, y);
  };

  // --- Hochstraßen-Abschnitt s..e (inklusive): Rampen/Wendel an den Enden, Hochstraße, Hochkurven, Überführung
  const elevPlan = (s, e, forceOver = -1) => {
    const len = mod(e - s) + 1;
    if (len < 3 || len > P.elevMax) return null;
    for (let q = 0; q < len; q++) { const k = mod(s + q); if (own[k] >= 0 || k === 0) return null; }
    if (isTurn(s) || isTurn(e) || at(s).cross >= 0 || at(e).cross >= 0) return null;
    const plan = [];
    let q = 1;
    while (q < len - 1) {
      const k = mod(s + q);
      if (isTurn(k)) return null;
      if (at(k).cross >= 0) {
        // nur die Kreuzung, für die der Abschnitt gebaut wird (andere Kreuzungen regelt ihr eigener Durchgang)
        if (k !== forceOver) return null;
        const o = at(k).cross;
        if (zone[o] === 2 || own[o] >= 0) return null;
        plan.push({ q, kind: 'over' }); q++; continue;
      }
      // Hochkurve: gerade – Kurve – gerade, Innenfeld frei, ganz im Abschnitt
      if (q + 2 < len - 1 && isTurn(mod(k + 1)) && !isTurn(mod(k + 2)) && at(k + 2).cross < 0) {
        const [x, y] = innerOf(k + 1);
        if (!cellFree(x, y)) return null;
        plan.push({ q, kind: 'elcorner', turn: turnOf(k + 1), inner: [x, y] }); q += 3; continue;
      }
      if (isTurn(mod(k + 1))) return null;
      plan.push({ q, kind: 'straight' }); q++;
    }
    if (forceOver >= 0 && !plan.some((p) => p.kind === 'over' && mod(s + p.q) === forceOver)) return null;
    return plan;
  };
  const elevBuild = (s, e, plan) => {
    const len = mod(e - s) + 1;
    const rUp = wpick(r, RAMPS), rDown = r() < 0.55 ? rUp : wpick(r, RAMPS);
    let deck = wpick(r, DECKS);
    // Wendel statt Rampe (2 Felder + 2 freie Seitenfelder), wenn Platz
    const cork = (k, up) => {
      if (r() > P.corkP || len < 5) return null;
      const k2 = up ? k : mod(k - 1);
      if (isTurn(k2) || isTurn(mod(k2 + 1)) || at(k2).cross >= 0 || at(k2 + 1).cross >= 0) return null;
      if (!plan.some((p) => p.kind === 'straight' && mod(s + p.q) === (up ? mod(k + 1) : k2))) return null;
      const c0 = at(k2), c1 = at(k2 + 1), d = c0.dout;
      // Kreis rechts oder links der Fahrtrichtung; Händigkeit R = Kreis rechts beim Hochfahren, links beim Runterfahren
      for (const side of r() < 0.5 ? [1, -1] : [-1, 1]) {
        const sd = side > 0 ? RIGHT(d) : LEFT(d);
        const ex = [[c0.i + D[sd][0], c0.j + D[sd][1]], [c1.i + D[sd][0], c1.j + D[sd][1]]];
        if (ex.every(([x, y]) => cellFree(x, y))) return { k: k2, chir: up ? side : -side, ex };
      }
      return null;
    };
    const cu = cork(s, true), cd = cu ? null : cork(e, false);
    for (let q = 0; q < len; q++) zone[mod(s + q)] = 2;
    if (cu) { claim(cu.k, 2, { kind: 'corkud', up: true, chir: cu.chir > 0 ? 'R' : 'L' }, cu.ex); count('corkud'); }
    else claim(s, 1, { kind: rUp, up: true });
    for (const p of plan) {
      const k = mod(s + p.q);
      if (own[k] >= 0) continue;
      if (p.kind === 'over') { claim(k, 1, { kind: 'spanroad', over: true }); count('overpass'); }
      else if (p.kind === 'elcorner') { claim(k, 3, { kind: 'elcorner', turn: p.turn > 0 ? 'R' : 'L' }, [p.inner]); count('elcorner'); }
      else { if (r() < 0.15) deck = wpick(r, DECKS); claim(k, 1, { kind: deck }); }
    }
    if (cd) { if (own[cd.k] < 0 && own[mod(cd.k + 1)] < 0) { claim(cd.k, 2, { kind: 'corkud', up: false, chir: cd.chir > 0 ? 'R' : 'L' }, cd.ex); count('corkud'); } else return false; }
    else claim(e, 1, { kind: rDown, up: false });
    count('bridge');
    return true;
  };

  // --- Kreuzungen: Überführung (ein Durchgang als Hochstraße) oder ebene Kreuzung
  for (let k = 0; k < n; k++) {
    const c = path[k];
    if (c.cross < 0 || c.cross < k) continue;
    const q = c.cross;
    let done = false;
    if (r() < P.overP) {
      for (const u of r() < 0.5 ? [k, q] : [q, k]) {
        const o = u === k ? q : k;
        // Abschnitt um u: mindestens Rampe – Überführung – Rampe, zufällig verlängert
        for (let tries = 0; tries < 6 && !done; tries++) {
          const a = 1 + (tries < 3 ? r.int(3) : 0), b = 1 + (tries < 3 ? r.int(3) : 0);
          const s = mod(u - a), e = mod(u + b);
          const plan = elevPlan(s, e, u);
          if (!plan) continue;
          zone[o] = 0;
          claim(o, 1, { kind: 'pass' });
          if (!elevBuild(s, e, plan)) return null;
          done = true;
        }
        if (done) break;
      }
    }
    if (!done) {
      if (own[k] >= 0 || own[q] >= 0) return null;
      claim(k, 1, { kind: 'cross' }); claim(q, 1, { kind: 'pass' });
      count('cross');
    }
  }
  // Unterführung: der untere Durchgang ist das Element an der ersten Stelle im Weg (Element nur einmal legen)
  for (const it of items) {
    if (it.kind !== 'spanroad') continue;
    const o = path[it.k].cross;
    if (o < it.k) { const lower = items[own[o]]; lower.kind = 'spanroad'; lower.over = false; it.kind = 'pass'; }
  }

  // --- weitere Hochstraßen/Brücken
  const nBridge = Math.round(fromQ(r, P.q.bridge) * P.intensity * 1.0 + 0.3);
  for (let b = 0, tries = 0; b < nBridge && tries < 40; tries++) {
    let best = null;
    for (let w = 0; w < 6; w++) {
      const s = 1 + r.int(n - 2), len = 3 + r.int(Math.max(1, P.elevMax - 3));
      const e = mod(s + len - 1);
      const plan = elevPlan(s, e);
      if (!plan) continue;
      const corners = plan.filter((p) => p.kind === 'elcorner').length;
      if (!best || corners > best.corners) best = { s, e, plan, corners };
    }
    tries += 5;
    if (!best) continue;
    if (!elevBuild(best.s, best.e, best.plan)) return null;
    b++;
  }

  // --- Kurven: Schikane (S-Kurve), Steilkurve (mit Übergängen, ggf. doppelt/Steilstraße), weit, eng
  const turns = [];
  for (let k = 1; k < n; k++) if (isTurn(k) && own[k] < 0) turns.push(k);
  for (let a = turns.length - 1; a > 0; a--) { const b = r.int(a + 1); [turns[a], turns[b]] = [turns[b], turns[a]]; }
  const W = P.turnW;
  for (const k of turns) {
    if (own[k] >= 0) continue;
    const t = turnOf(k);
    // S-Kurve: zwei Gegenkurven hintereinander
    if (isTurn(k + 1) && own[mod(k + 1)] < 0 && turnOf(k + 1) === -t && r() < P.chicaneP) {
      const b = at(k), c = at(k + 1);
      // Variante 1: gerade Zelle davor; Variante 2: gerade Zelle danach
      if (straightFree(k - 1)) {
        const a = at(k - 1), fx = a.i + c.i - b.i, fy = a.j + c.j - b.j;
        if (cellFree(fx, fy)) { claim(k - 1, 3, { kind: 'chicane', chir: t > 0 ? 'R' : 'L' }, [[fx, fy]]); count('chicane'); continue; }
      }
      if (straightFree(k + 2)) {
        const d = at(k + 2), fx = d.i - (c.i - b.i), fy = d.j - (c.j - b.j);
        if (cellFree(fx, fy)) { claim(k, 3, { kind: 'chicane', chir: t > 0 ? 'R' : 'L' }, [[fx, fy]]); count('chicane'); continue; }
      }
    }
    const large = largeOK(k);
    const bank = large && straightFree(k - 2) && straightFree(k + 2) && !(own[mod(k - 2)] >= 0) && P.banks;
    const choice = wpick(r, [['sharp', W.sharp], ['large', large ? W.large : 0], ['bank', bank ? W.bank : 0], ['split', W.split]]);
    if (choice === 'split' && stubs([side(k, 0), side(k, -t)])) {
      claim(k, 1, { kind: 'ssplit', lane: 'b', turn: t > 0 ? 'R' : 'L', chir: r() < 0.5 ? 'R' : 'L' });
      count('split');
      continue;
    }
    if (choice === 'bank') {
      const side = t > 0 ? -1 : 1;
      const [ix, iy] = innerOf(k);
      // Doppel-Steilkurve (180°): nächste Kurve gleich gerichtet, ihr Einfahrtsfeld direkt hinter dem Ausfahrtsfeld
      // der ersten (g = 0) bzw. g Felder Steilstraße dazwischen. Kurvenfelder k und k2 = k + 3 + g.
      let k2 = -1, gapN = 0;
      for (let g = 0; g <= 2 && k2 < 0; g++) {
        const kk = mod(k + 3 + g);
        let ok = true;
        for (let q = 2; q <= 2 + g; q++) if (!straightFree(k + q)) ok = false;
        if (!ok) break;
        if (isTurn(kk) && turnOf(kk) === t && own[kk] < 0 && straightFree(kk + 1) && straightFree(kk + 2)) { k2 = kk; gapN = g; }
      }
      if (k2 >= 0 && r() < P.bankChain) {
        const [jx, jy] = innerOf(k2);
        if (cellFree(jx, jy) && !(jx === ix && jy === iy)) {
          claim(k - 2, 1, { kind: 'bankT', side, b0: 0 });
          claim(k - 1, 3, { kind: 'bankC', turn: t > 0 ? 'R' : 'L' }, [[ix, iy]]);
          for (let q = 0; q < gapN; q++) claim(k + 2 + q, 1, { kind: 'bankR', side });
          claim(k2 - 1, 3, { kind: 'bankC', turn: t > 0 ? 'R' : 'L' }, [[jx, jy]]);
          claim(k2 + 2, 1, { kind: 'bankT', side, b0: 1 });
          count('bankC', 2);
          continue;
        }
      }
      // Steilstraße davor/danach (bankR), wenn gerade Felder frei
      let pre = 0, post = 0;
      if (r() < 0.5) { while (pre < 2 && r() < P.bankRP && straightFree(k - 3 - pre)) pre++; }
      else while (post < 2 && r() < P.bankRP && straightFree(k + 3 + post)) post++;
      claim(k - 2 - pre, 1, { kind: 'bankT', side, b0: 0 });
      for (let q = pre; q > 0; q--) claim(k - 1 - q, 1, { kind: 'bankR', side });
      claim(k - 1, 3, { kind: 'bankC', turn: t > 0 ? 'R' : 'L' }, [[ix, iy]]);
      for (let q = 0; q < post; q++) claim(k + 2 + q, 1, { kind: 'bankR', side });
      claim(k + 2 + post, 1, { kind: 'bankT', side, b0: 1 });
      count('bankC');
      continue;
    }
    if (choice === 'large') { const [ix, iy] = innerOf(k); claim(k - 1, 3, { kind: 'large', turn: t > 0 ? 'R' : 'L' }, [[ix, iy]]); count('large'); continue; }
    claim(k, 1, { kind: 'sharp', turn: t > 0 ? 'R' : 'L' });
    count('sharp');
  }

  // --- Hügel-Abschnitte: Hang hoch (gerade, frei) … Plateau … Hang runter
  const nHill = Math.round(fromQ(r, P.q.slope) / 2 * P.hills);
  const hills = [];
  for (let h = 0, tries = 0; h < nHill && tries < 60; tries++) {
    const s = 2 + r.int(n - 4), len = 4 + r.int(P.hillMax - 3);
    if (s + len >= n) continue;
    const e = s + len;
    if (!straightFree(s) || !straightFree(e) || zone[s] || zone[e]) continue;
    let ok = true;
    for (let q = 1; q < len && ok; q++) { const k = mod(s + q); if (zone[k] || at(k).cross >= 0 || k === 0) ok = false; }
    if (!ok) continue;
    const cand = { s, e, len };
    if (!terrainSolve(path, items, own, zone, grid, [...hills, cand], null)) continue;
    hills.push(cand);
    for (let q = 1; q < len; q++) zone[mod(s + q)] = 1;
    claim(s, 1, { kind: 'road', slope: 1 });
    claim(e, 1, { kind: 'road', slope: -1 });
    count('slope', 2);
    h++;
  }

  // --- gerade Läufe füllen
  const runs = [];
  for (let k = 1; k < n; k++) {
    if (own[k] >= 0) continue;
    let e = k;
    while (e + 1 < n && own[e + 1] < 0) e++;
    runs.push([k, e]);
    k = e;
  }
  const T = P.target;
  // feste Mehr-Token-Bausteine (Steilkurve, Röhre, Autobahn, Sprung/Buckel, Hochstraße, Hang) nie direkt hintereinander:
  // dazwischen mindestens ein einzelnes Element – sonst wiederholen sich ganze 6er-Folgen zwischen Strecken
  const FIX_END = new Set(['bankT', 'pipeT', 'hwyT', 'elramp', 'bramp', 'sramp', 'corkud']);
  const fixedEnd = (it) => !!it && (FIX_END.has(it.kind) && !it.up && (it.kind !== 'bankT' || it.b0 === 1) && (it.kind !== 'pipeT' && it.kind !== 'hwyT' || !it.into) || it.slope < 0);
  const fixedStart = (it) => !!it && (FIX_END.has(it.kind) && (it.up || it.kind === 'bankT' && it.b0 === 0 || (it.kind === 'pipeT' || it.kind === 'hwyT') && it.into) || it.slope > 0);
  const FIXED_OPS = new Set(['hump', 'jump', 'pipe', 'hwy', 'bankS']);
  for (const [a, b] of runs) {
    let k = a;
    let prev = items[own[mod(a - 1)]] ? items[own[mod(a - 1)]].kind : 'road';
    let prevFixed = fixedEnd(items[own[mod(a - 1)]]);
    const nextFixed = fixedStart(items[own[mod(b + 1)]]);
    while (k <= b) {
      const left = b - k + 1;
      if (isTurn(k)) { claim(k, 1, { kind: 'sharp', turn: turnOf(k) > 0 ? 'R' : 'L' }); count('sharp'); prev = 'sharp'; k++; continue; }
      let maxS = 0;
      while (maxS < left && !isTurn(k + maxS) && at(k + maxS).cross < 0) maxS++;
      if (maxS === 0) { claim(k, 1, { kind: 'road' }); k++; continue; }
      const need = (key) => Math.max(0.05, (T[key] || 0) - (cnt[key] || 0));
      const ops = [
        ['road', 1, P.w.road],
        ['tunnel', 1, P.w.tunnel * need('tunnel')],
        ['slalom', 1, P.w.slalom * need('slalom') * (prev === 'slalom' ? 0.2 : 1)],
        ['loop', 2, P.w.loop * need('loop') * P.intensity],
        ['corklr', 2, P.w.corklr * need('corklr') * P.intensity],
        ['hump', 2, P.w.hump * need('hump') * P.intensity],
        ['jump', 3, P.w.jump * need('jump') * P.intensity * (zone[k] === 1 ? 0.5 : 1)],
        ['pipe', 3, P.w.pipe * need('pipe') * P.intensity],
        ['hwy', 3, P.w.hwy * need('hwy')],
        ['bankS', 3, P.w.bankS * need('bankR')],
        ['xroad', 1, P.w.xroad * need('cross')],
        ['split', 1, P.w.split * need('split')],
      ].filter(([o, L, w]) => L <= maxS && w > 0 && !(FIXED_OPS.has(o) && (prevFixed || nextFixed && L >= left - 0)));
      const op = wpick(r, ops.map(([o, , w]) => [o, w]));
      prevFixed = FIXED_OPS.has(op);
      if (op === 'road' || op === 'tunnel' || op === 'slalom') {
        let L = 1;
        if (op === 'tunnel') while (L < maxS && L < 5 && r() < 0.55) L++;
        if (op === 'road') while (L < maxS && L < 4 && r() < 0.5) L++;
        for (let q = 0; q < L; q++) claim(k + q, 1, { kind: op });
        if (op !== 'road') count(op, L);
        k += L; prev = op; continue;
      }
      if (op === 'loop' || op === 'corklr') { claim(k, 2, { kind: op }); count(op); k += 2; prev = op; continue; }
      if ((op === 'xroad' || op === 'split') && stubs([side(k, 1), side(k, -1)])) {
        if (op === 'xroad') { claim(k, 1, { kind: 'cross' }); count('cross'); }
        else { claim(k, 1, { kind: 'ssplit', lane: 'a', chir: r() < 0.5 ? 'R' : 'L' }); count('split'); }
        k++; prev = op; continue;
      }
      if (op === 'hump') {
        const ru = wpick(r, RAMPS), rd = r() < 0.5 ? ru : wpick(r, RAMPS);
        claim(k, 1, { kind: ru, up: true }); claim(k + 1, 1, { kind: rd, up: false }); count('hump'); k += 2; prev = 'ramp'; continue;
      }
      if (op === 'jump') {
        const ru = wpick(r, RAMPS), rd = r() < 0.5 ? ru : wpick(r, RAMPS);
        claim(k, 1, { kind: ru, up: true }); claim(k + 1, 1, { kind: 'gap' }); claim(k + 2, 1, { kind: rd, up: false });
        count('jump'); k += 3; prev = 'ramp'; continue;
      }
      if (op === 'pipe' || op === 'hwy') {
        let L = 3;
        while (L < maxS && L < 6 && r() < 0.35) L++;
        const T0 = op === 'pipe' ? 'pipeT' : 'hwyT';
        claim(k, 1, { kind: T0, into: 1 });
        // Röhre: Innenteil aus Röhre/Hindernis gemischt
        let inner = op;
        for (let q = 1; q < L - 1; q++) { if (op === 'pipe' && r() < 0.4) inner = inner === 'pipe' ? 'pobst' : 'pipe'; claim(k + q, 1, { kind: inner }); }
        claim(k + L - 1, 1, { kind: T0, into: 0 });
        count(op); k += L; prev = T0; continue;
      }
      if (op === 'bankS') {
        let L = 3;
        while (L < maxS && L < 5 && r() < 0.4) L++;
        const side = r() < 0.5 ? 1 : -1;
        claim(k, 1, { kind: 'bankT', side, b0: 0 });
        for (let q = 1; q < L - 1; q++) claim(k + q, 1, { kind: 'bankR', side });
        claim(k + L - 1, 1, { kind: 'bankT', side, b0: 1 });
        count('bankR', L - 2); k += L; prev = 'bankT'; continue;
      }
      claim(k, 1, { kind: 'road' }); k++;
    }
  }
  for (let k = 0; k < n; k++) if (own[k] < 0) return null;

  // --- Schotter/Eis-Abschnitte (nur Straße, Kurven, Start/Ziel, Kreuzung)
  const SURF_OK = new Set(['road', 'sharp', 'large', 'sf', 'cross']);
  for (const [surf, p] of [['dirt', P.dirtP], ['icy', P.icyP]]) {
    if (r() >= p) continue;
    const s = r.int(n), len = 6 + r.int(16);
    for (let q = 0; q < len; q++) { const it = items[own[mod(s + q)]]; if (SURF_OK.has(it.kind) && !it.slope) it.surf = surf; }
  }
  // Nebenstraßen: an Stummeln von Kreuzungen/Abzweigen eine kurze Sackgasse ins Gelände (Deko wie in vielen Klassikern)
  const decor = [];
  for (const [x, y, d, k] of stubList) {
    if (zone[mod(k)] !== 0 || r() > P.sideP) continue;
    const L = 1 + r.int(P.sideMax);
    const cells = [];
    for (let q = 0; q < L; q++) {
      const cx = x + D[d][0] * q, cy = y + D[d][1] * q;
      if (!inG(cx, cy, 1) || (q > 0 && grid[K(cx, cy)] !== 0)) break;
      // nicht neben fremde Weg-/Fußabdruckfelder (außer dem Ursprungsfeld am Stummel)
      let ok = true;
      for (const [dx, dy] of D) {
        const nx = cx + dx, ny = cy + dy;
        if (!inG(nx, ny) || (nx === cx - D[d][0] && ny === cy - D[d][1])) continue;   // Vorgänger (Stummel/Wegfeld)
        if (grid[K(nx, ny)]) ok = false;
      }
      if (!ok) break;
      cells.push([cx, cy]);
    }
    if (!cells.length) continue;
    for (const [cx, cy] of cells) grid[K(cx, cy)] = 4;
    decor.push({ cells: cells.map(([cx, cy]) => [cx, cy, d & 1 ? 0x04 : 0x05]) });
  }
  // Ortschaft: Straßenkarree (Rundstraße mit vier engen Kurven) abseits der Strecke, Häuser folgen bei der Szenerie
  const towns = [];
  const nTown = r() < P.townP ? 1 + (r() < 0.3 ? 1 : 0) : 0;
  for (let tn = 0, tries = 0; tn < nTown && tries < 80; tries++) {
    const w = 3 + r.int(5), h = 3 + r.int(4);
    const x0 = 1 + r.int(29 - w), y0 = 1 + r.int(29 - h), x1 = x0 + w - 1, y1 = y0 + h - 1;
    let ok = true;
    for (let y = y0 - 1; y <= y1 + 1 && ok; y++) for (let x = x0 - 1; x <= x1 + 1 && ok; x++) if (!inG(x, y) || grid[K(x, y)]) ok = false;
    if (!ok) continue;
    const cells = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const edgeX = x === x0 || x === x1, edgeY = y === y0 || y === y1;
      if (!edgeX && !edgeY) continue;
      let code = edgeY && !edgeX ? 0x05 : 0x04;
      if (x === x0 && y === y0) code = 0x06; else if (x === x1 && y === y0) code = 0x07;
      else if (x === x1 && y === y1) code = 0x09; else if (x === x0 && y === y1) code = 0x08;
      cells.push([x, y, code]);
    }
    for (const [x, y] of cells) grid[K(x, y)] = 4;
    decor.push({ cells });
    towns.push([x0, y0, x1, y1]);
    tn++;
  }
  return { items, own, zone, grid, hills, cnt, decor, towns };
}

// =====================================================================================================
// 3) Gelände: Eckhöhen 0/1 (31×31), Pflichten aus Weg und Zonen, Hügel wachsen lassen, Sattel beheben
// =====================================================================================================
const CK = (x, y) => y * 31 + x;
const CORN = (i, j) => [CK(i, j), CK(i + 1, j), CK(i, j + 1), CK(i + 1, j + 1)];   // NW NE SW SE
const SIDE = [[1, 3], [2, 3], [0, 2], [0, 1]];                                      // Ecken der Seite E S W N
const TCODE = new Map();
TERRAIN.forEach((t, code) => { if (!t.water) TCODE.set(t.c.join(''), code); });

// Pflichten: 1 = muss tief, 2 = muss hoch. hills = [{s, e, len}], extraLow = Felder (Wasser) → null bei Widerspruch
function terrainSolve(path, items, own, zone, grid, hills, extraLow) {
  const n = path.length;
  const mod = (k) => ((k % n) + n) % n;
  const req = new Int8Array(31 * 31);
  const hillCell = new Int8Array(n);
  const slope = new Map();      // Weg-Index → +1 hoch / −1 runter
  for (const h of hills) { for (let q = 1; q < h.len; q++) hillCell[mod(h.s + q)] = 1; slope.set(h.s, 1); slope.set(h.e, -1); }
  const set = (c, v) => { if (req[c] && req[c] !== v) return false; req[c] = v; return true; };
  const tile = (i, j, v) => { for (const c of CORN(i, j)) if (!set(c, v)) return false; return true; };
  // Fußabdrücke: Wegfelder + Zusatzfelder je Element (Level der Zone an seinem ersten Feld)
  const seen = new Set();
  for (let k = 0; k < n; k++) {
    const c = path[k];
    if (slope.has(k)) {
      const d = c.din, up = slope.get(k) > 0, cs = CORN(c.i, c.j);
      for (const q of SIDE[d]) if (!set(cs[q], up ? 2 : 1)) return null;
      for (const q of SIDE[(d + 2) & 3]) if (!set(cs[q], up ? 1 : 2)) return null;
      continue;
    }
    const v = hillCell[k] ? 2 : 1;
    if (!tile(c.i, c.j, v)) return null;
    const it = own[k] >= 0 ? items[own[k]] : null;
    if (it && it.k === k && !seen.has(it)) { seen.add(it); for (const [x, y] of it.extra || []) if (!tile(x, y, v)) return null; }
  }
  if (extraLow) for (const [i, j] of extraLow) if (!tile(i, j, 1)) return null;
  return req;
}

function makeTerrain(r, path, A, P, horizonW) {
  const { items, own, zone, grid, hills } = A;
  const req = terrainSolve(path, items, own, zone, grid, hills, (A.decor || []).flatMap((x) => x.cells).concat((A.towns || []).flatMap(([x0, y0, x1, y1]) => { const o = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) o.push([x, y]); return o; })));
  if (!req) return null;
  const H = new Int8Array(31 * 31);
  for (let c = 0; c < H.length; c++) H[c] = req[c] === 2 ? 1 : 0;
  // Hügel wachsen lassen (um Plateaus und als freie Hügel), nie auf Pflicht-tief-Ecken
  const grow = (seeds, steps) => {
    const front = [...seeds];
    for (let s = 0; s < steps && front.length; s++) {
      const q = front.splice(r.int(front.length), 1)[0];
      const x = q % 31, y = (q / 31) | 0;
      for (const [dx, dy] of D) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx > 29 || ny > 29) continue;
        const c = CK(nx, ny);
        if (H[c] || req[c] === 1 || r() > 0.62) continue;
        H[c] = 1; front.push(c);
      }
    }
  };
  const plateau = [];
  for (let c = 0; c < H.length; c++) if (H[c]) plateau.push(c);
  grow(plateau, Math.round(plateau.length * P.hillGrow));
  // freie Hügel in leeren Gegenden
  const nFree = Math.round(P.freeHills * (0.5 + r()));
  for (let h = 0; h < nFree; h++) {
    for (let t = 0; t < 30; t++) {
      const x = 2 + r.int(27), y = 2 + r.int(27), c = CK(x, y);
      if (req[c] === 1 || H[c]) continue;
      H[c] = 1;
      grow([c], 12 + r.int(40));
      break;
    }
  }
  // Sattel (diagonal gleiche Ecken) beheben: freie tiefe Ecke anheben, sonst freie hohe Ecke senken
  for (let it = 0; it < 12; it++) {
    let fixed = 0, bad = 0;
    for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
      const cs = CORN(i, j), v = cs.map((c) => H[c]);
      if (!(v[0] === v[3] && v[1] === v[2] && v[0] !== v[1])) continue;
      bad++;
      const lows = cs.filter((c) => !H[c] && req[c] !== 1), highs = cs.filter((c) => H[c] && req[c] !== 2);
      if (lows.length) { H[lows[r.int(lows.length)]] = 1; fixed++; } else if (highs.length) { H[highs[r.int(highs.length)]] = 0; fixed++; }
    }
    if (!bad) break;
    if (!fixed) return null;
  }
  const terr = new Uint8Array(900);
  for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
    const code = TCODE.get(CORN(i, j).map((c) => H[c]).join(''));
    if (code === undefined) return null;
    terr[K(i, j)] = code;
  }
  // Wasser: Seen auf ebenen, freien Feldern (auch unter Brücken und Sprunglücken), dann Uferecken
  const waterOK = new Uint8Array(900);
  const under = new Set();
  for (const it of items) {
    if (it.kind === 'gap' || ['elev', 'span', 'solid', 'elcorner', 'spanroad'].includes(it.kind) && zone[it.k] === 2) {
      for (let q = 0; q < it.len; q++) { const c = path[(it.k + q) % path.length]; under.add(K(c.i, c.j)); }
      for (const [x, y] of it.extra || []) under.add(K(x, y));
    }
  }
  for (let k = 0; k < 900; k++) waterOK[k] = terr[k] === 0 && (grid[k] === 0 || under.has(k)) ? 1 : 0;
  // Kreuzungszellen nie unter Wasser (unterer Durchgang fährt am Boden)
  for (const c of path) if (c.cross >= 0) waterOK[K(c.i, c.j)] = 0;
  const wTarget = Math.round(900 * P.water);
  let wet = 0;
  const lakes = Math.max(1, Math.round(wTarget / 70));
  // Seen bevorzugt unter Brücken/Sprüngen beginnen
  const seedsU = [...under].filter((k) => waterOK[k]);
  for (let l = 0; l < lakes * 3 && wet < wTarget; l++) {
    let s = -1;
    if (seedsU.length && r() < 0.6) s = seedsU[r.int(seedsU.length)];
    else for (let t = 0; t < 40; t++) { const k = r.int(900); if (waterOK[k] && terr[k] === 0) { s = k; break; } }
    if (s < 0 || terr[s] === 1) continue;
    const size = Math.round(wTarget / lakes * (0.5 + r()));
    const front = [s];
    terr[s] = 1; wet++;
    let got = 1;
    while (got < size && front.length && wet < wTarget * 1.2) {
      const fi = r.int(front.length), c = front[fi];
      const x = c % 30, y = (c / 30) | 0;
      const nb = D.map(([dx, dy]) => [x + dx, y + dy]).filter(([nx, ny]) => inG(nx, ny) && waterOK[K(nx, ny)] && terr[K(nx, ny)] !== 1);
      if (!nb.length) { front.splice(fi, 1); continue; }
      const [nx, ny] = nb[r.int(nb.length)];
      terr[K(nx, ny)] = 1; wet++; got++; front.push(K(nx, ny));
    }
  }
  // Uferecken (Land mit Wasser an zwei Seiten und diagonal): ebene, freie Felder
  const W = (i, j) => inG(i, j) && terr[K(i, j)] === 1;
  for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
    const k = K(i, j);
    if (terr[k] !== 0 || grid[k]) continue;
    const opts = [];
    if (W(i - 1, j) && W(i, j + 1) && W(i - 1, j + 1)) opts.push(2);
    if (W(i + 1, j) && W(i, j + 1) && W(i + 1, j + 1)) opts.push(3);
    if (W(i + 1, j) && W(i, j - 1) && W(i + 1, j - 1)) opts.push(4);
    if (W(i - 1, j) && W(i, j - 1) && W(i - 1, j - 1)) opts.push(5);
    if (opts.length === 1 && r() < 0.85) terr[k] = opts[0];
  }
  return terr;
}

// =====================================================================================================
// 4) Szenerie
// =====================================================================================================
const SCEN = { palm: [0x97], cactus: [0x98], pine: [0x99], tennis: [0x9A], gas: [0x9B, 0x9C, 0x9D, 0x9E], barn: [0x9F, 0xA0, 0xA1, 0xA2], office: [0xA3, 0xA4, 0xA5, 0xA6], windmill: [0xA7, 0xA8, 0xA9, 0xAA], ship: [0xAB, 0xAC, 0xAD, 0xAE], diner: [0xAF, 0xB0, 0xB1, 0xB2] };
const TREES = new Set(['palm', 'cactus', 'pine']);
function placeScenery(r, t, terr, grid, style, horizon, P, towns) {
  const dist = (style.scenery.byHorizon || {})[horizon] || { pine: 1 };
  const nTarget = Math.min(P.scenMax, Math.round(fromQ(r, style.scenery.count) * P.scen));
  const flat = (k) => terr[k] === 0 || terr[k] === 6;
  const near = new Uint8Array(900);          // Abstand ≤ 2 zu einem Wegfeld
  for (let k = 0; k < 900; k++) if (grid[k]) { const x = k % 30, y = (k / 30) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (inG(x + dx, y + dy)) near[K(x + dx, y + dy)] = 1; }
  let placed = 0;
  const put = (k, kind) => {
    if (grid[k] || t.elem[k]) return false;
    if (kind === 'ship' ? terr[k] !== 1 : !flat(k)) return false;
    const codes = SCEN[kind];
    t.elem[k] = codes[r.int(codes.length)];
    placed++;
    return true;
  };
  const kinds = Object.entries(dist).filter(([, w]) => w > 0);
  for (const [x0, y0, x1, y1] of towns || []) {
    const houses = Object.entries(dist).filter(([k]) => !TREES.has(k) && k !== 'ship');
    if (!houses.length) break;
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!inG(x, y) || r() > 0.55) continue;
      put(K(x, y), wpick(r, houses));
    }
  }
  for (let tries = 0; placed < nTarget && tries < nTarget * 6; tries++) {
    const kind = wpick(r, kinds);
    if (TREES.has(kind)) {
      // Wäldchen / Baumreihe
      const k0 = r.int(900), x0 = k0 % 30, y0 = (k0 / 30) | 0;
      const m = 2 + r.int(9);
      for (let q = 0; q < m && placed < nTarget; q++) {
        const x = x0 + r.int(5) - 2, y = y0 + r.int(5) - 2;
        if (inG(x, y)) put(K(x, y), kind);
      }
    } else if (kind === 'ship') {
      const k = r.int(900);
      if (terr[k] === 1) put(k, kind);
    } else {
      // Gebäude gern nahe der Strecke
      for (let q = 0; q < 20; q++) { const k = r.int(900); if (near[k] && put(k, kind)) break; }
    }
  }
  return placed;
}

// =====================================================================================================
// Hauptfunktion
// =====================================================================================================
// Parameter je Seed aus dem Stil-Modell: Länge, Kurvigkeit, Stunt-Dichte, Gelände nach Horizont
function params(r, style) {
  const C = style.counts;
  const horizon = wpick(r, style.horizon.map((w, h) => [h, w]));
  const intensity = 0.65 + r() * 0.8;
  const hz = (style.terrainByHorizon || {})[horizon] || {};
  // Größe wie die Klassiker: belegte Felder aus der Verteilung des Modells (Skelett-Ziel etwas darüber, weil der
  // A*-Schluss meist kürzer ist als der Rest der Schildkröte)
  const cells = Math.max(56, Math.min(160, Math.round(fromQ(r, style.length.meters) / (style.tile || 40) * 1.05)));
  const target = {};
  for (const k of ['loop', 'corklr', 'pipe', 'tunnel', 'slalom', 'jump', 'hump', 'hwy', 'bankR', 'cross', 'split']) target[k] = Math.max(0, C[k].mean * cells / 86 * (0.6 + r() * 0.8));
  const mo = style.motifs || {};
  const ok = (m) => !mo[m] || mo[m].ok;
  return {
    horizon, intensity, cells, target,
    run: { p10: 3, p25: 5, p50: 8, p75: 9 + r.int(2), p90: 11 + r.int(3) },
    jogP: 0.11 + r() * 0.09,
    crossP: 0.2 + r() * 0.25,
    turnCost: 1.6,
    overP: ok('ueberfuehrung') ? 0.6 : 0,
    elevMax: 12,
    corkP: ok('wendelHoch') ? 0.35 : 0,
    chicaneP: 0.95,
    banks: ok('steilkurve'),
    bankChain: ok('steilkurve2') ? 0.35 : 0,
    bankRP: ok('steilkurveR') ? 0.3 : 0,
    turnW: { sharp: C.sharp.mean, large: C.large.mean * 2.0, bank: C.bankC.mean * 1.9, split: C.split.mean * 0.4 },
    hills: (hz.hill ?? style.terrain.hill.mean) / Math.max(0.05, style.terrain.hill.mean) * (0.8 + r() * 1.1) * (ok('huegel') ? 1 : 0),
    hillMax: 16,
    hillGrow: 0.6 + r() * 1.4,
    freeHills: 1 + 3 * ((hz.hill ?? 0.25) / 0.25),
    water: Math.min(0.45, fromQ(r, style.terrain.water) * ((hz.water ?? style.terrain.water.mean) / Math.max(0.05, style.terrain.water.mean))),
    scen: 0.8 + r() * 0.5, scenMax: 180, sideP: 0.85, sideMax: 7, townP: 0.85,
    dirtP: style.surface.dirtShare, icyP: style.surface.icyShare * 0.6,
    w: {
      road: 0.35, tunnel: 0.8, slalom: 0.8, loop: 1.4, corklr: 1.3, hump: ok('buckel') ? 1.4 : 0,
      jump: ok('sprung') ? 2.4 : 0, pipe: ok('roehre') ? 2.2 : 0, hwy: ok('autobahn') ? 1.8 : 0, bankS: ok('steilstrasse') ? 0.2 : 0,
      xroad: ok('kreuzung') ? 0.5 : 0, split: 0.7,
    },
    q: { bridge: C.bridge, slope: C.slope },
  };
}

// Seed → { bytes, name, horizon, info } oder null (kein gültiger Rundkurs mit diesem Seed)
export function generateTrk(seed, style, opt = {}) {
  const r = rng((seed >>> 0) * 2654435761 + 97);
  for (let attempt = 0; attempt < (opt.attempts || 12); attempt++) {
    const P = params(r, style);
    if (opt.over) Object.assign(P, typeof opt.over === 'function' ? opt.over(P, r) : opt.over);
    let sk = null;
    for (let a = 0; a < 40 && !sk; a++) sk = trySkeleton(r, P);
    if (!sk) continue;
    const A = assign(r, sk, P);
    if (!A) continue;
    const terr = makeTerrain(r, sk.path, A, P);
    if (!terr) continue;
    const out = emit(sk, A, terr, P.horizon);
    if (!out) continue;
    const scen = placeScenery(r, out.t, terr, A.grid, style, P.horizon, P, A.towns);
    return { bytes: out.t.bytes(P.horizon), horizon: P.horizon, attempt, info: { cells: sk.path.length, crossings: sk.path.filter((c) => c.cross >= 0).length / 2, counts: A.cnt, scenery: scen, intensity: +P.intensity.toFixed(2) } };
  }
  return null;
}

// Elemente in Fahrreihenfolge über den TrackDesigner legen
function emit(sk, A, terr, horizon) {
  const { path } = sk;
  const { items, own } = A;
  const n = path.length;
  const t = new TrackDesigner(path[0].i, path[0].j, path[0].din);
  t.terr.set(terr);
  try {
    for (let k = 0; k < n;) {
      const it = items[own[k]];
      if (it.k !== k) throw new Error('Belegung nicht zusammenhängend');
      const o = it.surf ? { surf: it.surf } : {};
      switch (it.kind) {
        case 'gap': case 'pass': t.gap(1); break;
        case 'sf': case 'road': case 'tunnel': case 'slalom': case 'loop': case 'corklr': case 'pipe': case 'pobst': case 'hwy': case 'elev': case 'span': case 'solid': case 'cross':
          t.put(it.kind, o); break;
        case 'sharp': case 'large': case 'bankC': case 'elcorner': t.put(it.kind, { ...o, turn: it.turn }); break;
        case 'chicane': t.put('chicane', { chir: it.chir }); break;
        case 'corkud': t.put('corkud', { up: it.up, chir: it.chir }); break;
        case 'elramp': case 'bramp': case 'sramp': t.put(it.kind, { up: it.up }); break;
        case 'pipeT': case 'hwyT': t.put(it.kind, { match: { into: it.into } }); break;
        case 'bankT': t.put('bankT', { match: { side: it.side, b0: it.b0 } }); break;
        case 'bankR': t.put('bankR', { match: { side: it.side } }); break;
        case 'spanroad': t.put('spanroad', { match: it.over ? { over: 1 } : { under: 1 } }); break;
        case 'ssplit': t.put('ssplit', it.lane === 'b' ? { lane: 'b', turn: it.turn, chir: it.chir } : { lane: 'a', chir: it.chir }); break;
        default: throw new Error('unbekannt ' + it.kind);
      }
      k += it.len;
      const nx = path[k % n];
      if (t.i !== nx.i || t.j !== nx.j || t.d !== nx.din) throw new Error(`Versatz nach ${it.kind} bei ${k}`);
    }
  } catch (e) {
    return null;
  }
  for (const { cells } of A.decor || []) for (const [x, y, code] of cells) if (!t.elem[K(x, y)]) t.elem[K(x, y)] = code;
  return { t };
}
