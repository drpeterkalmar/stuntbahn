# Vorbau n35 Online-Mehrspieler – Übergabe an den Heavy-Job `stuntbahn-n35-online`

Leicht-Spur, 18.10.2026. Branch `vorbau/stuntbahn-n35-online` (auf `origin/main` 7e683ab, 11 Commits, alles gepusht; main
unberührt). **Nichts davon lief im Browser** – kein Server, kein Playwright, keine Bundler. Alles Neue ist hinter Reglern;
ohne `?online=1`/`?raum=` sieht und rechnet das Spiel wie bisher (Solo-Pfad nur um `if (onlR)`-Zweige erweitert).

## Regler (alle neu)
| Regler | Standard | Wirkung |
|---|---|---|
| `?online=1` | aus (`ONLINE_STANDARD = false` in `src/game/online.js`) | Menü-Knopf „👥 Online“. **Nach der Abnahme auf `true` stellen.** |
| `?raum=CODE` | – | Teilen-Link: öffnet die Beitreten-Ansicht mit Code (zeigt das Menü auch ohne `?online=1`) |
| `?netz=` | `auto` | `bc` = BroadcastChannel (zwei Tabs, Test), `nostr`, `mqtt`, `beide`; auto = Nostr, nach 6 s ohne Partner + MQTT |
| `?netzlag=&netzjitter=&netzverlust=` | 0 | nur `netz=bc`: künstliche Laufzeit je Richtung (ms), Schwankung (ms), Verlust (0…0,5) |
| `?netzvoraus=0` | 1 | fremde Autos **nicht** vorausrechnen (reiner Puffer wie im Brief, ~100 ms zurück) |
| `?onlineprobe=N` | – | Mess-Probe: `__game.start()` fährt online gegen N (1–3) Attrappen im selben Tab |

## Etappe 1 – Trystero gepinnt + vendort ✅
- **Dateien:** `vendor/trystero/` (Trystero **0.26.0** = `@trystero-p2p/core|nostr|mqtt` 0.26.0, `@noble/secp256k1` 3.2.0,
  MQTT.js 5.16.1; 541 kB, davon MQTT 340 kB), `tools/vendor_trystero.py` (`npm pack`, Paket-Importe → relative Pfade,
  `.mjs` → `.js`, Prüfsummen in `VERSION.json`, `--pruefen`), Lizenzen in `assets/LICENSES.md` + Credits (`ui.js`).
- **Quellcode geprüft:** Nostr nutzt 5 der 29 Relays (Auswahl nach appId `drpeterkalmar-stuntbahn-n35`: relay.aarpia.com,
  bendernostur.duckdns.org:8443, cdn.satellite.earth, relay.piazza.today, nostr.chaima.info), MQTT alle 4 Broker
  (emqx, shiftr, hivemq, mosquitto), STUN Google ×3 + Cloudflare, **kein TURN**, ein zuverlässiger + geordneter Datenkanal
  je Peer, SDP mit Raumcode-Passwort verschlüsselt. API 0.26 ist objektbasiert (`makeAction(...).send/onMessage`), nicht
  mehr `[send, get]` – im Anschluss berücksichtigt.
- **Geprüft:** Node lädt `vendor/trystero/nostr.js` (joinRoom, selfId, 29 Relays), `--pruefen` grün.
- **Heavy:** echter Relay-Test (`ECHT=1`), Konsole auf Relay-Warnungen prüfen; `tools/update_sw.py` nimmt `vendor/` NICHT
  in den Precache (Absicht: nur Online-Spieler laden es; der SW cacht es beim ersten Laden) – so lassen oder ergänzen.

## Etappe 2 – Netz-Schicht `src/net/` (spielunabhängig) ✅
- **Dateien:** `code.js` (Raumcode 4 Zeichen ohne 0/O/1/I/L), `paket.js` (Binär-Schema), `uhr.js`, `puffer.js`,
  `sitzung.js`, `fake.js`, `bc.js`, `trystero.js`, `index.js`; Port-Notiz **`NETZ.md`** (fertig, gern nachschärfen).
- **Geprüft (Node, je < 2 s):** `test_netz.mjs` (Code, Pakete ±0,1 mm/0,003°, Uhr bei Ping 0/50/150/300 ms mit
  Schwankung, Asymmetrie, 5 % Verlust: ≤ 13 ms bei 150 ms; Puffer glatt/genau bei 0/50/150 ms ±60, Funkloch, Reset,
  10 Hz, Vorausrechnen), `test_netz_sitzung.mjs` (Lobby, voll, Start ±50 ms – 12 Zufalls-Netze max 24 ms, Ziel vom
  Gastgeber bestätigt, gleiche Tabelle, Revanche, KI-Einträge, Gastgeber geht geordnet/abrupt → Nr. 2 übernimmt ohne
  Uhr-Sprung, Ziel nachgemeldet, Gast weg mit „still“-Vorwarnung, Neu-Verbinden gleicher Platz, alter Gastgeber bleibt
  Gast, Raum nicht gefunden, P2P blockiert, zwei Gastgeber), `test_netz_transport.mjs` (Trystero-Anschluss mit
  nachgebautem joinRoom: Nostr/MQTT zusammengeführt, Ausweich nach 6 s, Fehler p2p; BroadcastChannel echt in Node).
- **Abgestimmt:** `UHR` (Fenster 24, beste 20 %, Takt 300 ms) aus 40 Zufalls-Netzen 150 ms ±60: Start-Spanne max 33 ms.
- **Risiko:** Trystero-`onPeerLeave` kommt bei Funkloch evtl. erst nach ICE-Timeout (5–30 s) – deshalb „still“ nach 3 s.

## Etappe 3 – Online-Rennen `src/game/online.js` ✅ (Node), Browser offen
- **Inhalt:** Zustand 34 Byte (Lage, Quaternion, Tempo, Lenkung, Gas, Nitro, Bits crash/luft/bremse/ziel/geist/hupf,
  Sprungzähler, Fortschritt) mit 25 Hz, KI 15 Hz als Sammelpaket; Raster Menschen nach Beitrittsnummer, KI dahinter;
  Countdown nach Sitzungsuhr (`race.countdown = min(…, soll)`); Rennuhr nur vorwärts an die Sitzungsuhr gezogen;
  `FremdAuto` = fester Körper für `autoauto.stoss(…, { festB: true })` (eigene Härte je Stufe: Leicht nie Crash),
  Rempler-Ereignis an die Gegenseite (Funken/Ton), Geist 1,5 s nach Reset, Rangliste (`rennfeld.js`) fürs HUD, Ziel an
  den Gastgeber, KI vom Gastgeber (`kiFeld`, Haken in `ai/gegner.js`: `online`, `rasterN/plaetze/spielerPlatz`, `fremde`,
  `sichtPunkte`, `resets` – Standard unverändert, `test_gegner.mjs` grün). Vorausrechnen (Standard an, s. u.).
- **Geprüft:** `test_online.mjs` – zwei echte Autopilot-Rennen + 2 KI über das Fake-Netz bei 0 und 150 ms ±30 / 5 %
  Verlust: Raster, „Los!“ 0/8 ms, Peter sieht Ben, Ben sieht Peter + 2 KI, keine NaN, gleiche Zieltabelle mit KI-Namen,
  Zeiten ≈ Autopilot; Gastgeber reißt ab → Ben wird Gastgeber, KI/Peter verschwinden, Ben fährt allein zu Ende; Strecke als
  Daten (Gelände-Layout 3,3 kB, .TRK 2,4 kB Base64); Mess-Probe. Laufzeit 4 s.
- **Messung für den Bericht** (`node tools/online_mess.mjs`, Autopilot 108 km/h, 25 Hz, 5 % Verlust): gezeigtes fremdes
  Auto hinter dem echten **3,0 m (Ping 0–50), 4,8 m (150 ms), 7,5 m (300 ms)** im Mittel; **vorausgerechnet 0,2 / 0,4 /
  0,8 m**. Deshalb `ONLINE.voraus = 1` (Anzeige UND Kollision dort, wo das Auto wirklich ist) – weicht vom Brief („Puffer
  ~100 ms interpolieren“) ab; `?netzvoraus=0` = Brief-Verhalten. **Im Browser beurteilen:** Überschießen bei Vollbremsung/
  Crash (≤ Tempo × Verzug), Rempeln bei 50/150 ms (`?netz=bc&netzlag=25` bzw. `=75`).
- **Ehrlich zu beschreiben (Bericht):** Jedes Gerät stößt nur sein Auto ab; bei Ping sieht man den Stoß nicht immer
  gleichzeitig (ohne Vorausrechnen bis 5 m versetzt – „Rempler aus dem Nichts“), das Ereignis gleicht Funken/Ton ab.

## Etappe 4 – Ablauf `src/game/onlinespiel.js`, Strecke als Daten, Speicher, QR ✅ (Node)
- **Inhalt:** Raum erstellen/beitreten (Code tolerant: „qr-st“), Name + feste Spieler-ID (`store.spielerId()` + Tab-Kennung
  aus sessionStorage → zwei Tabs = zwei Spieler), Gastgeber: Strecke aus dem Menü übernehmen (`onlinestrecke.js`: Zufall/
  3D/Gelände als Layout, Sammlung/Beispiel als Kennung, eigene .TRK als Bytes), Landschaft/Wetter/Tageszeit gehen mit
  (`ONLINE_LOOK` in main.js), KI 0…(6 − Menschen) + Stärke, Start erst wenn alle die Strecke haben + „Bereit“, Revanche
  (Gast wünscht, Gastgeber startet), zurück zur Lobby, Hintergrund > 4 s → neu verbinden. Liste „Online“ im Speicher
  (`store.submitOnline/onlineBest`, Solo-Bestzeiten unberührt). QR: eigener Kodierer `src/ui/qr.js` (Version 1–6, L–H).
- **Geprüft:** `test_onlinespiel.mjs` (ganzer Ablauf mit nachgebautem app bei 150 ms/5 %), `test_qr.mjs` (Reed-Solomon
  „HELLO WORLD“, Format-Bits, **13/13 Codes mit zbarimg zurückgelesen**, PNG via `tests/qr_png.py`).
- **Heavy:** QR mit echtem Handy scannen (Vision/Kamera), `navigator.share` am Handy.

## Etappe 5 – Lobby-Grundgerüst + Einbau ins Spiel (Browser offen) ⚠️
- **Dateien:** `src/ui/online.js` (HTML-Bausteine + `OnlineAnsicht`), `css/style.css` (Block „n35 Online-Menü“),
  `src/ui/ui.js` (Knopf „👥 Online“/„👥 Lobby AB-CD“ neben „🏁 Gegner“, Aktionen `on…`, `sheet(…, zurueck)`, HUD
  „Online-Beste“), `src/game/input.js` (Tippen in Eingabefeldern löst keine Spieltasten aus), `src/main.js`
  (`onlineLaden` lädt Ablauf/Anzeige/Netz erst beim ersten Öffnen; `startOnlineRace`, Schleife: `onl.takt()`, `onlR.frame()`
  vor, `onlR.schritt(DT)` je Physikschritt, `onlineNachFrame()` vor `handleEvents`; fremde Autos über `gegnerVis` mit
  `onlVis`; Minikarte; Ziel → Zielshow → gemeinsame Tabelle statt Film/Solo-Ergebnis; kein Pausieren online;
  `__game.online` als Test-Haken).
- **Geprüft:** nur `node --check` und `test_online_ui.mjs` (HTML: Code, QR, Mitglieder mit Stufe/Ping/wackelt/lädt,
  KI-Grenze, Start-Sperre mit Grund, Zieltabelle, Escaping, Liste „Online“).
- **Heavy muss im Browser abnehmen** (`python3 tests/test_online_ui.py`, EIN Browser, zwei Pages, BroadcastChannel; dann
  `ECHT=1` über Relays): Menü/Lobby hoch + quer (Knöpfe ≥ 48 px, Handy-Tastatur verdeckt das Code-Feld nicht), Strecke kommt
  beim Gast an und wird gebaut (ohne Ladebildschirm – Lobby zeigt „⏳ lädt“; prüfen, dass das Bauen das Menü nicht stört),
  Countdown/Ampel synchron, Namensschilder mit Stufen-Symbol (Emoji im Canvas), Platz im HUD, Minikarten-Punkte, Rempler-
  Funken, Zielshow → Tabelle, Revanche aus der Tabelle, „Zurück“-Wege (Lobby ↔ Menü ↔ Rennen), Tab schließen = „weg“,
  Gastgeber-Tab schließen mitten im Rennen, Neu-Laden eines Tabs (gleicher Platz).
  Screenshots nach `tests/shots/n35/` (Skript legt Lobby, Startaufstellung, Zweikampf, Zieltabelle an).
- **Bekannte Lücken/Risiken:** `test_online_ui.py` ist ungetestet (Wartezeiten/Selektoren ggf. anpassen; Zwei-Pages-
  Drosselung per Chrome-Flags abgeschaltet). Hochformat-Layout der Lobby ungeprüft. Zieltabelle erscheint bei Gästen,
  deren Zielshow noch läuft, erst danach (Absicht). Beim Gast wird die Strecke auch gebaut, wenn er gerade im Solo-Rennen
  ist (→ `toMenu()` vorher).

## Etappe 6 – Mess-Gate vorbereitet (nicht gemessen)
- `src/game/onlineprobe.js` + `?onlineprobe=N`: ganzer Online-Pfad gegen N Attrappen (KI-Physik + Pakete über Fake-Netz
  20 ± 5 ms) in EINEM Tab – obere Schranke; `tests/perf_szenen_online.json` (start_/mitte_ × kino/standard/einfach; mitte
  wartet 25 s echt, weil `__game.sim` die Sitzungsuhr überholt). Aufruf im `_kommentar`:
  `--ab solo= --ab g3=&gegner=3 --ab on3=&onlineprobe=3`. Gate: on3 ≤ solo × 1,15 (p95); Online-Anteil ≈ on3 − g3.
- **Heavy:** Vorher-Messung auf main (solo) VOR dem Merge, dann die drei Varianten auf dem Branch.

## Entscheidungen (Peter kann sie ändern)
- Gemeinsames Spieltempo im Online-Rennen = Gastgeber-Einstellung `tempo`, Standard **1,25** (`GAME_SPEED_STD`; Mittel fährt
  solo 1,0 – online also etwas schneller). Ohne gemeinsames Tempo liefen die Welten verschieden schnell.
- Online immer **Totalschaden aus** (Reset kostet Zeit, Rückspulen nie Zeit zurück); **kein Pausieren**; kein Geist.
- KI online **ohne Gummiband** (hinge nur am Gastgeber), Rückspulen des Gastgebers spult die KI nicht mit; Gastgeber-
  Wechsel → KI fährt nicht weiter.
- Zieltabelle: wenn alle (Menschen + KI) im Ziel sind, spätestens 45 s nach dem ersten.
- Fremde Autos vorausgerechnet (s. Etappe 3).

## Nicht angefangen (und warum)
- **Runden > 1:** Rennen/KI/Ziel sind in der Stuntbahn auf eine Runde gebaut (GEGNER.md) – Einstellung fehlt bewusst.
- **Emojis/Kurzrufe (optional):** Leitung fertig (`OnlineRennen.emoji(e)`, Empfang → Hinweis), aber kein HUD-Knopf (Lage im
  HUD nur im Browser sinnvoll zu wählen).
- **Schaden übers Netz:** fremde Autos immer heil (`packen(S)` aus n34 wäre die Leitung, braucht Browser-Abnahme der Optik).
- **Zuschauer/Einstieg mitten im Rennen:** wer während eines Rennens beitritt, wartet auf das nächste (Hinweis).
- **Bericht `ONLINE_BERICHT.md`, README „Mit Freunden fahren“, Version/Service-Worker, Live-Check:** Heavy-Job (Daten oben,
  README-Vorschlag unten).

## README-Vorschlag „Mit Freunden fahren“ (nach der Abnahme einfügen)
> **Mit Freunden fahren (👥 Online, 2–4 Spieler):** Einer tippt „👥 Online“ → Namen → „Raum erstellen“ und teilt den Link
> (📤) oder zeigt den QR-Code; die anderen öffnen den Link oder tippen den 4-stelligen Code bei „Beitreten“. Der Gastgeber
> wählt Strecke, Landschaft und KI-Gegner, jeder seine Fahrhilfe; „Bereit“ – Start. Kein Konto, kein Server: die Autos
> fahren direkt von Gerät zu Gerät (WebRTC, Partnersuche über öffentliche Relays). Manche Mobilfunk-/Firmennetze blockieren
> direkte Verbindungen – dann WLAN nehmen. Online-Zeiten stehen in einer eigenen Liste, nicht bei den Bestzeiten.

## An Peter (Vorschlag für die Abschlussmeldung): mit zwei Handys testen
1. Handy A: Stuntbahn öffnen → „👥 Online“ → Namen eingeben → „Raum erstellen“.
2. Handy B: den Link von A öffnen (📤 teilen, z. B. per WhatsApp) oder den QR-Code scannen bzw. den Code bei „Beitreten“ eintippen.
3. B tippt „✋ Bereit“, A „▶ Rennen starten“. Klappt keine Verbindung: beide Handys ins WLAN.

## Tests (alle Node, zusammen ~15 s; in `tests/node/run_all.mjs` eingetragen)
`test_netz.mjs` · `test_netz_sitzung.mjs` · `test_netz_transport.mjs` · `test_online.mjs` · `test_onlinespiel.mjs` ·
`test_qr.mjs` (nutzt `zbarimg` + PIL, falls da) · `test_online_ui.mjs` – dazu weiter grün: `test_gegner.mjs`,
`test_autoauto.mjs`. Messung: `node tools/online_mess.mjs [seed] [stufe]`. Browser (Heavy): `tests/test_online_ui.py`.
