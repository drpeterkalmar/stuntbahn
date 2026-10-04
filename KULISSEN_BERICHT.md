# Stuntbahn n20 – mehr Kulissen: Landschafts-Themen, Streckenrand, Himmel (04.10.2026)

Peters Wunsch (29.09.): „Mehr Streckenelemente und Kulissen“ – die Elemente kamen mit n19, jetzt die Kulissen.
Maßstab „Forza mit DLSS 5“, am Handy mit der Kino-Look-Pipeline aus n17.

## Kurz
- **7 Landschafts-Themen:** 🌾 Land, 🏜️ Wüste & Canyon, 🏔️ Alpen, 🏝️ Küste & Tropen, 🏙️ Stadt, 🍂 Herbstwald, ❄️ Winter.
  Jedes Thema hat einen **eigenen Himmel** (HDRI von Poly Haven, CC0) mit passender Sonne, eigenes **Umgebungslicht**, eigene
  **Boden- und Fels-Texturen** (ambientCG, CC0), **Nebel- und Lichtfarbe** und eine eigene **Farbkorrektur im Kino-Look**,
  eigene **Pflanzen** (Karten aus Poly-Haven-Modellen) und eine **Fernkulisse** (Berge, Tafelberge, Meer mit Strand und
  Inseln, Skyline mit Hochhäusern) statt einer leeren Ebene.
- **Thema passend zur Strecke:** generierte Strecken bekommen es deterministisch aus Seed, Stufe und Streckenart
  (Gelände Irre → oft Alpen/Canyon, Hochstraße → oft Stadt); .TRK- und Sammlungs-Strecken aus ihrem Horizont (Wüste →
  Wüste & Canyon, Tropen → Küste, Alpen → Alpen, Stadt → Stadt, Land → Land, Chaos → Herbst oder Winter).
  Menü → **„🏞️ Landschaft“**: *Passend zur Strecke* (Standard) oder fest ein Thema für alle Strecken. URL `?thema=alpen`.
- **Streckenrand in allen Themen:** Tribünen an Start, Sprüngen, Loopings, Röhren und den schärfsten Kurven (auch in den
  Hang gebaut), **Zuschauer jubeln** bei Sprüngen, Loopings und im Ziel (Arme hoch, springen), **Start/Ziel-Portal**
  (Fachwerk-Bogen mit Anzeigetafel), **Fahnen** mit erfundenen Marken (wehen im Wind), Streckenposten, **Kamerakräne**,
  **Heißluftballons**, ein **Zeppelin**, der um die Strecke kreist, **Windräder** (drehen sich). An Sprüngen und Loopings
  stehen mehr Zuschauer.
- **Die Fahrbahn ändert sich nicht:** 47/47 Strecken (flach, Hochstraße, Gelände, Demo, Galerie) bauen Byte für Byte wie vor
  n20 (Linie, Geometrie, Kollision, Gelände, Bäume, Sprünge – `node tools/kulissen_bitgleich.mjs`). Bestzeit-Schlüssel
  unverändert, `?thema=` wertet (kein A/B-Zusatz). Kulissen haben keine Kollision.
- **Nebenbei gefunden und behoben (Fehler aus n22):** Der Zwischenspeicher geprüfter Strecken verlor die Gelände-Merkmale der
  Stücke (Kuppe, Hang-Querfahrt, Schlucht …). Wer eine Gelände-Strecke zum zweiten Mal öffnete, fuhr eine leicht andere
  Strecke (andere Fahrbahnhöhen) als beim ersten Mal. Jetzt bleiben alle Merkmale erhalten (Test in `test_kulissen`).
- **Budget:** Erstladung 9,37 → 9,5–10,4 MB je Thema (Grenze 15 MB), je Themen-Paket 1,7–2,5 MB (Grenze ≈ 6 MB), im Repo
  +11 MB Assets (Grenze 25 MB). Bildzeit am Handy-Profil gleich (Messrauschen ±10 %), Draw-Calls +4 … +18 (höchstens 133 auf
  der 38-km-Archivstrecke, Grenze 200).
- Tests: `npm run test:node` 27/27 grün (neu `test_kulissen.mjs`, > 1 Mio. Prüfungen), Browser-Tests grün mit 0 Seitenfehlern
  (Ausnahme `test_trk_ui`: zwei Prüfungen schlagen schon vor n20 fehl, siehe unten).

## Die Themen
| Thema | Himmel (Poly Haven) | Boden / Fels (ambientCG) | Pflanzen | Fernkulisse und Bauten | Licht |
|---|---|---|---|---|---|
| 🌾 Land | Kloofendal 48d (wie bisher) | Leafy Grass (wie bisher) | Tannen, Laubbäume, Büsche, Blumen | Felder mit Hecken, Wald am Bergkranz, Hügel-Silhouetten, Bauernhöfe | Mittag |
| 🏜️ Wüste & Canyon | Qwantani Afternoon | Ground 097 (Dünensand), Rock 029 (roter Fels mit Schichtbändern) | Köcherbäume, Rooibos, Sukkulenten | Tafelberge in Stufen (Fernring + Silhouette), Ranch mit Wassertank und Windpumpe | warm, klar |
| 🏔️ Alpen | Pizzo Pernice | Grass 004 (Bergwiese), Rock 051 | Tannen, Jungtannen | echte Berge im Fernring (bis ~460 m) mit Schnee, Gipfel-Silhouetten, Hütten mit Steinsockel | kühl, klar |
| 🏝️ Küste & Tropen | Kloofendal 38d Partly Cloudy | Grass 001 (satt), Sandstrand am Wasser | Palmen, Inselbaum, Wasserkastanie | Meer mit Wellen hinter der Küste, Inseln, Leuchtturm, Segelboote, Strandhäuser | lebhaft |
| 🏙️ Stadt | Qwantani Late Afternoon (goldene Stunde) | Grass 001 (Parkrasen), Häuserblocks im Boden | Jacaranda, Inselbaum | Hochhäuser mit Fenstern (bis ~300 m), Wohnblöcke, Baukräne, Hochstraße, Skyline | Abendgold |
| 🍂 Herbstwald | Autumn Field | Scattered Leaves 009 | bunte Laubbäume (gelb, orange, rot), Tannen | herbstliche Felder, Hügel | warm, golden |
| ❄️ Winter | Snow Field (bedeckt) | Snow 010 A, Rock 058 | verschneite Tannen, Jungtannen | verschneite Berge, Hütten mit Schneedach | kühl, gedämpft |

**Zum Gelände-Modus (Nachtrag n22):** Die Themen machen das Gelände nicht flach und ändern es im Physik-Raster überhaupt nicht.
Die Fernkulisse hebt/senkt nur das *gezeichnete* Gelände weit außerhalb (ab Raster + 30 m; Test: `farLift` bis dorthin exakt
die Landschaft). Alpen = echte Berge im Fernring und auf dem Horizont, Canyon = Fels mit Schichtbändern an Schlucht- und
Böschungswänden plus Tafelberge, Küste = Meer erst außerhalb des Kreises um das Raster. Gelände-Strecken der Stufe Irre landen
passend am häufigsten in Alpen oder Wüste & Canyon. Verteilung über 1800 Strecken (alle Arten): Stadt 373, Land 311,
Küste 261, Wüste 253, Herbst 229, Winter 204, Alpen 169.

## Streckenrand – Regeln (Brief Punkt 2–4 und Nachtrag)
- Alles **ohne Kollision**, Abstand zu **jedem** Punkt der Fahrlinie (auch Hochstraßen, Spiralen, Loopings) nach `MIN_CLEAR`
  → nie auf oder unter einer Fahrbahn, nie in Pfeilern oder Durchfahrten der 3D-Strecken. Zwischen den Ebenen (Innenraum von
  Achten und Spiralen) dürfen Kulissen stehen.
- **Nie in Sprunglücken** (Korridor Absprung … Landung + 30 m, die n21-Hindernisse bleiben unberührt), nie in Schluchten,
  Gruben, Teichen.
- **Nie auf Böschungen/Hängen direkt an der Fahrbahn:** Tribünen, Zuschauer, Fahnen, Kamerakräne, Posten und Bremstafeln bis
  40 m neben der Fahrbahn stehen auf deren Höhe (±2,5 m zum nächsten ebenerdigen Linienpunkt). Tribünen dürfen in einen
  *ansteigenden* Hang gebaut sein (Einschnitt, wie im Stadion), nie über abfallendem Gelände (Damm, Schlucht).
- Kulissen-Planung: `src/track/kulisse.js` (aus `planDeco` vor der Vegetation; Bäume weichen den Tribünen aus).
  Zeichnen: `src/gfx/kulisse.js`. Jubel: `decoUniforms.uCheer` (Ort, Radius 190 m, Stärke; in `main.js` aus Sprung/Looping/
  Röhre/Luft/Ziel), Zuschauer-Atlas mit zweiter Hälfte „Arme hoch“.
- Erfundene Marken: KALMAR REIFEN, BLITZ COLA, ALPENSTROM, TURBO-ÖL, STUNTBAHN, WIESENMILCH, RAPID TV, FUNKEN FUNK.

## Quellen und Lizenzen
Alle Fremd-Assets sind **CC0**; die Lizenz wurde am 04.10.2026 auf der Asset-Seite der Primärquelle geprüft
(`tools/fetch_themes.py` bricht ab, wenn dort kein „CC0“ steht). Vollständige Tabelle mit Autoren: `assets/LICENSES.md`,
Credits im Spiel.
- **Himmel (Poly Haven):** Qwantani Afternoon, Qwantani Late Afternoon, Kloofendal 38d Partly Cloudy (Greg Zaal, Jarod Guest),
  Pizzo Pernice (Andreas Mischok, Jarod Guest), Autumn Field, Snow Field (Jarod Guest, Sergej Majboroda).
- **Böden/Fels (ambientCG):** Ground 097, Grass 001, Grass 004, Scattered Leaves 009, Snow 010 A, Rock 029, Rock 051, Rock 058.
- **Pflanzen (Poly Haven):** Quiver Tree 01/02, Wild Rooibos Bush, Cheiridopsis Succulent, Jacaranda Tree, Island Tree 02/03,
  Pachira Aquatica 01, Fir Sapling Medium, Shrub 02.
- **Eigene Arbeit:** Palmen-Karten (bei Poly Haven, ambientCG, Kenney und Quaternius gibt es keine realistische CC0-Palme; Kenneys
  Low-Poly-Palmen und -Kakteen wurden gerendert und verworfen – im Kino-Look wirkten sie wie Spielzeug), alle Bauten, Tribünen,
  Zuschauer, Fahnen, Portal, Ballons, Zeppelin, Windräder, Fernkulisse, Boden-Paletten.
- Werkzeuge (reproduzierbar): `tools/fetch_themes.py` → `tools/make_theme_sky.py` → `node tools/build_themes.mjs` →
  `tools/make_theme_atlas.py` (mit `tools/make_palm_card.py`).

## Messwerte
Alle Messungen headless auf dem M1 (GPU/Metal), vorher = `git archive` des Stands vor n20 (Commit 40b38c3), abwechselnd mit
nachher gemessen. Rohdaten `tests/out/n20/perf.jsonl` (lokal). **Kein echtes Handy** – siehe Handy-Test unten.

**GPU-Bildzeit je Bild** (Median, Szene angehalten, ganzes Bild wie im Spiel; „Fahrt“ mit Bewegungsunschärfe) und echte Bildrate
(rAF entsperrt), Handy-Profil Pixel 7 quer, `tests/perf_kulissen.py`:

| Strecke | Stufe | vorher (Land) | nachher passend (Land) | nachher Stadt | nachher Küste |
|---|---|---|---|---|---|
| Tag 20261004-2-g | 0 Einfach | 2,6 / 2,9 ms · 58 Calls · 124 fps | 2,4 / 2,4 ms · 62 · 141 fps | 2,7 / 2,8 · 63 · 139 | 2,6 / 2,7 · 63 · 141 |
| | 1 Standard | 4,6 / 5,0 ms · 85 · 143 fps | 4,6 / 5,0 · 94 · 140 | 4,6 / 5,0 · 91 · 143 | 4,6 / 5,0 · 95 · 145 |
| 4711-3 (flach) | 0 Einfach | 2,8 / 2,9 ms · 77 · 151 fps | – (passend = Küste) 3,0 / 3,1 · 95 · 152 | 2,9 / 3,0 · 84 · 150 | 3,0 / 3,1 · 90 · 169 |
| | 1 Standard | 5,0 / 5,6 ms · 109 · 159 fps | 4,8 / 5,2 · 122 · 157 | 5,0 / 5,8 · 114 · 158 | 4,8 / 5,2 · 122 · 157 |

**Pixel-lastig** (1920×1080 bei Pixeldichte 2 = 8,3 MP, die GPU rechnet wie am Handy an der Pixelzahl), Stufe 1:

| Strecke | vorher | Land | Stadt | Küste |
|---|---|---|---|---|
| Tag 20261004-2-g | 9,3 / 10,9 ms · 104 fps | 10,4 / 11,1 · 102 fps | 10,1 / 11,3 · 102 fps | 10,0 / 11,0 · 103 fps |
| 4711-3 | 10,2 / 11,0 ms · 93 fps | – | 10,8 / 12,4 · 101 fps | 10,7 / 11,4 · 95 fps; 9,4 / 10,7 · 103 fps |

→ **Bildrate gleich** (−2 … +10 % im Rauschen); Bildzeit bei Fahrt im Mittel +3 %, schlechtester Einzelwert Stadt +13 %
(Wiederholung derselben Messung schwankt ±10 %). Die Kulissen-Objekte selbst kosten gemessen ~0,1 ms (Ablation: alle
Kulissen aus 8,5 statt 8,6 ms). Das Brief-Ziel „höchstens 10 % schlechter“ ist im Mittel eingehalten; ein echtes Handy
sollte es bestätigen.

**Desktop Kino (Stufe 2, 1280×720), je zwei Läufe:** Tag 8,8/8,5 → 7,2/8,6 ms, 4711-3 7,8/7,6 → 7,3/8,8 ms (gleich).

**Große .TRK-Strecke LONG_GO2 (38 km, `tests/perf_gross.py`, je 2–3 Läufe):** Draw-Calls Fahrt 89–111 → 101–116, Überblick
104–126 → 117–133 (Grenze 200). Bildzeit Stufe 0/1 gleich im Rauschen (3,4–5,0 → 4,4–5,2 ms, 6,7–7,1 → 5,4–6,6 ms); Stufe 2
Desktop-Kino tendenziell +1,5–2 ms (5,0–5,6 → 7,4–7,7 ms) – die Ablation findet dafür keine einzelne Kulisse (je ≤ 0,1 ms).
Bauzeit 823–949 → 836–988 ms.

**Ladegröße** (`tests/load_mb.py`, Erstladung bis „bereit“, ohne Service-Worker-Cache), Strecke 4711-3-g:

| | vorher | Land | Wüste | Alpen | Küste | Stadt | Herbst | Winter |
|---|---|---|---|---|---|---|---|---|
| Erstladung | 9,37 MB | 9,46 MB | 9,49 MB | 9,94 MB | 10,35 MB | 9,92 MB | 9,75 MB | 9,73 MB |
| Themen-Paket | – | (Grund-Dateien) | 1,72 MB | 2,17 MB | 2,51 MB | 2,08 MB | 1,91 MB | 1,89 MB |

- Themen laden **einzeln nach Bedarf** (immer nur das aktuelle; beim Wechsel werden die Texturen des vorigen freigegeben). Das
  Paket der Start-Strecke lädt parallel zum Auto; bei generierten Strecken lädt es, während der Autopilot prüft.
- Der Service-Worker legt die Themen-Pakete erst beim ersten Abruf ab (nicht vorab, Vorab-Cache unverändert ~10 MB). Offline ohne
  Paket fällt das Spiel auf „Land“ zurück.
- Startzeit (`perf_welt.py`, Boot bis bereit) +0,3–0,6 s (Paket + Kulissen-Planung ~70 ms); Streckenbau im Browser 216–594 →
  289–440 ms (enthält beim ersten Mal den Download des Pakets).
- **Repo:** `assets/themes/` 11 MB (Böden/Fels 3,3 MB, Himmel 6 × ~1,1–1,5 MB, Pflanzen-Atlanten 0,7 MB), Fotos 2,6 MB.

## Fotos (selbst mit Vision geprüft)
`tests/shots/final/kulissen_<thema>_quer.jpg` und `…_hoch.jpg` je Thema: **Start** (Portal, Tribünen, Fahnen, Zuschauer),
**Tribüne an der Kurve** (Strecke 1038-1-g), **Sprung mit Zuschauern** (Schluchtsprung/Schanze von 25-2-g im Flug),
**Horizont** (Fernkulisse); Übersicht `kulissen_alle_horizont.jpg`. Volle Serie: `python3 tests/kulissen_shots.py quer|hoch`.

Geprüft je Bild: Stimmung stimmig (Wüste warm mit Dünen und Köcherbäumen, Alpen kühl mit Schneegipfeln, Küste mit Meer, Inseln
und Palmen, Stadt mit Skyline im Abendgold, Herbst mit bunten Bäumen, Winter weiß mit verschneiten Tannen), **nichts auf der
Fahrbahn**, nichts schwebt (Hochhäuser stehen auf dem tiefsten Eckpunkt, Tribünen vorn auf Fahrbahnhöhe), nichts
abgeschnitten. Beim Prüfen gefunden und behoben: Silhouetten-Ring falsch herum gewickelt (unsichtbar), Strand-Farbe färbte
flaches Gelände im Streckenfeld als Sand (jetzt nur am Meer), glänzender Boden (ambientCG-Gras zu glatt → Rauheit angehoben),
gespiegelte Fahnenschrift, Laubbäume im Winter (jetzt verschneite Jungtannen), pixelige Schneeflecken auf Tannen, Menü hochkant
eine Zeile zu lang.

## Tests
| Test | Ergebnis |
|---|---|
| `npm run test:node` | 27/27 grün |
| `node tests/node/test_kulissen.mjs 4` | 1 078 306 Prüfungen ok (19 Strecken × 7 Themen): Abstände, Wasser, Sprunglücken, Schlucht, Böschung, Tribünen nie über abfallendem Gelände, Strecke unverändert, Bestzeit-Schlüssel, `?thema=` wertet, Thema deterministisch/Verteilung/Horizonte, Fernkulisse im Raster exakt, Zwischenspeicher behält Merkmale |
| `node tests/node/test_deco.mjs 10` | 725 124 Prüfungen ok |
| `node tools/kulissen_bitgleich.mjs` | 47/47 Strecken bitgleich zum Stand vor n20 |
| Browser (nacheinander, GPU): smoke, test_race, test_gelaende_ui, test_strecken3d_ui, test_hochformat, test_kinolook, test_kinoreplay quer, test_sammlung_ui, test_zoom, test_touch, test_bestzeiten_reset, test_leicht_zeiten, test_cockpit_ui, test_extras_ui | grün, 0 Seitenfehler |
| `test_trk_ui` | 2 Prüfungen rot – **auch vor n20** (der Test erwartet eine Bestzeit auf Leicht; Leicht wertet seit n15 nicht) |

## Bitte am Handy testen
1. Menü → **„🏞️ Landschaft“** öffnen, nacheinander die Themen wählen: Wirkt jede Landschaft erkennbar und stimmig? Lädt der Wechsel
   schnell genug (beim ersten Mal ~2 MB)?
2. **Strecke des Tages** fahren (passendes Thema): Tribünen am Start, Portal, Fahnen, Ballons, Zeppelin – zu viel, zu wenig?
3. **`25-2-g`** (Sportlich, Gelände): Schluchtsprung – jubeln die Zuschauer an der Landung?
4. **`4711-3-3d`** (Hochstraße, oft Stadt): Skyline, Hochhäuser, Kräne. **`4711-3`** (flach, Küste): Meer, Leuchtturm.
5. **Ruckelt es** in einem Thema mehr als in „Land“ (Grafik Automatisch)? Besonders Stadt und Küste ansehen.
6. Hochkant kurz fahren; Landschaft auf „Passend“ zurückstellen.

## Grenzen (ehrlich)
- **Kein echtes Handy gemessen**; auf dem M1 liegt die Bildzeit bei Handy-Auflösung im Messrauschen (±10 %). Auf der 38-km-
  Archivstrecke ist Desktop-Kino tendenziell 1,5–2 ms langsamer, ohne dass sich eine einzelne Kulisse als Ursache zeigt.
- Die Fernkulisse ist eine Silhouette (Ring) bzw. grobes Gelände (80-m-Raster): aus der Luft sieht man die Kanten; vom Auto aus
  meist hinter Hügeln (in Gelände-Tälern ist der Horizont oft verdeckt).
- Palmen sind gemalte Karten (keine realistische CC0-Palme gefunden); Kakteen gibt es nicht (die Wüste ist eine Karoo-Wüste mit
  Köcherbäumen und Sukkulenten).
- Tribünen fehlen auf sehr hügeligen Gelände-Strecken öfter (Regel „nie auf Böschungen“), z. B. 4711-3-g nur 1.
- Zuschauer sind Karten (von oben erkennbar); Jubel = ganze Gruppen springen, Arme hoch.
- Die Ranch/Hütten/Hochhäuser sind einfache, eigene Modelle (Vertexfarben, Fenster im Shader).
- Kein eigener Jubel-Ton.

## Commits (n20)
- `ddddba3` Etappe 1: Themen, Streckenrand, Tests, Lizenzen (live ca82e6bda7)
- Etappe 2 (dieser Commit): Fernkulisse sichtbar und kräftiger, Stadt dichter, Strand nur am Meer, Winter-Bäume, Fehlerbehebung
  Zwischenspeicher (n22), Fotos, Messungen, Bericht
