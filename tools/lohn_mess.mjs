// n38 Stunt-Lohn: Messgrößen aus dem Vorlagen-Datenblatt §5 auf geprüften Zufallsstrecken (flach, Hochstraße, Gelände; Generator-
// Version 2 „h“; Stufen 1–3 = Sanft/Sportlich/Irre), je Variante „aus“ (alle n38-Regler 0 = Stand n37) und „an“ (Standard).
//   Fahrer profi    – Mittel, lenkt wie der Autopilot, Vollgas außer bei „Bremsen!“/„langsamer ▼“ (Profi-Fahrweise), tippt in jeder Luftphase ≥ 0,32 s Gas
//                     (Salto, wenn die Flugzeit reicht – sonst „zu spät“), zündet Nitro, sobald bereit und keine Schanze/kein
//                     Bauwerk in Reichweite der Wirkung liegt
//            hopper – wie profi, aber ohne Tricks; hüpft, wann immer der Hüpfer geht (Messgröße 6: Dauer-Hüpfen)
//            leicht – Leicht, Autopilot Sauber mit „Extras automatisch“
//   Kennzahlen je Runde: Nitro-Zündungen, gutgeschriebene Abklingzeit (s und „Ladungen“ = s / COOLDOWN.nitro), davon Hüpfer,
//   Stunt-Punkte, Punkte je gerader Schanze (sauber), Kettenlängen (Median, Anteil ≥ 2), längstes Fenster, Rundenzeit, Crashs.
// Aufruf: node tools/lohn_mess.mjs [N je Art und Stufe = 4] [--fahrer=profi,hopper,leicht] [--var=aus,an] [--set=tank=150,…] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
const { LOHN, LOHN_AUS, setLohn } = await imp('src/game/lohn.js');
const { COOLDOWN, NITRO_TOTAL } = await imp('src/physics/extras.js');
const { STUNT } = await imp('src/game/stunts.js');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 4), von = +arg('von', 0);
const VARS = arg('var', 'aus,an').split(','), FAHRER = arg('fahrer', 'profi,hopper,leicht').split(',');
const SET = {}; for (const kv of arg('set', '').split(',').filter(Boolean)) { const [k, v] = kv.split('='); SET[k] = +v; }
const MODES = arg('modes', 'flach,3d,gel').split(',');
const DT = 1 / 120;
const STD = { ...LOHN };

// Stunt (Schanze/Bauwerk/Luft) innerhalb von d Metern voraus?
function stuntAhead(r, idx, d) {
  const L = r.env.track.line, s0 = L.s[idx];
  for (let k = 0, j = idx; k < L.n; k++) {
    let x = L.s[j] - s0; if (x < 0) x += L.total;
    if (x > d) return false;
    if (L.air[j] || L.loop[j] || L.tube[j] || r.isJumpZone(j) || (r.zig && r.zig[j])) return true;
    const nj = j + 1 >= L.n ? (L.closed ? 1 : L.n - 1) : j + 1; if (nj === j) return false; j = nj;
  }
  return false;
}

function run(v, fahrer, seed = 7) {
  const key = fahrer === 'leicht' ? 'easy' : 'medium';
  const r = new Race(v.env, { assist: key, countdown: 0.05, autoExtras: fahrer === 'leicht', seed, brakeHelp: 'hint' });
  const lim = Math.max(120, (v.apTime || 60) * 3);
  const stunts = [], plain = [];
  let inp = { steer: 0, throttle: 0, brake: 0 }, t = 0, tap = 0, lastAir = 0;
  for (; t < lim && r.state !== 'finished'; t += DT) {
    r.step(DT, inp);
    for (const e of r.events) if (e.type === 'stunt') { stunts.push(e); if (!e.bau && !e.hop && !e.flips && !e.rolls && !e.spins && e.landing === 'clean' && e.air > 2) plain.push(e.base * e.mult); }
    r.events.length = 0;
    const o = r.ap.out, c = r.car;
    // Profi-Fahrweise Mittel: lenkt wie der Autopilot, Vollgas außer bei „Bremsen!“ (bremst) und „langsamer ▼“ vor Schanzen (Gas weg)
    inp = { steer: o.steer, throttle: r.bhOn || r.jumpSt === 'hi' ? 0 : 1, brake: r.bhOn ? 1 : 0 };
    if (fahrer === 'leicht') { inp = { steer: 0, throttle: 0, brake: 0 }; continue; }
    // Profi: in der Luft Gas los, ab 0,32 s einmal antippen (Mittel: Salto, wenn die Flugzeit reicht), ~1,4 s später noch einmal
    if (c.onGround === 0) {
      const a = c.airTime;
      if (fahrer === 'profi') {
        const tapNow = (a >= 0.32 && a < 0.38) || (a >= 1.72 && a < 1.78);
        inp = { ...inp, throttle: tapNow ? 1 : 0, brake: 0 };
      }
      lastAir = t;
    }
    if (r.state === 'running' && r.charges.nitro && c.onGround >= 3 && t - lastAir > 0.5 && !stuntAhead(r, r.tracker.idx, Math.max(30, c.fwdSpeed() * (NITRO_TOTAL + 1.5)))) r.requestNitro();
    if (fahrer === 'hopper' && r.state === 'running' && !r.hopBlock(r.tracker.idx)) r.requestHop();
  }
  // Kettenlängen: eine Kette endet, wenn das nächste Glied wieder bei 1 beginnt (oder am Ende)
  const chains = []; let cur = 0;
  for (const e of stunts) { if (e.chain <= 1) { if (cur) chains.push(cur); cur = e.chain; } else cur = e.chain; }
  if (cur) chains.push(cur);
  return { ok: r.state === 'finished', time: r.state === 'finished' ? r.finalTime : null, crashes: r.crashes, nitro: r.used.nitro, hops: r.used.hop, lohn: { ...r.lohn }, pts: r.stunts.total, n: r.stunts.n, plain, chains, laps: 1 };
}

const tracks = [];
for (const mode of MODES) {
  const o = mode === '3d' ? { d3: true } : mode === 'gel' ? { gel: true } : {};
  for (const diff of [1, 2, 3]) for (let k = 0; k < N; k++) {
    const seed = 1000 + (k + von) * 7919 % 90000;
    const v = verifySync(generate(seed, diff, { ...o, gv: 2 }));
    if (v.ok) tracks.push({ name: `${seed}-${diff}-${mode}h`, diff, v });
  }
}
const med = (a) => { if (!a.length) return 0; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const out = {};
for (const variant of VARS) {
  setLohn(variant === 'aus' ? LOHN_AUS : { ...STD, ...SET });
  const S = (out[variant] = {});
  for (const f of FAHRER) for (const d of [1, 2, 3]) {
    const A = { n: 0, ok: 0, crashes: 0, nitro: 0, hops: 0, sec: 0, hopSec: 0, now: 0, pts: 0, stunts: 0, plain: [], chains: [], time: {} };
    for (const T of tracks.filter((x) => x.diff === d)) {
      const x = run(T.v, f);
      A.n++; A.ok += x.ok ? 1 : 0; A.crashes += x.crashes; A.nitro += x.nitro; A.hops += x.hops; A.sec += x.lohn.sec; A.hopSec += x.lohn.hop; A.now += x.lohn.now;
      A.pts += x.pts; A.stunts += x.n; A.plain.push(...x.plain); A.chains.push(...x.chains);
      if (x.ok) A.time[T.name] = x.time;
    }
    S[`${f}-${d}`] = A;
  }
}
const stufe = { 1: 'Sanft', 2: 'Sportlich', 3: 'Irre' };
for (const f of FAHRER) {
  console.log(`\n## ${f}`);
  for (const d of [1, 2, 3]) {
    for (const variant of VARS) {
      const A = out[variant][`${f}-${d}`], cd = COOLDOWN.nitro;
      let gain = '';
      if (variant !== 'aus' && out.aus) {
        const B = out.aus[`${f}-${d}`]; let sa = 0, sb = 0, n = 0;
        for (const k of Object.keys(A.time)) if (B.time[k]) { sa += A.time[k]; sb += B.time[k]; n++; }
        gain = n ? ` · Zeit ${((1 - sa / sb) * 100).toFixed(1)} % schneller (${n} Str.)` : '';
      }
      const ch = A.chains, ch2 = ch.filter((c) => c >= 2).length;
      console.log(`${stufe[d].padEnd(9)} ${variant.padEnd(3)}: ${A.ok}/${A.n} Ziel, Crashs ${A.crashes} · Nitro ${(A.nitro / A.n).toFixed(2)}/Runde · Lohn ${(A.sec / A.n).toFixed(1)} s = ${(A.sec / A.n / cd).toFixed(2)} Ladungen/Runde (Hüpfer ${(A.hopSec / Math.max(1e-9, A.sec) * 100).toFixed(0)} %, sofort bereit ${A.now}) · ${(A.pts / A.n).toFixed(0)} Pkt/Runde, ${(A.stunts / A.n).toFixed(1)} Stunts · gerade Schanze Ø ${A.plain.length ? (A.plain.reduce((a, b) => a + b, 0) / A.plain.length).toFixed(0) : '–'} (${A.plain.length}) · Kette Median ${med(ch)}, max ${Math.max(0, ...ch)}, ≥2: ${ch2}/${ch.length}${gain}`);
    }
  }
}
console.log(`\n${tracks.length} Strecken · tank ${LOHN.tank} · kette ${LOHN.kette} · Fenster max ${STUNT.winMax} s`);
if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ tracks: tracks.map((t) => t.name), out }, null, 1));
