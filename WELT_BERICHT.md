# Stuntbahn – größere Welt (27./28.09.2026)

Peters Wunsch: „Bezüglich Speed: und wenn du die Welt im Verhältnis zum Auto etwas vergrößerst?“

## Kurz
- **Ein Regler: `WORLD_SCALE` in `src/track/defs.js`, Standard 2.** Die Felder sind 40 statt 20 m groß.
  Kurvenradien, Geraden, Gelände, Sichtweite und Szenerie wachsen mit.
  - Auto, Physik, Kamera-Abstand und Cockpit bleiben unverändert.
  - Die Stunt-Bauwerke behalten ihre Maße aus dem 20-m-Raster (Auto-Maßstab): Looping, Schanze, Röhre,
    Korkenzieher-Rolle, Slalom.
- **Die Spitzen sind jetzt etwa doppelt so hoch wie vor dem Tempo-Umbau (n9):**
  - Generierte Strecken: 162–227 km/h, vorher 87–138 km/h (×1,86 bis ×2,14).
  - Demo: 97 → **191 km/h** (×1,97). Beispiel-Rundkurs: 138 → **302 km/h**.
  - .TRK-Teststrecken: 269–289 km/h, auf der Eis-Strecke 197 km/h.
  - Auf der 38-km-Strecke LONG_GO2 fährt das Auto 471 km/h.
- **Runden +33 bis +40 %**, bei doppelter Streckenlänge. Das liegt im gewünschten Rahmen (≤ +40 %).
- **A/B-Vergleich:** `?welt=1` ist die alte Welt. Die Node-Messung ergibt bitgleiche Rundenzeiten wie vorher
  auf allen 12 Strecken und allen Stufen.
  - Anders als vorher verhalten sich nur absichtliche Ausflüge ins Gelände: Die behobenen Fehler der
    Abkürz-Regel gelten in beiden Welten (siehe unten).
- Alle Stufen fahren alle Messstrecken ohne Crash. Alle Sprünge landen im Tempo-Fenster, Loopings und
  Korkenzieher laufen sauber.
- **Korpus (dieselben 200 Archiv-Strecken wie vorher):**
  - Leicht im Ziel: 194 → **196**.
  - Ohne Hilfen: 183 → **193**.
  - Ohne Crash: 185 → **195**.
- Generator 120/120 lösbar (0 Entschärfungen). Leicht, Spieler tut nichts: 120/120 ohne Crash.
- **Bestzeiten:** Die neue Welt hat eigene Listen. Die alten Zeiten bleiben gespeichert und stehen im Menü
  als „alte Welt“ bzw. „alte Physik“. Es wird nichts gelöscht.

## Warum Maßstab 2 (gemessen, Node, Autopilot, Leicht)
| Maßstab | Demo-Spitze | Seeds (5) | .TRK-Tests (ohne Eis) | Runden gegenüber HEAD |
|---|---|---|---|---|
| 1 (HEAD) | 125 km/h | 107–138 km/h | 176–187 km/h | – |
| 1,75 | 174 km/h | 150–209 km/h | 248–264 km/h | +24–30 % |
| **2** | **191 km/h** | **162–227 km/h** | **269–289 km/h** | **+33–40 %** |

Vor dem Tempo-Umbau lag die Demo bei 97 km/h. Maßstab 2 ergibt ×1,97 und trifft damit Peters „etwa doppelt so
hohe km/h“. 1,75 bringt nur ×1,8. Mehr als 2 ließe die Runden über +40 % wachsen.

## Was mitwächst und was nicht (jedes Maß geprüft)
Grundsatz:
- **Grundriss wächst mit S.** Kurven sind dadurch √S-mal schneller, Geraden doppelt so lang.
- **Was an der Fahrphysik hängt, bleibt**, sonst kippen Stunt-Tempi und Tempo-Fenster.
- **Höhen bleiben.** Rampen und Kuppen werden flacher, das Auto fährt sie mit mehr Tempo bei gleicher
  Vertikal-Beschleunigung.

| Maß | Entscheidung | Begründung |
|---|---|---|
| Feldgröße `TILE` | 20 → **40 m** (20·S) | Der Regler selbst |
| Kurvenradien (eng T/2, weit 1,5·T, Steilkurve), Schikanen-Versatz 7,5·S | wachsen | Grundriss |
| Ebenenhöhe `LEVEL_H` 6 m (Import 5 m) | **bleibt** | Durchfahrtshöhe hängt am Auto. Rampen werden flacher (15,7° → 8°), das Auto hebt an der Rampenkuppe erst bei doppeltem Tempo ab. Das passt zur doppelten Geschwindigkeit. |
| Kuppe | Höhe 3,4 m·S, Länge 2·T | Gleiche Form, Abheb-Tempo wächst wie bei Kurven mit √S |
| Fahrbahnbreite `ROAD_HW` | 4,5 → **5,6 m** (+25 %) | Moderat breiter, sonst wirkt die Straße in der großen Welt wie ein dünnes Band. Pfeiler, Querbalken, Grube, Looping-Stützen, Portal, Autobahn und Überführungs-Widerlager rechnen jetzt aus `ROAD_HW`. Randsteine bleiben 1,1 m. |
| Looping (S = 56 m) | bleibt | Mindesttempo oben hängt am Radius. Mittig im 80-m-Stück, davor und danach Straße. |
| Röhre | Länge = Stück, Querschnitt bleibt | Der Querschnitt ist Auto-Maßstab |
| Korkenzieher-Rolle (R 3,6 m, 26 m lang) | bleibt, mittig im Stück | Rollrate. Die Wendel (Kreis T/2) gehört zum Grundriss und wächst. |
| Slalom-Blöcke, Röhren-Buckel, Bodenwellen | bleiben, mittig im Feld | Fahrgasse und Federweg |
| Schanze: kickStart 4, Lippe 28°, Lücke 20 m, Landung 20 m/3,5 m | **bleibt** (`JUMP_T`) | Im 120-m-Stück liegen 30 m Anlauf davor und 30 m Auslauf dahinter. Tempo-Fenster, Flugzeit (2,06 s) und Scheitel bleiben genau wie im Sprung-Auftrag abgestimmt. |
| `jumpWindow()`-Suchbereich 8–70 m/s | bleibt | Das Fenster ist unverändert (14,2–19,5 m/s) |
| .TRK-Lücken (k Felder) | wachsen (k·40 m) | Das Raster der Datei legt sie fest. Die Suche in `genericJumpWindow` reicht jetzt bis 140·S m und 70·√S m/s. |
| .TRK-Absprung-Rampe | 18°-Lippe wie bisher, Schanze ~28 m lang, davor flach | Auf der ganzen Feldlänge passt die Form bei 5–6 m Höhe nicht, die Lippe wäre waagrecht. Bei 20 m begrenzte der enge Bogen (6,2 g) das Absprungtempo (siehe Fehler 2). |
| .TRK-Landerampe | ganzes Feld; nach Lücken ab 3 Feldern steil wie die Schanze | Tempo-Fenster am Beispiel 24–28 m/s, mit kurzer Landung wären es nur 0,5 m/s. Lange Flüge sinken steil, dort passt die steile Landung. |
| Gelände | Hügel und Bergkranz ×S in Breite und Höhe | Gleiche Hangneigung und Silhouette. Der Bergkranz liegt bei 840–1900 m. |
| Gelände-Raster 5 m | bleibt; die Grafik zeichnet **adaptiv** | Fein, wo man fahren darf (1,5 Felder = Abseits-Grenze) und wo zwei Dreiecke je 20-m-Block mehr als 0,5 m vom Gelände abweichen würden (Seeufer, Hänge, Rasterrand). Sonst 20-m-Blöcke. Die Physik bleibt exakt. |
| Wasser-Raster (.TRK, 1 m) | 1·S m | Gleiche Zellenzahl. Ohne Wasser wird gar nichts gerechnet. |
| Bäume | Anzahl ×S² (520 → 2080), Größe bleibt | Gleiche Dichte. Stufe 0 dünnt bei Maßstab > 1 auf die Hälfte aus. Der Abstand zur Strecke wird in Metern gerechnet (≥ 17 m hinter dem Feld wie bisher). Die Bäume stehen auf der gezeichneten Fläche, auch auf groben Blöcken und im Fernring. |
| Nebel 260–1500 m, Far-Plane 4000 | ×S | Die ganze Strecke bleibt klar, der Bergkranz liegt im Dunst |
| Fern-Gelände (Ring bis 1400 m) | ×S, rastergenau am Nahgelände | Gleich viele Dreiecke |
| Schatten-Bake | Rand, Abstand und Tiefen-Versatz aus dem Radius | Bei festen 700/1400 m wurden große Importe abgeschnitten. Der Versatz wächst mit der Texelgröße (1,26 m × S), sonst entstünden Streifen. |
| Chunks (Draw-Calls) | 100·S m | Gleich viele Draw-Calls |
| Verfolger, Cockpit, Menü-Kamera, Auto-Schatten | bleiben | Auto-Maßstab |
| Hochkant-Blick in die Kurve (40 m) | 40·S m | Kurvenradien wachsen |
| Streckenkameras | Masten alle 120·S m, an Bauwerken ab 45 m | Masten stehen am Bauwerk selbst, nicht am (jetzt längeren) Stückanfang |
| Ideallinien-Anzeige (60/115, 220/320 m) | ×S | Bremspunkte liegen weiter voraus |
| Minikarte | unverändert | Rechnet in Feldern und ist lesbar (Foto) |
| Checkpoints, Start/Ziel | bleiben am selben Punkt im Feld | Markierung in Auto-Maßstab |
| Abseits 30 m / 4 s, Hinweis ab 18 m | 30·S / 18·S m, 4 s bleibt | Die Nachbar-Abschnitte liegen doppelt so weit weg |
| Abkürz-Toleranz 8 m | 8·ROAD_HW/4,5 (= 10 m) | Der Gewinn beim Kurvenschneiden hängt an der Fahrbahnbreite |
| „Verirrt“ ±950 m | ±950·S m | Rand des Bergkranzes |
| Reset-Positionen (45/12 m), Rückspulen, Geister, Replay | bleiben | Auto-Maßstab. Geister der alten Welt werden nicht abgespielt (eigene Schlüssel). |
| Tracker-Suchfenster (−25/+70 Punkte) | ×S | Siehe Fehler 5 |
| Korkenzieher-Spurversatz (2,2 m über 7 m) | bleibt, direkt an der Rolle | Siehe Fehler 4 |

## Gefundene und behobene Fehler
Grundlage waren eine Maßstabs-Probe (Brief) und ein Workflow mit 9 Agenten: 6 haben jedes Maß im Code
katalogisiert, 2 die Abstürze reproduziert, 1 hat auf Vollständigkeit geprüft. Danach kam ein Review-Workflow
(siehe unten).
1. **Absturz ldlBand „Invalid typed array length: -2“ (Showcase bei 30/40 m):**
   - Die Ursache lag nicht im Löser, sondern in der .TRK-Schikane. Ihr Radius war fest `R = 25` mit
     `asin(T/R)`. Das stimmt nur bei T = 20 und ergibt ab T > 25 NaN.
   - Jetzt gilt R = 1,25·T. Die Ideallinie meldet eine kaputte Basislinie ab sofort lesbar.
2. **.TRK-Sprünge flach:** Die Rampenform „flach → Bogen → 18°“ passt bei 5–6 m Höhe nicht auf 40 m. Die Lippe
   lag waagrecht, das Tempo-Fenster war `null`, und das Auto flog ungebremst („Harte Landung“ im Beispiel).
   - Jetzt ist die Schanze so lang, wie die Form hergibt (~28 m), davor liegt flache Fahrbahn.
   - Mit nur 20 m hätte der enge Bogen das Absprungtempo auf 38 m/s begrenzt. Das ist zu wenig für Lücken ab
     3 Feldern (Review).
   - Nach Lücken ab 3 Feldern ist die Landerampe ebenso steil.
   - Ergebnis: Brückenrampe → Lücke → Brückenrampe schaffen alle Stufen bis 4 Felder (160 m).
3. **Endlosschleife `shortcut@670m` (Demo bei 40 m):**
   - Die Schanze wuchs mit (Lippe 8,6 m hoch).
   - Dazu kam ein alter Fehler, der auch bei Maßstab 1 auftrat: Die Abkürz-Regel zählte die gefahrene Strecke
     erst ab dem ersten Schritt neben der Fahrbahn. Eine überflogene Lücke galt so als Abkürzung, sobald das
     Auto über die Landung hinausschoss.
   - Jetzt:
     - Die Strecke zählt ab dem Rücksetzpunkt.
     - Im Flug über einer Sprungzone wird nicht geprüft.
     - Der Rücksetzpunkt liegt nie in einer Sprungzone (45 m vor der Lippe).
4. **Korkenzieher-Rolle:** Das Profil bremste vor jeder Rolle auf 14 m/s, das Auto streifte beim Verlassen die
   Spurwand (Korpus: 2–3 Strecken).
   - Ursache: Der Spurversatz (2,2 m) war über die ganze, jetzt 27 m lange Anfahrt verteilt. Die Linie traf
     die Rolle schnurgerade und musste deren 41°-Knick auf 2 m nehmen.
   - Jetzt:
     - Der Versatz liegt wie im alten Raster auf 7 m direkt an der Rolle.
     - Die Ideallinie ist nur am Bauwerk plus Anfahrt in Auto-Maßstab festgelegt, nicht mehr über das ganze
       Stück.
5. **Abkürzen über große Schleifen:**
   - Der Tracker sucht den nächsten Linienpunkt nur lokal. In der großen Welt verlor er ein Auto, das quer über
     die Wiese zu einem entfernten Abschnitt fährt: Statt der Abkürz-Regel griff „Abseits“ mit +5 s.
   - Das Suchfenster wächst jetzt mit dem Maßstab.
   - Neu ist eine **Neu-Ortung**: Ist das Auto am Boden, klar neben der Fahrbahn und wieder auf oder dicht
     neben einem späteren Streckenteil, wird es dort geortet. Nur der Renn-Tracker ortet neu, nur nach vorn;
     der Autopilot sucht weiter lokal.
   - Die Abkürz-Regel prüft den Gewinn sofort nach der Neu-Ortung, auch wenn das Auto schon auf dem anderen
     Teil fährt (z. B. an einer Kreuzung abgebogen).
   - Sie läuft vor Checkpoints und Ziel, damit eine erschummelte Durchfahrt nie als Zielzeit gewertet wird
     (Review).
   - Geprüft auf einer Acht mit Kreuzung (Review-Szenario): Legal dauert die Runde 30 s. Wer abbiegt, braucht
     72–75 s oder kommt gar nicht an.
6. Weiteres:
   - Tempo-Vorschau des Autopiloten war auf 60 Punkte begrenzt. Das war zu kurz bei > 57 m/s über dicht
     gesetzten Stützpunkten.
   - Bäume bei Importen fehlten fast ganz (Streubereich ±560 m, aber Mindestabstand 625 m).
   - Der Bergkranz rückte bis an die Strecke.
   - Ohne mitwachsende Chunks hätte es fast 200 Draw-Calls gegeben.
   - Das Banner war fest 4,5 m breit, jetzt folgt es `ROAD_HW`.
   - Z-Fighting von Straße und Gelände in großer Entfernung: Das Gelände hat jetzt einen Polygon-Offset.
   - Grobe Geländeblöcke: Beim Absenken unter Fahrbahnen öffneten sich Schlitze am Übergang, jetzt werden die
     Punkte neu auf die Kanten gelegt. Seen fern der Strecke verschwanden bei `?welt=1` (jetzt fehlergesteuert
     fein).

## Messung vorher (HEAD) → nachher (Maßstab 2)
`node tools/tempo_measure.mjs --laps --long`. Leicht = Spieler tut nichts, Mittel/Original = Autopilot-Eingabe.
**In allen Zeilen: 0 Crashs/Resets, alle Sprünge gelandet und im Tempo-Fenster.**

| Strecke | Länge | Leicht | Runde | Spitze vor n9 | Spitze HEAD → neu | ×vor n9 |
|---|---|---|---|---|---|---|
| Demo (1 Sprung) | 553 → 1061 m | 0:23,97 → **0:32,60** | +36 % | 97 | 125 → **191** km/h | ×1,97 |
| Beispiel-Rundkurs (Showcase) | 1465 → 2869 m | 1:07,22 → **1:29,03** | +32 % | 138 | 197 → **302** km/h | ×2,19 |
| Seed 7/2 | 1128 → 2206 m | 1:02,61 → **1:24,84** | +36 % | 103 | 125 → **203** km/h | ×1,97 |
| Seed 42/3 (2 Sprünge) | 1367 → 2641 m | 1:12,42 → **1:37,06** | +34 % | 101 | 134 → **212** km/h | ×2,10 |
| Seed 20260927/2 | 981 → 1914 m | 0:50,84 → **1:09,93** | +38 % | 87 | 107 → **162** km/h | ×1,86 |
| Seed 4711/3 (2 Sprünge) | 1340 → 2587 m | 1:11,70 → **1:35,50** | +33 % | 101 | 126 → **207** km/h | ×2,05 |
| Seed 1000/1 | 708 → 1373 m | 0:33,34 → **0:44,34** | +33 % | 106 | 138 → **227** km/h | ×2,14 |
| OVAL.TRK | 588 → 1177 m | 0:19,45 → **0:26,89** | +38 % | 132 | 187 → **289** km/h | ×2,19 |
| SCHOTTER.TRK | 708 → 1417 m | 0:24,84 → **0:34,03** | +37 % | 132 | 185 → **288** km/h | ×2,18 |
| ZIP1.TRK | 508 → 1017 m | 0:17,51 → **0:24,31** | +39 % | 127 | 176 → **269** km/h | ×2,12 |
| ZIP2.TRK (Eis) | 708 → 1417 m | 0:33,27 → **0:46,47** | +40 % | 104 | 132 → **197** km/h | ×1,89 |
| LONG_GO2.TRK (Korpus) | 20,0 → 37,7 km | 15:30,16 → **20:35,31** | +33 % | – | 345 → **471** km/h | – |

Mittel und Original liegen je Strecke innerhalb von 0,5 s neben Leicht, auf LONG_GO2 innerhalb von 4 s, wie
vorher. Rohdaten:
`tests/out/welt/tempo_vorher.json` / `tempo_nachher.json` (nur lokal).

### Breitere Prüfungen
| Prüfung | vorher (HEAD) | nachher |
|---|---|---|
| Generator 40 Seeds × 3 Stufen (Autopilot ohne Hilfen) | 120/120 | **120/120**, 0 Entschärfungen |
| Generator „Leicht“, Spieler tut nichts (87 Schanzen) | 120/120 ohne Crash | **120/120 ohne Crash**, Flugzeit 2,06 s, härtester Aufprall 4,4 m/s |
| .TRK-Korpus, dieselben 200 Dateien: Leicht im Ziel | 194 | **196** (keine Strecke fällt neu aus) |
| · ohne Crash | 185 | **195** |
| · streng ohne Hilfen | 183 | **193** |
| · Höchsttempo je Strecke, Median / 90 % / Max | 183 / 286 / 371 km/h | **288 / 413 / 490 km/h** |
| Maßstab 1 (`STUNT_WELT=1`) gegen HEAD | – | alle 12 Strecken × 3 Stufen **bitgleich** |

Hinweis zum Korpus: In `trk_local/zak_new/` sind am 27.09. um 22:49 durch einen anderen Prozess 20 neue
Dateien dazugekommen (nicht angefasst). Sie verschieben die gleichmäßige Auswahl. Der Vergleich läuft deshalb
mit der neuen Option `--list=` (`tests/node/test_trk_corpus.mjs`) auf genau denselben 200 Dateien.

## Leistung (Handy-Profil)
Gemessen headless mit `tests/perf_welt.py`: Pixel-7-Profil quer, Qualitätsstufe fest, Autopilot fährt, Verfolger.
Es gab zwei Runden je Variante, abwechselnd. Die Grafik läuft über die M1-GPU.

**Wichtig:** Die rAF-Bildrate war während der ganzen Nacht nicht verwertbar. macOS-Dienste (`mediaanalysisd`,
`textunderstandingd`) belasteten die Maschine, auch HEAD kam nur auf 8–15 fps (zu Beginn der Sitzung noch 56). Deshalb vergleiche
ich die **Renderzeit je Bild bis die GPU fertig ist**: Szene angehalten, 1-Pixel-`readPixels`, Median aus
40 Bildern. Dazu kommen die CPU-Zeit der Spiellogik je Spielsekunde und die Szenengröße.

| Strecke | Stufe | Renderzeit HEAD → neu | Dreiecke HEAD → neu | Draw-Calls | Physik je Spielsekunde | Laden (Boot) |
|---|---|---|---|---|---|---|
| Tag 20260927-2 | 0 | 2,7–3,8 → 3,1–3,3 ms | 121 k → 119 k | 41–47 → 36 | 5–6 → 4–5 ms | 1,5–1,7 → 1,8–2,1 s |
| | 1 | 4,4–5,1 → 5,1–5,2 ms | 177 k → 179–182 k | 56–62 → 47–53 | 5–6 → 4–5 ms | 1,5–1,7 → 1,9–2,1 s |
| 4711-3 | 0 | 3,2–3,5 → 2,9 ms | 126–129 k → 138–141 k | 39–48 → 48–66 | 3 → 3–4 ms | 1,9–2,2 → 2,5 s |
| | 1 | 4,5–5,0 → 4,8–5,0 ms | 185 k → 200–203 k | 63 → 66–81 | 2,5–3 → 4 ms | 2,0–2,2 → 2,4–2,5 s |
| Beispiel-Rundkurs | 0 | 2,9 → 3,4 ms | 132 k → 164 k | 47–48 → 52 | 12–14 → 5 ms | 2,0–2,2 → 2,4–2,7 s |
| | 1 | 4,9–5,4 → 5,5–5,9 ms | 188 k → 225 k | 62 → 67 | 13–15 → 5 ms | 2,1–2,2 → 2,4–2,5 s |

- **Renderzeit:** gleich bis +15 % (Beispiel-Rundkurs). Die Messschwankung liegt selbst bei ±15 %.
- **Dreiecke:** 111 k davon sind das Auto-Modell (unverändert). Dazu kommen:
  - Strecke +7–13 k, weil die Strecken länger sind.
  - Bäume +7–9 k (instanziert, 1–2 Draw-Calls).
  - Das Nahgelände liegt dank adaptivem Raster bei 33–53 k statt 41 k. Voll aufgelöst wären es bei Maßstab 2
    166 k.
- **Laden:** +0,3–0,5 s beim ersten Öffnen, weil die Autopilot-Probefahrt länger dauert (längere Strecke). Danach
  liegt das Ergebnis im Cache.
  - Streckenbau im Browser (`buildMs`) bleibt gleich (310–370 ms).
  - Speicher (JS-Heap) bleibt gleich (26–45 MB).
  - Das Wasser-Raster der Importe ist gleich groß: gröbere Zellen, und ohne Wasser wird nichts gerechnet.
- **Stufen:** Stufe 0 hat bei Maßstab 2 halb so viele Bäume. Stufe 1 ist Standard am Handy. Die Qualitäts-
  Automatik bleibt unverändert.
- Ein echtes Handy zeigt die Bildrate zuverlässiger. Bitte am Handy prüfen (Liste unten).

## Review (Workflow, adversarial)
Vor dem Commit hat ein zweiter Workflow den Diff in 5 Dimensionen geprüft: Geometrie, Gelände, Rennregeln,
Speicher/Grafik und Profil/Ideallinie. Jeden Befund hat ein weiterer Agent zu widerlegen versucht.
- 9 Befunde bestätigt, alle behoben:
  - Neu-Ortung an Kreuzungen und Zieldurchfahrt nach Abkürzung (beide „hoch“).
  - Schanzenlänge bei Import-Lücken.
  - Korkenzieher-Knick.
  - Grobes Gelände am Rasterrand, Schlitze beim Absenken, schwebende Bäume.
  - Seen bei `?welt=1`.
  - Neu-Ortung auch rückwärts.
- 4 Befunde verworfen, weil sie schon behoben waren (Schatten-Versatz, Ausdünnung auf Stufe 0, Rundenzählung,
  Bäume im Fernring).

## Bestzeiten und Geister
- Neue Welt = neue Wertung. Die Schlüssel bekommen den Zusatz `@w2` (`WORLD_TAG`), z. B. `easy@t2@w2`.
- Die alten Einträge bleiben unverändert gespeichert. Menü und Bibliothek zeigen sie klein an:
  - „**alte Welt**: 🟢 0:50,8 …“ = neue Physik, Maßstab 1.
  - „**alte Physik**: …“ = vor n9.
- Geister der alten Welt werden in der neuen nicht abgespielt.
- `?welt=1` wertet wieder in den Listen der alten Welt.
- Geprüfte Strecken (Autopilot-Probefahrt, Entschärfungen) werden je Maßstab getrennt gespeichert. Ein
  A/B-Wechsel übernimmt keine fremden Ergebnisse.
- Beim Löschen einer importierten Strecke verschwinden die Geister aller Wertungen.

## Tests
- `npm run test:node`: **alle 11 grün**, bei Maßstab 2 und bei `STUNT_WELT=1`. Angepasst:
  - `test_trk_import`: Feldmitte über `tileX`.
  - `test_reset`: Schlüssel mit Welt-Zusatz.
  - `test_free_steer`: Zielpunkt der Abkürz-Schleife in Metern × Maßstab; der Mogel-Bot lenkt ab A selbst.
- Playwright, nacheinander über die GPU, **alle grün, 0 pageerrors:** smoke, test_race, test_touch,
  test_cockpit_ui, test_reset_ui (prüft jetzt auch „alte Welt“), test_lineviz, test_trk_ui, test_fx,
  test_sound_pad, test_hochformat.
- Neu:
  - `tests/welt_shots.py`: Fotos und Prüfungen, u. a. „Auto im Sprung wirklich in der Luft“.
  - `tests/perf_welt.py`: Ladezeit und fps im Handy-Profil.
- Zuerst eigener Commit: Die Test-Browser laufen über die M1-GPU (Metal) statt SwiftShader. Nach dem Boot
  prüft ein Renderer-Check einmalig die GPU und warnt sonst. `WEBGL=swiftshader` ist der Rückweg.
- Cache-Busting: `tools/update_sw.py` → neue Version.

## Fotos (selbst angesehen)
Unter `tests/shots/final/welt_*.jpg`:
- `welt_quer_verfolger_tempo` (Handy quer):
  - Strecke des Tages, 151 km/h.
  - Breitere Straße, Bäume ab ~17 m neben der Strecke, Hügel und Wald bis zum Horizont.
  - Die Welt wirkt nicht leer.
- `welt_quer_beispiel_verfolger`: Beispiel-Rundkurs, 294 km/h im 5. Gang, Checkpoint-Band auf der Geraden.
- `welt_quer_sprung_aussen` / `welt_hoch_sprung_aussen`:
  - Standard-Schanze von außen, das Auto 3,5 m über der Lippe über der Wassergrube.
  - Schanze und Landerampe sind gut zu sehen.
- `welt_quer_beispiel_sprung_aussen`: Sprung über die Scheune zwischen den Brückenrampen (Lücke jetzt 40 m).
- `welt_hoch_verfolger_tempo`: Handy hochkant, 171 km/h, das Auto im unteren Drittel.
- `welt_desktop_welt2_uebersicht` und `welt_desktop_welt1_uebersicht`:
  - Dieselbe Strecke (4711-3) von oben, neue und alte Welt im Vergleich.
  - Der Nebel beginnt erst hinter der Strecke, die Berge stehen im Dunst.
  - In der großen Welt sind die Stunt-Bauwerke relativ kleiner. Das ist gewollt, sie haben Auto-Maßstab.
- `welt_quer_bibliothek`: Die Minikarte ist unverändert lesbar.

## Grenzen / offen (ehrlich)
- **Seed 20260927/2 liegt bei 162 km/h** (×1,86, knapp unter 175). Die Strecke ist eng und hat viele enge Kurven.
- **ZIP2 (Eis) liegt bei 197 km/h** statt ≥ 250. Auf Eis begrenzt die Haftung den Antrieb (Haftung 0,5). Das
  Verhältnis zu vor n9 ist ×1,89 wie bei den anderen.
- **Sprünge bleiben bei ~55–60 km/h:** Vor jeder Standard-Schanze bremst das Auto aus bis zu 200 km/h herunter
  (30 m Anlauf im Stück, davor die Geraden).
  - Möglich wäre eine größere Schanze, deren Lücke und Landung mit dem Maßstab wachsen. Das Tempo-Fenster läge
    dann bei ~85 km/h, der Flug wäre länger und der Aufprall härter.
  - Das wäre ein eigener Abstimmungsauftrag (Sprung-Gefühl aus dem Sprung-Bericht). Bei .TRK-Strecken wachsen
    die Lücken schon mit dem Raster.
- Kurven werden nur √S-mal schneller (reibungsbegrenzt), Geraden bringen den Rest. Für doppeltes Kurventempo
  bräuchte es Radien ×4. Das geht auf dem Raster nicht.
- Der statische Schatten ist bei großen Strecken weicher (Texel ×2), weil die Kartengröße je Stufe bleibt
  (Speicher am Handy).
- Lange Strecken brauchen länger zum ersten Laden: Die Probefahrt des Autopiloten ist länger, die Ideallinie
  von LONG_GO2 braucht ~0,8 s statt ~0,3 s.
- **.TRK-Lücken über 5–6 Felder** (200–240 m) enden bei Maßstab 2 mit harter Landung. Das Tempo-Fenster ist dort
  nur ~0,5 m/s breit. Im Archiv sind das 4 von 7559 Lücken (99,4 % sind 1 Feld lang). Bis 4 Felder läuft
  alles.

## Bitte am Handy testen
1. **Strecke des Tages** auf Leicht: Wirkt das Tempo jetzt wie „doppelt so schnell“? Ist die Welt zu leer oder
   zu weit?
2. **Mittel/Original:** Findet man die Bremspunkte vor Kurven und Sprüngen? Die Kurven kommen jetzt mit deutlich
   mehr Tempo.
3. **Ruckelt es** (vor allem Qualitätsstufe 0/1)? Dauert das Laden länger als vorher?
4. Ist die **Straßenbreite** passend (jetzt 11,2 statt 9 m)?
5. **Direkter Vergleich:** denselben Link mit `?welt=1` öffnen (alte Welt).
6. Sollen die **Sprünge** mitwachsen (größer, schneller, länger in der Luft)?
