# Grafik-Kern (`src/gfx/kern/`, n30)

Bausteine, die nichts von der Stuntbahn wissen und in andere three.js-Spiele (Bandenkick, Schmetterlingswiese) kopiert
werden: Datei(en) nach `src/gfx/kern/` legen, im Spiel ein paar Zeilen Anschluss. Kein Build-Schritt, WebGL2, three r186.

| Baustein | Dateien | Test |
|---|---|---|
| 1 Mess-Gate | `tests/perf_gate.py` + Szenen-JSON (`tests/perf_szenen.json`) | `tests/test_perf_gate_kern.py` |
| 2 Start-Kurzmessung | `kern/startprobe.js` | `tests/node/test_autopilot.mjs` (Teil 11) |
| 3 Qualitäts-Autopilot | `kern/autopilot.js` | `tests/node/test_autopilot.mjs`, im Browser `tests/test_autopilot.py` |
| 4 Impostor-Bäcker | `kern/oktaeder.js`, `kern/impostor.js`, `tools/build_impostor.{mjs,html,py}` | `tests/node/test_oktaeder.mjs` |
| – Lack-Spiegelung | `kern/reflex.js` | `tests/technik_shots.py reflex`, A/B mit `perf_gate.py --ab` |
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
danach `--vergleich A.json B.json` für die Tabelle vorher/nachher. Belastbarer ist der Wechsel-Modus:
`--ab vorher=../spiel_alt:: --ab nachher=` (alte Fassung als zweite Kopie, z. B. `git worktree add ../spiel_alt main`),
Runde für Runde abwechselnd, Median je Variante; `--ab ohne_x=&x=0` vergleicht einen URL-Regler.
Zwei Fallen auf diesem Mac (siehe Kopf von `perf_gate.py`): Aus einer Hintergrund-Queue gestartete Browser werden von macOS
auf ~15 Bilder/s gedrosselt → Standard ist Start per `open` + CDP; und mit 60-Hz-Deckel sättigt p95 bei 16,7 ms → Standard
ist ungedeckelt (`--mit-vsync` für den Deckel).

**Impostors** (Bandenkick Häuser, Schmetterlingswiese ferne Tiere): `oktaeder.js` + `impostor.js` kopieren,
`tools/build_impostor.{mjs,html,py}` mitnehmen und in `tools/impostor_modelle.mjs` die eigenen Modelle eintragen (Name →
glTF). Backen: `python3 tools/build_impostor.py` (GPU-Browser) → `assets/tex/imp/`. Laufzeit:
`new ImpostorBibliothek(url, renderer)`, `await bib.vorladen([...])`, `impostorMesh(bib.art(name), liste, name, { patch })`.

**Lack-Spiegelung:** `reflex.js` kopieren, `rx.attach(material)` für die Klarlack-Materialien des Hauptobjekts
(MeshPhysicalMaterial mit clearcoat > 0), Objekte, die sich spiegeln sollen, auf eine eigene Ebene legen
(`obj.layers.enable(2)`, `new DynReflex(renderer, scene, { layer: 2, far: 150 })`), je Bild
`rx.update(objekt, { hide: [objekt], skip: … })` vor dem Zeichnen – erst wenn die Schattenkarten existieren.
Kein Vorfiltern (PMREM): der Würfel hat Mipmaps, nur der Klarlack liest ihn; an/aus = ein Uniform (kein Hänger).
Kosten im Handy-Profil: eine Würfelseite je Bild ≈ 10–17 Draw-Calls; auf dem Mac-Profil Kino 0–3 % p95, Standard
+26–31 % → in der Stuntbahn nur auf Kino. Für kleine Szenen (Fußballplatz) eher günstiger.
**Vertex-AO** (`src/track/vao.js`, spielspezifisch, aber übertragbar): Strahlen je Eckpunkt gegen die Kollisionswelt,
schrittweise in den ersten Bildern. Lehre aus der Abnahme: nur Vorderseiten zählen, und grob vernetzte Böden (Fahrbahn
mit Ecken nur am Rand) ausnehmen, sonst verschmiert die Verdeckung über die ganze Fläche.
