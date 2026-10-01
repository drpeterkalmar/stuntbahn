# Gelände-Strecken wie bei Trackmania (n22, 01.10.2026)

Peters Wunsch (30.09.2026): „Mit 3D-Bahnen meinte ich nicht nur kilometerlange schlingernde Autobahnen, sondern 3D-Gelände
wie bei Trackmania.“ Bisher (n19) gab es Hochstraßen auf Pfeilern über einer flachen Ebene. Jetzt **fährt die Strecke durch
eine Landschaft**: über Kuppen, ins Tal, Serpentinen den Hang hinauf, seitlich geneigt am Hang entlang, durch einen Tunnel,
über eine Schlucht.

## Kurz

- **Neue Streckenart „⛰️ Gelände“**, Standard für neue Zufallsstrecken und die Strecke des Tages. Code mit **„-g“**
  (z. B. `4711-3-g`), URL `?seed=4711&d=3&g=1`. Menü: Schalter **▭ flach / 🏗️ Hochstraße / ⛰️ Gelände** neben der Stufe.
- **Alte Codes bitgleich:** flach und `-3d` bauen Byte für Byte wie vorher (38 Strecken inkl. Demo und Galerie, Fahrlinie,
  Geometrie, Kollision, Gelände, Bäume), 249/249 Layouts identisch und geprüft. Import-Korpus-Test grün.
- **Lösbarkeit:** 300 Seeds je Stufe per Autopilot: **Sanft 300/300, Sportlich 300/300, Irre 300/300 – ohne ein einziges
  Entschärfen.** Leicht, Spieler tut nichts: **90/90 im Ziel ohne Crash**.
- **Höhenunterschied der Fahrbahn** (Median, 30 Seeds): Sanft 20 m, Sportlich 33 m, Irre 40 m (Spanne 13–63 m); die
  Landschaft selbst hat 60 / 90 / 120 m. Steigung höchstens 13 / 17 / 22 %.
- **Leistung:** Gelände-Dreiecke +3 % gegenüber der flachen Strecke desselben Codes (Ziel ≤ +25 %), an gleichen Blickpunkten
  im Browser gleich viele oder weniger Draw-Calls und Dreiecke, Renderzeit gleich.
- Live: Etappe A `8f60cee` (Build `3d882d54d5`), Etappe B siehe unten.

## So entsteht eine Gelände-Strecke (`src/track/gelaende.js`, `generatorG.js`, `pieces_gel.js`)

1. **Grundriss** (`generatorG.js`): Rechteck-Rundkurs wie bisher, ausgebeult; oft eine **Serpentine** (zwei Kehren hinauf
   oder hinunter). Darauf die Gelände-Elemente und Stunts (eigener Zufall, flache Codes unberührt).
2. **Landschaft** aus dem Seed: Hügel und Täler, Hügelketten, Plateau-Stufen (Terrassen), Bergkranz außen.
3. **Höhenverlauf der Fahrbahn:** Die Strecke folgt der Landschaft unter ihr – geglättet (Ausgleichsrechnung über die ganze
   Runde) und fahrbar gemacht: Steigung begrenzt, Kuppen-Radius ≥ 320/260/210 m, Senken ≥ 150/130/115 m (außer gewollte
   Kuppen). Looping, Schanze, Röhre, Steilkurve … liegen auf einem **waagrechten Sockel**, die Anlauf-Gerade davor auch.
   Danach wird die Strecke ein zweites Mal gebaut – jedes Stück um seinen Höhenverlauf angehoben, Fugen ohne Stufe.
4. **Gelände an der Fahrbahn:** im Streifen neben der Straße genau auf Fahrbahnhöhe (bei Schräglage geneigt), dahinter
   **Böschungen** – Damm (1:1,4) oder Einschnitt (1:1,1) bis zur Landschaft. Wo die Straße > 10 m über dem Tal läge, wird
   eine **Brücke** mit Pfeilern daraus (nur dort Pfeiler); wo sie > 12 m tief im Hügel läge, ein **Tunnel**.
   **Leitplanken**, wo es neben der Straße mehr als 1,6 m hinuntergeht.
5. **Farben nach Neigung** (Shader): flach Gras, ab ~22° Erde/Schotter (Böschungen), ab ~35° Fels mit Schichten.
   `?gelfarbe=0` = überall Gras (Vergleich).

## Die Elemente

| Element | Wie | Messwerte (Autopilot ohne Hilfen, 36 Strecken) |
|---|---|---|
| **Berg-/Talfahrt** | überall: die Fahrbahn folgt der Landschaft | Steigung bis 13/17/22 % |
| **Serpentine** | zwei enge Kehren übereinander am Hang, je ~7 m höher | 21×, Einfahrt Ø 204 km/h, Kehren ~70 km/h, 0 Crashs |
| **Kuppe mit Luftphase** | gewollter Buckel (6–9 m) auf einer langen Geraden, dahinter 2 Felder zum Landen | 23×, Luft bis 0,38 s (Median 0,08 s), 0 Crashs |
| **Hang-Querfahrt** | Fahrbahn 10/13/15° seitlich geneigt, der Hang setzt sich seitlich fort | 29×, bis 310 km/h, 0 Crashs |
| **Steilkurve in der Mulde** | 30°-Kurve ohne Betonwand: außen steigt das Gelände weiter an, innen eine Mulde | 90×, Ø 174 km/h, max 4,8 g, 0 Crashs |
| **Tunnel** | gewollt (Hügel darüber) oder wo die Straße tief im Hügel läge; Portal, Gewölbe, Hügel darüber | 20×, bis 289 km/h, 0 Crashs |
| **Brücke** | wo die Straße hoch über einem Tal läge: Hochstraßen-Deck mit Brüstung, Pfeiler bis ins Tal | 62×, 0 Crashs |
| **Schluchtsprung** | n21-Schanze auf der Kante, Schlucht 22 m tief mit Fluss und Schiffen | 25×, Absprung 164 km/h, 2,4 s Flug, Landung 4,4 g |
| **Plateau-Abfahrt (Drop)** | Klippe 6 m (Irre auch 12 m), Landehang als Straße, unten tiefer Grund | 23×, 1,9–2,3 s Flug, Landung bis 10 g, 0 Crashs |
| **Halfpipe** | Fahrbahn im Tal, beidseitig Viertelröhren (Radius 9 m, 62°) | 14×, bis 336 km/h |
| **Looping/Röhre/Korkenzieher** | wie bisher, auf Gelände-Sockeln | Looping 34×, 7,8 g |

Häufigkeit (100 Seeds je Stufe): Serpentine 54–63 %, Kuppe 55–66 %, Hang 80–96 %, Schluchtsprung 32/92/95 %,
Drop 31/62/66 %, Halfpipe 28/35/53 %, gewollter Tunnel 44/70/86 % (dazu Tunnel von selbst: 16/20/28 von 30).
Korkenzieher kommen auf Gelände-Strecken selten vor (2 von 100) – die langen Geraden gehen an die Gelände-Elemente.

**Galerie:** `?gallery=gel` zeigt eine Gelände-Strecke (`4-2-g`) mit allen Elementen (Serpentine, Kuppe, Hang, Mulde, Tunnel,
Schlucht, Drop, Halfpipe, Looping, Brücke); `?gallery` bleibt die Baustein-Galerie wie bisher.

## Kamera, Karte, Regeln

- **Verfolgerkamera** prüft jetzt auch das Gelände (5 Strahlen gegen Strecke *und* Hang) und bleibt über dem Gelände;
  im Tunnel liegt das Physik-Gelände unter der Fahrbahn. Browser-Test 4711-3-g: **0 von 128 Bildern verdeckt**.
- **Streckenkarte** im Menü mit Höhenschattierung (Licht von Nordwesten, Fels grau, Wasser blau), Fahrbahn hell = hoch,
  Tunnel gestrichelt, Brücken mit Schatten.
- **Abgestürzt** gilt auf Gelände-Strecken auch vom Damm, von der Plateau-Kante oder in die Schlucht (4 m unter der
  Fahrbahn im Gelände → Reset +5 s wie jeder Crash).
- Kuppe: Tempo-Profil erlaubt dort kurz −0,45 g Anpressdruck, keine Saugkraft (n21) – die Luftphase ist gewollt.

## Leistung

| | flach | Gelände |
|---|---|---|
| Gelände-Dreiecke Ø (Node, 30 Strecken) | 35 600 | 36 700 (+3 %, max ×1,26) |
| Browser, 8 Blickpunkte, 4711-2 / 20261001-2 / 1038-2: Draw-Calls Ø | 72,6 / 70,0 / 55,0 | 66,8 / 63,1 / 55,4 |
| dto. Dreiecke Ø | 254 k / 251 k / 162 k | 229 k / 187 k / 149 k |
| dto. Renderzeit je Bild | 1,06 / 1,05 / 0,76 ms | 0,93 / 0,77 / 0,81 ms |
| Bauzeit (Strecke + Ideallinie + Profil) Median | 37–49 ms (n19) | 63 / 72 / 86 ms |

Damit das hügelige Gelände nicht ×2,7 so viele Dreiecke braucht: fein bis 1,2 Felder um die Strecke, grobe 20-m-Blöcke
dürfen bis 2,5 Felder 1,5 m, weiter draußen 5 m vom exakten Gelände abweichen (die Physik nutzt immer das volle Raster).
Rohdaten: `tools/gelaende_tris.mjs`, `tests/perf_gelaende.py`.

## Tests

| Test | Ergebnis |
|---|---|
| `node tools/quote_gel.mjs 300 --stufe=1/2/3` | 300/300, 300/300, 300/300 ohne Entschärfen |
| `node tools/jump_easy_batch.mjs 30 --gel` | Leicht 90/90 ohne Crash, 120 Sprünge, Flug Median 2,3 s |
| `node tools/gelaende_mess.mjs 12` | Tabelle oben (Tempo, Luft, Last, Abheben je Element) |
| `node tests/node/test_gelaende.mjs` | Schlüssel, Determinismus, alte Codes bitgleich, Steigung, keine Stufen, Gelände nie über der Fahrbahn (auch unter Halfpipe-Wänden), Tunnel (Physik unter / Hügel über dem Gewölbe), Schlucht ≥ 18 m tief mit Fluss, Elemente, Galerie, Autopilot |
| `node tests/node/build_hash.mjs` | 38/38 alte Strecken bitgleich |
| `node tests/node/test_alte_codes.mjs --verify` | 249/249 identisch, geprüft 249/249 |
| `npm run test:node` | alle 25 grün |
| `python3 tests/test_gelaende_ui.py` | Menü, Karte, Rennen im Ziel, Kamera 0 verdeckt, hochkant ok, 0 Fehler |
| `smoke`, `test_race`, `test_hochformat`, `test_strecken3d_ui` (angepasst an den neuen Schalter) | grün, 0 Fehler |

## Fotos (selbst geprüft: „Trackmania-Gelände oder Autobahn auf Stelzen?“ – Gelände)

`tests/shots/final/gelaende_*.jpg`: Schluchtsprung von oben (Fluss, Schiffe), Tunnelportal im Einschnitt, Halfpipe im
Tal, Plateau-Abfahrt, Steilkurve in der Mulde, Brücke, Serpentine, Übersichten 1038-1-g / 4711-3-g / 72271-3-g; hochkant
Schluchtsprung, Serpentine, Übersicht; Menü quer/hoch, Streckenkarte. Volle Serie: `python3 tests/gelaende_shots.py quer|hoch
[galerie]`.

## Bitte am Handy testen

1. Menü öffnen: Die **Strecke des Tages** ist jetzt eine Gelände-Strecke („Code …-g · ⛰️ … m“, Karte mit Hügeln).
2. **`4711-3-g`** (Irre, 🔢 Code): Schluchtsprung über den Fluss, Tunnel, Brücken, viel Auf und Ab.
3. **`25-2-g`** (Sportlich): alle Elemente auf einer Strecke – Serpentine, Kuppe, Hang-Querfahrt, Mulde, Tunnel,
   Schlucht, Drop, Halfpipe. (`?gallery=gel` ist die Strecke `4-2-g`, ebenfalls mit allen Elementen.)
4. **`1038-1-g`** (Sanft): ruhige Hügel, Serpentine, Kuppe, Hang.
5. Schalter **▭ / 🏗️ / ⛰️** neben der Stufe: flach und Hochstraße sind dieselben Strecken wie bisher.
6. Hochkant: Kamera im Tunnel und im Einschnitt.

## Grenzen (ehrlich)

- Die Kuppen-Luftphase ist kurz (höchstens ~0,4 s, im Mittel 0,1 s): die Haftung bei Tempo (n21) und der Abtrieb drücken
  das Auto stark an; länger wäre gefährlich, weil im Flug nur 0,7 g wirken und der Hang dahinter steiler abfällt.
- In der Verfolgerkamera neigt sich das Bild mit dem Auto – Hang-Querfahrt und Mulde sieht man am besten im Hubschrauber.
- Korkenzieher sind auf Gelände-Strecken selten; die Tunnel-Häufigkeit ist hoch (der Generator macht aus tiefen
  Einschnitten gern einen Tunnel, höchstens 2 je Strecke).
- Ferne Hänge sind grob (20-m-Blöcke, bis 5 m Abweichung) – im Dunst kaum zu sehen.
- Gelände-Themen (Wüste, Alpen …) folgen in n20.

## Commits (n22)

- `8f60cee` Etappe A: Gelände-Generator, Höhenverlauf, Gelände an der Fahrbahn, Serpentine, Kuppe, Hang, Schlucht, Tunnel,
  Brücken, Schalter, Karte, Kamera
- Etappe B: Drop als Plateau-Kante, Halfpipe-Gelände, Mulde, Galerie `?gallery=gel`, Leistung (+3 % Dreiecke), Schräglage
  steiler, Feinschliff, Bericht (dieser Commit)
