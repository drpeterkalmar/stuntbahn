// n16 Mittel ohne Linien-Magnet: Probe mit menschenähnlichen Bots, Varianten der Mittel-Werte im Vergleich.
//   Bots: mensch        – lenkt nur grob zur Fahrbahnmitte (Regler auf die Mittellinie): Kurven sieht er kommen
//                         (Vorsteuerung sofort), Abweichungen korrigiert er nach 0,2 s Reaktionszeit, langsames
//                         Rauschen ±0,1; Vollgas, bremst voll nur solange „Bremsen!“ steht (auch 0,2 s später)
//         mensch-voll   – wie mensch, aber immer Vollgas (ignoriert den Hinweis; fliegt über langsame Schanzen)
//         mensch-gefühl – wie oben, Gas/Bremse nach Gefühl (Gas bis 5 % über Profil-Tempo, bremst ab 15 %)
//         perfekt-voll  – lenkt wie der Autopilot (Ideallinie), Vollgas (wie tests/out/n14/mittel_probe.mjs)
//         mensch-handy  – (n23) Spieler am Handy: Reaktion 0,35 s (Korrektur und „Bremsen!“), grobe Lenkung (Stufen
//                         von 1/3, Rauschen ±0,15), Vollgas außer solange „Bremsen!“ steht
//   Kennzahlen: Ziel, Zeit, Crashs gesamt / davon in Looping/Röhre/Korkenzieher (bis 25 m danach), Dreher
//   (Kurswinkel > 1,2 rad am Boden), Abflug (Crash außer Aufprall, nicht an Stunts/Schanzen), Median Abstand zur Ideallinie außerhalb von Stunts (m).
// Aufruf: node tools/mittel_probe.mjs [--var=n15,zug0,neu,…] [--bot=mensch-voll,…] [--sam=4] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate, demoLayout } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race, ASSISTS, MEDIUM_N15, MEDIUM_N16, MEDIUM_N23 } = await imp('src/game/race.js');
const { Autopilot } = await imp('src/ai/autopilot.js');
const { BRAKE_WARN } = await imp('src/game/warn.js');
const { parseTrk } = await imp('src/track/trk.js');
const { trkToLayout } = await imp('src/track/trkimport.js');
const { tracksOf } = await imp('src/game/sammlung.js');
const { rng, fmtTime } = await imp('src/core/util.js');

export const VARS = {
  n15: { ...MEDIUM_N15 },                                           // bis n15: Zug 0,28 / Stunt 0,6, Magnet 0,35
  zug0: { steerPull: 0, stuntPull: 0, magnet: 0.35, grip: 1, slipK: 1, lanePull: 0 },       // Probelauf: ohne Zug, ohne Extra-Haftung
  zug0stunt: { steerPull: 0, stuntPull: 0.6, magnet: 0.35, grip: 1, slipK: 1, lanePull: 0 }, // ohne Zug auf der Strecke, Stunt-Zug wie bisher
  haftung: { ...MEDIUM_N16, lanePull: 0 },                                        // n16-Haftung, ganz ohne Hilfe im Stunt
  n16: { ...MEDIUM_N16, tcs: 0, drive: 1, speed: 1.25, warn: false, esc: 0, espFrom: undefined, espMax: undefined },   // n16 bis n22 (?m=n16)
  neu: { ...MEDIUM_N23 },                                            // n23
};
// weitere Varianten: --extra="grip:1.2,tcs:0;…" (Abwandlungen von n23)
for (const x of (process.argv.find((a) => a.startsWith('--extra=')) || '--extra=').slice(8).split(';').filter(Boolean)) { const o = {}; for (const kv of x.split(',')) { const [k, v] = kv.split(':'); o[k] = +v; } VARS[x.replace(/,/g, ' ')] = { ...MEDIUM_N23, ...o }; }
const DT = 1 / 120;
const KFB = +arg('kfb', 0.2), NOISE = +arg('noise', 0.1);   // Mensch: Stärke der (verzögerten) Korrektur – ruhige Hand statt Regler-Gier

export function stuntTracks(nSam = 4) {
  const list = [['Demo', () => demoLayout()]];
  for (const [s, d] of [[20260927, 2], [4711, 3], [42, 3], [777, 3], [555, 3], [9, 3]]) list.push([`S${s}/${d}`, () => generate(s, d)]);
  const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
  if (nSam > 0 && fs.existsSync(jf)) {
    const T = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
    let got = 0;
    for (let q = 0; q < 60 && got < nSam; q++) {
      const k = Math.floor((q + 0.5) * T.length / 60), t = T[k];
      const lay = () => { const L = trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), t.id)).layout; L.meta.key = t.id; return L; };
      const ty = lay().pieces.map((p) => p.type).join(' ');
      if (/loop|tube|pipe|cork/.test(ty)) { list.push([t.id, lay]); got++; }
    }
  }
  return list;
}

export function runBot(v, set, bot, seed = 7) {
  if (Array.isArray(seed)) { const R = seed.map((sd) => runBot(v, set, bot, sd)); return { ok: R.every((x) => x.ok), okN: R.filter((x) => x.ok).length, time: R.reduce((a, x) => a + (x.time || 0), 0) / R.length, crashes: R.reduce((a, x) => a + x.crashes, 0), stuntCr: R.reduce((a, x) => a + x.stuntCr, 0), spins: R.reduce((a, x) => a + x.spins, 0), abflug: R.reduce((a, x) => a + x.abflug, 0), lat: R.reduce((a, x) => a + x.lat, 0) / R.length, hints: R.reduce((a, x) => a + x.hints, 0), ap: v.apTime, runs: R.length, why: R.reduce((a, x) => { for (const k in x.why) a[k] = (a[k] || 0) + x.why[k]; return a; }, {}) }; }
  const env = v.env, L = env.track.line, P = env.prof;
  const saved = { ...ASSISTS.medium };
  Object.assign(ASSISTS.medium, set);
  const W0 = { ...BRAKE_WARN }; if (set.react) BRAKE_WARN.react = set.react; if (set.hint) BRAKE_WARN.hint = set.hint;   // Abstimm-Läufe (--extra=react:…,hint:…)
  const race = new Race(env, { assist: 'medium', countdown: 0.5, brakeHelp: 'hint' });
  const mid = new Autopilot(L, P);   // „grob zur Mitte“: Regler auf die Fahrbahnmitte statt auf die Ideallinie
  const r = rng(seed), q = [];
  const why = {};
  let noise = 0, nT = 0, t = 0, run = 0, lat = [], spins = 0, spin = false, stuntCr = 0, hints = 0, abflug = 0;
  const lim = Math.max(150, (v.apTime || 80) * 4);
  const nearStunt = (i) => { for (const z of race.zones) { if (z.kinds.every((k) => k === 'jump')) continue; const d = L.s[i] - L.s[z.i0]; if (i >= z.i0 && (i <= z.i1 || L.s[i] - L.s[z.i1] < 25)) return true; if (d > -3 && d < 0) return true; } return false; };
  while (t < lim && race.state !== 'finished') {
    const ap = race.ap.control(race.car);
    nT -= DT; if (nT <= 0) { noise = r.range(-1, 1); nT = r.range(0.3, 1.2); }
    let u;
    if (bot === 'perfekt-voll') u = { steer: ap.steer, throttle: 1, brake: 0 };
    else if (bot === 'perfekt') u = { steer: ap.steer, throttle: ap.throttle, brake: ap.brake };
    else if (bot === 'perfekt-hinweis') u = { steer: ap.steer, throttle: race.bhOn ? 0 : 1, brake: race.bhOn ? 1 : 0 };   // lenkt perfekt, Pedale nach „Bremsen!“
    else {
      // Mensch: sieht die Kurve kommen (Vorsteuerung ohne Verzögerung), korrigiert Abweichungen von der Fahrbahnmitte
      // aber erst nach 0,2 s; reagiert auf „Bremsen!“ ebenfalls nach 0,2 s
      // nach Reset/Rückspulen/Versetzen: neu orientieren, Hände kurz vom Lenkrad (alte Korrekturen verfallen)
      if (race.state !== 'running' || Math.abs(race.ap.tr.idx - mid.tr.idx) > 12) { mid.tr.reset(race.ap.tr.idx); q.length = 0; }
      mid.control(race.car);
      // Handy: 0,35 s Reaktion in echter Zeit = 0,35 × Spieltempo s Spielzeit (bis n22 1,25, Mittel ab n23 1,0)
      const handy = bot === 'mensch-handy', lag = handy ? Math.round(0.35 * (set.speed || 1.25) / DT) : 24;
      q.push([mid.fbN, !!race.bhOn]); const [fb, bh] = q.length > lag ? q.shift() : [0, false];
      let steer = Math.max(-1, Math.min(1, mid.ffN + KFB * fb + noise * (handy ? 0.15 : NOISE)));
      if (handy) steer = Math.round(steer * 3) / 3;
      if (bot === 'mensch-voll') u = { steer, throttle: 1, brake: 0 };
      else if (bot === 'mensch' || handy) u = { steer, throttle: bh ? 0 : 1, brake: bh ? 1 : 0 };
      else { const vt = P.vt[race.ap.tr.idx], vv = race.car.fwdSpeed(); u = { steer, throttle: vv < vt * 1.05 ? 1 : 0, brake: vv > vt * 1.15 ? 0.6 : 0 }; }
    }
    const c0 = race.crashes;
    race.step(DT, u); t += DT;
    if (race.crashes > c0 && race.car.crash) { const k = (nearStunt(race.tracker.idx) ? 'S:' : '') + race.car.crash.reason; why[k] = (why[k] || 0) + 1; }
    for (const e of race.events) if (e.type === 'brakehint') hints++;
    race.events.length = 0;
    if (race.crashes > c0 && nearStunt(race.tracker.idx)) stuntCr++;
    else if (race.crashes > c0 && race.car.crash && race.car.crash.reason !== 'Aufprall' && !race.isJumpZone(race.tracker.idx) && !L.air[race.tracker.idx]) abflug++;
    if (race.state !== 'running') { spin = false; continue; }
    run += DT;
    const i = race.ap.tr.idx, psi = Math.abs(race.ap.psi || 0);
    if (race.car.onGround >= 2 && !L.air[i]) { if (!spin && psi > 1.2) { spins++; spin = true; } else if (spin && psi < 0.5) spin = false; }
    if (!(L.air[i] || L.loop[i] || L.tube[i] || race.isJumpZone(i))) lat.push(Math.abs(race.ap.lat));
  }
  Object.keys(ASSISTS.medium).forEach((k) => delete ASSISTS.medium[k]); Object.assign(ASSISTS.medium, saved); Object.assign(BRAKE_WARN, W0);
  return { ok: race.state === 'finished', time: race.finalTime, crashes: race.crashes, stuntCr, spins, abflug, lat: lat.length ? lat.sort((a, b) => a - b)[lat.length >> 1] : 0, hints, rewinds: race.rewinds, ap: v.apTime, why };
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const vars = [...arg('var', 'n15,zug0,zug0stunt,neu').split(','), ...Object.keys(VARS).filter((k) => k.includes(':'))], bots = arg('bot', 'mensch,perfekt-voll').split(',');
  const tracks = stuntTracks(+arg('sam', 4)).map(([n, f]) => [n, verifySync(f())]);
  const out = {}, SEEDS = arg('seeds', '7,8,9').split(',').map(Number);
  for (const bot of bots) {
    console.log(`\n## Bot ${bot}`);
    console.log(`| Strecke | ${vars.map((k) => `${k}: Zeit / Crashs (Stunt) / Dreher / Median Linie m`).join(' | ')} |`);
    console.log(`|---|${vars.map(() => '---').join('|')}|`);
    const sum = Object.fromEntries(vars.map((k) => [k, { ok: 0, cr: 0, st: 0, sp: 0, ab: 0, lat: 0, n: 0, tsum: 0 }]));
    for (const [tn, v] of tracks) {
      const cells = [];
      for (const k of vars) {
        const x = runBot(v, VARS[k], bot, bot.startsWith('mensch') ? SEEDS : 7);
        (out[bot] ||= {})[tn] ||= {}; out[bot][tn][k] = x;
        const S = sum[k]; S.ok += x.okN ?? +x.ok; S.runs = (S.runs || 0) + (x.runs || 1); S.cr += x.crashes; S.st += x.stuntCr; S.sp += x.spins; S.ab += x.abflug; S.lat += x.lat; S.n++; S.why ||= {}; for (const w in x.why) S.why[w] = (S.why[w] || 0) + x.why[w]; if (x.ok) S.tsum += x.time / x.ap;
        cells.push(`${x.runs ? `${x.okN}/${x.runs} ` : ''}${x.ok ? fmtTime(x.time) : 'NEIN'} / ${x.crashes} (${x.stuntCr}) / ${x.spins} / ${x.lat.toFixed(2)}`);
      }
      console.log(`| ${tn} | ${cells.join(' | ')} |`);
    }
    console.log(`| **Summe** | ${vars.map((k) => { const S = sum[k]; return `Ziel ${S.ok}/${S.runs}, Crashs ${S.cr} (Stunt ${S.st}), Dreher ${S.sp}, Abflug ${S.ab}, Zeit/Autopilot ${(S.tsum / S.n).toFixed(2)}, Ø ${(S.lat / S.n).toFixed(2)} m`; }).join(' | ')} |`);
    for (const k of vars) console.log(`Gründe ${k}: ${JSON.stringify(sum[k].why)}`);
    out[bot].sum = sum;
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out, null, 1));
}
