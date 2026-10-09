// n32: Prüfsummen der Deko-/Kulissen-Planung (planDeco) für feste Strecken × Themen × Stufen. Aufruf mit Wurzel eines
// Stands (z. B. git-archive-Kopie von main vor n32), schreibt JSON nach stdout. tests/node/test_kulissen2.mjs vergleicht
// damit, dass ?kulisse=alt (kulisse2: false) die Planung exakt wie vor n32 liefert.
// Aufruf: node tools/kulisse_plan_hash.mjs [Wurzel] > tests/node/data/deco_plan_n31.json
import crypto from 'crypto';
const root = new URL('file://' + ((process.argv[2] || '.').startsWith('/') ? process.argv[2] : process.cwd() + '/' + (process.argv[2] || '.')) + '/').pathname;
export async function planHashes(r, extra = {}) {
  const { generate, galleryLayout } = await import(r + 'src/track/generator.js');
  const { prepare } = await import(r + 'src/track/verify.js');
  const { planDeco } = await import(r + 'src/track/deco.js');
  const { THEMES, THEME_IDS } = await import(r + 'src/track/themes.js');
  const lays = [generate(4711, 2, { gel: true }), generate(25, 2, { gel: true }), generate(1038, 1, {}), generate(4711, 3, { d3: true }), galleryLayout()];
  const res = {};
  for (const lay of lays) {
    const env = prepare(lay);
    for (const th of THEME_IDS) for (const tier of [0, 2]) {
      const plan = planDeco(env.track, { ideal: env.ideal, prof: env.prof, tier, seed: 7, veg: THEMES[th].veg, themeId: th, ...extra });
      res[`${lay.meta.key}|${th}|${tier}`] = crypto.createHash('sha1').update(JSON.stringify(plan)).digest('hex').slice(0, 16);
    }
  }
  return res;
}
if (import.meta.url === 'file://' + process.argv[1]) console.log(JSON.stringify(await planHashes(root), null, 1));
