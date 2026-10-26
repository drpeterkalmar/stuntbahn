// n40: G-Anzeige rund um den Zieljubel-Stunt (Absprung, Flug, Landung) aus der Aufzeichnung – dieselbe Rechnung wie im
// Replay/Film (core/gforce.js gTrack). Aufruf: node tools/zielstunt_g.mjs [seed] [diff]
import { runRace } from './kinoreplay_probe.mjs';
import { REC_HZ, REC_STRIDE } from '../src/game/race.js';
import { generate } from '../src/track/generator.js';
import { verifySync } from '../src/track/verify.js';
import { gTrack } from '../src/core/gforce.js';
const seed = +(process.argv[2] || 4), diff = +(process.argv[3] || 2);
const env = verifySync(generate(seed, diff, {})).env;
const b = runRace(env, { assist: 'easy', autoExtras: false, zieljubel: 'stunt' });
const S = b.zstunt;
if (!S || S.tLand == null) { console.log('kein Stunt', b.zstuntWhy, S && S.why); process.exit(0); }
const T = gTrack(b.rec, b.cuts || []), f0 = b.finF + Math.round(S.tAir * REC_HZ), f1 = b.finF + Math.round(S.tLand * REC_HZ);
const out = [];
for (let f = f0 - 6; f < f1 + 30; f += 1) {
  const q = f * REC_STRIDE, p = (k) => b.rec[k * REC_STRIDE + 1];
  const P3 = (k) => [b.rec[k * REC_STRIDE], b.rec[k * REC_STRIDE + 1], b.rec[k * REC_STRIDE + 2]], A = P3(f), B = P3(f - 1), C = P3(f - 2);
  const ah = Math.hypot(A[0] - 2 * B[0] + C[0], A[2] - 2 * B[2] + C[2]) * REC_HZ * REC_HZ / 9.81, vh = Math.hypot(A[0] - B[0], A[2] - B[2]) * REC_HZ;
  out.push(`${f - f1 >= 0 ? '+' : ''}${f - f1}: vh ${vh.toFixed(2)} ah ${ah.toFixed(1)}G y ${p(f).toFixed(3)} vy ${((p(f) - p(f - 1)) * REC_HZ).toFixed(2)} ay ${((p(f) - 2 * p(f - 1) + p(f - 2)) * REC_HZ * REC_HZ / 9.81).toFixed(1)}G  roh ${T.raw[f].toFixed(1)} lon ${T.lon[f].toFixed(1)} lat ${T.lat[f].toFixed(1)} vert ${T.vert[f].toFixed(1)} Anzeige ${T.g[f].toFixed(1)}`);
}
console.log(S.art, 'Absprung', f0, 'Landung', f1, '\n' + out.filter((_, i) => i < 10 || Math.abs(i - (f1 - f0 + 6)) < 14).join('\n'));
let mx = 0; for (let f = f0; f < f1 + 60; f++) mx = Math.max(mx, T.g[f]);
console.log('höchste Anzeige Flug+1 s:', mx.toFixed(1), 'G');
