// n43: Profi auf Original nie unfair schneller als der Leicht-Autopilot „Brachial“ (Brief). Je Sammlungs-Strecke (60, wie
// tools/gegner_mess.mjs) eine Runde Leicht Brachial Hände weg (tools/drift_mess.mjs measureLap) gegen die Profi-Zeit auf Original
// aus einer gegner_mess-JSON. Aufruf: node tools/n43_brachial_vgl.mjs tests/out/n43/neu_original.json [--bis=60]
import fs from 'fs'; import path from 'path'; import url from 'url';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { sammlung60 } = await imp('tools/gegner_mess.mjs');
const { measureLap } = await imp('tools/drift_mess.mjs');
const { verifySync } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
const J = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const bis = +((process.argv.find((a) => a.startsWith('--bis=')) || '--bis=60').slice(6));
const byId = Object.fromEntries(J.rows.map((r) => [r.id, r]));
const q = [];
for (const tr of sammlung60().slice(0, bis)) {
  const r = byId[tr.id]; if (!r || !r.st || !r.st.profi) continue;
  const v = verifySync(tr.lay(), 0); if (!v.ok) continue;
  const M = measureLap(v.env, 'brachial', { mods: { Race }, seed: 1 });
  const p = r.st.profi.g[0].zeit;
  if (!M.ok || !p) continue;
  q.push(p / M.time - 1);
  console.log(`${tr.id.padEnd(8)} Profi Original ${p.toFixed(1)} s · Brachial ${M.time.toFixed(1)} s (${((p / M.time - 1) * 100).toFixed(1)} %)`);
}
q.sort((a, b) => a - b);
console.log(`\n${q.length} Strecken: Profi (Original) gegen Brachial (Leicht) Mittel ${(q.reduce((a, b) => a + b, 0) / q.length * 100).toFixed(1)} %, schnellste Strecke ${(q[0] * 100).toFixed(1)} %, langsamste ${(q[q.length - 1] * 100).toFixed(1)} %; Profi schneller auf ${q.filter((x) => x < 0).length}/${q.length}`);
