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
    const F = rennen(v, { staerke: st, assist, satz: 'alt' });
    const z = F.fahrer.map((g) => +g.zeit.toFixed(4));
    n++; if (z.every((x, i) => x === zeiten[i]) && pruefsumme(F) === h) gleich++; else console.log('  abweichend', key, z, pruefsumme(F));
  }
  ok(gleich === n, `?gegnerstaerke=alt: ${gleich}/${n} Rennen bitgleich zu 0.16.0 (Zielzeiten + Aufzeichnung)`);
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

console.log(bad ? `n43: ${bad} FEHLER` : 'n43: alles OK');
process.exit(bad ? 1 : 0);
