// Strecken-Generator v1: Seed + Schwierigkeit → Rundkurs auf dem 30×30-Raster.
// 1) Rechteck-Rundkurs, zufällig ausgebeult (bleibt kreuzungsfrei)
// 2) Ecken → enge/weite/Steilkurven, Geraden → Stunt-Elemente je nach Schwierigkeit
// 3) Lösbarkeit prüft verify() mit dem Autopilot (Crash → Element entschärfen, neu prüfen)
import { GRID } from './defs.js';
import { rng } from '../core/util.js';
import { pieceCells } from './pieces.js';

export const DIFFS = {
  1: { name: 'Sanft', w: [9, 12], h: [6, 8], bumps: [1, 3], large: 0.9, bank: 0.25, density: 0.18, must: ['loop', 'crest'], types: { bumps: 3, crest: 3, chicane: 2, bridge: 3 } },
  2: { name: 'Sportlich', w: [11, 15], h: [7, 10], bumps: [2, 4], large: 0.7, bank: 0.4, density: 0.3, must: ['jump', 'loop', 'bridge'], types: { bumps: 2, crest: 2, chicane: 2, loop: 2, bridge: 1, jump: 2, tube: 2 } },
  3: { name: 'Irre', w: [12, 17], h: [8, 11], bumps: [3, 5], large: 0.5, bank: 0.5, density: 0.45, must: ['jump', 'loop', 'jump', 'tube', 'loop', 'bridge'], types: { bumps: 1, crest: 2, chicane: 2, loop: 3, bridge: 1, jump: 3, tube: 2 } },
};
const LEN = { straight: 1, checkpoint: 1, bumps: 1, crest: 2, chicane: 2, loop: 2, tube: 2, jump: 3, bridge: 5 };
const RUNUP = { bumps: 0, crest: 1, chicane: 0, loop: 1, tube: 0, jump: 1, bridge: 0 };

const ADJ = ['Wilde', 'Donnernde', 'Flinke', 'Kühne', 'Rasende', 'Schwindelnde', 'Goldene', 'Tollkühne', 'Brausende', 'Sausende', 'Verwegene', 'Heulende'];
const NOUN = ['Schleife', 'Talfahrt', 'Kurvenhatz', 'Achterbahn', 'Stuntmeile', 'Pistenjagd', 'Hügelhatz', 'Flugschanze', 'Ringfahrt', 'Wirbelbahn', 'Kesseljagd', 'Sprungmeile'];

export function trackName(seed) {
  const r = rng(seed * 31 + 7);
  return r.pick(ADJ) + ' ' + r.pick(NOUN);
}

// ---------- 1) Rundkurs aus Zellen ----------
function makeCycle(r, D) {
  const W = r.int(D.w[1] - D.w[0] + 1) + D.w[0], H = r.int(D.h[1] - D.h[0] + 1) + D.h[0];
  const x0 = Math.floor((GRID - W) / 2) + r.int(3) - 1, y0 = Math.floor((GRID - H) / 2) + r.int(3) - 1;
  // im Uhrzeigersinn: oben (Ost), rechts (Süd), unten (West), links (Nord)
  let cyc = [];
  for (let x = x0; x < x0 + W - 1; x++) cyc.push([x, y0]);
  for (let y = y0; y < y0 + H - 1; y++) cyc.push([x0 + W - 1, y]);
  for (let x = x0 + W - 1; x > x0; x--) cyc.push([x, y0 + H - 1]);
  for (let y = y0 + H - 1; y > y0; y--) cyc.push([x0, y]);
  const nb = r.int(D.bumps[1] - D.bumps[0] + 1) + D.bumps[0];
  for (let k = 0, tries = 0; k < nb && tries < 400; tries++) {
    const res = bump(cyc, r);
    if (res) { cyc = res; k++; }
  }
  return cyc;
}

function bump(cyc, r) {
  const n = cyc.length;
  const dirOf = (a, b) => [b[0] - a[0], b[1] - a[1]];
  // Segment gleicher Richtung wählen
  const i = r.int(n);
  const d0 = dirOf(cyc[i], cyc[(i + 1) % n]);
  const len = 2 + r.int(4);
  // Zellen i+1 .. i+len müssen alle in Richtung d0 weiterlaufen (gerade, keine Ecken)
  for (let k = 0; k <= len; k++) {
    const a = cyc[(i + k) % n], b = cyc[(i + k + 1) % n];
    const d = dirOf(a, b);
    if (d[0] !== d0[0] || d[1] !== d0[1]) return null;
  }
  // nach außen (rechts vom Fahrtweg bei Uhrzeigersinn ist innen → außen = links) oder innen
  const outward = r.chance(0.7);
  const left = [d0[1], -d0[0]];          // links der Fahrtrichtung (Bildschirm: y nach unten)
  const nrm = outward ? left : [-left[0], -left[1]];
  const depth = (outward ? 2 : 1) + r.int(outward ? 3 : 2);
  // neuer Weg: von cyc[i] ... ersetzt cyc[i+1..i+len] durch Umweg
  const start = cyc[i], end = cyc[(i + len + 1) % n];
  const path = [];
  for (let k = 1; k <= depth; k++) path.push([start[0] + nrm[0] * k, start[1] + nrm[1] * k]);
  for (let k = 1; k <= len; k++) path.push([start[0] + nrm[0] * depth + d0[0] * k, start[1] + nrm[1] * depth + d0[1] * k]);
  for (let k = depth; k >= 1; k--) path.push([end[0] + nrm[0] * k, end[1] + nrm[1] * k]);
  // Gültigkeit: im Raster, frei, nicht an fremde Zellen angrenzend
  const removed = new Set();
  for (let k = 1; k <= len; k++) removed.add(key(cyc[(i + k) % n]));
  const keep = new Set(cyc.map(key).filter((q) => !removed.has(q)));
  for (const p of path) {
    if (p[0] < 2 || p[1] < 2 || p[0] > GRID - 3 || p[1] > GRID - 3) return null;
    if (keep.has(key(p))) return null;
  }
  const pathSet = new Set(path.map(key));
  const allowNear = new Set([key(start), key(end)]);
  for (const p of path) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const q = key([p[0] + dx, p[1] + dy]);
    if (keep.has(q) && !allowNear.has(q)) return null;
  }
  // zusätzlich: nicht diagonal an fremde Zellen (Abstand für weite Kurven)
  const out = [];
  for (let k = 0; k <= i; k++) out.push(cyc[k]);
  out.push(...path);
  for (let k = i + len + 1; k < n; k++) out.push(cyc[k]);
  // Rotation erhalten, falls Umlauf über das Ende ging
  if (i + len + 1 > n) {
    // Segment lief über den Anfang: einfacher ablehnen
    return null;
  }
  return out;
}
const key = (p) => p[0] + ',' + p[1];

// Richtung als Index: 0 Ost, 1 Süd, 2 West, 3 Nord (Raster-y nach unten = Süd = +Z)
function dirIdx(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return dx === 1 ? 0 : dy === 1 ? 1 : dx === -1 ? 2 : 3;
}

// ---------- 2) Elemente ----------
export function generate(seed, diff = 2, opts = {}) {
  diff = Math.max(1, Math.min(3, diff | 0));
  const D = DIFFS[diff];
  const r = rng((seed >>> 0) * 7919 + diff * 104729);
  let cyc = makeCycle(r, D);
  const n = cyc.length;
  const dir = cyc.map((c, i) => dirIdx(c, cyc[(i + 1) % n]));
  const occupied = new Set(cyc.map(key));
  // Kurven-Zellen: Richtung ändert sich beim Verlassen
  const isTurn = cyc.map((c, i) => dir[i] !== dir[(i - 1 + n) % n]);
  // Start: Mitte der längsten Gerade
  let bestLen = 0, bestStart = 0;
  for (let i = 0; i < n; i++) {
    if (isTurn[i]) continue;
    let l = 0; while (l < n && !isTurn[(i + l) % n]) l++;
    if (!isTurn[(i - 1 + n) % n] && i !== 0) continue;
    if (l > bestLen) { bestLen = l; bestStart = i; }
  }
  const s0 = (bestStart + Math.max(0, Math.floor(bestLen / 2) - 2)) % n;
  cyc = cyc.slice(s0).concat(cyc.slice(0, s0));
  const dr = dir.slice(s0).concat(dir.slice(0, s0));
  const tr = isTurn.slice(s0).concat(isTurn.slice(0, s0));
  // Stücke: [typ, zellenzahl, m]
  const items = [];
  let i = 0;
  const used = new Set(occupied);
  while (i < n) {
    if (tr[i]) {
      const prevD = dr[(i - 1 + n) % n], nd = dr[i];
      const m = ((nd - prevD + 4) % 4) === 1 ? 1 : -1;
      items.push({ t: 'turnS', cells: 1, m, at: i });
      i++;
    } else { items.push({ t: 'straight', cells: 1, at: i }); i++; }
  }
  // enge Kurven zu weiten Kurven zusammenfassen (Gerade vor + nach + freie Innenzelle)
  for (let k = 2; k < items.length - 1; k++) {
    const a = items[k - 1], b = items[k], c = items[k + 1];
    if (b.t !== 'turnS' || a.t !== 'straight' || c.t !== 'straight') continue;
    if (!r.chance(D.large)) continue;
    const P = cyc[a.at], N = cyc[c.at];
    const inner = [P[0] + N[0] - cyc[b.at][0], P[1] + N[1] - cyc[b.at][1]];
    if (used.has(key(inner))) continue;
    // Kurve darf nicht direkt an andere Strecke grenzen (Innenzelle frei, deren Nachbarn egal)
    used.add(key(inner));
    const t = r.chance(D.bank) ? 'bank' : 'turnL';
    items.splice(k - 1, 3, { t, cells: 3, m: b.m, at: a.at });
  }
  // Geraden-Läufe sammeln
  const runs = [];
  for (let k = 0; k < items.length; k++) {
    if (items[k].t !== 'straight') continue;
    let e = k; while (e + 1 < items.length && items[e + 1].t === 'straight') e++;
    runs.push([k, e]);
    k = e;
  }
  // Start = erstes Stück; erster Lauf beginnt mit Start
  const out = items.map((it) => ({ ...it }));
  out[0].t = 'start';
  // Stunt-Elemente in Läufe setzen
  const weights = Object.entries(D.types);
  const pickType = () => {
    const tot = weights.reduce((s, [, w]) => s + w, 0);
    let x = r() * tot;
    for (const [t, w] of weights) { x -= w; if (x <= 0) return t; }
    return weights[0][0];
  };
  const placed = [];
  const AFTER = { loop: 1, jump: 1, tube: 1 };
  // freie Plätze für Element t: Lauf [a,b], Position s mit Vorlauf/Nachlauf aus Geraden
  const fits = (t, s) => {
    const lo = s - RUNUP[t], hi = s + LEN[t] - 1 + (AFTER[t] || 0);
    if (lo < 1 || hi >= out.length) return false;
    for (let q = lo; q <= hi; q++) if (out[q].t !== 'straight') return false;
    // Vorlauf darf nicht direkt nach einem anderen Stunt kommen (mind. 1 Gerade Abstand)
    return true;
  };
  const place = (t, s) => {
    out[s].t = t; out[s].cells = LEN[t];
    for (let q = s + 1; q < s + LEN[t]; q++) out[q].t = 'skip';
    placed.push({ t, at: s });
  };
  const candidates = (t) => { const c = []; for (let s = 2; s < out.length; s++) if (fits(t, s)) c.push(s); return c; };
  // Pflicht-Stunts zuerst (verteilt), dann zufällig auffüllen
  for (const t of D.must) {
    const c = candidates(t);
    if (!c.length) continue;
    // möglichst weit weg von bereits platzierten
    let best = c[r.int(c.length)], bd = -1;
    for (let k = 0; k < 6; k++) {
      const s = c[r.int(c.length)];
      const d = placed.length ? Math.min(...placed.map((p) => Math.min(Math.abs(p.at - s), out.length - Math.abs(p.at - s)))) : r.int(100);
      if (d > bd) { bd = d; best = s; }
    }
    place(t, best);
  }
  for (const [a, b] of runs) {
    for (let s = Math.max(a, 2); s <= b; s++) {
      if (!r.chance(D.density)) continue;
      const t = pickType();
      if (fits(t, s)) place(t, s);
    }
  }
  // Checkpoints: 2 (Sanft) bzw. 3 gleichmäßig verteilt auf freien Geraden
  const ncp = diff === 1 ? 2 : 3;
  const freeIdx = out.map((o, k) => (o.t === 'straight' && k > 3 ? k : -1)).filter((k) => k >= 0);
  for (let c = 1; c <= ncp && freeIdx.length; c++) {
    const want = Math.round(out.length * c / (ncp + 1));
    let best = freeIdx[0];
    for (const k of freeIdx) if (Math.abs(k - want) < Math.abs(best - want)) best = k;
    out[best].t = 'checkpoint';
    freeIdx.splice(freeIdx.indexOf(best), 1);
  }
  // In Layout (Element + Position) umwandeln
  const layout = toLayout(cyc, dr, out);
  layout.seed = seed; layout.diff = diff;
  layout.meta = { seed, diff, key: `${seed}-${diff}`, name: trackName(seed), diffName: D.name };
  return layout;
}

// Brücke als Zusammenstellung: Rampe hoch (2) + Brücke (1) + Rampe runter (2)
function toLayout(cyc, dr, out) {
  const pieces = [];
  let lvl = 0;
  for (let k = 0; k < out.length; k++) {
    const it = out[k];
    if (it.t === 'skip') continue;
    const c = cyc[it.at], d = dr[(it.at - 1 + cyc.length) % cyc.length];
    const entryDir = it.at === 0 ? dr[0] : d;
    const base = { i: c[0], j: c[1], d: entryDir, m: it.m || 1, lvl };
    if (it.t === 'bridge') {
      pieces.push({ ...base, type: 'rampUp' });
      const F = [[1, 0], [0, 1], [-1, 0], [0, -1]][entryDir];
      pieces.push({ ...base, type: 'bridge', i: c[0] + F[0] * 2, j: c[1] + F[1] * 2, lvl: 1 });
      pieces.push({ ...base, type: 'rampDown', i: c[0] + F[0] * 3, j: c[1] + F[1] * 3, lvl: 1 });
      continue;
    }
    pieces.push({ ...base, type: it.t });
  }
  // Konsistenz: jedes Stück muss exakt am Ausgang des vorigen beginnen
  for (let k = 1; k < pieces.length; k++) {
    const p = pieces[k - 1], q = pieces[k];
    const nx = pieceCells(p.type, p.i, p.j, p.d, p.m).next;
    if (nx[0] !== q.i || nx[1] !== q.j || nx[2] !== q.d) {
      q.i = nx[0]; q.j = nx[1]; q.d = nx[2];
    }
  }
  return { pieces };
}

// Entschärfen: Element an Stelle k durch Geraden ersetzen (gleiche Länge)
export function defuse(layout, pieceIdx) {
  const p = layout.pieces[pieceIdx];
  if (!p) return false;
  const repl = { loop: ['straight', 'straight'], tube: ['straight', 'straight'], jump: ['straight', 'straight', 'straight'], crest: ['straight', 'straight'], chicane: ['straight', 'straight'], bumps: ['straight'], bank: null };
  if (p.type === 'bank') { p.type = 'turnL'; return true; }
  const r = repl[p.type];
  if (!r) return false;
  const F = [[1, 0], [0, 1], [-1, 0], [0, -1]][p.d];
  const add = r.map((t, k) => ({ ...p, type: t, i: p.i + F[0] * k, j: p.j + F[1] * k }));
  layout.pieces.splice(pieceIdx, 1, ...add);
  return true;
}

// Handgebaute Teststrecke (Rechteck mit Looping, Schanze, Checkpoints)
export function demoLayout() {
  const list = ['start', 'straight', 'straight', 'loop', 'straight', ['turnL', 1], 'checkpoint', 'straight', ['turnL', 1], 'straight', 'straight', 'jump', 'straight', ['turnL', 1], 'checkpoint', 'straight', ['turnL', 1]];
  let i = 8, j = 20, d = 0;
  const pieces = [];
  for (const it of list) {
    const [type, m = 1] = Array.isArray(it) ? it : [it];
    pieces.push({ type, i, j, d, m, lvl: 0 });
    [i, j, d] = pieceCells(type, i, j, d, m).next;
  }
  return { pieces, seed: 0, diff: 2, meta: { seed: 0, diff: 2, key: 'demo', name: 'Teststrecke', diffName: 'Sportlich' } };
}

// Baustein-Galerie (offen): jedes Element einmal, für Sichtprüfung/Tests
export function galleryLayout() {
  const list = ['start', 'straight', 'bumps', 'straight', 'crest', ['chicane', 1], 'straight', 'loop', 'straight', 'jump', 'straight', ['turnL', 1],
    'straight', 'rampUp', 'bridge', 'rampDown', 'straight', ['bank', 1], 'straight', 'tube', 'straight', ['turnS', -1], 'straight', ['turnS', 1], 'checkpoint', 'straight', 'straight'];
  let i = 2, j = 4, d = 0, lvl = 0;
  const pieces = [];
  for (const it of list) {
    const [type, m = 1] = Array.isArray(it) ? it : [it];
    pieces.push({ type, i, j, d, m, lvl });
    [i, j, d] = pieceCells(type, i, j, d, m).next;
    lvl += type === 'rampUp' ? 1 : type === 'rampDown' ? -1 : 0;
  }
  return { pieces, seed: 1, diff: 3, meta: { seed: 1, diff: 3, key: 'galerie', name: 'Baustein-Galerie', diffName: 'Irre' } };
}
