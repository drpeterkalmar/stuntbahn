# Stuntbahn n28 – Mehr Details und Leben, ohne langsamer zu werden (07.10.2026)

Peters Wunsch (05.10.): „Jedes Spiel mit Opus max ressourcenschonend verschönern … also mehr Details und Eye Candy.“
Reine Optik: Physik, Fahrhilfen, Strecken, Bestzeiten, Steuerung und HUD sind unverändert (alle 33 Node-Tests grün,
darunter die Bitgleichheits-Prüfungen von Drift, Stunt-Größe, Zielshow und Röhre).

## Kurz
- **Live:** https://drpeterkalmar.github.io/stuntbahn/ – Build **19b10a8a0e** (Version 0.2.0), live geprüft: HTTP 200,
  Build live = lokal, Rennen bis ins Ziel, offline startbar, 0 Fehler; zusätzlich live `?deko=0` (keine Wolken/Teilchen)
  und `?thema=winter` (1100 Schneeflocken), je 0 Fehler.
- **Neu am Himmel:** Wolken bei Alpen, Wüste, Küste, Stadt und Herbst (vorher war dort ein leerer blauer Verlauf –
  hochkant das ganze obere Bilddrittel), dazu kreisende Vögel neben der Strecke.
- **Neu am Boden und in der Luft:** Wiesenblumen und große Farbflecken in der Wiese, grüne statt schwarzer Grasbüschel,
  Schneefall im Winter, taumelndes Herbstlaub, Pollen, die im Gegenlicht glitzern, Sand in der Wüste.
- **Neu am Auto und im Ziel:** Bremslichter leuchten beim Bremsen rot auf; Ergebnis-Karte mit hereinspringender Zeit,
  Glanz und goldener Bestzeit.
- **Menü quer:** alle Knopfreihen passen ins Bild, die Info-Zeile bricht nicht mehr mit hängendem Punkt um.
- **Kosten:** Ladegröße +0,01 MB (alles im Spiel erzeugt, keine neue Datei), Draw-Calls +3, Bildzeit im direkten
  An/Aus-Vergleich im Rauschen gleich (Tabelle unten). Auf „Einfach“ bleiben nur die billigen Teile.
- **A/B:** `?deko=0` = Aussehen genau wie bis n29 (mit Bildvergleich geprüft). Was bis n29 `?deko=0` hieß (ohne
  Streckenrand-Deko), heißt jetzt `?deko=aus`.

## 1. Ist-Rundgang (vorher, mit Bildlektüre)
Fotos je hoch und quer: Menü, Start, Fahrt, Cockpit, Blick über die Strecke, Zielshow, Ergebnis (`tests/deko_shots.py`,
Strecke 4711-3-g „Heulende Wirbelbahn“, Alpen). Notiert habe ich:
1. **Leerer Himmel:** Alpen, Wüste, Herbst, Stadt haben „Pure-Sky“-Himmelsbilder ohne Wolken; hochkant ist das obere
   Drittel ein flacher Verlauf – der größte sterile Bereich im Spiel.
2. **Einheitliche Wiese:** große, gleichmäßig grüne Flächen ohne Blumen oder Flecken.
3. **Schwarze Krümel:** die Grasbüschel (sehr dunkle Atlas-Karten) wirken ab ~10 m wie dunkle Punkte, „billig“.
4. **Keine Bewegung in der Luft:** außer Ballons/Zeppelin bewegt sich nichts; Winter ohne Schnee, Herbst ohne Laub.
5. **Bremsen ohne Rückmeldung:** das Heck bleibt beim Bremsen unverändert.
6. **Reifenspuren** bleiben die ganze Runde als harte schwarze Bänder liegen.
7. **Ergebnis-Karte** erscheint statisch, auch bei Bestzeit.
8. **Menü quer:** unterste Knopfreihen abgeschnitten, „2.40 km ·“ mit hängendem Punkt.
Schon gut und nicht angefasst (n17/n20/n27): Fahnen wehen, Zuschauer jubeln, Tribünen, Banden, Reifenstapel, Qualm,
Funken, Staub, Hitzeflimmern, Feuerwerk, Cockpit.

## 2. Liste (nach Wirkung pro Kosten) und was daraus wurde
| # | Verschönerung | Wirkung | Kosten | Stand |
|---|---|---|---|---|
| 1 | Wolken am Himmel je Landschaft (ziehen, silberner Rand zur Sonne, Wolkenbank am Horizont) | sehr groß (hochkant!) | 3 Texturzugriffe je Himmelspixel; Himmel jetzt **nach** der Landschaft gezeichnet → rechnet nur freie Pixel | ✅ Etappe 1 |
| 2 | Menü quer: Knopfreihen, Umbruch | klein, aber Peters Punkt | 0 | ✅ Etappe 1 |
| 3 | Vogelschwärme (Greifvogel-/Möwen-Silhouetten, Flügelschlag mit Gleitphasen) | mittel (Leben) | 1 Draw-Call, ≤ 28 × 8 Dreiecke, 0 CPU | ✅ Etappe 1 |
| 4 | Wiesenblumen in Inseln + große Farbflecken | mittel | etwas Rechnung im Boden-Shader, nah; auf Einfach aus | ✅ Etappe 2 |
| 5 | Grasbüschel heller (keine schwarzen Krümel) | mittel | 0 | ✅ Etappe 2 |
| 6 | Luft-Teilchen je Landschaft: Schnee, Laub, Pollen, Sand, Staub | groß bei Winter/Herbst | 1 Draw-Call, Bahn im Shader; auf Einfach aus | ✅ Etappe 2 |
| 7 | Reifenspuren weich und verblassend (20–35 s) | klein | 0 | ✅ Etappe 2 |
| 8 | Bremslichter (Pedal oder Verzögerung, auch Autopilot/Replay/Film) | mittel | 1 Draw-Call (4 Leuchten in einem Mesh) | ✅ Etappe 3 |
| 9 | Ergebnis: Zeit springt herein, Glanz, Bestzeit golden | mittel (Erfolgsmoment) | einmalige CSS-Animation | ✅ Etappe 3 |
| 10 | „Bewegung reduzieren“ des Systems: kein Kameraschütteln, Luft-Teilchen 30 % | Zugänglichkeit | 0 | ✅ Etappe 1/2 |
| – | Lack-Envmap vorgerendert | klein: das Auto spiegelt schon den Themen-Himmel (Klarlack + HDRI) | – | bewusst nicht |
| – | Tribünen/Fahnen/Banden/Reifenstapel, Funken bei Landungen, Staub auf Wiese, Hitzeflimmern | gibt es seit n17/n20/n27 | – | nicht gedoppelt |
| – | Deko für Röhre/Buckel | Röhre hat seit n29 Warnstreifen; kein klarer Gewinn ohne Physik-Risiko | – | nicht gemacht |

## 3. Messung vorher/nachher
**Aufbau:** Playwright, Pixel 7 **hochkant** (412 × 915, Pixeldichte 2,625; zusätzlich quer), WebGL über die Mac-GPU,
**CPU 4× gedrosselt** (`Emulation.setCPUThrottlingRate`), Grafikstufe fest (Kino `?q=2` bzw. Einfach `?q=0`), je
Szene 10 s Bildzeiten. Vorher = Stand 4d2e750 (n29), nachher = n28.

**Wichtig – ehrlich:** Auf diesem Mac schwanken die Bildzeiten im Headless-Browser stark (derselbe Stand liefert in
zwei Läufen 83 oder 133 ms p95; nebenher läuft der animierte Bildschirmhintergrund mit Videodekoder auf der GPU, den
ich nicht abschalte). Die Bildzeiten springen dazu in 16,7-ms-Stufen. Deshalb zwei Messungen:

**a) Vorher gegen nachher in getrennten Browsern** (`tests/perf_deko.py`, 4 Runden je Stand, Reihenfolge je Runde
getauscht, Median; Datei `tests/shots/deko/perf_final.json`; Stand vor der Einfach-Abschaltung aus Abschnitt b):

| Szene | p50 vorher → nachher (ms) | p95 vorher → nachher (ms) | Mittel vorher → nachher (ms) | Draw-Calls | Dreiecke | Texturen |
|---|---|---|---|---|---|---|
| Menü (Leerlauf) | 91,7 → 100,0 | 125,0 → 125,1 | 73,0 → 83,3 | 78 → 81 | 287,8k → 288,3k | 56 → 58 |
| Rennen Kino | 75,0 → 50,0 | 108,4 → 133,3 | 63,7 → 66,9 | 82 → 86 | 296,6k → 297,6k | 58 → 60 |
| Zielshow + Film | 75,0 → 50,1 | 116,7 → 75,1 | 70,9 → 62,3 | 71 → 74 | 279,2k → 280,5k | 60 → 62 |
| Rennen Einfach | 75,0 → 75,0 | 125,0 → 108,4 | 67,8 → 76,3 | 53 → 56 | 142,0k → 142,1k | 45 → 47 |

Einzelläufe Rennen Kino p95: vorher 133/83/133/83, nachher 133/133/133/100 – das ist Rauschen, kein Effekt.

**b) Direkter An/Aus-Vergleich in derselben Seite** (`tests/perf_deko_ab.py`; Szene angehalten, also ohne Physik;
alle Neuerungen im Wechsel an/aus, 6–8 Durchgänge je 4 s, Median; „aus“ = Himmel zuerst ohne Wolken, keine Vögel,
Luft-Teilchen, Bremslichter, Wiesenblumen):

| Fall | p95 aus → an (ms) | Mittel aus → an (ms) | Draw-Calls |
|---|---|---|---|
| hoch, Kino, Start | 133,4 → 133,4 (±0 %) | 101,1 → 98,4 (−3 %) | 90 → 93 |
| hoch, Kino, Fahrt | 108,4 → 116,7 (+1 Bildtakt) | 93,2 → 96,0 (+3 %) | 85 → 88 |
| quer, Kino, Start | 91,7 → 100,1 (+1 Bildtakt) | 60,4 → 64,1 (+6 %) | 103 → 106 |
| quer, Kino, Fahrt | 133,4 → 125,1 (−6 %) | 73,2 → 69,5 (−5 %) | 95 → 98 |
| **hoch, Einfach, Start** | 108,4 → 108,4 (±0 %) | 54,0 → 55,7 (+3 %) | 58 → 60 |
| **hoch, Einfach, Fahrt** | 108,4 → 100,1 (−8 %) | 54,8 → 57,4 (+5 %) | 53 → 55 |
| quer, Kino, Grafikchip 3-fach belastet, Start | 125,0 → 108,4 | 51,1 → 58,4 | 103 → 106 |
| quer, Kino, Grafikchip 3-fach belastet, Fahrt | 116,7 → 116,8 | 66,6 → 57,1 | 95 → 98 |

Über die vier Kino-Fälle gemittelt: 327,9 ms aus, 328,0 ms an – **gleich**. Die Ausreißer in beide Richtungen
(±1 Bildtakt) liegen in der Streuung derselben Szene (z. B. „aus“ Start hoch: 68–133 ms). Das Budget „p95 höchstens
+10 %“ halte ich damit nach bestem Messwissen ein, kann es auf diesem Mac aber **nicht genauer als ±1 Bildtakt belegen**.
Ein echtes Handy habe ich nicht gemessen.

**Was ich gegen Mehrkosten getan habe:** Der Himmel wird jetzt nach der Landschaft gezeichnet (vorher übermalte er
jedes Bild den ganzen Bildschirm, jetzt nur die freien Pixel – das bezahlt die Wolken). Vögel, Luft-Teilchen und
Bremslichter je **ein** Draw-Call, Bewegung komplett im Shader aus der Zeit (keine CPU-Arbeit je Bild, kein neuer
Speicher, kein Müll für die Speicherbereinigung). **Auf „Einfach“ und bei der Automatik „Deko sparsam“** sind
Wiesenblumen-Shader und Luft-Teilchen ganz aus (Bedingung der niedrigsten Stufe: gleich oder besser). Kein neuer
Dauer-Loop: Das Menü zeichnete schon vorher (Kamerafahrt ums Auto); alles Neue hängt an derselben Bildschleife, die
bei verstecktem Tab vom Browser angehalten wird. Ergebnis-Animation: einmalig, reines CSS.

**Ladegröße** (`tools/ladegroesse.py`, gzip): Erstladung 7,140 → **7,151 MB** (+0,011 MB, nur Code), Themen-Pakete
8,68 MB unverändert, keine neue Datei, keine neuen externen Abrufe. Service-Worker-Version neu (Cache-Busting).

## 4. Vergleichsfotos (selbst angesehen)
`tests/shots/deko/`:
- `vergleich_hoch.jpg` – 7 Szenen, oben vorher, unten nachher (Alpen).
- `vergleich_quer_a.jpg` (Menü, Start, Fahrt, Cockpit) und `vergleich_quer_b.jpg` (Überblick, Zielshow, Ergebnis).
- `vergleich_themen_hoch.jpg` – Herbst, Winter, Wüste, Stadt in der Fahrt, vorher/nachher.

**Ehrliche Bewertung:**
- **Deutlich besser:** Himmel bei Alpen (hochkant sofort sichtbar: Haufenwolken statt leerer Fläche), Herbst (Laub
  wirbelt vorbei), Winter (Schneefall), Menü quer (alles im Bild), Bremslichter beim Bremsen, grünere Grasbüschel.
- **Dezent:** Wiesenblumen (man sieht sie nah am Rand und im Überblick, nicht in jeder Kurve), Vögel (klein, kreisen
  50–100 m neben der Strecke – eher Stimmung als Blickfang), Pollen-Glitzern, Ergebnis-Glanz.
- **Kaum sichtbar:** Wüstensand und Stadt-Staub (feine Körner), Wolken über der Stadt (dunstig); im Cockpit ändert sich
  fast nichts (Himmel kaum im Bild).
- Info-Zeile im Menü: bricht jetzt vor dem „·“ um; die neue Zeile beginnt mit „· ⛰️ 42 m“ – kein hängender Punkt mehr,
  „Alpen“ steht nicht mehr allein.

## 5. Tests
- **Node:** `npm run test:node` 33/33 grün.
- **Browser:** smoke, test_race, test_fx, test_kinolook, test_grafik_start, test_hochformat, test_cockpit_ui,
  test_reset_ui, test_leicht_zeiten, test_blur, test_live – grün, 0 Fehler im Browser.
- **Schon vorher rot (gleiches Ergebnis auf dem Stand 4d2e750, nicht angefasst):** `test_touch` (hochkant berührt die
  Gas-Taste die Auto-Box, Messung schwankt), `test_kinoreplay` (Onboard-Kamera wechselt im letzten Burst-Bild schon zur
  Tele), `test_extras_ui` (sehr kleines Querformat: Tempo berührt BREMSE – bekannt seit n27).
- `?deko=0` gegen den alten Stand fotografiert: gleiches Bild (keine Wolken, Vögel, Teilchen, Blumen, Bremslichter).
- Neue Skripte: `tests/deko_shots.py` (Rundgang), `tests/deko_himmel.py` (Himmel je Thema), `tests/deko_ergebnis.py`
  (Ergebnis-Karte), `tests/perf_deko.py` (vorher/nachher), `tests/perf_deko_ab.py` (An/Aus in einer Seite),
  `tools/ladegroesse.py`, `tools/deko_collage.py`.

## 6. A/B-Links
- Neu: https://drpeterkalmar.github.io/stuntbahn/
- Alt: https://drpeterkalmar.github.io/stuntbahn/?deko=0
- Winter (Schnee): `?thema=winter`, Herbst (Laub): `?thema=herbst`, Alpen (Wolken): `?thema=alpen` – jeweils mit
  `&deko=0` zum Vergleich.

## 7. Worauf Peter am Handy achten soll
1. App einmal ganz schließen und neu öffnen (PWA), dann ist der neue Stand da.
2. **Hochkant mit Alpen/Herbst/Stadt:** Ist der Himmel jetzt lebendig? Ziehen die Wolken langsam?
3. **Winter und Herbst:** Schnee bzw. Laub – stört es oder wirkt es schön? Wird das Handy wärmer oder ruckelt es?
   (Falls ja: Grafik „Standard“ hat 70 % der Teilchen, „Einfach“ keine.)
4. **Bremsen auf Mittel:** leuchten die Rücklichter? Auf Leicht leuchten sie, wenn der Autopilot stark bremst.
5. **Ziel mit Bestzeit:** springt die goldene Zeit herein?
6. **Menü quer:** sind alle Knöpfe ganz zu sehen? Tippen auf den Fahrhilfe-Text zeigt ihn ganz.
7. Wer Bewegung reduziert hat (Bedienungshilfen), bekommt kein Kameraschütteln und weniger Teilchen.

## Grenzen / offen
- Bildrate nur headless gemessen, mit großer Streuung (s. o.); kein echtes Handy.
- Wolken sind eine flache Schicht (kein Volumen), über dem Land-/Winter-Himmel bewusst keine (dort sind sie im Bild).
- Teilchen haben keine Kollision; unter Tunnel, Röhre und Brücken blenden sie aus (Strahl von der Kamera nach oben,
  alle 8 Bilder), am Rand einer Brücke kann eine Flocke noch kurz zu sehen sein.
- Code: `src/gfx/deko.js` (Wolken, Vögel, Luft, Bremslichter), Boden in `src/gfx/materials.js` (`tMeadow`, `tFlowers`,
  `tDekoK`), Reifenspuren `src/gfx/fx.js`, Menü/Ergebnis `src/ui/ui.js` + `css/style.css`.
