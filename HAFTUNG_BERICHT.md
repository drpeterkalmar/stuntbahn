# Bodenhaftung, Wiese, lange Sprünge, Bestzeiten weg (n21, 01.10.2026)

Peters Wunsch (30.09.2026): „Viel mehr Bodenhaftung bei hoher Geschwindigkeit. Wiese muss viel stärker bremsen.
Sprungschanze ist derzeit eher eine orbitale Startrampe 🤣“ – präzisiert: „Mach einfach die Sprünge länger und stell ein
paar flache Hindernisse oder Wassergräben mit Schiffen usw. rein. Sei kreativ. Die Wiese darf nicht schneller sein als
30 km/h. Es ist eine Wiese! Bestzeiten streichen.“

Vier Etappen, jede einzeln live (B Wiese → C Haftung → D Bestzeiten → A Sprünge). Gilt für alle Stufen.

## Kurz
| | vorher (n19) | jetzt (n21) |
|---|---|---|
| Vollgas auf der Wiese | 390 km/h nach 12 s | **27 km/h** |
| Mit 200 km/h auf die Wiese | nach 3 s noch 172 km/h | **≤ 30 km/h nach 1,9 s**, kein Überschlag |
| Abheben an Kuppen (Bots, Original) | 78 × | **0 ×** |
| Abheben gesamt / Crashs / Zeit mit < 4 Rädern | 170 / 73 / 12,8 % | **59 / 41 / 6,2 %** |
| Schanze: Absprung-Tempo (Fenster) | 51–70 km/h | **140–168 km/h** |
| Schanze mit 160 km/h | 24 m hoch, 5,4 s Flug, Crash | **4,3 m hoch, 2,4 s, ~105 m weit** |
| Hindernisse in der Lücke | Wassergraben | **6 Varianten** (Kanal mit Schiffen, Busse, Bauernhof, Hafen, Zug, Zirkus) |
| Bestzeiten | Listen je Physik/Welt/Mittel-Version | **einmal gelöscht, eine Liste ohne Versionen** |

## B. Wiese = Wiese (höchstens 30 km/h)
`src/track/defs.js` `WIESE`, `src/physics/car.js`. Gleitend nach Anteil der Räder im Gras:
- Antrieb der Gras-Räder ohne Aero-Last-Verstärkung, ab 20 km/h weniger, ab 30 km/h null (Räder drehen durch); Nitro genauso.
- Gras-Widerstand am Schwerpunkt (kein Nicken, kein Überschlag): 5/s × (Tempo − 25 km/h), höchstens 30 m/s².
- Haftung (0,72) bleibt: Lenken geht (Wendekreis-Radius 6 m bei 27 km/h).
- Leicht: Tempo neben der Fahrbahn 58 → 27 km/h (`FREE.offV`), Lenk-Glättung bis zurück auf dem Asphalt (sonst ruckte die
  Lenkung beim Auffahren). Grasbüschel spritzen bei > 30 km/h, die Verfolgerkamera rumpelt leicht.

Messung `node tools/wiese_probe.mjs` (vorher: `STUNT_WIESE=alt`):

| Probe | vorher | jetzt |
|---|---|---|
| Vollgas ab 0, km/h nach 1/6/12 s | 38 / 287 / 390 | 27 / 27 / 27 |
| Vollgas ab 150 km/h, nach 2 s | 243 | 27 |
| Rollen ab 150 km/h, nach 1/3/10 s | 145 / 132 / 100 | 70 / 22 / 0 |
| Abkommen 200 km/h geradeaus / voll gelenkt / Vollgas + gelenkt: ≤ 30 km/h nach | nie (nach 3 s 172) | 1,88 / 1,67 / 1,75 s |
| Abkommen 300 km/h (dito) | nie (nach 3 s 254) | 2,64 / 2,11 / 2,19 s |
| größte Neigung dabei | – | 8–12°, kein Crash |
| Rückweg aus Senken/über Böschungen (einfacher Fahrer, 3 Strecken, 48 Startpunkte) | 35/48, bis 310 km/h | **40/48**, höchstens 28 km/h, bergauf bis 4,7 m |

Die 8 Ausfälle beim Rückweg: Leitplanke/Wand im Weg oder unter eine Hochstraße gefahren (einfacher Test-Fahrer).

## C. Bodenhaftung bei hohem Tempo
`src/physics/car.js` (`haftN/haftA/haftV/haftR/haftK`, `rollH`), `src/game/race.js` (`haftOffAt`):
- **Saugkraft:** Fällt die Radlast bei Tempo unter das Gewicht (Kuppe, Welle, verwundener Übergang), zieht eine Kraft am
  Schwerpunkt das Auto zur Fahrbahn und füllt die Radlast wieder auf. Obergrenze 2 g, ab 90 km/h mit dem Tempo² wachsend
  (eine Kuppe braucht κ·v²), nur bis 1,2 m über dem Boden. Liegt das Auto satt auf (Kurve, Ebene), wirkt sie nicht –
  Kurvenhaftung und Mittel-Grenztempo bleiben unverändert (Test). Aus an Schanzen (Anlauf bis Ende Landerampe), auf den
  Achterbahn-Wellen, im Hüpfer, in Looping/Röhre/Korkenzieher.
- **Kraftangriff höher bei Tempo** (`rollH` 0,3 → 0,4 m ab 110–180 km/h): weniger Lastverlagerung, kurveninnere Räder
  bleiben unten. Langsam (Slalom) und im Looping wie bisher – sonst streifte „Mittel perfekt“ 2× im Slalom.
- Tempo-Profil rechnet die Saugkraft bewusst nicht ein (`PROF.haft` 0): sie ist Reserve. Gemessen mit 25 % / 50 %
  eingerechnet: 37 / 38 statt 28 Crashs.

`node tools/fahr_analyse.mjs --teil=haftung --magnet=0` (Original, Bots, vorher = Kopie von 0e18a05):

| Stichprobe | Bot | Crashs | Zeit < 4 Räder | Abheben n / s | davon Kuppen | Ziel |
|---|---|---|---|---|---|---|
| `--gen=4` (15 Strecken) | normal | 73 → **41** | 12,8 → **6,2 %** | 170 / 82,5 → **59 / 24,6** | 78 → **0** | ≤ 45 / ≤ 7 % / ≤ 70 / ≤ 20 ✅ |
| | perfekt | 0 → 0 | 5,0 → 3,6 % | 20 → **9** (nur Bodenwellen + Röhre) | 6 → 0 | nur Stunts ✅ |
| `--gen=6 --samh=30` (37 Strecken) | normal | 188 → **103** | 14,6 → **6,5 %** | 426 / 210 → **144 / 57** | 192 → **0** | |
| | perfekt | 0 → 0 | 5,4 → 4,0 % | 36 → **20** (Bodenwellen + Looping/Röhre) | 9 → 0 | |

Was bleibt: Abheben in Korkenziehern/Röhren (das Auto fährt dort teils auf 1–2 Rädern, auch vorher) und auf Bodenwellen.
Kuppe mit Vollgas: 144 und 180 km/h über die Kuppe → 0,00 s in der Luft (vorher 2,2 / 2,0 s), Test `test_haftung`.

## D. Bestzeiten gestrichen
`src/game/store.js`: Beim ersten Laden werden einmalig alle Bestzeiten und Geisterautos gelöscht – auch „alte Physik“,
„alte Welt“, „erste Physik“ und die alte Mittel-Liste (Markierung `reset: 21`, idempotent). Danach gibt es je Strecke nur
noch die Wertung Fahrhilfe × Totalschaden × Extras, ohne Versions-Zusatz. Die Menü-Zeilen „alte Physik/alte Welt/erste
Physik“ sind weg. Einstellungen bleiben, die Leicht-Zeitenliste bleibt (ohne die aus alten Bestzeiten übernommenen
„früher“-Einträge). **A/B-Links werten nicht** (`?wiese=alt`, `?haft=alt`, `?schanze=alt`, `?grip=1`, `?mgrip=1`,
`?auto=alt`, `?welt=1`, `?air=`, `?lip=`): Ergebnis zeigt „A/B-Vergleich – keine Bestzeit“.
Tests: `node tests/node/test_leicht_zeiten.mjs` (echtes Alt-Profil, Neuladen, A/B) und `python3 tests/test_bestzeiten_reset.py`
(Browser, Alt-Profil per `add_init_script`: gelöscht, Menü leer, neue Bestzeit nach Neuladen noch da, `?haft=alt` wertet nicht).

## A. Schanze: weit statt hoch, mit Hindernissen
`src/track/pieces.js` (`JUMP`, `JUMP_N21`, `jumpFor`), `src/track/obstacles.js`, `src/game/race.js` („Zu kurz“).
- Das Element bleibt **3 Felder** (120 m) → **alle alten Codes behalten ihr Layout** (`test_alte_codes --verify`: 249/249,
  auch die geprüfte Fassung). Bisher standen 60 m Schanze mittig und je 30 m Straße davor/dahinter; jetzt füllt sie das
  Element: Bogen 15 m auf **11°** (Lippe 1,4 m), **Lücke 60 m**, **Landerampe 45 m** (2,5 m hoch, S-Form). Anlauf ist die
  Gerade davor.
- Liegt vor oder hinter der Schanze keine Gerade (Bodenwellen, Looping …), beginnt der Bogen erst nach 30 m im Element
  (Fenster 111–143 km/h, Lücke 30 m) – sonst erreicht das Auto das Tempo nicht bzw. kann vor dem Looping nicht mehr
  bremsen (ohne das: 3 von 120 Generator-Strecken entschärft; jetzt 0).
- Eine Rechnung für alles: `jumpWindow(J)` (Fenster, Anzeige-Flugbahn, Tempo-Profil, Autopilot) und dazu die **Decke** für
  Hindernisse = tiefste Flugbahn aller Tempi im Fenster je Meter. Luft-Schwerkraft bleibt 0,7.
- **Klippensprung** (n19) auf die neue Lippe gezogen: neue Kuppe/Hang-Werte, gleiche Feldzahl 3/4 (3D-Codes unverändert),
  Fenster 53–97 bzw. 53–111 km/h (Fall-Sprung, langsamer als die Schanze). Steilrampen haben keine Lippe (unverändert).
- **Zu kurz** = Crash „Zu kurz“ (Boden, Wasser, Bus, Container … berührt zwischen 3 m hinter der Lippe und Landerampe) oder
  Aufprall/Absturz → Reset wie jeder Crash.

Sprung-Messung `node tools/jump_measure.mjs` (Autopilot-Tempo × scale, ohne Lagehilfe; alt: `--schanze alt`):

| Tempo an der Lippe | Scheitel | Flug | Weite | | Tempo | Scheitel | Flug | Weite |
|---|---|---|---|---|---|---|---|---|
| **bis n19** 64 km/h (vbest) | 3,4 m | 2,3 s | 39 m | | **n21** 163 km/h (Autopilot) | **4,3 m** | **2,4 s** | **105 m** |
| 103 km/h | 9,4 m | 3,6 s | 92 m | | 211 km/h | 7,7 m | 3,1 s | 173 m |
| 130 km/h | 15,2 m | 4,4 s | 142 m | | 240 km/h (mehr geht auf 2 Geraden nicht) | 10,4 m | 3,6 s | 227 m |
| 162 km/h | 23,7 m | 5,4 s | 213 m, Crash | | | | | |
| 194 km/h | 34,2 m | 6,4 s | 296 m, Crash | | | | | |

Ziel (Brief): vbest 150–220 km/h → **158** ✅; Scheitel bei vbest 4–7 m → **4,0–4,3** ✅ (unterer Rand); Weite 100–200 m →
**96–105** (unterer Rand – mehr gibt das 3-Felder-Element nicht her); Flug 2–3,5 s → **2,2–2,4** ✅; am oberen Fensterrand
Scheitel ≤ 10 m / Flug ≤ 4 s → **4,5 m / 2,4 s** ✅.

Hindernisse `node tools/sprung_hindernis.mjs` (Rennlogik, Original, Tempo an der Lippe geregelt; auch `test_sprung`):

| Variante | zu kurz (126 km/h) | vmin 141 | vbest 158 | vmax 167 | 181 / 205 km/h | Dreiecke |
|---|---|---|---|---|---|---|
| Kanal mit Lastkahn (Container) + Schlepper | Aufprall | ok, 65 m | ok, 96 m, 4,0 m hoch | ok, 110 m | ok, 127 / 162 m | 552 |
| Busse (bis 11 Stück Seite an Seite) | Zu kurz | ok | ok | ok | ok | 768 |
| Bauernhof (Rundballen, Traktor mit Anhänger, Zaun) | Aufprall | ok | ok | ok | ok | 1500 |
| Hafen (40-Fuß-Container) | Zu kurz | ok | ok | ok | ok | 1884 |
| Bahnübergang (Güterzug + Kesselwagen im Einschnitt) | Aufprall | ok | ok | ok | ok | 1068 |
| Zirkus (gestreiftes Zelt, Wohnwagen, Manege) | Aufprall | ok | ok | ok | ok | 488 |

Alles mit Vertexfarben in den vorhandenen Material-Batches: **0 zusätzliche Draw-Calls**, höchstens ~1 900 Dreiecke je
Schanze (Szene gesamt ~290 000). Alles bleibt 1,0 m unter der tiefsten Flugbahn; was nicht passt, wird weggelassen.
Wahl je Schanze per Seed (gleiche Strecke = gleiche Hindernisse). Für n22: `gapObstacles(pb, { f0, f1, ceil, floorY, kind })`
baut eine Variante in jede Lücke (auch über echte Täler).

## Regression
| Prüfung | Ergebnis |
|---|---|
| `npm run test:node` (alle 25, neu: `test_wiese`, `test_haftung`, `test_sprung`) | grün |
| Generator 40 × 3 (`test_verify_batch 40`) | 120/120, **0 Entschärfungen** |
| Alte Codes (`test_alte_codes --verify`) | 249/249 identisch, geprüft 249/249 |
| 3D-Generator 40 × 3, Fahrhilfen 3D | grün |
| Sammlung 250 (Leicht ohne Eingabe / Mittel / streng) | 250 / 250 / 250, ohne Crash |
| Import-Korpus 200 (Leicht / streng) | 195 / 192 → **195 / 193** |
| Leicht auf Generator-Strecken, Spieler tut nichts (`jump_easy_batch 30`) | 90/90 ohne Crash, Flug Median 2,3 s |
| Browser: Smoke, `test_race`, `test_hochformat`, `test_reset_ui`, `test_extras_ui`, `test_leicht_zeiten`, `test_sammlung_ui`, `test_strecken3d_ui`, `test_bestzeiten_reset` | 0 Fehler, grün |

Angepasste Test-Erwartungen (mit Begründung im Code): Leicht „nach 2 s voll links > 8 m neben der Fahrbahn“ → > 4 m
(die Wiese bremst); Abkürzung über die Wiese lohnt jetzt schon ohne Regel nicht; Zappel-Spieler auf Leicht darf 6 statt 4 ×
Autopilot-Zeit brauchen; Klippen-Fenster nicht mehr gleich dem der Schanze; Leicht „Daumen 0,3“ auf der Demo 0,89 statt
≥ 0,9 m versetzt (die Sprung-Zone über der langen Landerampe lenkt Leicht selbst).

## Fotos (selbst geprüft)
- `tests/shots/final/wiese_quer.jpg`, `wiese_hoch.jpg`: Abkommen mit 219 km/h → 114 → 33 → 27 km/h auf dem Tacho.
- `tests/shots/final/schanze_n21_quer_<variante>.jpg` (Streckenkamera seitlich am Scheitel, Verfolger am Scheitel,
  Hubschrauber beim Absprung) für kanal, busse, bauernhof, hafen, zug, zirkus; `schanze_n21_hoch_alle.jpg` (hochkant).
  Serie neu: `python3 tests/sprung_hindernis_shots.py quer|hoch`.

## Grenzen (ehrlich)
- Weite ~100 m statt „100–200 m“, Scheitel ~4 m am unteren Rand: Das Element bleibt 3 Felder, damit alle Codes gleich
  bleiben. Längere Sprünge gingen nur mit mehr Feldern (neue Code-Version).
- In der Verfolgerkamera verdeckt die Landerampe am Scheitel die Lücke (Kamera bleibt auf Absprunghöhe). Die Hindernisse
  sieht man am besten mit 🎥 Hubschrauber oder Strecke – und im Anflug.
- Bei kurzem Anlauf (Bodenwellen/Looping direkt davor oder danach) ist die Lücke nur 30 m: dort passt kein Hindernis, es
  bleibt der Wassergraben.
- Import-Sprünge (.TRK) unverändert (Original-Geometrie), noch ohne Deko in der Lücke.
- Bäume haben keine Kollision; fährt man auf der Wiese in einen Baum, steht die Kamera im Laub (wie bisher).
- Wer mit Vollgas über die Wiese an Leicht-Strecken „zappelt“, ist deutlich langsamer – so gewollt.

## Bitte am Handy testen
1. **Wiese:** Strecke des Tages auf Mittel oder Original, bei Tempo bewusst neben die Strecke: bremst es stark genug, ohne
   zu nerven? Zurück auf die Strecke lenken. Vergleich: gleiche Seite mit **`?wiese=alt`**.
2. **Haftung:** Kuppen und schnelle Kurven auf Original mit Vollgas: klebt das Auto? Vergleich mit **`?haft=alt`**.
3. **Schanze:** mit ~150–165 km/h abspringen (Mittel: Linie/„Bremsen!“ beachten). Weit statt hoch? Hindernisse sichtbar
   und lustig? Varianten direkt: `?seed=4711&d=2&hindernis=kanal` (auch `busse`, `bauernhof`, `hafen`, `zug`, `zirkus`).
   Alter Sprung zum Vergleich: **`?schanze=alt`**. Absichtlich zu langsam → „Zu kurz“ und Reset.
4. **Bestzeiten:** Menü zeigt keine alten Zeiten mehr; nach einem Rennen auf Mittel steht die neue Bestzeit da.
   A/B-Links werten nicht.

Links: https://drpeterkalmar.github.io/stuntbahn/?wiese=alt · https://drpeterkalmar.github.io/stuntbahn/?haft=alt ·
https://drpeterkalmar.github.io/stuntbahn/?schanze=alt · https://drpeterkalmar.github.io/stuntbahn/?seed=4711&d=2&hindernis=busse
