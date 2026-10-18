// n38 Stunt-Lohn (src/game/lohn.js): reine Funktionen (Gutschrift auf die Nitro-Abklingzeit, Wertung n38: Bauwerke, ruhige Hand,
// Hüpfer), Rennlogik (Abklingzeit kürzer, Vorrat, voll = sofort bereit, Crash/Hüpfer zahlen nicht), Tracker (ruhige Hand, Looping
// als Kettenglied), Leicht-Automatik auf mehreren Geraden, alle Regler aus = Stand n37 bitgleich, Messgrößen, Bestzeiten einmalig neu.
const { LOHN, LOHN_AUS, setLohn, cooldownGain, creditNitro } = await import('../../src/game/lohn.js');
const { STUNT, scoreJump, scoreBau, chainWindow, chainFactor, StuntTracker, stuntText, bauKinds } = await import('../../src/game/stunts.js');
const { Race, ASSISTS } = await import('../../src/game/race.js');
const { Car, CAR_DEF } = await import('../../src/physics/car.js');
const { COOLDOWN, NITRO_TOTAL } = await import('../../src/physics/extras.js');
const { HL } = await import('../../src/game/highlights.js');
const { MAT } = await import('../../src/track/defs.js');
const { generate } = await import('../../src/track/generator.js');
const { verifySync } = await import('../../src/track/verify.js');
let fails = 0;
const check = (c, msg) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const DT = 1 / 120;
const STD = { ...LOHN };

console.log('--- A: Gutschrift auf die Abklingzeit ---');
{
  check(Math.abs(cooldownGain(LOHN.tank, 5) - 5) < 1e-9 && Math.abs(cooldownGain(LOHN.tank / 2, 5) - 2.5) < 1e-9 && cooldownGain(50, 5, 0) === 0, `${LOHN.tank} Punkte = eine ganze Abklingzeit, halb so viele = halbe, tank 0 = nichts`);
  let x = creditNitro({ ready: false, cd: 4, bank: 0 }, 1.5, 5);
  check(Math.abs(x.cd - 2.5) < 1e-9 && x.bank === 0 && Math.abs(x.used - 1.5) < 1e-9, 'lädt gerade: Restzeit 4 s − 1,5 s = 2,5 s');
  x = creditNitro({ ready: false, cd: 1, bank: 0 }, 3, 5);
  check(x.cd === 0 && Math.abs(x.bank - 2) < 1e-9 && Math.abs(x.stored - 2) < 1e-9, 'Überschuss (3 s auf 1 s Rest) → 2 s Vorrat');
  x = creditNitro({ ready: true, cd: 0, bank: 4 }, 3, 5);
  check(x.cd === 0 && x.bank === 5 && Math.abs(x.stored - 1) < 1e-9, 'bereit: in den Vorrat, höchstens eine ganze Abklingzeit');
}

console.log('--- B: Wertung n38 ---');
{
  const plain = scoreJump({ air: 2.6, landing: 'clean' }), calm = scoreJump({ air: 2.6, landing: 'clean', calm: true });
  check(plain.pts === 33 && calm.pts === 39 && calm.calm && calm.mult === LOHN.calm, `gerade Schanze 2,6 s sauber ${plain.pts} (Ziel 30–40), ruhige Hand ${calm.pts}`);
  check(scoreJump({ air: 2.6, landing: 'ok', calm: true }).calm === false, 'ruhige Hand nur zusammen mit sauberer Landung');
  const hop = scoreJump({ air: 2.0, landing: 'ok', hop: true });
  check(hop.pts === 6, `Hüpfer ohne Drehung weiter halbiert × 0,6 (${hop.pts})`);
  const fl = scoreJump({ air: 2.6, flip: 2 * Math.PI, landing: 'clean', calm: true });
  check(fl.pts === Math.round(56 * 1.5), `Salto mit ruhiger Hand (26 + 30) × 1,5 = 84 (${fl.pts})`);
  check(['loop', 'cork', 'wendel', 'tube', 'tubewall', 'zigzag', 'wall', 'halfpipe'].every((k) => LOHN.bau[k].base === HL[k].base && (LOHN.bau[k].v0 ?? 0) === (HL[k].v0 ?? 0) && (LOHN.bau[k].perS ?? 0) === (HL[k].perS ?? 0)), 'Bauwerk-Grundwerte wie der Highlight-Film (HL)');
  const loop = scoreBau({ kind: 'loop', v: 40, dur: 2, over: true });
  check(loop && loop.pts === 42 && scoreBau({ kind: 'loop', v: 40, dur: 2, over: false }) === null && scoreBau({ kind: 'tube', v: 40, dur: 0.3 }) === null, `Looping bei 40 m/s = 42 (nur kopfüber), unter 0,5 s zählt nichts`);
  check(scoreBau({ kind: 'tube', v: 80, dur: 2 }).pts === Math.round(28 * 1.2) && scoreBau({ kind: 'cork', v: 40, dur: 2, chain: 1 }).pts === Math.round(48 * 1.2), 'Röhre schnell × 1,2, Korkenzieher als 2. Kettenglied × 1,2');
  check(scoreBau({ kind: 'wall', dur: 2, steep: 0.1 }) === null && scoreBau({ kind: 'wall', dur: 2, steep: 1 }).pts === 38, 'Steilwand erst ab 0,25 s steil: 24 + 14 · s');
  check(Math.abs(chainWindow(0, 0) - LOHN.kette) < 1e-9 && LOHN.kette <= STUNT.winMax, `Kettenfenster ${LOHN.kette} s (Deckel ${STUNT.winMax} s)`);
  const t = stuntText(scoreBau({ kind: 'loop', v: 40, dur: 2, over: true, chain: 2 })), tc = stuntText(calm);
  check(t.head === 'Looping' && /Kette/.test(t.sub) && !/✈/.test(t.sub) && /ruhige Hand ×1,5/.test(tc.sub), `Anzeige: ${t.head} | ${t.sub} · ${tc.sub}`);
  setLohn({ kette: 0 }); check(chainFactor(3) === 1 && chainWindow(0, 50) === 0, '?kette=0: keine Kette'); setLohn(STD);
}

console.log('--- C: Tracker auf der Ebene (ruhige Hand) ---');
{
  const W = { terrain: { height: () => -50 }, ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const tt = -oy / dy; if (tt < 0 || tt > len) return null; return { t: tt, x: ox + dx * tt, y: 0, z: oz + dz * tt, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };
  const run = (inpAt) => {
    const car = new Car(CAR_DEF); Race.carAssist(car, ASSISTS.medium, false, 'medium');
    car.place([0, 6, 0], [0, 0, -1], [0, 1, 0], 25); car.v.y = 3;
    car.wheels.forEach((w) => { w.comp = w.prevComp = 0; w.contact = false; });
    const T = new StuntTracker(); let res = null;
    for (let tt = 0; tt < 6 && !res; tt += DT) { car.input.throttle = 0.3; car.step(DT, W); res = T.step(DT, car, { piece: 1, lap: 0, inp: inpAt(tt) }); }
    return res;
  };
  const a = run(() => ({ steer: 0, throttle: 1, brake: 0 }));
  const b = run((tt) => ({ steer: tt > 0.7 && tt < 0.8 ? 1 : 0, throttle: 1, brake: 0 }));
  check(a && a.landing === 'clean' && a.calm && b && b.landing === 'clean' && !b.calm, `ohne Eingabe-Änderung ruhige Hand (${a && a.air.toFixed(2)} s, ×${a && a.mult}), Lenk-Tipp 0,3 s vor dem Aufsetzen nur sauber (×${b && b.mult})`);
}

// Strecken: 4711-2 (Schanze gleich nach dem Start), eine Irre-Strecke mit Looping (Generator-Version 2)
const v1 = verifySync(generate(4711, 2));
let vL = null, seedL = 0;
for (let k = 0; k < 30 && !vL; k++) { const sd = 1000 + k * 7919 % 90000; const g = generate(sd, 3, { gv: 2 }); if (g.pieces.some((p) => p.type === 'loop')) { const v = verifySync(g); if (v.ok) { vL = v; seedL = sd; } } }

console.log('--- D: Rennlogik ---');
{
  const r = new Race(v1.env, { assist: 'medium', countdown: 0.05 });
  for (let k = 0; k < 30; k++) r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  r.requestNitro(); r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  check(r.nitroT >= 0 && Math.abs(r.cd.nitro - COOLDOWN.nitro) < 1e-9, 'Nitro gezündet, ohne Vorrat volle Abklingzeit');
  const ev = (o) => ({ pts: 30, landing: 'clean', hop: false, ...o });
  const s1 = ev({}); r.lohnStunt(s1);
  check(Math.abs(r.cd.nitro - (COOLDOWN.nitro - cooldownGain(30, COOLDOWN.nitro))) < 1e-9 && s1.nitroSec > 0 && !s1.nitroNow, `Stunt beim Brennen (30 Pkt) → Restzeit ${r.cd.nitro.toFixed(2)} s`);
  const s2 = ev({ pts: 500 }); r.lohnStunt(s2);
  check(r.cd.nitro === 0 && Math.abs(r.nbank - COOLDOWN.nitro) < 1e-9 && s2.nitroFull && !s2.nitroNow && Math.abs(r.xstate().bank - 1) < 1e-9, 'großer Stunt: Restzeit 0, Vorrat voll (goldener Ring)');
  const c0 = r.cd.nitro, b0 = r.nbank; r.lohnStunt(ev({ landing: 'crash' })); r.lohnStunt(ev({ hop: true }));
  check(r.cd.nitro === c0 && r.nbank === b0, 'Crash-Landung und Hüpfer zahlen nichts ein');
  let t = 0; while (r.nitroT >= 0 && t < 10) { r.step(DT, { steer: 0, throttle: 1, brake: 0 }); t += DT; }
  r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  check(r.charges.nitro === 1 && Math.abs(t - NITRO_TOTAL) < 0.05, `nach dem Ausbrennen (${t.toFixed(2)} s) sofort wieder bereit`);
  r.requestNitro(); r.step(DT, { steer: 0, throttle: 1, brake: 0 });
  check(r.cd.nitro === 0 && r.nbank === 0, 'Zünden mit vollem Vorrat: keine Abklingzeit danach, Vorrat leer');
  // lädt gerade (nicht brennend): Stunt macht sofort bereit
  const r2 = new Race(v1.env, { assist: 'medium', countdown: 0.05 });
  for (let k = 0; k < 30; k++) r2.step(DT, { steer: 0, throttle: 1, brake: 0 });
  r2.charges.nitro = 0; r2.cd.nitro = 1;
  const s3 = ev({ pts: 60 }); r2.lohnStunt(s3); r2.step(DT, { steer: 0, throttle: 1, brake: 0 });
  check(s3.nitroNow && r2.charges.nitro === 1 && r2.nbank > 0 && r2.events.some((e) => e.type === 'xready'), 'lädt nach (1 s Rest) + Stunt → sofort bereit, Rest in den Vorrat');
  // Kettenfenster: Nitro zünden verlängert um nitroWin s
  r2.stunts.winLeft = 2; r2.requestNitro(); r2.step(DT, { steer: 0, throttle: 1, brake: 0 });
  check(Math.abs(r2.stunts.winLeft - (2 + LOHN.nitroWin - DT)) < 0.02, `Nitro zünden verlängert eine laufende Kette um ${LOHN.nitroWin} s`);
  // alte Regel (?cd=runde) und tank 0: nichts
  setLohn({ tank: 0 }); const r3 = new Race(v1.env, { assist: 'medium', countdown: 0.05 }); r3.charges.nitro = 0; r3.cd.nitro = 3; r3.lohnStunt(ev({ pts: 100 }));
  check(r3.cd.nitro === 3 && r3.nbank === 0, '?tank=0: nur Abklingzeit'); setLohn(STD);
}

console.log('--- E: Looping als Stunt (Leicht, echte Fahrt) ---');
{
  check(!!vL, `Irre-Strecke mit Looping gefunden (${seedL}-3)`);
  if (vL) {
    const K = bauKinds(vL.env);
    check(K.some((k) => k === 'loop'), 'Bauwerk-Art je Linienpunkt kennt den Looping');
    const r = new Race(vL.env, { assist: 'easy', countdown: 0.05 });
    const got = [];
    for (let t = 0; t < 200 && r.state !== 'finished'; t += DT) { r.step(DT, { steer: 0, throttle: 0, brake: 0 }); for (const e of r.events) if (e.type === 'stunt') got.push(e); r.events.length = 0; }
    const lp = got.find((e) => e.bau && e.kind === 'loop');
    check(r.state === 'finished' && lp && lp.pts >= 25, `Looping gewertet: ${lp ? lp.pts + ' Pkt' : '–'}; alle Stunts: ${got.map((e) => (e.bau ? e.kind : e.hop ? 'hop' : 'jump') + ':' + e.pts).join(' ')}`);
    check(r.lohn.sec > 0 && r.lohn.pts === got.filter((e) => e.landing !== 'crash' && !e.hop).reduce((a, e) => a + e.pts, 0), `Nitro ${r.lohn.sec.toFixed(1)} s früher bereit aus ${r.lohn.pts} Punkten`);
  }
}

console.log('--- F: Leicht automatisch auf mehreren Geraden ---');
{
  const r = new Race(v1.env, { assist: 'easy', countdown: 0.05, autoExtras: true });
  const P = r.planExtras(), L = v1.env.track.line;
  const sep = P.spots.every((a, i) => P.spots.every((b, j) => i === j || Math.abs(L.s[a.i0] - L.s[b.i0]) >= 199));
  check(P.nitro && P.spots.length >= 1 && P.spots[0] === P.nitro && P.spots.length <= LOHN.autoSpots && sep && P.spots.every((S) => S.gain > 0.05), `${P.spots.length} Nitro-Stellen (die längste zuerst, ≥ 200 m auseinander)`);
  let n = 0; for (let t = 0; t < 120 && r.state !== 'finished'; t += DT) { r.step(DT, { steer: 0, throttle: 0, brake: 0 }); for (const e of r.events) if (e.type === 'nitro') n++; r.events.length = 0; }
  setLohn(LOHN_AUS); const r0 = new Race(v1.env, { assist: 'easy', countdown: 0.05, autoExtras: true });
  let n0 = 0; for (let t = 0; t < 120 && r0.state !== 'finished'; t += DT) { r0.step(DT, { steer: 0, throttle: 0, brake: 0 }); for (const e of r0.events) if (e.type === 'nitro') n0++; r0.events.length = 0; }
  setLohn(STD);
  check(r.state === 'finished' && r0.state === 'finished' && r.crashes === 0 && n >= n0 && r.finalTime <= r0.finalTime + 0.05, `Leicht zündet ${n}× statt ${n0}×, ${r.finalTime.toFixed(2)} statt ${r0.finalTime.toFixed(2)} s, ohne Crash`);
}

console.log('--- G: alle Regler aus = Stand n37 bitgleich ---');
{
  const { execFileSync } = await import('child_process');
  const fs = await import('fs');
  const ref = JSON.parse(fs.readFileSync('tests/node/data/n38_ref.json', 'utf8'));
  const now = JSON.parse(execFileSync(process.execPath, ['tests/node/n38_ref.mjs'], { encoding: 'utf8' }));
  const bad = Object.keys(ref).filter((k) => ref[k] !== now[k]);
  check(!bad.length, `Leicht/Mittel/Original je 60 s auf 3 Strecken (Nitro, Hüpfer, Saltos) wie n37 (dfabb8d)${bad.length ? ': anders ' + bad.join(', ') : ''}`);
}

console.log('--- H: Messgrößen (tools/lohn_mess.mjs, 9 Strecken) ---');
{
  const { execFileSync } = await import('child_process');
  const fs = await import('fs');
  const f = '/tmp/stuntbahn_lohn_mess.json';
  execFileSync(process.execPath, ['tools/lohn_mess.mjs', '1', '--fahrer=profi,leicht', `--json=${f}`], { encoding: 'utf8', maxBuffer: 1e8 });
  const js = JSON.parse(fs.readFileSync(f, 'utf8')).out;
  const lad = (d) => js.an[`profi-${d}`].sec / js.an[`profi-${d}`].n / COOLDOWN.nitro;
  check(lad(1) > 0.2 && lad(3) > lad(1) && lad(3) < 4, `Profi-Mittel: ${[1, 2, 3].map((d) => lad(d).toFixed(2)).join(' / ')} Abklingzeiten je Runde (Sanft/Sportlich/Irre)`);
  const crA = [1, 2, 3].reduce((a, d) => a + js.an[`leicht-${d}`].crashes + js.an[`profi-${d}`].crashes, 0), crB = [1, 2, 3].reduce((a, d) => a + js.aus[`leicht-${d}`].crashes + js.aus[`profi-${d}`].crashes, 0);
  check(crA <= crB + 1, `Crashs mit Stunt-Lohn ${crA}, ohne ${crB}`);
  let sa = 0, sb = 0; for (const d of [1, 2, 3]) { const A = js.an[`leicht-${d}`].time, B = js.aus[`leicht-${d}`].time; for (const k of Object.keys(A)) if (B[k]) { sa += A[k]; sb += B[k]; } }
  check(sa < sb, `Leicht (Extras automatisch) ${((1 - sa / sb) * 100).toFixed(1)} % schneller`);
}

console.log('--- I: Bestzeiten einmalig neu, A/B ---');
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
  const { Store, abMode } = await import('../../src/game/store.js');
  mem.set('stuntbahn.v1', JSON.stringify({ settings: { assist: 'medium' }, reset: 21, medReset: 24, stuntReset: 26, tubeReset: 29, hindSeen: 33, arcadeReset: 37, best: { 'T1|medium+reset@x': { time: 50 }, 'T1|original+reset@x': { time: 55 } }, ghostIndex: ['T1|medium+reset@x'], times: { T1: [{ t: 40 }] } }));
  mem.set('stuntbahn.ghost.T1|medium+reset@x', 'A');
  let S = new Store();
  check(!S.best['T1|medium+reset@x'] && !S.best['T1|original+reset@x'] && !mem.has('stuntbahn.ghost.T1|medium+reset@x') && S.timesFor('T1').length === 1 && S.lohnNote > 0 && !S.arcadeNote, `Mittel/Original-Bestzeiten einmalig gelöscht, Leicht bleibt, Hinweis (${S.lohnNote})`);
  S.submit('T1', 'medium', false, 61, new Float32Array(16 * 40), {});
  S = new Store();
  check(S.best['T1|medium+reset@x'] && !S.lohnNote, 'zweites Laden löscht nichts mehr');
  check(abMode('?tank=0') && abMode('?tank=60') && abMode('?kette=6') && abMode('?stuntpkt=0') && abMode('?landung=0') && !abMode('?seed=1'), 'A/B werten nicht: ?tank, ?kette, ?stuntpkt, ?landung');
}

console.log(fails ? `FEHLER: ${fails}` : 'Stunt-Lohn n38: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
