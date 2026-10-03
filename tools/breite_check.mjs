// n23 Breitere Fahrbahn: überlappen sich benachbarte Abschnitte? Je Strecke die Fahrlinie (Mitte + halbe Breite hw) gegen
// sich selbst: zwei Punkte, die längs der Linie weit auseinander liegen (> 4·(hw_i + hw_j) + 20 m), aber waagrecht
// näher als hw_i + hw_j + gap und höchstens dy m übereinander liegen → Überlappung (eine Fahrbahn ragt in die andere).
// Ebenengleiche Kreuzungen (Generator: keine; Importe: echte Kreuzungen) zählen mit – verglichen wird alt gegen neu.
// Aufruf: STUNT_BREIT=alt node tools/breite_check.mjs [--n=40] [--json=datei]   (ohne STUNT_BREIT: neue Breite)
import fs from 'fs';
import { generate } from '../src/track/generator.js';
import { buildTrack } from '../src/track/build.js';
import { ROAD_HW } from '../src/track/defs.js';
import { HASH_SEEDS } from '../tests/node/layout_hash.mjs';
import { tracksOf } from '../src/game/sammlung.js';
import { parseTrk } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const GAP = 0.3, DY = 3.0;
export function overlaps(t) {
  // Linie auf ≤ 2 m Punktabstand verdichten (Importe haben auf Geraden weite Stützpunkte)
  const L0 = t.line, P = { px: [], py: [], pz: [], hw: [], s: [], air: [], piece: [] };
  for (let i = 0; i < L0.n; i++) {
    const j = i + 1 < L0.n ? i + 1 : i, d = Math.hypot(L0.px[j] - L0.px[i], L0.pz[j] - L0.pz[i]), m = j === i || d > 60 ? 1 : Math.max(1, Math.ceil(d / 2));
    for (let q = 0; q < m; q++) { const u = q / m; for (const k of ['px', 'py', 'pz', 'hw', 's']) P[k].push(L0[k][i] + (L0[k][j] - L0[k][i]) * u); P.air.push(L0.air[i] || L0.air[j]); P.piece.push(L0.piece[i]); }
  }
  const L = { ...P, n: P.px.length, closed: L0.closed, total: L0.total }, n = L.n, cell = 24, grid = new Map(), out = [];
  for (let i = 0; i < n; i++) { if (L.air[i]) continue; const k = `${Math.floor(L.px[i] / cell)},${Math.floor(L.pz[i] / cell)}`; (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  const seen = new Set();
  for (let i = 0; i < n; i++) {
    if (L.air[i]) continue;
    const cx = Math.floor(L.px[i] / cell), cz = Math.floor(L.pz[i] / cell);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const j of grid.get(`${cx + a},${cz + b}`) || []) {
      if (j <= i) continue;
      let ds = Math.abs(L.s[j] - L.s[i]); if (L.closed) ds = Math.min(ds, L.total - ds);
      const w = L.hw[i] + L.hw[j];
      if (ds < 4 * w + 20) continue;
      if (Math.abs(L.py[i] - L.py[j]) > DY) continue;
      const d = Math.hypot(L.px[i] - L.px[j], L.pz[i] - L.pz[j]);
      if (d < w + GAP) { const key = `${L.piece[i]}-${L.piece[j]}`; if (!seen.has(key)) { seen.add(key); out.push({ a: L.piece[i], b: L.piece[j], d: +d.toFixed(1), w: +w.toFixed(1), ta: t.pieces[L.piece[i]]?.type, tb: t.pieces[L.piece[j]]?.type }); } }
    }
  }
  return out;
}
if (process.argv[1] && process.argv[1].endsWith('breite_check.mjs')) {
  const N = +arg('n', 40), res = {};
  const cases = [];
  for (const s of HASH_SEEDS.slice(0, N)) for (const d of [1, 2, 3]) { cases.push([`${s}-${d}`, () => generate(s, d)]); cases.push([`${s}-${d}-3d`, () => generate(s, d, { d3: true })]); cases.push([`${s}-${d}-g`, () => generate(s, d, { gel: true })]); }
  const T = tracksOf(JSON.parse(fs.readFileSync('assets/sammlung.json', 'utf8'))), bin = new Uint8Array(fs.readFileSync('assets/sammlung.bin'));
  T.forEach((t, k) => cases.push([t.id, () => trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), t.id)).layout]));
  let bad = 0, tot = 0;
  for (const [name, f] of cases) {
    let t; try { t = buildTrack(f()); } catch (e) { res[name] = { err: String(e) }; continue; }
    const o = overlaps(t); res[name] = o.length; tot += o.length; if (o.length) { bad++; if (bad <= 12) console.log(name, JSON.stringify(o.slice(0, 3))); }
  }
  console.log(`halbe Breite ${ROAD_HW.toFixed(2)} m: ${cases.length} Strecken, ${bad} mit Überlappung, ${tot} Stück-Paare`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(res));
}
