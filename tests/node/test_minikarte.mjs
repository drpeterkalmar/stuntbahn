// n39 Minikarte: Geometrie-Bau (src/track/kartegeo.js) auf allen Bibliotheks-Strecken und Zufallsstrecken
//   A  Sammlung (250) + eigene Beispiel-Strecken (.TRK): baut ohne Fehler, Zahlen endlich, Indizes gültig, Höhenbereich plausibel
//   B  Zufallsstrecken flach / Hochstraße / Gelände (mit und ohne „h“) + Galerie: dasselbe, Bauzeit klein
//   C  Loopings geschlossen: kopfüber, Höhe erreicht, zurück auf Einfahrtshöhe, im Band keine Lücke
//   D  Arten: Galerie hat Looping (orange), Röhre (gestrichelt) und Sprung (Luft); Band ohne Lücken außer an echten Lücken
//   E  ausgedünnt: deutlich weniger Punkte als die Fahrlinie, kein Abstand über dem Schritt außer in Kurven/Höhen
// Aufruf: node tests/node/test_minikarte.mjs [Anzahl Seeds je Art, Standard 4]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildTrack } from '../../src/track/build.js';
import { generate, galleryLayout } from '../../src/track/generator.js';
import { parseTrk, TRK_BYTES } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { SHOWCASE, showcaseBytes } from '../../src/track/showcase.js';
import { karteGeo, KARTE_GEO, ART } from '../../src/track/kartegeo.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const N = +(process.argv[2] || 4);
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };

const stat = { n: 0, err: [], badNum: 0, badIdx: 0, badH: 0, badR: 0, segsOffen: 0, ms: [], ratio: [], loops: 0, loopBad: [], maxGap: 0, verts: 0 };
function pruefe(name, track) {
  const t0 = performance.now();
  let K;
  try { K = karteGeo(track); } catch (e) { stat.err.push(name + ': ' + e.message); return null; }
  stat.ms.push(performance.now() - t0);
  stat.n++;
  const L = track.line;
  for (const a of [K.pos, K.side, K.info]) for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) { stat.badNum++; break; }
  const nv = K.m * 2;
  for (let i = 0; i < K.index.length; i++) if (K.index[i] >= nv) { stat.badIdx++; break; }
  // Höhe plausibel: im Bereich der Fahrlinie, nicht absurd
  let ly0 = 1e9, ly1 = -1e9;
  for (let i = 0; i < L.n; i++) { ly0 = Math.min(ly0, L.py[i]); ly1 = Math.max(ly1, L.py[i]); }
  if (!(K.hmin >= ly0 - 0.01 && K.hmax <= ly1 + 0.01 && K.hmax - K.hmin < 250 && K.hmin > -120 && K.hmax - K.hmin >= 0)) { stat.badH++; console.log('   Höhe', name, K.hmin, K.hmax); }
  if (!(K.R > 40 && K.R < 2000)) { stat.badR++; console.log('   Radius', name, K.R); }
  if (L.closed && K.segs.length !== 1) { stat.segsOffen++; console.log('   Band zerfällt', name, K.segs.length); }
  stat.maxGap = Math.max(stat.maxGap, K.maxGap);
  stat.ratio.push(K.m / L.n);
  stat.verts = Math.max(stat.verts, nv);
  for (const lp of K.loops) {
    stat.loops++;
    const ok = lp.kopf < -0.5 && lp.hoch > 5 && lp.dy < 1 && lp.luecke <= KARTE_GEO.schritt * 1.5;
    if (!ok) stat.loopBad.push(`${name} i${lp.i0}: kopf ${lp.kopf.toFixed(2)} hoch ${lp.hoch.toFixed(1)} dy ${lp.dy.toFixed(2)} lücke ${lp.luecke.toFixed(1)}`);
  }
  return K;
}

// ---------- A: Sammlung + Beispiel-Strecken ----------
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8'));
const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
const T = meta.tracks || meta.list || meta.t || [];
const anz = Math.round(bin.length / TRK_BYTES);
let tSam = Date.now();
for (let k = 0; k < anz; k++) {
  const id = 'sam-' + String(k + 1).padStart(3, '0');
  try {
    const { layout } = trkToLayout(parseTrk(bin.subarray(k * TRK_BYTES, (k + 1) * TRK_BYTES), id + '.trk'));
    pruefe(id, buildTrack(layout, { treeCount: 0 }));
  } catch (e) { stat.err.push(id + ' (Bau): ' + e.message); }
}
for (const s of SHOWCASE) {
  const { layout } = trkToLayout(parseTrk(showcaseBytes(s.id), s.id + '.trk'));
  pruefe(s.id, buildTrack(layout, { treeCount: 0 }));
}
const nA = stat.n;
check(nA === anz + SHOWCASE.length && stat.err.length === 0, `A Sammlung ${anz} + Beispiele ${SHOWCASE.length}: Karte gebaut ${nA} (${((Date.now() - tSam) / 1000).toFixed(0)} s mit Streckenbau)${stat.err.length ? ' – ' + stat.err.slice(0, 3).join('; ') : ''}`);

// ---------- B: Zufallsstrecken + Galerie ----------
let gal = null;
for (let s = 1; s <= N; s++) for (const d of [1, 2, 3]) for (const art of [{}, { d3: true }, { gel: true }, { gv: 2 }, { gel: true, gv: 2 }, { d3: true, gv: 2 }]) {
  const name = `${s * 1009}-${d}${art.gel ? '-g' : art.d3 ? '-3d' : ''}${art.gv ? 'h' : ''}`;
  try {
    const lay = generate(s * 1009, d, art);
    pruefe(name, buildTrack(lay.layout || lay, { treeCount: 0 }));
  } catch (e) { stat.err.push(name + ' (Bau): ' + e.message); }
}
gal = pruefe('galerie', buildTrack(galleryLayout(), { treeCount: 0 }));
check(stat.err.length === 0, `B ${stat.n - nA} Zufallsstrecken (flach/3D/Gelände, mit/ohne „h“) + Galerie gebaut${stat.err.length ? ' – ' + stat.err.slice(0, 3).join('; ') : ''}`);
check(stat.badNum === 0 && stat.badIdx === 0, `A/B Zahlen endlich, Indizes gültig (NaN ${stat.badNum}, Index ${stat.badIdx})`);
check(stat.badH === 0, `A/B Höhenbereich plausibel (in der Fahrlinie, Spanne < 250 m) – ${stat.badH} auffällig`);
check(stat.badR === 0, `A/B Strecken-Radius 40 … 2000 m – ${stat.badR} auffällig`);
check(stat.segsOffen === 0, `A/B Rundkurse: Band in einem Stück (zerfallen: ${stat.segsOffen})`);
const ms = [...stat.ms].sort((a, b) => a - b);
check(ms[ms.length - 1] < 40, `B Bauzeit Karte: Median ${ms[ms.length >> 1].toFixed(1)} ms, max ${ms[ms.length - 1].toFixed(1)} ms (< 40)`);
check(stat.verts < 65536, `B Ecken je Strecke höchstens ${stat.verts} (Uint16-Index reicht)`);

// ---------- C: Loopings geschlossen ----------
check(stat.loops > 20 && stat.loopBad.length === 0, `C ${stat.loops} Loopings/Korkenzieher geschlossen (kopfüber, > 5 m hoch, Ausfahrt auf Einfahrtshöhe ±1 m, Band ohne Lücke ≤ ${KARTE_GEO.schritt * 1.5} m)${stat.loopBad.length ? ' – ' + stat.loopBad.slice(0, 3).join('; ') : ''}`);

// ---------- D: Arten in der Galerie ----------
{
  const c = [0, 0, 0, 0];
  for (let q = 0; q < gal.m; q++) c[gal.info[q * 8 + 2]]++;
  check(c[ART.STUNT] > 10 && c[ART.ROEHRE] > 5 && c[ART.LUFT] > 2 && c[ART.STRASSE] > 100, `D Galerie: Straße ${c[0]}, Looping ${c[1]}, Röhre/Tunnel ${c[2]}, Luft ${c[3]} Kartenpunkte`);
  check(stat.maxGap <= KARTE_GEO.luecke, `D größter Punktabstand im Band ${stat.maxGap.toFixed(1)} m (≤ ${KARTE_GEO.luecke})`);
}
// Gelände-Strecke mit Tunnel: Tunnel gestrichelt
{
  const K = karteGeo(buildTrack(generate(4711, 3, { gel: true }), { treeCount: 0 }));
  let t = 0; for (let q = 0; q < K.m; q++) if (K.info[q * 8 + 2] === ART.ROEHRE) t++;
  check(t > 3, `D 4711-3-g: Tunnel als Röhre/Tunnel markiert (${t} Punkte)`);
}

// ---------- E: ausgedünnt ----------
const r = [...stat.ratio].sort((a, b) => a - b);
check(r[r.length >> 1] < 0.4, `E Kartenpunkte / Linienpunkte: Median ${(r[r.length >> 1] * 100).toFixed(0)} %, max ${(r[r.length - 1] * 100).toFixed(0)} %`);

console.log(fails ? `${fails} FEHLER` : `alles grün (${stat.n} Strecken, ${stat.loops} Loopings)`);
process.exit(fails ? 1 : 0);
