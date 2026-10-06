# Röhre mit Hindernis (n29, 06.10.2026)

Peter (05.10.2026): „Röhre hat normalerweise ein Hindernis in der Mitte am Boden.“ – wie im Original Stunts, wo das Auto in
der Röhre über einen Buckel quer am Boden hüpft.

## Ergebnis

- Die Röhre der **generierten Strecken** (Zufall, Tages-Strecke, Code; flach, 3D und Gelände) hat jetzt in der Mitte
  (f = T, mittig in den 2 Feldern) einen **Buckel quer über den Boden**: **0,45 m hoch, 16 m lang**, sin²-Profil – dieselbe
  Form-Funktion wie der Buckel der .TRK-„Röhre mit Hindernis“ (`humpY` in `src/track/pieces.js`, von `buildPipe` und
  `PIECES.tube` benutzt). Seitlich laufen flache Schrägen (1,6 m) auf die Rohrwand, keine Stufe.
- **Gelb-schwarze Warnstreifen** auf der steilen Vorderseite – in der Röhre von Weitem zu sehen, auch im Cockpit und in
  der Stoßstangen-Kamera (gleiches Markierungs-Mesh wie die Schanzen-Streifen aus n24).
- **Leicht/Mittel-HUD:** kurz vor dem Buckel „Röhre – Buckel! – Autopilot lenkt“ bzw. „… – Spurhilfe“.
- **A/B:** `?roehre=glatt` = glatte Röhre wie bis n28 (bitgleich, wertet nicht, eigener Prüf-Cache). `?stunt=1`
  (Bauwerke wie bis n25) baut ebenfalls die glatte Röhre. In Node: `STUNT_ROEHRE=glatt`, Form zum Ausprobieren
  `STUNT_BUCKEL=h,len`.
- **Sammlung und .TRK** behalten ihre Röhren bitgleich (Buckel 0,95 m / 12 m nur bei `pobst` aus der Datei, Hash über 12
  Sammlungs-Strecken gleich) – und ihre Bestzeiten. **Bestzeiten der Zufallsstrecken starten einmalig neu**
  (Hinweis-Toast im Menü, wie n26). Layouts alter Codes unverändert (`test_alte_codes`: 249/249).

## Warum nicht der .TRK-Buckel (0,95 m / 12 m)?

Gemessen mit festem Tempo (Autopilot lenkt, Tempo gehalten, `node tools/roehre_mess.mjs fest`), Röhre im Stunt-Maßstab
(11,2 m hoch). Der Hüpfer hängt an der Steigung (Abwurf ≈ v · h·π/len), nicht an der Röhrengröße – deshalb nicht mit dem
Stunt-Maßstab skaliert, sondern nach Fahrgefühl gewählt:

| Buckel | Tempo | Luft | Flughöhe | Flugweite | Dach → Decke (min) | Lage (up.y min) | Ergebnis |
|---|---|---|---|---|---|---|---|
| .TRK 0,95 m / 12 m | 80 km/h | 1,31 s | 3,01 m | 28,8 m | 6,91 m | 0,95 | ok, aber schon Katapult |
| .TRK 0,95 m / 12 m | 150 km/h | 2,55 s | 7,72 m | – | 2,47 m | 0,04 | **Crash** |
| .TRK 0,95 m / 12 m | 220 km/h | 3,85 s | 14,3 m | – | −3,6 m (Decke durchflogen) | −0,78 | **Crash** |
| **neu 0,45 m / 16 m** | 80 km/h | 0,38 s | 0,41 m | 9,4 m | 9,29 m | 0,99 | ok |
| **neu 0,45 m / 16 m** | 150 km/h | 0,74 s | 1,04 m | 32,7 m | 8,86 m | 1,00 | ok |
| **neu 0,45 m / 16 m** | 220 km/h | 1,04 s | 1,72 m | 65,7 m | 8,20 m | 0,99 | ok |

Flach und auf Ebene 1 (3D) identisch. Ausprobiert wurden außerdem 0,3/12, 0,35/16, 0,4/16, 0,5/20, 0,55/20, 0,6/24,
0,7/24: 0,45/16 trifft das Ziel „spürbarer Hüpfer, 0,5–2 m Luft“ bei den üblichen Tempi am besten (80 km/h noch ein
kleiner Hüpfer, 220 km/h unter 2 m, Decke immer > 8 m entfernt).

## Fahrer auf Zufallsstrecken (vorher = glatte Röhre n28, nachher = Buckel)

66 Zufallsstrecken mit Röhre (28 flach, 9 3D, 29 Gelände; Stufen 2–3 – Stufe 1 hat keine Röhren), je Strecke Prüffahrt,
Leicht Sauber und Brachial (Autopilot, Hände weg), Mittel „mensch-handy“ (0,35 s Reaktion, grobe Lenkstufen) und Original
ohne Hilfen „normal“ (Rauschen in der Lenkung, Gas bis 8 % über Plan, Bremse erst ab 20 % darüber), je 3 Seeds.
`node tools/roehre_mess.mjs fahrer --mehr=90 [--root=<alter Stand>]`, Zusammenfassung `--sum=vorher.json,nachher.json`.

| Fahrer | im Ziel | Röhre geschafft vorher → nachher | Crashs je 10 Runden | Crash/Reset an der Röhren-Mitte (bis 80 m dahinter) |
|---|---|---|---|---|
| Leicht Sauber | 66/66 → 66/66 | 100 % → 100 % (69/69) | 0,0 → 0,0 | 0/63 → 0/63 |
| Leicht Brachial | 66/66 → 66/66 | 100 % → 100 % (69/69) | 0,0 → 0,0 | 0/63 → 0/63 |
| Mittel (Handy-Bot) | 198/198 → 198/198 | 90,0 % → 91,7 % | 18,8 → 17,3 | 0/188 → 0/189 |
| Original (Bot ohne Hilfen) | 198/198 → 198/198 | 79,6 % → 75,1 % | 22,4 → 23,8 | 17/205 (8,3 %) → 25/210 (11,9 %) |

Buckel-Überfahrten nachher:

| Fahrer | Überfahrten | Tempo am Buckel Median (5–95 %) | Luft Median / max | Flughöhe Median / max | Flugweite Median / max | Dach → Decke min | Lage min |
|---|---|---|---|---|---|---|---|
| Leicht Sauber | 63 | 88 km/h (86–177) | 0,42 / 0,76 s | 0,64 / 1,11 m | 18 / 40 m | 6,55 m | 0,97 |
| Leicht Brachial | 63 | 88 km/h (86–180) | 0,42 / 0,77 s | 0,65 / 1,12 m | 18 / 40 m | 6,55 m | 0,97 |
| Mittel | 189 | 76 km/h (58–137) | 0,37 / 0,68 s | 0,59 / 1,55 m | 14 / 33 m | 6,54 m | 0,74 |
| Original | 210 | 81 km/h (65–178) | 0,69 / 2,23 s | 0,98 / 7,33 m | 28 / 51 m | 0,23 m | −1,00 |

Je Streckenart (alle Fahrer zusammen):

| Art | Strecken | Überfahrten | Tempo Median | Flughöhe Median / max | Weite Median | Dach → Decke min | Crash/Reset Röhren-Mitte vorher → nachher | Röhre geschafft vorher → nachher |
|---|---|---|---|---|---|---|---|---|
| flach | 28 | 241 | 81 km/h | 0,71 / 7,33 m | 20,7 m | 0,23 m | 5 → 13 | 243/274 → 244/282 |
| 3D | 9 | 59 | 127 km/h | 0,89 / 5,43 m | 26,5 m | 5,08 m | 1 → 2 | 73/81 → 72/81 |
| Gelände | 29 | 225 | 86 km/h | 0,78 / 5,19 m | 21,6 m | 4,69 m | 11 → 10 | 239/277 → 242/284 |

- **Leicht und Mittel:** kein einziger Crash am Buckel, kein Deckenkontakt, Hüpfer ~0,6 m (bis 1,5 m). Leicht fliegt
  wegen der Fahrhilfe „Magnet“ etwas flacher.
- **Original ohne Hilfen** (der absichtlich schlampige Bot): unter 90 km/h dieselbe Crashrate wie vorher (15 → 17 von
  ~135 – Wandfahrten in der Röhre gab es schon immer), mehr Crashs nur über 130 km/h (2 → 6 von ~55): der Bot fährt bis
  20 % über dem Plan-Tempo in die Röhre, fliegt weiter als geplant und kommt nach der Landung nicht mehr um die Kurve
  hinter der Röhre. Die Ausreißer (Flughöhe 5–7 m, Decke 0,2 m) sind Überfahrten mit Wandfahrt bzw. quer zur Fahrtrichtung.
  Ein Hindernis darf ohne Hilfen etwas kosten – „kein Crash-Garant“ ist erfüllt.

## Autopilot, Ideallinie, Tempo-Profil

- Linie über dem Buckel als Röhre markiert (`L.tube`), zusätzlich `L.wave = 4` (Buckel, 3 m davor bis 3 m dahinter).
- `profile.js`: am Buckel keine Kuppen- und Lastgrenze und keine Höhenkrümmung in der Haftungsrechnung (sonst bremste der
  Autopilot vor dem Buckel auf ~30 km/h bzw. 70 km/h). Neu `humpCaps`: **in der Luft bremst niemand** – kommt hinter der
  Röhre bald eine Kurve, wird das Abhebe-Tempo so begrenzt, dass das Auto nach dem Flug (Weite aus Steigung und Tempo,
  +15 %, 0,35 s Einfedern, 10 % Tempo-Reserve für Fahrer über dem Plan) noch rechtzeitig bremst. Ohne das scheiterten 4
  von 66 Prüffahrten in der engen Kurve nach der Röhre.
- Kosten: Prüffahrt-Autopilot +0,5 % Rundenzeit, Leicht +0,4/+0,5 %, Mittel-Bot +3 %, Original-Bot +2,5 % (inkl. Crashs).

## Lösbarkeit (Prüffahrt mit Entschärfen), vorher → nachher

| | Stufe 1 | Stufe 2 | Stufe 3 |
|---|---|---|---|
| flach, 300 Seeds (`node tools/quote3d.mjs 300`) | 100 % → 100 % | 100 % → 100 % | 100 % → 100 % |
| 3D, 300 Seeds (`… --3d`) | 100 % → 100 % | 100 % → 100 % (1 Entschärfung → 1) | 100 % → 100 % |
| Gelände, 100 Seeds (`node tools/quote_gel.mjs 100`) | 100 % → 100 % | 100 % → 100 % | 100 % → 100 % |
| `test_verify_batch.mjs 10` | 30/30, 0 Entschärfungen → 30/30, 0 Entschärfungen | | |

Ohne Entschärfen im Ziel (ok0) ebenfalls gleich (3D Stufe 2: 299 → 299). Die Prüffahrten der Strecken werden neu gemacht
(Prüf-Cache `VBUILD` mit `TUBE_TAG` und `@r29`).

## Leistung

| | glatt | Buckel |
|---|---|---|
| Grafik-Dreiecke der Röhre (`node tools/roehre_tris.mjs`) | 3144 | 3056 (−2,8 %; der Boden unter dem Buckel entfällt) + 12 Warnstreifen |
| Kollisions-Dreiecke der Röhre | 1738 | 1818 (+4,6 %) |
| Batches (≈ Draw-Calls der Strecke), Galerie / 3 Zufallsstrecken | 72 / 64, 71, 48 | gleich |
| Browser, Verfolger vor dem Buckel (renderer.info, quer) | 107 Calls, 308 218 Dreiecke | 107 Calls, 307 538 Dreiecke |

## Sichtprüfung (Fotos `tests/shots/roehre/`, Auswahl `tests/shots/final/roehre_*.jpg`)

`python3 tests/roehre_shots.py`: Galerie, Original-Physik mit Autopilot, quer und hoch, Verfolger/Cockpit/Stoßstange vor
dem Buckel und in der Luft (~1,5 m über der Fahrbahn), dazu `?roehre=glatt`. Selbst angesehen: Buckel mit Streifen in
allen drei Kameras klar zu erkennen (im Cockpit über der Haube, in der Stoßstangen-Kamera am Horizont der Röhre), Decke
nirgends durchstoßen, keine Naht am Mantel (eine 1-cm-Naht über dem Buckel-Fuß im ersten Durchgang ist behoben: der
Übergang liegt jetzt 0,8 m vor/hinter dem Buckel auf ebener Linie). 0 pageerrors, Rauchtest 0 Fehler.

## Tests

- `npm run test:node`: 33/33 grün, darunter neu `tests/node/test_roehre_buckel.mjs` (Buckel mittig, Höhe/Länge, Decke 2R
  darüber, 3D/Gelände, Profil bremst nicht, 80/150/220 km/h ohne Crash/Deckenkontakt, Autopilot ohne Reset, Prüffahrt
  ohne Entschärfen, `?roehre=glatt` bitgleich n28, .TRK bitgleich, Bestzeiten-Neustart, A/B, HUD), `test_loop_gate`
  (Röhre) grün, `test_alte_codes` 249/249, `test_stuntgroesse` (`?stunt=1` bitgleich n25) grün.

## Handy

App einmal ganz schließen und neu öffnen (bzw. Seite neu laden) – dann lädt der Service-Worker den neuen Stand.
Danach im Menü einmal der Hinweis „Die Röhre hat jetzt einen Buckel …“, falls es Bestzeiten auf Zufallsstrecken gab.
