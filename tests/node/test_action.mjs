// n36 Action-Momente (game/action.js): Tempo-Kurven (Speed-Ramp 1 → min → 1,5 → 1, Bullet-Time ≤ 0,05× und ruckartig zurück),
// Dauer (Live ≤ 1,2 s, Bullet-Time ≤ 1,5 s), Effekte (Weißblitz, „Blitze reduzieren“), Dosierung (Aus, Abkühlzeit, Zufall ×
// Wertung, Spektakel-Deckel × 8), Gefahr voraus, Online = Schein (Physik 1×), Kamera-Kreis (Halbkreis, freie Seite, nie unter
// den Boden), Stufe aus URL/Einstellung; Rennen auf Zufallsstrecken mit Gegnern: Momente kommen, Rennzeit mit Regie = ohne
// (fair), Eingaben laufen weiter; Highlight-Film: Live-Bullet-Time → Standbild mit Kreisfahrt.
import { ACTION, ActionRegie, tempoBei, fxBei, spektakel, actionStufe, gefahrVoraus } from '../../src/game/action.js';
import { rennen, strecken } from '../../tools/action_mess.mjs';
import { buildFilm, HL } from '../../src/game/highlights.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

// 1. Tempo-Kurven und Dauer
{
  let rampOk = true, bulletOk = true, durOk = true;
  for (const [art, A] of Object.entries(ACTION.arten)) {
    const M = { art, dur: A.dur }, ks = [];
    for (let u = 0; u <= A.dur + 0.05; u += 0.005) ks.push(tempoBei(M, u));
    const mn = Math.min(...ks), mx = Math.max(...ks);
    if (A.cam === 'kreis') {
      if (!(mn <= 0.05 && mx <= 1 + 1e-9 && A.dur <= 1.5)) bulletOk = false;
      // ruckartig zurück: kurz vor dem Ende noch ≤ 0,05, am Ende 1
      if (!(tempoBei(M, A.dur - 0.01) <= 0.05 && tempoBei(M, A.dur) === 1)) bulletOk = false;
    } else {
      if (!(Math.abs(mn - A.min) < 1e-6 && Math.abs(mx - ACTION.ramp.schnell) < 0.02 && tempoBei(M, A.dur) === 1)) rampOk = false;
      if (A.dur > 1.2) durOk = false;
    }
  }
  ok(rampOk, 'Speed-Ramp: 1× → Tiefpunkt → 1,5× → 1× (fließend)');
  ok(bulletOk, 'Bullet-Time: ≤ 0,05×, ≤ 1,5 s, am Ende ruckartig 1×');
  ok(durOk, `Live-Momente ≤ 1,2 s (${Object.entries(ACTION.arten).filter(([, a]) => a.cam !== 'kreis').map(([k, a]) => `${k} ${a.dur}`).join(', ')})`);
  const f0 = fxBei({ art: 'kopf', dur: 1.1 }, 0.01), fA = fxBei({ art: 'kopf', dur: 1.1 }, 0.01, true), fm = fxBei({ art: 'kopf', dur: 1.1 }, 0.5);
  ok(f0.white > 0.4 && fA.white <= ACTION.fx.whiteArm + 1e-9 && fm.white === 0, `Weißblitz am Anfang ${f0.white.toFixed(2)}, mit „Blitze reduzieren“ nur ${fA.white.toFixed(2)}`);
  ok(fm.sat > 0.3 && fm.vig > 0.3 && fm.fovK < 0.75 && fm.ca === 0, 'Zoom-Punch: Sättigung, Vignette, Sichtfeld enger, keine Farbsäume');
  const fb = fxBei({ art: 'bullet', dur: 1.4 }, 0.6), fe = fxBei({ art: 'bullet', dur: 1.4 }, 1.45);
  ok(fb.ca > 0 && fb.bars === 1 && fe.shake > 0 && fe.ca === 0, 'Bullet-Time: Farbsäume + Kino-Balken, danach kurzes Wackeln');
}
// 2. Dosierung
{
  ok(actionStufe('', {}) === 'selten' && actionStufe('?action=0', { action: 'oft' }) === 'aus' && actionStufe('?action=2', {}) === 'oft' && actionStufe('', { action: 'oft' }) === 'oft', 'Stufe: Standard Selten, ?action=0 aus, gespeichert Oft');
  const R = new ActionRegie({ stufe: 'aus', rnd: () => 0 });
  ok(!R.versuch('bullet', 99) && R.log[0].grund === 'aus', 'Aus → nie');
  const O = new ActionRegie({ stufe: 'oft', rnd: () => 0 });
  ok(O.versuch('kopf', 6) && O.physK === 1 && O.M, 'Oft: Moment startet');
  O.takt(0.05); const k1 = O.physK;
  ok(k1 < 1, `Physik langsamer im Moment (${k1.toFixed(2)})`);
  for (let t = 0; t < 2; t += 0.05) O.takt(0.05);
  ok(!O.M && !O.versuch('kopf', 6) && O.log[O.log.length - 1].grund === 'abkühlen', 'danach Abkühlzeit');
  for (let t = 0; t < ACTION.cool.oft; t += 0.05) O.takt(0.05);
  ok(!!O.versuch('kopf', 6), `nach ${ACTION.cool.oft} s wieder möglich`);
  const G = new ActionRegie({ stufe: 'oft', rnd: () => 0 });
  ok(!G.versuch('kopf', 6, { gefahr: true }) && G.log[0].grund === 'gefahr', 'Gefahr voraus → nie');
  const Z = new ActionRegie({ stufe: 'selten', rnd: () => 0.3 });
  ok(!Z.versuch('kette', 1.5) && Z.log[0].grund === 'zufall', `Selten + kleine Wertung → Zufall entscheidet (p ${Z.log[0].p})`);
  ok(spektakel('bullet', { luft: true, dreher: true, frontal: true, ruhig: true, k: 3 }) === ACTION.arten.bullet.base * ACTION.deckel, 'Spektakel-Faktoren gedeckelt × 8');
  const N = new ActionRegie({ stufe: 'oft', online: true, rnd: () => 0 });
  N.versuch('bullet', 9); N.takt(0.3);
  ok(N.M && N.M.schein && N.physK === 1 && N.M.cam === 'punch', 'Online: nur Schein (Physik 1×, kein Kreis)');
}
// 3. Kamera-Kreis
{
  const R = new ActionRegie({ stufe: 'oft', rnd: () => 0 });
  R.versuch('bullet', 9);
  const rig = { pos: [0, 2, 6], look: [0, 0.5, -4] }, car = [0, 0.5, 0];
  const frei = (a, b) => (b[0] > 0.5 ? 0.3 : 1);   // rechts (x > 0) verdeckt → links herum
  const pos = [];
  for (let u = 0; u < 1.4; u += 1 / 60) { R.takt(1 / 60); const C = R.kamera(rig, car, frei, () => 0.7, 1 / 60); pos.push([...C.pos]); }
  const a0 = Math.atan2(pos[8][2], pos[8][0]), a1 = Math.atan2(pos[70][2], pos[70][0]);
  let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  ok(Math.abs(Math.abs(Math.atan2(pos[70][2], pos[70][0]) - Math.atan2(6, 0)) - Math.PI) < 0.25 || Math.abs(pos[70][2] + 6) < 1.5, `Halbkreis: Kamera nach ~1,1 s gegenüber (z ${pos[70][2].toFixed(1)})`);
  ok(pos.every((p) => p[1] >= 0.7 - 1e-6) && pos.slice(10, 60).every((p) => p[0] <= 0.6), 'freie Seite gewählt, nie unter dem Boden');
}
// 4. Rennen mit Gegnern (Zufallsstrecken): Momente, fair
{
  const T = strecken(1, ['flach', '3d']);
  let mom = 0, fair = 0, n = 0, arten = new Set(), zl = 0, maxD = 0;
  for (const t of T.slice(0, 4)) {
    const a = rennen(t.v, { stufe: 'oft', gegner: 3, fahrer: 'leicht', seed: 7 });
    const b = rennen(t.v, { fahrer: 'leicht', gegner: 3, seed: 7 });
    n++; mom += a.regie.stats().momente; for (const e of a.regie.log) if (e.ok) arten.add(e.art);
    if (a.zeit != null && a.zeit === b.zeit) fair++;
    zl += a.zlT; maxD = Math.max(maxD, a.maxDur);
  }
  ok(mom >= n, `${n} Rennen „Oft“ mit 3 Gegnern: ${mom} Momente (${[...arten].join(', ')})`);
  ok(fair === n, `Rennzeit mit Momenten = ohne (gleiche Physikschritte): ${fair}/${n}`);
  ok(maxD <= 1.5 + 1e-6, `längste Zeitlupe ${maxD.toFixed(2)} s ≤ 1,5 s`);
  // Eingabe in der Zeitlupe: dieselben Schritte wie ohne (Spur der Positionen gleich)
  const t = T[0], a = rennen(t.v, { stufe: 'oft', fahrer: 'profi', seed: 7, spur: true }), b = rennen(t.v, { fahrer: 'profi', seed: 7, spur: true });
  // (nach der Ziellinie endet die Schleife am Bildende – dort kann ein Schritt mehr oder weniger stehen)
  const nS = Math.min(a.schritte.length, b.schritte.length);
  ok(Math.abs(a.schritte.length - b.schritte.length) <= 2 && a.schritte.slice(0, nS).every((x, i) => x === b.schritte[i]) && a.zeit === b.zeit, `Mittel mit Eingaben: Fahrt mit Momenten schrittgleich zur Fahrt ohne (${a.regie.stats().momente} Momente, ${nS} Schritte, Zeit ${a.zeit && a.zeit.toFixed(3)} s)`);
  ok(gefahrVoraus(null, null) === false, 'Gefahr-Prüfung ohne Rennen → nein');
}
// 5. Highlight-Film: Live-Bullet-Time → Standbild mit Kreisfahrt
{
  const T = strecken(1, ['flach']);
  let gefunden = false, orbit = 0, dauer = true;
  for (const t of T) {
    const a = rennen(t.v, { stufe: 'oft', fahrer: 'leicht', seed: 7, film: true });
    const bt = a.regie.log.filter((e) => e.ok && e.art === 'bullet');
    if (!bt.length || !a.race) continue;
    const film = buildFilm(a.race.rec, t.v.env, { cuts: a.race.cuts, pens: a.race.pens, xev: a.race.xev, crashes: a.race.crashLog, action: bt.map((e) => ({ t: e.recT, art: 'bullet' })) });
    if (!film) continue;
    gefunden = true;
    orbit += film.clips.filter((c) => c.freeze && c.freeze.orbit).length;
    if (film.duration > HL.film.max + 6) dauer = false;
  }
  ok(gefunden && orbit >= 1, `Film: ${orbit} Bullet-Time-Standbild(er) mit Kreisfahrt aus Live-Momenten`);
  ok(dauer, 'Filmlänge bleibt im Rahmen');
}
console.log(bad ? `Action-Momente: ${bad} FEHLER` : 'Action-Momente: alle Prüfungen grün');
process.exit(bad ? 1 : 0);
