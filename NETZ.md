# Netz-Schicht – Portierungs-Notiz (n35 Online-Mehrspieler)

`src/net/` ist **spielunabhängig**: reines JavaScript ohne Grafik, ohne DOM, ohne Spiel-Importe (läuft in Node und im
Browser). Sie ist für die Stuntbahn gebaut und für den geplanten **WipeOut-artigen Racer** gedacht: dort nur das
Zustands-Schema und den Spiel-Anschluss (Gegenstück zu `src/game/online.js`) neu schreiben. Kein eigener Server, keine
Konten, keine Schlüssel. Lizenz: eigener Code; Trystero (MIT) liegt gepinnt unter `vendor/trystero/`.
Stand: n35 (18.10.2026) – Node-geprüft und im Browser abgenommen (zwei Pages über BroadcastChannel und einmal echt über
Trystero/öffentliche Relays; Abbrüche, blockiertes Netz, Ping 0/50/150 ms gemessen – siehe `ONLINE_BERICHT.md`).

| Datei | Aufgabe |
|---|---|
| `net/code.js` | Raumcode (31 Zeichen ohne 0/O/1/I/L, 4 Stellen), tolerantes Eintippen, `?raum=`, Teilen-Link, „AB-CD“ |
| `net/paket.js` | Binär-Pakete nach Schema (f32, i16/i8/u8/u16 mit Skala, Quaternion „kleinste drei“ 7 Byte, Bits); Einzel- und Sammelpaket; Folgenummer mit Überlauf |
| `net/uhr.js` | Uhr-Abgleich (NTP-artig, Median der schnellsten Proben) gegen die Sitzungsuhr |
| `net/puffer.js` | Interpolations-Puffer je fremdem Körper: Hermite + Slerp, Extrapolation ≤ 250 ms, Fehler-Ausblendung, Sprungzähler, anpassender Verzug, optional Vorausrechnen |
| `net/sitzung.js` | Raum: Mitglieder, Gastgeber (Lobby, Start, Ziel-Bestätigung, Zieltabelle), Gastgeber-Wechsel, Neu-Verbinden, zuverlässige Meldungen über Quittung + Wiederholung, Zustände |
| `net/fake.js` | Nachgebautes Netz für Tests (virtuelle Zeit, Laufzeit, Schwankung, Verlust, Vertauschen, versetzte Uhren, Räume, blockierte Verbindung, Abbruch) |
| `net/bc.js` | Transport über BroadcastChannel (zwei Tabs im selben Browser; `?netz=bc`, künstlich `?netzlag=&netzjitter=&netzverlust=`) |
| `net/trystero.js` | Transport über Trystero (WebRTC): Nostr, nach 6 s ohne Partner zusätzlich MQTT, beide Räume zusammengeführt |
| `net/index.js` | Einstieg, `netzOptionen(location.search)`, `verbinden(code)` (lädt Trystero erst hier) |

## Transport (gemeinsame Schnittstelle)
```js
t.id                                   // eigene Peer-ID
t.senden(kanal, daten, ziel?)          // 'z' = Uint8Array (Zustände), 'm' = JSON (Meldungen); ziel: ID | [IDs] | alle
t.bei(kanal, fn(daten, vonId))
t.beiBeitritt(fn(id)); t.beiAbgang(fn(id)); t.beiFehler(fn({ art: 'p2p'|'relay', peer, text }))
t.peers(); t.verlassen()
```
Trystero 0.26.0 (im Quellcode geprüft): `joinRoom({ appId, password, relayConfig }, roomId, { onJoinError })`,
`room.makeAction(name) → { send(data, { target }), onMessage(data, { peerId }) }`, `onPeerJoin/onPeerLeave`. Nostr nimmt
**5 der 29 eingetragenen Relays** (gemischt nach appId – für `drpeterkalmar-stuntbahn-n35`: relay.aarpia.com,
bendernostur.duckdns.org:8443, cdn.satellite.earth, relay.piazza.today, nostr.chaima.info). **Die Stuntbahn nimmt 7**
(`RELAYS.nostr` in `net/trystero.js`): am 18.10.2026 waren zwei der fünf tot (abgelaufenes Zertifikat, Verbindung
zurückgesetzt) – die Suche lief über die übrigen drei in < 1 s. MQTT **alle 4 Broker**
(broker.emqx.io, public.cloud.shiftr.io, broker.hivemq.com, test.mosquitto.org). STUN: stun.l.google.com (3 Server) +
stun.cloudflare.com; **kein TURN**. Je Peer ein **zuverlässiger, geordneter** Datenkanal (Verlust zeigt sich als
Verspätung, nicht als Lücke). Verschlüsselt: Verbindungsdaten mit dem Raumcode als Passwort (AES-GCM), Datenkanal DTLS.
Vendoring: `python3 tools/vendor_trystero.py` (holt per `npm pack`, kein Bundler; nur Paket-Importe auf relative Pfade
umgeschrieben und `.mjs` → `.js`, damit jeder Server sie als Modul ausliefert), `--pruefen` vergleicht Prüfsummen
(`vendor/trystero/VERSION.json`). Größe 541 kB, davon MQTT.js 340 kB
(lädt nur, wenn Nostr nach 6 s niemanden findet).

## Sitzung
```js
import { Sitzung, schema, verbinden } from './net/index.js';
const S = new Sitzung(await verbinden(code), { sid, info: { name, … }, gastgeber: true|false, schema: MEIN_SCHEMA, lin: ['…'], einstellungen: {…},
  nameVon: (id) => …,                      // optional: Namen für Tabellen-Einträge, die die Sitzung nicht kennt (KI)
  rest: () => [{ id, fortschritt, ki, name }] });   // optional (Gastgeber): noch Fahrende für die Zieltabelle
S.on('lobby' | 'start' | 'ergebnis' | 'neu' | 'weg' | 'still' | 'gastgeber' | 'status' | 'fehler' | 'ereignis' | 'meldung', fn);
S.takt();                                  // je Bild bzw. alle ~50 ms (kein setTimeout im Kern → in Tests deterministisch)
S.setzeInfo({…}); S.setzeBereit(true);     // jeder
S.setzeEinstellungen({…}); S.starten(extra, kiIds); S.abschliessen(rest); S.zurLobby();   // nur Gastgeber
S.sendeZustand(satz); S.sendeSammel([{ platz, … }]);   // 20–30 Hz bzw. KI 15 Hz
S.lage(key, zeit, voraus);                 // fremder Körper (key 'pid:platz', S.fremdeListe())
S.zielMelden(zeit, daten); S.zielEintragen(id, zeit, daten);   // Ziel (Gastgeber bestätigt in Sitzungszeit)
S.aufgeben(daten);                         // ohne Zeit fertig (Tabelle wartet nicht), Gastgeber: seine KI endet
S.ereignis(art, daten); S.melden(art, daten, ziel);            // flüchtig (1,5 s) bzw. zuverlässig
S.neuVerbinden(neuerTransport); S.verlassen();
```
- **Sitzungsuhr** = Uhr des ersten Gastgebers; ein neuer Gastgeber führt sie mit seinem Versatz weiter (kein Sprung).
  Start: `startAt = jetzt + 3 s + größte Laufzeit`; jedes Gerät startet bei `zeit ≥ startAt`.
- **Rollen**: Lobby trägt Epoche `ep` (+1 je Gastgeber-Wechsel) und Version `v`; Vorrang: größere Epoche, dann kleinere
  Beitrittsnummer, dann kleinere sid. Geht der Gastgeber (geordnet oder Abbruch), übernimmt die kleinste anwesende Nummer.
  Wer zurückkommt, holt sich die Rolle nie zurück. Mitglieder über `sid` (feste Spieler-ID) erkannt → gleicher Platz.
- **Meldungen** `{ k, i, r }`: Quittung + Wiederholung alle 300 ms, Verfall 10 s, Doppel-Filter je Absender. Interne
  Arten: p/P (Uhr), hallo, lobby, ich, ziel, voll, ev, tschuess, ack – eigene Arten über `melden()`.
- **Zieltabelle**: Gastgeber, sobald alle (Menschen + laufende KI) im Ziel sind oder 45 s nach dem ersten Zieleinlauf;
  Verbindung weg = „weg“ am Ende.

## Zahlen (Node, `tests/node/test_netz*.mjs`)
- Uhr-Abgleich: Ping 150 ms ±40 je Richtung, Rückweg +30 %, 5 % Verlust → Fehler ≤ 13 ms; Start auf 3 Geräten
  (40 Zufalls-Netze, 150 ms ±60): Spanne max 33 ms, Mittel 12 ms (Grenze 50).
- Puffer: 20 Hz, 150 ms ±60, 5 % Verlust → Lage-Fehler zur gezeigten Zeit Mittel < 1 mm, keine Ruckler; Funkloch 0,3 s
  ohne Sprung (größter Satz 0,33 m), 0,6 s → einmal sichtbar aufholen. Verzug 100 ms (Ping ≤ 50) … 190 ms (150 ±60).
- Vorausrechnen (`abtasten(jetzt, 1)`, Stuntbahn-Standard): Autopilot-Fahrt, 25 Hz → gezeigtes Auto im Mittel 0,2 m
  (Ping 0–50) bzw. 0,4 m (150 ms) neben dem echten statt 3,0 m bzw. 4,8 m dahinter (`node tools/online_mess.mjs`).
- Last: Stuntbahn-Zustand 34 + 7 Byte, 25 Hz ≈ 1 kB/s je Auto und Empfänger (+ Trystero-Rahmen und Quittungen).

## Zahlen (Browser, zwei Pages in einem Chrome, 18.10.2026)
- Start: Soll-Zeitpunkt „Los!“ nach abgeglichener Sitzungsuhr auf beiden Seiten 0–1 ms auseinander, tatsächlicher
  Bildwechsel 2–14 ms (Bildraster); echt über Nostr ebenso. Partnersuche Nostr bzw. MQTT < 1,5 s.
- Gezeigt ↔ wahr (`tests/online_ping_mess.py`, Autopilot-Rennen, beide Seiten loggen je Bild mit gemeinsamer Systemuhr):
  Ping 0 / 50 / 150 ms → vorausgerechnet Mittel 0,4 / 0,4 / 0,7 m (p95 0,8 / 1,0 / 1,3 m), reiner Puffer 3,7 / 4,2 / 6,5 m
  (p95 5,5 / 6,4 / 9,8 m). Rempler-Meldung kommt beim anderen ½ Ping + Bild später an (4 / 22 / 104 ms).
- Puffer-Abtastung ≈ 1,9 µs (Mac, ungedrosselt; vor der Optimierung 4,6 µs).
- Gastgeber-Abbruch ohne Abmeldung (Funkloch): Nachfolger übernimmt nach 4,6 s (BroadcastChannel „still“ nach 4 s).

## Einbau in ein anderes Spiel (WipeOut)
1. Schema festlegen (`schema([...])`): Lage, Quaternion, Tempo genügen für Darstellung/Kollision; dazu, was die Anzeige
   braucht (Schub, Schild, Waffe …) und einen **Sprungzähler** (Respawn).
2. Spiel-Anschluss wie `src/game/online.js`: Raster aus der Beitrittsnummer, `frame()` (Countdown/Rennuhr nach
   `S.zeit`), je Physikschritt fremde Körper aus `S.lage(...)` als **feste** Körper in die eigene Kollision (jedes Gerät
   rechnet nur die eigene Reaktion), Rempler-Ereignis an die Gegenseite (dort Funken/Ton und – hat sie den Stoß selbst
   nicht erkannt – ein sanfter Gegenstoß, `ONLINE.rempler.gegen`), Zustand senden, Ziel melden.
3. Ablauf/Lobby wie `src/game/onlinespiel.js` (Strecke als Daten, „Bereit“, Revanche, Hintergrund → `neuVerbinden`).
4. KI rechnet nur der Gastgeber (`sendeSammel`, Plätze ≥ 1); beim Gastgeber-Wechsel fährt sie nicht weiter (`kiAktiv`).
- **WipeOut-Unterschiede**: viel höheres Tempo → Vorausrechnen (`voraus = 1`) ist dort Pflicht; Waffen/Treffer als
  zuverlässige Meldung mit Zeitstempel (`melden`), Treffer entscheidet der Getroffene (wie die Kollision: jedes Gerät
  rechnet sein Fahrzeug); Sammelpakete für Waffen-Geschosse nur, wenn sie lange fliegen.

## Grenzen (ehrlich)
- **Kein TURN**: Manche Mobilfunk-/Firmennetze (symmetrisches NAT) erlauben keine direkte Verbindung → Meldung nach
  Trystero-`onJoinError` bzw. 10 s ohne Raum: „Verbindung zu X nicht möglich (Netz blockiert direkte Verbindung) – WLAN
  probieren“. Ein TURN-Server bräuchte Betrieb/Schlüssel (bewusst nicht).
- **Schummeln möglich**: Jedes Gerät meldet seine Lage und Zielzeit selbst (P2P, kein Schiedsrichter). Der Gastgeber
  prüft nur den Zeitstempel (nicht nach dem Eintreffen) – gegen Freunde gedacht, nicht für Ranglisten.
- **Öffentliche Relays** können ausfallen oder drosseln (Ausweich MQTT); die Partnersuche dauert meist 1–5 s.
- **Gastgeber-Wechsel im Rennen**: KI verschwindet (ihr Zustand lag beim alten Gastgeber).
- **Test-Mac hinter VPN** (ProtonVPN): Chrome sammelt ohne Kamera/Mikrofon-Erlaubnis nur Kandidaten der VPN-Schnittstelle,
  dort kommt UDP an sich selbst nicht zurück – zwei Tabs auf demselben Mac verbinden sich dann nicht (genau der Fall
  „Netz blockiert“, `tests/test_online_blockiert.py`). Für den echten Test gibt `ECHT=1 tests/test_online_ui.py` eine
  Schein-Mikrofon-Erlaubnis (dann nimmt Chrome alle Schnittstellen, Verbindung über die WLAN-Adresse). Das Spiel selbst
  fragt nie nach Kamera/Mikrofon.
- Datenkanal zuverlässig/geordnet: bei Paketverlust kommen Zustände gebündelt spät – der Puffer (Verzug ≥ 100 ms) fängt
  das ab; ein unzuverlässiger Kanal (WebRTC `maxRetransmits: 0`) wäre besser, bietet Trystero 0.26 aber nicht an.

## Prüfung
`node tests/node/test_netz.mjs` (Code, Pakete, Uhr, Puffer), `test_netz_sitzung.mjs` (Lobby, Start, Ziel, Wechsel,
Abbruch, Neu-Verbinden, 12 Zufalls-Netze), `test_netz_transport.mjs` (Trystero mit nachgebautem joinRoom, vendor lädt,
BroadcastChannel echt), Stuntbahn: `test_online.mjs` (zwei Autopilot-Rennen + KI über das Fake-Netz, Mess-Probe),
`test_onlinespiel.mjs` (ganzer Ablauf), `test_online_ui.mjs` (Lobby-HTML), `test_qr.mjs` (QR, Rücklesen mit zbarimg).
Browser (immer EIN Browser, mehrere Pages): `python3 tests/test_online_ui.py` (zwei Pages, BroadcastChannel; `ECHT=1`
über Relays), `test_online_abbruch.py` (Tab zu, Gastgeber reißt ab, Neu-Laden, Hintergrund), `test_online_blockiert.py`
(Netz blockiert direkte Verbindung), `test_online_extras.py` (Kurzrufe, Aufgeben), Messungen `online_ping_mess.py`
(Ping 0/50/150 ms: Abstand gezeigt↔wahr, Rempler), `online_echt_probe.py` (nur Transport über Relays),
`online_profil.py` (CPU-Profil); Mess-Gate `tests/perf_szenen_online.json` (`?onlineprobe=3&probeart=linie&probeplatz=hinten&probeabstand=10` = 3 Mitspieler dicht vor dir, ungünstigster Fall; Ergebnis in ONLINE_BERICHT.md).
