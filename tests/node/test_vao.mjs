// Gebackene Vertex-AO der Strecke (n30, src/track/vao.js): Richtungen, Ecke Wand/Boden dunkler als freie Fläche,
// schrittweise = auf einmal, echte Strecken (flach, 3D, Gelände): Werte 0…1, Budget eingehalten, Tunnel/Brücken verdeckt.
// Aufruf: node tests/node/test_vao.mjs [Seeds je Art, Standard 2]
import { halbkugel, verdeckung, bakeVertexAO, bakeVertexAOSchritte, VAO } from '../../src/track/vao.js';
import { generate } from '../../src/track/generator.js';
import { prepare } from '../../src/track/verify.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const NS = +(process.argv[2] || 2);

const d = halbkugel(6);
ok(d.length === 6 && d.every(([x, y, z]) => Math.abs(Math.hypot(x, y, z) - 1) < 1e-9 && z > 0.05), 'Halbkugel: 6 Einheitsrichtungen, alle nach oben');

// Kunstwelt: Boden y = 0 und Wand x = 1 (Strahl gegen zwei Ebenen)
const welt = { rayTrack(ox, oy, oz, dx, dy, dz, L) {
  let t = Infinity;
  if (dx > 1e-9) { const tt = (1 - ox) / dx; if (tt > 0) t = Math.min(t, tt); }
  if (dy < -1e-9) { const tt = -oy / dy; if (tt > 0) t = Math.min(t, tt); }
  return t <= L ? { t } : null;
} };
const dirs = halbkugel(16);
const frei = verdeckung(welt, -5, 0, 0, 0, 1, 0, dirs, 4.5, 0.06), nah = verdeckung(welt, 0.9, 0, 0, 0, 1, 0, dirs, 4.5, 0.06), mitte = verdeckung(welt, 0, 0, 0, 0, 1, 0, dirs, 4.5, 0.06);
ok(frei === 0 && mitte > 0 && nah > mitte, `Boden: frei ${frei.toFixed(2)} < 1 m vor der Wand ${mitte.toFixed(2)} < an der Wand ${nah.toFixed(2)}`);
const wand = verdeckung(welt, 1, 0.1, 0, -1, 0, 0, dirs, 4.5, 0.06), wandHoch = verdeckung(welt, 1, 2.5, 0, -1, 0, 0, dirs, 4.5, 0.06);
ok(wand > wandHoch, `Wandfuß dunkler als Wand oben (${wand.toFixed(2)} > ${wandHoch.toFixed(2)})`);

const arten = [['flach', {}], ['3D', { d3: true }], ['Gelände', { gel: true }]];
let maxMs = 0;
for (const [name, o] of arten) for (let k = 0; k < NS; k++) {
  const seed = 300 + k * 17 + (o.d3 ? 1 : o.gel ? 2 : 0);
  const env = prepare(generate(seed, 3, o));
  const B = env.track.batches;
  const st = bakeVertexAO(B, env.world);
  maxMs = Math.max(maxMs, st.ms);
  let n = 0, aus = 0, hoch = 0;
  const alle = [];
  for (const b of B) { if (!b.occ || b.occ.length !== b.pos.length / 3) aus++; for (const v of b.occ || []) { n++; if (!(v >= 0 && v <= 1)) aus++; if (v > 0.3) hoch++; alle.push(v); } }
  alle.sort((a, c) => a - c);
  ok(!aus, `${name} ${seed}: alle ${n} Eckpunkte mit AO 0…1`);
  ok(st.strahlen <= VAO.maxStrahlen, `${name} ${seed}: ${st.strahlen} Strahlen (${st.strahlenJe} je Punkt, ${st.gerechnet}/${st.ecken} gerechnet) ≤ Budget, ${st.ms} ms`);
  ok(alle[Math.floor(alle.length / 2)] < 0.15, `${name} ${seed}: Median ${alle[Math.floor(alle.length / 2)].toFixed(3)} (offene Fahrbahn bleibt hell), ${(hoch / n * 100).toFixed(1)} % deutlich verdeckt`);
}
// schrittweise = auf einmal
{
  const env = prepare(generate(77, 2, { d3: true }));
  const a = bakeVertexAO(env.track.batches, env.world).gerechnet;
  const ref = env.track.batches.map((b) => b.occ.slice());
  for (const b of env.track.batches) b.occ = null;
  const g = bakeVertexAOSchritte(env.track.batches, env.world, { je: 50 });
  let schritte = 0, r, last = -1, mono = true;
  while (!(r = g.next()).done) { schritte++; if (r.value.anteil < last) mono = false; last = r.value.anteil; }
  const gleich = env.track.batches.every((b, i) => b.occ.every((v, j) => v === ref[i][j]));
  ok(schritte > 10 && mono && gleich && r.value.gerechnet === a, `schrittweise (${schritte} Schritte, Anteil steigt) ergibt dasselbe wie auf einmal`);
}
console.log(`längste Rechnung ${maxMs} ms (Node/Mac; Handy ~4–6×, daher im Spiel schrittweise über die ersten Bilder)`);
console.log(bad ? `${bad} FEHLER` : 'alle Vertex-AO-Prüfungen OK');
process.exit(bad ? 1 : 0);
