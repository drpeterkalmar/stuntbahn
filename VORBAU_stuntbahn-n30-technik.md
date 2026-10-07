# Vorbau n30 Technik (Leicht-Spur) → Übergabe an den Heavy-Job `stuntbahn-n30-technik`

Stand: Branch `vorbau/stuntbahn-n30-technik` (9 Commits auf `origin/main` 7ab9f75), 07.10.2026. **main ist unberührt.**
Gebaut wurde ohne Browser, ohne Server, ohne Bundler. Alles Neue lässt sich per URL-Regler abschalten. Geprüft ist es nur
mit Node-Tests und einer statischen Import-Prüfung. **Nichts davon lief schon im Browser.** Shader-Code, Bild und Messung
muss der Heavy-Job abnehmen.

## Kurz: was fertig ist

| Etappe | Was | Regler (Standard) | Geprüft mit |
|---|---|---|---|
| E0 | Mess-Gate `tests/perf_gate.py` (Kern) + `tests/perf_szenen.json` (Stuntbahn) | – | `python3 tests/test_perf_gate_kern.py` (Logik ohne Browser). **Nicht ausgeführt.** |
| E1 | HDR-Diät 512×256, Halbfloat | `?hdr=1k` = alt (Standard: klein) | `tests/node/test_hdr.mjs` |
| E1 | Start-Kurzmessung + Gerätespeicher | `?startprobe=0` (Standard an), `?autopilot=0` = ganz alt | `test_autopilot.mjs` Teil 8 + 11 |
| E1 | Heldenauto-LOD 55,7 k / 15,3 k / 7,3 k | `?lod=0` (Standard an) | `tests/node/test_lod.mjs` |
| E1 | Enge Schattenkamera, Kino 1024 | `?schattenkam=0` = alt (Standard eng) | `test_autopilot.mjs` Teil 13 |
| E1 | Fahrbahn-Mikrodetail + Spurrinnen | `?detail=0` (Standard an, nur Stufe ≥ 1) | `tests/node/test_detail.mjs` |
| E2 | Qualitäts-Autopilot `src/gfx/kern/autopilot.js`, `quality.js` umgestellt | `?autopilot=0` = alte Automatik (Standard: neu) | `tests/node/test_autopilot.mjs` (künstliche Last) |
| E3 | Dynamische Lack-Spiegelung `kern/reflex.js` | `?reflex=0` aus, `?reflex=2` nur Kino (Standard ab Standard) | nur `node --check`, braucht Browser |
| E3 | Gebackene Vertex-AO für die Strecke `src/track/vao.js` | `?vao=0` aus, `?vao=sync` sofort (Standard: schrittweise) | `tests/node/test_vao.mjs` |
| E3 | Oktaeder-Impostors (Mathe, Laufzeit, Bäcker) | `?impostor=0` (Standard an, **aber wirkt erst nach dem Backen**) | `tests/node/test_oktaeder.mjs`; **Atlas nicht gebacken** |
| E4 | Kern-Anleitung `src/gfx/kern/LIESMICH.md` | – | – |

Neue Node-Tests stehen in `tests/node/run_all.mjs`: test_autopilot, test_lod, test_hdr, test_detail, test_vao,
test_oktaeder. Einzeln gelaufen und grün. Die geänderten Altbestände sind ebenfalls grün: test_quality_blur, test_deco,
test_cockpit, test_roehre_buckel. **Die ganze Suite `npm run test:node` lief nicht** (Leicht-Spur: < 2 min CPU je Aufruf).
→ Heavy: einmal komplett laufen lassen.

## Reihenfolge für den Heavy-Job

1. **E0 vorher auf main messen, BEVOR gemergt wird.** main als zweite Kopie auschecken, z. B.
   `git worktree add ~/dev/stuntbahn_vorher origin/main`. Dann aus diesem Branch:
   `python3 tests/perf_gate.py --wurzel ~/dev/stuntbahn_vorher --stand vorher`. Die Szenen nutzen nur `__game`-Funktionen,
   die es auf main schon gibt (teleport, sim, freeze, cam, replay, start). `?startprobe=0` ist auf main wirkungslos.
   Danach `--stand nachher` ohne `--wurzel`, dann `--vergleich tests/perf/<datum>_vorher.json tests/perf/<datum>_nachher.json`.
   Läuft ~7 Szenen × hoch/quer nacheinander, je ein Browser.
2. Browser-Abnahme Punkt für Punkt (unten). Bei Fehlern im Shader: Konsole lesen. three.js meldet Shader-Fehler als
   `console.error`, `tests/util.py` zählt sie als Fehler.
3. Impostors backen (`python3 tools/build_impostor.py`), ansehen, im Spiel abnehmen oder zurückstellen.
4. Version, `python3 tools/update_sw.py` (neue Kern-Dateien, HDRs und LODs in die Precache-Liste), Cache-Busting,
   `.gitignore`-Ausnahme für `tests/shots/technik/` (Collagen; der Ordner ist heute komplett ignoriert), Bericht, Merge, Push,
   Live-Check.

## Je Schritt: fertig · geprüft · abnehmen · Risiken

### E0 Mess-Gate (`tests/perf_gate.py`, `tests/perf_szenen.json`, `tests/test_perf_gate_kern.py`)
- **Fertig:** Der Kern weiß nichts von der Stuntbahn, die Szenen kommen aus der JSON-Datei.
  - Profil: CPU ×4 (CDP), DPR 2,6, 412×915 hoch und 915×412 quer, Mobil-UA, GPU-Flags wie `tests/util.py`.
  - Gemessen werden p50/p95/p99/fps aus rAF-Abständen über ≥ 10 s und die Mittelwerte von `info` (Draw-Calls inkl.
    Maximum, Dreiecke, Texturen).
  - `zusatz` = `__game.info()`: Autopilot-Zustand, LOD, Spiegelung, Vertex-AO, Impostor-Status landen im JSON.
  - Ladegröße: alle Anfragen bis „bereit“ + 4 s Nachlauf, auch aus Workern. Roh und gzip-9 rechnet das Skript aus den
    Dateien auf der Platte, externe Anfragen listet es auf.
  - Ergebnis nach `tests/perf/<datum>_<stand>.json` (nicht ignoriert). `--runden 3` nimmt den Median-Lauf.
- **Szenen:**
  - menu_kino
  - looping_kino, looping_standard: Galerie, Auto kopfüber im ersten Looping, Spiel angehalten, das Bild läuft weiter
  - rennen_kino
  - cockpit_kino
  - replay_kino: Autopilot fährt ins Ziel, dann normales Replay
  - rennen_autopilot: ohne `?q`, also mit Qualitäts-Autopilot, 20 s
- **Abnehmen:** Läuft es auf main und auf dem Branch durch? Die `bis`-Schleife im Looping braucht bis zu 90 s.
  Kommt die Galerie-Strecke ohne `loop`-Teil, bricht die Szene mit „kein Looping“ ab.
- **Risiko:** In den Looping-Szenen steht das Spiel (`freeze`). Die Physik-CPU fehlt dort, die Zahlen sind reine
  Zeichenkosten. Die echte Fahrt steckt in rennen_kino und rennen_autopilot.

### E1 HDR-Diät (`tools/hdr_diaet.mjs`, `src/gfx/env.js`, `assets/hdr/sky_512.hdr`, `assets/themes/*/env_512.hdr`)
- **Fertig:** Reines Node, kein Install. Liest RGBE, kappt die Sonne genau wie bisher zur Laufzeit (Leuchtdichte > 4 → 4),
  rechnet dann 2×2-Mittel und schreibt RLE.
  - **8,39 MB → 2,25 MB (−6,13 MB).** Abweichung im Umgebungslicht (gerichtete Mittel ±x/±z, oben/unten) je Thema 0,10–0,26 %.
  - Loader mit `HalfFloatType`; die Kapp-Schleife kann jetzt auch Halbfloat (`DataUtils`).
  - `?hdr=1k` lädt die alten Dateien mit Float.
  - `update_sw.py` cacht `sky_1k.hdr` nicht mehr vorab. Die alten Dateien bleiben für A/B im Repo, gehen aber nicht in den
    Download.
- **Abnehmen:** Collage je Thema, Himmel + Lack, Vergleich `?hdr=1k` gegen Standard.
  - Der Himmel kommt aus `sky.jpg` und ändert sich nicht.
  - Sichtbar werden kann es bei **scharfen Spiegelungen**: Glas (Rauigkeit 0,04) und Klarlack (0,06). Der PMREM-Würfel ist
    jetzt 128 statt 256.
  - Wird es sichtbar schlechter: nur `sky_512` bzw. `env_512` für das Auto-Material auf 1k lassen, oder die HDR-Diät mit
    `--breite=1024` (unverkleinert, nur gekappt) – das spart dann aber nichts.

### E1 Start-Kurzmessung (`src/gfx/kern/startprobe.js`, `src/main.js` → `startAutopilot()`)
- **Fertig:**
  - Gerät mit gespeichertem Wert (localStorage `grafikKern.<schlüssel>`, Schlüssel = GPU-Name + Bildschirm + DPR,
    drehfest, 21 Tage gültig): Start mit diesem Wert, ohne Messung.
  - Sonst zeichnet der Ladebildschirm 4 + 20 Bilder der fertigen Szene, jedes mit `readPixels` abgeschlossen.
    Aus dem Median folgt `skalaAusProbe` = Skala·√(Ziel/Arbeit), abgerundet auf 0,05, Bereich der Stufe (Kino 0,7–1,0).
  - Kino bleibt Startstufe.
  - `__app.startProbe` zeigt das Ergebnis.
- **Abnehmen:**
  - Ladezeit-Zuwachs messen (≈ 24 Bilder).
  - Keine Fehler: Die Messung zeichnet **vor** `ui.bind`/`ui.showMenu`. `render()` ruft im Menü nur `ui.gmeter(null)`
    und `ui.hudG(null)`, das sollte gehen, ist aber nicht im Browser geprüft.
  - Alle alten Playwright-Tests booten dadurch ~0,5–1 s länger (frisches Profil = keine Speicherung). Wer das nicht will:
    `?startprobe=0` in die Test-Query.
- **Annahme/TODO:**
  - `szenenFaktor` (Rennen gegenüber Menü-Szene) steht auf 1,0 und ist am Gerät abzustimmen.
  - Ziel 82 % von 16,7 ms.

### E1 Heldenauto-LOD (`tools/build_assets.mjs --car-mid`, `src/gfx/carlod.js`, `src/gfx/carmesh.js`, `main.js`)
- **Fertig:**
  - `goblin_mid.glb` (15 265 Dreiecke, 253 KB) und `goblin_far.glb` (7 268, 157 KB), gebaut mit gltf-transform `simplify`
    aus `assets_src/goblin_src.glb`.
  - Gleiche Knoten- und Materialnamen wie der Held, UVs bleiben, keine eigenen Texturen.
  - Zur Laufzeit hängen die Stufen in dieselben Rad-Pivots. Die Materialien kommen per Name aus dem Helden, also auch
    Lack-Maske und Umfärben.
  - Statt `THREE.LOD` wird umgeschaltet, weil sich die Räder einen Pivot teilen.
  - Grenzen 25 m / 60 m bei 62° Bildwinkel, Tele rückt sie weiter weg, Hysterese ±10 %.
  - Der Geist ist immer mindestens Mittel.
  - Nachgeladen wird **nach** dem Start, nicht im Ladebildschirm.
  - Eintrag in `assets/LICENSES.md`.
  - Erzwingen für Fotos: `__app.lodForce = 0|1|2` (`undefined` = automatisch).
- **Abnehmen:**
  - Verfolger weit, Replay-Totale, Geist: Collage LOD 0/1/2 nebeneinander (`lodForce`).
  - Springt es beim Umschalten?
  - `__game.info().carLod` in den Szenen ansehen.
- **Risiko:** `lockBorder: false` beim Vereinfachen kann an UV-Nähten kleine Risse geben. Ab 25 m sieht man sie
  vermutlich nicht.

### E1 Enge Schattenkamera (`src/gfx/quality.js` → `shadowBox()/apply()`)
- **Fertig:**
  - Box ±3,6 m statt ±7 m, Tiefe 48–72 m statt 1–140 m. In die Echtzeit-Karte malt nur das Auto, die Welt steckt in der
    gebackenen Karte.
  - Kino 1024 statt 2048: Texel 7,0 mm statt 6,8 mm. Standard wird doppelt so scharf.
  - Der Versatz in Metern bleibt gleich (5,6 cm), also bias −0,0023.
- **Abnehmen:**
  - Schattenakne bzw. abgelöster Schatten am Auto: Menü, Looping, flache Sonne (Winter, Abend-Themen).
  - Wird der Schatten bei hohem Sprung am Rand abgeschnitten? Die Box folgt dem Auto, das sollte nicht passieren.

### E1 Fahrbahn-Mikrodetail (`tools/build_detail_nor.mjs`, `assets/tex/asphalt_detail_nor.webp`, `materials.js` patchRoad)
- **Fertig:**
  - Selbst erzeugte, kachelbare Detail-Normalmap „Asphaltkorn“ (Worley-Splitt, 256², 39 KB, CC0 eigenes Werk, in
    LICENSES), 0,55 m je Kachel.
  - Eingeblendet in 4–20 m Entfernung, nur Stufe ≥ 1.
  - Dazu Spurrinnen: zwei Bänder bei ±34 % der halben Breite, glatter und 5 % dunkler.
  - Uniform `detailUniforms` (sbDetailTile/Str, sbRut) zum Abstimmen.
- **Abnehmen:** Fahrbahn nah (Verfolger, Stoßstange, Cockpit), hoch und quer. Moiré? Zu stark? Liegen die Spurrinnen
  sinnvoll? Sie sind symmetrisch, kennen die Ideallinie nicht.
- **Startwerte (am Bild abstimmen):** Stärke 0,55, Spurrinnen −0,14 Rauigkeit / −5 % Helligkeit.

### E2 Qualitäts-Autopilot (`src/gfx/kern/autopilot.js`, `src/gfx/quality.js`, `main.js`)
- **Fertig:**
  - Misst Arbeitszeit statt rAF-Abstand. CPU = Bildanfang bis nach dem Zeichnen; GPU = `EXT_disjoint_timer_query_webgl2`
    (Klasse `GpuZeit`, Ergebnis kommt 1–3 Bilder verspätet, „disjoint“ wird verworfen).
  - Ohne GPU-Zeit (viele Android-Geräte) zählen Bildrate und vorsichtiges Hochtasten.
  - Reihenfolge runter:
    1. Unschärfe (wie bisher, Regel aus quality.js)
    2. Renderskala stufenlos im Bereich der Stufe, Raster 0,02, lernt ein Kostenmodell fest + pix·s²
    3. Deko sparsam
    4. Lack-Spiegelung
    5. Auto-Schatten
    6. Stufe (ohne GPU-Zeit erst unter 45 fps, wie bisher)
  - Rauf in umgekehrter Reihenfolge; die Stufe erst, wenn die Renderskala am Maximum ist.
  - Hysterese: runter nach 2 schlechten 0,5-s-Fenstern, rauf nach 6 guten. Rauf nur, wenn die Vorhersage unter 88 % des
    Bildtakts bleibt (runter ab 92 %).
  - Ein gescheiterter Schritt nach oben wird zurückgenommen und genau dieser Schritt 8 → 16 → … 120 s gesperrt.
  - CPU-Engpass (CPU > 1,25 × GPU): Die Renderskala wird übersprungen.
  - Schonzeit 1,5 s beim Start und nach jedem Streckenbau.
  - Feste Nutzerwahl pausiert ihn. Zurück auf „Automatisch“ setzt er auf der Stufe neu auf.
  - `?autopilot=0` = alte `sample()`-Logik, unverändert.
- **Geprüft** (`tests/node/test_autopilot.mjs`, simuliertes Gerät, mit und ohne GPU-Zeit, auch harte 30/60-Vsync):
  - Last ×1,8 → erster Schritt nach 0,78 s
  - flüssig nach 10 s
  - Last weg → rauf nach ≤ 3 s, am Ende volle Qualität
  - an der Kante ≤ 4 Änderungen in 2 min
  - Reihenfolge stimmt
  - Einzelhänger und Schonzeit ändern nichts
  - Start mit Probe: 60 fps in den ersten 10 s (ohne Probe 55)
- **Abnehmen:**
  - `rennen_autopilot` im Gate.
  - `__game.info().ap` / `apLog` unter ×4 ansehen.
  - Gibt headless-Chrome GPU-Zeit (`info().gpuZeit`)?
  - Kein Pendeln, kein Ruckeln in den ersten 10 s.
  - Gegenprobe `?autopilot=0`.
- **TODO:** Die geschätzten Kosten (deko 0,08, reflex 0,06, autoschatten 0,06, stufe 0,3) mit dem Gate nachmessen.

### E3 Dynamische Lack-Spiegelung (`src/gfx/kern/reflex.js`, `main.js` drawFrame)
- **Fertig:**
  - 128er-Würfel (HalfFloat) 0,9 m über dem Auto, je Bild **eine** Seite.
  - Danach wird alle 6 Bilder per `needsPMREMUpdate` vorgefiltert.
  - Das Auto und der Geist sind dabei ausgeblendet. Die Schattenkarte wird nicht neu gezeichnet.
  - Hängt erst nach der ersten vollen Runde an alle Auto-Materialien (Held + LOD; auch die Cockpit-Lackteile).
  - Größe 128 = PMREM-Größe der 512er-Umgebung, also keine neue Shader-Variante.
  - Übersprungen bei Cockpit (Auto unsichtbar) und Fern-LOD.
  - Läuft in `drawFrame`, damit `drawOnce` der Mess-Skripte ihn mitzählt.
- **Abnehmen:**
  - Draw-Calls am Looping (Ziel ≤ 120; heute 79–81, eine Würfelseite kostet je nach Richtung ~10–30).
  - p95 gegen `?reflex=0`. **Bei > +8 % p95: `REFLEX_MIN` in main.js auf 2 (nur Kino).**
  - Bild: Spiegelt sich die Strecke im Lack? Wirkt der Himmel in der Spiegelung zu dunkel (sky.jpg statt HDR)?
    Dann `rx.attach(m, intensity)` mit z. B. 1,2.
  - Erstes Bild nach dem Umschalten: hakt es durch Neuübersetzen?
- **Risiko:**
  - Der PMREM-Lauf kostet im 6. Bild ~25 Draw-Calls (Spitze).
  - Falls three.js die Würfelseiten gespiegelt einliest, sieht man es sofort (Straße oben). Dann `cam.children`-Reihenfolge
    bzw. `flipY` prüfen.

### E3 Gebackene Vertex-AO (`src/track/vao.js`, `gfx/world.js` vaoAuftrag, `materials.js` patchVertexAO, `main.js`)
- **Fertig:**
  - Je Eckpunkt der Strecken-Batches 6 Strahlen (4,5 m) in die Halbkugel gegen die Kollisionswelt. Nahe Treffer zählen
    voll.
  - Gleiche Stellen werden nur einmal gerechnet. Budget 900 000 Strahlen.
  - Als Generator gebaut: rechnet schrittweise nach dem Zeichnen, außerhalb der Autopilot-Messung. Im Menü bis 8 ms je
    Bild, im Rennen bis 3 ms.
  - Wenn fertig, kommt das Attribut `aOcc` dran und blendet über 1,5 s ein.
  - Dämpft das Umgebungslicht voll und die Sonne 25 %.
  - Meshes ohne Attribut bekommen per `defaultAttributeValues` den Wert 0 und bleiben unverändert.
  - `__game.info().vao` zeigt Fortschritt und Statistik.
- **Geprüft:** `test_vao.mjs`: Wandecke dunkler als freie Fläche; 6 echte Strecken (flach, 3D, Gelände); Median 0
  (offene Fahrbahn bleibt hell); 9–19 % deutlich verdeckt; schrittweise = auf einmal.
  Rechenzeit 0,26–0,58 s je Strecke (Node/Mac), am Handy ×4–6. Darum schrittweise; fertig nach ~10–30 s im Menü.
- **Abnehmen:**
  - Bild mit/ohne (`?vao=0`, `?vao=sync` für Fotos), Tunnel, Röhre, Brücke, Wandfuß.
  - Danach entscheiden: **SSAO auf Kino aus?** A/B mit `?kl=-ssao`. Wenn gut, in `kinolook.js` PRESETS[2] `ssao: false`
    setzen. Das spart den AO-Pass, und Standard hat AO dann gratis.
  - Ruckelt das Menü auf dem Handy-Profil durch die 8 ms?
- **Nicht gemacht:** AO für Tribünen/Banden der Deko (gfx/deco.js, kulisse.js). Die sind nicht in der Kollisionswelt.
  Vorlage wäre dieselbe Funktion `verdeckung()` mit einer Strahl-Welt aus der Deko-Geometrie.

### E3 Oktaeder-Impostors (`src/gfx/kern/oktaeder.js`, `kern/impostor.js`, `tools/build_impostor.{mjs,html,py}`, `tools/impostor_modelle.mjs`, `kulisse.js`)
- **Fertig:**
  - Halb-Oktaeder-Mathematik (JS + GLSL-Gegenstück), Node-getestet: umkehrbar, Abdeckung ≤ 18,1° bei 8×8, stetige Wahl
    der 3 Ansichten, Basis wie eine three.js-Kamera, Laufzeit-UV = Back-UV.
  - Laufzeit-Material: MeshStandardMaterial mit eingehängtem Impostor-Teil.
    - Billboard zur Kamera im Objektraum
    - 3 Ansichten gemischt
    - Normalen-Atlas (Objektraum) → three.js-Licht, Nebel, gebackener Sonnenschatten (`patchStaticShadow`)
    - Tönung + Schnee aus den Themen-Uniforms, Herbstfarben als Instanzfarbe
    - 1 Draw-Call je Art
  - Bäcker:
    - `build_impostor.html` lädt die Modelle (Poly Haven aus `assets_src/`) bzw. baut eine **3D-Tanne aus den
      Zweig-Texturen**, weil es kein Tannen-Modell gibt.
    - `build_impostor.mjs` backt Farbe (Albedo, unbeleuchtet) und Normalen in 1024²-Atlanten (8×8 × 128 px).
    - `build_impostor.py` (Playwright, GPU) blutet Ränder aus, schreibt WebP + `assets/tex/imp/impostor.json` und
      Vorschauen nach `tests/shots/technik/impostor_<art>.png`.
  - `kulisse.js`: Tannen (tanne0/1), Herbstlaub (laub1/2) und Themenbäume (koecher1/2, insel, jacaranda, insel3) werden
    ersetzt, **sobald ihr Atlas geladen ist**. Palmen bleiben Karten, es gibt kein Modell.
  - `impostor.json` ist leer eingecheckt (kein 404). Darum ist heute alles wie bisher.
  - `update_sw.py` cacht nur die Tannen-Atlanten vorab.
- **Abnehmen:**
  1. `python3 tools/build_impostor.py` (ein Browser, 9 Arten, Minuten).
  2. Vorschauen ansehen: Tanne dicht genug? Stimmt die Farbe?
  3. Im Spiel Standard/Kino, nah/fern, hoch/quer, gegen `?impostor=0`.
  4. Draw-Calls (+1–2 je Thema), Ladegröße (+~0,3–0,5 MB je Art), p95.
- **Risiken (Startwerte + TODO):**
  - **Shader nicht im Browser übersetzt.** Wahrscheinlichste Fehlerstellen: `inverse()` im Vertex-Shader, der Ersatz von
    `begin_vertex` (eigene `transformed`-Deklaration) und `normal = …` nach `normal_fragment_maps`.
  - Farbe: Die alten Karten haben Licht eingebacken, die Impostors nicht. Die Materialfarbe (Tanne 0xd8f0c8 + emissive) ist
    wahrscheinlich nachzuziehen.
  - Steil von oben (Drohnen-/Replay-Kamera) mischen die Ansichten nahe dem Pol mit stark gedrehter Bild-Basis → kann
    verschwimmen. Abhilfe: Halbkugel auf ≤ 60° Höhe begrenzen (Formel in oktaeder.js anpassen; der Test sagt, ob alles
    zusammenpasst).
  - Die Tanne aus Zweig-Vierecken ist ein erster Wurf (30 Quirle, je Ast 2 Vierecke). Passen Form und Dichte nicht,
    `tanne()` in `tools/impostor_modelle.mjs` ändern und neu backen.
  - Der Nahbereich (< 15 m) bleibt ebenfalls Impostor. Der Auftrag erlaubt dort das Modell, gebaut ist es nicht.
  - Kein Wind auf den Impostors (die Karten-Tannen hatten auch keinen).
- **Fällt es durch:** `impostor.json` leer lassen → Karten wie bisher, ohne Code-Rückbau.

## Ladegröße (Dateien, ohne Messung im Browser)
- Weniger: HDRs −6,13 MB (vorab gecacht: Land −1,06 MB; die Themen beim ersten Besuch je −0,8 MB).
- Mehr:
  - Auto-LOD +0,41 MB (nach dem Start nachgeladen)
  - Detail-Normalmap +0,04 MB
  - Impostor-Atlanten nach dem Backen ~+0,5–0,8 MB für die Tannen (vorab), Themen bei Bedarf
- Gesamtbild und gzip misst der Heavy-Job mit `perf_gate.py`.

## Nicht gemacht (bewusst)
- Keine Messung, kein Foto, kein Browser-Lauf, kein Live-Check, keine Versionsnummer, kein `update_sw.py`-Lauf
  (sw.js/build.js unverändert) → Heavy.
- `TECHNIK_BERICHT.md`, README/KINOLOOK-Abschnitt → Heavy. Vorlage: `src/gfx/kern/LIESMICH.md` (Bausteine,
  „so kopierst du das“), dort nur verlinken.
- SSAO-Abschaltung auf Kino: erst nach dem Bildvergleich mit der Vertex-AO.
- AO für Deko-Tribünen/Banden; Nahbereichs-Modell bei den Impostors.
- TAAU, WebGPU: laut Auftrag nicht (n31).
