# Vorbau n40 – Tier-Zuschauer und Zieljubel-Stunt (Leicht-Spur, rog17, 23.10.2026)

**Basis: main @ 14863df** (0.12.2 „Looping-Kamera höher“). Branch `vorbau/stuntbahn-n40-tiere-kamera-zieljubel` (Remote `mac`).
Kein Browser, kein Server, kein Bundler, keine GPU benutzt – alles unten ist nur mit Node geprüft. Versionsnummer, sw.js,
Cache-Busting, Bericht `N40_BERICHT.md` und alle Browser-Abnahmen macht der Heavy-Job.

## Kurz
- **Etappe 1 (Kamera im Looping):** entfällt laut Nachtrag (Hermes hat 0.12.2 live gebracht). `src/gfx/camera.js` nicht angefasst.
- **Etappe 2 (Tiere, 0.13.0): fertig vorgebaut.** Bärchen, Häschen, Fuchs, Pinguin, Kätzchen, Kuh als prozedurale
  Cartoon-Figuren (großer Kopf, große Augen mit Glanzpunkt, rosa Bäckchen, Ärmchen, kurze Beinchen), gleiche Haltungen
  und Jubel wie die Menschen, 1 Draw-Call wie bisher. Karten-Atlas (ferne Gruppen, Tribünen) mit gezeichneten Tieren,
  Tier-Ohren an den Fan-Cam-Silhouetten. Option **„Zuschauer: Tiere/Menschen“** (Standard Tiere), `?zuschauer=mensch`.
- **Etappe 3 (Zieljubel, 0.14.0): fertig vorgebaut.** Nach der Linie: bremsen → Nitro 0,5 s mit Flammen → Sprung →
  **Schraube, Frontflip oder Backflip** (Zufall aus Strecke + Zielzeit) → Landung exakt in Fahrtlage (nie Crash) → ausrollen.
  Rennzeit, Bestzeit, Geist bis zur Linie **bitgleich** (Node gemessen). Nur mit Platz hinter dem Ziel, sonst Dreher/Ausrollen
  wie bisher. Option **„Zieljubel: Stunt/Dreher/Aus“** (Standard Stunt), `?zieljubel=`, Test-Regler `?zstunt=schraube|front|back`.
  Replay und Highlight-Film zeigen den Stunt (Aufzeichnung), Film-Titel „🏁 Ziel · Backflip“.
- Neue Node-Tests: `tests/node/test_tiere.mjs`, `tests/node/test_zielstunt.mjs` – beide **alle OK**. Fotoskript
  `tests/n40_shots.py` (tiere | stunt) geschrieben, **nicht ausgeführt**.

## Etappe 2 – Tier-Zuschauer

### Fertig (Dateien)
| Datei | Was |
|---|---|
| `src/gfx/tierform.js` (neu, rein rechnend) | Arten `TIERE`, Farben `TIER_FARBEN` (sRGB, eine Quelle für Figur und Atlas), Figur `tierForm(grob)` als Zahlenlisten (Teile/Klassen/Masken), Mischung `tierMischung` (Seed, Nachbarn verschieden), Atlas-Plan, `zuschauerModus(search, settings)`, Zustand `ZUSCHAUER.tiere` |
| `src/gfx/tiere.js` (neu) | `tierGeometry(grob)`, `tierMaterial()` (Haltungs-Shader der Menschen mit Tier-Gelenken + Maske je Art + Farbtabellen + Glanzpunkt-Leuchten), `tierAtlas()`/`drawTier()` (Canvas, gleiches Raster wie der Menschen-Atlas) |
| `src/gfx/kulisse2.js` | Haltungs-Shader als Generator `fanPoseGlsl(J)` (Menschen: Text **Zeichen für Zeichen gleich**, geprüft), Auswahl Tiere/Menschen beim Bauen, `iA.y = Art·16 + Farbe`, grobe Figur auf Grafik Standard |
| `src/gfx/deco.js` | Karten-Material mit Tier-Atlas, wenn `ZUSCHAUER.tiere` (eigener Cache-Schlüssel `crowd2t`) |
| `src/ui/n40optionen.js` (neu) | Optionen-HTML, `fanOhren()` (Hase/Bär/Fuchs-Ohren an der Fan-Cam-Kopfsilhouette) |

Regler/Default: Option „Zuschauer“ **Standard Tiere** (`store.js`), `?zuschauer=mensch|tiere` hat Vorrang. Ohne main.js (alle
alten Node-Tests) bleibt `ZUSCHAUER.tiere = false` → Menschen wie bis n39. Umschalten im Menü baut die Welt neu (wie
„Landschaft“), im Rennen nur gemerkt (gilt beim nächsten Bau).

### Technik
- Alle 6 Arten stecken in **einer** Figur; jede Ecke trägt eine Maske (Bits der Arten). Ecken anderer Arten fallen im
  Vertex-Shader in den Rumpf zusammen (Dreiecke ohne Fläche). Dadurch bleibt es **1 Draw-Call + Blob-Schatten**, die
  n32-Vorauswahl (`kulisse2Tick`) und alle Instanz-Daten bleiben gleich.
- **Budget (ehrlich):** Figur 638 Ecken / 872 Dreiecke (sichtbar je Art 404–504), Menschen 260 / ~120. Auf **Grafik
  Standard** die grobe Figur: 538 Ecken, Bärchen 382 Dreiecke (Kopf und Augen bleiben fein). Gezählte Dreiecke über *alle*
  Instanzen (ohne Vorauswahl) z. B. 4711-3-3d Kino 452 k statt 74 k – gezeichnet werden nur die nahen (≤ 83 m).
  → **Bildrate muss der Heavy-Job messen** (perf_kulissen/perf_gate, Handy-Profil). Hebel, falls zu teuer: `tierGeometry(true)`
  auch auf Kino, Ausblend-Entfernung `FAN_FADE` für Tiere kürzer, weniger Unterteilung in `tierForm` (Zahlen `seg/rings`).
- Gelenke `TIER_J` (Schulter 0,68 m, Hüfte 0,24 m, Sitzen −0,15 m, Hüpfen 0,2 m). Fahne hängt im Ruhezustand nach unten an
  der rechten Pfote – sie gibt es nur in Haltung 3 (Arm ~125–165° hoch), dann steht sie über dem Kopf (Test).
- Kamerablitz beim Jubel: rechte Pfote (Klasse `pfote`). Glanzpunkt in den Augen leuchtet leicht (Emissive 0,8).

### Geprüft (Node)
- `node tests/node/test_tiere.mjs` → **alle OK**: Maße (1,26–1,66 m, Fuß auf 0, Kopf breiter als Bauch), keine verdrehten
  Dreiecke, Normalen, jede Art mit eigenen Teilen, Augen/Bäckchen/Pfoten, Fahne über dem Kopf; Mischung auf 4 Strecken
  (1147 Zuschauer): die zwei nächsten Nachbarn (≤ 1,25 m) nie dieselbe Art, alle 6 Arten, deterministisch; Atlas-Plan
  (Nachbarn verschieden), Atlas zeichnet (Canvas-Attrappe); Shader-Einbau (Anker r186, Haltung mit Tier-Gelenken, Maske,
  6 Farbtabellen, Klammern, nur Gleitkomma-Zahlen, eigener Programm-Schlüssel); Bauen in echten Kulissen: **7 Draw-Calls
  wie Menschen**, Art in `iA.y`; Menschen-Shader unverändert.
- `test_kulissen2_gfx.mjs` 887/887 (vorher = nachher), `test_deco.mjs` ok.

### Muss der Heavy-Job im Browser abnehmen
1. **Shader kompiliert** (pageerror 0) – Tier-Material wurde nie auf einer GPU übersetzt. Erst `?zuschauer=tiere&q=2`
   (Kino, feine Figur) und `q=1` (Standard, grobe Figur), Desktop + Pixel 7 quer.
2. Vision-Gate mit `python3 tests/n40_shots.py tiere quer 4711-2-g` (Collage `tests/shots/n40/tiere_quer.jpg`: Tiere ruhig/
   jubelnd/sitzend nah, Tribüne 22 m/60 m, Karten 90 m; zum Vergleich Menschen) → „niedlich und als Tiere erkennbar?“
   Das Skript ist ungetestet (Kamera-Code aus `kulissen2_shots.py` übernommen).
3. Fan-Cam im Highlight-Film: `tests/fancam_shots.py` mit Tieren (Ohren an den Köpfen sichtbar?).
4. Bildrate/Draw-Calls gegen vorher (s. Budget).
5. Übergang 3D-Figur → Karte (58–74 m): passen Größe/Farben? Atlas-Tiere sind 1,3× größer gezeichnet als die Menschen
   (Startwert, `drawTier` `p.s * 1.3`).

### Annahmen/Risiken, TODO am Bild
- Farben `TIER_FARBEN`, Glanz-Stärke, Schattierung (`0.8 + 0.2·Höhe`), Kuh-Flecken, Bäckchen-Lage: Startwerte → TODO n40-Heavy.
- Augen sitzen 3–4 cm vor der Kopf-Fläche (Scheiben für Pupillen/Glanz); aus der Nähe evtl. sichtbare Kante.
- Pinguin hat weiße Gesichtsmaske + orange Schnabel/Füße, keine Ohren – erkennbar? Fuchs-Schwanz/Katzen-Schwanz hinten.
- Sitzen: Tiere sinken nur 0,15 m (Menschen 0,8 m) – auf Tribünen-Stufen evtl. zu hoch/zu tief.
- Nicht gemacht: eigene Fan-Cam-Pfoten (die runde „Hand“ der Silhouette passt schon als Pfote); Lizenz-/Credits-Text
  in ui.js („Tier-Zuschauer: eigene Arbeit, im Spiel erzeugt“) – bitte im Heavy-Job ergänzen (Absatz „Wetter, Tageszeit,
  Zuschauer“ ~Zeile 788).

## Etappe 3 – Zieljubel-Stunt

### Fertig (Dateien)
| Datei | Was |
|---|---|
| `src/game/zielstunt.js` (neu, rein rechnend) | `ZSTUNT` (Konstanten), `stuntZeit(v0)` (Ablauf), `stuntRaum(track, idx, v0, o)` / `flugFrei` (Platz), `stuntArt(seed)`, `stuntStart`/`stuntFlug` (gerechnete Flugbahn + Drehung), `stuntFreiheit` (Bodenfreiheit), `?zstunt=` |
| `src/game/race.js` | Option `zieljubel` (ohne Angabe **'dreher' = Verhalten bis n39**), `planStunt()` in `finish()`, Phasen im `runout`: brake → nitro → air (gerechnet, keine Physik) → roll; `recEnd()`; Nitro-Ereignis `xev {k:'nitro', z:1}` (Replay-Flammen); Ereignisse `zstunt` (nitro/jump/land); im Flug zeichnet `record()` das Bahntempo auf (sonst dreht der Tacho mit) |
| `src/game/highlights.js` | Zieleinlauf mit Stunt bis Landung + 2,6 s, Tele bis 0,35 s nach der Landung, dann Zielbogen; Titel „🏁 Ziel · Schraube/Frontflip/Backflip“ (`marks.zstunt`) |
| `src/audio/sound.js` | Töne: Nitro zünden, Hüpfer beim Absprung, Landung |
| `src/ui/n40optionen.js` | Option „Zieljubel“, `zieljubelArt(search, S)` |
| `tools/kinoreplay_probe.mjs` | `runRace` reicht `zieljubel` durch, Auslaufen bis `race.recEnd()` (ohne Stunt = ZIEL.rec wie bisher) |

### Ablauf (Startwerte, `ZSTUNT`)
Linie → **bremsen** auf 22 m/s (79 km/h) mit 9–20 m/s² in ≤ 3 s → **Nitro** 0,5 s (`car.boost = 1`, Vollgas, Flammen bis
0,35 s in die Luft) → **Absprung** (Tempo 15–28 m/s) → **Flug 1,5 s** (Scheitel ~2,8 m), Drehung 360° zwischen 10 % und 86 %
der Flugzeit (weich, höchstens ~10,3 rad/s), Lage gleitet von der Absprung- zur Landelage → **Landung** per `Car.place` am
Linienpunkt mit gleichem Seitenversatz, alle Räder am Boden, 1,2 m/s Einfedern → **ausrollen** (≤ 7 m/s²), vor einem Stunt
weiter hinten anhalten (Platz dafür ist geprüft). Zielschnitt auf den Zielbogen 0,45 s nach der Landung, Zielshow-Ende +1,5 s
Schwenk +1,1 s → Zielshow bis **8,1 s** (bisher 4,6 s), Aufzeichnung bis 8,5 s (bisher 5,0 s). Bis 295 km/h Zieltempo.
**Platz:** ab 15 m vor dem Absprung bis Landung + Anhalteweg (28²/16 + 25 + 5 m): keine Schanze/Looping/Röhre/Luftstrecke/
Hindernis, Querneigung |by| ≤ 0,12, Fahrbahn ≥ 9 m breit; unter der Flugbahn Linie ≤ 2,5 m seitlich der Sehne (und über der
Fahrbahn), Kuppe ≤ 0,8 m, Senke ≤ 4 m; keine Decke (Welt-Strahl bis Scheitel + 2,3 + 2,5 m). Beim echten Absprung prüft
`flugFrei` noch einmal mit dem echten Tempo – sonst Abbruch (`race.zstunt.why = 'absprung:…'`), Auto rollt normal aus.

### Geprüft (Node)
- `node tests/node/test_zielstunt.mjs` → **alle OK**: Zeiten 0–295 km/h in Reihe; Figur-Mischung über 300 Zielzeiten
  (98/98/104); Bodenfreiheit im Flug ≥ 0,34 m (tiefste Karosserie-Ecke, alle Figuren, 15–28 m/s, mit Seitenversatz); Landung
  exakt in Fahrtlage; volle 360° (Mitte kopfüber); keine Sprünge in der Bahn; Platz-Prüfung an Kunst-Linien (gerade ✓, Ende,
  Kurve, Kuppe, Looping, Schanze, Hindernis, schmal, Decke, Hochstraße ✗); **echte Fahrten** (Leicht, 8 Strecken): Stunt auf
  **7 von 8** (Backflip/Schraube/Frontflip; 2-2: Looping nach ~70 m → kein Stunt), danach aufrecht (≥ 0,999), 1,8–3,3 m
  innerhalb der Kante, kein Crash, im Replay kopfüber + Nitro-Flammen, Aufzeichnung bis Zielshow-Ende; **Rennzeit, Geist und
  Aufzeichnung bis zur Linie bitgleich mit/ohne Stunt (8/8)**; zweimal gefahren → bitgleich; Highlight-Film „🏁 Ziel ·
  Backflip“, Tele bis nach der Landung, Film läuft durch; ohne Marke wie bisher; `Race` ohne Option = Dreher wie bisher.
- Spiel-Codes (gv 2, Leicht, Node-Fahrt): Stunt auf 4-2-h, 99-2-h, 13-2-gh, 2-2-3dh, 3-2-3dh, 12-2-3dh, 4711-2-gh; keiner auf
  12-2-h/5-2-gh (Steilkurve), 4711-2-h (Looping nach 72 m). Generierte Rundkurse haben oft nach ~70–110 m einen Looping –
  dort gibt es (wie beim Dreher) keinen Stunt.
- Unverändert grün: `test_zielshow.mjs` (9 Jubel-Dreher auf 21 Strecken, 1,8 m – wie n27), `test_kinoreplay.mjs`,
  `test_extras.mjs`, `test_action.mjs`, `test_reset.mjs`, `test_gkraft.mjs`, `test_wetter.mjs`, `test_zeit.mjs`.

### Muss der Heavy-Job im Browser abnehmen
1. `python3 tests/n40_shots.py stunt quer 4-2` (je Figur über `?zstunt=` eine Bildfolge von der Linie bis nach der Landung +
   Zielbogen, Film-Titel; ungetestet): sieht man Nitro-Flammen, Sprung, Drehung, saubere Landung? Kein Ruck beim Absprung
   (Lage wechselt von Physik auf Rechnung) und bei der Landung (`Car.place`)?
2. **Verfolger-Kamera im Flug:** Sie hält im Flug die Flugrichtung waagrecht und Welt-Oben, **nur wenn `ARCADE.on`**
   (camera.js Z. 212) – ohne Arcade folgt `fwd` der Nase und dreht beim Flip mit. Prüfen, ggf. für `race.zstunt.ph === 'air'`
   dieselbe Regel erzwingen. **Cockpit-Kamera** dreht beim Flip voll mit (Übelkeit?) – ggf. im Stunt auf Verfolger.
3. Zielshow-Zeiten: Schnitt auf den Zielbogen erst nach der Landung (bis ~5,4 s), Feuerwerk (geplant 0–4,6 s) läuft
   währenddessen hinter dem Auto – passt das Bild? Ggf. `ZIEL`-Feuerwerk mit dem Stunt verschieben.
4. Highlight-Film: Tele-Kamera beim Stunt (Bildausschnitt), evtl. Zeitlupe auf den Flip statt auf die Linie.
5. HUD/Ton: kein „🔥 NITRO“-Banner (Absicht, über der Zielshow); Lautstärke der Stunt-Töne neben dem Feuerwerk.
6. Online-Rennen: Stunt läuft nach der Zieltabelle-Meldung; die anderen sehen ihn über die Positionsdaten – Schein ok?
7. Bitgleich im Browser wie n27 (Rennzeit/Bestzeit/Geist mit `?zieljubel=aus` gegen `stunt`).

### Annahmen/Risiken, TODO am Bild
- Bremsen bis 2 g direkt hinter der Linie ist sichtbar „hart“ (sonst reicht der Platz selten); vJ/Flugzeit/Drehfenster/
  Kamera-Zeiten sind Startwerte (`ZSTUNT`, TODO n40-Heavy).
- Die Flugbahn ist gerechnet: Gegner-Autos und Bauten werden im Flug nicht gestoßen (Platz-Prüfung schließt Bauten aus).
- Zielshow mit Stunt dauert bis 8,1 s – „Antippen überspringt“ bleibt (Rest wird vorgerechnet, Film hat den Stunt).
- `?zieljubel=` wirkt auch online (nur Show nach der Zeitnahme).

## Änderungen an ui.js und main.js (für n41, einzeln)
**src/ui/ui.js** (5 Zeilen, nur Einfügungen):
1. Import `n40OptionenHtml, zieljubelArt, fanOhren` aus `./n40optionen.js` (nach dem n36-Import).
2. Aktion `case 'zuschauer'` → `A.setZuschauer(v)` (nach `case 'karte'`).
3. Aktion `case 'zieljubel'` → speichern, laufendes Rennen umstellen.
4. Optionen-Blatt: `${n40OptionenHtml(S, location.search)}` vor „🎬 Action-Momente im Rennen“.
5. `drawFans`: `fanOhren(g, x, y, r, fx)` nach der Kopf-Ellipse.

**src/main.js**:
1. Imports `ZUSCHAUER, zuschauerModus` (gfx/tierform.js), `zieljubelArt` (ui/n40optionen.js) nach dem zielshow-Import.
2. Nach `const store = new Store();`: `ZUSCHAUER.tiere = zuschauerModus(...)`.
3. `new Race(...)` in `startOnlineRace` und `startRace`: `zieljubel: zieljubelArt(location.search, S)`.
4. `marksOf`: `zstunt: zstuntMark(r)` + neue Funktion `zstuntMark`.
5. `startShow`: `app.show.zstunt` / `zstuntWhy`.
6. `showZeit(k)` (neu) und in `showTick` statt `ZIEL.cut`/`ZIEL.end`.
7. `endShow`: Auslaufen bis `race.recEnd()` statt `ZIEL.rec`.
8. `setZuschauer(v)` (neu, vor `setAssist`) und in `ui.bind({...})` eingetragen.

Sonst: `src/game/store.js` Standardwerte `zuschauer: 'tiere', zieljubel: 'stunt'`.

## Tabu-Dateien
Nicht angefasst: `src/gfx/kern/reflex.js`, `src/gfx/env.js`, `src/gfx/themes.js`, `src/gfx/materials.js` (nur
`patchStaticShadow` importiert), `src/gfx/carmesh.js`, `assets/hdr/`, `sw.js`, `tools/update_sw.py`, Versionsnummern.
**Hinweis für den Heavy-Job:** neue Module in Service-Worker-Liste/Build aufnehmen (`tools/update_sw.py`):
`src/gfx/tierform.js`, `src/gfx/tiere.js`, `src/game/zielstunt.js`, `src/ui/n40optionen.js`.

## Releases getrennt?
Brief: Tiere = 0.13.0, Zieljubel = 0.14.0. Die Commits sind getrennt (037d549 Stunt-Logik, 99f54e3/5e648f7 Tiere,
08d8630 Stunt-Regler), aber die Verdrahtung 7e71a91 enthält beide Optionen. Für 0.13.0 ohne Stunt reicht es, in
`store.js` den Standard `zieljubel: 'dreher'` zu setzen (Option zeigt dann „Dreher“, Verhalten wie bisher) und in 0.14.0
auf `'stunt'` zu stellen.

## Tests am rog (Windows) – vorher/nachher
- Neu: `test_tiere.mjs` alle OK (3 s), `test_zielstunt.mjs` alle OK (27 s; `--kurz` ohne Fahrten < 1 s).
- Gezielt, unverändert grün: test_zielshow, test_kinoreplay, test_kulissen2_gfx (887/887), test_deco, test_extras,
  test_action, test_reset, test_gkraft, test_wetter, test_zeit.
- **Schon vorher rot auf dem rog** (main @ 14863df gleich): `test_lohn.mjs` „wie n37 (dfabb8d): anders 1038-3-medium“
  (Referenz vom Mac). Laut rog-Hinweis außerdem bekannt rot: test_lod/test_hdr/test_detail (Windows-Pfad),
  test_stuntgroesse (Mac-Hashes), test_kulissen/test_kulissen2/test_gelaende teils. Volle Suite `npm run test:node` am rog
  nicht gelaufen (> 15 min, Absprache) – bitte am Mac.

## Nicht angefangen
- Etappe 1 (Kamera) – entfällt laut Nachtrag.
- Browser-Teile (Fotos, Vision, Bildrate, Live) – Heavy-Job.
- Feuerwerk/Zielbogen-Kamera auf den Stunt abstimmen, Zeitlupe auf den Flip im Film – erst nach Sichtprüfung sinnvoll.
