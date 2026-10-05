// Kino-Replay (n18): fährt Strecken per Fahrhilfe/Autopilot bis ins Ziel, wertet die Aufzeichnung mit dem Moment-Finder
// aus und zeigt alle Kandidaten + den gebauten Film. Aufruf: node tools/kinoreplay_probe.mjs [--json=datei] [--nur=0,2]
// --fahrstil=brachial: Leicht-Fahrten mit dem Drift-Autopiloten (n25).
// Fahrten: flach Irre (Looping/Schanze/Röhre), 3D Irre (Spirale, Klippe, Steilwand, Wellen), Gelände Sportlich
// (Schlucht, Kuppe, Halfpipe), Sammlung (Korkenzieher …), Beispielstrecke mit Totalschaden.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generate } from '../src/track/generator.js';
import { verifySync, prepare } from '../src/track/verify.js';
import { Race, REC_HZ } from '../src/game/race.js';
import { ZIEL } from '../src/game/zielshow.js';
import { buildFilm, FilmPlayer } from '../src/game/highlights.js';
import { parseTrk, TRK_BYTES } from '../src/track/trk.js';
import { trkToLayout } from '../src/track/trkimport.js';
import { tracksOf } from '../src/game/sammlung.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 120, zero = { steer: 0, throttle: 0, brake: 0 };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };

export function samLayout(k) {
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8'));
  const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
  const T = tracksOf(meta), t = T[k];
  const trk = parseTrk(bin.subarray(k * TRK_BYTES, (k + 1) * TRK_BYTES), t.id + '.trk');
  const { layout } = trkToLayout(trk);
  layout.meta.key = t.id; layout.meta.name = t.name;
  return layout;
}

// Fahrt bis ins Ziel: Leicht mit „Extras automatisch“ (Nitro + Hüpfer) bzw. Autopilot auf Mittel
export function runRace(env, opts = {}) {
  const race = new Race(env, { assist: opts.assist || 'easy', countdown: 0.05, autoExtras: opts.autoExtras ?? true, autopilot: !!opts.autopilot, wreck: !!opts.wreck, fahrstil: opts.fahrstil ?? arg('fahrstil') ?? undefined, seed: opts.seed });
  const lim = Math.max(120, env.track.line.total / 6);
  let t = 0;
  const inp = opts.autopilot ? () => zero : () => zero;
  while (t < lim && race.state !== 'finished') {
    if (opts.hopAt && race.state === 'running' && Math.abs(race.time - opts.hopAt) < DT) race.requestHop();
    if (opts.nitroAt && race.state === 'running' && Math.abs(race.time - opts.nitroAt) < DT) race.requestNitro();
    race.step(DT, inp()); t += DT; race.events.length = 0;
  }
  // n27: Auslaufen nach dem Ziel mit aufzeichnen (wie im Spiel: ZIEL.rec s)
  if (race.state === 'finished' && opts.runout !== false) while (race.finT < ZIEL.rec) { race.step(DT, zero); race.events.length = 0; }
  return race;
}
export const marksOf = (race) => ({ cuts: race.cuts, pens: race.pens, xev: race.xev, crashes: race.crashLog, fin: race.finF != null ? { f: race.finF, time: race.finalTime } : null });

export const RUNS = [
  { name: 'flach 4711-3 (Irre)', env: () => verifySync(generate(4711, 3)).env, opts: { assist: 'medium', autopilot: true, nitroAt: 9 } },
  { name: '3D 4711-3-3d (Irre)', env: () => verifySync(generate(4711, 3, { d3: true })).env, opts: { assist: 'easy' } },
  { name: 'Gelände 1234-3-g (Irre)', env: () => verifySync(generate(1234, 3, { gel: true })).env, opts: { assist: 'easy' } },
  { name: 'Sammlung sam-042', env: () => prepare(samLayout(41), { treeCount: 0 }), opts: { assist: 'easy' } },
  { name: '3D 2026-2-3d (Sportlich)', env: () => verifySync(generate(2026, 2, { d3: true })).env, opts: { assist: 'easy' } },
];

const fmt = (x, d = 1) => x.toFixed(d).replace('.', ',');
if (import.meta.url === `file://${process.argv[1]}`) {
  const only = arg('nur') ? arg('nur').split(',').map(Number) : null, out = [];
  for (const [k, R] of RUNS.entries()) {
    if (only && !only.includes(k)) continue;
    const t0 = Date.now();
    const env = R.env();
    const race = runRace(env, R.opts);
    const marks = marksOf(race);
    const t1 = Date.now();
    const film = buildFilm(race.rec, env, marks);
    const t2 = Date.now();
    console.log(`\n=== ${R.name}: ${race.state === 'finished' ? 'im Ziel' : race.state} nach ${fmt(race.time)} s, Crashs ${race.crashes}, Nitro ${race.used.nitro}, Hüpfer ${race.used.hop} (Fahrt ${((t1 - t0) / 1000).toFixed(1)} s, Auswertung ${t2 - t1} ms)`);
    if (!film) { console.log('  kein Film'); continue; }
    console.log(`  Kandidaten (${film.cands.length}):`);
    for (const m of film.cands) console.log(`    ${fmt(m.t0)}–${fmt(m.t1)} s  ${m.kind.padEnd(8)} ${fmt(m.score).padStart(6)} P  ${m.label}${m.hard ? ' (+hart)' : ''}${m.close ? ' (+knapp)' : ''}`);
    console.log(`  Film ${fmt(film.duration)} s, ${film.moments} Momente + Ziel:`);
    for (const c of film.clips) console.log(`    ${fmt(c.a)}–${fmt(c.b)} s (Zeitlupe ${fmt(c.c0)}–${fmt(c.c1)} ×${c.smin})  ${fmt(c.film)} s Film  ${c.label}  [${c.shots.map((s) => s.cam).join(' → ')}]`);
    const P = new FilmPlayer(film);
    let steps = 0;
    while (!P.done && steps < 10000) { P.advance(1 / 60); steps++; }
    console.log(`  abgespielt: ${fmt(steps / 60)} s bei 60 Hz`);
    out.push({ name: R.name, time: race.time, crashes: race.crashes, film: { duration: film.duration, clips: film.clips.map((c) => ({ kind: c.kind, label: c.label, a: c.a, b: c.b, c0: c.c0, c1: c.c1, film: c.film, score: c.score, shots: c.shots.map((s) => s.cam) })) }, cands: film.cands.map((m) => ({ kind: m.kind, t0: m.t0, t1: m.t1, score: +m.score.toFixed(1), label: m.label })) });
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
}
