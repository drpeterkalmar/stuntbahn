# Kino-Look – Portierungs-Notiz (n17, Pilot aus der Stuntbahn)

`src/gfx/kinolook.js` ist ein eigenständiges Modul für three.js (r150+, WebGL2): **Szene + Kamera + Renderer rein, fertiges
Bild raus.** Es ersetzt das direkte `renderer.render(scene, camera)` durch einen einzigen Szenen-Durchlauf in ein
Render-Target und ein Endbild mit Licht-/Farb-Effekten. Abhängigkeiten: nur `three`. Lizenz: eigener Code.

## Einbau in ein anderes three.js-Spiel (Checkliste)

1. **Datei kopieren:** `src/gfx/kinolook.js` (keine weiteren Dateien nötig).
2. **Erzeugen** (nach dem Renderer):
   ```js
   import { KinoLook } from './kinolook.js';
   const kino = new KinoLook(renderer, { level: 1, grade: 'mittag', stages: new URLSearchParams(location.search).get('kl') || '' });
   ```
   `renderer.toneMapping` (Neutral empfohlen) und `outputColorSpace = SRGBColorSpace` bleiben wie im Spiel – das
   Render-Target übernimmt sie (8 bit, Handy-Bandbreite). Canvas mit `antialias: true` lassen (Stufe „Einfach“ zeichnet
   direkt).
3. **Zeichnen** statt `renderer.render(scene, camera)`:
   ```js
   kino.render(scene, camera, { dt, sunDir, overlay: (r) => hud3d.render(r) });
   ```
   - `sunDir`: normierte Richtung **zur** Sonne (Welt) → Sonnen-Blendung + warme Luftperspektive. Ohne: keine Blendung.
   - `overlay(renderer)`: alles, was scharf und unbehandelt darüber soll (Cockpit, 3D-HUD). Muss `autoClear=false` +
   `clearDepth()` selbst machen.
   - Optional Bewegungsunschärfe: `run, speed (m/s), boost, car (Object3D bleibt scharf), cut (Kameraschnitt)`, vorher
   `kino.setCarBox(box)` mit der Box des Spielerobjekts in dessen Koordinaten. Für Spiele ohne Tempo einfach weglassen.
   - Optional Hitzeflimmern: `heat: [{ a, b, r, k }]` (Welt-Strecke a→b, Radius, Stärke 0…1).
4. **Stufen** an die Qualitäts-Automatik hängen: `kino.setLevel(0|1|2)` (0 = Einfach: direktes Zeichnen, 1 = Standard,
   2 = Kino) und bei schlechter Bildrate `kino.adapt(fps)` aufrufen (senkt/hebt die Renderskala; gibt `true` zurück, wenn
   sich etwas geändert hat). Vorlage: `src/gfx/quality.js` (`kinoOn`, Reihenfolge Renderskala → Deko → Stufe).
5. **Weltmaßstab anpassen** (Konstruktor-Optionen): `aerial: { density, falloff, base, max }` – Dunst je Meter. Stuntbahn:
   `density 0.0003` bei Strecken bis ~1 km. Kleine Welten (Fußballplatz 40 m) brauchen ~10× mehr oder `kl=-aerial`.
   Umgebungsverdeckung: `PRESETS[n].ao.radius` in Metern (Stuntbahn 1,1–1,2 m; Figuren-Spiele eher 0,4 m).
6. **Farbkorrektur** je Himmel/Tageszeit: `grade: 'mittag' | 'morgen' | 'abend' | 'nacht' | 'neutral'` oder eigenen Eintrag in
   `GRADES` (Weißabgleich, Lift/Gamma/Gain, Schatten kühl/Lichter warm, Sättigung, Kontrast, Grün-Bremse).
7. **Kontaktschatten** (optional): `makeContactShadow({ width, length, y })` liefert ein Mesh für unter Figuren/Fahrzeuge;
   `mesh.set(alpha)` blendet aus (Sprung). 1 Draw-Call, ersetzt bei Figuren oft die Schattenkarte.
8. **A/B-Schalter** übernehmen: `?look=0|1|2` (Stufe erzwingen), `?kl=-bloom,+ssao` (einzelne Stufen), einen Weg „alt“.
9. **Tests**: Bild aus dem Canvas direkt nach `kino.render` lesen (`toDataURL` im selben Task), Mittelwert/Streuung
   prüfen (nicht schwarz, nicht weiß), `kino.describe()` für Stufe/Größe/aktive Stufen. Vorlage `tests/test_kinolook.py`.

## Was nicht automatisch passt
- **Eigene ShaderMaterials** müssen `#include <tonemapping_fragment>` und `#include <colorspace_fragment>` haben, sonst
  sehen sie im Render-Target anders aus als direkt gezeichnet.
- **Tiefe**: Umgebungsverdeckung, Dunst und Unschärfe lesen die Tiefe des Render-Targets. Objekte ohne Tiefenschreiben
  (Partikel, Himmel) bekommen keinen Dunst; der Himmel muss `depthWrite: false` haben (Tiefe = 1 → „Himmel“).
- **Logarithmischer Tiefenpuffer** wird nicht unterstützt (Rekonstruktion über `projectionMatrixInverse`).
- **Mehrere Kameras/Split-Screen**: je Ansicht eine eigene `KinoLook`-Instanz (Zustand der Unschärfe ist je Kamera).

## Aufwand je Spiel (Schätzung)
| Spiel | Technik heute | Aufwand | Hinweise |
|---|---|---|---|
| Bandenkick | three.js, Neutral-Tonemapping, direktes Zeichnen | **½–1 Tag** | Kleine Welt: Dunst stark reduzieren, AO-Radius 0,4 m, Kontaktschatten unter Spielern/Ball, keine Unschärfe |
| Schmetterlingswiese (`butterfly-game`) | three.js mit eigenem Toon-Shader und eigener Post-Kette (Bloom/DoF über ¼-Blur) | **1–2 Tage** | Eigene Kette durch `KinoLook` ersetzen oder nur Grade/Hochskalieren übernehmen; Toon-Look → `grade: 'neutral'` + eigener Grade, kein AO |
| Koboldkeller, Bären-Beautysalon | **Canvas 2D** | eigene Variante, **1–2 Tage** | Kein WebGL → Kino-Look als 2D-Endbild: Farbkorrektur/Vignette/Glühen über `ctx.filter` bzw. ein WebGL-Overlay-Canvas, das das 2D-Bild als Textur bekommt (Grade, Bloom, Vignette, Dither – ohne Tiefe, also ohne Dunst/AO) |
| Spielebox | DOM/2D | lohnt nicht | – |

## Grafik-Kern `src/gfx/kern/` (n30) – weitere Bausteine zum Kopieren
Ausführlich in `src/gfx/kern/LIESMICH.md`, Messung und Lehren in `TECHNIK_BERICHT.md`. Je Baustein: so kopierst du das in
Bandenkick oder Schmetterlingswiese.
- **Qualitäts-Autopilot** (`kern/autopilot.js` + `kern/startprobe.js`): beide Dateien kopieren, die eigene Automatik
  (`autoQuality()` bzw. `Renderer.sample()`) durch `new GrafikAutopilot({ skala })` + `register(name, kosten, setzer)`
  ersetzen, je Bild `ap.bild(dt, cpuMs, gpu.ms)`. Für den Kino-Look: `skala.setzen = (s) => kino.renderScale = s`.
- **Mess-Gate** (`tests/perf_gate.py`): unverändert kopieren, nur `perf_szenen.json` (Szenen als URL + Schritte) neu
  schreiben; Vergleich alt/neu mit `--ab vorher=../alt:: --ab nachher=`. Auf dem Mac startet es den Browser per `open`.
- **Asset-Skripte** (`tools/hdr_diaet.mjs`, `tools/build_assets.mjs --car-mid`): HDR auf 512×256 (−75 %), Modell-LOD mit
  `simplifyWithAttributes`; Quell- und Zielpfade oben im Skript anpassen, Lizenzzeile in `assets/LICENSES.md` mitnehmen.
- **Impostor-Bäcker** (`kern/oktaeder.js`, `kern/impostor.js`, `tools/build_impostor.{mjs,html,py}`): eigene Modelle in
  `tools/impostor_modelle.mjs`, backen mit `python3 tools/build_impostor.py`, laden mit `ImpostorBibliothek`,
  zeichnen mit `impostorMesh()` – ein Draw-Call je Art.
- **Lack-Spiegelung** (`kern/reflex.js`): `attach()` nur für Klarlack-Materialien, Spiegel-Objekte auf eigene Ebene,
  `update()` je Bild vor dem Zeichnen. Kostet je Bild eine Würfelseite (≈ 10–17 Draw-Calls) – vorher messen.

## TAAU in ein anderes Spiel (n31, Stufe `taa`)
Temporales Hochskalieren mit Kantenglättung („DLSS-Ersatz“) auf WebGL2, eigener Code. Szene mit Halton-Versatz in
Renderskala 0,6–0,7, **ohne MSAA**; **ein** Resolve-Durchgang in Bildschirmauflösung sammelt die Abtastungen über die Zeit
in einer History (HalfFloat, Ping-Pong); danach nur CAS-Nachschärfen. Dateien: `src/gfx/kern/taau.js` (three.js, Shader,
Klasse `TAAU`) + `src/gfx/kern/taau_mathe.js` (reine Mathematik, CPU-Vorlage des Shaders, Node-Test `tests/node/test_taau.mjs`).
Status: Stuntbahn n31 – Standard **aus** (`?taa=1` an), Abnahme im Browser siehe `TAAU_BERICHT.md`.

**Mit Kino-Look** (Bandenkick, Schmetterlingswiese, sobald dort `kinolook.js` läuft): `kinolook.js` + beide Kern-Dateien
kopieren, dann
```js
const kino = new KinoLook(renderer, { level: 2, stages: '+taa', taa: { gewicht: 0.9, muster: 'auto' } });
kino.setCarBox(box);                                   // Box des Spielerobjekts in dessen Koordinaten (wie für die Unschärfe)
kino.render(scene, camera, { car: spieler, ghost: durchsichtigesObjekt, cut, dt, sunDir });
```
Der Kino-Look schaltet mit `taa` selbst MSAA ab, nimmt den Renderskalen-Bereich `PRESETS[n].taaScale` und liest im Endbild
die History. Rückfall auf die FXAA-Art: `kino.taaRueckfall = true` (z. B. als Autopilot-Stufe
`ap.register('taa', 0.05, (s) => { kino.taaRueckfall = s === 0; })`) oder Renderskala < 0,6. Ohne HalfFloat-Ziel bleibt
automatisch der bisherige Weg (MSAA).

**Ohne Kino-Look** (eigene Post-Kette): `TAAU` direkt, siehe Kopf von `kern/taau.js`:
`jitterAn(camera, sw, sh, skala)` → Szene in ein Ziel mit Farbe + `DepthTexture` (ohne MSAA) → `jitterAus(camera)` →
`resolve(renderer, { farbe, tiefe, sw, sh, w, h, camera, schnitt })` liefert die Textur in w × h.

| Was das Spiel liefert | Wozu |
|---|---|
| Farbe in Anzeige-Werten (8 bit reicht) + Tiefe als Textur, perspektivisch (kein logarithmischer Tiefenpuffer) | Rekonstruktion, Reprojektion über Tiefe |
| Kamera unverändert zwischen `jitterAn` und `jitterAus` (kein `updateProjectionMatrix` dazwischen) | Versatz nur für diesen Durchlauf |
| `cut`/`schnitt` bei Kameraschnitt/Teleport (große Sprünge erkennt der Kino-Look selbst) | History neu ansetzen |
| bewegte Objekte mit Tiefe: `koerper(i, obj, box, 'fest')` (Spielerauto, Ball, Figur) | eigene Reprojektion → kein Ghosting |
| durchsichtige bewegte Objekte: `koerper(i, obj, box, 'durchsichtig')` (Geist) | History dort schwächer (reaktiv) |
| Overlays (Cockpit, 3D-HUD) erst NACH dem Endbild | bleiben scharf, ohne Versatz |

**Uniforms des Resolves** (`taau.u`): `uGewicht` (History-Anteil, 0,9), `uGamma` (Varianz-Clip, 1,25), `uDis`
(Disocclusion, relative Tiefe 0,06), `uSigRek`/`uSigTreffer` (Kerne in Render- bzw. Zielpixeln), `uAlphaMin`, Körper
`uKInv/uKDelta/uKMin/uKMax/uKArt[2]`. Für andere Durchgänge, die die verschobene Tiefe lesen (Dunst, Tiefenschärfe):
`taau.uJit` (uv) addieren, sonst flimmern sie an Kanten. **URL-Regler** für A/B: `?taa=0|1`, `?taaw=`, `?jit=auto|8|16|32|0`,
`?taagamma=`, `?taadis=`, `?taaskala=` (Start-Renderskala, z. B. 0.65).

**Grenzen:** Partikel, Rauch, Feuerwerk und Shader-animierte Karten haben keine Bewegungsdaten – nur der Nachbarschafts-Clip
schützt (Randsaum 2–3 px im ersten Bild). Brauchen sie mehr, als eigene Körper anmelden oder nach dem Resolve zeichnen.
