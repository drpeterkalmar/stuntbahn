// n35 Online-Menü: HTML-Bausteine (ui/online.js) ohne Browser – Start (Name, Code), Lobby Gastgeber/Gast (Code, QR,
// Mitglieder mit Stufe/Bereit/Ping/wackelt/lädt, KI-Auswahl begrenzt auf 6 Autos, Start gesperrt mit Grund), Zieltabelle,
// Escaping von Namen. Layout/Bedienung im Browser: Heavy-Job.
import { startHtml, lobbyHtml, ergebnisHtml, mitgliederHtml, esc } from '../../src/ui/online.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const has = (h, ...t) => t.every((x) => h.includes(x));

const s = startHtml('Pe<ter>', 'ABCD', [{ k: '11-2', n: 'Heulende Bahn', t: 78.03, p: 1, v: 4, d: '2026-10-18' }]);
ok(has(s, 'id="onname"', 'value="Pe&lt;ter&gt;"', 'data-a="onerstellen"', 'data-a="onbeitreten"', 'value="ABCD"', 'WLAN probieren', 'Deine letzten Online-Rennen', 'Heulende Bahn', '1./4', '1:18,03'), 'Start: Name (escaped), Raum erstellen, Code-Feld vorbelegt aus ?raum=, WLAN-Hinweis, Liste „Online“');
ok(!startHtml('', '').includes('letzten Online'), 'ohne Online-Rennen keine leere Liste');
const z = {
  aktiv: true, code: 'QRST', vorlesbar: 'QR-ST', link: 'https://drpeterkalmar.github.io/stuntbahn/?raum=QRST', gastgeber: true, phase: 'lobby', ich: 'a',
  einst: { ki: 2, staerke: 'profi', streckeName: 'Heulende Wirbelbahn', strecke: 'L1' }, geladen: 'L1', start: { ok: false, grund: 'warte auf „Bereit“ von Ben' },
  mitglieder: [
    { sid: 'a', name: 'Peter', stufe: 'original', bereit: true, host: true, ich: true, still: false, rtt: null, nummer: 1, strecke: true },
    { sid: 'b', name: 'Ben <b>', stufe: 'easy', bereit: false, host: false, ich: false, still: false, rtt: 73.4, nummer: 2, strecke: true },
    { sid: 'c', name: 'Cleo', stufe: 'medium', bereit: false, host: false, ich: false, still: true, rtt: 200, nummer: 3, strecke: false },
  ],
  hinweise: ['Cleo ist da'],
};
const h = lobbyHtml(z, { menueStrecke: 'Andere Bahn' });
ok(has(h, 'Raum <b>QR-ST</b>', '<svg', 'data-a="onteilen"', 'data-a="onkopie"', '👑 Peter', 'Ben &lt;b&gt;', '73 ms', '⚠️', '⏳', '🟢', '🔴'), 'Lobby: Code vorlesbar, QR, Teilen/Kopieren, Gastgeber-Krone, Ping, wackelt, lädt, Stufen-Symbole, Namen escaped');
ok(has(h, 'data-a="onki" data-v="3"') && !h.includes('data-v="4" class') && has(h, 'data-a="onstaerke"', 'class="big go aus"', 'warte auf „Bereit“ von Ben', '„Andere Bahn“ nehmen'), 'Gastgeber: KI bis 3 (3 Menschen + 3 = 6 Autos), Stärke, Start gesperrt mit Grund, Menü-Strecke übernehmen');
const g = lobbyHtml({ ...z, gastgeber: false, ich: 'b', mitglieder: z.mitglieder.map((m) => ({ ...m, ich: m.sid === 'b' })), laedt: true }, { qr: false });
ok(has(g, 'data-a="onbereit"', '✋ Bereit', '⏳ lädt', '+ 2 KI-Gegner (Profi)') && !g.includes('data-a="onstart"') && !g.includes('<svg'), 'Gast: Bereit-Knopf, Strecke lädt, KI-Info, kein Start');
const E = [{ id: 'b', platz: 1, name: 'Ben', zeit: 61.2 }, { id: 'a', platz: 2, name: 'Peter', zeit: 62.71 }, { id: 'ki-g1', platz: 3, name: 'Rita', zeit: 70, ki: true, daten: { hoch: true } }, { id: 'c', platz: 4, name: 'Cleo', zeit: null, weg: true }];
const e = ergebnisHtml(z, E, 'a');
ok(has(e, '1.</td><td>Ben', '+1,51', '🤖 Rita', '1:10,00*', 'weg', 'class="me"', 'data-a="onrevanche"', 'data-a="onlobby"', '* hochgerechnet'), 'Zieltabelle: Abstände, KI, hochgerechnet, weg, eigene Zeile, Revanche + Lobby (Gastgeber)');
ok(has(ergebnisHtml({ ...z, gastgeber: false }, null, 'b'), 'warte auf die anderen', 'Revanche wünschen'), 'Gast im Ziel vor der Tabelle: „warte auf die anderen“, Revanche wünschen');
ok(esc(`"<'&>`) === '&quot;&lt;&#39;&amp;&gt;' && mitgliederHtml({ mitglieder: [] }).includes('onlist'), 'Escaping');
console.log(bad ? `${bad} FEHLER` : 'alle Online-Menü-Tests OK');
process.exit(bad ? 1 : 0);
