# Stuntbahn – Bewegungsunschärfe + detailliertere Umgebung (28.09.2026)

Peters Wunsch: „Die Umgebung detaillierter. Vielleicht Motion Blur fürs Speed-Feeling?“

## Was neu ist
**A) Tempogefühl** (Commit e321500)
- **Bewegungsunschärfe** als Kamera-Unschärfe aus Tiefe + voriger/aktueller Kamera (`src/gfx/post.js`), kein
  Velocity-Buffer. Einstellung: Optionen → Grafik → **Bewegungsunschärfe Aus / Leicht (Standard) / Stark**.
  - Blendet ab ~80 km/h ein, volle Stärke ab ~190 km/h; mit Nitro +60 % und leichter Zoom am Rand.
  - Auf das neue Tempo abgestimmt: Streifen gedeckelt (Leicht 2,8 %, Stark 5 % der Bildbreite), Kamera-Drehung
    zählt nur zu 45 % → Kurven bleiben lesbar, Geraden „ziehen“.
  - **Auto bleibt scharf** (Box-Test im Auto-Koordinatensystem + Vordergrund wird nicht in den Hintergrund
    gezogen). Geprüft in Fotos: kein Schmier am Auto, auch bei Nitro/Stark.
  - Aus in Menü, Pause, Replay-Standbild, bei Kameraschnitten (Reset, Kamerawechsel, Replay-Sprung).
  - Stufe 0: keine Unschärfe, nur dezente Tempo-Streifen am Rand ab ~260 km/h. Stufe 1: halbe Auflösung,
    5/7 Abtastungen. Stufe 2: volle Auflösung, 9/13 Abtastungen.
  - Nur wenn die Unschärfe wirkt, läuft das Bild über ein Render-Target; sonst wird wie bisher direkt gezeichnet.
- **Sehr dezentes Kameraschütteln** im Verfolger auf Bodenwellen (≤ 4 cm), dazu feines Zittern ab ~250 km/h.
- Tempo-Sichtfeld gab es schon (bis +20°, Nitro +8°).

**B) Umgebung** (dieser Commit) – für generierte und .TRK-Strecken automatisch (`src/track/deco.js` plant,
`src/gfx/deco.js` zeichnet):
- Boden: Randstreifen neben der Fahrbahn, **Kiesbetten** an Kurven-Außenseiten, **Reifenabrieb** auf der Ideallinie
  (Bremszonen, Scheitel), Felder mit Hecken (Getreide, Acker, Raps, Wiese) und Wald am Bergkranz in der Ferne,
  **wandernde Wolkenschatten**, Wasser mit Wellen (spiegelt den Himmel).
- Streckenrand: Reifenstapel hinter den Kiesbetten, Leitplanken mit **Bandenwerbung (erfundene Marken)**, Tribünen
  an Start/Ziel (mit Zuschauern), Zuschauergruppen + Zaun an den schärfsten Kurven, Streckenposten, Bremstafeln
  150/100/50, Flutlichtmasten.
- Landschaft: Gras/Blumen/Büsche nahe der Strecke (blenden aus, wiegen sich), 2 Laubbaum-Arten in Hainen und
  Wäldchen auf Hügeln, moosige Felsen, 8 Bauernhöfe (Haus, Scheune, Silo, Schuppen).
- Assets: Poly Haven (CC0), Pflanzen als Karten aus echten Modellen gerendert (`tools/make_impostors.py`), Felsen
  vereinfacht. Lizenzen in `assets/LICENSES.md` und im Spiel unter Credits.
- **Keine Kollision.** Abstand wird zu **jedem** Linienpunkt gemessen (auch Hochstraßen, Rampen, Loopings) → nie auf
  oder unter einer Fahrbahn, nie im Wasser, nicht auf .TRK-Szenerie-Feldern. Node-Test: **546 613 Prüfungen auf 44
  Strecken** (30 generierte, Beispiel-Rundkurs, 13 Archiv-.TRK inkl. LONG_GO2) ohne Fehler.
- Gefunden und behoben: Auf .TRK-Strecken mit Wasser erschien das Raster aus der Luft als See (Polygon-Offset des
  Geländes schob es hinter die 0,9 m tiefere Wasserebene; bestand schon vorher). Wasser hat jetzt denselben Offset.

## Automatik (damit die Bildrate am Handy hält)
Reihenfolge bei Ruckeln (nur bei Grafik „Automatisch“):
1. Unschärfe aus, sobald sie > 8 % Bildrate kostet (Bezug: Bildrate ohne Unschärfe) und unter 58 fps liegt.
2. Unter 55 fps: Gras/Blumen/Büsche und Wolkenschatten aus („Deko sparsam“, ohne Neubau).
3. Danach wie bisher Auflösung, dann Stufe.

## Messwerte
Renderzeit bis die GPU fertig ist (Median, Szene angehalten), Beispielstelle nach 4 s Fahrt. Handy-Profil = Pixel 7
quer (Stufe 0/1), Desktop 1280×720 (Stufe 2). **M1-GPU (Metal), kein echtes Handy.** Unschärfe-Werte mit
realistischer Bewegung (Kamera 1,6 m/Bild ≈ 350 km/h).

| Strecke | Stufe | Frame-Zeit vorher → nachher (Unschärfe aus) | mit Leicht / Stark | Draw-Calls | Dreiecke | Laden |
|---|---|---|---|---|---|---|
| Strecke des Tages | 0 | 3,1 → 3,6 ms | – | 41 → 56 | 119k → 152k | 1,8 → 2,2 s |
| | 1 | 5,4 → 5,8 ms | 6,9 / 6,6 ms | 56 → 75 | 181k → 260k | 1,8 → 2,0 s |
| | 2 | 5,4 → 6,2 ms | 8,4 / 9,4 ms | 54 → 73 | 180k → 295k | |
| 4711-3 | 0 | 2,8 → 3,5 ms | – | 60 → 75 | 145k → 180k | 2,3 → 2,5 s |
| | 1 | 5,0 → 5,9 ms | 6,0 / 5,5 ms | 75 → 94 | 207k → 294k | |
| | 2 | 4,4 → 5,3 ms | 6,5 / 8,5 ms | 50 → 73 | 192k → 322k | |
| Beispiel-Rundkurs (.TRK) | 0 | 2,5 → 3,1 ms | – | 42 → 52 | 160k → 186k | 2,3 → 2,3 s |
| | 1 | 3,8 → 4,4 ms | 5,2 / 5,5 ms | 47 → 77 | 205k → 298k | |
| | 2 | 3,4 → 5,7 ms | 7,2 / 7,7 ms | 73 → 92 | 227k → 349k | |
| LONG_GO2.TRK (38 km, nur lokal) | 0 / 1 / 2 | 3,6 / 5,1 / 4,7 → 3,9 / 7,0 / 8,2 ms | – | max. 89 → **max. 123** | 710k → 788k (St. 0) | Bau 0,45 → 0,76 s |

- **Draw-Calls < 200** überall (größter Wert 123, Überblick über LONG_GO2).
- **Erstladung 7,80 → 8,53 MB** (Budget 15 MB): Pflanzen-Atlas 0,33 MB, Kies 0,23 MB, Felsen 0,09 MB.
- Messschwankung auf dem Mac ±15 % (macOS-Dienste liefen parallel); Rohdaten `tests/out/perf/*.jsonl` (lokal).
- **SwiftShader (CPU-Rasterung) als grobe Handy-Näherung**, Beispiel-Rundkurs, 3 Runden abwechselnd vorher/nachher:
  Stufe 0: 94–135 → 114–118 ms; Stufe 1: 167–180 → 235–239 ms (+35 %), mit Unschärfe Leicht 336–374 ms.
  Ablation: ohne Deko und Wolkenschatten wie vorher (164 vs. 177 ms); Wolkenschatten ~+12 %, Deko ~+28 %, verteilt
  auf viele Teile (SwiftShader rechnet auch die Geometrie auf der CPU und überzeichnet Dreieckskosten). **Ehrlich:**
  Auf schwachen Handys kostet Stufe 1 jetzt spürbar mehr; dafür greift die Automatik oben (erst Unschärfe, dann Deko).

## Fotos (selbst geprüft: keine schwebenden Objekte, keine Deko auf der Fahrbahn, kein Kachelmuster, kein
Z-Fighting, kein Unschärfe-Schmier am Auto)
- Vergleichsbögen vorher | nachher, je 3 Strecken × Start/Gerade/Kurve/Landschaft:
  `tests/shots/final/optik_vergleich_quer.jpg`, `…_hoch.jpg`, `…_desktop.jpg`
- Unschärfe: `tests/shots/final/optik_blur_*.jpg` (Leicht quer/Desktop, Stark + Nitro, hochkant, Cockpit)
- Details: `tests/shots/final/optik_detail_*.jpg` (Luftbild mit Feldern/Wolkenschatten, Kiesbett + Reifen, Tribüne)
- Alle Einzelbilder: `tests/shots/optik/{vorher,nachher,detail}/` (lokal)

## Einstellungen / URL
- Optionen → Grafik → Bewegungsunschärfe Aus / Leicht / Stark. `?blur=off|light|strong`, `?deko=0`, `?wolken=0`.

## Tests
- `npm run test:node`: alle grün (neu: `test_quality_blur`, `test_deco`), Generator 30/30 lösbar.
- Playwright (nacheinander, GPU), alle grün, 0 pageerrors: smoke, test_race, test_cockpit_ui, test_extras_ui,
  test_hochformat, test_fx, test_touch, test_reset_ui, test_trk_ui, test_lineviz, test_sound_pad, neu test_blur.
- Cache-Busting: `tools/update_sw.py` → neue Version.

## Grenzen (ehrlich)
- Wasser spiegelt den Himmel und bewegt sich, aber **keine echte Spiegelung** von Strecke/Bäumen (auch nicht auf
  Stufe 2) – eine zweite Szenen-Renderung lohnte sich für die kleinen Gruben/Teiche nicht.
- Kein Bloom (Sonne/Flammen): würde auf Stufe 1 einen weiteren Vollbild-Durchgang kosten.
- Deko-Karten (Pflanzen, Zuschauer) sind flach; von oben erkennt man die Kreuzkarten.
- Wer quer durchs Gelände fährt, fährt durch Deko hindurch (bewusst ohne Kollision).
- Bestzeiten/Physik unverändert (Deko ohne Kollision).

## Bitte am Handy prüfen
1. **Hält die Bildrate?** Strecke des Tages auf Leicht, Grafik „Automatisch“: fühlt es sich flüssig an wie vorher?
   Falls nicht: Grafik „Mittel“ und Bewegungsunschärfe „Aus“ vergleichen und Bescheid geben.
2. Bewegungsunschärfe Leicht vs. Stark: Gefällt das Tempogefühl? Wird einem übel (dann Leicht/Aus)?
3. Wirkt die Strecke jetzt wie eine Rennstrecke (Banden, Kiesbetten, Tribüne, Zuschauer)? Zu viel/zu wenig?
4. Hochkant und im Cockpit kurz fahren.
