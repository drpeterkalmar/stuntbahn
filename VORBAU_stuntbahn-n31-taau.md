# Vorbau (Leicht-Spur) für `stuntbahn-n31-taau` – TAAU als „DLSS-Ersatz“

Branch `vorbau/stuntbahn-n31-taau` (von `origin/main` a825539), 4 Commits, gepusht. **main ist unberührt.**
Nichts davon lief im Browser: kein Shader wurde je von einer GPU übersetzt, kein Bild angesehen, nichts gemessen.
Alles Neue liegt hinter `?taa=1`, **Standard AUS** – ohne den Regler verhält sich das Spiel wie bisher (Node-Test belegt:
Kino weiter mit MSAA 4, Renderskala 1/0,7/1, TAAU-Objekt wird gar nicht angelegt).

## Überblick: was wo liegt

| Datei | Inhalt |
|---|---|
| `src/gfx/kern/taau_mathe.js` (neu) | reine Mathematik, ohne three.js: Halton-Jitter, Projektions-Jitter, Reprojektion (auch bewegte Körper), YCoCg, Varianz-Clip, Disocclusion, Mischanteil, Einsatz-Entscheidung `taaModus`, **CPU-Referenz des Resolves** (`taauReferenz`) |
| `src/gfx/kern/taau.js` (neu) | Klasse `TAAU`: `jitterAn/jitterAus` (Projektion nur im Szenen-Durchlauf verschoben), `koerper()`, `resolve()` mit dem Resolve-Shader, History HalfFloat Ping-Pong |
| `src/gfx/kinolook.js` | Stufe `taa`, Presets `taaScale`/`taaSharpen`, `taaModus()`, MSAA 0 mit TAA, Resolve nach dem Szenen-Durchlauf, Endbild liest History (`#define TAA`), Dunst/Masken/DoF lesen die unverschobene Tiefe (`uJitUv`) |
| `src/main.js` | URL-Regler, Geist als Körper, Autopilot-Stufe `taa` |
| `tests/node/test_taau.mjs` (neu) | Mathe + CPU-Simulation (siehe unten) |
| `tests/node/test_taau_kino.mjs` (neu) | Anschluss im Kino-Look mit echtem three.js aus `lib/` und Renderer-Attrappe, Shader-Quelltextprüfung |
| `tests/node/three_haken.mjs` (neu) | Lade-Haken: `import 'three'` → `lib/three.module.min.js` in Node |
| `tests/taau_shots.py` (neu) | Abnahme-Bilder für den Heavy-Job (Standbilder, Schwenk, Fahrt, Cockpit) – **nicht ausgeführt** |
| `KINOLOOK.md`, `src/gfx/kern/LIESMICH.md` | Abschnitt „TAAU in ein anderes Spiel“ (Schnittstelle, Uniforms, Masken, was das Spiel liefern muss) |
| `tests/node/run_all.mjs` | beide neuen Tests eingetragen |

**URL-Regler:** `?taa=0|1` (Standard aus), `?taaw=` History-Gewicht (Start 0,9), `?jit=auto|8|16|32|0` Jitter-Muster
(auto: 8 bei Skala ≥ 1, 16 bei ≥ 0,7, sonst 32; 0 = kein Versatz zum Vergleich), `?taagamma=` Clip-Breite (1,25),
`?taadis=` Disocclusion-Schwelle (0,06), `?taaskala=` Start-Renderskala (0,6–1; mit fester Stufe `?q=` bleibt sie stehen).
`?kl=+taa`/`-taa` geht auch (spätere Angabe gewinnt).

---

## Etappe 1 – Jitter + Reprojektion

**Fertig.**
- Halton(2,3)-Folge, zentriert, Länge nach Renderskala (Faustregel ≈ 8/s²) bzw. `?jit=`. Versatz in **Render-Pixeln** → in
  Bildschirm-Pixeln wächst er mit 1/Renderskala („skaliert mit der Renderskala“, so werden alle Zielpixel getroffen).
- Versatz auf die Projektionsmatrix (Zeile 0/1 += δ·Zeile 3 – gilt für Perspektive, Ortho und `setViewOffset` im Cockpit),
  **nur** um `renderer.render(scene, camera)` herum; danach exakt zurück (Sonne/Flare/Hitzeflimmern/Cockpit sehen keinen
  Versatz). `projectionMatrixInverse` wird mitgeführt und zurückgesetzt.
- Reprojektion im Resolve: vorderste der 9 Abtastungen (Tiefe min, „Velocity-Dilation“) → Welt über die **unverschobene**
  inverse View-Projection → vorige View-Projection → History-uv. Statische Welt über Tiefe.
- **Bewegte Objekte:** Auto = Körper „fest“: Pixel, deren Weltpunkt in der Auto-Box liegt, werden mit
  `vorige Welt · aktuelle Inverse` des Autos reprojiziert (eigene Bewegung aus der Matrix des Vorbilds, kein MRT nötig).
  Geist (durchsichtig, ohne Tiefe) = Körper „durchsichtig“: Strahltest Kamera→Weltpunkt gegen seine Box; dort mindestens
  50 % neues Bild (reaktiv). Im Cockpit ist das Welt-Auto ausgeblendet → kein Körper; Innenraum und Spiegel sind Overlay
  NACH dem Endbild → von TAA unberührt (keine eigene Maske nötig).

**Geprüft (Node):** Halton-Werte; Folgen 8/16/32 im Intervall, Mittel ≈ 0, x vollständig geschichtet; Projektions-Jitter
verschiebt Punkte in jeder Tiefe um exakt j Pixel (Perspektive, mit Objektiv-Versatz, Ortho; Fehler ~1e-15), Tiefe
unverändert; Reprojektion bei Kamerafahrt + Drehung (Fehler ~1e-16); Körper-Reprojektion trifft die vorige Lage eines
Autopunkts. Im Kino-Look (Attrappe): Szene mit genau Folge[0]/Folge[1] gezeichnet, Projektion danach bitgleich wie vorher,
Auto fährt 1,5 m → Körper-Matrix verschiebt um 1,5 m zurück, unsichtbarer Geist → kein Körper.

**Heavy-Job im Browser:** Shader übersetzt fehlerfrei (Konsole, `__game.kino.describe().taa.modus === 'taa'`); kein Wackeln
des ganzen Bilds (Jitter muss im Endbild verschwinden – sonst Vorzeichenfehler, Test: `?jit=8&taaw=0` zeigt Wackeln, mit
`taaw=0.9` muss es ruhig sein); Ghosting am Auto (K.-o.) in Verfolger-, Stoßstangen-, Fern-Kamera und im Replay.

**Risiken / Annahmen:** Box-Unterkante 3 cm über `box.min.y` (Reifen unten gehören zum Auto, Fahrbahn darunter nicht) –
TODO am Bild (`kinolook.js` `setCarBox`). Kontaktschatten und Auto-Schatten auf der Fahrbahn wandern mit dem Auto, die
Fahrbahn wird aber statisch reprojiziert → leichter Schatten-Nachzieher möglich (Clip fängt das meiste). Nitro-Flammen
(additiv, ohne Tiefe) liegen hinter der Box → nur Clip.

## Etappe 2 – Clamp / Rejection

**Fertig.**
- Nachbarschafts-**Varianz-Clip** in YCoCg (Momente der 3×3-Render-Nachbarschaft, Gamma 1,25, geschnitten mit Min/Max),
  History wird Richtung Boxmitte **geclippt** (nicht komponentenweise geklemmt).
- **Disocclusion über Tiefe:** History-Alpha speichert die lineare Tiefe des Vorbilds, **Vorzeichen = Körper-Maske**
  (negativ = Auto). Abgelehnt, wenn die erwartete Tiefe (clip.w der Reprojektion) um mehr als 6 % abweicht (weich bis 12 %)
  oder Welt↔Körper wechselt (Auto fährt weg → dahinter ist Neues). Beste Übereinstimmung unter den 4 History-Texeln
  (Zäune/Kanten). Außerhalb des Bilds, hinter der Kamera, Schnitt → abgelehnt.
- Mischung: Anteil neues Bild = max(0,01; (1 − 0,9) · Treffer, Ablehnung, reaktiv); Luma-Gewichtung (Karis).
- Schnitt: `o.cut` (Replay-Schnitte, Teleport, Reset kommen über `blurCut` schon an), Kamerasprung (wie bei der Unschärfe:
  > max(6 m, Tempo·0,25 + 3) oder > 0,5 rad), Wechsel aus→an, Größenwechsel.

**Geprüft (Node):** Clip/Box/Disocclusion-Tabellen; Simulation „helles Objekt ohne Maske bewegt sich 6 px/Bild“: im Inneren
der alten Stelle **0,000** Rest ab dem ersten Bild, Randsaum direkt an der neuen Kante nur im ersten Bild (bekannte 2–3-px-
Grenze jeder TAA); Simulation „Kamerafahrt mit Parallaxe vor einem Pfeiler“: freigelegte Wand übernimmt nicht die
Pfeilerfarbe (Rest ≤ 0,22 am Rand); Kino-Look: Schnitt und 40-m-Sprung verwerfen die History, Renderskalen-Wechsel nicht.

**Heavy-Job im Browser:** Zäune, Leitplanken, Gras, Bäume (Impostors) bei Bewegung (`taau_shots.py schwenk,fahrt`):
flimmern sie nicht mehr, ohne zu schmieren? Partikel (Rauch, Funken, Staub), Zuschauer-Karten (springen im Shader),
Feuerwerk der Zielshow, Fahnen, Windrad-Rotoren: Schlieren? Replay-Schnitte: kein Überblenden alter Bilder.

**Risiken:** `uDis` 0,06 und `uGamma` 1,25 nur an der CPU-Simulation gewählt → am Bild nachstimmen (`?taadis=`,
`?taagamma=`). Dünne Geometrie (Zaunlatten < 1 Render-Pixel) kann bei 0,6–0,65 trotz bester-von-4 als Disocclusion gelten
→ dann flimmert sie wieder; Gegenmittel: `taadis` hoch. Durchsichtiges/Additives ohne Tiefe hat keine Bewegungsdaten
(kein Velocity-MRT gebaut – würde Patchen aller Materialien bedeuten).

## Etappe 3 – Hochskalieren (TAAU, nicht nur TAA)

**Fertig.**
- History in **Bildschirmauflösung** (HalfFloat RGBA, 2 Ziele Ping-Pong, LinearFilter), Szene in Renderskala.
- Je Zielpixel: die 3×3 Render-Abtastungen um die Zielmitte, jeweils an ihrer **echten (unverschobenen) Lage** k + ½ − j.
  Zwei Kerne: **eng** in Zielpixeln (σ 0,35) für den Beitrag zur History (eine Abtastung genau im Zielpixel zählt voll) und
  **weit** in Render-Pixeln (σ 0,55) als Ersatz, wo die History verworfen ist. History bikubisch (Catmull-Rom, 5 Abtastungen).
- **Ein** zusätzlicher Vollbild-Durchgang (Resolve). Das Endbild liest die History statt der Renderskala, macht nur noch
  CAS-Nachschärfen (keine FXAA-Art). MSAA 0. Renderskala Kino 0,7 (Min 0,6, Max 1), Standard 0,7 (0,6 … 0,85).
  Renderskalen-Wechsel des Autopiloten verwerfen die History nicht (Zielgröße bleibt).

**Geprüft (Node) – CPU-Simulation** (Zaun aus dünnen schrägen Latten + schräge Kante, 96×64, Bezug = 8×8-Supersampling):

| Weg | Fehler gegen Bezug |
|---|---|
| 0,65 bilinear hochskaliert (heute ohne TAA) | 0,049 |
| 1,0 ohne Kantenglättung | 0,034 |
| **1,0 + MSAA 4 (Kino heute)** | **0,016** |
| **0,65 + TAAU** (48 Bilder) | **0,023** |

Änderung je Bild eingeschwungen 0,0019 gegen 0,043 beim reinen Jitter ohne History (¼-Grenze im Test). Wichtigste Lehre aus
dem Raster: die History darf **nicht** die weite Rekonstruktion mitteln (erster Entwurf: 0,050 – ruhig, aber unscharf),
sondern nur die Abtastungen nahe der Zielpixelmitte. Kino-Look-Attrappe: Szene 700×350, Resolve 1000×500 HalfFloat, genau
**ein** zusätzlicher Vollbild-Durchgang, Endbild mit `TAA`, ohne `AA`, mit `SHARP`.

**Heavy-Job im Browser:** `taau_shots.py stand` (Looping, Fahrbahnrand, Gras, Zaun; 1,0 + MSAA 4 gegen 0,65 ohne TAA gegen
0,65 + TAAU gegen 0,7 + TAAU, mit 2×-Ausschnitt) – **selbst ansehen**; Schärfe nachstimmen (`PRESETS[n].taaSharpen`,
Start Kino 0,4, Standard 0,5); `taaScale` (Start 0,7) und `?taaw=` 0,9–0,95 entscheiden.

**Risiken:** Kosten des Resolves am Handy: 9 Farb- + 9 Tiefen-`texelFetch`, 5 bilineare History-Abtastungen, 4 Tiefen-
`texelFetch` je Bildschirmpixel. Wenn zu teuer: Tiefe nur über das Kreuz (5) für die Dilation, Disocclusion mit 1 statt 4
Texeln. Speicher: 2 × Bildschirm × 8 Byte (Pixel 7 Kino quer ≈ 1830×824 → 2 × 12 MB). Bloom/AO/halbe Unschärfe lesen
weiter die verschobene Renderskala (niedrige Frequenz, vermutlich unsichtbar) – prüfen, ob Bloom an Lichtpunkten mitzittert.
Eingang ist 8-bit Anzeige-Raum (wie bisher) → TAA im Anzeige-Raum, das dämpft Glanzlicht-Flackern eher.

## Etappe 4 – Autopilot

**Fertig.** `main.js` meldet bei `?taa=1` (und vorhandener Technik) die Stufe `taa` (Kosten 0,05) nach Deko/Lack-Spiegelung
an: Renderskala sinkt zuerst bis 0,6 (TAAU-Minimum), dann Deko, dann **Rückfall auf die FXAA-Art** (`kino.taaRueckfall`,
MSAA bleibt 0), dann Auto-Schatten, dann Stufe. Rauf in umgekehrter Reihenfolge (History beginnt dann neu). Renderskala
< 0,6 → ebenfalls FXAA-Art. **Ohne HalfFloat-Ziel** (kein `EXT_color_buffer_float`/`_half_float`) bleibt der bisherige Weg
(Kino mit MSAA 4) – FXAA wäre dort schlechter. Feste Nutzerwahl setzt den Rückfall zurück (wie alle Autopilot-Dinge).
`quality.scaleRangeOf()` liefert mit TAA den TAAU-Bereich; Start-Kurzmessung und gespeicherte Geräte-Skala arbeiten
darin. `?taaskala=` setzt den Start für feste A/B-Vergleiche.

**Geprüft (Node):** Quality + echter Autopilot unter Dauerlast: `skala → deko → taa`, Rückfall bei Renderskala 0,6, Kino-Look
meldet danach `fxaa`; Bereich Kino 0,6/1/0,7, Standard 0,6/0,85/0,7; Einfach zeichnet direkt ohne TAA; `?taa=1&kl=-taa` aus.

**Heavy-Job im Browser:** `tests/test_autopilot.py` mit `&taa=1` (künstliche Last `app.testLast`): kommt der Rückfall, kommt
TAA bei Luft zurück, kein Pendeln. Kosten-Schätzung 0,05 mit `perf_gate` ersetzen.

---

## Reihenfolge für den Heavy-Job
1. **Vorher-Messung auf main** (vor dem Merge): `python3 tests/perf_gate.py --stand vorher` (Szenen `tests/perf_szenen.json`).
2. Branch nach main holen (Merge, Vorbau-Branch danach löschen), `npm run test:node` (neu: `test_taau`, `test_taau_kino`).
3. Erster Browser-Blick: `?taa=1&q=2` – Konsole frei? `__game.kino.describe().taa` (modus `taa`, `technik: true`,
   `groesse` = Bildschirm). Falls Shader-Fehler: Quelltext in `kern/taau.js` `RESOLVE_FS`; die CPU-Fassung `taauReferenz`
   ist die Vorlage (gleiche Schritte, gleiche Namen).
4. Bilder: `python3 tests/taau_shots.py stand,schwenk,fahrt,cockpit quer,hoch` → `tests/shots/taau/`. Kamera-Stellen in
   `STELLEN` ggf. anpassen (TODO im Skript). Kino-Replay mit Tiefenschärfe ist im Skript nur als TODO beschrieben.
5. Messen: `python3 tests/perf_gate.py --ab kino_heute=&taa=0 --ab taau=&taa=1 --ab taau065=&taa=1&taaskala=0.65`
   (Wechsel-Modus, Median je Variante); Budget p95 Kino ≤ heute, Standard ≤ +5 %.
6. Abstimmen (`taaw`, `taagamma`, `taadis`, `taaSharpen`, `taaScale`), dann entscheiden, ob `stages.taa` in den Presets
   Standard/Kino auf `true` geht. Ghosting am Auto nicht wegzubekommen → laut Brief `?taa=0` als Standard lassen und erklären.
7. Version +1, `python3 tools/update_sw.py` (nimmt `kern/taau*.js` automatisch in den Service-Worker), Commit, Push, Live-Check,
   `TAAU_BERICHT.md`.

## Nicht angefangen (und warum)
- Alles mit Browser: Shader-Übersetzung, Bilder, Bewegtbild-Urteil, Messung, Live-Check (Leicht-Spur).
- Versionsnummer, Cache-Busting, Service-Worker-Version, `TAAU_BERICHT.md` (Heavy-Job laut Auftrag).
- Velocity-MRT für Partikel/Karten: bräuchte einen zweiten Ausgang in allen Materialien (onBeforeCompile überall) – erst
  bauen, wenn die Bilder zeigen, dass der Clip nicht reicht. Alternative ohne MRT: solche Dinge nach dem Resolve zeichnen.
- Eigene Behandlung der Nitro-Flammen (additiv, ohne Tiefe): erst am Bild entscheiden (z. B. als dritter Körper „durchsichtig“
  mit verlängerter Box nach hinten, nur bei Nitro).
- Standard-Einschaltung in den Presets: erst nach Abnahme.
