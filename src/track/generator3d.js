// Strecken-Generator 3D (n19, 30.09.2026): Seed + Schwierigkeit → Rundkurs mit echter Höhe.
// 1) Grundform auf dem 30×30-Raster: meist eine Acht (zwei Schleifen, die sich an einer Stelle rechtwinklig kreuzen),
//    sonst ein Rechteck; beides zufällig ausgebeult (bump aus generator.js), gedreht und gespiegelt.
// 2) Ecken → enge/weite Kurven. Die Kreuzung und ihre Nachbarn bleiben gerade.
// 3) Ebenen: Start auf Ebene 0, an der Kreuzung liegen die beiden Durchfahrten mindestens eine Ebene auseinander.
//    Ebenenwechsel nur über Rampen, Spiralen, Steilrampen und Klippensprünge (pieces_3d.js); dazu „Ausflüge“ nach oben
//    (z. B. Spirale hinauf, Klippensprung hinunter). Höchste Ebene je Stufe D3[diff].maxLvl.
// 4) Stunts (Looping, Schanze, Röhre, Wellen, Korkenzieher …) und Steilkurven/Steilwände nur auf Ebene 0,
//    Checkpoints auf Ebene 0.
// 5) Belegung (i, j, Ebene) prüfen: jedes Feld höchstens einmal, außer an der Kreuzung (zwei Geraden rechtwinklig,
//    Ebenen verschieden). Passt etwas nicht, nächster Versuch (deterministisch aus dem Seed).
// Lösbarkeit prüft wie bisher verify() mit dem Autopiloten (defuse ersetzt ein Teil durch eines gleicher Form).
import { GRID } from './defs.js';
import { rng } from '../core/util.js';
import { pieceCells, PIECES } from './pieces.js';
import { cliffDesign } from './pieces_3d.js';
import { DIFFS, bump, dirIdx, trackName } from './generator.js';

// Je Stufe: höchste Ebene, Seitenlängen der Schleifen, Anteil Acht, Ausflüge nach oben (Chance, Anzahl), Gewichte der
// Ebenenwechsel (auf/ab je Betrag), Stunts (zusätzlich zu DIFFS[diff].types), Ecken-Varianten auf Ebene 0
export const D3 = {
  1: { maxLvl: 2, lobe: [4, 7], rect: [9, 13, 7, 10], eight: 0.65, exc: [0.45, 1], hiMax: 1,
    up: { 1: { slope2: 3, spiral: 3 }, 2: { slope3: 2, spiral: 1 } }, down: { 1: { slope2: 3, spiral: 2, cliff: 1 }, 2: { slope3: 2, spiral: 1 } },
    types: { waves: 2 }, must: ['loop', 'crest', 'waves'], wall: 0, bankC: 0.1 },
  2: { maxLvl: 3, lobe: [4, 8], rect: [11, 15, 8, 11], eight: 0.85, exc: [0.6, 1], hiMax: 2,
    up: { 1: { slope2: 2, spiral: 3, tr_corkud: 1 }, 2: { slope3: 2, spiral: 2 }, 3: { slope4: 1 } }, down: { 1: { slope2: 2, spiral: 2, cliff: 3 }, 2: { slope3: 2, spiral: 1, cliff2: 2 }, 3: { slope4: 1 } },
    types: { waves: 2, tr_corklr: 2 }, must: ['jump', 'loop', 'waves'], wall: 0.2, bankC: 0.15 },
  3: { maxLvl: 4, lobe: [5, 9], rect: [12, 16, 9, 12], eight: 0.9, exc: [0.85, 2], hiMax: 3,
    up: { 1: { slope2: 1, spiral: 3, tr_corkud: 1 }, 2: { slope3: 2, spiral: 3 }, 3: { slope4: 2 } }, down: { 1: { slope2: 1, spiral: 2, cliff: 4 }, 2: { slope3: 1, spiral: 1, cliff2: 4 }, 3: { slope4: 2 } },
    types: { waves: 2, tr_corklr: 2 }, must: ['jump', 'loop', 'tr_corklr', 'waves', 'tube'], wall: 0.35, bankC: 0.15 },
};
const SIDE = new Set(['spiral', 'tr_corkud']);   // brauchen zusätzlich die Felder neben der Fahrbahn
const LEN = { straight: 1, checkpoint: 1, bumps: 1, crest: 2, chicane: 2, loop: 2, tube: 2, jump: 3, waves: 3, tr_corklr: 2 };
const RUNUP = { bumps: 0, crest: 1, chicane: 0, loop: 1, tube: 0, jump: 1, waves: 0, tr_corklr: 1 };
const AFTER = { loop: 1, jump: 1, tube: 1, tr_corklr: 1, waves: 0 };
const key = (p) => p[0] + ',' + p[1];
const cellsOf = (type) => PIECES[type].cells.length === 4 && SIDE.has(type) ? 2 : PIECES[type].cells.length;

// ---------- 1) Grundform ----------
// Acht im Grundrahmen: Kreuzung X, Schleife A rechts unten (im Uhrzeigersinn), Schleife B links oben (gegen den
// Uhrzeigersinn). Durchfahrt 1 in X nach Osten, Durchfahrt 2 nach Norden.
function eightCycle(r, D) {
  const w = () => D.lobe[0] + r.int(D.lobe[1] - D.lobe[0] + 1);
  const Wa = w(), Ha = w(), Wb = w(), Hb = w();
  const cyc = [];
  for (let x = 0; x < Wa - 1; x++) cyc.push([x, 0]);                 // X … nach Osten
  for (let y = 0; y < Ha - 1; y++) cyc.push([Wa - 1, y]);             // nach Süden
  for (let x = Wa - 1; x > 0; x--) cyc.push([x, Ha - 1]);             // nach Westen
  for (let y = Ha - 1; y > 0; y--) cyc.push([0, y]);                  // nach Norden bis vor X
  for (let y = 0; y > -(Hb - 1); y--) cyc.push([0, y]);               // X (2. Durchfahrt) … nach Norden
  for (let x = 0; x > -(Wb - 1); x--) cyc.push([x, -(Hb - 1)]);       // nach Westen
  for (let y = -(Hb - 1); y < 0; y++) cyc.push([-(Wb - 1), y]);       // nach Süden
  for (let x = -(Wb - 1); x < 0; x++) cyc.push([x, 0]);               // nach Osten bis vor X
  return cyc;
}
function rectCycle(r, D) {
  const W = D.rect[0] + r.int(D.rect[1] - D.rect[0] + 1), H = D.rect[2] + r.int(D.rect[3] - D.rect[2] + 1);
  const cyc = [];
  for (let x = 0; x < W - 1; x++) cyc.push([x, 0]);
  for (let y = 0; y < H - 1; y++) cyc.push([W - 1, y]);
  for (let x = W - 1; x > 0; x--) cyc.push([x, H - 1]);
  for (let y = H - 1; y > 0; y--) cyc.push([0, y]);
  return cyc;
}
// Drehen/Spiegeln und mittig ins Raster legen (Rand 2 Felder); null, wenn es nicht passt
function place(cyc, r) {
  const rot = r.int(4), mir = r.chance(0.5);
  let c = cyc.map(([x, y]) => { let p = mir ? [-x, y] : [x, y]; for (let k = 0; k < rot; k++) p = [-p[1], p[0]]; return p; });
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x1 - x0 > GRID - 5 || y1 - y0 > GRID - 5) return null;
  const ox = Math.floor((GRID - (x1 - x0 + 1)) / 2) - x0 + r.int(3) - 1, oy = Math.floor((GRID - (y1 - y0 + 1)) / 2) - y0 + r.int(3) - 1;
  c = c.map(([x, y]) => [x + ox, y + oy]);
  if (c.some(([x, y]) => x < 2 || y < 2 || x > GRID - 3 || y > GRID - 3)) return null;
  // Drehsinn: Mittelwert der Kreuzprodukte bleibt egal – Richtungen ergeben sich aus der Zellfolge
  return c;
}
// Kreuzungsfeld intakt? (zweimal im Kreis, beide Male mit geraden Nachbarn quer zueinander)
function crossOk(cyc) {
  const n = cyc.length, cnt = new Map();
  cyc.forEach((p, i) => { const k = key(p); cnt.set(k, [...(cnt.get(k) || []), i]); });
  const X = [...cnt.values()].filter((a) => a.length > 1);
  for (const a of X) {
    if (a.length !== 2) return false;
    const dirs = a.map((i) => { const pr = cyc[(i - 1 + n) % n], nx = cyc[(i + 1) % n], p = cyc[i]; return [dirIdx(pr, p), dirIdx(p, nx)]; });
    for (const [a1, b1] of dirs) if (a1 !== b1) return false;
    if (dirs[0][0] % 2 === dirs[1][0] % 2) return false;
  }
  return true;
}

// ---------- Hauptfunktion ----------
export function generate3d(seed, diff, opts = {}) {
  const D = D3[diff], base = DIFFS[diff];
  for (let attempt = 0; attempt < 40; attempt++) {
    const r = rng(((seed >>> 0) * 7919 + diff * 104729 + (opts.variant || 0) * 7727 + attempt * 31337 + 0x3d0) >>> 0);
    const lay = tryBuild(r, D, base, diff);
    if (!lay) continue;
    lay.seed = seed; lay.diff = diff;
    // Schlüssel ohne Variante: fällt Variante 0 bei der Autopilot-Prüfung durch, gilt für alle dieselbe Ersatz-Variante
    const k = `${seed}-${diff}-3d`;
    lay.meta = { seed, diff, d3: true, variant: opts.variant || 0, key: k, name: trackName(seed), diffName: base.name, levels: lay.maxLvl, crossings: lay.crossings, attempt };
    delete lay.maxLvl; delete lay.crossings;
    return lay;
  }
  throw new Error('3D-Generator: keine Strecke für ' + seed + '-' + diff);
}

function tryBuild(r, D, base, diff) {
  // --- 1) Grundform
  const eight = r.chance(D.eight);
  let cyc = place(eight ? eightCycle(r, D) : rectCycle(r, D), r);
  if (!cyc) return null;
  const nb = base.bumps[0] + r.int(base.bumps[1] - base.bumps[0] + 1);
  for (let k = 0, tries = 0; k < nb && tries < 300; tries++) {
    const res = bump(cyc, r);
    if (res && (!eight || crossOk(res))) { cyc = res; k++; }
  }
  if (eight && !crossOk(cyc)) return null;
  let n = cyc.length;
  let dir = cyc.map((c, i) => dirIdx(c, cyc[(i + 1) % n]));
  const isTurn = cyc.map((c, i) => dir[i] !== dir[(i - 1 + n) % n]);
  const cnt = new Map();
  cyc.forEach((p) => cnt.set(key(p), (cnt.get(key(p)) || 0) + 1));
  const isX = cyc.map((p) => cnt.get(key(p)) === 2);
  // Start: Mitte der längsten Gerade ohne Kreuzung
  let bestLen = 0, bestStart = -1;
  for (let i = 0; i < n; i++) {
    if (isTurn[i] || !isTurn[(i - 1 + n) % n]) continue;
    let l = 0; while (l < n && !isTurn[(i + l) % n]) l++;
    let hasX = false; for (let q = 0; q < l; q++) if (isX[(i + q) % n]) hasX = true;
    if (!hasX && l > bestLen) { bestLen = l; bestStart = i; }
  }
  if (bestStart < 0 || bestLen < 4) return null;
  const s0 = (bestStart + Math.max(0, Math.floor(bestLen / 2) - 2)) % n;
  cyc = cyc.slice(s0).concat(cyc.slice(0, s0));
  dir = dir.slice(s0).concat(dir.slice(0, s0));
  const tr = isTurn.slice(s0).concat(isTurn.slice(0, s0));
  const xs = isX.slice(s0).concat(isX.slice(0, s0));
  const used = new Set(cyc.map(key));

  // --- 2) Stücke: Kurven + Geraden, weite Kurven wo Platz (nicht an der Kreuzung)
  let items = [];
  for (let i = 0; i < n; i++) {
    if (tr[i]) { const m = ((dir[i] - dir[(i - 1 + n) % n] + 4) % 4) === 1 ? 1 : -1; items.push({ t: 'turnS', cells: 1, m, at: i }); }
    else items.push({ t: 'straight', cells: 1, at: i, x: xs[i] });
  }
  // Sperren: Kreuzung ±1, Start und das Stück danach
  const lock = (k) => { if (items[k]) items[k].lock = 1; };
  items.forEach((it, k) => { if (it.x) { lock(k - 1); lock(k); lock(k + 1); } });
  lock(0); lock(1);
  for (let k = 2; k < items.length - 1; k++) {
    const a = items[k - 1], b = items[k], c = items[k + 1];
    if (b.t !== 'turnS' || a.t !== 'straight' || c.t !== 'straight' || a.lock || c.lock) continue;
    if (!r.chance(base.large)) continue;
    const P = cyc[a.at], N = cyc[c.at];
    const inner = [P[0] + N[0] - cyc[b.at][0], P[1] + N[1] - cyc[b.at][1]];
    if (used.has(key(inner))) continue;
    used.add(key(inner));
    items.splice(k - 1, 3, { t: 'turnL', cells: 3, m: b.m, at: a.at });
  }
  const out = items.map((it) => ({ ...it }));
  out[0].t = 'start';
  const N = out.length;
  const pos = (k) => cyc[out[k].at];
  const dirAt = (k) => dir[(out[k].at - 1 + cyc.length) % cyc.length];

  // --- 3) Ebenen
  const xIdx = out.map((o, k) => (o.x ? k : -1)).filter((k) => k >= 0);
  const segs = [];
  let hiLvl = 0;
  if (xIdx.length === 2) {
    const hi = 1 + r.int(Math.min(D.hiMax, D.maxLvl)), lo = hi >= 2 && r.chance(0.25) ? 1 : 0;
    const first = r.chance(0.5) ? [lo, hi] : [hi, lo];
    segs.push([2, xIdx[0], 0, first[0]], [xIdx[0] + 1, xIdx[1], first[0], first[1]], [xIdx[1] + 1, N, first[1], 0]);
    hiLvl = hi;
  } else segs.push([2, N, 0, 0]);
  const free = (k) => out[k] && out[k].t === 'straight' && !out[k].lock && !out[k].lv3;
  const pickW = (w) => { const e = Object.entries(w || {}); const tot = e.reduce((s, [, v]) => s + v, 0); let x = r() * tot; for (const [t, v] of e) { x -= v; if (x <= 0) return t; } return e.length ? e[0][0] : null; };
  // Element t (Ebenenwechsel dl) an Stelle k? Felder frei, Seitenfelder (Spirale/Wendel) frei
  const fitsLvl = (t, k, m) => {
    const c = cellsOf(t);
    for (let q = k; q < k + c; q++) if (!free(q)) return null;
    const cells = pieceCells(t, pos(k)[0], pos(k)[1], dirAt(k), m).cells;
    const extra = [];
    for (let q = 0; q < cells.length; q++) {
      const kk = key(cells[q]);
      if (q < c) { if (kk !== key(pos(k + q))) return null; continue; }
      if (used.has(kk) || cells[q][0] < 1 || cells[q][1] < 1 || cells[q][0] > GRID - 2 || cells[q][1] > GRID - 2) return null;
      extra.push(kk);
    }
    return extra;
  };
  const putLvl = (t, k, m, dl, extra) => {
    const c = cellsOf(t);
    out[k].t = t; out[k].cells = c; out[k].m = m; out[k].dl = dl; out[k].lv3 = 1;
    for (let q = k + 1; q < k + c; q++) { out[q].t = 'skip'; out[q].lv3 = 1; }
    for (const e of extra) used.add(e);
  };
  // Schritte eines Abschnitts: Grund-Unterschied B−A (in Stücken ≤ 3) + Ausflüge (hinauf k … hinunter k)
  const planSeg = (A, B, len) => {
    const steps = [];
    let d = B - A;
    while (d) { const s = Math.sign(d) * Math.min(Math.abs(d), 1 + r.int(Math.min(3, Math.abs(d)))); steps.push(s); d -= s; }
    const nExc = r.chance(segs.length === 1 ? 1 : D.exc[0]) ? 1 + r.int(D.exc[1]) : 0;
    for (let e = 0; e < nExc && len > 14 * (e + 1); e++) {
      const top = Math.max(A, B) + 1;
      if (top > D.maxLvl) break;
      const k = 1 + r.int(Math.min(2, D.maxLvl - Math.max(A, B)));
      steps.unshift(k); steps.push(-k);
    }
    return steps;
  };
  for (const [a, b, A, B] of segs) {
    const steps = planSeg(A, B, b - a);
    let cur = A, cursor = a;
    for (let si = 0; si < steps.length; si++) {
      const dl = steps[si], mag = Math.abs(dl);
      const W = { ...(dl > 0 ? D.up : D.down)[mag] };
      if (cur + dl < 0 || cur + dl > D.maxLvl) return null;
      if (!(cur >= 1)) { delete W.cliff; delete W.cliff2; }
      if (mag === 2 && !(cur >= 2 && dl < 0)) delete W.cliff2;
      if (dl < 0 && cur + dl < 0) delete W.cliff;
      // Ziel: gleichmäßig über den Rest des Abschnitts verteilt
      const target = cursor + Math.floor((b - cursor) / (steps.length - si + 1));
      let placed = false;
      for (let tries = 0; tries < 4 && !placed; tries++) {
        let t = tries < 2 ? pickW(W) : mag <= 2 ? 'slope2' : 'slope3';
        if (!t) t = mag <= 2 ? 'slope2' : 'slope3';
        if (t === 'cliff' && mag !== 1) t = 'slope2';
        if (t === 'cliff' && mag === 1 && cliffDesign(6).cells > 3) t = 'slope2';
        let best = -1, bm = 1, bex = null, bd = 1e9;
        for (let k = cursor; k < b; k++) {
          for (const m of SIDE.has(t) ? [1, -1] : [1]) {
            const ex = fitsLvl(t, k, m);
            if (!ex) continue;
            const dd = Math.abs(k - target) + r() * 2;
            if (dd < bd) { bd = dd; best = k; bm = m; bex = ex; }
          }
        }
        if (best < 0) continue;
        putLvl(t, best, bm, dl, bex);
        cursor = best + cellsOf(t) + 1;
        cur += dl; placed = true;
      }
      if (!placed) return null;
    }
    if (cur !== B) return null;
  }
  // Ebene je Stück
  let lv = 0, maxLvl = 0;
  for (const o of out) {
    o.lv = lv;
    if (o.dl) { o.h1 = lv + o.dl; lv = o.h1; }
    maxLvl = Math.max(maxLvl, lv);
  }
  if (lv !== 0 || maxLvl < 1) return null;
  // gerade Stücke in Kurven (Wendel) prüfen – Spirale/Wendel nur auf Geraden gesetzt (fitsLvl)

  // --- 4) Ecken und Stunts auf Ebene 0
  for (const o of out) {
    if (o.t !== 'turnL' || o.lv) continue;
    const x = r();
    if (x < D.wall) o.t = 'wall';
    else if (x < D.wall + D.bankC) o.t = 'tr_bankC';
    else if (r.chance(base.bank)) o.t = 'bank';
  }
  const types = { ...base.types, ...D.types };
  delete types.bridge;   // alte Brücke (Rampe–Brücke–Rampe) gibt es in 3D als Rampen/Hochstraße
  const weights = Object.entries(types);
  const pickType = () => { const tot = weights.reduce((s, [, w]) => s + w, 0); let x = r() * tot; for (const [t, w] of weights) { x -= w; if (x <= 0) return t; } return weights[0][0]; };
  const placed = [];
  const fitsSt = (t, s) => {
    const lo = s - RUNUP[t], hi = s + LEN[t] - 1 + (AFTER[t] || 0);
    if (lo < 1 || hi >= N) return false;
    for (let q = lo; q <= hi; q++) if (out[q].t !== 'straight' || out[q].lv || out[q].lock) return false;
    return true;
  };
  const putSt = (t, s) => { out[s].t = t; out[s].cells = LEN[t]; for (let q = s + 1; q < s + LEN[t]; q++) out[q].t = 'skip'; placed.push({ t, at: s }); };
  const cand = (t) => { const c = []; for (let s = 2; s < N; s++) if (fitsSt(t, s)) c.push(s); return c; };
  for (const t of D.must) {
    const c = cand(t);
    if (!c.length) continue;
    let best = c[r.int(c.length)], bd = -1;
    for (let k = 0; k < 6; k++) {
      const s = c[r.int(c.length)];
      const d = placed.length ? Math.min(...placed.map((p) => Math.min(Math.abs(p.at - s), N - Math.abs(p.at - s)))) : r.int(100);
      if (d > bd) { bd = d; best = s; }
    }
    putSt(t, best);
  }
  for (let s = 2; s < N; s++) {
    if (!r.chance(base.density)) continue;
    const t = pickType();
    if (fitsSt(t, s)) putSt(t, s);
  }
  // Checkpoints auf Ebene 0 (Tore brauchen Boden)
  const ncp = diff === 1 ? 2 : 3;
  const freeIdx = out.map((o, k) => (o.t === 'straight' && !o.lv && !o.x && k > 3 ? k : -1)).filter((k) => k >= 0);
  let cps = 0;
  for (let c = 1; c <= ncp && freeIdx.length; c++) {
    const want = Math.round(N * c / (ncp + 1));
    let best = freeIdx[0];
    for (const k of freeIdx) if (Math.abs(k - want) < Math.abs(best - want)) best = k;
    out[best].t = 'checkpoint'; cps++;
    freeIdx.splice(freeIdx.indexOf(best), 1);
  }
  if (cps < 2) return null;

  // --- 5) Layout + Belegung prüfen
  const pieces = [];
  for (const o of out) {
    if (o.t === 'skip') continue;
    const c = cyc[o.at];
    const pc = { type: o.t, i: c[0], j: c[1], d: o.at === 0 ? dir[0] : dir[(o.at - 1 + cyc.length) % cyc.length], m: o.m || 1, lvl: o.lv };
    if (o.h1 != null) pc.h1 = o.h1;
    if (o.t === 'tr_corkud' && pc.h1 == null) pc.h1 = pc.lvl;
    pieces.push(pc);
  }
  for (let k = 1; k < pieces.length; k++) {
    const p = pieces[k - 1], q = pieces[k];
    const nx = pieceCells(p.type, p.i, p.j, p.d, p.m).next;
    if (nx[0] !== q.i || nx[1] !== q.j || nx[2] !== q.d) return null;
  }
  const last = pieces[pieces.length - 1], nx = pieceCells(last.type, last.i, last.j, last.d, last.m).next;
  if (nx[0] !== pieces[0].i || nx[1] !== pieces[0].j || nx[2] !== pieces[0].d) return null;
  const occ = checkOccupancy(pieces);
  if (!occ.ok) return null;
  return { pieces, maxLvl, crossings: occ.crossings };
}

// Belegung (i, j, Ebene): jedes Feld höchstens einmal; Ausnahme Kreuzung = zwei Geraden quer zueinander auf
// verschiedenen Ebenen (Durchfahrtshöhe = Ebenenabstand ≥ LEVEL_H). Liefert { ok, crossings, bad }.
const STRAIGHT = new Set(['straight', 'checkpoint', 'start']);
export function checkOccupancy(pieces) {
  const m = new Map();
  let crossings = 0, bad = null;
  for (const p of pieces) {
    for (const c of pieceCells(p.type, p.i, p.j, p.d, p.m || 1).cells) {
      const k = key(c);
      const e = { p, lo: Math.min(p.lvl || 0, p.h1 ?? p.lvl ?? 0), hi: Math.max(p.lvl || 0, p.h1 ?? p.lvl ?? 0) };
      if (!m.has(k)) { m.set(k, [e]); continue; }
      const o = m.get(k);
      if (o.length > 1) { bad = bad || k; continue; }
      const q = o[0];
      const okX = STRAIGHT.has(p.type) && STRAIGHT.has(q.p.type) && p.d % 2 !== q.p.d % 2 && (e.lo >= q.hi + 1 || q.lo >= e.hi + 1);
      if (okX) crossings++; else bad = bad || k;
      o.push(e);
    }
  }
  return { ok: !bad, crossings, bad };
}
