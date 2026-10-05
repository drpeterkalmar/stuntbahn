// n26: Prüffahrt (Autopilot wie im Spiel, mit Entschärfen) auf N Zufallsstrecken je Stufe und Art (flach, 3D, Gelände):
// im Ziel ohne Entschärfen (ok0), mit Entschärfen (ok), Entschärfungen, Referenzzeit. Vergleich: --root=alter Stand.
// Aufruf: node tools/stunt_quote.mjs [N=100] [--root=Wurzel] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ROOT = path.resolve(arg('root', path.join(path.dirname(url.fileURLToPath(import.meta.url)), '..')));
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 100);
const out = {};
for (const [mode, o] of [['flach', {}], ['3d', { d3: true }], ['gel', { gel: true }]]) for (const diff of [1, 2, 3]) {
  const R = { n: 0, ok0: 0, ok: 0, fix: 0, ap: 0 };
  for (let k = 0; k < N; k++) {
    const seed = 1000 + k * 7919 % 90000;
    const v0 = verifySync(generate(seed, diff, o), 0); R.n++; if (v0.ok) R.ok0++;
    const v = v0.ok ? v0 : verifySync(generate(seed, diff, o)); if (v.ok) { R.ok++; R.ap += v.apTime; } R.fix += v.fixes;
  }
  out[mode + '-' + diff] = R;
  console.log(`${mode} Stufe ${diff}: ${R.n} Strecken, ohne Entschärfen im Ziel ${R.ok0}, mit ${R.ok}, Entschärfungen ${R.fix}, Autopilot Ø ${(R.ap / Math.max(1, R.ok)).toFixed(1)} s`);
}
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out));
