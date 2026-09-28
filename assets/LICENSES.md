# Lizenzen der Fremd-Assets

Alle hier genannten Dateien stammen aus freien Quellen (CC0 bzw. CC-BY 4.0). Code, Streckenbausteine,
Physik, Generator, Ton und Icons sind eigene Arbeit. Keine Assets aus „Stunts“ oder „Ultimate Stunts“.

## Auto (CC-BY 4.0 – Namensnennung erforderlich)

| Datei | Quelle | Autor | Lizenz | Änderungen |
|---|---|---|---|---|
| `car/goblin.glb` | [Fictional supercar – V12 Goblin](https://sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786) (Sketchfab) | Olli Teittinen ([ollitei](https://sketchfab.com/ollitei)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Spec-Gloss → Metal-Rough, Schattenebene entfernt, Geometrie vereinfacht (86k → 56k Dreiecke), Texturen WebP 1k, Meshopt-Kompression; im Spiel Lack per Maske umgefärbt |

| `car/goblin_lod.glb` | wie oben (abgeleitet) | Olli Teittinen (ollitei) | CC BY 4.0 | stark vereinfacht (86k → 6,5k Dreiecke), ohne Texturen, einfarbige Materialien – nur für geparkte Autos importierter Strecken, wird bei Bedarf geladen |

Fiktives Originaldesign (kein Markenauto). Namensnennung auch im Spiel unter „Credits“.

## .TRK-Import (Strecken des Stunt-Klassikers)

Das Spiel liest das dokumentierte Streckenformat ([wiki.stunts.hu/wiki/Track_file](https://wiki.stunts.hu/wiki/Track_file)).
Parser, Elementtabelle, Wegverfolgung und alle Bausteine/Szenerie-Modelle (Palme, Kaktus, Tennisplatz,
Tankstelle, Scheune, Bürohaus, Windmühle, Schiff, Imbiss) sind eigene Arbeit (prozedurale Geometrie).
Es werden **keine** fremden Strecken mitgeliefert: Importe wählt der Nutzer selbst, sie bleiben nur in
seinem Browser. Die Beispielstrecke im Spiel ist eine eigene Strecke (`src/track/showcase.js`).

## Himmel & Texturen (Poly Haven, CC0)

| Datei(en) | Poly-Haven-Asset | Autor(en) | Lizenz |
|---|---|---|---|
| `hdr/sky_1k.hdr`, `sky/sky.jpg` (aus 4k-HDR abgeleitet) | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Greg Zaal, Jarod Guest | [CC0](https://creativecommons.org/publicdomain/zero/1.0/) |
| `tex/asphalt_*` | [Asphalt 02](https://polyhaven.com/a/asphalt_02) | Rob Tuytel | CC0 |
| `tex/grass_*` | [Leafy Grass](https://polyhaven.com/a/leafy_grass) | Charlotte Baglioni | CC0 |
| `tex/concrete_*` | [Gravel Concrete 03](https://polyhaven.com/a/gravel_concrete_03) | Charlotte Baglioni | CC0 |
| `tex/pad_*` | [Concrete Floor 02](https://polyhaven.com/a/concrete_floor_02) | Rob Tuytel | CC0 |
| `tex/metal_*` | [Metal Plate](https://polyhaven.com/a/metal_plate) | Rob Tuytel | CC0 |
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
