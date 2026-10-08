# Grafik-Kern (`src/gfx/kern/`, n30)

Bausteine, die nichts von der Stuntbahn wissen und in andere three.js-Spiele (Bandenkick, Schmetterlingswiese) kopiert
werden: Datei(en) nach `src/gfx/kern/` legen, im Spiel ein paar Zeilen Anschluss. Kein Build-Schritt, WebGL2, three r186.

| Baustein | Dateien | Test |
|---|---|---|
| 1 Mess-Gate | `tests/perf_gate.py` + Szenen-JSON (`tests/perf_szenen.json`) | `tests/test_perf_gate_kern.py` |
| 2 Start-Kurzmessung | `kern/startprobe.js` | `tests/node/test_autopilot.mjs` (Teil 11) |
| 3 Qualitäts-Autopilot | `kern/autopilot.js` | `tests/node/test_autopilot.mjs` |
| 4 Impostor-Bäcker | `kern/oktaeder.js`, `kern/impostor.js`, `tools/build_impostor.{mjs,html,py}` | `tests/node/test_oktaeder.mjs` |
| – Lack-Spiegelung | `kern/reflex.js` | (nur im Browser) |
| – Asset-Kette | `tools/hdr_diaet.mjs`, `tools/build_assets.mjs --car-mid`, `tools/build_detail_nor.mjs` | `test_hdr`, `test_lod`, `test_detail` |

## So kopierst du das

**Autopilot + Kurzmessung** (Bandenkick `autoQuality()`, Schmetterlingswiese `Renderer.sample()` ersetzen):
1. `autopilot.js` und `startprobe.js` kopieren. `new GrafikAutopilot({ skala: { min, max, start, setzen } })`, dann je
   abschaltbarer Sache `ap.register(name, kosten, (stufe) => …)` in Abschalt-Reihenfolge, die Grafikstufe zuletzt mit
   `{ stufen, start, raufBeiSkalaMax: true }` und Rückgabe `{ skala: [min, max, start] }`.
2. Je Bild `ap.bild(abstandSek, cpuMs, gpu.ms)`; `gpu = new GpuZeit(gl)` mit `gpu.anfang()`/`gpu.ende()` um das Zeichnen,
   `cpuMs` = Zeit vom Bildanfang bis nach dem Zeichnen. Beim Szenenwechsel `ap.schonen(1.5)`.
3. Start: `ladeGeraet(localStorage, geraeteSchluessel(gl, …))`, sonst `messeBilder(() => zeichne(), gl)` → `skalaAusProbe`;
   bei jeder Änderung `merkeGeraet(...)`. Vorlage: `src/gfx/quality.js` (startAutopilot) und `src/main.js` (startAutopilot).

**Mess-Gate:** `tests/perf_gate.py` unverändert kopieren, nur eine eigene Szenen-JSON schreiben (`bereit`, `info`,
`szenen` mit `query` und `schritte`). Aufruf `python3 tests/perf_gate.py --szenen tests/perf_szenen.json --stand vorher`,
danach `--vergleich A.json B.json` für die Tabelle vorher/nachher.

**Impostors** (Bandenkick Häuser, Schmetterlingswiese ferne Tiere): `oktaeder.js` + `impostor.js` kopieren,
`tools/build_impostor.{mjs,html,py}` mitnehmen und in `tools/impostor_modelle.mjs` die eigenen Modelle eintragen (Name →
glTF). Backen: `python3 tools/build_impostor.py` (GPU-Browser) → `assets/tex/imp/`. Laufzeit:
`new ImpostorBibliothek(url, renderer)`, `await bib.vorladen([...])`, `impostorMesh(bib.art(name), liste, name, { patch })`.

**Lack-Spiegelung:** `reflex.js` kopieren, `rx.attach(material)` für die Materialien des Hauptobjekts, je Bild
`rx.update(objekt, { hide: [objekt] })` vor dem Zeichnen. Würfelgröße = PMREM-Größe der Umgebung (sonst neue Shader-Variante).
