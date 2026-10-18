// n35 Online-Ablauf (game/onlinespiel.js) mit nachgebautem Spiel („app“) und Fake-Netz (150 ms Ping, 5 % Verlust):
// Raum erstellen → Code; Beitreten per Code (auch kleingeschrieben mit Bindestrich); Gast bekommt die Strecke als Daten und
// baut sie; Start erst, wenn alle die Strecke haben und „Bereit“ sind; beide starten, fahren (Autopilot), Zieltabelle →
// Liste „Online“ auf beiden Geräten, Solo-Bestzeiten unberührt; Revanche; Gastgeber wechselt die Strecke; Neu-Verbinden
// nach dem Hintergrund (gleicher Platz); falscher Code; Raum nicht gefunden.
import { generate } from '../../src/track/generator.js';
import { verifySync, prepare } from '../../src/track/verify.js';
import { Race } from '../../src/game/race.js';
import { FakeNetz } from '../../src/net/fake.js';
import { SITZUNG } from '../../src/net/sitzung.js';
import { OnlineSpiel, SPIEL } from '../../src/game/onlinespiel.js';
import { beschreibe } from '../../src/game/onlinestrecke.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const DT = 1 / 120;

const V = verifySync(generate(11, 2));
const V2 = verifySync(generate(42, 3));
const N = new FakeNetz({ latenz: 75, jitter: 30, verlust: 0.05, seed: 12 });

function geraet(id, stufe, startEnv) {
  const store = {
    settings: { assist: stufe, paint: 0x123456, spielerName: id === 'a' ? 'Peter' : 'Ben' }, online: [], best: { solo: 1 },
    save() {}, spielerId: () => 'sp-' + id, submitOnline(e) { this.online.unshift(e); },
  };
  const G = { id, store, env: startEnv, race: null, O: null, laden: 0, anzeigen: [], los: null, gestartet: 0 };
  let t = null;
  const app = {
    store, env: () => G.env,
    beschreibe: () => beschreibe(G.env),
    look: () => ({ thema: 'wueste', wetter: 'regen', zeit: 'abend' }),
    ladeStrecke: async (d, look) => { G.laden++; G.look = look; await null; const lay = d.layout; G.env = { ...prepare(lay), layout: lay, meta: { ...lay.meta, apTime: d.apTime } }; },
    startOnline: (spiel) => { G.gestartet++; G.race = new Race(G.env, { assist: stufe, autopilot: true, countdown: 1e9, wreck: false }); G.O = spiel.rennenBauen(G.env, G.race, { tempo: 1 }); },
    zumMenue: () => { G.race = null; },
    anzeige: (art) => G.anzeigen.push(art),
  };
  G.spiel = new OnlineSpiel(app, { verbinde: async (code) => { t = N.teilnehmer(id + ':' + (G.n = (G.n || 0) + 1), { uhr: id.charCodeAt(0) * 1000, raum: code }); G.t = t; return t; }, jetzt: () => (G.t ? G.t.jetzt() : 0), neuerCode: () => 'QRST' });
  return G;
}
const A = geraet('a', 'original', { ...V.env, layout: V.layout, meta: { ...V.layout.meta, apTime: V.apTime } });
const B = geraet('b', 'easy', null);
const alle = [A, B];
async function lauf(sek, bis = null) {
  const zero = { steer: 0, throttle: 0, brake: 0 };
  for (let k = 0; k < sek * 120; k++) {
    N.schritt(1000 / 120);
    for (const G of alle) {
      if (!G.spiel.S || !G.t.aktiv) continue;
      G.spiel.takt();
      const O = G.spiel.rennen;
      if (G.race && O && O.race === G.race) {
        O.frame();
        const vor = G.race.state;
        G.race.step(DT, zero);
        if (vor === 'countdown' && G.race.state === 'running') G.los = N.zeit;
        if (O.feld) O.feld.step(DT, G.race);
        O.schritt(DT);
        O.nachFrame(G.race.events.splice(0));
        O.events.length = 0;
      }
    }
    if (k % 12 === 0) await null;   // Promises (Strecke laden) dürfen laufen
    if (bis && bis()) return true;
  }
  return false;
}

const code = await A.spiel.erstellen();
ok(code === 'QRST' && A.spiel.S.istGastgeber && A.spiel.link().endsWith('raum=QRST'), `Raum erstellt: ${A.spiel.zustand().vorlesbar}, Link …${A.spiel.link().slice(-10)}`);
ok(await B.spiel.beitreten('ab0d') === null && B.spiel.hinweise.some((h) => /Ungültiger Code/.test(h.text)), 'falscher Code (mit 0) → Hinweis, keine Verbindung');
await B.spiel.beitreten(' qr-st ');
await lauf(4, () => B.spiel.geladen && B.spiel.zustand().mitglieder.length === 2);
const zB = B.spiel.zustand();
ok(zB.mitglieder.map((m) => m.name + (m.host ? '👑' : '')).join(',') === 'Peter👑,Ben' && B.laden === 1 && B.env && Math.abs(B.env.track.line.total - V.env.track.line.total) < 1e-6, `Gast in der Lobby, Strecke als Daten bekommen und gebaut (${B.env && B.env.track.line.total.toFixed(0)} m)`);
ok(B.look && B.look.thema === 'wueste' && B.look.wetter === 'regen' && B.look.zeit === 'abend', 'Landschaft/Wetter/Tageszeit des Gastgebers kommen mit');
await lauf(1);
const k1 = A.spiel.startKlar();
ok(!k1.ok && /Bereit/.test(k1.grund) && !A.spiel.starten(), `Start gesperrt: „${k1.grund}“`);
B.spiel.setzeBereit(true);
await lauf(1.5);
ok(A.spiel.startKlar().ok && A.spiel.zustand().mitglieder.every((m) => m.bereit && m.strecke), 'alle bereit, alle mit Strecke → Start frei');
A.spiel.setzeKi(2, 'locker');
await lauf(1);
ok(A.spiel.starten(), 'Gastgeber startet (2 KI)');
await lauf(SITZUNG.vorlauf / 1000 + 2);
ok(A.gestartet === 1 && B.gestartet === 1 && A.los != null && B.los != null && Math.abs(A.los - B.los) <= 50, `beide gestartet, „Los!“ ${Math.abs(A.los - B.los).toFixed(0)} ms auseinander`);
ok(B.race.assistKey === 'easy' && A.race.assistKey === 'original' && B.spiel.rennen.haerte.crash === Infinity, 'jeder mit eigener Stufe (Ben Leicht: weiche Rempler, nie Crash)');
const fertig = await lauf(V.apTime * 1.7 + 70, () => A.store.online.length && B.store.online.length);
const e = (G) => G.store.online[0];
ok(fertig && e(A).von === 4 && e(B).von === 4 && e(A).platz !== e(B).platz && e(A).t > 0 && e(B).t > 0 && A.store.best.solo === 1, `Zieltabelle → Liste „Online“: Peter Platz ${e(A) && e(A).platz}, Ben Platz ${e(B) && e(B).platz} von ${e(A) && e(A).von}; Solo-Bestzeiten unberührt`);
// Revanche: Gast wünscht, Gastgeber startet
B.spiel.revanche();
await lauf(1);
ok(A.spiel.revancheWunsch.has(B.spiel.S.sid), 'Revanche-Wunsch kommt beim Gastgeber an');
A.spiel.revanche();
await lauf(SITZUNG.vorlauf / 1000 + 2);
ok(A.gestartet === 2 && B.gestartet === 2 && B.laden === 1, 'Revanche: neuer Countdown auf beiden, gleiche Strecke (kein neues Laden)');
// zurück in die Lobby, neue Strecke
A.spiel.zurLobby();
A.env = { ...V2.env, layout: V2.layout, meta: { ...V2.layout.meta, apTime: V2.apTime } };
A.spiel.waehleAktuelleStrecke();
await lauf(3, () => B.laden === 2 && B.spiel.geladen === A.spiel.geladen);
ok(B.laden === 2 && Math.abs(B.env.track.line.total - V2.env.track.line.total) < 1e-6 && !A.spiel.startKlar().ok, `Gastgeber wählt neue Strecke → Gast lädt sie (${B.env.track.line.total.toFixed(0)} m); „Bereit“ wieder nötig`);
// Neu-Verbinden nach dem Hintergrund (6 s weg)
const nrVor = B.spiel.S.ich().nummer;
B.spiel.sichtbar(false);
N.wegreissen(B.t.id);
await lauf(6);
B.spiel.sichtbar(true);
await lauf(4, () => B.spiel.S.status === 'lobby' && A.spiel.zustand().mitglieder.length === 2);
ok(B.spiel.S.ich().nummer === nrVor && A.spiel.zustand().mitglieder.length === 2 && !B.spiel.S.istGastgeber && B.spiel.hinweise.some((h) => /neu/.test(h.text)), `Neu verbunden nach ${SPIEL.neuVerbindenAb / 1000}+ s Hintergrund: gleicher Platz (Nr. ${nrVor}), wieder in der Lobby`);
// Raum ohne Gastgeber
const C = geraet('c', 'medium', null); alle.push(C);
await C.spiel.beitreten('ZZZZ');
await lauf(SITZUNG.suchen / 1000 + 1);
ok(C.spiel.hinweise.some((h) => /Kein Raum ZZ-ZZ gefunden/.test(h.text)), 'Code ohne Raum: „Kein Raum ZZ-ZZ gefunden – … WLAN probieren“');

console.log(bad ? `${bad} FEHLER` : 'alle Online-Ablauf-Tests OK');
process.exit(bad ? 1 : 0);
