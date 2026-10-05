# Autopilot auf Leicht brachial – Driften und Schleudern (n25, 05.10.2026)

Peter (03.10.): „Kannst du den Autopilot auf Leicht etwas brachialer fahren lassen? Mit Driften und Schleudern so häufig
wie möglich am oberen Grenzbereich des Machbaren?“

## Kurz
- **Neue Option „Autopilot-Fahrstil“** (Optionen und Pause-Menü auf Leicht): **🔥 Brachial** (Standard) / **🧼 Sauber**
  (= bisher). Link-Zusatz `?fahrstil=sauber` bzw. `?fahrstil=brachial` gilt vorrangig.
- **Brachial:** Der Autopilot fährt am Limit, **driftet quer durch die Kurven** (18–34°, mit Qualm, Gummispuren,
  Gegenlenken), ab und zu ein **Beinahe-Dreher (~65°, wieder eingefangen)**, ein **Ausritt mit zwei Rädern ins Gras**,
  **Wackeln nach Landungen**, Nitro gern am Kurvenausgang.
- **Gemessen** (42 Strecken × 5 Zufalls-Seeds = 210 Runden): alle im Ziel, **0 Crashs**, Drift in **29 % der Kurvenzeit**
  (vorher 0,1 %), **6,4 Drifts je Runde**, Runden sogar **11,6 % schneller** als Sauber.
- Loopings, Röhren, Korkenzieher, Schanzen, Steilkurven, Wellen/Kuppen, Engstellen und Hochstraßen ohne Bande fährt er
  weiter sauber. **Mittel, Original und die Prüffahrt sind Bit für Bit unverändert.**
- **Handy:** Die App (PWA) einmal ganz schließen und neu öffnen, dann ist Build `90d5296bf1` geladen.

## Was er jetzt tut
| | Sauber (bis n24) | Brachial (neu, Standard) |
|---|---|---|
| Kurventempo | 76 % der Querhaftung | 96 % (der Leicht-Magnet hält zusätzlich) |
| Bremsen | 70 % des Haftungskreises | 90 % – später und härter |
| Schanze | 1,5 m/s unter der Fenster-Obergrenze | 1,3 m/s – Landung am Ende der Rampe |
| Kuppen | Bodenhaftung bei Tempo nicht eingerechnet | ein Viertel eingerechnet |
| Kurven | sauber auf der Linie, kein Rutschen | Drift: Einlenken mit kurzem Handbremsen-Ruck, quer halten, Gas halten, vor dem Ausgang einfangen |
| Lenken des Spielers | Mitlenken (Hilfe lenkt nur einen Teil der Kurve) | Autopilot lenkt; Tippen schiebt mit, **gehaltenes** Wegdrücken übernimmt (dann gilt Sauber-Tempo) |

### Wie ein Drift funktioniert (Technik)
- **Drift-Stellen** (`src/ai/drift.js`, `planDrifts`): Kurven mit Radius ≤ 150 m, mindestens 31° Bogen und 14 m Länge,
  Fahrbahn ≥ 6 m breit. Gesperrt: Looping, Röhre, Luft, Schanzen-Zone, Steilkurve, Achterbahn-Wellen/Kuppen,
  Stunt-Bausteine (auch Bodenwellen, Spirale, Steilwand), Engstellen – davor mindestens 25 m bzw. 1,4 s Abstand.
  Hochstraßen nur, wenn links und rechts eine Bande/Wand steht (Strahl-Test), sonst muss der Drift vorher eingefangen sein.
- **Tempo:** In Drift-Kurven 88 % des Brachial-Kurventempos (im Drift trägt die schräg stehende Hinterachse weniger zur
  Kurvenkraft bei); der Bremsplan davor passt sich an.
- **Regler:** Soll-Schwimmwinkel statt null. Ein Drift-Regler in der Physik (`car.js`, `assist.drift`) hält den Winkel über
  ein Giermoment (wie Gas + Gegenlenken eines Drift-Fahrers, nur verlässlich); das Heck hat im Drift 10 % weniger Haftung,
  der Antrieb ist hecklastig, der Gegenlenk-Einschlag bis 0,62 rad. Die Lenkung stellt die Vorderräder in die Richtung, in
  die die Vorderachse tatsächlich fährt (sichtbares Gegenlenken), plus Bahnregler auf den Kurs der Geschwindigkeit.
- **Einfangen:** Winkel in 0,45 s auf null, danach hält der Regler den Winkel bei null, bis das Auto 0,25 s ruhig ist –
  auch bei jedem ungewollten Rutschen über 10°. Liegt das Auto danach neben der Linie, führt es weich zurück, das Ziel
  aber nie außerhalb der Fahrbahn der nächsten Sekunde (Verengungen, Autobahn-Übergang). Lenkung am Anschlag → Gas weg.
- **Abbruch:** zu nah am Fahrbahnrand (vorausgesagt), zu langsam, Räder in der Luft, Spieler lenkt selbst.
- **Show-Momente:** je Rennen neu ausgewürfelt (Tests mit festem Seed): 93 % der Drift-Kurven werden gedriftet; Beinahe-
  Dreher (66°, 0,5 s, höchstens einer je Runde, nur unter ~115 km/h und in langen Kurven); Ausritt ins Gras (nur wo die
  Ideallinie am Ausgang ohnehin außen liegt und dort Gras ist); Wackeln nach jeder Landung mit ≥ 0,8 s Flug; Nitro am
  Drift-Ausgang, wenn die geplante Nitro-Gerade bis 250 m danach beginnt und dazwischen kein Stunt liegt; sonst wie bisher.
- **Sichtbarkeit:** Reifenqualm im Drift dichter und größer (höchstens 121 von 260 Partikeln gemessen), Gummispuren,
  Reifenquietschen (wie bisher aus dem Rutschen der Räder). **Replay und Kino-Replay** zeigen jetzt auch Qualm und
  Quietschen (Schwimmwinkel aus der Aufzeichnung). **Drift-Kamera:** Der Verfolger folgt im Drift zu gut der Hälfte der
  Fahrtrichtung statt der Karosserie – das Auto steht sichtbar quer im Bild, die Kamera schwingt leicht mit.
- **Kino-Replay:** neue Momente „🔥 Längster Drift · 28° · 5,9 s“, „🔥 Stärkster Drift · 36° · 2,4 s“ und
  „🌪️ Beinahe-Dreher · 62° quer“ (Drohne am Höhepunkt, dann Action-Cam).

## Messung vorher/nachher
`node tools/drift_mess.mjs --seed=0…4` – Leicht, Hände weg, je Strecke eine Runde, 42 Strecken: 16 flach (Sanft/Sportlich/
Irre), 8 Gelände, 6 3D, 12 Sammlung; fünf Seeds = 210 Runden je Fahrstil. Kurvenzeit = Plan-Querbeschleunigung ≥ 5 m/s²
außerhalb von Stunts. Drift = über 12° mindestens 0,4 s. Schanze „ok“ = Landung auf der Landerampe.

| Strecken | je Seed | im Ziel Sauber · Brachial | Rundenzeit Ø | Fahrzeit > 10° | > 25° | Kurvenzeit > 10° | Drifts/Runde | größter Winkel | Beinahe-Dreher | Crashs je 10 Runden | Lippe km/h (Median) | Landung auf der Rampe |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| flach | 16 | 80/80 · 80/80 | 66,7 → 58,6 s (−12,1 %) | 0,0 → 30,5 % | 0,0 → 21,7 % | 0,0 → 39,2 % | 0 → 7,1 | 13° → 65° | 37 | 0 → 0 | 163 → 163 | 100 → 98,5 % (65) |
| Gelände | 8 | 40/40 · 40/40 | 85,2 → 74,6 s (−12,4 %) | 0,0 → 26,2 % | 0,0 → 19,2 % | 0,0 → 35,3 % | 0 → 8,6 | 7° → 65° | 19 | 0 → 0 | 161 → 163 | 100 → 94,7 % (75) |
| 3D | 6 | 30/30 · 30/30 | 73,6 → 67,4 s (−8,4 %) | 0,1 → 14,6 % | 0,0 → 9,9 % | 0,1 → 19,7 % | 0 → 5,4 | 14° → 65° | 7 | 0 → 0 | 92 → 92 | 100 → 100 % (15) |
| Sammlung | 12 | 60/60 · 60/60 | 91,9 → 81,0 s (−11,8 %) | 0,0 → 10,5 % | 0,0 → 7,1 % | 0,1 → 17,4 % | 0 → 4,3 | 15° → 65° | 7 | 0 → 0 | – | – |
| **alle** | **42** | **210/210 · 210/210** | **78,4 → 69,3 s (−11,6 %)** | **0,0 → 20,8 %** | **0,0 → 14,7 %** | **0,1 → 29,4 %** | **0 → 6,4** | **15° → 65°** | **70** | **0 → 0** | **163 → 163** | **100 → 96,8 % (155)** |

- **Ziel „≥ 25 % der Kurvenzeit, ≥ 3 Drifts je Runde“:** über alles 29,4 % und 6,4 ✓; flach und Gelände deutlich darüber.
  3D (19,7 %) und Sammlung (17,4 %) liegen darunter: dort sind viele Kurven Steilkurven, Hochstraßen ohne Bande oder liegen
  direkt vor/hinter Loopings, Röhren und Korkenziehern – dort fährt er bewusst sauber. Drifts je Runde auch dort ≥ 4.
- **Rundenzeit:** Ziel war „höchstens +8 % gegen Sauber“ – Brachial ist **11,6 % schneller** (Spanne je Strecke −16 … −4 %).
  Der Drift kostet in der Kurve etwas, das Limit-Tempo, späte Bremsen und die direkte Lenkung holen mehr heraus.
- **Crashs:** 0 in 210 Runden (Ziel ≤ 1 je 10 Runden). Kein Fahrbahn-Reset.
- **Schanze:** gleiches Lippen-Tempo im Median (Sauber springt schon fast bis ans Rampenende); 5 von 155 Sprüngen landen
  knapp hinter der Rampe – harte Landung mit Wackeln, ohne Crash (das Fenster erlaubt bis 8 m dahinter).
- **Beinahe-Dreher:** 70 in 210 Runden (≈ jede dritte Runde), alle eingefangen; Gras-Ausritte treffen etwa jeden zweiten
  geplanten Versuch (Gras unter den Außenrädern), Wackeln nach Landungen in jeder Runde mit Schanze/Klippe.

### Spieler auf Leicht mit Brachial
- **Hände weg:** wie oben.
- **Zappelig** (zufällig voll links/rechts, `tests/node/test_leicht3d.mjs`, 18 3D-Strecken): alle im Ziel, kein Absturz,
  43 Crashs (mit Sauber 50). Erster Entwurf (jedes kräftige Lenken = sofort übernehmen) hatte bei Brachial-Tempo ein Vielfaches an
  Crashs (5–11 je Strecke) und 5 Strecken nicht im Ziel – deshalb gilt jetzt die Übernahme-Regel von Sauber: Tippen schiebt mit (im Drift kaum),
  gehaltenes Lenken wirkt in 1,6 s voll, übernommen wird erst, wer außerhalb des Bands weiter von der Linie wegdrückt
  (nach ~3 s Halten, Sauber ~2,7 s). Wer übernimmt, fährt mit Sauber-Tempo.

### Unverändert
`tests/out/n25/bitgleich.mjs` (lokal) vergleicht Aufzeichnungen Byte für Byte mit dem Stand vor n25: Mittel (Bot),
Original-Autopilot (Prüffahrt/Generator), Original (Bot) und Leicht Sauber auf 4 Strecken – **identisch**. Alte Codes
(`test_alte_codes`), Lösbarkeit und Autopilot-Referenzzeiten bleiben damit gleich.

## Sicht-Prüfung (Fotos selbst angesehen)
`python3 tests/drift_shots.py quer|hoch` (Pixel 7, je 6er-Serie):
- `tests/shots/final/drift_quer_kurve.jpg`, `drift_hoch_kurve.jpg`: Auto steht ~30° schräg in der Kurve, Heck außen,
  Qualmschleier und schwarze Gummispuren, Kamera schwingt leicht mit – sieht wie ein Drift aus, am Ende wieder gerade. ✓
- `drift_quer_beinahe_dreher.jpg`: Bild 2 fast quer (~60°), danach eingefangen und weiter. ✓
- `drift_quer_cockpit.jpg`: Blick schräg aus der Kurve, Lenkrad gegengelenkt, Spuren vor dem Auto. ✓
- `drift_quer_kinoreplay.jpg`, `drift_hoch_kinoreplay.jpg`: Kino-Replay „🌪️ Beinahe-Dreher · 62° quer“ in der Drohnen-
  Ansicht, Auto quer mit Spuren. ✓
- `drift_optionen.jpg`: Option „Autopilot-Fahrstil (Leicht)“ mit Erklärung.
- Erster Durchgang: Im Verfolger sah der Drift fast gerade aus (die Kamera drehte mit der Karosserie) und der Qualm war
  kaum zu sehen → Drift-Kamera und dichterer Drift-Qualm, danach neu fotografiert.

## Tests und Prüfungen
- `npm run test:node`: alle 30 Tests grün, neu `tests/node/test_drift.mjs` (Option gespeichert/Standard, wo Brachial wirkt,
  Umschalten im Rennen, Spieler-Übernahme, Profil, Drift-Stellen nie in Stunts, Physik ohne Drift-Hilfen bitgleich,
  Drift-Regler hält 25°, **Regression mit festem Seed auf 8 Strecken**: alle im Ziel, 0 Crashs, 34,8 % Drift in Kurven,
  8,6 Drifts/Runde, −11,8 % Rundenzeit, Kino-Replay erkennt Drifts).
- Sammlung: die 20 Prüffahrten auf Leicht laufen jetzt **mit Sauber und Brachial** – je 20/20 im Ziel, 0 Crashs.
- 3D: Leicht Hände weg und zappelig auch mit Brachial – alle im Ziel, kein Absturz.
- Browser (Pixel 7 quer + hoch): `tests/drift_shots.py` OK, **0 JS-Fehler**; `tests/smoke.py` 0 Fehler.
- **Bildrate** (`tests/perf_drift.py`, Pixel 7 quer headless, 3 × 12 s abwechselnd): Sauber Ø 13,1 fps, Brachial Ø 12,9 fps
  – im Rauschen (headless mit 2,6-facher Pixeldichte und Kino-Look ist die Zahl absolut niedrig); Qualm höchstens 121 von
  260 Partikeln.
- **Live** (https://drpeterkalmar.github.io/stuntbahn/, Build `90d5296bf1`): `tests/test_live.py` – Rennen im Ziel,
  0 Fehler, installierbar, offline startbar; zusätzlich live quer und hoch: Standard Brachial, 8 bzw. 9 Drifts in der Runde,
  0 Crashs, 0 Fehler.

## Werkzeuge
- `node tools/drift_mess.mjs [--stil=sauber,brachial] [--seed=n] [--set=spinP:1,…] [--json=…]`, `--sum=a.json,b.json`
- `node tools/kinoreplay_probe.mjs --fahrstil=brachial`
- `python3 tests/drift_shots.py quer|hoch [seed-d]`, `python3 tests/perf_drift.py [runden] [sekunden]`
- Stellschrauben: `BRACHIAL` in `src/ai/drift.js` (Profil, Drift-Stellen, Winkel, Show-Momente), `DRIFT` in
  `src/physics/car.js` (Drift-Regler), `BRACHIAL_STEER` in `src/game/race.js` (Mitlenken, Gas weg, Nitro), `DRIFT_CAM` in
  `src/gfx/camera.js`.

## Grenzen / offen
- Der Drift wird von einem Giermoment gehalten (wie ein sehr guter Fahrer mit Gas und Gegenlenken), nicht allein aus den
  Reifenkräften – mit der hohen Haftung auf Leicht (Magnet) bricht das Heck sonst nicht kontrolliert aus.
- 3D- und Sammlungs-Strecken driften seltener (Steilkurven, Hochstraßen ohne Bande, Stunts dicht hintereinander).
- Nitro kommt nur in etwa jeder achten Runde direkt am Drift-Ausgang; sonst wie bisher auf der längsten Geraden.
