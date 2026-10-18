// n37 Arcade-Fahrgefühl: kommen Autopilot (Leicht Sauber/Brachial, ohne Spieler-Eingabe) und der menschenähnliche Mittel-Bot
// (tools/mittel_probe.mjs „mensch-handy“) auf der neuen Physik genauso oft ins Ziel wie bisher? Je Variante (alt = Physik bis
// n36, neu = Arcade) auf denselben geprüften Zufallsstrecken (flach, Hochstraße, Gelände; Generator-Version 2 „h“; Stufen 1–3).
// Prüffahrt/Entschärfen rechnen ohne Arcade-Physik (reine Autopilot-Fahrt) – die Strecken sind in beiden Varianten gleich.
// Aufruf: node tools/arcade_quote.mjs [N je Art und Stufe = 4] [--von=K] [--var=alt,neu] [--fahrer=sauber,brachial,mensch] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race, MEDIUM_N24 } = await imp('src/game/race.js');
const { setArcade } = await imp('src/physics/arcade.js');
const { runBot } = await imp('tools/mittel_probe.mjs');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 4), von = +arg('von', 0);
const VARS = arg('var', 'alt,neu').split(','), FAHRER = arg('fahrer', 'sauber,brachial,mensch').split(',');
const DT = 1 / 120;
// --set=boden.steerSpeed=3,land.right=0 (nur Variante „neu“): einzelne Arcade-Werte probeweise ändern
const SET = {};
for (const kv of arg('set', '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); const [a, b] = k.split('.'); (SET[a] ||= {})[b] = +v; }

function leicht(v, stil) {
  const r = new Race(v.env, { assist: 'easy', countdown: 0.05, fahrstil: stil, seed: 3 });
  const lim = Math.max(90, (v.apTime || 60) * 3);
  let t = 0;
  for (; t < lim && r.state !== 'finished'; t += DT) { r.step(DT, { steer: 0, throttle: 0, brake: 0 }); r.events.length = 0; }
  return { ok: r.state === 'finished', crashes: r.crashes, skips: r.skips || 0, time: r.state === 'finished' ? r.finalTime : null };
}

const tracks = [];
for (const [mode, o] of [['flach', {}], ['3d', { d3: true }], ['gel', { gel: true }]]) for (const diff of [1, 2, 3]) for (let k = 0; k < N; k++) {
  const seed = 1000 + (k + von) * 7919 % 90000;
  const v = verifySync(generate(seed, diff, { ...o, gv: 2 }));
  if (v.ok) tracks.push({ name: `${seed}-${diff}-${mode}h`, v });
}
const out = {};
for (const variant of VARS) {
  setArcade({ on: variant !== 'alt' });
  if (variant !== 'alt') setArcade(SET);
  const S = (out[variant] = {});
  for (const f of FAHRER) S[f] = { n: 0, ok: 0, crashes: 0, skips: 0, tsum: 0, why: {} };
  for (const T of tracks) {
    for (const f of FAHRER) {
      const R = S[f];
      if (f === 'mensch' || f === 'voll' || f === 'touch') {
        const x = runBot(T.v, MEDIUM_N24, f === 'voll' ? 'mensch-voll' : f === 'touch' ? 'mensch-touch' : 'mensch-handy', [7, 8]);
        R.n += x.runs || 1; R.ok += x.okN ?? +x.ok; R.crashes += x.crashes; if (x.ok) R.tsum += x.time / T.v.apTime;
        for (const w in x.why) R.why[w] = (R.why[w] || 0) + x.why[w];
      } else {
        const x = leicht(T.v, f);
        R.n++; R.ok += x.ok ? 1 : 0; R.crashes += x.crashes; R.skips += x.skips; if (x.ok) R.tsum += x.time / T.v.apTime;
      }
    }
  }
  for (const f of FAHRER) { const R = S[f]; console.log(`${variant} ${f.padEnd(8)}: ${R.ok}/${R.n} im Ziel, Crashs ${R.crashes}, übersprungen ${R.skips}, Zeit/Prüffahrt Ø ${(R.tsum / Math.max(1, R.ok)).toFixed(3)}${Object.keys(R.why).length ? ' ' + JSON.stringify(R.why) : ''}`); }
}
console.log(`${tracks.length} Strecken`);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ tracks: tracks.map((t) => t.name), out }, null, 1));
