// Strecken-Generator „Gelände“ (n22, 01.10.2026): Seed + Schwierigkeit → Rundkurs, der durch eine Landschaft fährt
// (gelaende.js legt Landschaft und Höhenverlauf fest). Code-Zusatz „-g“, eigener Zufall – flache und 3D-Codes bleiben.
// 1) Grundform: Rechteck, wie beim flachen Generator ausgebeult; dazu oft eine Serpentine (Kehren den Hang hinauf).
// 2) Ecken → enge/weite Kurven, weite oft als Steilkurve in einer Mulde.
// 3) Gelände-Elemente auf Geraden: Kuppe mit Luftphase, Hang-Querfahrt (seitlich geneigt), Tunnel durch einen Hügel,
//    Schluchtsprung, Halfpipe im Tal, Plateau-Abfahrt (Drop); dazu Stunts (Looping, Röhre, Korkenzieher, Wellen …) auf
//    Gelände-Sockeln. Tunnel und Brücken entstehen außerdem von selbst, wo die Fahrbahn tief unter bzw. hoch über der
//    Landschaft läge.
import { GRID } from './defs.js';
import { rng } from '../core/util.js';
import { pieceCells, PIECES } from './pieces.js';
import { DIFFS, bump, dirIdx, trackName, hindFilter, genV, HIND_FALLBACK } from './generator.js';
import './pieces_gel.js';   // Halfpipe registrieren

// Je Stufe: Rechteck, Ausbeulungen, Anteil weiter Kurven / davon Steilkurven, Stunt-Dichte, Chance Serpentine,
// Gelände-Elemente (Anzahl oder Chance), Neigung der Hang-Querfahrt (Grad), Pflicht-Stunts, Stunt-Gewichte
export const GD = {
  1: { w: [12, 15], h: [9, 12], bumps: [1, 2], large: 0.85, bank: 0.35, density: 0.16, serp: 0.65, kuppe: 1, tilt: 1, tunnel: 0.5, gorge: 0.4, halfpipe: 0.35, drop: 0.3, tiltDeg: 10,
    must: ['loop'], types: { bumps: 2, chicane: 2, waves: 1 } },
  2: { w: [13, 17], h: [10, 13], bumps: [1, 3], large: 0.7, bank: 0.45, density: 0.24, serp: 0.6, kuppe: 1, tilt: 1, tunnel: 0.7, gorge: 1, halfpipe: 0.6, drop: 0.7, tiltDeg: 13,
    must: ['loop', 'jump'], types: { bumps: 1, chicane: 2, loop: 2, jump: 1, tube: 2, waves: 2, tr_corklr: 1 } },
  3: { w: [14, 19], h: [11, 14], bumps: [2, 4], large: 0.55, bank: 0.5, density: 0.34, serp: 0.6, kuppe: 2, tilt: 1, tunnel: 0.8, gorge: 1, halfpipe: 0.8, drop: 0.9, tiltDeg: 15,
    must: ['loop', 'jump', 'tube'], types: { bumps: 1, chicane: 2, loop: 3, jump: 2, tube: 2, waves: 2, tr_corklr: 3 } },
};
// n33 Generator-Version 2: Zickzack-Barriere und Röhre mit Wand auf Gelände-Sockeln (Pflicht wie flach: Sanft die kurze
// Zickzack, Sportlich Zickzack, Irre Zickzack + Röhre mit Wand)
export const GD2 = {
  1: { ...GD[1], must: ['loop', 'zigzag2'] },
  2: { ...GD[2], must: ['loop', 'zigzag', 'jump'], types: { ...GD[2].types, chicane: 1, zigzag: 2, tube_wall: 2 } },
  3: { ...GD[3], must: ['loop', 'zigzag', 'tube_wall', 'jump', 'tube'], types: { ...GD[3].types, chicane: 1, zigzag: 2, tube_wall: 2 } },
};
const LEN = { straight: 1, checkpoint: 1, bumps: 1, chicane: 2, loop: 2, tube: 2, jump: 3, waves: 3, tr_corklr: 2, halfpipe: 3, cliff: 3, cliff2: 3, zigzag: 3, zigzag2: 2, tube_wall: 2 };
const RUNUP = { bumps: 0, chicane: 0, loop: 1, tube: 0, jump: 1, waves: 0, tr_corklr: 1, halfpipe: 1, cliff: 1, cliff2: 1, zigzag: 1, zigzag2: 1, tube_wall: 1 };
const AFTER = { bumps: 0, chicane: 0, loop: 1, tube: 1, jump: 1, waves: 0, tr_corklr: 1, halfpipe: 1, cliff: 1, cliff2: 1, zigzag: 1, zigzag2: 1, tube_wall: 1 };
const key = (p) => p[0] + ',' + p[1];

export function rectCycle(r, D) {
  const W = r.int(D.w[1] - D.w[0] + 1) + D.w[0], H = r.int(D.h[1] - D.h[0] + 1) + D.h[0];
  const x0 = Math.floor((GRID - W) / 2) + r.int(3) - 1, y0 = Math.floor((GRID - H) / 2) + r.int(3) - 1;
  const cyc = [];
  for (let x = x0; x < x0 + W - 1; x++) cyc.push([x, y0]);
  for (let y = y0; y < y0 + H - 1; y++) cyc.push([x0 + W - 1, y]);
  for (let x = x0 + W - 1; x > x0; x--) cyc.push([x, y0 + H - 1]);
  for (let y = y0 + H - 1; y > y0; y--) cyc.push([x0, y]);
  return cyc;
}

// Serpentine in eine lange gerade Seite einsetzen (relativ: u entlang, v seitlich): Schenkel 1 entlang u bis a, Kehre
// (zwei enge Kurven) in Reihe v = 1, Schenkel 2 zurück bis a − b, Kehre in Reihe 2, Schenkel 3 bis Lg, dann zurück in
// Reihe 0 (S-Kurve). Die Schenkel liegen ein Feld auseinander – der Hang dazwischen kommt aus dem Höhenverlauf.
export function serpentine(cyc, r) {
  const n = cyc.length;
  const dirOf = (a, b) => [b[0] - a[0], b[1] - a[1]];
  for (let tries = 0; tries < 80; tries++) {
    const i = r.int(n - 1), d0 = dirOf(cyc[i], cyc[i + 1]);
    let run = 0;
    while (i + run + 1 < n) { const d = dirOf(cyc[i + run], cyc[i + run + 1]); if (d[0] !== d0[0] || d[1] !== d0[1]) break; run++; }
    const a = 3 + r.int(2), b = 2 + r.int(2), Lg = a + 2 + r.int(2);
    if (run < Lg + 1 || a - b < 1) continue;
    const left = [d0[1], -d0[0]];
    for (const nv of r.chance(0.5) ? [left, [-left[0], -left[1]]] : [[-left[0], -left[1]], left]) {
      const P = (u, v) => [cyc[i][0] + d0[0] * u + nv[0] * v, cyc[i][1] + d0[1] * u + nv[1] * v];
      const path = [P(a, 1)];
      for (let u = a - 1; u >= a - b; u--) path.push(P(u, 1));
      path.push(P(a - b, 2));
      for (let u = a - b + 1; u <= Lg; u++) path.push(P(u, 2));
      path.push(P(Lg, 1));
      const removed = new Set();
      for (let u = a + 1; u < Lg; u++) removed.add(key(P(u, 0)));
      const keep = new Set(cyc.map(key).filter((q) => !removed.has(q)));
      let ok = true;
      for (const p of path) if (p[0] < 2 || p[1] < 2 || p[0] > GRID - 3 || p[1] > GRID - 3 || keep.has(key(p))) { ok = false; break; }
      if (!ok) continue;
      // Nachbarn der neuen Zellen: nur die eigene Seite (Reihe 0, Spalten 0 … Lg) darf angrenzen
      const allow = new Set(); for (let u = 0; u <= Lg + 1; u++) allow.add(key(P(u, 0)));
      for (const p of path) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const q = key([p[0] + dx, p[1] + dy]);
        if (keep.has(q) && !allow.has(q)) { ok = false; break; }
      }
      if (!ok) continue;
      const out = cyc.slice(0, i + a + 1).concat(path, cyc.slice(i + Lg));
      return { cyc: out, first: key(P(1, 0)), last: key(P(Lg, 0)), cells: new Set([...path.map(key), key(P(Lg, 0))]) };
    }
  }
  return null;
}

export function generateGel(seed, diff, opts = {}) {
  const v2 = genV(opts) === 2;
  const D = v2 ? hindFilter(GD2[diff]) : GD[diff], base = DIFFS[diff];
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng(((seed >>> 0) * 7919 + diff * 104729 + (opts.variant || 0) * 7727 + attempt * 31337 + 0x6e1) >>> 0);
    const lay = tryBuild(r, D, base, diff, seed, v2);
    if (!lay) continue;
    lay.seed = seed; lay.diff = diff;
    const k = `${seed}-${diff}-g${v2 ? 'h' : ''}`;
    lay.meta = { seed, diff, gel: true, variant: opts.variant || 0, key: k, name: trackName(seed), diffName: base.name, attempt, elems: lay.elems, ...(v2 ? { gv: 2 } : {}) };
    delete lay.elems;
    return lay;
  }
  throw new Error('Gelände-Generator: keine Strecke für ' + seed + '-' + diff);
}

function tryBuild(r, D, base, diff, seed, v2 = false) {
  // --- 1) Grundform + Serpentine + Ausbeulungen
  let cyc = rectCycle(r, D), sp = null;
  if (r.chance(D.serp)) { sp = serpentine(cyc, r); if (sp) cyc = sp.cyc; }
  const nb = D.bumps[0] + r.int(D.bumps[1] - D.bumps[0] + 1);
  for (let k = 0, tries = 0; k < nb && tries < 300; tries++) {
    const res = bump(cyc, r);
    if (!res) continue;
    if (sp) { const s = new Set(res.map(key)); let keepAll = true; for (const c of sp.cells) if (!s.has(c)) { keepAll = false; break; } if (!keepAll || !s.has(sp.first)) continue; }
    cyc = res; k++;
  }
  const n = cyc.length;
  const dir = cyc.map((c, i) => dirIdx(c, cyc[(i + 1) % n]));
  const isTurn = cyc.map((c, i) => dir[i] !== dir[(i - 1 + n) % n]);
  const serpCell = (i) => sp && (sp.cells.has(key(cyc[i])) || key(cyc[i]) === sp.first);
  // Start: Mitte der längsten Gerade außerhalb der Serpentine
  let bestLen = 0, bestStart = -1;
  for (let i = 0; i < n; i++) {
    if (isTurn[i] || !isTurn[(i - 1 + n) % n]) continue;
    let l = 0; while (l < n && !isTurn[(i + l) % n]) l++;
    let inS = false; for (let q = 0; q < l; q++) if (serpCell((i + q) % n)) inS = true;
    if (!inS && l > bestLen) { bestLen = l; bestStart = i; }
  }
  if (bestStart < 0 || bestLen < 4) return null;
  const s0 = (bestStart + Math.max(0, Math.floor(bestLen / 2) - 2)) % n;
  const C = cyc.slice(s0).concat(cyc.slice(0, s0)), dr = dir.slice(s0).concat(dir.slice(0, s0)), tr = isTurn.slice(s0).concat(isTurn.slice(0, s0));
  const used = new Set(C.map(key));
  // --- 2) Stücke
  let items = [];
  for (let i = 0; i < n; i++) {
    const inS = sp && (sp.cells.has(key(C[i])) || key(C[i]) === sp.first);
    if (tr[i]) { const m = ((dr[i] - dr[(i - 1 + n) % n] + 4) % 4) === 1 ? 1 : -1; items.push({ t: 'turnS', cells: 1, m, at: i, serp: inS }); }
    else items.push({ t: 'straight', cells: 1, at: i, serp: inS });
  }
  // weite Kurven (nicht in der Serpentine – dort bleiben die Kehren eng)
  for (let k = 2; k < items.length - 1; k++) {
    const a = items[k - 1], b = items[k], c = items[k + 1];
    if (b.t !== 'turnS' || a.t !== 'straight' || c.t !== 'straight' || b.serp || a.serp || c.serp) continue;
    if (!r.chance(D.large)) continue;
    const P = C[a.at], N = C[c.at];
    const inner = [P[0] + N[0] - C[b.at][0], P[1] + N[1] - C[b.at][1]];
    if (used.has(key(inner))) continue;
    used.add(key(inner));
    items.splice(k - 1, 3, { t: r.chance(D.bank) ? 'bank' : 'turnL', cells: 3, m: b.m, at: a.at });
  }
  const out = items.map((it) => ({ ...it }));
  out[0].t = 'start'; out[0].lock = 1; if (out[1]) out[1].lock = 1;
  const N = out.length;
  const elems = {};
  const plain = (q) => out[q] && out[q].t === 'straight' && !out[q].lock && !out[q].soft && !out[q].serp;
  // Anlauf/Auslauf eines Stunts darf eine Gerade mit dem Nachbar-Stunt teilen (weich gesperrt), das Stück selbst nicht
  const runway = (q) => out[q] && out[q].t === 'straight' && !out[q].lock && !out[q].serp;
  // Element t an Stelle s (mit Anlauf/Auslauf aus Geraden)?
  const fits = (t, s) => {
    const lo = s - (RUNUP[t] ?? 1), hi = s + (LEN[t] || 1) - 1 + (AFTER[t] ?? 1);
    if (lo < 1 || hi >= N) return false;
    for (let q = lo; q <= hi; q++) if (q >= s && q < s + (LEN[t] || 1) ? !plain(q) : !runway(q)) return false;
    return true;
  };
  const place = (t, s, extra = {}) => {
    if (t === 'zigzag' || t === 'zigzag2') out[s].m = r.chance(0.5) ? 1 : -1;   // n33: Seite des ersten Blocks
    out[s].t = t; out[s].cells = LEN[t]; Object.assign(out[s], extra);
    for (let q = s + 1; q < s + LEN[t]; q++) out[q].t = 'skip';
    for (let q = s; q < s + LEN[t]; q++) out[q].lock = 1;
    for (let q = s - (RUNUP[t] ?? 1); q < s + LEN[t] + (AFTER[t] ?? 1); q++) if (out[q] && !out[q].lock) out[q].soft = 1;
    elems[extra.g || t] = (elems[extra.g || t] || 0) + 1;
  };
  const cands = (t) => { const c = []; for (let s = 2; s < N; s++) if (fits(t, s)) c.push(s); return c; };
  const spread = (c) => {
    // möglichst weit weg von bereits gesetzten Elementen
    const placedAt = out.map((o, k) => (o.t !== 'straight' && o.t !== 'turnS' && o.t !== 'turnL' && o.t !== 'skip' && o.t !== 'start' ? k : -1)).filter((k) => k >= 0);
    let best = c[r.int(c.length)], bd = -1;
    for (let k = 0; k < 6; k++) {
      const s = c[r.int(c.length)];
      const d = placedAt.length ? Math.min(...placedAt.map((p) => Math.min(Math.abs(p - s), N - Math.abs(p - s)))) : r.int(100);
      if (d > bd) { bd = d; best = s; }
    }
    return best;
  };
  // Läufe gerader Stücke der Mindestlänge len (frei) → Startindex
  const runCands = (len) => { const c = []; for (let s = 2; s + len - 1 < N; s++) { let ok = true; for (let q = s; q < s + len; q++) if (!plain(q)) { ok = false; break; } if (ok) c.push(s); } return c; };
  // --- 3) Pflicht-Stunts (die Schanze oft als Schluchtsprung), dann Gelände-Elemente: Kuppe, Hang, Tunnel, Drop, Halfpipe
  const cliffT = (lv) => (lv === 2 ? 'cliff2' : 'cliff');
  let gorgeDone = false;
  if (r.chance(D.gorge)) { const c = cands('jump'); if (c.length) { place('jump', spread(c), { g: 'gorge' }); gorgeDone = true; } }
  if (r.chance(D.drop)) {
    const lv = diff === 3 && r.chance(0.5) ? 2 : 1, t = cliffT(lv);
    LEN[t] = PIECES[t].cells.length;
    const c = cands(t); if (c.length) place(t, spread(c), { lvl: lv, h1: 0, g: 'drop' });
  }
  if (r.chance(D.halfpipe)) { const c = cands('halfpipe'); if (c.length) place('halfpipe', spread(c)); }
  for (let t of D.must) {
    let c = cands(t);
    if (!c.length && v2 && HIND_FALLBACK[t]) { t = HIND_FALLBACK[t]; c = cands(t); }
    if (!c.length) continue;
    if (t === 'jump' && gorgeDone) continue;   // Pflicht-Schanze ist schon der Schluchtsprung
    place(t, spread(c));
  }
  // Kuppe: zweites Stück eines Laufs aus 4 Geraden (nach der Luftphase zwei Felder zum Landen und Bremsen)
  for (let q = 0; q < D.kuppe; q++) {
    const c = runCands(4);
    if (!c.length) break;
    const s = spread(c);
    out[s + 1].g = 'kuppe';
    for (let k = s; k <= s + 3; k++) out[k].lock = 1;
    elems.kuppe = (elems.kuppe || 0) + 1;
  }
  for (let q = 0; q < D.tilt; q++) {
    const c = runCands(3);
    if (!c.length) break;
    const s = spread(c), th = (r.chance(0.5) ? 1 : -1) * D.tiltDeg * Math.PI / 180;
    let e = s + 2; while (e + 1 < N && e - s < 4 && plain(e + 1)) e++;
    for (let k = s; k <= e; k++) { out[k].tilt0 = k === s ? 0 : th; out[k].tilt1 = k === e ? 0 : th; out[k].lock = 1; }
    elems.tilt = (elems.tilt || 0) + 1;
  }
  if (r.chance(D.tunnel)) {
    const c = runCands(2);
    if (c.length) { const s = spread(c); let e = s + 1; while (e + 1 < N && e - s < 3 && plain(e + 1)) e++; for (let k = s; k <= e; k++) { out[k].g = 'tunnel'; out[k].lock = 1; } elems.tunnel = 1; }
  }
  // --- Stunts auf Sockeln (Pflicht zuerst, dann nach Dichte)
  const types = { ...D.types };
  const weights = Object.entries(types);
  const pickType = () => { const tot = weights.reduce((s, [, w]) => s + w, 0); let x = r() * tot; for (const [t, w] of weights) { x -= w; if (x <= 0) return t; } return weights[0][0]; };
  for (let s = 2; s < N; s++) {
    if (!r.chance(base.density * 0 + D.density)) continue;
    const t = pickType();
    if (fits(t, s)) place(t, s);
  }
  // Checkpoints: 2 (Sanft) bzw. 3, auf freien Geraden (nicht im Tunnel, nicht auf Kuppe/Hang)
  const ncp = diff === 1 ? 2 : 3;
  const freeIdx = out.map((o, k) => (o.t === 'straight' && !o.g && o.tilt0 == null && k > 3 ? k : -1)).filter((k) => k >= 0);
  let cps = 0;
  for (let c = 1; c <= ncp && freeIdx.length; c++) {
    const want = Math.round(N * c / (ncp + 1));
    let best = freeIdx[0];
    for (const k of freeIdx) if (Math.abs(k - want) < Math.abs(best - want)) best = k;
    out[best].t = 'checkpoint'; cps++;
    freeIdx.splice(freeIdx.indexOf(best), 1);
  }
  if (cps < 2) return null;
  // --- 4) Layout
  const pieces = [];
  let serp = null;
  for (const o of out) {
    if (o.t === 'skip') continue;
    const c = C[o.at];
    const pc = { type: o.t, i: c[0], j: c[1], d: o.at === 0 ? dr[0] : dr[(o.at - 1 + n) % n], m: o.m || 1, lvl: o.lvl || 0 };
    if (o.h1 != null) pc.h1 = o.h1;
    if (o.g) pc.g = o.g;
    if (o.tilt0 != null && o.t === 'straight') { pc.tilt0 = o.tilt0; pc.tilt1 = o.tilt1; }
    if (sp && key(c) === sp.first) serp = { c0: [c[0], c[1]] };
    if (sp && key(c) === sp.last && serp && !serp.c1) serp.c1 = [c[0], c[1]];
    pieces.push(pc);
  }
  for (let k = 1; k < pieces.length; k++) {
    const p = pieces[k - 1], q = pieces[k];
    const nx = pieceCells(p.type, p.i, p.j, p.d, p.m).next;
    if (nx[0] !== q.i || nx[1] !== q.j || nx[2] !== q.d) return null;
  }
  const last = pieces[pieces.length - 1], nx = pieceCells(last.type, last.i, last.j, last.d, last.m).next;
  if (nx[0] !== pieces[0].i || nx[1] !== pieces[0].j || nx[2] !== pieces[0].d) return null;
  // jedes Feld höchstens einmal (Kurven-Innenfelder der weiten Kurven inklusive)
  const occ = new Set();
  for (const p of pieces) for (const c of pieceCells(p.type, p.i, p.j, p.d, p.m || 1).cells) { const k = key(c); if (occ.has(k)) return null; occ.add(k); }
  const gel = {};
  if (serp && serp.c1) { gel.serp = [{ ...serp, dir: r.chance(0.5) ? 1 : -1, turns: 2 }]; elems.serpentine = 1; }
  void seed;
  return { pieces, gel, elems };
}
