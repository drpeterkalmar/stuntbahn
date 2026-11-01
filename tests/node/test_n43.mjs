// n43 (Peter 01.11.2026: „alle drei gegnerstufen fahren besser. alle autos driften mehr.“)
// Etappe 1 – Gegner fahren besser: Stärken-Reihenfolge und Abstand zur Autopilot-Zeit (neue Werte), ?gegnerstaerke=alt
// = Werte bis 0.16.0 bitgleich (Zeiten + Aufzeichnung, Referenz aus af5609e), Kurven-Profil der Stärke (schneller in Kurven,
// in Stunts genau das Prüffahrt-Tempo). Volle Messung: tools/gegner_mess.mjs (60 Strecken), Bericht N43_BERICHT.md.
// Aufruf: node tests/node/test_n43.mjs
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { GegnerFeld, gegnerOptionen, staerkeWerte, STAERKEN, STAERKEN_ALT, gegnerBasis } from '../../src/ai/gegner.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const DT = 1 / 120;

// Referenz 0.16.0 (af5609e): 3 Gegner, Seed 3, Start Mitte, Strecke 11-2 – Zielzeiten und Prüfsumme der Aufzeichnung
const REF_016 = { '11-2/locker/medium': [[110.5583, 131.7833, 114.225], -922201365], '11-2/locker/original': [[110.9417, 132.2167, 114.625], -716902606], '11-2/ebenbuertig/medium': [[92.525, 98.9333, 95.8583], -556455026], '11-2/ebenbuertig/original': [[91.725, 97.7667, 94.775], -303037581], '11-2/profi/medium': [[80.3083, 85.65, 83.2083], -866671398], '11-2/profi/original': [[78.0417, 83.35, 80.8083], -438958646] };
const pruefsumme = (F) => { let h = 0; for (const g of F.fahrer) { const a = g.aufnahme().data; for (let i = 0; i < a.length; i++) h = (h * 31 + Math.round(a[i] * 1000)) % 1000000007; } return h; };
const rennen = (v, opt) => {
  const F = new GegnerFeld(v.env, { anzahl: 3, seed: 3, startplatz: 'mitte', ...opt });
  let t = 0; while (t < v.apTime * 3 && !F.fahrer.every((g) => g.fertig)) { F.step(DT); t += DT; }
  return F;
};

// 1. Optionen und Werte-Sätze
{
  ok(gegnerOptionen('', {}).satz === 'neu' && gegnerOptionen('?gegnerstaerke=alt', {}).satz === 'alt', 'Standard neue Stärke-Werte, ?gegnerstaerke=alt = Werte bis 0.16.0');
  ok(staerkeWerte('profi', 'alt') === STAERKEN_ALT.profi && staerkeWerte('profi') === STAERKEN.profi && staerkeWerte('xx').name === 'Ebenbürtig', 'staerkeWerte: Satz alt/neu, Unbekanntes → Ebenbürtig');
  const S = STAERKEN;
  const kv = (x) => x.tempo * Math.sqrt(x.kurve);   // Kurventempo ~ Tempo-Faktor × √Querhaftung
  ok(S.locker.tempo < S.ebenbuertig.tempo && S.ebenbuertig.tempo <= S.profi.tempo && kv(S.locker) < kv(S.ebenbuertig) && kv(S.ebenbuertig) < kv(S.profi), 'Tempo und Kurventempo steigen Locker → Ebenbürtig → Profi');
  ok(S.locker.pSpaet > S.ebenbuertig.pSpaet && S.ebenbuertig.pSpaet > S.profi.pSpaet && S.locker.pPatzer > S.ebenbuertig.pPatzer && S.ebenbuertig.pPatzer > S.profi.pPatzer && S.locker.reaktion > S.profi.reaktion, 'Fehler und Reaktion: Locker > Ebenbürtig > Profi');
  for (const k of Object.keys(S)) ok(S[k].pSpaet < STAERKEN_ALT[k].pSpaet && S[k].pPatzer < STAERKEN_ALT[k].pPatzer && S[k].streu < STAERKEN_ALT[k].streu && S[k].reaktion < STAERKEN_ALT[k].reaktion, `${S[k].name}: weniger Patzer, Verbremser, Streuung und kürzere Reaktion als 0.16.0`);
}

// 2. ?gegnerstaerke=alt bitgleich zu 0.16.0
{
  const v = verifySync(generate(11, 2));
  let gleich = 0, n = 0;
  for (const [key, [zeiten, h]] of Object.entries(REF_016)) {
    const [, st, assist] = key.split('/');
    const F = rennen(v, { staerke: st, assist, satz: 'alt', drift: false });
    const z = F.fahrer.map((g) => +g.zeit.toFixed(4));
    n++; if (z.every((x, i) => x === zeiten[i]) && pruefsumme(F) === h) gleich++; else console.log('  abweichend', key, z, pruefsumme(F));
  }
  ok(gleich === n, `?gegnerstaerke=alt (+ ?gegnerdrift=0): ${gleich}/${n} Rennen bitgleich zu 0.16.0 (Zielzeiten + Aufzeichnung)`);
}

// 3. Neue Werte: Reihenfolge und Abstand zur Autopilot-Zeit (1 Gegner, Stufe Mittel und Original, 2 Strecken)
for (const [s, d] of [[11, 2], [4711, 3]]) {
  const v = verifySync(generate(s, d));
  for (const assist of ['medium', 'original']) {
    const z = {};
    for (const st of ['locker', 'ebenbuertig', 'profi']) { const F = rennen(v, { staerke: st, assist, anzahl: 1, startplatz: 'hinten' }); z[st] = F.fahrer[0].fertig ? F.fahrer[0].zeit / v.apTime - 1 : NaN; }
    const pc = (x) => (x * 100).toFixed(1) + ' %';
    ok(z.locker > z.ebenbuertig && z.ebenbuertig > z.profi, `S${s}/${d} ${assist}: Reihenfolge Locker ${pc(z.locker)} > Ebenbürtig ${pc(z.ebenbuertig)} > Profi ${pc(z.profi)} (zur Autopilot-Zeit)`);
    ok(z.profi > -0.05 && z.profi < 0.025 && z.ebenbuertig > 0.02 && z.ebenbuertig < 0.14 && z.locker > 0.1 && z.locker < 0.32, `S${s}/${d} ${assist}: Profi −5 … +2,5 %, Ebenbürtig +2 … +14 %, Locker +10 … +32 %`);
  }
}

// 4. Kurven-Profil: in Stunts (Maske muss) genau das Prüffahrt-Tempo, sonst nie langsamer als die Prüffahrt (Profi)
{
  const v = verifySync(generate(4711, 3));
  const F = new GegnerFeld(v.env, { anzahl: 1, staerke: 'profi', seed: 3 });
  const g = F.fahrer[0], P = v.env.prof, M = F.M;
  let stuntAb = 0, langsamer = 0, schneller = 0;
  for (let i = 0; i < P.vt.length; i++) {
    if (M.muss[i] && Math.abs(g.P.vt[i] - P.vt[i]) > 1e-3) stuntAb++;
    if (!M.nahe[i] && g.P.vt[i] < P.vt[i] * g.P.faktor - 0.5) langsamer++;
    if (!M.nahe[i] && g.P.vt[i] > P.vt[i] + 1) schneller++;
  }
  ok(stuntAb === 0, `Profi-Profil in Looping/Röhre/Schanze = Prüffahrt-Tempo (${stuntAb} Abweichungen)`);
  ok(langsamer === 0 && schneller > 50, `Profi-Profil außerhalb der Stunts nie langsamer, in Kurven schneller als die Prüffahrt (${schneller} Punkte schneller)`);
  ok(gegnerBasis(v.env, STAERKEN_ALT.profi) === v.env.prof && gegnerBasis(v.env, STAERKEN.profi, 1.3) === gegnerBasis(v.env, STAERKEN.profi, 1.3), 'Kurven-Profil je Strecke zwischengespeichert; Werte bis 0.16.0 nutzen das Prüffahrt-Profil');
}

// 5. Etappe 2 – Gegner driften: je Stärke Anteil Kurvenzeit quer, nie in Stunt-Zonen, deterministisch je Seed, ?gegnerdrift=0
{
  const { measureGegner } = await import('../../tools/drift_mess.mjs');
  const { GEGNER_DRIFT } = await import('../../src/ai/gegner.js');
  const sum = {}, stunt = {}, crashes = {};
  for (const [s, d] of [[4711, 2], [20260927, 3], [88, 2]]) {
    const v = verifySync(generate(s, d));
    for (const st of ['locker', 'ebenbuertig', 'profi']) {
      const M = measureGegner(v.env, st, { mods: { GegnerFeld }, apTime: v.apTime });
      const S = sum[st] ||= [0, 0]; S[0] += M.curve; S[1] += M.curve10;
      stunt[st] = (stunt[st] || 0) + M.stuntDrift; crashes[st] = (crashes[st] || 0) + M.crashes;
      if (!M.ok) ok(false, `S${s}/${d} ${st}: nicht im Ziel`);
    }
  }
  const q = (st) => sum[st][1] / Math.max(1e-6, sum[st][0]);
  ok(q('locker') > 0.3 && q('ebenbuertig') > 0.3 && q('profi') > 0.2, `Gegner driften: Kurvenzeit > 10° Locker ${(q('locker') * 100).toFixed(0)} %, Ebenbürtig ${(q('ebenbuertig') * 100).toFixed(0)} %, Profi ${(q('profi') * 100).toFixed(0)} % (Ziel ≥ 30/30/20 %)`);
  ok(Object.values(stunt).every((x) => x === 0), `Gegner driften nie in Looping/Röhre/Korkenzieher/Schanze/Steilkurve (${JSON.stringify(stunt)} s)`);
  ok(Object.values(crashes).reduce((a, b) => a + b, 0) <= 1, `Crashs beim Driften ${JSON.stringify(crashes)} (≤ 1 auf 9 Rennen)`);
  const v = verifySync(generate(4711, 2));
  const a = rennen(v, { staerke: 'locker', assist: 'medium' }), b = rennen(v, { staerke: 'locker', assist: 'medium' });
  ok(pruefsumme(a) === pruefsumme(b) && a.fahrer.every((g, i) => g.zeit === b.fahrer[i].zeit) && a.fahrer.some((g) => g.drift && g.drift.log.length > 3), `Gegner-Drift deterministisch je Seed (3 Gegner, ${a.fahrer.map((g) => g.drift.log.length).join('/')} Drifts, zweimal gleich)`);
  const c = rennen(v, { staerke: 'locker', assist: 'medium', drift: false });
  ok(!c.driftSegs && c.fahrer.every((g) => !g.drift && g.car.assist.drift == null) && typeof GEGNER_DRIFT.an === 'boolean', 'ohne Drift (opt.drift false, URL ?gegnerdrift=0): keine Drift-Stellen, kein Drift-Regler');
}

// 6. Etappe 2 – Spieler-Auto: lockeres Heck (car.js HECK) und Drift-Hilfe Mittel
{
  const { fahrt } = await import('../../tools/n43_spieler_drift.mjs');
  const { HECK } = await import('../../src/physics/car.js');
  const { Race } = await import('../../src/game/race.js');
  const { driftTracks } = await import('../../tools/drift_mess.mjs');
  const T = (await driftTracks()).filter(([n]) => ['4711-2', '88-2-g', 'sam-032'].includes(n));
  const mit = (k, f) => { const k0 = HECK.k; HECK.k = k; try { return f(); } finally { HECK.k = k0; } };
  let zeitOk = 0, n = 0, d0 = 0, d1 = 0, c0 = 0, c1 = 0, cr0 = 0, cr1 = 0;
  for (const [name, mk] of T) {
    const v = verifySync(mk());
    for (const st of ['easy', 'medium', 'original']) {
      const a = mit(0, () => fahrt(v.env, st, 'glatt')), b = mit(1, () => fahrt(v.env, st, 'glatt'));
      n++; if (a.ok && b.ok && Math.abs(b.time / a.time - 1) <= 0.02) zeitOk++; else console.log('  Zeit', name, st, a.time, b.time);
    }
    const a = mit(0, () => fahrt(v.env, 'original', 'vollgas')), b = mit(1, () => fahrt(v.env, 'original', 'vollgas'));
    d0 += a.curve10; c0 += a.curve; d1 += b.curve10; c1 += b.curve; cr0 += a.crashes; cr1 += b.crashes;
  }
  ok(zeitOk === n, `Bestzeit-Maßstab: glatter Fahrer (Sauber-Autopilot bzw. Autopilot-Eingaben) auf Leicht/Mittel/Original ± 2 % (${zeitOk}/${n})`);
  ok(d1 / c1 > 3 * Math.max(0.01, d0 / c0) && cr1 <= cr0 + 2, `Original, Vollgas-Fahrer: Kurvenzeit > 10° ${(d0 / c0 * 100).toFixed(1)} → ${(d1 / c1 * 100).toFixed(1)} %, Crashs ${cr0} → ${cr1}`);
  // Prüffahrt (reine Autopilot-Fahrt) ohne Heck; Gegner ohne Spieler-Heck
  const v = verifySync(generate(4711, 2));
  const R1 = new Race(v.env, { assist: 'medium', autopilot: true }); Race.carAssist(R1.car, R1.assist, true, 'medium');
  ok(R1.car.assist.heck === null, 'Prüffahrt/Generator (reine Autopilot-Fahrt): kein lockeres Heck');
  const R2 = new Race(v.env, { assist: 'medium', countdown: 0.2 });
  let gesperrt = 0, frei = 0, falsch = 0;
  for (let t = 0; t < 40 && R2.state !== 'finished'; t += 1 / 120) {
    const o = R2.ap.out; R2.step(1 / 120, { steer: o.steer, throttle: o.throttle, brake: o.brake });
    if (R2.state !== 'running') continue;
    const i = R2.ap.tr.idx, L = v.env.track.line;
    if (R2.heckSperre()[i]) { gesperrt++; if (R2.car.assist.heck) falsch++; } else frei++;
    if ((L.loop[i] || L.tube[i] || L.air[i] || R2.isJumpZone(i)) && !R2.heckSperre()[i]) falsch++;
  }
  ok(falsch === 0 && gesperrt > 0 && frei > 0, `Heck gesperrt in/vor Looping/Röhre/Schanze (${(gesperrt / (gesperrt + frei) * 100).toFixed(0)} % der Fahrzeit gesperrt, Fehler ${falsch})`);
  // Drift-Hilfe Mittel: Ereignis → kontrolliert quer, danach eingefangen (Schwimmwinkel wieder < 5°)
  const R3 = new Race(v.env, { assist: 'medium', countdown: 0.2 });
  let bmax = 0, gefangen = false, start = null;
  for (let t = 0; t < 60 && R3.state !== 'finished'; t += 1 / 120) {
    const o = R3.ap.out, c = R3.car;
    if (start == null && R3.state === 'running' && !R3.heckSperre()[R3.ap.tr.idx] && c.fwdSpeed() > 15 && Math.abs(o.steer) > 0.25) { start = t; c._hilfeStart(c.assist.heck || {}, Math.sign(-o.steer), 1); }
    R3.step(1 / 120, { steer: o.steer, throttle: o.throttle, brake: o.brake });
    const F = c.frame, b = Math.abs(Math.atan2(c.v.x * F.r.x + c.v.y * F.r.y + c.v.z * F.r.z, c.fwdSpeed())) * 180 / Math.PI;
    if (start != null && t - start < 3) bmax = Math.max(bmax, b);
    if (start != null && t - start > 1 && t - start < 3.5 && !c._hd && b < 5) gefangen = true;
  }
  ok(start != null && bmax > 8 && gefangen && R3.crashes === 0, `Mittel Drift-Hilfe: quer bis ${bmax.toFixed(0)}°, danach eingefangen, kein Crash`);
}

console.log(bad ? `n43: ${bad} FEHLER` : 'n43: alles OK');
process.exit(bad ? 1 : 0);
