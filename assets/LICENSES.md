# Lizenzen der Fremd-Assets

Alle hier genannten Dateien stammen aus freien Quellen (CC0 bzw. CC-BY 4.0). Code, Streckenbausteine,
Physik, Generator, Ton-Synthese und Icons sind eigene Arbeit (Ton-Aufnahmen: siehe unten, CC0). Keine Assets aus „Stunts“ oder „Ultimate Stunts“.

## Auto (CC-BY 4.0 – Namensnennung erforderlich)

| Datei | Quelle | Autor | Lizenz | Änderungen |
|---|---|---|---|---|
| `car/goblin.glb` | [Fictional supercar – V12 Goblin](https://sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786) (Sketchfab) | Olli Teittinen ([ollitei](https://sketchfab.com/ollitei)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Spec-Gloss → Metal-Rough, Schattenebene entfernt, Geometrie vereinfacht (86k → 56k Dreiecke), Texturen WebP 1k, Meshopt-Kompression; im Spiel Lack per Maske umgefärbt |

| `car/goblin_lod.glb` | wie oben (abgeleitet) | Olli Teittinen (ollitei) | CC BY 4.0 | stark vereinfacht (86k → 6,5k Dreiecke), ohne Texturen, einfarbige Materialien – nur für geparkte Autos importierter Strecken, wird bei Bedarf geladen |
| `car/goblin_mid.glb`, `car/goblin_far.glb` | wie oben (abgeleitet) | Olli Teittinen (ollitei) | CC BY 4.0 | n30: Detailstufen (LOD) des Heldenautos, vereinfacht (86k → 15k bzw. 7k Dreiecke), ohne eigene Texturen (nutzen die des Heldenautos), Meshopt-Kompression; `tools/build_assets.mjs --car-mid` |

Fiktives Originaldesign (kein Markenauto). Namensnennung auch im Spiel unter „Credits“.

## .TRK-Import (Strecken des Stunt-Klassikers)

Das Spiel liest das dokumentierte Streckenformat ([wiki.stunts.hu/wiki/Track_file](https://wiki.stunts.hu/wiki/Track_file)).
Parser, Elementtabelle, Wegverfolgung und alle Bausteine/Szenerie-Modelle (Palme, Kaktus, Tennisplatz,
Tankstelle, Scheune, Bürohaus, Windmühle, Schiff, Imbiss) sind eigene Arbeit (prozedurale Geometrie).
Es werden **keine** fremden Strecken mitgeliefert: Importe wählt der Nutzer selbst, sie bleiben nur in
seinem Browser. Die Beispielstrecke im Spiel ist eine eigene Strecke (`src/track/showcase.js`).

## Sammlung (250 eigene Strecken)

Die Strecken der Sammlung sind eigene, generierte Strecken. Stil-Vorbild: die Wettbewerbsstrecken der Stunts-Community (zak.stunts.hu); daraus wurden nur allgemeine Häufigkeiten abgeleitet, keine dieser Strecken ist enthalten.

(`sammlung.bin`/`sammlung.json` aus `src/track/trkgen.js` + `tools/build_sammlung.mjs`; Stil-Modell nur mit Aggregaten in
`sammlung_stil.json`; jede Strecke hat ein Ähnlichkeits-Tor gegen alle Vorbild-Strecken bestanden, siehe `SAMMLUNG_BERICHT.md`.)

## Himmel & Texturen (Poly Haven, CC0)

| Datei(en) | Poly-Haven-Asset | Autor(en) | Lizenz |
|---|---|---|---|
| `hdr/sky_1k.hdr`, `hdr/sky_512.hdr` (n30: 512×256, Sonne gekappt, `tools/hdr_diaet.mjs`), `sky/sky.jpg` (aus 4k-HDR abgeleitet) | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tex/asphalt_*` | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | CC0 |
| `tex/grass_*` | [Leafy Grass](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni | CC0 |
| `tex/concrete_*` | [Gravel Concrete 03](https://polyhaven.com/a/gravel_concrete_03) | Charlotte Baglioni | CC0 |
| `tex/pad_*` | [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) | Rob Tuytel | CC0 |
| `tex/metal_*` | [Metal Plate](https://polyhaven.com/a/metal_plate) | Rob Tuytel | CC0 | seit n24 (04.10.2026) Schanzen-Belag: mit `tools/build_deck.mjs` zu neutral grauem Stahl umgerechnet (nur Helligkeit, Rost/Grünstich per Hochpass entfernt, Normalen gedämpft); gelb-schwarze Warnstreifen an Lippe/Landerampe: eigenes Canvas (`src/gfx/jumpdeck.js`) |
| `tex/fir_card_*` (aus Zweig-/Rindentexturen zusammengesetzt) | [Fir Tree 01](https://polyhaven.com/a/fir_tree_01) | Rob Tuytel, Rico Cilliers | CC0 |

### Umgebung (seit 28.09.2026, Poly Haven, CC0)

| Datei(en) | Poly-Haven-Asset | Autor(en) | Lizenz | Änderungen |
|---|---|---|---|---|
| `tex/veg_atlas.webp` (Zellen `laub1`) | [Tree Small 02](https://polyhaven.com/a/tree_small_02) | Rico Cilliers | CC0 | Seitenansicht als Karte gerendert (Impostor), 512 px |
| `tex/veg_atlas.webp` (`laub2`) | [Island Tree 01](https://polyhaven.com/a/island_tree_01) | Rob Tuytel, Rico Cilliers | CC0 | wie oben |
| `tex/veg_atlas.webp` (`busch3`, `busch4`) | [Searsia Lucida](https://polyhaven.com/a/searsia_lucida) | James Ray Cock, Jenelle van Heerden | CC0 | zwei Büsche als Karten, 256 px |
| `tex/veg_atlas.webp` (`blume3`, `blume4`) | [Celandine 01](https://polyhaven.com/a/celandine_01) | Rob Tuytel, Rico Cilliers | CC0 | als Karten, 256 px |
| `tex/veg_atlas.webp` (`gras1`, `gras2`) | [Grass Medium 01](https://polyhaven.com/a/grass_medium_01) | Rob Tuytel, Rico Cilliers | CC0 | als Karten, 256 px |
| `tex/veg_atlas.webp` (`blume1`, `blume2`) | [Dandelion 01](https://polyhaven.com/a/dandelion_01) | Rob Tuytel, Rico Cilliers | CC0 | als Karten, 256 px |
| `deco/rocks.glb` | [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) | Kless Gyzen | CC0 | drei Steine, vereinfacht auf ~230–280 Dreiecke, Texturen 512 px WebP, Meshopt |
| `tex/gravel_*` | [Gravel Floor 02](https://polyhaven.com/a/gravel_floor_02) | Jenelle van Heerden, Dimitrios Savva | CC0 | 512 px WebP (Kiesbetten, Randstreifen) |

Werbebanner (fiktive Marken), Bremstafeln, Zuschauer, Maschendraht, Wolkenschatten-Rauschen, Tribünen, Streckenposten,
Masten, Reifenstapel, Leitplanken und Bauernhöfe sind eigene Arbeit (Canvas/prozedurale Geometrie).
Reproduzierbar: `python3 tools/fetch_deco.py`, `python3 tools/make_impostors.py`, `node tools/build_deco.mjs`.

Alle Texturen wurden auf 1024 px verkleinert und als WebP gespeichert (`tools/build_assets.mjs`).
Reproduzierbar laden: `python3 tools/fetch_assets.py`, danach `python3 tools/make_sky.py`,
`python3 tools/make_tree_card.py`, `node tools/build_assets.mjs`.

## Bibliotheken

| Datei(en) | Projekt | Lizenz |
|---|---|---|
| `lib/three.*.min.js`, `lib/addons/**` | [three.js](https://threejs.org) r186 | MIT (`lib/THREE_LICENSE.txt`) |
| `lib/addons/libs/meshopt_decoder.module.js` | [meshoptimizer](https://github.com/zeux/meshoptimizer) (über three.js) | MIT |

## Ton (freesound.org, CC0)

`snd/sfx.m4a` (mit `snd/sfx.json`) enthält Ausschnitte dieser Aufnahmen. Alle stehen unter **Creative Commons 0**; die Lizenz
wurde am 30.09.2026 auf der Seite jedes Klangs geprüft (`tools/fetch_sounds.py` bricht bei einer anderen Lizenz ab).
Bearbeitung (`tools/build_sounds.py`): geschnitten, gefiltert, im Pegel angeglichen, Motor-Stücke in der Tonhöhe
geglättet und zu Loops gemacht, zusammen als AAC (mono, 96 kbit/s) gespeichert. Keine Sonniss- oder „Royalty-free“-Pakete.

| Aufnahme | Urheber (freesound) | Lizenz | Verwendung |
|---|---|---|---|
| [Import car revs on Chassis Dyno with Turbo.wav](https://freesound.org/people/editboy23/sounds/496171/) | editboy23 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Motor: Prüfstandslauf (Last-Hochlauf + Schiebebetrieb), Leerlauf |
| [Car Crash](https://freesound.org/people/squareal/sounds/237375/) | squareal | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Crash: Blech-Knirschen |
| [Crash.wav](https://freesound.org/people/CogFireStudios/sounds/420356/) | CogFireStudios | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Crash: Blech-Knirschen (zweite Variante) |
| [metal_collision.wav](https://freesound.org/people/RichieMcMullen/sounds/386798/) | RichieMcMullen | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Crash: Aufprall-Wumms (Metallkörper) |
| [Hood Impact](https://freesound.org/people/LPA134/sounds/329516/) | LPA134 | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Aufprall/Landung: Motorhaube |
| [Jumping on Car Hood](https://freesound.org/people/sanlega/sounds/467230/) | sanlega | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Landungen: Sprünge auf eine Motorhaube |
| [Fall debris (crash)](https://freesound.org/people/xkeril/sounds/703248/) | xkeril | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Crash: rieselnde Trümmer |
| [Glass Break](https://freesound.org/people/unfa/sounds/221528/) | unfa | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Crash (schwer): Glas |
| [MetalScrape_4.wav](https://freesound.org/people/deerlord/sounds/534853/) | deerlord | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Schleifen an Leitplanke/Wand |
| [screeching tyres / tires](https://freesound.org/people/johnnydekk/sounds/614627/) | johnnydekk | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Reifenquietschen |
| [car park skiding corner.wav](https://freesound.org/people/martian/sounds/178889/) | martian | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Reifenquietschen (zweite Variante) |
| [BACKFIRE.ogg](https://freesound.org/people/CeebFrack/sounds/105351/) | CeebFrack | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Fehlzündung (tief) |
| [S012_Engine_Backfire_Mono.wav](https://freesound.org/people/P%C3%B3l/sounds/385935/) | Pól | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Fehlzündung (hell) |

Countdown-, Checkpoint-, Ziel- und Brems-Töne, Fahrtwind, Nitro und Hüpfer sind weiter eigene Synthese (`src/audio/sound.js`).

## Kino-Look (n17)

| Datei(en) | Quelle | Lizenz | Änderungen |
|---|---|---|---|
| `tex/{asphalt,concrete,grass,pad,metal}_{diff,nor,arm}.ktx2` | dieselben Poly-Haven-Texturen wie oben (CC0) | CC0 | als KTX2 (Basis Universal ETC1S, Mipmaps) mit `tools/build_ktx2.mjs` kodiert, senkrecht gespiegelt |
| `../lib/addons/loaders/KTX2Loader.js`, `utils/WorkerPool.js`, `math/ColorSpaces.js` | three.js r186 (examples/jsm) | MIT | unverändert |
| `../lib/addons/libs/basis/basis_transcoder.{js,wasm}` | [Basis Universal](https://github.com/BinomialLLC/basis_universal) (Binomial LLC), Build aus three.js r186 | Apache-2.0 | unverändert |
| `../lib/addons/libs/ktx-parse.module.js` | [ktx-parse](https://github.com/donmccurdy/KTX-Parse) (Don McCurdy) | MIT | unverändert |
| `../lib/addons/libs/zstddec.module.js` | [zstddec](https://github.com/donmccurdy/zstddec-wasm) (Don McCurdy) | MIT (zstd: BSD) | unverändert |

Kino-Look-Pipeline (`src/gfx/kinolook.js`: Hochskalieren/Kantenglättung/Nachschärfen, Bloom, Blendung, Dunst,
Umgebungsverdeckung, Farbkorrektur), Asphalt-Flicken/-Risse, Randstein-Abnutzung, Fels-Klüfte, Rauch-Textur und Funken
sind eigene Arbeit (prozedural, keine Bilddateien). Kantenglättung und Nachschärfen folgen bekannten, frei beschriebenen
Ideen (FXAA-Art, kontrastadaptives Schärfen wie AMD CAS/FSR1), es wurde kein fremder Code übernommen.

## Kulissen: Landschafts-Themen (n20, 04.10.2026)

Alle Dateien unter `assets/themes/` werden nur geladen, wenn das Thema gewählt ist (immer nur das aktuelle). Die Lizenz jeder
Quelle wurde am 04.10.2026 auf der Asset-Seite der Primärquelle geprüft (`tools/fetch_themes.py` bricht ab, wenn dort kein „CC0“ steht).
Liste der Quellen mit Autoren: `assets_src/themes/quellen.json` (lokal). Keine Markennamen: Fahnen, Portal-Tafel und Zeppelin zeigen erfundene Marken.

### Himmel (Poly Haven, CC0)

| Datei(en) | Poly-Haven-HDRI | Autor(en) | Lizenz | Änderungen |
|---|---|---|---|---|
| `themes/wueste/sky.jpg`, `sky.json`, `env.hdr`, `env_512.hdr` | [Qwantani Afternoon (Pure Sky)](https://polyhaven.com/a/qwantani_afternoon_puresky) | Greg Zaal, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Himmelsbild aus dem 4k-HDR (obere Halbkugel, ACES-Näherung, JPG), 1k-HDR unverändert als Umgebungslicht (`tools/make_theme_sky.py`); n30: `env_512.hdr` = 512×256, Sonne gekappt (`tools/hdr_diaet.mjs`), wird statt `env.hdr` geladen (`?hdr=1k` = alt) |
| `themes/alpen/sky.jpg`, `sky.json`, `env.hdr`, `env_512.hdr` | [Pizzo Pernice (Pure Sky)](https://polyhaven.com/a/pizzo_pernice_puresky) | Andreas Mischok, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Himmelsbild aus dem 4k-HDR (obere Halbkugel, ACES-Näherung, JPG), 1k-HDR unverändert als Umgebungslicht (`tools/make_theme_sky.py`); n30: `env_512.hdr` = 512×256, Sonne gekappt (`tools/hdr_diaet.mjs`), wird statt `env.hdr` geladen (`?hdr=1k` = alt) |
| `themes/kueste/sky.jpg`, `sky.json`, `env.hdr`, `env_512.hdr` | [Kloofendal 38d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_38d_partly_cloudy_puresky) | Greg Zaal, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Himmelsbild aus dem 4k-HDR (obere Halbkugel, ACES-Näherung, JPG), 1k-HDR unverändert als Umgebungslicht (`tools/make_theme_sky.py`); n30: `env_512.hdr` = 512×256, Sonne gekappt (`tools/hdr_diaet.mjs`), wird statt `env.hdr` geladen (`?hdr=1k` = alt) |
| `themes/stadt/sky.jpg`, `sky.json`, `env.hdr`, `env_512.hdr` | [Qwantani Late Afternoon (Pure Sky)](https://polyhaven.com/a/qwantani_late_afternoon_puresky) | Greg Zaal, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Himmelsbild aus dem 4k-HDR (obere Halbkugel, ACES-Näherung, JPG), 1k-HDR unverändert als Umgebungslicht (`tools/make_theme_sky.py`); n30: `env_512.hdr` = 512×256, Sonne gekappt (`tools/hdr_diaet.mjs`), wird statt `env.hdr` geladen (`?hdr=1k` = alt) |
| `themes/herbst/sky.jpg`, `sky.json`, `env.hdr`, `env_512.hdr` | [Autumn Field (Pure Sky)](https://polyhaven.com/a/autumn_field_puresky) | Jarod Guest, Sergej Majboroda | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Himmelsbild aus dem 4k-HDR (obere Halbkugel, ACES-Näherung, JPG), 1k-HDR unverändert als Umgebungslicht (`tools/make_theme_sky.py`); n30: `env_512.hdr` = 512×256, Sonne gekappt (`tools/hdr_diaet.mjs`), wird statt `env.hdr` geladen (`?hdr=1k` = alt) |
| `themes/winter/sky.jpg`, `sky.json`, `env.hdr`, `env_512.hdr` | [Snow Field (Pure Sky)](https://polyhaven.com/a/snow_field_puresky) | Jarod Guest, Sergej Majboroda | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Himmelsbild aus dem 4k-HDR (obere Halbkugel, ACES-Näherung, JPG), 1k-HDR unverändert als Umgebungslicht (`tools/make_theme_sky.py`); n30: `env_512.hdr` = 512×256, Sonne gekappt (`tools/hdr_diaet.mjs`), wird statt `env.hdr` geladen (`?hdr=1k` = alt) |

### Böden und Fels (ambientCG, CC0)

| Datei(en) | ambientCG-Material | Autor | Lizenz | Verwendung / Änderungen |
|---|---|---|---|---|
| `themes/tex/Ground097_diff/nor/arm.ktx2` | [Ground 097](https://ambientcg.com/a/Ground097) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Wüste (Boden); 1K-JPG → KTX2 (Basis ETC1S, 1024 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/Rock029_diff/nor.ktx2` | [Rock 029](https://ambientcg.com/a/Rock029) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Wüste (Fels, Canyon); 1K-JPG → KTX2 (Basis ETC1S, 512 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/Grass004_diff/nor/arm.ktx2` | [Grass 004](https://ambientcg.com/a/Grass004) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Alpen (Wiese); 1K-JPG → KTX2 (Basis ETC1S, 1024 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/Rock051_diff/nor.ktx2` | [Rock 051](https://ambientcg.com/a/Rock051) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Alpen (Fels); 1K-JPG → KTX2 (Basis ETC1S, 512 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/Grass001_diff/nor/arm.ktx2` | [Grass 001](https://ambientcg.com/a/Grass001) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Küste, Stadt (Rasen); 1K-JPG → KTX2 (Basis ETC1S, 1024 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/ScatteredLeaves009_diff/nor/arm.ktx2` | [Scattered Leaves 009](https://ambientcg.com/a/ScatteredLeaves009) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Herbst (Boden); 1K-JPG → KTX2 (Basis ETC1S, 1024 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/Snow010A_diff/nor/arm.ktx2` | [Snow 010 A](https://ambientcg.com/a/Snow010A) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Winter (Schnee); 1K-JPG → KTX2 (Basis ETC1S, 1024 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |
| `themes/tex/Rock058_diff/nor.ktx2` | [Rock 058](https://ambientcg.com/a/Rock058) | ambientCG (Lennart Demes) | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Winter (Fels); 1K-JPG → KTX2 (Basis ETC1S, 512 px, Rauheit auf Gelände-Niveau angehoben; `tools/build_themes.mjs`) |

### Pflanzen-Karten (Poly Haven, CC0)

| Datei / Zelle | Poly-Haven-Modell | Autor(en) | Lizenz | Änderungen |
|---|---|---|---|---|
| `themes/veg/wueste.webp` (koecher1) | [Quiver Tree 01](https://polyhaven.com/a/quiver_tree_01) | James Ray Cock, Dario Barresi, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/wueste.webp` (koecher2) | [Quiver Tree 02](https://polyhaven.com/a/quiver_tree_02) | Dario Barresi, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/wueste.webp` (rooibos, rooibos2) | [Wild Rooibos Bush](https://polyhaven.com/a/wild_rooibos_bush) | James Ray Cock, Jenelle van Heerden | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/wueste.webp` (sukk1, sukk2) | [Cheiridopsis Succulent](https://polyhaven.com/a/cheiridopsis_succulent) | James Ray Cock, Jenelle van Heerden | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/stadt.webp` (jacaranda) | [Jacaranda Tree](https://polyhaven.com/a/jacaranda_tree) | Rob Tuytel, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/kueste.webp` (insel) | [Island Tree 02](https://polyhaven.com/a/island_tree_02) | Rob Tuytel, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/stadt.webp` (insel3) | [Island Tree 03](https://polyhaven.com/a/island_tree_03) | Rob Tuytel, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/kueste.webp` (pachira) | [Pachira Aquatica 01](https://polyhaven.com/a/pachira_aquatica_01) | Rob Tuytel, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/kueste.webp`, `stadt.webp`, `berg.webp` (strauch, strauch2) | [Shrub 02](https://polyhaven.com/a/shrub_02) | Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |
| `themes/veg/berg.webp` (jungtanne) | [Fir Sapling Medium](https://polyhaven.com/a/fir_sapling_medium) | Rob Tuytel, Rico Cilliers | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) | Seitenansicht als Karte gerendert (Impostor, `tools/make_theme_atlas.py`) |

**Eigene Arbeit (prozedural, keine Fremd-Assets):** Palmen-Karten (`tools/make_palm_card.py` – bei Poly Haven, ambientCG, Kenney
und Quaternius gibt es keine realistische CC0-Palme; Kenneys Low-Poly-Palmen wurden geprüft und verworfen), Fernkulisse
(Silhouetten-Ring, Tafelberge, Berge, Skyline, Meer), Tribünen, Zuschauer (Canvas, auch jubelnd), Fahnen, Start/Ziel-Portal,
Kamerakräne, Windräder, Heißluftballons, Zeppelin, Hochhäuser, Baukräne, Hochstraße, Leuchtturm, Segelboote, Ranch, Hütten,
Strandhäuser, Boden-Paletten je Thema (Schnee, Strand, Canyon-Schichten, Stadtviertel).

### Zielshow, Highlight-Kameras und Cockpit (n27, 05.10.2026) – eigene Arbeit, keine Dateien
Feuerwerk/Fontänen/Konfetti (`src/game/zielshow.js`, `src/gfx/pyro.js`) und die Feuerwerks-Töne (synthetisch in
`src/audio/sound.js`) sind eigener Code ohne Fremd-Assets. Die Cockpit-Materialien Leder, Alcantara, Carbon und gebürstetes
Alu (`src/gfx/cockpitmat.js`) werden zur Laufzeit prozedural erzeugt (Rauschen → Farbe, Rauheit, Normal-Map) – keine
Bilddateien, 0 KB zusätzlicher Download. Zuschauer-Silhouetten der Fan-Cam: Canvas-Formen (`src/ui/ui.js`).
