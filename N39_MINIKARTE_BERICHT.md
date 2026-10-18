# N39 – 3D-Minikarte der Strecke im Rennen – Bericht

Stand 18.10.2026 · Version **0.9.0** · live: https://drpeterkalmar.github.io/stuntbahn/
Peters Wunsch (10.10.2026): „Stuntbahn: 3D-Minimap der Strecke.“ (Gleiches für die Hyperbahn – dort als Nachtrag im
Grundspiel, nicht Teil dieses Auftrags.)

## 📱 Handy-Test für Peter
1. Irgendeine Strecke starten. **Oben in der Ecke** (hochkant rechts unter den runden Knöpfen, quer oben links neben der Zeit)
   liegt eine kleine Karte der **ganzen Strecke**, schräg von oben. Dein Auto ist der **rote Pfeil**, die Karte dreht mit:
   Fahrtrichtung ist oben.
2. **Gelb** leuchtet der Abschnitt bis zum nächsten Checkpoint (mit Lauflicht). Checkpoints: **gelber Ring** = offen,
   **gelb pulsierend** = der nächste, **grün** = geschafft. Start/Ziel ist **kariert**. Das Geisterauto (Mittel/Original mit
   Bestzeit) ist ein **hellblauer Punkt**.
3. **Loopings/Korkenzieher** sind orange, **Röhren und Tunnel** gestrichelt, **Sprünge** eine Lücke mit dünnem Punkte-Bogen.
   Hochstraßen sind heller und werfen einen Schatten auf die Platte; an einer **Brücke** liegt die obere Straße sichtbar über
   der unteren (gut zu sehen auf `4711-3-3d`, der Acht).
4. **Antippen** = groß (zwei Drittel der kurzen Seite), nochmal = klein.
5. **Optionen → „Minikarte im Rennen“:** 3D / 2D / Aus, dazu „⬆️ Norden oben“ (Karte steht still).
6. Frage an dich: Ist die Ecke gut gewählt, die Größe richtig (≈ 25 % der kurzen Seite), und stört das gelbe Lauflicht?

## Was gebaut ist (Brief Punkt für Punkt)
| # | Soll | Stand |
|---|---|---|
| 1 | Live-3D-Karte der ganzen Strecke als leuchtendes Band, einmal als Geometrie gebaut, echte Höhen, Sprung-Lücke, Loopings, Spirale, Röhre/Tunnel gestrichelt, Brücken über/unter, dezente Grundplatte | ✓ `src/track/kartegeo.js` baut aus der Fahrlinie einmal je Strecke ein Band (Ø 22 % der Linienpunkte, ≤ 2 300 Ecken, 0,3–7 ms). Höhe = Farbe (türkis → warmweiß), Brücken mit dunklem Rand und Schatten auf der Platte; bei flachen, großen Strecken Höhen bis ×3 überhöht (sonst sieht man 6 m auf 1 km nicht) |
| 2 | Auto als Pfeil (pulsierend), Start/Ziel, Checkpoints erreicht/offen, nächster Abschnitt hervorgehoben, Geist, Gegner-Schnittstelle | ✓ alles; **`__game.minikarte.setMarkers([{ pos: [x, y, z] \| {x, y, z}, farbe: '#ff3040' \| 0xff3040, groesse? }])`** für n34 (bis 48 Gegner, ein Draw-Call mit allen Marken) |
| 3 | Mitdrehend (Standard, weich), Norden oben, Neigung 35–50°, ganze Strecke im Bild, lange Strecken Ausschnitt mit sanftem Zoom, Tippen groß/klein | ✓ Neigung 42° (`?karteneig=`), Drehung folgt mit 0,45 s Zeitkonstante. Die Strecke wird je Karten-Bild mit der echten Kamera projiziert und genau eingepasst (Perspektive: die nahe Kante ist ~18 % größer), Zoom/Lage gleiten mit 0,4 s. Radius > 620 m: kleine Karte zeigt 430 m um das Auto. Groß = immer ganz. Desktop: Taste **M** |
| 4 | Ecke ohne Touch-Zonen/Tacho, hoch und quer, 22–28 % der kurzen Seite, halbtransparent mit dunklem Rand, lesbar Tag/Nacht/Regen/Schnee | ✓ 25 % (84–230 px). Geprüft gegen Tacho, Hüpfer, Nitro, beide Tasten-Blöcke (Leicht und Mittel, hoch und quer): **0 Überlappungen**. Das DOM-HUD liegt immer über der Karte. Leicht: Die Karte nimmt oben in der Ecke ein kleines Stück der Lenk-Hälften weg (sonst ginge Antippen nicht) |
| 5 | Menü 3D (Standard) / 2D / Aus, `?karte=3d\|2d\|0`, 2D = Draufsicht derselben Geometrie | ✓ plus `?kartenord=1` |
| 6 | Eigene kleine Szene, Render-Target 15–30 Hz, < 0,4 ms GPU auf Mittelklasse, keine Draw-Call-Spitzen, nichts je Bild neu bauen | ✓ 20 Hz (Einfach 15 Hz, groß 30 Hz), **2 Draw-Calls je Karten-Bild + 1 Kopie je Bild**; Standard **+0,03 ms GPU je Bild**; Kino siehe Messung |
| 7 | Wiederholung/Kino-Replay/Fan-Cam: aus; Fotomodus: aus | ✓ nur im Rennen sichtbar (auch Countdown); aus in Pause, Zielshow, Ergebnis, Replay, Kino-Replay. Ein Fotomodus existiert im Spiel noch nicht – der Schalter `app.fotoModus = true` blendet die Karte aus, sobald es einen gibt |

## Technik
- **Geometrie** (`src/track/kartegeo.js`, rein rechnend): Linienpunkte ausdünnen (≤ 6 m, Richtung ≥ 0,14 rad, Höhe ≥ 1,2 m,
  Art-Wechsel bleiben), je Punkt zwei Ecken (Mitte + Binormale), Art je Punkt (Straße / Looping+Korkenzieher / Röhre+Tunnel /
  Luft). Breite setzt der Shader nach Zoom (mindestens ~3,4 px Band + 1 px Rand).
- **Grafik** (`src/gfx/minikarte.js`): **ein** Draw-Call für Schatten, Rand und Band (drei Instanzen derselben Geometrie,
  `gl_InstanceID` wählt die Rolle), **ein** Draw-Call für alle Marken (Punkte in Bildschirmgröße: Pfeil, Puls, Start, Checkpoints,
  Geist, Gegner), Grundplatte und abgerundeter dunkler Grund in der **Kopie** (Sichtstrahl je Pixel gegen die Ebene, kein
  eigener Draw-Call). Render-Target mit MSAA 4, vormultipliertes Alpha.
- **Reihenfolge im Bild:** Karten-Bild **vor** dem Hauptbild, Kopie **nach** dem Kino-Look im selben Zeichendurchgang.
  Erster Ansatz (Karte nach dem Hauptbild zeichnen) unterbrach den Durchgang des Hauptbilds; die GPU-Zeitabfrage zeigte dann
  1–9 ms je Bild, mit der Bildgröße wachsend – umgebaut.
- Shader werden beim Laden der Strecke übersetzt (kein Hänger im ersten Rennbild).
- Rahmen und Tippfläche sind ein `<div id="karte">` im HUD (CSS-Rand, dunkler Ring), Lage rechnet `ui.karteLayout()` nur bei
  Größenwechsel/HUD-Start.

## Messwerte

### Mess-Gate (tests/perf_gate.py, Handy-Profil CPU ×4, DPR 2,6, ungedeckelt, Median aus 3 Runden im Wechsel)
vorher = n38 (6222bfc) · nachher = n39 · ohne = n39 mit `?karte=0`. Bildzeit p50 / p95 in ms.

| Szene | vorher | nachher | ohne Karte | Draw-Calls (Median) |
|---|---|---|---|---|
| Rennen Standard hoch | 4,8 / 6,7 | 4,8 / 6,8 | 4,8 / 6,7 | 84 → 85 |
| Rennen Standard quer | 4,9 / 6,5 | 4,8 / 6,5 | 4,8 / 6,5 | 99 → 100 |
| Rennen Kino hoch | 7,3 / 10,2 | 7,3 / 10,0 | 7,3 / 10,1 | 97 → 98 |
| Rennen Kino quer | 8,4 / 11,4 | 8,5 / 11,4 | 9,2 / 13,3 (Ausreißer) | 112 → 113 |
| Rennen Einfach hoch (15 Hz) | 3,1 / 4,9 | 3,2 / 5,0 | 3,0 / 4,7 | 56 → 57 |
| Rennen Einfach quer (15 Hz) | 3,5 / 5,4 | 3,2 / 5,0 | 3,6 / 5,4 | 68 → 70 |
| Cockpit Kino hoch *(erste Fassung)* | 8,2 / 11,7 | 7,9 / 12,2 | 8,3 / 11,8 | 76 → 78 |
| Cockpit Kino quer *(erste Fassung)* | 9,4 / 14,5 | 9,4 / 14,9 | 9,4 / 14,8 | 83 → 85 |

Alles im Messrauschen (±5 %; dieselbe Variante schwankt zwischen Läufen mehr). Einfach mit 20 Hz war quer einmal +12 % p95
(+0,5 ms) → Einfach zeichnet die Karte jetzt mit 15 Hz, danach im Rauschen. Dateien: `tests/perf/2026-10-18_n39_ab_*.json`.

**GPU-gebunden** (ohne CPU-Drossel, rennen_kino, 3 Runden): hoch 7,8 / 9,6 (Karte) gegen 8,0 / 9,7 (ohne) und 8,0 / 9,9 (Karte
mit 60 Hz); quer 8,6 / 10,5 gegen 8,5 / 10,5 und 8,5 / 10,7 → die Bildzeit steigt auch dann nicht, wenn die GPU der Engpass ist.

### Karte allein (tests/minikarte_mess.py, Pixel 7 hoch, CPU ×4, DPR 2,6)
| Größe | Standard (q1, Karte 155 × 155 px) | Kino (q2, 206 × 206 px) |
|---|---|---|
| GPU ganzes Bild mit/ohne Karte (Zeitabfrage, Median) | 3,28 / 3,25 ms → **+0,03 ms** (p95 +0,03) | 8,33 / 7,94 ms → **+0,39 ms** (p95 +3,0) |
| GPU eines Karten-Bilds (Zeitabfrage nur darum) | 0,42 ms (p95 0,48) | 0,63 ms (p95 0,75) |
| → je Bild bei 20 Hz/60 fps | ~0,14 ms | ~0,21 ms |
| CPU Karten-Bild / nur Kopie (p50, p95) | 0,2 / 1,1 ms · 0 / 0,5 ms | 0,2 / 1,0 ms · 0 / 0,4 ms |
| Draw-Calls | +2 im Karten-Bild, +1 je Bild | gleich |

**Ehrlich zu Kino:** Die Zeitabfrage um das ganze Bild zeigt auf Kino +0,39 ms im Median und Spitzen in den Karten-Bildern.
Die echte Bildzeit (GPU-gebunden, oben) ändert sich aber nicht; ohne Kopie (`?kartekopie=0`) und ohne MSAA (`?kartems=0`)
bleibt der Ausschlag gleich. Wahrscheinlich misst die Abfrage auf ANGLE/Metal die Wartezeit zwischen zwei Übergaben an
die GPU mit. Ziel < 0,4 ms: Standard klar erfüllt, Kino knapp (Messung mit Artefakt). Am Handy bitte auf Ruckler achten –
falls ja: `?kartehz=10` bzw. Optionen → 2D/Aus.

### Geometrie (tests/node/test_minikarte.mjs 2)
- 250 Sammlungs-Strecken + Beispiel-Strecke + 36 Zufallsstrecken (flach / Hochstraße / Gelände, mit und ohne „h“) + Galerie:
  **288 Strecken ohne Fehler**, Zahlen endlich, Indizes gültig, Höhenbereich in der Fahrlinie (Spanne < 250 m), Radius
  40–2000 m, Rundkurse als ein Band.
- **832 Loopings/Korkenzieher geschlossen:** kopfüber, > 5 m hoch (.TRK-Korkenzieher haben das alte Maß 7,2 m), Ausfahrt auf
  Einfahrtshöhe ±1 m, keine Lücke > 9 m im Band.
- Galerie: Straße 769 / Looping 77 / Röhre 14 / Luft 18 Kartenpunkte; Tunnel von `4711-3-g` gestrichelt.
- Bauzeit Median 0,3 ms, höchstens 7 ms; Kartenpunkte im Median 22 % der Linienpunkte.

### Browser
- `tests/test_minikarte_ui.py`: **27/27 OK** – Menü ohne Karte; Rennen/Countdown 3D mitdrehend; ~20 Hz neu, Kopie jedes Bild;
  Tippen groß 103 → 272 px und zurück; Pause, Zielshow, Kino-Replay, Ergebnis, Replay ohne Karte; `setMarkers`; Optionen
  3D/2D/Aus/Norden gespeichert und wirksam; URL `?karte=2d|0`, `?kartenord=1`; Desktop Taste M (180 → 475 px); 0 Fehler.
- `tests/minikarte_shots.py`: 7 Strecken × hoch/quer (Leicht) + flach Mittel mit Tasten: Karte sichtbar, **0 Überlappungen**
  mit Tacho/Hüpfer/Nitro/Tasten, 0 Fehler.
- Bestehende Tests: `npm run test:node` **50/50 grün**; `tests/smoke.py` 0 Fehler; `tests/test_race.py`,
  `tests/test_hochformat.py` grün; `tests/test_touch.py` grün (Optionen-Knopf „3D (Standard)“ war hochkant zu breit → „3D“, der
  Hinweis „Standard: 3D“ steht in der Überschrift). Die Prüfung „hoch Groß Verfolger: Auto frei“ schwankt – auch im Stand n38
  (1 von 3 Läufen rot), sie hängt an der Kameralage im Prüf-Moment, nicht an der Karte.

### Sichtprüfung der Fotos
Die Prüfung per vision_analyze stand in dieser Sitzung nicht als Werkzeug zur Verfügung; ich habe die Bilder selbst angesehen
(Frage: „Strecke und Auto in der Karte klar erkennbar? verdeckt nichts?“): In allen 14 Ausschnitten (Galerie mit Looping, Röhre
mit Wand, Spiralen-Hochstraße im Gelände, flach, Acht mit Brücke, Nacht + Regen, Schnee) sind Band, roter Pfeil, Start und
Checkpoints klar zu erkennen; der dunkle Grund trägt auch vor Schnee und hellem Himmel. Die Karte liegt nie über Tasten oder
Tacho; Banner wie „Checkpoint 1/3“ liegen darüber (DOM).

Bilder: `tests/shots/n39/karten.jpg` (alle Ausschnitte), `collage_quer.jpg`, `collage_hoch.jpg`, `gross_2d.jpg` (groß hochkant +
2D Norden oben).

## Regler (A/B, nur Anzeige)
`?karte=3d|2d|0` · `?kartenord=1|0` · `?kartehz=20` (Takt des Karten-Bilds; ohne Angabe 20 Hz, Einfach 15, groß 30) ·
`?karteneig=42` (Neigung in Grad von senkrecht, 0 = Draufsicht) · `?kartems=4` (MSAA) · `?kartemess=1` (GPU-/CPU-Messung) ·
`?kartekopie=0` (nur Messen: Kopie weglassen). Feste Werte in `KARTE` (`src/gfx/minikarte.js`): Radius ab dem Ausschnitt
620 m, Ausschnitt 430 m, Drehung 0,45 s.

## Grenzen / offen
- Gelände ist nur als Platte angedeutet (kein Höhenrelief); die Strecke selbst zeigt die Höhen.
- Gegner kommen erst mit n34; dann `setMarkers` je Bild mit den Gegner-Positionen aufrufen (Farben frei).
- Die Karte zählt beim Grafik-Autopiloten mit (sie steckt in der gemessenen Bildzeit); er hat keinen eigenen Schalter für sie.
- Hyperbahn: eigener Auftrag.
- Ladegröße +12,7 KB gzip (zwei neue Module), keine neuen Assets.
