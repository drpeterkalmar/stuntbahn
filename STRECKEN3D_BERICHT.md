# Stuntbahn – 3D-Strecken mit neuen Streckenteilen (n19, 30.09.2026)

Peters Wunsch (29.09.): „Mehr Streckenelemente“ und „3dimensionale Strecken“ – verstanden wie eine Spielzeug-Rennbahn
bzw. Trackmania: mehrere Ebenen übereinander, die Strecke kreuzt sich über Brücken, Spiralen, lange Abfahrten,
Klippensprünge. Kulissen folgen in n20. Laut Nachtrag vom 30.09. läuft n19 **vor** n17 (Kino-Look) und n18
(Kino-Replay): die neuen Teile nutzen die bestehenden Materialien, sauber getrennt (Liste „Für n17/n18“ unten).

## Kurz

- **8 neue Bausteine** (Spirale, Überführung, Achterbahn-Wellen, Steilauf-/-abfahrt, Klippensprung über 1 und 2 Ebenen,
  Steilwand 68°, Hochstraßen-Kurven) plus Steilkurve, Korkenzieher und Wendel des Klassikers im Generator. Jedes Teil hat
  Geometrie, Kollision, Ideallinie/Autopilot, Tempo-Profil, Galerie-Eintrag und Node-Test.
- **3D-Generator:** neue Zufallsstrecken und die Strecke des Tages sind 3D – meist eine Acht, die sich über eine Brücke
  selbst kreuzt, Ebenen bis 2 (Sanft) / 3 (Sportlich) / 4 (Irre). Code mit Zusatz **„-3d“**, z. B. `4711-3-3d`.
- **Alte Codes bleiben gleich:** 249 von 249 Layouts (83 Seeds × 3 Stufen) identisch, auch nach der Autopilot-Prüfung.
  Schalter **🏗️ 3D / ▭ flach** im Menü.
- **Lösbarkeit:** 300 Seeds je Stufe per Autopilot: **3D 100 % / 100 % / 100 %**, ohne ein einziges Entschärfen
  (flach vorher ebenso 100 %). Bauzeit **+14 bis +16 %** (erlaubt: +30 %).
- **Leistung:** alte Strecken an gleichen Blickpunkten: Draw-Calls und Dreiecke identisch, Renderzeit ±7 % (Rauschen);
  Bildrate im direkten Wechsel alt/neu gleich (Ø 12,2 / 12,1 fps headless).
- **Kamera** nie hinter Decks/Pfeilern/oberer Fahrbahn (0 von 102 Bildern im Rennen), **Karte** mit Ebenen,
  **Leicht** ohne Absturz, **Absturz** von der Hochstraße = Crash + Reset (+5 s).
- Live: Etappe A `bfc3134` (Build `98b988d940`), Etappe B `f1e1769` (Build `8d217da88c`), beide headless auf GitHub Pages geprüft.

## A. Neue Streckenteile (`src/track/pieces_3d.js`)

Ebene = 6 m (`LEVEL_H`, Durchfahrtshöhe wie bei der Hochstraße). `pc.lvl` = Ebene an der Einfahrt, neu `pc.h1` = Ebene an
der Ausfahrt. Alle Maße bei Weltmaßstab 2 (Feld 40 m).

| Teil | Typ | Felder | Form | Autopilot (Kette mit Anfahrt) |
|---|---|---|---|---|
| **Spirale** | `spiral` | 2×2 | Gerade → voller Kreis (Radius 20 m, Überhöhung bis 17°) → Gerade; ±1 oder ±2 Ebenen; Ausfahrt über/unter der Einfahrt (Abstand ≥ 5,6 m) | alle 4 Varianten ohne Crash, max. 3,3 g |
| **Überführung** | `straight` auf Ebene ≥ 1 über einer Geraden | 1 | Hochstraße quer über eine tiefere Fahrbahn; Pfeiler stehen neben der unteren Fahrbahn (Belegung je Feld, `pb.below`) | 0 Bauteil-Ecken im Lichtraum der unteren Fahrbahn |
| **Achterbahn-Wellen** | `waves` | 3 | 4 Kuppen (Sinus², 26 m lang, 1,9 m hoch); Profil erlaubt an den Kuppen −0,35 g Anpressdruck | 4 Luftphasen à ~0,6 s, max. 2,9 g |
| **Steilauf-/-abfahrt** | `slope2/3/4` | 2–4 | 1–3 Ebenen hinauf/hinunter (bis 21 % Gefälle), Hochstraßen-Querschnitt mit Pfeilern | bergab über 3 Ebenen 186 → 306 km/h |
| **Klippensprung** | `cliff` (1 Ebene), `cliff2` (2 Ebenen) | 3 / 4 | Schanze = Standard-Schanze (gleiche Lippe `JUMP.lipDeg`, gleiche Luft-Physik `AIR`/`flightPath`), Landehang bis auf die tiefere Ebene, danach ≥ 26 m Auslauf; Unterbau massiv bis zum Boden, Wasser in der Lücke, wenn unten Boden ist | Fenster 13,3–17,7 (1 Ebene) bzw. 13,3–18,1 m/s (2 Ebenen), Schanze 14,2–19,5; Absprung ±1 m/s: kein Crash; Landung max. 5,6 / 7,5 g |
| **Steilwand** | `wall` | 2×2 (Kurve) | 90°-Kurve, Radius 60 m, Neigung bis **68°**, innen waagrechter Auslauf auf Bodenhöhe | 126–150 km/h an der Wand; mit 22 km/h rutscht das Auto sicher auf den Auslauf und fährt weiter |
| **Hochstraßen-Kurven** | `turnS/turnL` auf Ebene ≥ 1 | 1 / 2×2 | Deck mit hoher Brüstung (1,15 m, außen 1,55 m), Pfeiler entlang des Bogens | ohne Crash |
| TRK-Teile | `tr_bankC`, `tr_corklr`, `tr_corkud` | 2×2 / 2 / 2×2 | Steilkurve, Korkenzieher, Wendel des Klassikers, jetzt im Generator | ohne Crash |

**Klippensprung – Landehang.** Ein Skisprung-Hang (Neigung = Flugbahn) wäre am sanftesten, fängt aber nur ein
~3 m/s schmales Tempo-Fenster (der Hang muss bis auf die tiefere Ebene reichen). Per Suche über Kuppe, Neigung und Radien
gewählt: Hang beginnt wie die Landerampe der Schanze (3 m hoch, 18 m hinter der Lippe), fällt mit 17° ab, Kreisbogen
(25 m) in den Auslauf – Fenster so breit wie bei der Schanze, Aufprall senkrecht zur Fläche ≤ 8,5 m/s.

**Steilwand – Tempo.** Im verwundenen Übergang steigt die Fahrbahnmitte auf die Wand (Kuppe); dort gilt ein niedrigerer
Mindest-Anpressdruck (0,15 g statt 0,45 g), der Übergang ist 40 % der Kurve lang. Vorher bremste das Profil dort auf
~65 km/h, jetzt ~125 km/h.

**Galerie** (`?gallery`, 65 Teile, 4,2 km): alle alten und neuen Teile hintereinander, mit echter Kreuzung (Steilauffahrt
→ Hochstraße → quer über die eigene Anfahrt), Klippensprung über 2 Ebenen, Spiralen über 1 und 2 Ebenen, lange
Steilabfahrt über 3 Ebenen. Der Autopilot fährt sie in 137 s ohne Crash. Release A war live ab `bfc3134`.

## B. 3D-Generator (`src/track/generator3d.js`)

1. **Grundform:** meist eine **Acht** (zwei Schleifen, die sich an einem Feld rechtwinklig kreuzen: Sanft 65 %, Sportlich
   85 %, Irre 90 % der Versuche), sonst ein Rechteck; ausgebeult wie bisher, gedreht, gespiegelt. Die Kreuzung und ihre
   Nachbarn bleiben Geraden.
2. **Ebenen:** Start auf Ebene 0. An der Kreuzung liegen die beiden Durchfahrten mindestens eine Ebene auseinander
   (Sanft 1, Sportlich bis 2, Irre bis 3; manchmal beide hoch). Dazu **Ausflüge** nach oben (z. B. Spirale hinauf …
   Klippensprung hinunter). Ebenenwechsel **nur** über Rampen, Spiralen/Wendel, Steilrampen, Klippensprünge.
3. **Stunts** (Looping, Schanze, Röhre, Wellen, Korkenzieher …), Steilkurven/Steilwände und Checkpoints nur auf Ebene 0.
4. **Belegung (i, j, Ebene):** jedes Feld höchstens einmal, außer an Kreuzungen (zwei Geraden quer zueinander, Ebenenabstand
   ≥ 1 → Durchfahrtshöhe 6 m minus 1,1 m Deck). Spiralen belegen zusätzlich die Nachbarfelder. Passt etwas nicht, nimmt der
   Generator deterministisch den nächsten Versuch (Ø 0,4 / 1,0 / 1,3 Wiederholungen).
5. **Scheitern:** `defuse` ersetzt jetzt auch 3D-Teile durch Teile gleicher Form und gleichen Ebenenwechsels (Steilwand →
   weite Kurve, Klippe → Steilrampe gleicher Länge, Spirale → Rampe). Hilft das nicht, nimmt das Spiel die nächste Variante
   desselben Codes (für alle gleich). In 900 Test-Strecken war beides nie nötig.

Anteile (40 Seeds je Stufe, `test_generator3d.mjs`):

| | höchste Ebene 1 / 2 / 3 / 4 | mit Kreuzung | Spiralen | Klippen | Steilwand | Wellen |
|---|---|---|---|---|---|---|
| Sanft | 32 / 8 / – / – | 60 % | 39 | 3 | – | 12 |
| Sportlich | 21 / 12 / 7 / – | 80 % | 44 (+10 Wendel) | 15 | 25 | 27 |
| Irre | 3 / 14 / 14 / 9 | 68 % | 83 (+11 Wendel) | 33 | 21 | 29 |

**Schlüssel und Speicher:** `generate(seed, diff)` ohne Option ist unverändert (Hash-Test). 3D: `generate(seed, diff,
{ d3: true })` → Schlüssel `seed-diff-3d`; Bestzeiten, Geister und die Autopilot-Prüfung hängen am Schlüssel und sind
damit getrennt. Der Prüf-Cache speichert bei 3D zusätzlich `h1` und die Variante.

**Menü:** Code mit „-3d“, „3D, n Ebenen hoch“, Symbole (🌀 Spirale, 🪂 Klippensprung, 🧱 Steilwand, 🎢 Wellen, 🎿
Steilrampe, 🌉 Überführung), Schalter **🏗️ 3D / ▭ flach** neben der Schwierigkeit (gespeichert). Code-Eingabe: `4711-2`
= flach wie immer, `4711-2-3d` = 3D. URL `?seed=4711&d=3&3d=1`.

**Streckenkarte** (Menü-Karte der aktuellen Strecke): höher = heller, jede Ebene mit weiter versetztem Schatten, nach
Höhe sortiert gezeichnet – an der Kreuzung liegt die obere Straße samt Schatten über der unteren; Spiralen als Kreis,
Klippensprünge mit gestrichelter Flugstrecke, Stunts orange markiert.

**Kamera:** Verfolger mit fünf Strahlen (Mitte + ±Nahebene) gegen die Kollisionswelt; die kürzeste freie Länge zieht die
Kamera heran – schnell hinein, langsam wieder hinaus – und am Ende prüft ein Strahl die tatsächliche Position (harte
Grenze). Kosten 0,01 ms je Bild. Im Browser-Test: 0 von 102 Bildern verdeckt, 11 herangezogen. Cockpit unverändert.

**Hochstrecken und Hilfen:** Brüstungen 1,15 m, in Kurven außen 1,55 m (alte Brücke 0,9 m, unverändert). Neue Regel
„Abgestürzt“: wer oben fuhr und wenige Sekunden später im Gelände > 4 m unter der hoch liegenden Fahrlinie steht → Crash
und Reset (+5 s) wie jeder andere (vorher konnte man unter der Brücke weiterfahren, ohne Weg nach oben). Leicht gibt auf
Hochstraßen (und 25 m davor/danach) keinen Vorrang über den Rand.

| Simulierte Spieler (6 Codes × 3 Stufen) | 3D: im Ziel | Crashs 3D | flach: Crashs |
|---|---|---|---|
| Leicht, Hände weg | 18/18 | 0 | 0 |
| Leicht, wild lenkend | 18/18 | 53, davon **0 Abstürze** | 75 |
| Mittel, menschenähnlich | 18/18 | 31 (Aufprall 23, Überschlag 4) | 9 |

Mittel ist auf 3D-Strecken fordernder (Brüstungen statt Wiese, Spiralen, Klippen) – so gewollt, aber am Handy prüfen.

## Lösbarkeit (Autopilot, `node tools/quote3d.mjs 300 [--3d]`)

| Stufe | flach: gelöst | 3D: gelöst | 3D ohne Entschärfen | Bauzeit flach (Median) | Bauzeit 3D | Δ |
|---|---|---|---|---|---|---|
| Sanft | 300/300 | **300/300** | 300 | 36,8 ms | 42,9 ms | +16 % |
| Sportlich | 300/300 | **300/300** | 300 | 42,3 ms | 48,7 ms | +15 % |
| Irre | 300/300 | **300/300** | 300 | 48,9 ms | 56,0 ms | +14 % |

Bauzeit = Strecke + Kollision + Ideallinie + Profil in Node (wie beim Laden). Seeds `1000 + k·7919 mod 90000`, k < 300.

## Leistung

Alte Strecken, neuer Code gegen den Stand vor n19 (`/tmp`-Kopie von `95f45d1`), feste Blickpunkte (8 je Strecke):

| Strecke | Stufe | Renderzeit alt → neu | Draw-Calls Ø (max) alt → neu | Dreiecke Ø |
|---|---|---|---|---|
| 20260927-2 | 0 | 3,3 → 3,5 ms | 48 (67) → 48 (67) | gleich |
| 20260927-2 | 1 | 5,4 → 5,5 ms | 67 (86) → 67 (86) | gleich |
| 4711-3 | 0 | 3,6 → 3,5 ms | 52,6 (90) → 52,6 (90) | gleich |
| 4711-3 | 1 | 5,5 → 5,9 ms | 71,6 (109) → 71,6 (109) | gleich |

`tests/perf_gross.py` (LONG_GO2.TRK): Draw-Calls/Dreiecke je Stufe identisch (89/109/102), Renderzeit 4,0/7,0/8,8 →
4,5/7,4/8,2 ms (Rauschen). `tests/perf_welt.py` lief zweimal je Stand; die rAF-Bildrate schwankte mit der Last des Rechners
(alt 15–23, neu 8–15 fps in getrennten Läufen). Abwechselnd alt/neu direkt hintereinander: **alt 11,8 / 10,7 / 14,0,
neu 10,5 / 12,8 / 13,1 fps** – kein Unterschied. Rohdaten: `tests/out/n19/`.

3D gegen flach **desselben Codes** (andere Strecke, max. über 6 Stellen): 1038-3 Renderzeit 3,4 → 3,5 / 5,5 → 5,9 ms,
Draw-Calls max 65 → 82 / 85 → 101; 4711-3 3,5 → 3,2 / 5,2 → 5,3 ms, 81 → 69 / 100 → 100. Die Galerie mit allen Teilen:
3,5 / 5,4 ms, max 94 / 113 Calls.

## Tests

| Test | Ergebnis |
|---|---|
| `node tests/node/test_strecken3d.mjs` | 139 Prüfungen je Baustein (Umlauf, Ebenen, Querneigung, Durchfahrtshöhe, Lichtraum der Überführung, Luftphasen, Tempo-Gewinn, Klippen-Fenster aus der Schanzen-Konstante, Landebahn, Absprung ±1 m/s, Steilwand 60–75° und zu langsam, TRK-Teile, Galerie) |
| `node tests/node/test_alte_codes.mjs --verify` | 249/249 identisch (auch geprüft/entschärft) |
| `node tests/node/test_generator3d.mjs 40` | 16 227 Prüfungen (120 Strecken): Belegung, Ebenen-Regeln, Kreuzungen, Determinismus, Lösbarkeit, Bauzeit ×1,16 |
| `node tests/node/test_leicht3d.mjs 6` | Fahrhilfen auf 3D, Leicht ohne Absturz, Absturz → Reset |
| `node tests/node/test_deco.mjs 10` | jetzt auch mit 15 3D-Strecken + Galerie: 724 157 Prüfungen ok |
| `npm run test:node` | 21/21 grün |
| `python3 tests/test_strecken3d_ui.py` | Menü (Code, Karte, Schalter, hochkant), alter Code flach, 3D-Rennen im Ziel, Kamera nie verdeckt, 0 Fehler |
| `smoke`, `test_race`, `test_touch`, `test_zoom`, `test_hochformat`, `test_reset_ui`, `test_leicht_zeiten` | grün, 0 Fehler |

## Fotos (selbst geprüft, quer und hoch)

`tests/shots/final/strecken3d_*.jpg` (18 Stück, verkleinert; volle Größe per `tests/strecken3d_shots.py` und
`tests/strecken3d_fahrt_shots.py` nach `tests/shots/strecken3d/`): Spirale von außen (Galerie, Fahrt quer/hoch),
Überführung von oben und von unten, Verfolgerkamera unter der Brücke (quer/hoch – Pfeiler stehen neben der Fahrbahn),
Klippensprung im Flug (quer/hoch), Klippe über 2 Ebenen, Steilwand von außen und im Verfolger (Auto 68° an der Wand),
Wellen, Steilauffahrt, Streckenkarte mit Kreuzung, Menü quer/hoch.

## Bitte am Handy testen

1. Menü öffnen: Die **Strecke des Tages** ist jetzt 3D („Code …-3d · 3D, n Ebenen hoch“, rechts die Karte).
2. **Neue Strecke → Irre → 🎲 Zufall**, bis Symbole 🌀 (Spirale) und 🪂 (Klippensprung) dabei sind (fast immer) – auf
   Leicht fahren: Spirale hinauf, über die Brücke, Klippensprung hinunter. Code zum Wiederfinden: **`1038-3-3d`**
   (4 Ebenen, Spiralen, Klippensprünge über 1 und 2 Ebenen, Steilwand, Wellen, Looping).
3. Auf **Mittel**: Steilwand 🧱 mit Tempo (ab ~120 km/h klebt das Auto an der Wand) und einmal absichtlich langsam
   (rutscht auf den Auslauf, kein Crash).
4. Unter einer Brücke hindurch: Kamera bleibt frei; hochkant und quer.
5. Schalter **▭ flach**: dieselben Codes wie früher (Bestzeiten unverändert).
6. `?gallery` zeigt alle Teile hintereinander.

## Für n17/n18 (Kino-Look und Kino-Replay)

**Neue Teile und wo ihr Material entsteht** – alles in `src/track/pieces_3d.js`, Materialwahl zentral über `MAT3`
(Rolle → Material-ID), Querschnitte in `PROFILES_3D` (`deck3`, `wall3`):

| Teil | Geometrie-Funktion | Material-Rollen (`MAT3`) |
|---|---|---|
| Hochstraße (Gerade, Kurven, Rampen, Spirale) | `deck3`-Profil, `buildDeckTurn`, `buildSlope`, `buildSpiral`, Pfeiler `pier`/`supportAlong` | `road`, `barrier`, `deck`, `pier` |
| Klippensprung | `buildCliff` (Schanze/Landehang über das Schanzen-Profil `ramp`) | `kicker` (Metall), Unterbau `cliff` (Beton); Wasser über `pb.pit` |
| Steilwand | `buildWall`, Profil `wall3` | `wallFace`, `apron`, `lip`, `wallBack` |
| Wellen | `buildWaves` (Straßen-Profil mit Randsteinen, Erdhügel `pb.mound`) | Straßen-Materialien |

Heute zeigen alle Rollen auf die vorhandenen Materialien (`MAT.ROAD/WALL/CONCRETE/METAL`) – keine zusätzlichen Draw-Calls.
n17 kann eigene Materialien einführen und nur `MAT3` umstellen (neue `MAT`-IDs brauchen einen Eintrag in `gfx/materials.js`
und `GRIP`/`ROLL` in `defs.js`).

**Stunt-Ereignisse, die das Replay auswerten sollte** (Datenquelle je Linienpunkt: `track.line.piece` → `layout.pieces[k].type`):

- **Spirale** (`spiral`, `tr_corkud`): Ein-/Ausfahrt, Ebenenwechsel (`lvl` → `h1`), Höhe gewonnen/verloren.
- **Klippensprung** (`cliff`, `cliff2`): Absprung (`track.jumps[].lipIdx`, Eintrag hat `cliff` = Fallhöhe in m und `win`
  = Tempo-Fenster), Flugzeit, Fallhöhe, Landung (weich/hart über `car.lastImpact`) – wie die Schanze, nur tiefer.
- **Steilwand** (`wall`): Zeit an der Wand (Fahrzeug-Oben `frame.u.y < 0,5` ≙ > 60° Neigung), abgerutscht ja/nein.
- **Achterbahn-Wellen** (`waves`, `line.wave === 1`): Anzahl Luftphasen und Summe Airtime.
- **Überführung**: Durchfahrt oben/unten an einem Kreuzungsfeld (zwei Stücke im selben Feld, `meta.crossings`).
- **Steilabfahrt** (`slope3`, `slope4` mit `h1 < lvl`): Tempo-Gewinn (ein/aus).
- **Absturz** (Crash-Grund „Abgestürzt“) als eigene Szene.

## Grenzen / offen

- Korkenzieher (TRK) erscheint im 3D-Generator selten (Irre ~1 von 8 Strecken) – er braucht 4 freie Geraden auf Ebene 0.
- Wellen: kurze Luftphasen bei ~55–65 km/h; schneller geht nur mit längeren Hügeln.
- Kreuzungen in 54 % (Sanft), 68 % (Sportlich), 75 % (Irre) der 3D-Strecken (300 Seeds je Stufe) (Rest: Rechteck mit Ausflügen nach oben, Spiralen, Klippen).
- Im Looping kann der Prüfstrahl der Kamera die Spurwand direkt neben dem Auto streifen (Altbestand, keine 3D-Bauteile;
  im Test getrennt gezählt: 0).
- Draw-Calls einer 3D-Strecke können über denen der flachen Strecke desselben Codes liegen (1038-3: +19–26 % im Maximum) –
  es ist eine andere Strecke; Renderzeit +3–7 %.

## Commits (n19)

- `bfc3134` Etappe A: neue Streckenteile, Galerie, Tests
- `f1e1769` Etappe B: 3D-Generator, Menü, Karte, Kamera, Absturz-Regel, Tests (Build `8d217da88c`)
- Bericht + Fotos (dieser Commit)
