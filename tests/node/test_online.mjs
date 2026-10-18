// n35 Online-Rennen (game/online.js) ohne Browser: zwei echte Rennen (Race, Autopilot) auf einer Generator-Strecke,
// verbunden über das Fake-Netz (Ping 0 / 150 ms mit Schwankung und 5 % Verlust), Gastgeber rechnet 2 KI-Gegner.
// Geprüft: Startaufstellung (verschiedene Plätze, kein Überlapp), synchrones „Los!“ (±50 ms wahre Zeit), fremde Autos
// (Mensch + KI) mit gültiger Lage, Kollision eigenes Auto ↔ fremdes (fest, kein NaN), Zieleinlauf → gleiche Zieltabelle,
// Rennzeit nahe der Autopilot-Zeit, Gastgeber-Abbruch mitten im Rennen (Gast fährt allein zu Ende, KI verschwindet).
// Dazu: Schema-Größe, FremdAuto-Achsen, Rempler zwischen zwei Autos nebeneinander (fest), aufstellung().
import { generate } from '../../src/track/generator.js';
import { verifySync, prepare } from '../../src/track/verify.js';
import { SHOWCASE, showcaseBytes } from '../../src/track/showcase.js';
import { beschreibe, streckenKennung, ausB64 } from '../../src/game/onlinestrecke.js';
import { OnlineProbe, probeAnzahl } from '../../src/game/onlineprobe.js';
import { Race } from '../../src/game/race.js';
import { Car } from '../../src/physics/car.js';
import { stoss, HAERTE } from '../../src/physics/autoauto.js';
import { FakeNetz } from '../../src/net/fake.js';
import { Sitzung } from '../../src/net/sitzung.js';
import { OnlineRennen, AUTO_SCHEMA, LIN, FremdAuto, startDaten, kiFeld, aufstellung, zustandEigen, schildName, onlineOptionen } from '../../src/game/online.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const DT = 1 / 120;

// ---------- Kleinteile ----------
{
  ok(AUTO_SCHEMA.groesse === 34, `Auto-Zustand ${AUTO_SCHEMA.groesse} Byte (+7 Kopf) – 25 Hz ≈ ${(25 * 41 / 1000).toFixed(2)} kB/s je Auto`);
  const A = aufstellung(['s3', 's1', 's2'], (s) => ({ s1: 1, s2: 2, s3: 4 })[s], 2);
  ok(A.n === 5 && A.slotVon('s1') === 0 && A.slotVon('s3') === 2 && A.kiPlaetze.join() === '3,4', 'Aufstellung: Menschen nach Nummer vorn, KI dahinter');
  const F = new FremdAuto();
  const a = 0.7;   // Gier um y
  F.setze({ px: 1, py: 2, pz: 3, q: { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, vx: 0, vy: 0, vz: -10, lenk: 0.2, f: {}, sprung: 0, fort: 5 }, 1 / 60, 0);
  const c = new Car(); c.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 0); c.q.x = 0; c.q.y = Math.sin(a / 2); c.q.z = 0; c.q.w = Math.cos(a / 2); c.updateFrame();
  const d = Math.hypot(F.frame.f.x - c.frame.f.x, F.frame.f.z - c.frame.f.z) + Math.hypot(F.frame.r.x - c.frame.r.x, F.frame.r.z - c.frame.r.z);
  ok(d < 1e-9 && F.wheels[0].steer === 0.2 && F.wheels[2].steer === 0, 'FremdAuto: Achsen wie car.js, Lenkung nur vorn');
  F.setze({ px: 1, py: 2, pz: 3, q: { x: 0, y: 0, z: 0, w: 1 }, vx: 0, vy: 0, vz: 0, f: {}, sprung: 1, fort: 5 }, 1 / 60, 10);
  ok(F.geist(10.5) && !F.geist(12), 'FremdAuto nach Sprung (Reset) 1,5 s ohne Kollision');
  ok(schildName({ name: 'Peter', stufe: 'easy' }) === 'Peter 🟢' && schildName({ name: 'X'.repeat(30), stufe: 'original' }).length < 20, 'Namensschild mit Stufe');
  ok(!onlineOptionen('').menue && onlineOptionen('?online=1').menue && onlineOptionen('?raum=ABCD').menue, 'Menü „Online“ im Vorbau nur mit ?online=1 oder ?raum=');
  // Rempler: eigenes Auto fährt seitlich in ein festes fremdes Auto
  const ich = new Car(); ich.place([0, 0, 0], [0, 0, -1], [0, 1, 0], 0); ich.v.x = 6;
  const X = new FremdAuto(); X.setze({ px: 1.85, py: 0, pz: 0, q: { x: 0, y: 0, z: 0, w: 1 }, vx: 0, vy: 0, vz: 0, f: {}, sprung: 0, fort: 0 }, 1 / 60, 0);
  const r = stoss(ich, X, HAERTE.mittel, { x: -0.05, y: 0, z: 0 }, { x: 1.85, y: 0, z: 0 }, { festB: true });
  ok(r && r.vn > 1.5 && ich.v.x < 6 && X.pos.x === 1.85 && [ich.v.x, ich.v.y, ich.v.z, ich.w.x, ich.w.y].every(Number.isFinite), `Stoß gegen festes fremdes Auto: ${r && r.vn.toFixed(1)} m/s, eigenes Auto abgebremst (${ich.v.x.toFixed(2)} m/s), fremdes bleibt`);
}

// ---------- Strecke ----------
const V = verifySync(generate(11, 2));
ok(V.ok, `Teststrecke S11/2, Autopilot ${V.apTime && V.apTime.toFixed(1)} s`);
const env = V.env;

// ---------- Strecke als Daten ----------
{
  const lay = generate(4711, 3, { gel: true, gv: 2 });
  const d = beschreibe({ layout: lay, meta: { ...lay.meta, apTime: 70.5, fixes: 1 } });
  const ueber = JSON.parse(JSON.stringify(d));   // wie über das Netz
  const e1 = prepare(lay), e2 = prepare(ueber.layout);
  ok(d.art === 'layout' && JSON.stringify(d).length < 6000 && Math.abs(e1.track.line.total - e2.track.line.total) < 1e-6 && e1.track.line.n === e2.track.line.n && ueber.apTime === 70.5, `Zufallsstrecke (Gelände) als Daten: ${JSON.stringify(d).length} Zeichen, gebaut gleich lang (${e2.track.line.total.toFixed(1)} m)`);
  ok(streckenKennung(d) === streckenKennung(ueber) && streckenKennung(d) !== streckenKennung(beschreibe({ layout: generate(4712, 3), meta: {} })), 'Strecken-Kennung gleich nach Übertragung, anders für andere Strecke');
  const id = SHOWCASE[0].id, bytes = showcaseBytes(id);
  const t = beschreibe({ layout: null, meta: { key: 'trk-abc', name: 'Meine' } }, () => bytes);
  const zur = ausB64(t.b64);
  ok(t.art === 'trk' && zur.length === bytes.length && zur.every((x, k) => x === bytes[k]) && t.b64.length < 3000, `.TRK als Daten: ${bytes.length} Byte → ${t.b64.length} Zeichen Base64, Bytes gleich`);
  ok(beschreibe({ meta: { key: 'sam-0042', name: 'X' } }).art === 'sam' && beschreibe({ meta: { key: 'trk-x' } }, () => null) === null, 'Sammlung nur als Kennung; .TRK ohne Bytes → null');
}

// ---------- zwei Geräte ----------
function geraet(N, id, opt) {
  const t = N.teilnehmer(id, { uhr: opt.uhr || 0, gang: opt.gang || 0 });
  const S = new Sitzung(t, { jetzt: t.jetzt, sid: 'sid-' + id, info: { name: opt.name, stufe: opt.stufe }, gastgeber: !!opt.gastgeber, schema: AUTO_SCHEMA, lin: LIN });
  const G = { id, S, t, race: null, O: null, feld: null, los: null, stoesse: 0, rempler: 0, nan: false, ergebnis: null, maxFremde: 0, kiGesehen: 0, events: [] };
  S.on('start', () => {
    G.race = new Race(env, { assist: opt.stufe, autopilot: true, countdown: 1e9, wreck: false });
    G.O = new OnlineRennen(S, env, G.race, { tempo: 1 });
    if (S.istGastgeber) G.feld = kiFeld(env, G.O, opt.stufe, { schiene: 'auto' });
    G.O.aufstellen();
  });
  S.on('ergebnis', (E) => { G.ergebnis = E; });
  return G;
}
function lauf(N, alle, sek, bis = null) {
  const zero = { steer: 0, throttle: 0, brake: 0 };
  for (let k = 0; k < sek * 120; k++) {
    N.schritt(1000 / 120);
    for (const G of alle) {
      if (!G.t.aktiv) continue;
      G.S.takt();
      if (!G.race) continue;
      G.O.frame();
      const vor = G.race.state;
      G.race.step(DT, zero);
      if (vor === 'countdown' && G.race.state === 'running') G.los = N.zeit;
      if (G.feld) G.feld.step(DT, G.race);
      G.O.schritt(DT);
      G.O.nachFrame(G.race.events.splice(0));
      for (const e of G.O.events.splice(0)) { G.events.push(e.type); if (e.type === 'rempler') G.rempler++; }
      const c = G.race.car;
      if (![c.pos.x, c.pos.y, c.pos.z, c.v.x, c.v.y, c.v.z].every(Number.isFinite)) G.nan = true;
      const fremde = [...G.O.autos.values()].filter((X) => X.auto.gueltig);
      G.maxFremde = Math.max(G.maxFremde, fremde.length);
      G.kiGesehen = Math.max(G.kiGesehen, fremde.filter((X) => X.ki).length);
      if (fremde.some((X) => ![X.auto.pos.x, X.auto.pos.y, X.auto.pos.z].every(Number.isFinite))) G.nan = true;
    }
    if (bis && bis()) return k / 120;
  }
  return sek;
}

for (const [lat, jit, verl] of [[0, 0, 0], [75, 30, 0.05]]) {
  const N = new FakeNetz({ latenz: lat, jitter: jit, verlust: verl, seed: 31 });
  const A = geraet(N, 'a', { gastgeber: true, name: 'Peter', stufe: 'original', uhr: 0 });
  const B = geraet(N, 'b', { name: 'Ben', stufe: 'medium', uhr: 123456, gang: 2e-5 });
  lauf(N, [A, B], 3);
  const D = startDaten(A.S, { ki: 2, staerke: 'profi', seed: 5, tempo: 1 });
  A.S.starten(D.extra, D.kiIds);
  lauf(N, [A, B], 1.5);
  const pa = A.race.car.pos, pb = B.race.car.pos;
  ok(A.O.slot === 0 && B.O.slot === 1 && Math.hypot(pa.x - pb.x, pa.z - pb.z) > 3 && A.feld && A.feld.fahrer.length === 2, `Ping ${2 * lat}: Raster Peter Platz 1, Ben Platz 2 (${Math.hypot(pa.x - pb.x, pa.z - pb.z).toFixed(1)} m auseinander), 2 KI dahinter`);
  const ende = lauf(N, [A, B], V.apTime * 1.6 + 60, () => A.ergebnis && B.ergebnis);
  ok(A.los != null && B.los != null && Math.abs(A.los - B.los) <= 50, `„Los!“ auf beiden Geräten: Abstand ${Math.abs(A.los - B.los).toFixed(0)} ms (Grenze 50)`);
  ok(A.maxFremde === 1 && B.maxFremde === 3 && B.kiGesehen === 2, `fremde Autos: Peter sieht ${A.maxFremde} (Ben; KI rechnet er selbst), Ben sieht ${B.maxFremde} (Peter + ${B.kiGesehen} KI)`);
  ok(!A.nan && !B.nan, 'keine NaN in eigenen und fremden Autos');
  const tab = (G) => (G.ergebnis || []).map((e) => `${e.platz}.${e.name}${e.zeit != null ? ' ' + e.zeit.toFixed(2) : ' –'}`).join(' | ');
  ok(A.ergebnis && tab(A) === tab(B) && A.ergebnis.length === 4, `Zieltabelle gleich (${ende.toFixed(0)} s): ${tab(A)}`);
  const zA = A.ergebnis && A.ergebnis.find((e) => e.id === 'sid-a'), zB = A.ergebnis && A.ergebnis.find((e) => e.id === 'sid-b');
  ok(zA && zB && zA.zeit > V.apTime * 0.9 && zA.zeit < V.apTime * 1.5 && zB.zeit > V.apTime * 0.9 && zB.zeit < V.apTime * 1.6, `Rennzeiten plausibel (Autopilot ${V.apTime.toFixed(1)} s): Peter ${zA && zA.zeit.toFixed(1)} s, Ben ${zB && zB.zeit.toFixed(1)} s`);
  console.log(`      Rempler/Ereignisse: Peter ${A.rempler}, Ben ${B.rempler}; Netz ${(N.zaehler.bytes / ende / 2 / 1000).toFixed(2)} kB/s je Gerät`);
}

// ---------- Gastgeber geht mitten im Rennen ----------
{
  const N = new FakeNetz({ latenz: 40, jitter: 10, seed: 8, abgangVerzug: 2000 });
  const A = geraet(N, 'a', { gastgeber: true, name: 'Peter', stufe: 'original' });
  const B = geraet(N, 'b', { name: 'Ben', stufe: 'original', uhr: 999 });
  lauf(N, [A, B], 3);
  const D = startDaten(A.S, { ki: 1, seed: 9, tempo: 1 });
  A.S.starten(D.extra, D.kiIds);
  lauf(N, [A, B], 20);
  const kiVor = [...B.O.autos.values()].filter((X) => X.ki && X.auto.gueltig).length;
  N.wegreissen('a');
  lauf(N, [B], 5);
  const kiNach = [...B.O.autos.values()].filter((X) => X.ki).length, mensch = [...B.O.autos.values()].filter((X) => !X.ki).length;
  ok(kiVor === 1 && kiNach === 0 && mensch === 0 && B.S.istGastgeber && B.events.includes('weg') && B.events.includes('gastgeber'), `Gastgeber weg: Ben wird Gastgeber, Peters Auto und die KI verschwinden (Hinweise: ${[...new Set(B.events)].join(', ')})`);
  lauf(N, [B], V.apTime * 1.6 + 60, () => B.ergebnis);
  const t = (B.ergebnis || []).map((e) => e.id + (e.weg ? '(weg)' : e.zeit != null ? ' ' + e.zeit.toFixed(1) : '')).join(', ');
  ok(B.ergebnis && B.ergebnis[0].id === 'sid-b' && B.ergebnis.some((e) => e.id === 'sid-a' && e.weg), `Ben fährt allein zu Ende, Tabelle: ${t}`);
}

// ---------- Mess-Probe (?onlineprobe=3, ein Gerät): Online-Pfad gegen 3 Attrappen ----------
{
  let now = 0;
  const P = new OnlineProbe(3, { tempo: 1, jetzt: () => now });
  const race = new Race(env, { assist: 'medium', autopilot: true, countdown: 1e9 });
  const O = P.rennenBauen(env, race);
  for (let k = 0; k < 120 * 25; k++) { now += 1000 / 120; P.takt(); O.frame(); race.step(DT, {}); O.schritt(DT); O.nachFrame(race.events.splice(0)); O.events.length = 0; }
  const A = [...O.autos.values()];
  ok(race.state === 'running' && A.length === 3 && A.every((X) => X.auto.gueltig && X.auto.fort > 100) && O.stand().length === 4 && probeAnzahl('?onlineprobe=3') === 3 && probeAnzahl('') === 0, `Mess-Probe: 3 Attrappen über den Online-Pfad (Fortschritt ${A.map((X) => X.auto.fort.toFixed(0)).join('/')} m), Rangliste mit 4`);
}

// ---------- Gegenstoß: nur die Gegenseite hat den Rempler erkannt → sanfter Schubs weg vom anderen, sonst nichts ----------
{
  const mach = (lokalVorher) => {
    const R = Object.create(OnlineRennen.prototype);
    Object.assign(R, { S: { sid: 'a', zeit: 1000 }, tSim: 1000, events: [], race: { state: 'running', car: { pos: { x: 0, y: 0, z: 0 }, v: { x: 0, y: 0, z: 0 }, crash: null } } });
    R.autos = new Map([['p:0', { pid: 'p', auto: { gueltig: true, pos: { x: 2, y: 0, z: 0 } }, info: { name: 'Ben' }, rempelT: lokalVorher ? 0.95 : undefined }]]);
    R._ereignis('rempler', { an: 'a', v: 5, p: [1, 0, 0], n: [1, 0, 0] }, { pid: 'p' });
    return R;
  };
  const R1 = mach(false), R2 = mach(true);
  ok(Math.abs(R1.race.car.v.x + 2) < 1e-9 && R1.events.length === 1 && !R1.events[0].lokal, `Gegenstoß: Meldung ohne eigene Erkennung → 0,4 × 5 m/s = ${(-R1.race.car.v.x).toFixed(1)} m/s weg vom anderen, Funken`);
  ok(R2.race.car.v.x === 0 && R2.events.length === 0, 'eigene Erkennung kurz davor: kein zweiter Stoß, keine doppelten Funken');
}

console.log(bad ? `${bad} FEHLER` : 'alle Online-Rennen-Tests OK');
process.exit(bad ? 1 : 0);
