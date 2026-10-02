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
