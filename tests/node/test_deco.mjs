// Optik (28.09.2026): Deko-Planung auf generierten und importierten Strecken prüfen.
//  - Jede Deko hält ihren Mindestabstand zu JEDEM Punkt der Fahrlinie (auch Hochstraßen, Rampen, Loopings) →
//    nichts auf der Fahrbahn, nichts unter Brücken; kein Wasser; Randstreifen/Kiesbetten liegen neben der Fahrbahn.
//  - Mengen im Rahmen (Dreiecke/Instanzen), Planungszeit.
// Aufruf: node tests/node/test_deco.mjs [Anzahl Seeds, Standard 10] (dazu Beispiel-Rundkurs + .TRK-Korpus, falls lokal)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generate, galleryLayout } from '../../src/track/generator.js';
import { prepare } from '../../src/track/verify.js';
import { planDeco, roadClearance, MIN_CLEAR } from '../../src/track/deco.js';
import { parseTrk } from '../../src/track/trk.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { showcaseBytes, SHOWCASE } from '../../src/track/showcase.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const N = +(process.argv[2] || 10);
let bad = 0, checks = 0;
const byKind = {};
const fail = (m) => { bad++; const k = m.split(': ')[1]?.split(' ')[0]; byKind[k] = (byKind[k] || 0) + 1; if (bad < 12) console.log('FAIL', m); };

function check(name, env) {
  const { track } = env;
  const t0 = Date.now();
  const plan = planDeco(track, { ideal: env.ideal, prof: env.prof, tier: 2, seed: 7 });
  const ms = Date.now() - t0;
  const dist = roadClearance(track);
  const T = track.terrain;
  const counts = {};
  for (const [k, list] of Object.entries(plan.inst)) {
    counts[k] = list.length;
    const need = MIN_CLEAR[k] - 0.01;
    for (const it of list) {
      checks++;
      const d = dist(it.x, it.z, need + 5);
      if (d < need) fail(`${name}: ${k} zu nah an der Fahrbahn (${d.toFixed(2)} < ${MIN_CLEAR[k]} m) bei ${it.x.toFixed(1)},${it.z.toFixed(1)}`);
      if (T.height(it.x, it.z) < -0.3) fail(`${name}: ${k} im Wasser/in einer Grube bei ${it.x.toFixed(1)},${it.z.toFixed(1)}`);
      if (!isFinite(it.x) || !isFinite(it.z) || !isFinite(it.rot)) fail(`${name}: ${k} ungültige Koordinaten`);
    }
  }
  // Streifen: innere Kante an der eigenen Fahrbahnkante, äußere Punkte nicht auf einer anderen Fahrbahn
  for (const st of plan.strips) for (const p of st.pts) {
    checks++;
    const d = dist(p.x1, p.z1, 6);
    if (d < (st.kind === 'gravel' ? MIN_CLEAR.gravel - 0.01 : 0.85)) fail(`${name}: ${st.kind}-Außenkante auf/an Fahrbahn (${d.toFixed(2)})`);
  }
  for (const r of plan.rails) for (const p of r) { checks++; if (dist(p.x, p.z, 12) < MIN_CLEAR.rail - 0.01) fail(`${name}: Leitplanke zu nah`); }
  counts.strips = plan.strips.length; counts.gravel = plan.strips.filter((s) => s.kind === 'gravel').length;
  counts.rails = plan.rails.length; counts.marks = plan.marks.length; counts.fences = plan.fences.length;
  return { counts, ms };
}

const envs = [];
for (let s = 1; s <= N; s++) for (const d of [1, 2, 3]) {
  const lay = generate(s * 101 + 7, d);
  envs.push([`seed ${lay.meta.key}`, () => prepare(lay)]);
}
// n19: 3D-Strecken (Hochstraßen, Spiralen, Steilwand, Klippen) und die Galerie mit allen Teilen
for (let s = 1; s <= Math.ceil(N / 2); s++) for (const d of [1, 2, 3]) {
  const lay = generate(s * 101 + 7, d, { d3: true });
  envs.push([`seed ${lay.meta.key}`, () => prepare(lay)]);
}
envs.push(['galerie', () => prepare(galleryLayout())]);
for (const sc of SHOWCASE) envs.push([sc.id, () => { const trk = parseTrk(showcaseBytes(sc.id), sc.id + '.trk'); return prepare(trkToLayout(trk).layout); }]);
// .TRK-Korpus (nur lokal): kleine gleichmäßige Stichprobe inkl. der längsten Strecke
const DIR = path.join(ROOT, 'trk_local');
if (fs.existsSync(DIR)) {
  const files = [];
  (function walk(d) { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.trk$/i.test(f)) files.push(p); } })(DIR);
  const pick = files.filter((_, i) => i % Math.max(1, Math.floor(files.length / 12)) === 0).slice(0, 12);
  const long = files.find((f) => /LONG_GO2/i.test(f)); if (long) pick.push(long);
  for (const f of pick) envs.push([path.basename(f), () => { const trk = parseTrk(new Uint8Array(fs.readFileSync(f)), path.basename(f)); return prepare(trkToLayout(trk).layout); }]);
}
const tot = {};
let maxMs = 0, n = 0;
for (const [name, mk] of envs) {
  let env;
  try { env = mk(); } catch (e) { console.log('übersprungen', name, e.message); continue; }
  const r = check(name, env);
  n++;
  maxMs = Math.max(maxMs, r.ms);
  for (const [k, v] of Object.entries(r.counts)) { tot[k] = tot[k] || [1e9, 0, 0]; tot[k][0] = Math.min(tot[k][0], v); tot[k][1] = Math.max(tot[k][1], v); tot[k][2] += v; }
  if (process.env.VERBOSE) console.log(name, r.ms + ' ms', JSON.stringify(r.counts));
}
console.log('Strecken', n, '· Planung max', maxMs, 'ms');
for (const [k, [a, b, s]] of Object.entries(tot)) console.log(`  ${k.padEnd(8)} min ${a} · max ${b} · Mittel ${Math.round(s / n)}`);
if (maxMs > 1500) fail('Planung zu langsam: ' + maxMs + ' ms');
if (bad) console.log('Fehler je Art', JSON.stringify(byKind));
console.log(bad ? `${bad} Fehler bei ${checks} Prüfungen` : `Deko: ${checks} Prüfungen ok (${n} Strecken)`);
process.exit(bad ? 1 : 0);
