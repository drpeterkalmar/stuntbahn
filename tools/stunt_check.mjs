// n26 Stunt-Maßstab: Überlappungs-Prüfung der (größeren) Stunt-Bauwerke. Je Strecke (Zufall flach/3D/Gelände je Stufe,
// Demo, Galerien, Sammlung) und je Stunt-Stück die Ecken seiner Kollisionsdreiecke (Fahrbahn, Wände, Stützen, Bügel,
// Portale; build.js opt.tagCol):
//   Feld     – wie weit ragt das Bauwerk waagrecht aus seinen Feldern (m, größter Wert je Stück-Art)
//   Fahrbahn – Ecken im Lichtraum einer ANDEREN Fahrbahn (waagrecht < halbe Breite + 0,2 m, 0,25 … 4,6 m über ihr)
//   Deko     – Bäume, Tribünen, Zuschauer, Masten, Hütten, Reifenstapel … (Grundfläche r) auf einem Bauteil, das ≥ 0,3 m
//              über dem Gelände steht (Stütze, Bügel, Wand)
//   Gelände  – Gelände über der Fahrbahn eines Stunt-Stücks (aufrecht befahrene Punkte, > 2 cm)
// Vergleich: STUNT_STUNT=1 node tools/stunt_check.mjs --json=alt.json   gegen   node tools/stunt_check.mjs --json=neu.json
// Aufruf: node tools/stunt_check.mjs [--n=40] [--sam=250] [--json=datei] [--deko=0]
import fs from 'fs';
import path from 'path';
import url from 'url';
import { generate, demoLayout, galleryLayout, galleryGelLayout } from '../src/track/generator.js';
import { buildTrack } from '../src/track/build.js';
import { planDeco } from '../src/track/deco.js';
import { THEMES } from '../src/track/themes.js';
import { TILE, tileX, tileZ, STUNT_SCALE } from '../src/track/defs.js';
import { PIECES } from '../src/track/pieces.js';
import { HASH_SEEDS } from '../tests/node/layout_hash.mjs';
import { tracksOf } from '../src/game/sammlung.js';
import { parseTrk } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
// Stück-Arten mit Stunt-Bauwerk (alles, was der Stunt-Maßstab verändert, und die übrigen Stunts zum Vergleich)
export const STUNT_TYPES = new Set(['loop', 'tube', 'tr_corklr', 'jump', 'waves', 'wall', 'halfpipe', 'crest', 'bumps', 'cliff', 'cliff2', 'spiral', 'bank', 'tr_loop', 'tr_pipe', 'tr_pipeT']);
// Grundfläche (Radius, m) der Deko-Arten, die mit Bauteilen kollidieren könnten (Gras/Blumen zählen nicht)
const FOOT = { laub: 1.5, tree: 1.5, stand: 5, crowd: 2.5, mast: 0.8, hut: 3, board: 1, flag: 0.4, tyre: 0.8, bush: 1, rock: 1.2, portal: 0.6, banner: 0.5, cam: 1.5 };

export function checkTrack(layout, opt = {}) {
  const t = buildTrack(layout, { tagCol: true });
  const L = t.line, C = t.col, T = t.terrain, P = layout.pieces;
  const res = { feld: {}, fahrbahn: [], deko: [], gelaende: [], stunts: {} };
  // Linienpunkte in ein 10-m-Raster (ohne Luft)
  const G = new Map(), cs = 10;
  for (let i = 0; i < L.n; i++) { if (L.air[i]) continue; const k = Math.floor(L.px[i] / cs) + ',' + Math.floor(L.pz[i] / cs); (G.get(k) || G.set(k, []).get(k)).push(i); }
  // Ecken je Stunt-Stück
  const verts = new Map();
  for (let q = 0; q < C.mat.length; q++) {
    const pi = C.piece[q];
    if (pi < 0 || !P[pi] || !STUNT_TYPES.has(P[pi].type)) continue;
    let a = verts.get(pi); if (!a) verts.set(pi, a = []);
    for (let v = 0; v < 3; v++) a.push(C.pos[q * 9 + v * 3], C.pos[q * 9 + v * 3 + 1], C.pos[q * 9 + v * 3 + 2]);
  }
  const high = [];   // Bauteil-Ecken ≥ 0,3 m über Gelände (für die Deko)
  for (const [pi, a] of verts) {
    const pc = P[pi], type = pc.type, info = t.pieces[pi];
    res.stunts[type] = (res.stunts[type] || 0) + 1;
    // Feld: waagrechter Abstand außerhalb der Vereinigung der Felder
    let over = 0;
    for (let k = 0; k < a.length; k += 3) {
      const x = a[k], z = a[k + 2];
      let d = 1e9;
      for (const [ci, cj] of info.cells) {
        const dx = Math.max(0, Math.abs(x - tileX(ci)) - TILE / 2), dz = Math.max(0, Math.abs(z - tileZ(cj)) - TILE / 2);
        d = Math.min(d, Math.hypot(dx, dz));
      }
      over = Math.max(over, d);
    }
    res.feld[type] = Math.max(res.feld[type] || 0, over);
    // Fahrbahn: Lichtraum anderer Stücke (Nachbarstück in der Reihenfolge: nicht am Übergang – bis 10 m um den ersten/
    // letzten Linienpunkt des Stunt-Stücks stehen Portal, Banden und Spurwände der Einfahrt bestimmungsgemäß)
    const seen = new Set(), nP = P.length;
    const adj = (pb) => pb === (pi + 1) % nP || pb === (pi - 1 + nP) % nP;
    const j0 = info.lineStart, j1 = info.lineEnd;
    const rj = Math.max(10, L.hw[j0] + 4, L.hw[j1] + 4);   // Steilwand: Lippe am Übergang liegt ~hw + 0,5 m neben der Mitte
    const nearJoint = (x, z) => Math.hypot(x - L.px[j0], z - L.pz[j0]) < rj || Math.hypot(x - L.px[j1], z - L.pz[j1]) < rj;
    for (let k = 0; k < a.length; k += 3) {
      const x = a[k], y = a[k + 1], z = a[k + 2];
      const gx = Math.floor(x / cs), gz = Math.floor(z / cs);
      for (let u = -1; u <= 1; u++) for (let w = -1; w <= 1; w++) for (const j of G.get((gx + u) + ',' + (gz + w)) || []) {
        if (L.piece[j] === pi || (adj(L.piece[j]) && nearJoint(x, z))) continue;
        const h = y - L.py[j];
        if (h < 0.25 || h > 4.6 || L.ny[j] < 0.5) continue;
        if (Math.hypot(x - L.px[j], z - L.pz[j]) >= L.hw[j] + 0.2) continue;
        const key = pi + '>' + L.piece[j];
        if (!seen.has(key)) { seen.add(key); res.fahrbahn.push({ a: type, b: P[L.piece[j]]?.type, pa: pi, pb: L.piece[j], at: [+x.toFixed(1), +y.toFixed(1), +z.toFixed(1)] }); }
      }
      if (T && y > T.height(x, z) + 0.3) high.push(x, z, pi);
    }
    // Gelände über der Fahrbahn des Stunt-Stücks
    let gmax = 0;
    for (let i = info.lineStart; i <= info.lineEnd; i++) {
      if (L.air[i] || L.ny[i] < 0.7 || !T) continue;
      gmax = Math.max(gmax, T.height(L.px[i], L.pz[i]) - L.py[i]);
    }
    if (gmax > 0.02) res.gelaende.push({ type, pi, dh: +gmax.toFixed(2) });
  }
  // Deko/Kulisse (Thema Land, Stufe 2) und Bäume gegen hohe Bauteil-Ecken
  if (opt.deko !== false && high.length) {
    const H = new Map(), hc = 6;
    for (let k = 0; k < high.length; k += 3) { const key = Math.floor(high[k] / hc) + ',' + Math.floor(high[k + 1] / hc); (H.get(key) || H.set(key, []).get(key)).push(k); }
    const near = (x, z, r) => {
      const gx = Math.floor(x / hc), gz = Math.floor(z / hc), R = Math.ceil(r / hc);
      for (let u = -R; u <= R; u++) for (let w = -R; w <= R; w++) for (const k of H.get((gx + u) + ',' + (gz + w)) || []) if (Math.hypot(high[k] - x, high[k + 1] - z) < r) return high[k + 2];
      return -1;
    };
    let plan = null;
    try { plan = planDeco(t, { tier: 2, seed: 7, veg: THEMES.land.veg, themeId: 'land' }); } catch (e) { res.dekoErr = String(e); }
    const items = [];
    if (plan) for (const [k, list] of Object.entries(plan.inst)) if (FOOT[k]) for (const it of list) items.push([k, it.x, it.z, FOOT[k] * (it.s || 1)]);
    for (const tr of t.trees || []) items.push(['baum', tr.x, tr.z, 1.5 * (tr.s || 1)]);
    for (const [k, x, z, r] of items) { const pi = near(x, z, r); if (pi >= 0) res.deko.push({ kind: k, stunt: P[pi].type, at: [+x.toFixed(1), +z.toFixed(1)] }); }
  }
  return res;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const N = +arg('n', 40), NS = +arg('sam', 250), deko = arg('deko', '1') !== '0';
  const cases = [];
  for (const s of HASH_SEEDS.slice(0, N)) for (const d of [1, 2, 3]) {
    cases.push([`${s}-${d}`, () => generate(s, d)]);
    cases.push([`${s}-${d}-3d`, () => generate(s, d, { d3: true })]);
    cases.push([`${s}-${d}-g`, () => generate(s, d, { gel: true })]);
  }
  cases.push(['demo', demoLayout], ['galerie', galleryLayout], ['galerie-g', galleryGelLayout]);
  const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
  if (NS > 0 && fs.existsSync(jf)) {
    const TT = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
    for (let k = 0; k < Math.min(NS, TT.length); k++) cases.push([TT[k].id, () => trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), TT[k].id)).layout]);
  }
  const S = { strecken: 0, feld: {}, fahrbahn: 0, fahrbahnArt: {}, deko: 0, dekoArt: {}, gelaende: 0, stunts: {}, fehler: [] };
  const per = {};
  const t0 = Date.now();
  for (const [name, mk] of cases) {
    let r;
    try { r = checkTrack(mk(), { deko }); } catch (e) { S.fehler.push(name + ': ' + e.message); continue; }
    S.strecken++;
    for (const [k, v] of Object.entries(r.feld)) S.feld[k] = Math.max(S.feld[k] || 0, v);
    for (const [k, v] of Object.entries(r.stunts)) S.stunts[k] = (S.stunts[k] || 0) + v;
    S.fahrbahn += r.fahrbahn.length; for (const f of r.fahrbahn) { const k = f.a + '→' + f.b; S.fahrbahnArt[k] = (S.fahrbahnArt[k] || 0) + 1; }
    S.deko += r.deko.length; for (const f of r.deko) { const k = f.kind + '@' + f.stunt; S.dekoArt[k] = (S.dekoArt[k] || 0) + 1; }
    S.gelaende += r.gelaende.length;
    per[name] = { fahrbahn: r.fahrbahn, deko: r.deko.length, gelaende: r.gelaende };
  }
  console.log(`Stunt-Maßstab ${STUNT_SCALE}: ${S.strecken} Strecken (${((Date.now() - t0) / 1000).toFixed(0)} s), Stunt-Stücke ${JSON.stringify(S.stunts)}`);
  console.log(`  aus dem Feld (m, größter Wert je Art): ${Object.entries(S.feld).sort().map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
  console.log(`  im Lichtraum einer anderen Fahrbahn: ${S.fahrbahn} ${JSON.stringify(S.fahrbahnArt)}`);
  console.log(`  Deko/Bäume auf Bauteilen: ${S.deko} ${JSON.stringify(S.dekoArt)}`);
  console.log(`  Gelände über Stunt-Fahrbahn: ${S.gelaende}${S.fehler.length ? '  Fehler: ' + S.fehler.join(' | ') : ''}`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ S, per }));
}
void PIECES;
