// n24 Mittel (Peter 03.10.2026: „Sprünge gehen zu weit, Auto unkontrollierbar schnell – weniger schnell beschleunigen“):
// A Beschleunigung im Zielfenster (0–100 ~3–3,5 s, 0–200 ~7–9 s, Höchsttempo 250–300 km/h), n23/Original unverändert
// B Regler nur auf Mittel (Leicht, Original, Autopilot/Prüffahrt ohne), Gas-Rampe
// C Sprung-Hilfe: zu schnell → landet auf der Rampe statt dahinter, zu langsam → nicht „Zu kurz“; ohne Hilfe wie bisher
// D Landequote menschenähnlicher Bot ≥ 85 %, kein Flug hinter die Landerampe (auch Vollgas-Bot)
// E Schanzen-Hinweis im HUD (Show-Tacho-Zahl), Bestzeiten Mittel einmalig neu, A/B-Links werten nicht
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const { accel } = await import('../../tools/mittel2_mess.mjs');
const { ASSISTS, MEDIUM_N23, MEDIUM_N24, Race } = await import('../../src/game/race.js');
const { JUMP_PULL } = await import('../../src/game/jumpassist.js');
const { chain, setup } = await import('./common.mjs');
const { jumpTracks } = await import('../../tools/sprung_probe.mjs');
const { runBot } = await import('../../tools/mittel_probe.mjs');
const { Store, abMode } = await import('../../src/game/store.js');
const { showKmhMs } = await import('../../src/core/showspeed.js');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f2 = (x) => (x == null ? '–' : x.toFixed(2).replace('.', ','));
const DT = 1 / 120;

console.log('--- A: Beschleunigung ---');
const a24 = accel(MEDIUM_N24), a23 = accel({ ...MEDIUM_N23 }), aO = accel({ magnet: 0, grip: 1 });
check(a24[100] >= 2.9 && a24[100] <= 3.6, `Mittel n24: 0–100 km/h ${f2(a24[100])} s (Ziel ~3,0–3,5; n23 ${f2(a23[100])} s)`);
check(a24[200] >= 6.5 && a24[200] <= 9.5, `Mittel n24: 0–200 km/h ${f2(a24[200])} s (Ziel ~7–9; n23 ${f2(a23[200])} s)`);
check(a24.vmax >= 250 && a24.vmax <= 300, `Mittel n24: Höchsttempo ${Math.round(a24.vmax)} km/h echt (Tacho ${Math.round(showKmhMs(a24.vmax / 3.6))}; n23 ${Math.round(a23.vmax)})`);
check(Math.abs(a23[100] - 1.57) < 0.05 && Math.abs(a23[200] - 2.82) < 0.06, `?m=n23 = Mittel wie bisher: ${f2(a23[100])} / ${f2(a23[200])} s`);
check(Math.abs(aO[100] - 1.96) < 0.05 && Math.abs(aO[200] - 3.53) < 0.06 && aO.vmax > 540, `Original unverändert: ${f2(aO[100])} / ${f2(aO[200])} s, ${Math.round(aO.vmax)} km/h`);

console.log('--- B: nur Mittel, Gas-Rampe ---');
check(ASSISTS.medium.drive === MEDIUM_N24.drive && ASSISTS.medium.vTop === MEDIUM_N24.vTop && ASSISTS.medium.jumpPull && ASSISTS.medium.thrRamp, 'Mittel nutzt n24 (Antrieb, Kappe, Rampe, Sprung-Hilfe, Schanzen-Hinweis)');
check(['easy', 'original'].every((k) => !ASSISTS[k].drive && !ASSISTS[k].vTop && !ASSISTS[k].jumpPull && !ASSISTS[k].thrRamp && !ASSISTS[k].jumpHint), 'Leicht und Original ohne die n24-Regler');
const c = chain(5, 15, 0, ['start', 'straight', 'straight', 'jump', 'straight', 'straight', 'straight']);
const env = setup({ pieces: c.pieces, seed: 1 });
{
  const r = new Race(env, { assist: 'medium', countdown: 0.01 });
  for (let k = 0; k < 4; k++) r.step(DT, { steer: 0, throttle: 0, brake: 0 });
  const th = [];
  for (let k = 0; k < 66; k++) { r.step(DT, { steer: 0, throttle: 1, brake: 0 }); if (k === 23 || k === 59) th.push(r.car.input.throttle); }
  r.step(DT, { steer: 0, throttle: 0, brake: 0 });
  check(Math.abs(th[0] - 24 / 120 / MEDIUM_N24.thrRamp) < 0.03 && th[1] === 1 && r.car.input.throttle === 0, `Gas-Rampe: nach 0,2 s ${f2(th[0])}, nach 0,5 s ${f2(th[1])}, Gas weg sofort 0`);
  const ap = new Race(env, { assist: 'medium', autopilot: true, countdown: 0.01 });
  for (let k = 0; k < 30; k++) ap.step(DT, { steer: 0, throttle: 0, brake: 0 });
  check(ap.car.assist.drive === 1 && !ap.car.assist.vTop && ap.jumpK === 0, 'Autopilot/Prüffahrt: Antrieb wie bisher (keine Kappe, keine Sprung-Hilfe) → Schanzen-/Looping-Fenster unverändert');
}

console.log('--- C: Sprung-Hilfe ---');
// Auto mit festem Tempo knapp vor der Lippe absetzen, geradeaus Vollgas (Lenkung Autopilot), Landung messen
const J = env.track.jumps[0], L = env.track.line;
function jumpAt(assist, v, pull) {
  const saved = { ...ASSISTS[assist] };
  if (assist === 'medium') ASSISTS.medium.jumpPull = pull;
  const r = new Race(env, { assist, countdown: 0.01 });
  for (let k = 0; k < 4; k++) r.step(DT, { steer: 0, throttle: 0, brake: 0 });
  let i = J.lipIdx; while (L.s[J.lipIdx] - L.s[i] < 8) i--;
  r.place(i, v);
  let air = 0, land = null, maxK = 0;
  for (let k = 0; k < 900 && land == null && !r.car.crash; k++) {
    const a = r.ap.control(r.car);
    r.step(DT, { steer: a.steer, throttle: 1, brake: 0 }); r.events.length = 0;
    maxK = Math.max(maxK, Math.abs(r.jumpK));
    if (r.car.onGround === 0) air += DT; else if (air > 0.3) {
      const ax = L.px[J.landIdx] - L.px[J.lipIdx], az = L.pz[J.landIdx] - L.pz[J.lipIdx], al = Math.hypot(ax, az);
      land = ((r.car.pos.x - L.px[J.lipIdx]) * ax + (r.car.pos.z - L.pz[J.lipIdx]) * az) / al - al;
    }
  }
  Object.keys(ASSISTS[assist]).forEach((k) => delete ASSISTS[assist][k]); Object.assign(ASSISTS[assist], saved);
  return { land, crash: r.car.crash ? r.car.crash.reason : '', maxK };
}
// m/s an der Lippe, relativ zum Fenster der Schanze (n24: 187 km/h zu schnell = P90 des Vollgas-Bots, 223 km/h weit drüber,
// 133 km/h knapp zu kurz bei Fenster 140–168 km/h; n26-Schanze 122–144 km/h: gleiche Abstände zum Fenster)
const JW = env.prof.windows[0], fast = JW.vmax + 5.2, wild = JW.vmax + 15.2, slow = JW.vmin - 1.8;
const F1 = jumpAt('medium', fast, 1), F0 = jumpAt('medium', fast, 0), FO = jumpAt('original', fast, 0), W1 = jumpAt('medium', wild, 1), W0 = jumpAt('medium', wild, 0);
console.log(`     zu schnell (${Math.round(fast * 3.6)} km/h): mit Hilfe ${f2(F1.land)} m ${F1.crash}, ohne ${f2(F0.land)} m ${F0.crash}, Original ${f2(FO.land)} m (Rampe ${J.landLen} m)`);
check(F0.land > J.landLen, `ohne Hilfe zu schnell: hinter der Landerampe (${f2(F0.land)} m > ${J.landLen} m)`);
check(F1.land != null && F1.land <= J.landLen && !F1.crash, `mit Hilfe: auf der Rampe (${f2(F1.land)} m), kein Crash`);
check(FO.maxK === 0 && FO.land > J.landLen, `Original ohne Hilfe (${f2(FO.land)} m)`);
check(W1.land < W0.land - 25 && !W1.crash, `weit drüber (${Math.round(wild * 3.6)} km/h): Hilfe zieht ${f2(W0.land - W1.land)} m zurück (${f2(W0.land)} → ${f2(W1.land)} m), begrenzt (gUp/aH), wer viel zu schnell ist, landet weiter hinten`);
const S1 = jumpAt('medium', slow, 1), S0 = jumpAt('medium', slow, 0);
console.log(`     zu langsam (${Math.round(slow * 3.6)} km/h): mit Hilfe ${f2(S1.land)} m ${S1.crash}, ohne ${f2(S0.land)} m ${S0.crash}`);
check((S0.land == null || S0.land < JUMP_PULL.lo) && S1.land != null && S1.land >= 0 && !S1.crash, `zu langsam: ohne Hilfe ${S0.crash || 'vor der Rampe'}, mit Hilfe auf der Rampe (${f2(S1.land)} m)`);
const N1 = jumpAt('medium', JW.vbest, 1);
check(N1.maxK < 0.05, `im Fenster (${Math.round(JW.vbest * 3.6)} km/h): Hilfe greift nicht (größte Stärke ${f2(N1.maxK)})`);

console.log('--- D: Landequote menschenähnlicher Bots ---');
{
  const tracks = jumpTracks(8);
  for (const bot of ['mensch-handy', 'mensch-voll']) {
    const st = [];
    const hook = (() => { let s = null; return (race) => {
      const Lx = race.env.track.line, Js = race.env.track.jumps.filter((j) => !j.gen), car = race.car, ti = race.tracker.idx;
      if (!s || s.race !== race) s = { race, at: null, prev: ti, air: 0, cr: race.crashes };
      for (const j of Js) if (s.prev < j.lipIdx && ti >= j.lipIdx && ti - s.prev < 20 && race.state === 'running') s.at = { j, cr: race.crashes, t: race.time };
      s.prev = ti;
      if (!s.at) return;
      const j = s.at.j;
      if (car.onGround === 0) s.air += DT;
      if (race.crashes > s.at.cr || race.state !== 'running') { st.push('crash'); s.at = null; s.air = 0; return; }
      if (car.onGround > 0 && s.air > 0.3) {
        const ax = Lx.px[j.landIdx] - Lx.px[j.lipIdx], az = Lx.pz[j.landIdx] - Lx.pz[j.lipIdx], al = Math.hypot(ax, az);
        const fl = ((car.pos.x - Lx.px[j.lipIdx]) * ax + (car.pos.z - Lx.pz[j.lipIdx]) * az) / al - al;
        st.push(fl < 0 ? 'kurz' : fl > j.landLen ? 'weit' : 'ok'); s.at = null; s.air = 0;
      }
      if (s.at && race.time - s.at.t > 6) { s.at = null; s.air = 0; }
    }; })();
    for (const [, v] of tracks) runBot(v, MEDIUM_N24, bot, [7, 8], hook);
    const n = st.length, ok = st.filter((x) => x === 'ok').length, weit = st.filter((x) => x === 'weit').length;
    if (bot === 'mensch-handy') check(n >= 20 && ok / n >= 0.85 && weit === 0, `${bot}: ${ok}/${n} saubere Landungen (${Math.round(ok / n * 100)} %, Ziel ≥ 85 %), hinter der Rampe ${weit}`);
    else check(n >= 20 && weit === 0, `${bot} (Vollgas): kein Flug hinter die Landerampe (${weit} von ${n}; sauber ${ok})`);
  }
}

console.log('--- E: Schanzen-Hinweis, Bestzeiten, A/B ---');
{
  const r = new Race(env, { assist: 'medium', countdown: 0.01 });
  let hint = null;
  for (let k = 0; k < 120 * 12 && !hint; k++) { const a = r.ap.control(r.car); r.step(DT, { steer: a.steer, throttle: 1, brake: 0 }); r.events.length = 0; if (r.hud && /Schanze/.test(r.hud.text)) hint = r.hud; }
  check(!!hint && /\d+ km\/h/.test(hint.text) && /^jump j(ok|lo|hi)$/.test(hint.kind), `Schanzen-Hinweis vor der Lippe: „${hint && hint.text}“ (${hint && hint.kind})`);
}
mem.clear();
// (stuntReset 26 / tubeReset 29: die Einmal-Resets der Zufallsstrecken sind hier schon gelaufen – geprüft in
// test_stuntgroesse.mjs bzw. test_roehre_buckel.mjs)
mem.set('stuntbahn.v1', JSON.stringify({ settings: { assist: 'medium' }, reset: 21, stuntReset: 26, tubeReset: 29, best: { 'T1|medium+reset@x': { time: 50 }, 'T1|original+reset@x': { time: 55 }, 'T2|medium+wrack': { time: 70 } }, ghostIndex: ['T1|medium+reset@x', 'T1|original+reset@x'] }));
mem.set('stuntbahn.ghost.T1|medium+reset@x', 'AAAA'); mem.set('stuntbahn.ghost.T1|original+reset@x', 'BBBB');
let S = new Store();
check(Object.keys(S.best).join(',') === 'T1|original+reset@x' && !mem.has('stuntbahn.ghost.T1|medium+reset@x') && mem.has('stuntbahn.ghost.T1|original+reset@x') && S.medNote === 2,
  `Mittel-Bestzeiten + Geister einmalig gelöscht (2), Original bleibt; Hinweis im Menü (medNote ${S.medNote})`);
S.submit('T1', 'medium', false, 61, new Float32Array(16 * 40), {});
S = new Store();
check(S.best['T1|medium+reset@x'] && S.best['T1|medium+reset@x'].time === 61 && !S.medNote, 'zweites Laden löscht nichts mehr (neue Mittel-Bestzeit bleibt, kein Hinweis)');
check(abMode('?m=n23') && abMode('?antrieb=0.9') && !abMode('?tacho=echt') && !abMode('?g=0'), 'A/B werten nicht: ?m=n23, ?antrieb=…; Anzeige-Regler (?tacho, ?g) werten normal');

console.log(fails ? `FEHLER: ${fails}` : 'Mittel n24: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
