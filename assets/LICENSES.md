# Lizenzen der Fremd-Assets

Alle hier genannten Dateien stammen aus freien Quellen (CC0 bzw. CC-BY 4.0). Code, Streckenbausteine,
Physik, Generator, Ton und Icons sind eigene Arbeit. Keine Assets aus „Stunts“ oder „Ultimate Stunts“.

## Auto (CC-BY 4.0 – Namensnennung erforderlich)

| Datei | Quelle | Autor | Lizenz | Änderungen |
|---|---|---|---|---|
| `car/goblin.glb` | [Fictional supercar – V12 Goblin](https://sketchfab.com/3d-models/fictional-supercar-v12-goblin-0a20e49ad5774d778567cb5c3f345786) (Sketchfab) | Olli Teittinen ([ollitei](https://sketchfab.com/ollitei)) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | Spec-Gloss → Metal-Rough, Schattenebene entfernt, Geometrie vereinfacht (86k → 56k Dreiecke), Texturen WebP 1k, Meshopt-Kompression; im Spiel Lack per Maske umgefärbt |

Fiktives Originaldesign (kein Markenauto). Namensnennung auch im Spiel unter „Credits“.

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

Alle Texturen wurden auf 1024 px verkleinert und als WebP gespeichert (`tools/build_assets.mjs`).
Reproduzierbar laden: `python3 tools/fetch_assets.py`, danach `python3 tools/make_sky.py`,
`python3 tools/make_tree_card.py`, `node tools/build_assets.mjs`.

## Bibliotheken

| Datei(en) | Projekt | Lizenz |
|---|---|---|
| `lib/three.*.min.js`, `lib/addons/**` | [three.js](https://threejs.org) r186 | MIT (`lib/THREE_LICENSE.txt`) |
| `lib/addons/libs/meshopt_decoder.module.js` | [meshoptimizer](https://github.com/zeux/meshoptimizer) (über three.js) | MIT |
