// n38 Etappe 2 Landeschub – Messgröße 5 des Vorlagen-Datenblatts: 0 zusätzliche Crashs an Folgeelementen, Tempo nach dem Schub nie
// über dem sicheren Absprungtempo der nächsten Schanze. Je Variante landeschub 0/1 (übrige n38-Regler Standard) auf Sammlungs-
// Strecken mit Schanzen und geprüften Zufallsstrecken (Generator-Version 2):
//   leicht – Leicht, Autopilot Sauber (Extras automatisch)        profi – Mittel, lenkt wie der Autopilot, Vollgas außer Hinweis,
//   voll   – Mittel-Bot „mensch-voll“ (immer Vollgas)              handy – Mittel-Bot „mensch-handy“ (tools/mittel_probe.mjs)
// Kennzahlen: im Ziel, Crashs, Landeschübe, Lippen-Überfahrten mit Tempo > Fenster-vmax (gesamt / davon ≤ 4 s nach einem Schub),
// Zeit (Summe über die gemeinsam beendeten Strecken).
// Aufruf: node tools/landeschub_mess.mjs [Sammlung = 30] [--zufall=12] [--fahrer=leicht,profi,voll,handy] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race, MEDIUM_N24 } = await imp('src/game/race.js');
const { LOHN, setLohn } = await imp('src/game/lohn.js');
const { parseTrk } = await imp('src/track/trk.js');
const { trkToLayout } = await imp('src/track/trkimport.js');
const { tracksOf } = await imp('src/game/sammlung.js');
const { runBot } = await imp('tools/mittel_probe.mjs');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const NS = +(process.argv.find((a) => /^\d+$/.test(a)) || 30), NZ = +arg('zufall', 12);
const FAHRER = arg('fahrer', 'leicht,profi,voll,handy').split(',');
const SEEDS = arg('seeds', '7').split(',').map(Number);   // Mensch-Bots: Zufalls-Seeds (mehr = weniger Rauschen)
const DT = 1 / 120;

const tracks = [];
{
  const T = tracksOf(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8'))), bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
  for (let q = 0; q < T.length && tracks.length < NS; q++) {
    const k = Math.floor((q * 37) % T.length), t = T[k];
    try {
      const L = trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), t.id)).layout; L.meta.key = t.id;
      const v = verifySync(L);
      if (v.ok && v.env.track.jumps.length) tracks.push({ name: t.id, v });
    } catch { /* Strecke nicht baubar */ }
  }
}
for (let k = 0; k < NZ; k++) for (const o of [{}, { d3: true }, { gel: true }]) {
  const seed = 2000 + k * 7919 % 90000, v = verifySync(generate(seed, 2 + (k % 2), { ...o, gv: 2 }));
  if (v.ok && v.env.track.jumps.length) tracks.push({ name: `${seed}-${2 + (k % 2)}${o.d3 ? '-3d' : o.gel ? '-gel' : ''}h`, v });
}

// Lippen-Überfahrten: Tempo gegen das Fenster der Schanze, Schub kurz davor?
function lipWatch(race) {
  const L = race.env.track.line, P = race.env.prof, J = race.env.track.jumps;
  const W = { prev: race.tracker.idx, lbT: -99, over: 0, overB: 0, lips: 0, boosts: 0, maxRel: 0 };
  W.step = () => {
    if (race.lb) { if (race.lb !== W.lb) { W.boosts++; W.lb = race.lb; } if (race.car.boost > 0) W.lbT = race.time; W.eff = (W.eff || 0) + (race.car.boost > 0 && race.nitroT < 0 ? DT : 0); }
    const i = race.tracker.idx;
    if (race.state === 'running' && race.car.onGround > 0) J.forEach((j, k) => {
      const w = P.windows && P.windows[k];
      if (!w || !w.vmax) return;   // auch Sammlungs-/Import-Rampen (eigenes Fenster)
      if (W.prev < j.lipIdx && i >= j.lipIdx && i - W.prev < 40) {
        const v = race.car.fwdSpeed(); W.lips++;
        if (v > w.vmax) { W.over++; if (race.time - W.lbT < 4) { W.overB++; W.maxRel = Math.max(W.maxRel, v / w.vmax); } if (race.lb && race.car.boost > 0 && race.nitroT < 0) W.overA = (W.overA || 0) + 1; }
      }
    });
    W.prev = i;
  };
  return W;
}

function own(v, fahrer) {
  const r = new Race(v.env, { assist: fahrer === 'leicht' ? 'easy' : 'medium', countdown: 0.05, autoExtras: fahrer === 'leicht', brakeHelp: 'hint' });
  const W = lipWatch(r), lim = Math.max(150, (v.apTime || 60) * 4);
  let inp = { steer: 0, throttle: 0, brake: 0 };
  for (let t = 0; t < lim && r.state !== 'finished'; t += DT) {
    r.step(DT, inp); r.events.length = 0; W.step();
    const o = r.ap.out;
    inp = fahrer === 'leicht' ? { steer: 0, throttle: 0, brake: 0 } : { steer: o.steer, throttle: r.bhOn || r.jumpSt === 'hi' ? 0 : 1, brake: r.bhOn ? 1 : 0 };
    if (fahrer === 'profi' && r.car.onGround === 0 && r.car.airTime >= 0.32 && r.car.airTime < 0.38) inp.throttle = 1;
    else if (fahrer === 'profi' && r.car.onGround === 0) inp.throttle = 0;
  }
  return { ok: r.state === 'finished', time: r.finalTime, crashes: r.crashes, W };
}

const out = {};
for (const ls of [0, 1]) {
  setLohn({ landeschub: ls });
  for (const f of FAHRER) {
    const A = (out[`${f}-${ls}`] = { n: 0, ok: 0, crashes: 0, boosts: 0, lips: 0, over: 0, overB: 0, maxRel: 0, time: {} });
    for (const T of tracks) {
      let x;
      if (f === 'voll' || f === 'handy') {
        let W = null; const Ws = [];
        const hook = (race) => { if (!W || W.race !== race) { W = lipWatch(race); W.race = race; Ws.push(W); } W.step(); };
        const b = runBot(T.v, MEDIUM_N24, f === 'voll' ? 'mensch-voll' : 'mensch-handy', SEEDS, hook);
        const sum = (k) => Ws.reduce((a, w) => a + (w[k] || 0), 0);
        x = { ok: b.ok, time: b.time, crashes: b.crashes, W: { boosts: sum('boosts'), eff: sum('eff'), lips: sum('lips'), over: sum('over'), overB: sum('overB'), overA: sum('overA'), maxRel: Math.max(0, ...Ws.map((w) => w.maxRel)) } };
      } else x = own(T.v, f);
      A.n++; A.ok += x.ok ? 1 : 0; A.crashes += x.crashes; A.boosts += x.W.boosts; A.eff = (A.eff || 0) + (x.W.eff || 0); A.lips += x.W.lips; A.over += x.W.over; A.overB += x.W.overB; A.overA = (A.overA || 0) + (x.W.overA || 0); A.maxRel = Math.max(A.maxRel, x.W.maxRel);
      if (x.ok) A.time[T.name] = x.time;
    }
  }
}
for (const f of FAHRER) {
  const a = out[`${f}-0`], b = out[`${f}-1`];
  let sa = 0, sb = 0, n = 0; for (const k of Object.keys(a.time)) if (b.time[k]) { sa += a.time[k]; sb += b.time[k]; n++; }
  console.log(`${f.padEnd(6)} ohne: ${a.ok}/${a.n} Ziel, Crashs ${a.crashes}, Lippe zu schnell ${a.over}/${a.lips} · mit: ${b.ok}/${b.n} Ziel, Crashs ${b.crashes}, Landeschübe ${b.boosts} (wirksam Ø ${(b.eff / Math.max(1, b.boosts)).toFixed(2)} s), Lippe zu schnell ${b.over}/${b.lips} (Schub dabei aktiv ${b.overA || 0}, ≤ 4 s nach Schub ${b.overB}${b.maxRel ? `, höchstens ×${b.maxRel.toFixed(3)}` : ''}) · Zeit ${((1 - sb / sa) * 100).toFixed(1)} % schneller (${n} Str.)`);
}
console.log(`${tracks.length} Strecken (${tracks.filter((t) => !/h$/.test(t.name)).length} Sammlung)`);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ tracks: tracks.map((t) => t.name), out }, null, 1));
