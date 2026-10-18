// n37 Arcade-Fahrgefühl: Parametergruppe, Stunt-Wertung (reine Funktionen + Tracker), Luftsteuerung (Original halten,
// Mittel antippen), Landehilfe, Wand schrammt, Crash-Schwellen, Wiedereinstieg, A/B ?physik=alt bitgleich zu n36,
// Prüffahrt unverändert, Bestzeiten-Reset, Messwerkzeug-Kennzahlen gegen die Ziele aus ARCADE_FEEL.md.
const { ARCADE, setArcade, arcadeAssist } = await import('../../src/physics/arcade.js');
const { STUNT, scoreJump, chainFactor, chainWindow, halves, StuntTracker, stuntText } = await import('../../src/game/stunts.js');
const { Race, ASSISTS } = await import('../../src/game/race.js');
const { Car, CAR_DEF } = await import('../../src/physics/car.js');
const { MAT } = await import('../../src/track/defs.js');
// n38: die n37-Formel (A, B) mit ausgeschaltetem Stunt-Lohn prüfen (lohn.js LOHN_AUS); die n38-Formel prüft test_lohn.mjs
const { LOHN, LOHN_AUS, setLohn } = await import('../../src/game/lohn.js');
const LOHN_STD = { ...LOHN };
setLohn(LOHN_AUS);
let fails = 0;
const check = (c, msg) => { console.log(`${c ? 'OK  ' : 'FAIL'} ${msg}`); if (!c) fails++; };
const DT = 1 / 120;

console.log('--- A: Stunt-Formel ---');
{
  check(halves(Math.PI / 2 + 0.01) === 1 && halves(Math.PI / 2 - 0.01) === 0 && halves(2 * Math.PI) === 2, 'halbe Drehungen gerundet (ab 90° die erste)');
  const plain = scoreJump({ air: 2.6, landing: 'ok' });
  check(plain && plain.pts === 13, `Sprung 2,6 s ohne Drehung = 26 / 2 = 13 (${plain && plain.pts})`);
  check(scoreJump({ air: 0.4, landing: 'ok' }) === null, 'unter 0,5 s Luft zählt nicht');
  const flip = scoreJump({ air: 2.6, flip: 2 * Math.PI, landing: 'clean' });
  check(flip.pts === Math.round((26 + 30) * 1.25), `Salto (2 halbe) sauber: (26 + 30) × 1,25 = 70 (${flip.pts})`);
  const roll = scoreJump({ air: 2.0, roll: -2 * Math.PI, spin: Math.PI, landing: 'ok' });
  check(roll.pts === 20 + 40 + 10 && roll.rolls === 2 && roll.spins === 1, `Schraube + halber Dreher: 20 + 40 + 10 = 70 (${roll.pts})`);
  const cr = scoreJump({ air: 2.6, flip: 2 * Math.PI, landing: 'crash', chain: 3 });
  check(cr.pts === 28 && cr.chainMult === 1, `Crash-Landung: halbe Grundpunkte, keine Faktoren (${cr.pts})`);
  check(Math.abs(chainFactor(0) - 1) < 1e-9 && Math.abs(chainFactor(1) - 1.2) < 1e-9 && Math.abs(chainFactor(4) - 1.5) < 1e-9 && Math.abs(chainFactor(6) - 1.54) < 1e-9 && chainFactor(99) === STUNT.chainMax, 'Ketten-Faktor 1 / 1,2 / … / 1,5 / +0,02 je Glied, Deckel 2,0');
  check(Math.abs(chainWindow(0, 50) - 7) < 1e-9 && Math.abs(chainWindow(10, 0) - 3) < 1e-9, 'Ketten-Fenster 6 s + 20 ms/Pkt, je Glied −0,5 s, mindestens 3 s');
  const hop = scoreJump({ air: 2.0, landing: 'ok', hop: true }), rep = scoreJump({ air: 2.0, landing: 'ok', repeat: true });
  check(hop.pts === 6 && rep.pts === 5, `Hüpfer × 0,6 (${hop.pts}), Wiederholung × 0,5 (${rep.pts})`);
  const t = stuntText(scoreJump({ air: 2.6, flip: 3 * Math.PI, roll: 2 * Math.PI, landing: 'clean', chain: 1 }));
  check(/Salto \+ ½ Salto/.test(t.head) && /Schraube/.test(t.head) && /sauber/.test(t.sub) && /Kette ×1,2/.test(t.sub) && /^\+\d+$/.test(t.pts), `Anzeige: ${t.head} | ${t.sub} | ${t.pts}`);
}

console.log('--- B: Tracker auf der Ebene ---');
{
  const W = { terrain: { height: () => -50 }, ray(ox, oy, oz, dx, dy, dz, len) { if (dy >= -1e-9) return null; const t = -oy / dy; if (t < 0 || t > len) return null; return { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0, mat: MAT.ROAD }; } };
  const run = (key, act) => {
    const car = new Car(CAR_DEF); Race.carAssist(car, ASSISTS[key], false, key);
    car.place([0, 10, 0], [0, 0, -1], [0, 1, 0], 30); car.v.y = 8;   // Flug ~2,9 s, Aufprall ~14 m/s
    car.wheels.forEach((w) => { w.comp = w.prevComp = 0; w.contact = false; });
    const T = new StuntTracker(); let res = null;
    for (let t = 0; t < 6 && !res; t += DT) { act(car, t, W); car.input.throttle = 0.3; car.step(DT, W); res = T.step(DT, car, { piece: 1, lap: 0 }); if (car.crash && !res) res = T.crash(car); }
    return { res, car };
  };
  const a = run('medium', (car, t, W) => { if (Math.abs(t - 0.4) < DT / 2) car.startTrick('p', -1, W); });
  check(a.res && a.res.flips === 2 && a.res.landing !== 'crash' && !a.car.crash, `Mittel: Salto angetippt → 2 halbe Saltos, gelandet (${a.res && JSON.stringify({ f: a.res.flips, l: a.res.landing, p: a.res.pts })})`);
  const b = run('original', (car, t) => { car.input.air.roll = t > 0.3 && t < 1.25 ? 1 : t >= 1.25 && t < 1.5 ? -1 : 0; });
  check(b.res && b.res.rolls >= 1, `Original: Rollen halten → Schraube gezählt (${b.res && b.res.rolls} halbe, ${b.res && b.res.landing})`);
  // halber Salto: Lage-Regler auf 180° (wie ein Spieler, der kopfüber stehen bleibt) → Dach voran
  let ang = 0;
  const c = run('original', (car, t) => { const F = car.frame, w = car.w.x * F.r.x + car.w.y * F.r.y + car.w.z * F.r.z; ang += w * DT; car.input.air.pitch = t > 0.3 ? Math.max(-1, Math.min(1, 1.6 * (Math.PI - ang) - 0.45 * w)) : 0; });
  check(c.car.crash || (c.res && c.res.landing === 'crash'), `Original: halber Salto ohne Gegenhalten → Crash (${c.car.crash && c.car.crash.reason})`);
}

setLohn(LOHN_STD);
console.log('--- C: Physik-Regler ---');
{
  check(ARCADE.on === true, 'Arcade-Physik ist Standard (Node ohne URL)');
  check(arcadeAssist('medium').airTap > 0 && !arcadeAssist('medium').airCtl && arcadeAssist('original').airCtl > 0 && !arcadeAssist('original').landHelp && arcadeAssist('easy').wall > 0 && !arcadeAssist('easy').airCtl, 'Mittel antippen + Landehilfe, Original halten ohne Hilfe, Leicht nur Wand/Crash');
  const car = new Car(CAR_DEF); Race.carAssist(car, ASSISTS.original, true, 'original');
  check(car.assist.arcade === 0 && car.assist.wall === 0 && car.assist.airCtl === 0, 'reine Autopilot-Fahrt (Prüffahrt): keine Arcade-Physik');
  setArcade({ on: false });
  check(arcadeAssist('medium') === null, '?physik=alt: keine Arcade-Einstellungen');
  setArcade({ on: true });
}

console.log('--- D: Messwerkzeug (Ziele ARCADE_FEEL.md) ---');
{
  const { execFileSync } = await import('child_process');
  const out = execFileSync(process.execPath, ['tools/arcade_mess.mjs', '--var=alt,neu', '--nur=accel,stunt,luft,respawn,wand', '--json=/dev/stdout'], { encoding: 'utf8', maxBuffer: 1e8 });
  const js = JSON.parse(out.slice(out.indexOf('{\n')));
  const nm = js['neu/medium'], no = js['neu/original'], am = js['alt/medium'], ao = js['alt/original'];
  check(nm.t100 <= 2.6 && nm.t100 < am.t100 && Math.abs(nm.vmax - am.vmax) < 15, `Mittel 0–100 ${nm.t100.toFixed(2)} s (alt ${am.t100.toFixed(2)}), Vmax ${nm.vmax.toFixed(0)} km/h (alt ${am.vmax.toFixed(0)})`);
  check(Math.abs(no.vmax - ao.vmax) < 1 && Math.abs(no.t100 - ao.t100) < 0.01, 'Original: Motor unverändert');
  const st = Object.entries({ ...nm.stunt, ...Object.fromEntries(Object.entries(no.stunt).map(([k, v]) => ['O ' + k, v])) });
  const must = st.filter(([k]) => !/Klippe 1 Ebene (vor|rueck)|schraube 2/.test(k));
  check(must.every(([, v]) => v.ok), `Saltos/Schrauben landen (Schanze, Klippen): ${must.filter(([, v]) => !v.ok).map(([k, v]) => k + ' ' + v.crash).join(', ') || 'alle'}`);
  check(nm.luft.pitch.t360 < 1.6 && no.luft.pitch.t360 < 1.6 && no.luft.roll.t360 < 1.4, `Salto 360° in ${nm.luft.pitch.t360.toFixed(2)} s (Mittel) / ${no.luft.pitch.t360.toFixed(2)} s (Original)`);
  check(nm.respawn.reset <= 1.5 && nm.respawn.wrack <= 1.5 && no.respawn.reset <= 1.5 && no.respawn.wrack <= 1.5, `Wiedereinstieg ≤ 1,5 s (Original Totalschaden ${no.respawn.wrack.toFixed(2)} s, alt ${ao.respawn.wrack.toFixed(2)})`);
  check(['15', '30'].every((a) => !nm.wand[a].crash && !no.wand[a].crash && nm.wand[a].loss < 25) && nm.wand['60'].crash && am.wand['15'].crash, `Wand 150 km/h: 15° −${nm.wand['15'].loss.toFixed(0)} %, 30° −${nm.wand['30'].loss.toFixed(0)} %, 60° Crash (alt: 15° Crash)`);
}
console.log('--- E: ?physik=alt bitgleich zum Stand n36 (c881366) ---');
{
  const { execFileSync } = await import('child_process');
  const fs = await import('fs');
  const ref = JSON.parse(fs.readFileSync('tests/node/data/arcade_alt_ref.json', 'utf8'));
  const now = JSON.parse(execFileSync(process.execPath, ['tests/node/arcade_alt_ref.mjs'], { encoding: 'utf8' }));
  const bad = Object.keys(ref).filter((k) => ref[k] !== now[k]);
  check(!bad.length, `Leicht/Mittel/Original je 40 s auf 2 Strecken mit ?physik=alt gleich wie n36${bad.length ? ': anders ' + bad.join(', ') : ''}`);
}

console.log('--- F: Bestzeiten einmalig neu, A/B ---');
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
  const { Store, abMode } = await import('../../src/game/store.js');
  mem.set('stuntbahn.v1', JSON.stringify({ settings: { assist: 'medium' }, reset: 21, medReset: 24, stuntReset: 26, tubeReset: 29, hindSeen: 33, best: { 'T1|medium+reset@x': { time: 50 }, 'T1|original+reset@x': { time: 55 }, 'T1|easy+reset@x': { time: 40 } }, ghostIndex: ['T1|medium+reset@x', 'T1|original+reset@x'], times: { T1: [{ t: 40 }] } }));
  mem.set('stuntbahn.ghost.T1|medium+reset@x', 'A'); mem.set('stuntbahn.ghost.T1|original+reset@x', 'B');
  let S = new Store();
  check(!S.best['T1|medium+reset@x'] && !S.best['T1|original+reset@x'] && !mem.has('stuntbahn.ghost.T1|medium+reset@x') && !mem.has('stuntbahn.ghost.T1|original+reset@x') && S.timesFor('T1').length === 1 && S.arcadeNote > 0, `Mittel/Original-Bestzeiten + Geister einmalig gelöscht, Leicht-Zeiten bleiben, Hinweis (${S.arcadeNote})`);
  S.submit('T1', 'medium', false, 61, new Float32Array(16 * 40), {});
  S = new Store();
  check(S.best['T1|medium+reset@x'] && !S.arcadeNote, 'zweites Laden löscht nichts mehr, kein Hinweis');
  mem.clear(); S = new Store();
  check(!S.arcadeNote, 'neu installiert: kein Hinweis');
  check(abMode('?physik=alt') && abMode('?luft=0.5') && abMode('?wand=0') && abMode('?grip=1.2') && abMode('?grip=1') && !abMode('?seed=4711'), 'A/B werten nicht: ?physik=alt, ?luft, ?wand, ?grip');
}

console.log(fails ? `FEHLER: ${fails}` : 'Arcade n37: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
