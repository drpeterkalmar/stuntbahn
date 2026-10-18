# N37 – Arcade-Stunt-Fahrgefühl (Bericht)

Stand 18.10.2026 · Version **0.7.0** · live: https://drpeterkalmar.github.io/stuntbahn/
**Datenblatt:** `ARCADE_FEEL.md`. Es beschreibt, wie das Vorbild fährt, mit Zahlen und Quellen, und enthält die Tabelle
„Vorbild vs. Stuntbahn heute“. Der Ansatz ist Clean-Room: nur Mechanik und Zahlen in eigenen Worten, eigener Code, keine Namen
oder Assets im Spiel.

Peters Wunsch (10.10.): „ein gutes, bereits reverse-engineertes Rennspiel verwenden – nicht das Stunts-Fahrgefühl“.
Umgesetzt nach Hermes' Lesart: Vorbild sind die Arcade-Stunt-Racer der späten 90er (Rush 2049), für die Straßenlage Beetle
Adventure Racing.

## 📱 Handy-Test für Peter
1. **Mittel** fahren, z. B. `4711-2` (gleich nach dem Start kommt eine Schanze) oder die Strecke des Tages.
2. Mit Vollgas über die Schanze fliegt das Auto ganz normal. **In der Luft GAS kurz loslassen und einmal antippen** → Salto
   vorwärts. **BREMSE antippen** → Salto rückwärts. **◀ oder ▶ antippen** → Schraube. Zwei Tipps machen zwei Drehungen, wenn die
   Flugzeit reicht (sonst „zu spät“). Die Landehilfe stellt das Auto danach gerade.
3. Nach der Landung steht oben die Figur mit Punkten, z. B. „Salto · ✈ 2,2 s · sauber ×1,25 · +65“. Unter der Zeit läuft die
   Summe „★ … Stunt-Punkte“ mit.
4. An einer Hochstraße oder Brücke einmal **schräg an die Wand** fahren: Das Auto schrammt entlang statt zu explodieren.
5. **Original** probieren: Dort heißt **halten** drehen, und du fängst selbst ab.
6. Zum Vergleich denselben Link mit **`?physik=alt`** öffnen, also das Fahrgefühl bis gestern. Solche Fahrten werten nicht.
   Regler zum Feintunen (werten auch nicht): `?luft=0.5` / `?luft=2` (Luftsteuerung schwächer/stärker), `?wand=0`
   (Wand wie bisher), `?grip=1.2` (mehr Haftung).
7. Mittel- und Original-**Bestzeiten starten einmalig neu**; im Menü erscheint dazu ein Hinweis.

## Was gebaut wurde (eine Parametergruppe `src/physics/arcade.js`)
| Zutat | Mittel 🟡 | Original 🔴 | Leicht 🟢 |
|---|---|---|---|
| Luftsteuerung | **antippen** = ganzer Salto/ganze Schraube (nur wenn die Flugzeit reicht, Vorhersage der Flugbahn gegen die Welt); halten tut nichts | **halten** = drehen (Drehraten-Regler, Stärke wächst mit dem Tempo), Schwung bleibt | – (Autopilot fliegt, Lagehilfe wie bisher) |
| Landehilfe | richtet nach einem Trick Dach, Nase und **Fahrtrichtung** aus; 0,35 s vor dem Aufsetzen keine Eingabe mehr; nimmt beim Aufsetzen Dreh-Schwung quer zur Fahrbahn weg; richtet ein auf der Seite liegendes Auto auf | keine | wie bisher |
| Gesperrte Eingaben | Was beim Absprung gedrückt ist, zählt erst nach dem Loslassen; in den ersten 0,3 s zählt kein Tipp (späte Reaktion auf „Bremsen!“); Lenken zählt nur als voller Druck; in der Luft kein „Bremsen!“ | wie Mittel (ohne Tipp-Regeln) | – |
| Crash | Dach voran > 115° oder 1,2 s auf der Seite; Aufprall Boden 16 statt 13 m/s, Federbein 18 statt 15 m/s | gleich | gleich |
| Wand | kein Rückprall, Reibung 0,06 statt 0,22, Auto dreht parallel; Crash nur, wenn senkrecht > 14 m/s und steil (> 40°) oder > 30 m/s | gleich | gleich |
| Boden | 0–100 2,5 s (Antrieb 0,92, weich ab 60 km/h, 0 bei 350 km/h), Lenkgeschwindigkeit 3,8 statt 3 rad/s, Schleuderschutz-Totband 0,2 statt 0,12 | Motor/Reifen wie bisher (580 km/h), Lenkung 3,8 rad/s | wie bisher |
| Wiedereinstieg | ≤ 1,5 s | Totalschaden an: 1,4 statt 2,6 s | wie bisher |
| Kamera (alle) | im Flug Blick entlang der Flugbahn, Welt-Oben – dreht bei Saltos nicht mit | | |
| Stunt-Punkte (alle) | `src/game/stunts.js`, Anzeige je Sprung und Summe | | |

**Prüffahrt/Generator** (reine Autopilot-Fahrt) rechnen ohne Arcade-Physik. Alte Codes sind bitgleich, die Schanzen-
Tempofenster bleiben gültig. Die Schwerkraft im Flug bleibt 0,7 g; Drehen ändert die Flugbahn nicht.

## Messvergleich Datenblatt ↔ neu (`node tools/arcade_mess.mjs`, echte Sekunden)
| Messgröße | Vorbild | 🟡 bis n36 | 🟡 **n37** | 🔴 bis n36 | 🔴 **n37** |
|---|---|---|---|---|---|
| 0–100 km/h | ~2,3–2,7 s ○ | 3,06 s | **2,50 s** | 1,57 s | 1,57 s |
| 0–200 km/h | ~6–7 s ○ | 7,08 s | **6,63 s** | 2,83 s | 2,83 s |
| Höchsttempo | ~290 km/h | 264 | 260 | 580 | 580 |
| mit Nitro | Booster ×1,1 | 306 (×1,16) | 298 (×1,15) | 694 (×1,20) | 694 (×1,20) |
| Kurvengrenze R 25 / 50 / 100 m | Reibwert 2,6–2,8 | 102 / 161 / 289 | 102 / 161 / 289 | 82 / 125 / 215 | 82 / 125 / 215 |
| Schanze: Flug / Weite / Scheitel | Air-Punkte ab 5 s | 2,63 s / 97 m / 5,9 m | 2,66 s / 98 m / 6,0 m | 2,18 s / 102 m / 6,3 m | gleich |
| Klippe 1 Ebene | | 1,87 s / 48 m | 1,88 s / 48 m | 1,53 s / 49 m | gleich |
| Klippe 2 Ebenen | | 2,28 s / 66 m | 2,27 s / 66 m | 1,84 s / 67 m | gleich |
| Luft-Drehrate Nicken / Rollen | mit Flügel ~150 / 230 °/s² | 15 °/s (Lagehilfe) / 0 | **344 / 401 °/s**, 360° in 1,17 / 1,04 s | 0 / 0 | **329 / 401 °/s**, 1,22 / 1,02 s |
| Salto / Schraube auf der Schanze | | – | vor ✓, rück ✓, Schraube ✓ (Tempo bleibt: 137 → 143–151 km/h) | – | vor ✓, rück ✓, 1× und 2× Schraube ✓ |
| Klippe 2 Ebenen | | – | Salto vor/rück ✓, Schraube ✓ | – | alle ✓ außer 2× Schraube (zu wenig Zeit → Überschlag) |
| Klippe 1 Ebene (1,9 s) | | – | Schraube ✓, Salto „zu spät“ | – | Salto ✓, Schraube ✓ |
| Landen ohne Crash (flach) | bis 135° Kippung | 100° Rollen / 88° Nicken, 22,6 m/s | 107° / 100°, 26,2 m/s | 97° / 80°, 22,7 m/s | 97° / 89°, 26,3 m/s |
| Crash → weiterfahren | 3,5 + 1,5 s | 0,36 s / 1,42 s (Wrack) | 0,36 s / 1,42 s | 0,29 s / 2,09 s | 0,29 s / **1,13 s** |
| Wand 150 km/h, 5° / 10° / 15° / 30° / 60° | schrammt, frontal Crash | −7 % / −8 % / Crash / Crash / Crash | **−1 % / −3 % / −6 % / −18 % / Crash** | −3 % / −6 % / Crash / Crash / Crash | **−1 % / −3 % / −7 % / −23 % / Crash** |
| Stunt-Wertung | 5 je halbe Drehung | – | Salto sauber auf der Schanze +65 bis +70, Schraube +62 bis +78 | – | gleich |

Ziele aus dem Datenblatt: Mittel knackiger ✓, direkter ✓, Wände schrammen ✓, Luftsteuerung mit Saltos und Schrauben ✓,
Landehilfe ✓, Crash nur bei wirklich schiefen Landungen ✓, Wiedereinstieg ≤ 1,5 s ✓.

**Nicht erreicht: Mittel-Höchsttempo 290–300 km/h.** Gemessen hat sich gezeigt: Mit mehr Durchzug (vSoft 120 / vTop 400 km/h,
296 km/h) flogen Vollgas-Bots an 4–7 von 24 Schanzen hinter die Landerampe. Das war genau Peters n24-Beschwerde („Sprünge gehen
zu weit“). Deshalb ist nur der Antritt schneller geworden, das Höchsttempo blieb.

## Fahrer auf 72 Zufallsstrecken (`node tools/arcade_quote.mjs 8`)
Die 72 Strecken: flach, Hochstraße und Gelände, je 3 Stufen, Generator-Version 2 („h“), dieselben geprüften Strecken für alt
und neu. „Mensch“-Bots sind aus `tools/mittel_probe.mjs`, je 2 Seeds.

| Fahrer | bis n36: Ziel / Crashs / Zeit÷Prüffahrt | **n37** |
|---|---|---|
| 🟢 Leicht Sauber (Autopilot) | 72/72 / 0 / 1,128 | 72/72 / 0 / 1,128 (unverändert) |
| 🟢 Leicht Brachial (Autopilot) | 72/72 / 0 / 1,012 | 72/72 / 0 / 1,012 (unverändert) |
| 🟡 Mittel „mensch-handy“ | 144/144 / **274** / 0,767 | 144/144 / **119** / 0,702 |
| 🟡 Mittel „mensch-touch“ (Daumen auf ◀ ▶) | 144/144 / **525** / 0,991 | 144/144 / **235** / 0,877 |
| 🟡 Mittel „mensch-voll“ (immer Vollgas) | 137/144 / **1704** / 0,915 | **144/144** / **382** / 0,727 |

Die Crashs sinken vor allem bei „Aufprall“ (Handy 186 → 39, Touch 310 → 54, Vollgas 1427 → 127). In Stunt-Zonen bleibt die
Summe etwa gleich (Handy 55 → 55, Touch 122 → 105).

**Sprünge mit Mensch-Bots** (`test_mittel3` D, 8 Strecken): Der Handy-Bot landet 23/24 sauber (Ziel ≥ 85 %), der
Vollgas-Bot fliegt 0-mal hinter die Rampe, und **ungewollte Tricks gibt es 0** (40 Sprünge). Vor den Tipp-Regeln waren es
16 ungewollte Tricks: „halten = drehen“ hatte auf Mittel 16 statt 3 Crashs an 40 Sprüngen ausgelöst. Deshalb heißt es auf
Mittel „antippen“.

**Unbegrenztes Nitro gegengemessen:** Ein Vollgas-Bot zündet Nitro, sobald es bereit ist, und fliegt dann an 7 von 24 Schanzen
hinter die Landerampe (bis n36: 4 von 28). Ohne Nitro sind es 0. Den Schub im Schanzen-Anlauf abzuschalten hat nicht geholfen
(weiter 7, das Tempo stammt von davor) und wurde wieder entfernt. NITRO.k und COOLDOWN bleiben unverändert, der
Schanzen-Hinweis „langsamer ▼“ bleibt.

**.TRK-Korpus Leicht** (400 Strecken, `test_trk_corpus.mjs 400 --assist=easy`): 382 → **385** im Ziel (95,5 → 96,3 %). Drei
Strecken scheiterten vorher an „Harte Landung“, es gibt keine Verschlechterung. **Prüffahrt:** Alte Codes 249/249 identisch,
auch geprüft (`test_alte_codes.mjs --verify`).

## Browser: Bildfolgen vorher/nachher, Bildrate
- `tests/arcade_shots.py quer|hoch` fährt Mittel mit **echter Tastatur** über die erste Schanze von 4711-2 und tippt in der Luft
  Gas bzw. Pfeil rechts an. Salto und Schraube werden gewertet und landen ohne Crash. `?physik=alt` macht keinen Salto,
  0 Seitenfehler.
- Collagen: `tests/shots/n37/bildfolge_quer.jpg` und `bildfolge_hoch.jpg`. Oben ist vorher (fliegt starr), darunter Salto und
  Schraube; je 5 Bilder: Absprung, 1,0 / 1,5 / 2,0 s, Landung mit Anzeige.
- Gefunden und behoben: Die Schraube landete zuerst quer zur Bahn und rutschte von 195 auf 77 km/h. Jetzt dreht die Landehilfe
  auch die Nase in Flugrichtung, und die Landung ist sauber mit 192 km/h. Außerdem zeigte der Gang mitten im Salto „R“, und
  das Tempo fiel auf die Längskomponente; im Flug zählt jetzt das Bahntempo.
- **Bildrate** (`tests/perf_gate.py`, CPU ×4, DPR 2,6) im Vergleich n36 → n37:

  | Szene | n36 | n37 |
  |---|---|---|
  | Rennen Standard hoch | p95 12,7 ms / 143 fps | p95 7,9 ms / 192 fps |
  | Rennen Standard quer | p95 13,9 ms / 139 fps | p95 10,0 ms / 148 fps |
  | Rennen Kino hoch | p95 31,9 ms / 66 fps | p95 31,7 ms / 69 fps |
  | Rennen Kino quer | p95 34,8 ms / 62 fps | p95 32,6 ms / 71 fps |

  Die Bildrate ist unverändert; die Unterschiede liegen im Rauschen. Draw-Calls und Dreiecke sind gleich.
- **Sichtprüfung** der Bildfolgen (eigene Bewertung; das Hermes-Werkzeug `vision_analyze` gibt es in diesem Lauf nicht):
  - Der Salto ist klar lesbar. Mitten im Flug steht das Auto kopfüber vor dem Himmel, die Kamera bleibt ruhig hinter der
    Flugbahn, und die Live-Anzeige „✈ 1,0 s · ½ Salto“ zählt mit.
  - Die Schraube zeigt das Auto quer gerollt über der Bahn.
  - Nach der Landung erscheint groß „Salto / ✈ 2,2 s · sauber ×1,25 / +65“.
  - Insgesamt wirkt das deutlich mehr nach Arcade-Stunt-Racer als die starre Flugbahn vorher. Grenze: Der Abstand der Kamera
    ist unverändert, und es gibt keine Zeitlupe oder Effekte beim Trick (das kommt mit n36 „Action-Momente“).

## Tests
- `tests/node/test_arcade.mjs` (in `run_all`) prüft:
  - Stunt-Formel und Anzeige-Text, Tracker auf der Ebene (Mittel-Tipp-Salto landet, Original-Schraube, halber Salto → Crash)
  - Regler und Stufen, reine Autopilot-Fahrt ohne Arcade
  - Messziele gegen das Datenblatt
  - **`?physik=alt` bitgleich zum Stand n36** (c881366): Leicht, Mittel und Original je 40 s auf 2 Strecken mit Nitro und Hüpfer
  - Bestzeiten einmalig neu, A/B-Links
- Node insgesamt **48/48 grün**. Die Bestzeiten-Tests von n24/n26/n29/n33 setzen jetzt `arcadeReset: 37` und prüfen damit
  weiter nur ihren eigenen Reset.
- Browser: `tests/arcade_shots.py` quer und hoch grün, `smoke.py`, `test_race.py` und `test_hindernisse_ui.py` grün.
  `test_extras_ui.py`: 1 Fehlschlag („kleinq“: Tempo-Zeile berührt BREMSE). **Den gab es schon vor n37**, nachgeprüft am Stand
  c881366.
- `test_live.py` gegen GitHub Pages: Build stimmt, startet, 0 Fehler, offline spielbar.

## Für n38 (Stunt-Kette) und n34 (KI-Gegner)
- **n38:** `race.stunts` (StuntTracker) liefert je Landung das Ereignis `stunt` mit `{ pts, base, flips, spins, rolls,
  landing: 'clean'|'ok'|'crash', chain, chainMult, air, hop, repeat, total }`; alternativ `race.stunts.onScore = (r) => …`.
  Die reinen Funktionen `scoreJump`, `chainFactor` und `chainWindow` stehen in `src/game/stunts.js`, die Werte in `STUNT`.
  Daran kann n38 die Abklingzeit des Nitro über Stunts verkürzen (Nachtrag 15.10.: kein Tank).
- **n34:** Gegner auf der neuen Physik abnehmen. Bots fahren über `Race.carAssist(car, A, autopilotOnly, key)`; reine
  Autopilot-Gegner hätten wie die Prüffahrt **keine** Arcade-Physik. Für „Gegner fühlen sich an wie der Spieler“ braucht es
  `carAssist(…, false, 'medium')` oder einen eigenen Schlüssel. Wand und Crash gelten dann auch für Gegner.

## Offen / Grenzen
- Peters Handy-Test steht aus: Fühlt sich Antippen am Daumen gut an? Ist die Luftsteuerung stark genug (`?luft=`)?
- Original-Spieler mit Touch müssen in der Luft Gas loslassen und wieder drücken, um zu drehen. Wer kurz vor der Landung
  wieder Gas gibt, nickt dort. Das ist gewollt („voll manuell“), aber gewöhnungsbedürftig.
- Die Stunt-Wertung läuft auch mit `?physik=alt` mit (nur Anzeige, die Physik ist bitgleich).
- Highlight-Film (n18) kennt Saltos noch nicht eigens; er wertet Sprünge wie bisher.
