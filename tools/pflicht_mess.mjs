// n42 Etappe 2: Pflicht-Elemente in Zufallsstrecken zählen (ohne Autopilot-Prüfung; mit --verify zusätzlich verify je Strecke,
// Entschärfungen zählen dann mit). Anteil Strecken, deren Pflicht-Liste erfüllt ist (Ersatz wie Zickzack→kurzer Zickzack
// getrennt), je Pflicht-Element Anteil vorhanden, Anteil Strecken mit seltenen Original-Elementen.
//   node tools/pflicht_mess.mjs [N=100] [gv=2] [--verify] [--json datei]
import { generate, DIFFS, DIFFS2, hindFilter } from '../src/track/generator.js';
import { D3, d3V2 } from '../src/track/generator3d.js';
import { GD, GD2 } from '../src/track/generatorG.js';
import { pflichtStatus, pflichtTeile } from '../src/track/pflicht.js';
import { verifySync } from '../src/track/verify.js';
import fs from 'node:fs';

const args = process.argv.slice(2);
const N = +(args.find((a) => /^\d+$/.test(a)) || 100);
const gv = +((args.find((a) => /^gv=/.test(a)) || 'gv=2').slice(3));
const VER = args.includes('--verify');
const jf = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;
const SELTEN = ['tr_pipe', 'tr_pipeT', 'tr_hwy', 'tr_hwyT', 'tr_gap1', 'tr_gap2', 'tr_gap3', 'tr_gap4', 'tr_gap5', 'tr_gap6', 'tr_corklr', 'slope4', 'halfpipe', 'tr_corkud'];
const modes = { flat: {}, '3d': { d3: true }, gel: { gel: true } };
const mustOf = (m, d, lay) => (lay.meta.pflicht ? lay.meta.pflicht.soll : m === 'flat' ? (gv >= 2 ? hindFilter(DIFFS2[d]) : DIFFS[d]).must : m === '3d' ? (gv >= 2 ? d3V2(D3[d], d) : D3[d]).must : (gv >= 2 ? hindFilter(GD2[d]) : GD[d]).must);
const out = {};
for (const [m, o] of Object.entries(modes)) for (const diff of [1, 2, 3]) {
  let ok = 0, okOhneErsatz = 0, fixes = 0, fail = 0;
  const jeElem = {}, selten = {}, ersatz = {};
  for (let s = 1; s <= N; s++) {
    let lay;
    try { lay = generate(s * 7919 + 13, diff, { ...o, variant: 0, gv }); } catch (e) { fail++; continue; }
    let pieces = lay.pieces;
    if (VER) { const v = verifySync(JSON.parse(JSON.stringify(lay))); fixes += v.fixes; pieces = v.layout.pieces; }
    const must = mustOf(m, diff, lay), st = pflichtStatus(pieces, must);
    if (st.ok) ok++;
    if (st.ok && !st.ersatz.length) okOhneErsatz++;
    for (const [a, b] of st.ersatz) ersatz[a + '→' + b] = (ersatz[a + '→' + b] || 0) + 1;
    const hat = pflichtTeile(pieces);
    for (const t of new Set(must)) { const need = must.filter((x) => x === t).length; jeElem[t] = (jeElem[t] || 0) + ((hat[t] || 0) >= need ? 1 : 0); }
    for (const t of SELTEN) if (hat[t]) selten[t] = (selten[t] || 0) + 1;
  }
  const p = (x) => Math.round(x / N * 100);
  out[`${m}/${diff}`] = { erfuellt: p(ok), ohneErsatz: p(okOhneErsatz), jeElement: Object.fromEntries(Object.entries(jeElem).map(([k, v]) => [k, p(v)])), ersatz: Object.fromEntries(Object.entries(ersatz).map(([k, v]) => [k, p(v)])), selten: Object.fromEntries(Object.entries(selten).map(([k, v]) => [k, p(v)])), ...(VER ? { entschaerft: fixes } : {}), fehler: fail };
  console.log(`${m}/${diff}`, JSON.stringify(out[`${m}/${diff}`]));
}
if (jf) fs.writeFileSync(jf, JSON.stringify({ N, gv, verify: VER, ergebnis: out }, null, 1));
