// Alle Node-Tests nacheinander (npm run test:node). Korpus-Test nur, wenn trk_local/ existiert (kleine Stichprobe).
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const tests = [
  ['test_trk_parser.mjs'], ['test_trk_import.mjs'], ['test_loop_gate.mjs'], ['test_generator.mjs'], ['test_alte_codes.mjs'], ['test_strecken3d.mjs'], ['test_generator3d.mjs', '40'], ['test_leicht3d.mjs', '4'],
  ['test_verify_batch.mjs', '10'], ['test_assists.mjs'], ['test_reset.mjs'], ['test_cockpit.mjs'], ['test_free_steer.mjs'], ['test_tilt.mjs'], ['test_extras.mjs'], ['test_quality_blur.mjs'], ['test_autopilot.mjs'], ['test_lod.mjs'], ['test_hdr.mjs'], ['test_detail.mjs'], ['test_vao.mjs'], ['test_oktaeder.mjs'], ['test_taau.mjs'], ['test_taau_kino.mjs'], ['test_deco.mjs', '10'], ['test_sammlung.mjs'], ['test_fahrgefuehl.mjs'], ['test_leicht_zeiten.mjs'], ['test_wiese.mjs'], ['test_haftung.mjs'], ['test_sprung.mjs'], ['test_gelaende.mjs', '6'], ['test_kinoreplay.mjs'], ['test_gkraft.mjs'], ['test_mittel3.mjs'], ['test_kulissen.mjs', '4'], ['test_drift.mjs'], ['test_stuntgroesse.mjs'], ['test_zielshow.mjs'], ['test_roehre_buckel.mjs'], ['test_wetter.mjs'], ['test_kulissen2.mjs', '2'], ['test_kulissen2_gfx.mjs'], ['test_zeit.mjs'],
];
if (fs.existsSync(path.join(HERE, '../../trk_local'))) tests.push(['test_trk_corpus.mjs', '20']);
let bad = 0;
for (const [f, ...a] of tests) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(HERE, f), ...a], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').slice(-1)[0];
  console.log(`${r.status === 0 ? 'OK  ' : 'FAIL'} ${f.padEnd(24)} ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${last}`);
  if (r.status !== 0) { bad++; console.log((r.stdout || '').slice(-1500), (r.stderr || '').slice(-1500)); }
}
process.exit(bad ? 1 : 0);
