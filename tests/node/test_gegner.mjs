// KI-Gegner (n34): ai/gegner.js + game/rennfeld.js in Node. Optionen/URL, Fahrerliste, Startraster (auf der Fahrbahn, ohne
// Überlapp, Spieler-Platz), Rangliste/Zeitnahme/Abstände, Hochrechnung, Masken (Bodenhaftung = haftOffAt), Rennen auf
// Generator-Strecken mit allen Stärken (alle im Ziel, Locker > Ebenbürtig > Profi, Profi ≈ Autopilot ± 5 %),
// deterministisch, Schiene ↔ Physik (Zeit, Wechsel ohne Crash), Rückspulen, Aufzeichnung im Geister-Format, Spieler-Rennen
// (Race) mit Gegnern: Raster, Rangliste, Kollision, Leicht weicht aus. Volle 60 Strecken: tools/gegner_mess.mjs.
// Aufruf: node tests/node/test_gegner.mjs [Anzahl Strecken, Standard 2]
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { Race, haftOffAt } from '../../src/game/race.js';
import { GegnerFeld, gegnerOptionen, gegnerListe, streckenMasken, STAERKEN, FAHRER, REC, hash01 } from '../../src/ai/gegner.js';
import { startRaster, spielerSlot, rangliste, Zeitnahme, abstaende, restzeit, fortschritt, zielFortschritt } from '../../src/game/rennfeld.js';
import { ueberlapp, quader } from '../../src/physics/autoauto.js';
import { Car, driveAccel } from '../../src/physics/car.js';
import { hashes } from '../../tools/gegner_aus_hash.mjs';
import fs from 'fs';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const DT = 1 / 120;
const NTR = +(process.argv[2] || 2);

// 1. Optionen
{
  const a = gegnerOptionen('', {});
  ok(a.anzahl === 0 && a.staerke === 'ebenbuertig' && a.startplatz === 'auto' && a.schilder && !a.aufholhilfe, 'Standard: Gegner Aus, Ebenbürtig, Startplatz automatisch, Schilder an, Aufholhilfe aus');
  const b = gegnerOptionen('?gegner=3&staerke=profi', { gegner: 1, gegnerStaerke: 'locker' });
  ok(b.anzahl === 3 && b.staerke === 'profi' && b.url, 'URL ?gegner=3&staerke=profi hat Vorrang vor gespeicherten Einstellungen');
  const c = gegnerOptionen('', { gegner: 5, gegnerStaerke: 'locker', gegnerStart: 'vorne', gegnerSchilder: false, aufholhilfe: true });
  ok(c.anzahl === 5 && c.staerke === 'locker' && c.startplatz === 'vorne' && !c.schilder && c.aufholhilfe, 'gespeicherte Einstellungen');
  const d = gegnerOptionen('?gegner=9&staerke=Ebenb%C3%BCrtig&schiene=0', {});
  ok(d.anzahl === 5 && d.staerke === 'ebenbuertig' && d.schiene === 'nie', 'URL: Anzahl auf 5 gedeckelt, „Ebenbürtig“ mit Umlaut, ?schiene=0');
  ok(gegnerOptionen('?gegner=x', {}).anzahl === 0, 'URL: Unsinn → Aus');
}
// 2. Fahrerliste
{
  const L = gegnerListe(5, 'profi', 42), L2 = gegnerListe(5, 'profi', 42);
  ok(JSON.stringify(L) === JSON.stringify(L2), 'Fahrerliste deterministisch je Seed');
  ok(new Set(L.map((g) => g.name)).size === 5 && new Set(L.map((g) => g.farbe)).size === 5, 'fünf verschiedene Namen und Lackfarben');
  ok(L.map((g) => g.nummer).join() === '2,3,4,5,6', 'Startnummern 2 … 6 (Spieler 1)');
  ok(L.every((g) => Math.abs(g.tempoK - 1) <= 0.015 && FAHRER.some((f) => f.name === g.name)), 'Tempo-Abweichung je Fahrer ≤ 1,5 %, Namen aus der Liste (fiktiv)');
  ok(JSON.stringify(gegnerListe(5, 'profi', 43).map((g) => g.name)) !== JSON.stringify(L.map((g) => g.name)), 'anderer Seed → andere Reihenfolge');
}
// 3. Rangliste, Zeitnahme, Abstände
{
  const e = [
    { id: 'a', nummer: 2, fortschritt: 500, fertig: false }, { id: 'b', nummer: 3, fortschritt: 900, fertig: false },
    { id: 'c', nummer: 4, fortschritt: 1000, fertig: true, zeit: 61.5 }, { id: 'd', nummer: 5, fortschritt: 1000, fertig: true, zeit: 60.2 },
    { id: 'e', nummer: 6, fortschritt: 900, fertig: false },
  ];
  const r = rangliste(e);
  ok(r.map((x) => x.id).join('') === 'dcbea' && r[0].platz === 1 && r[4].platz === 5, `Rangliste: Fertige nach Zeit, dann Fortschritt, Gleichstand nach Nummer (${r.map((x) => x.id).join('')})`);
  const zA = new Zeitnahme(0), zB = new Zeitnahme(0);
  for (let t = 0; t <= 20; t += 0.1) { zA.melde(t * 30, t); if (t >= 2) zB.melde((t - 2) * 30, t); }   // B fährt 2 s hinter A
  const li = abstaende(rangliste([{ id: 'A', nummer: 2, fortschritt: 600, fertig: false }, { id: 'B', nummer: 3, fortschritt: 540, fertig: false }]), new Map([['A', zA], ['B', zB]]), 20);
  ok(Math.abs(li[1].vor - 2) < 0.05 && Math.abs(li[0].hinter - 2) < 0.05, `Abstand Hintermann 2 s (gemessen ${li[1].vor.toFixed(3)} s)`);
  zA.melde(300, 10);
  ok(zA.zeitBei(400) === null && Math.abs(zA.zeitBei(150) - 5) < 0.05, 'Zeitnahme nach Rückspulen: spätere Marken verworfen');
  ok(spielerSlot(6, 'vorne') === 0 && spielerSlot(6, 'hinten') === 5 && spielerSlot(6, 'mitte') === 2 && spielerSlot(2, 'mitte') === 0, 'Spieler-Startplatz vorne/mitte/hinten');
}

// Strecken: 2 Generator-Strecken (Rundkurs), je Prüffahrt für die Autopilot-Referenz
const strecken = [];
for (const [s, d] of [[11, 2], [4711, 3], [42, 3], [9, 2]].slice(0, NTR)) {
  const v = verifySync(generate(s, d));
  if (v.ok) strecken.push({ name: `S${s}/${d}`, env: v.env, ap: v.apTime });
}
ok(strecken.length === NTR, `${strecken.length} Teststrecken mit Autopilot-Referenz`);

const rennen = (env, apT, opt) => {
  const F = new GegnerFeld(env, { anzahl: 1, startplatz: 'hinten', assist: 'medium', seed: 3, schiene: 'nie', ...opt });
  let t = 0; while (t < apT * 2.5 + 30 && !F.fahrer.every((g) => g.fertig)) { F.step(DT, null, opt.sicht ? opt.sicht(t) : null); t += DT; }
  return F;
};

for (const S of strecken) {
  const { env } = S, L = env.track.line, I = env.ideal;
  // 4. Raster
  const R = startRaster(L, env.track.start.idx, 6);
  const cars = R.map((p) => { const c = new Car(); c.place([p.px, p.py, p.pz], [p.tx, p.ty, p.tz], [p.nx, p.ny, p.nz], 0); return c; });
  let ueber = 0;
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) if (ueberlapp(quader(cars[a]), quader(cars[b], { c: [0, 0, 0], a: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], h: [0.95, 0.52, 2.28] }))) ueber++;
  ok(ueber === 0, `${S.name}: Raster 6 Autos ohne Überlapp`);
  ok(R.every((p) => Math.abs(p.lat) <= L.hw[p.idx] - 1.2), `${S.name}: Raster auf der Fahrbahn (|Versatz| ${Math.max(...R.map((p) => Math.abs(p.lat))).toFixed(1)} m ≤ Rand − 1,2 m)`);
  const pr = R.map((p) => fortschritt(L, p.idx, p.lapDelta) + p.frac * (L.s[Math.min(L.n - 1, p.idx + 1)] - L.s[p.idx]));
  ok(pr.every((x, k) => k === 0 || x < pr[k - 1] + 1e-6) && pr[0] < fortschritt(L, env.track.start.idx, 0), `${S.name}: Raster hinter der Startlinie, Platz 1 vorn (${pr.map((x) => x.toFixed(0)).join(' ')})`);
  // 5. Masken
  const M = streckenMasken(env);
  let diff = 0; for (let i = 0; i < L.n; i++) if (!!M.haft[i] !== haftOffAt(env.track, i)) diff++;
  ok(diff === 0, `${S.name}: Bodenhaftungs-Maske = haftOffAt`);
  ok(M.lo.every((x, i) => x <= 0 && M.hi[i] >= 0), `${S.name}: Seitengrenzen enthalten die Ideallinie`);
  // 6. Hochrechnung ≈ Autopilot-Zeit (volles Profil, Start im Stand)
  const rz = restzeit(L, env.prof.vt, env.track.start.idx - 1, 0, 0, zielFortschritt(L, env.track.start.idx), (v) => driveAccel(new Car().def, v) * 0.9);
  ok(Math.abs(rz / S.ap - 1) < 0.08, `${S.name}: Hochrechnung der Rundenzeit ${rz.toFixed(1)} s ≈ Autopilot ${S.ap.toFixed(1)} s (± 8 %)`);
  // 7. Stärken
  const z = {};
  for (const st of ['locker', 'ebenbuertig', 'profi']) {
    const F = rennen(env, S.ap, { staerke: st, anzahl: 3 });
    const fz = F.fahrer.map((g) => g.zeit);
    z[st] = fz.reduce((a, b) => a + b, 0) / fz.length;
    ok(F.fahrer.every((g) => g.fertig && Number.isFinite(g.zeit)), `${S.name} ${STAERKEN[st].name}: 3/3 im Ziel (${fz.map((x) => x.toFixed(1)).join(', ')} s, Crashs ${F.fahrer.map((g) => g.crashes).join('/')}, Stöße ${F.stoesse})`);
  }
  ok(z.locker > z.ebenbuertig && z.ebenbuertig > z.profi, `${S.name}: Locker ${z.locker.toFixed(1)} > Ebenbürtig ${z.ebenbuertig.toFixed(1)} > Profi ${z.profi.toFixed(1)} s`);
  const pro = rennen(env, S.ap, { staerke: 'profi', fehler: false }).fahrer[0].zeit;
  ok(Math.abs(pro / S.ap - 1) <= 0.05, `${S.name}: Profi ohne Fehler ${pro.toFixed(2)} s ≈ Autopilot ${S.ap.toFixed(2)} s (± 5 %)`);
  // 8. deterministisch
  const a1 = rennen(env, S.ap, { staerke: 'ebenbuertig', anzahl: 3 }).fahrer.map((g) => g.zeit).join(), a2 = rennen(env, S.ap, { staerke: 'ebenbuertig', anzahl: 3 }).fahrer.map((g) => g.zeit).join();
  ok(a1 === a2, `${S.name}: deterministisch (3 Gegner, zweimal gleich)`);
  // 9. Schiene ↔ Physik
  const fp = rennen(env, S.ap, { staerke: 'ebenbuertig', fehler: false }).fahrer[0].zeit;
  const fs = rennen(env, S.ap, { staerke: 'ebenbuertig', fehler: false, schiene: 'immer' }).fahrer[0].zeit;
  ok(Math.abs(fs / fp - 1) < 0.03, `${S.name}: Schiene ${fs.toFixed(1)} s ≈ Physik ${fp.toFixed(1)} s (± 3 %)`);
  // Wechsel: Sicht-Punkt springt alle 3 s zwischen Gegner (nah) und weit weg → viele Wechsel, kein Crash, kein NaN
  {
    let wechsel = 0, last = 'physik';
    const F = new GegnerFeld(env, { anzahl: 1, startplatz: 'hinten', staerke: 'ebenbuertig', fehler: false, seed: 3 });
    const g = F.fahrer[0];
    let t = 0;
    while (t < S.ap * 2.5 && !g.fertig) {
      const fern = Math.floor(t / 3) % 2 === 1;
      F.step(DT, null, fern ? { x: 1e5, y: 0, z: 0 } : g.car.pos);
      if (g.modus !== last) { wechsel++; last = g.modus; }
      t += DT;
    }
    ok(g.fertig && g.crashes === 0 && Number.isFinite(g.car.pos.x), `${S.name}: ${wechsel} Wechsel Schiene ↔ Physik ohne Crash, im Ziel nach ${g.zeit.toFixed(1)} s (nur Physik ${fp.toFixed(1)} s)`);
    ok(Math.abs(g.zeit / fp - 1) < 0.04, `${S.name}: Zeit mit Wechseln ± 4 % zur reinen Physik`);
  }
  // 10. Aufzeichnung im Geister-Format, Rückspulen
  {
    const F = new GegnerFeld(env, { anzahl: 2, staerke: 'ebenbuertig', seed: 5, schiene: 'nie' });
    for (let t = 0; t < 12; t += DT) F.step(DT);
    const A = F.fahrer[0].aufnahme();
    ok(A.hz === REC.hz && A.frames >= 12 * REC.hz - 1 && A.data.length === A.frames * REC.stride, `Aufzeichnung ${A.frames} Bilder à ${REC.stride} Floats (15 Hz, Geister-Format)`);
    const k = Math.floor(10 * REC.hz) * REC.stride;
    ok(Number.isFinite(A.data[k]) && Math.abs(Math.hypot(A.data[k + 3], A.data[k + 4], A.data[k + 5], A.data[k + 6]) - 1) < 1e-3, 'Aufzeichnung: Lage und Quaternion gültig');
    const sn = F.snaps[F.snaps.length - 31];   // ~3 s zurück
    const pos = sn.g[0].s.p.slice();
    F.zurueck(sn.uhr + 0.01);
    ok(Math.abs(F.uhr - sn.uhr) < 1e-9 && F.fahrer[0].car.pos.x === pos[0] && F.fahrer[0].recN <= Math.floor(sn.uhr * REC.hz) + 2, `Rückspulen: Uhr ${F.uhr.toFixed(2)} s, Lage wie gesichert, Aufzeichnung gekürzt`);
    for (let t = 0; t < 5; t += DT) F.step(DT);
    ok(F.fahrer.every((g) => Number.isFinite(g.car.pos.x) && g.zustand !== 'crash'), 'nach dem Rückspulen fahren die Gegner weiter');
  }
}

// 11. Spieler-Rennen (Race, Autopilot auf Original) mit 3 Gegnern: Raster, Rangliste mit Spieler, Zieleinlauf, Hochrechnung
{
  const S = strecken[0], env = S.env;
  const race = new Race(env, { assist: 'original', autopilot: true, countdown: 1 });
  const F = new GegnerFeld(env, { anzahl: 3, staerke: 'profi', seed: 7, assist: 'original', startplatz: 'mitte' });
  F.spielerAufstellen(race);
  const r0 = F.raster[F.spielerPlatz];
  ok(Math.hypot(race.car.pos.x - r0.px, race.car.pos.z - r0.pz) < 1.0 && race.tracker.idx === r0.idx, `Spieler steht auf Rasterplatz ${F.spielerPlatz + 1} (Mitte)`);
  let t = 0, maxStand = null, zielEv = 0;
  while (t < S.ap * 2.5 + 30 && !(race.state === 'finished' && F.abgeschlossen)) {
    race.step(DT, { steer: 0, throttle: 0, brake: 0 });
    F.step(DT, race);
    t += DT;
    if (Math.abs(t - 20) < DT / 2) maxStand = F.stand(race);
    for (const e of race.events.splice(0)) if (e.type === 'finish') zielEv++;
  }
  ok(race.state === 'finished' && zielEv === 1, `Spieler (Autopilot Original) im Ziel nach ${race.finalTime?.toFixed(1)} s (Crashs ${race.crashes})`);
  ok(F.abgeschlossen && F.fahrer.every((g) => g.fertig || g.hochgerechnet), `Feld abgeschlossen (spätestens 10 s nach dem Spieler): ${F.fahrer.map((g) => `${g.zeit.toFixed(1)}${g.hochgerechnet ? '*' : ''}`).join(', ')} s`);
  const st = F.stand(race);
  ok(st.length === 4 && st.filter((e) => e.spieler).length === 1 && st.every((e, k) => e.platz === k + 1), `Zieltabelle 4 Einträge, Plätze 1–4: ${st.map((e) => `${e.platz}. ${e.name} ${e.zeit?.toFixed(1)}`).join(' | ')}`);
  ok(maxStand && maxStand.length === 4 && maxStand.slice(1).every((e) => e.vor == null || (e.vor >= 0 && e.vor < 60)), `nach 20 s: Rangliste mit Abständen (${maxStand.map((e) => `${e.platz}. ${e.name}${e.vor != null ? ' +' + e.vor.toFixed(2) : ''}`).join(' | ')})`);
  ok(F.stoesse >= 0 && Number.isFinite(race.car.pos.x), `Stöße im Rennen: ${F.stoesse}`);
}
// 12. Leicht weicht aus: Gegner direkt voraus auf der Ideallinie → Versatz zur Seite
{
  const S = strecken[0], env = S.env;
  const race = new Race(env, { assist: 'easy', autopilot: true, countdown: 0 });
  const F = new GegnerFeld(env, { anzahl: 1, staerke: 'locker', seed: 7, assist: 'easy', startplatz: 'hinten' });
  F.spielerAufstellen(race);
  race.step(DT, { steer: 0, throttle: 0, brake: 0 }); F.step(DT, race);
  // Gegner 15 m vor den Spieler auf die Ideallinie setzen (gerade Stelle ohne Stunt suchen)
  const M = F.M, I = env.ideal, L = env.track.line;
  let i = race.ap.tr.idx; for (let g = 0; g < L.n && (M.kein[i] || M.kein[(i + 8) % L.n] || M.hi[i] - M.lo[i] < 6); g++) i = (i + 1) % L.n;
  const j = (i + 8) % L.n;
  race.car.place([I.px[i], I.py[i], I.pz[i]], [I.tx[i], I.ty[i], I.tz[i]], [I.nx[i], I.ny[i], I.nz[i]], 20);
  race.tracker.reset(i); race.ap.tr.reset(i);
  const g = F.fahrer[0];
  g.car.place([I.px[j], I.py[j], I.pz[j]], [I.tx[j], I.ty[j], I.tz[j]], [I.nx[j], I.ny[j], I.nz[j]], 15); g.ap.tr.reset(j); g.zustand = 'fahrt';
  const off = F.ausweichen(race);
  ok(Math.abs(off) >= 2.2 && off >= M.lo[i] && off <= M.hi[i], `Leicht: Gegner voraus → Ausweich-Versatz ${off.toFixed(2)} m (innerhalb ${M.lo[i].toFixed(1)} … ${M.hi[i].toFixed(1)})`);
}
ok(hash01(5, 3) === hash01(5, 3) && hash01(5, 3) !== hash01(5, 4), 'hash01 deterministisch');
// 13. Gegner Aus = bitgleich zum Stand vor n34 (Aufzeichnung + Zeit, Autopilot und gescripteter Spieler, 3 Fahrhilfen)
{
  const ref = JSON.parse(fs.readFileSync(new URL('./data/gegner_aus_ref.json', import.meta.url), 'utf8'));
  const neu = hashes();
  const diff = Object.keys(ref).filter((k) => ref[k] !== neu[k]);
  ok(diff.length === 0 && Object.keys(neu).length === Object.keys(ref).length, `Gegner Aus: ${Object.keys(ref).length} Rennen bitgleich zur Basis (Aufzeichnung, Zeit, Crashs)${diff.length ? ' – abweichend: ' + diff.join(', ') : ''}`);
}
// 14. Bestzeiten „mit Gegnern“: eigene Liste, Solo unberührt, eigener Geist
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
  const { Store, modeKey } = await import('../../src/game/store.js');
  ok(modeKey('medium', false, true) === 'medium+reset@x' && modeKey('medium', false, true, true) === 'medium+reset@x@g', 'Schlüssel: Solo unverändert, mit Gegnern „@g“');
  const St = new Store(); St.ab = false;
  const rec = new Float32Array(16 * 4 * 30).fill(0.1);
  St.submit('T1', 'medium', false, 70, rec, {});
  const r = St.submit('T1', 'medium', false, 60, rec, { gegner: 3 });
  ok(r.isBest && St.bestFor('T1', 'medium', false, true).time === 70 && St.bestFor('T1', 'medium', false, true, true).time === 60, 'schnellere Zeit mit Gegnern: eigene Bestzeit, Solo-Bestzeit bleibt 70 s');
  ok(St.loadGhost('T1', 'medium', false, true, true) && St.loadGhost('T1', 'medium', false, true, false), 'Geist je Liste (Solo und mit Gegnern)');
  const e = St.submit('T1', 'easy', false, 50, rec, { gegner: 1 });
  ok(e.easy && e.list[0].g === 1, 'Leicht: Zeit notiert mit Kennung „mit Gegnern“');
}
console.log(bad ? `KI-Gegner: ${bad} FEHLER` : 'KI-Gegner: alle Prüfungen grün');
process.exit(bad ? 1 : 0);
