# n35 – Online-Mehrspieler (2–4 Spieler, ohne eigenen Server) – Bericht

Peter 08.10.2026: „stuntbahn mit optionalem multiplayer“ – und danach soll auf derselben Grundlage ein WipeOut-artiger
Racer entstehen. Ergebnis: **„👥 Online“ ist im Menü (Standard an, Version 0.11.0)**; die Netz-Schicht `src/net/` ist
spielunabhängig, die Port-Notiz steht in `NETZ.md`. Kein eigener Server, keine Konten, keine Schlüssel: Partnersuche über
öffentliche Relays (Trystero 0.26.0, Nostr, Ausweich MQTT), Spieldaten direkt und verschlüsselt von Gerät zu Gerät (WebRTC).

## Mit zwei Handys testen (3 Schritte)
1. **Handy A:** https://drpeterkalmar.github.io/stuntbahn/ → **„👥 Online“** → Namen eingeben → **„➕ Raum erstellen“**.
2. **Handy B:** den Link von A öffnen (A tippt **📤 Link teilen**, z. B. per WhatsApp) **oder** den QR-Code mit der Kamera
   scannen **oder** bei „Beitreten“ den 4-stelligen Code eintippen.
3. B tippt **„✋ Bereit“**, A **„▶ Rennen starten“**. Klappt keine Verbindung (Meldung nach ~10 s): beide Handys ins WLAN.

## Ablauf in der Arbeit
- **Vorbau (Leicht-Spur, ohne Browser)** lag auf `vorbau/stuntbahn-n35-online` (11 Commits): Trystero gepinnt + vendort,
  Netz-Schicht mit Node-Tests, Online-Rennen, Ablauf, Lobby-Grundgerüst, QR-Kodierer, Mess-Probe, `NETZ.md`.
  **Merge ohne Konflikte** (`--no-ff`, main unverändert seit 7e683ab). Die Übergabe-Notiz ist in diesen Bericht
  eingearbeitet (Abschnitte „Was der Vorbau gebaut hat“, „Entscheidungen“) und aus dem Repo entfernt; der Branch ist gelöscht.
- **Abnahme im Browser** (immer EIN Playwright-Browser, stumm, mehrere Pages = Spieler), Etappe für Etappe gepusht:
  1. zwei Pages über BroadcastChannel (Lobby, Strecke als Daten, Start, Rennen, Zieltabelle, Revanche) + Lobby-Umbau,
  2. **echt über Trystero und öffentliche Relays** + ehrliche Meldung bei blockiertem Netz,
  3. Abbrüche (Tab zu, Gastgeber reißt ab, Neu-Laden, Hintergrund) + Ping-Messung + Gegenstoß + schnellerer Puffer,
  4. Kurzrufe 💬, Aufgeben ⏸, Online Standard an, Mess-Gate, Bericht.

## Was der Vorbau gebaut hat (und was die Abnahme geändert hat)
| Teil | Vorbau | Abnahme / Änderung |
|---|---|---|
| Trystero 0.26.0 (`vendor/trystero/`, 541 kB, MQTT 340 kB nur bei Bedarf) | gepinnt, Prüfsummen, Lizenzen | **7 statt 5 Nostr-Relays** (2 von 5 waren am 18.10. tot); `vendor/` im Service-Worker-Hash |
| Netz-Schicht `src/net/` | Code, Pakete, Uhr, Puffer, Sitzung, Fake/BroadcastChannel/Trystero | Puffer 2,4× schneller; `Sitzung.aufgeben()`; `nameVon` für Tabellen-Namen |
| Online-Rennen `game/online.js` | 25 Hz/34 Byte, feste fremde Körper, Rempler, Rangliste, KI vom Gastgeber, Vorausrechnen | Räder fremder Autos richtig eingefedert; **Gegenstoß**; Aufgeben; Online Standard an |
| Ablauf `game/onlinespiel.js` | Raum, Strecke als Daten, Bereit, Revanche, Neu-Verbinden, Liste „Online“ | Aussehen-Änderung des Gastgebers geht live an alle; Meldung „Netz blockiert“ statt „Kein Raum“ |
| Lobby `ui/online.js` | Grundgerüst (eine Spalte) | **quer zweispaltig** (Code/QR/Teilen links, Mitglieder + Start rechts, ohne Scrollen), **Landschaft/Wetter/Tageszeit** in der Lobby, „Nochmal versuchen“ ohne Verbindung, Online-Pause, Kurzrufe |
| Teilen-Link | ganze Adresse + `raum=` | nur `?raum=CODE` (kleinerer QR-Code; Test-Regler `netz*`/`nosw` bleiben) |
| Pause online | Hinweis „kein Pausieren“ (man kam nicht aus dem Rennen) | ⏸/Esc = „▶ Weiterfahren / 🏳️ Aufgeben – zur Lobby“; Drehen des Handys öffnet online nichts |
| Kurzrufe (optional) | Leitung `OnlineRennen.emoji()`, Anzeige als Hinweis | 💬-Knopf, Leiste links daneben (überdeckt keine Fahrknöpfe), Emoji ~2,5 s über dem Auto |

**Fehler, die erst im Browser auffielen (behoben):** Beim Gast blieb das Lobby-Blatt über dem laufenden Rennen liegen
(ein verspätetes Nachzeichnen 50 ms nach „Bereit“ kam nach dem Start) – das Rennen lief verdeckt weiter; jetzt zeigt sich
die Lobby nie über einem Online-Rennen (`test_online_extras.py` prüft das). Die Zieltabelle nach einem Gastgeber-Wechsel
zeigte die KI des alten Gastgebers als „🤖 ?“ (jetzt mit Namen). Zieltabelle/Lobby lagen im Rennen unter den HUD-Knöpfen.
Die Räder fremder Autos saßen 8 cm zu hoch in den Radkästen.

## Prüfung – Ergebnisse
**Node** (alle in `tests/node/run_all.mjs`, ganze Suite grün): `test_netz.mjs` (Code, Pakete, Uhr bei Ping 0/50/150/300 ms
mit Schwankung + 5 % Verlust ≤ 13 ms, Puffer glatt), `test_netz_sitzung.mjs` (Lobby, Start ±50 ms – 12 Zufalls-Netze max
24 ms, Ziel vom Gastgeber bestätigt, gleiche Tabelle, Gastgeber-Wechsel geordnet/abrupt, Abbruch, Neu-Verbinden, **Aufgeben**,
KI-Namen nach Wechsel), `test_netz_transport.mjs`, `test_online.mjs` (zwei Autopilot-Rennen + KI über das Fake-Netz bei 0 und
150 ms ±30 / 5 % Verlust, **Gegenstoß**), `test_onlinespiel.mjs`, `test_qr.mjs` (13/13 Codes mit zbarimg zurückgelesen),
`test_online_ui.mjs`.

**Browser** (Pixel-7-Profil, je zwei bzw. drei Pages in einem Chrome, 0 JS-Fehler):
| Test | Ergebnis |
|---|---|
| `tests/test_online_ui.py` (BroadcastChannel) | Raum → Code (4 Zeichen, vorlesbar „MC-KR“) + Link + QR (aus dem Screenshot mit zbarimg lesbar); B öffnet den Link → Beitreten-Ansicht mit Code; Strecke als Daten gebaut, gleiche Länge; Regen aus der Lobby kommt beim Gast an; Start-Knopf quer ohne Scrollen, Knöpfe ≥ 48 px; **„Los!“: Soll nach Sitzungsuhr 0–1 ms, tatsächlicher Bildwechsel 2–14 ms auseinander** (Grenze ±50); B sieht Peter + 2 KI, HUD „Platz 2/4 ▲ Peter +0,5 s“; gleiche Zieltabelle auf beiden; Liste „Online“, Solo-Bestzeiten unberührt; Revanche |
| `ECHT=1 tests/test_online_ui.py` (**Trystero, öffentliche Nostr-Relays**) | alles wie oben grün, Partnersuche < 1 s, Start 0 / 14 ms |
| `tests/online_echt_probe.py nostr|mqtt` | Beitritt + erste Nachricht über Nostr 0,7–0,8 s, über MQTT 1,1–1,2 s |
| `tests/test_online_blockiert.py` (Netz blockiert direkte Verbindung) | Gast nach **10 s**: „Verbindung zu Raum XY nicht möglich (Netz blockiert direkte Verbindung) – WLAN probieren.“ + „🔄 Nochmal versuchen“; Gastgeber nach 16 s: „Verbindung zu einem Mitspieler nicht möglich …“ |
| `tests/test_online_abbruch.py` (3 Spieler + KI) | Tab zu → „Cleo ist weg“ bei allen, Auto weg; **Gastgeber reißt ab** (Funkloch, keine Abmeldung) → B nach 4,6 s Gastgeber, „Du bist jetzt Gastgeber“, A + KI weg, B fährt zu Ende, Tabelle mit „weg“; Neu-Laden eines Tabs → gleicher Platz, keine Doppelung; 5 s Hintergrund → „Verbinde neu …“, wieder in der Lobby, Start frei |
| `tests/test_online_extras.py` | 💬-Leiste (6 Rufe, je 52 px), 👍 erscheint über Peters Auto bei Ben und über dem eigenen Auto, nach 2,5 s weg; ⏸/Esc online = „Weiterfahren / Aufgeben“, Zeit läuft weiter; Aufgeben → Auto beim anderen sofort weg + „🏳️ Ben hat aufgegeben“, Tabelle ohne 45-s-Warten mit „🏳️ aufgegeben“; Menü mit „👥 Online“ hoch/quer |
| `tests/smoke.py` (Solo) | unverändert, 0 Fehler |

Screenshots (selbst angesehen; Collagen in `tests/shots/n35/`): Lobby Gastgeber hoch/quer, Lobby Gast, Startaufstellung
(Gast-Sicht: Peter links neben dem eigenen Auto, Schild „1 Peter 🔴“), Zweikampf hoch/quer, Zieltabelle hoch/quer, Abbrüche,
blockiertes Netz, Kurzruf, Online-Pause, Aufgeben.

## Ping-Verhalten (gemessen, `tests/online_ping_mess.py`)
Zwei Pages, künstliche Laufzeit je Richtung 0 / 25 / 75 ms (= Ping 0 / 50 / 150 ms, Schwankung ±10 / ±30 ms, 2 % Verlust).
Beide Seiten schreiben je Bild ihre wahre Lage und die gezeigte Lage des anderen mit (gemeinsame Systemuhr):

| Ping | gezeigt ↔ wahr, **vorausgerechnet** (Standard) | gezeigt ↔ wahr, nur Puffer (~100 ms, Brief) | Rempler-Meldung beim anderen |
|---|---|---|---|
| 0 ms | Mittel 0,4 m, p95 0,8 m | 3,7 m, p95 5,5 m | + 4 ms |
| 50 ms | 0,4 m, p95 1,0 m | 4,2 m, p95 6,4 m | + 22 ms |
| 150 ms | 0,7 m, p95 1,3 m | 6,5 m, p95 9,8 m | + 104 ms |

**Wie es sich anfühlt:**
- **Eigenes Auto:** immer verzögerungsfrei (jedes Gerät rechnet sein Auto selbst) – unabhängig vom Ping.
- **Fremde Autos** laufen glatt (Hermite-Interpolation, Lücken bis 250 ms werden weitergerechnet, Korrekturen in 0,2 s
  ausgeblendet). Der Brief sah „Puffer ~100 ms“ vor – dann fährt das fremde Auto **3,7–6,5 m hinter** seiner wahren Lage:
  Wer daneben fährt, sieht den anderen zurückhängen, und ein Rempler kommt „aus dem Nichts“. Deshalb ist **Vorausrechnen
  Standard** (um den Verzug nach vorn, mit geglättetem Tempo): bei 50 ms Ping liegt das gezeigte Auto im Mittel 0,4 m
  daneben, bei 150 ms 0,7 m. Preis: bei einer Vollbremsung oder einem Crash schießt das gezeigte Auto kurz über (höchstens
  Tempo × Verzug, z. B. 42 m/s × 0,1 s ≈ 4 m) und wird in 0,2 s zurückgeholt. `?netzvoraus=0` = Brief-Verhalten.
- **Rempler bei 50 ms:** Stoß und Funken praktisch gleichzeitig auf beiden Geräten (Meldung 22 ms später = gut ein Bild).
  Meist erkennt nur **ein** Gerät die Berührung (jedes sieht den anderen leicht anders) – dieses Auto prallt ab; das
  andere bekommt mit der Meldung einen **sanften Gegenstoß** (0,4 × Stoß-Tempo, höchstens 3 m/s, neu in der Abnahme) und
  zeigt Funken/Ton. So spüren beide den Rempler, nur unterschiedlich stark.
- **Rempler bei 150 ms:** spürbar „einen Tick später“ beim anderen (~0,1 s); bei hartem Seitenkontakt kann es passieren,
  dass die Autos sich auf den beiden Bildschirmen kurz leicht überlappen, bevor der Stoß ankommt. Fair genug für Freunde,
  kein Simulator-Netzcode.

## Mess-Gate „Mittelklasse-Android“ (CPU ×4, DPR 2,6, hoch + quer, ungedeckelt, 4 Runden, Median)
Ein Gerät, ein Browser: `?onlineprobe=3&probeart=linie&probeplatz=hinten&probeabstand=10` = **4 Autos online**. Drei
Attrappen-Mitspieler schicken ihre Lage als echte Netz-Pakete (25 Hz, binär, Fake-Netz 20 ± 5 ms) an die eigene Sitzung,
dort läuft der ganze Online-Pfad: Uhr, Puffer, Vorausrechnen, Darstellung, Kollision, Rangliste. Ihre Physik rechnen
echte Mitspieler auf dem eigenen Gerät, deshalb gleiten die Attrappen ohne Physik. **Ungünstigster Fall:** Du startest
hinten, die drei halten 10/16/22 m Abstand vor dir, sind also in jeder Messung alle im Bild (per Screenshot geprüft).
Frühere Läufe hatten die Attrappen hinter oder weit vor der Kamera und maßen dadurch zu günstig, siehe unten.
`tests/perf_gate.py --szenen tests/perf_szenen_online.json --ab solo= --ab vorn=<obige Regler> --runden 4`
→ `tests/perf/2026-10-20_n35_gate_final.json`. p50 / p95 in ms, „nur Netz“ = derselbe Lauf mit `?gegnervis=0`
(`…_gate_split.json`, 3 Runden).

| Szene | Gerät | solo | online, 4 Autos | Δ p95 | Δ ms | nur Netz | Draw-Calls | ≤ +15 % |
|---|---|---|---|---|---|---|---|---|
| start_kino | quer | 8,15 / 10,9 | 10,15 / 12,35 | +13 % | +1,4 ms |  | 112 → 151 | ✓ |
| start_kino | hoch | 7,4 / 10,05 | 9,55 / 12,25 | +22 % | +2,2 ms |  | 98 → 135 | ✗ |
| mitte_kino | quer | 8,5 / 11,05 | 9,9 / 11,8 | +7 % | +0,8 ms |  | 118 → 153 | ✓ |
| mitte_kino | hoch | 8,1 / 10,7 | 9,35 / 11,1 | +4 % | +0,4 ms |  | 106 → 134 | ✓ |
| start_standard | quer | 4,55 / 6,1 | 6,3 / 8,4 | +38 % | +2,3 ms | +17 % | 99 → 135 | ✗ |
| start_standard | hoch | 4,4 / 6,05 | 6,0 / 8,25 | +36 % | +2,2 ms | +16 % | 85 → 120 | ✗ |
| mitte_standard | quer | 5,1 / 6,8 | 5,95 / 7,75 | +14 % | +1,0 ms |  | 106 → 134 | ✓ |
| mitte_standard | hoch | 4,8 / 6,65 | 5,85 / 7,65 | +15,0 % | +1,0 ms |  | 94 → 119 | knapp ✗ |
| start_einfach | quer | 2,85 / 4,25 | 4,05 / 5,9 | +39 % | +1,7 ms | +24 % | 69 → 81 | ✗ |
| start_einfach | hoch | 2,75 / 4,25 | 3,8 / 5,75 | +35 % | +1,5 ms | +20 % | 56 → 68 | ✗ |
| mitte_einfach | quer | 3,4 / 4,9 | 3,7 / 5,3 | +8 % | +0,4 ms |  | 76 → 85 | ✓ |
| mitte_einfach | hoch | 3,25 / 4,8 | 3,7 / 5,35 | +11 % | +0,5 ms |  | 65 → 82 | ✓ |

**Ergebnis, ehrlich:** **Rennmitte** besteht das Gate (+4 … +15 %; mitte_standard hoch genau auf der Grenze). Der **Start**
(Pulk dicht vor dir, 1,5 s nach „Los!“) liegt mit +13 … +39 % darüber. Absolut sind es +1,4 … +2,3 ms p95 je Bild.
- **Zerlegt** (CPU-Profil `tests/online_profil.py`, Einfach-Start, je Bild bei Drosselung ×4): Der eigentliche Netz-Code
  (Puffer, Sitzung, Pakete, Online-Rennen, Vorausrechnen) kostet zusammen **≈ 0,2 ms**. Die Spalte „nur Netz“ liegt höher,
  weil darin auch die Attrappen-Sitzungen und das Fake-Netz der Probe stecken (auf echten Geräten nicht vorhanden) sowie die
  Matrix-Updates der ausgeblendeten Autos. Der Rest, etwa 1,2 … 1,5 ms, ist das **Zeichnen der drei zusätzlichen Autos**
  (Draw-Calls, Matrizen, Sichtbarkeitstest). Das ist dieselbe Darstellung wie bei den KI-Gegnern aus n34 (GEGNER_BERICHT §5:
  5 Gegner +1,1 … +3,1 ms). Doppelte Render-Durchgänge gibt es nicht (die fremden Autos stecken nur im Hauptbild plus
  Schattenkarte), Namensschilder kosten messbar nichts (`?schilder=0`).
- **Was half:** die Fern-Stufe fremder Autos zusammengefasst (15 → 5 Netze je Auto, Commit 7e91eb8; bei 3 Autos im Bild
  147 → 117 Draw-Calls), dazu die Hebel aus n34 (nur aktive LOD-Stufe im Szenengraph, Echtzeit-Schatten nur Karosserie und nur
  nah, auf „Einfach“ immer Fern-Modell ohne Schatten). Mehr ginge nur mit gröberen Autos in der Nähe. Das bleibt aus, weil
  man den Zweikampf aus der Nähe sieht.
- **Einordnung:** Gemessen wird ungedeckelt. Mit V-Sync (60 Hz, 16,7 ms Budget) bleibt jede Szene weit darunter: der
  teuerste Online-Wert ist 12,35 ms p95 auf Kino bei vierfach gedrosselter CPU. Auf Standard/Einfach sind die Bilder
  ungedeckelt nur 4–6 ms lang, deshalb wirken +2 ms prozentual groß.
- **Messfallen, die korrigiert sind:** In den Läufen vom 19.10. standen die Attrappen hinter dir (du warst Gastgeber = Platz 1)
  oder fuhren weit voraus hinter Kurven. Die Kino-Messung zählte dann exakt so viele Draw-Calls wie solo, maß also nichts.
  Neu sind die Probe-Regler `?probeplatz=hinten` und `?probeabstand=10`, außerdem greift `?gegnervis=0` jetzt auch online.

## Grenzen (ehrlich)
- **Kein TURN-Server:** Manche Mobilfunk- und Firmennetze (symmetrisches NAT, gesperrtes UDP) lassen keine direkte
  Verbindung zu. Dann gibt es keine Verbindung – nach ~10 s (Gast) bzw. ~16 s (Gastgeber) die Meldung „Verbindung … nicht
  möglich (Netz blockiert direkte Verbindung) – WLAN probieren“. Ein TURN-Server bräuchte Betrieb/Schlüssel (bewusst nicht).
  Beobachtet am Test-Mac selbst: hinter dem **ProtonVPN** verbinden sich nicht einmal zwei Tabs auf demselben Rechner
  (Chrome bietet nur die VPN-Schnittstelle an) – genau dieser Fall; der echte Test lief mit einer Schein-Mikrofon-Erlaubnis
  nur im Test (dann nimmt Chrome alle Schnittstellen). Ein Handy mit aktivem VPN wird sich ähnlich verhalten → VPN aus.
- **Schummeln ist möglich:** Peer-to-Peer ohne Schiedsrichter – jedes Gerät meldet Lage und Zielzeit selbst; der
  Gastgeber prüft nur den Zeitstempel. Gedacht für Runden unter Freunden, nicht für Ranglisten.
- **Öffentliche Relays** können ausfallen (am 18.10. 2 der 5 ursprünglich gewählten) – deshalb 7 Nostr-Relays und nach 6 s
  ohne Partner zusätzlich MQTT.
- **Eine Runde:** Rennen, KI und Ziel sind in der Stuntbahn auf eine Runde gebaut – die Lobby hat keine Rundenzahl.
- **Gastgeber geht oder gibt auf:** seine KI endet (sie rechnet nur bei ihm) und steht als „weg“ in der Tabelle.
- **Kein Schaden übers Netz:** fremde Autos sind immer heil (die n34-Schadensoptik bleibt am eigenen Auto).
- **Kein Einstieg mitten im Rennen:** wer während eines Rennens beitritt, fährt beim nächsten mit.
- **Online-Tempo:** gemeinsames Spieltempo 1,25 (wie Leicht/Original; Mittel fährt solo 1,0) – sonst liefen die Welten
  verschieden schnell. Online gilt immer „Totalschaden aus“, kein Pausieren, kein Geist.
- **QR mit echter Handykamera** und **`navigator.share`** am Handy sind nicht automatisch geprüft (QR aus dem Screenshot mit
  zbarimg gelesen; Teilen fällt ohne Web-Share auf Kopieren zurück).

## Entscheidungen (Peter kann sie ändern)
| Was | Regler / Stelle |
|---|---|
| Online-Knopf Standard an | `ONLINE_STANDARD` (`src/game/online.js`), `?online=0` |
| Fremde Autos vorausgerechnet | `ONLINE.voraus`, `?netzvoraus=0` |
| Gegenstoß 0,4 × Stoß-Tempo, ≤ 3 m/s | `ONLINE.rempler.gegen/gegenMax` (0 = aus) |
| 7 Nostr-Relays, MQTT nach 6 s | `RELAYS`, `AUSWEICH` (`src/net/trystero.js`), `?netz=nostr|mqtt|beide|bc` |
| Gemeinsames Tempo 1,25, Totalschaden aus, KI ohne Gummiband | `startDaten`, `startOnlineRace` |
| Zieltabelle, wenn alle im Ziel (Aufgeber zählen als fertig), spätestens 45 s nach dem Ersten | `SITZUNG.zielSchluss` |

## Neue/geänderte Dateien
`src/net/*` (Netz-Schicht), `src/game/online.js`, `onlinespiel.js`, `onlinestrecke.js`, `onlineprobe.js`, `src/ui/online.js`,
`src/ui/qr.js`, `vendor/trystero/` (+ `tools/vendor_trystero.py`), Einbau in `src/main.js`, `src/ui/ui.js`, `css/style.css`,
`src/game/input.js`, `src/game/store.js`, `src/ai/gegner.js` (Haken, Standard unverändert). Tests: siehe oben;
Messwerkzeuge `tests/online_ping_mess.py`, `tests/online_profil.py`, `tests/online_echt_probe.py`, `tools/online_mess.mjs`,
Mess-Szenen `tests/perf_szenen_online.json`.
