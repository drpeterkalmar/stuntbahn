# Stuntbahn n18 – Kino-Replay nach dem Ziel (03.10.2026)

Peters Wunsch (28.09.): „Nachdem man durchs Ziel ist: Cinematic Replay mit Slow-Mo-Drohnen-Action-Cam der besten
Stunteinlagen.“ Nachtrag (30.09.): die n19-Stunts (Spirale, Klippensprung, Steilwand …) mit auswerten.

## Kurz
- **Nach dem Zieleinlauf startet automatisch ein Highlight-Film** (gemessen 22–27 s): die 3 (bis 5) besten Momente der
  Fahrt, zeitlich sortiert, ohne Überlappung, dazu der Zieleinlauf. Zeitlupe 1,0 → 0,25 → 1,0 mit weichen Rampen,
  Einblendung („🚀 101 m Sprung“, „🌀 Looping“, „🏁 Ziel · 1:21,27“), Motor in der Zeitlupe tiefer und dumpfer, ein
  Stinger (tiefes Rauschen + Schlag) beim Eintritt in die Zeitlupe, **Tiefenschärfe aufs Auto** (neu im Kino-Look) und
  Bewegungsunschärfe (n17-Pipeline, in der Zeitlupe länger belichtet).
- **Querformat:** Kino-Balken oben/unten (2,39:1, mindestens 8,5 % je Balken, fahren ein). **Hochformat:** keine Balken
  (das Bild wäre winzig), stattdessen rahmen die Kameras das ganze Auto fürs schmale Bild (Drohne weiter weg, Action-Cam
  hinter dem Auto, Sichtfeld nach Bildbreite).
- **Jederzeit überspringbar:** Antippen irgendwo (ein noch liegender Finger vom Rennen zählt nicht, erst ein neuer Tipp
  nach 0,6 s), Knopf „Überspringen ⏭“, Esc/Enter/Leertaste. Danach der Ergebnis-Bildschirm wie bisher.
- **Einstellung** Optionen → „🎬 Kino-Replay nach dem Ziel“ (Standard **an**). Ist sie aus, gibt es den Film im Ergebnis
  über **„🎬 Highlights“**. Das bisherige Replay der ganzen Fahrt bleibt (**„📼 Replay“**). `?kino=0|1` übersteuert.
- **Video (war „nur wenn Zeit bleibt“ – ist drin):** „🎥 Als Video“ im Ergebnis spielt den Film mit Aufnahme ab (Bild,
  Balken, Einblendung, Logo „STUNTBAHN“, Ton) → „📤 Video (x MB)“ teilt die Datei (Handy: Teilen-Blatt) bzw. lädt sie
  herunter. Headless Chrome: MP4 (H.264 + AAC), 26,5 s, 3,8–7,9 MB. **Auf echtem iPhone/Android nicht geprüft** (s. u.).
- Alle Tests grün; Bildrate im Film nicht schlechter als im Rennen (quer 10,0 gegen 8,5, hoch 13,2 gegen 12,5 Bilder/s
  headless, je 3 Runden).

## Wie die Momente gefunden werden (`src/game/highlights.js`)
Nur aus der Aufzeichnung (60 Hz: Position, Lage, Einfederung der vier Räder, Tempo, Drehzahl) und den Marken des Rennens
(Schnitte bei Resets, Crashs, Nitro/Hüpfer) – **keine Neu-Simulation**. Neu aufgezeichnet wird nur eine Crash-Liste
(`race.crashLog`: Bild, Grund, Tempo); das Aufzeichnungsformat (REC_STRIDE 16, Geister) bleibt gleich. Je Bild wird der
Linienpunkt der Strecke bestimmt (Tracker, nach Schnitten global neu) → Stück-Art (Looping, Schanze, Spirale …).
Auswertung dauert 9–17 ms (Node) bzw. 13 ms (Browser), die Kamera-Vorbereitung 38–72 ms.

**Punkte-Formel** (Konstanten `HL` oben in `highlights.js`):

| Moment | Erkennung | Punkte |
|---|---|---|
| Sprung, Schluchtsprung, Klippe, Plateau, Hüpfer, Wellen, Kuppe, Luft | alle 4 Räder frei ≥ 0,35 s, Art aus Stück/Gelände-Marke bzw. Hüpfer-Marke | **10 · Flugzeit · (1 + Höhe/4 m) · (1 + Weite/60 m) · Faktor** (Schanze 1, Schlucht 1,25, Klippe 1,2, Plateau 1,1, Luft 0,7, Hüpfer/Wellen 0,6, Kuppe 0,55); Höhe = Steigen + ½ Fallhöhe |
| harte Landung | Aufsetz-Tempo senkrecht zur Fahrbahn > 10,5 m/s (Schanze setzt regulär mit 8–9 auf) | 18 + 4 · (v − 10,5); bei Sprüngen 40 % davon als Zuschlag |
| knapp gelandet | > 28° gegen die Fahrbahn beim Aufsetzen, kein Crash | +10 |
| Looping | Stück Looping und wirklich kopfüber (Oben < −0,2) | 42 · (0,6 + 0,4 · min(1,5; v/40 m/s)) |
| Korkenzieher / Röhre / Wendel | Stück | 48 / 28 / 36 · (gleiche Tempo-Formel), Wendel + 1,2 · Höhenunterschied |
| Spirale (n19) | Stück | 18 + 1,2 · Höhenunterschied (m) |
| Steilwand (n19) / Halfpipe | > 60° bzw. > 37° geneigt ≥ 0,25 s | 24 + 14 · s bzw. 26 + 10 · s |
| Achterbahn-Wellen (n19) | Stück befahren | 14 + 25 · Luftzeit (s) |
| Steilabfahrt (n19) | Stück, Tempo-Gewinn ≥ 25 km/h | 10 + Gewinn/4 |
| Nitro | Nitro-Marke | 16 + Tempo-Zuwachs/5 + Spitze/40 (km/h) |
| Spitzentempo | höchstes Tempo am Boden > 250 km/h | (km/h − 200)/6 |
| Beinahe-Unfall / auf zwei Rädern | am Boden außerhalb von Bauwerken > 38° gegen die Fahrbahn ≥ 0,15 s bzw. eine Seite frei ≥ 0,3 s, 2 s ohne Crash danach | 28 + 0,8 · (Grad − 38) bzw. 26 + 10 · s |
| Crash mit Überschlag/Absturz/Zu kurz | Crash-Liste; Überschlag (Oben < −0,1 außerhalb von Loopings) oder Absturz/Zu kurz, ≥ 15 m/s | 34 · (Überschlag 1 / sonst 0,7) · Tempo-Faktor; **nur bei höchstens 3 Crashs in der Fahrt, höchstens einer im Film, nie „Festgefahren“/„Abseits“** |

**Auswahl:** gierig nach Punkten, gleiche Art mehrfach × 0,7 / 0,5 / …; mindestens 3 Momente (ab 6 Punkten), weitere
nur ab 14 Punkten, höchstens 5; Abstand 0,6 s; Filmbudget 30 s · Spieltempo. Passt ein Moment nicht mehr, wird er mit
kürzerem Kern versucht. Momente in einem Crash-Fenster zählen nicht; **kein Clip läuft über einen Schnitt** (Reset).
Zieleinlauf (letzte 3,2 s, Zeitlupe 0,45) am Ende, wenn Platz ist – ein Moment kurz vor dem Ziel hat Vorrang.

**Clip:** Kern 0,5–0,9 s Aufzeichnung um den Höhepunkt (Sprung: kurz hinter dem Scheitel, Looping: oben, harte
Landung: Aufsetzen, Nitro: 1,2 s nach dem Zünden) mit Tempo 0,25, Rampen 0,4 s (Smoothstep), Vorlauf 0,8 s, Nachlauf
bis zur Landung + 0,5 s. Ein Clip dauert so ~7 s Film.

## Kameras (`src/game/cinecam.js`, reine Rechnung – in Node prüfbar)
| Art | Wo | Einsatz |
|---|---|---|
| **Drohne** | seitlich oben (10 m, 4,2 m hoch), Kreisfahrt von −34° (hinten) nach +17° um das Auto, weich vorausschauend nachgeführt | Absprung, Plateau, Steilwand, Ende Nitro |
| **Action-Cam** | quer: tief am hinteren Kotflügel (1,6 m seitlich, 2,8 m hinten), dreht im Looping/Korkenzieher mit, Wackeln ~1 cm; hochkant: tief hinter dem Auto | Korkenzieher, Röhre, Wellen, Nitro, Landung nach Klippe |
| **Stativ/Tele** | fester Standort an der Landestelle (bzw. seitlich am Looping, an der Crash-Stelle, hinter der Ziellinie), Schwenk + Zoom von weit auf eng zum Höhepunkt; am Looping bleibt der ganze Looping im Bild | Landung, Looping, Crash, Ziel |
| **Hubschrauber** | weit und hoch (40 m, 24 m hoch), Überblick | Schluchtsprung, Wendel, Spirale |
| **Onboard** | auf dem Dach, Blick nach vorn (kurz, ~1 s) | Anfahrt Looping, Nitro, Spitzentempo |

Je Moment-Art eine Folge mit Schnitt (z. B. Sprung: Drohne bis zum Scheitel → Tele an der Landestelle). Gleicher Blick
direkt hintereinander wird getauscht. **Kein Clipping:** Stativ-Standorte werden vorab aus 54 Kandidaten gewählt – frei
(kein Bauteil im Umkreis 1,2 m, nichts darüber bis 30 m = nicht unter Brücke/im Tunnel), nicht auf einer Fahrbahn, über
Gelände **und Wasser**, mindestens 6 m vom Auto, mit der meisten freien Sicht aufs Auto über die ganze Einstellung.
Drohne/Hubschrauber/Action-Cam wählen die freiere Seite; Drohne/Heli werden in jedem Bild per Strahl vom Auto aus
herangezogen (schnell hinein, langsam hinaus), Action/Onboard nie unter Gelände.

## Messwerte
**Node, 5 aufgezeichnete Fahrten** (`node tests/node/test_kinoreplay.mjs`, Liste mit `node tools/kinoreplay_probe.mjs`):

| Fahrt | Kandidaten (Punkte) | Film |
|---|---|---|
| flach 4711-3 Irre (Mittel, Autopilot, Nitro bei 9 s) | Looping 34,7 · Nitro 132 km/h 28,7 · Röhre 27,2 · Luft 0,5 s 3,8 · Looping 34,7 · **101 m Sprung 137** · **104 m Sprung 149** | 26,2 s: Looping [Onboard → Tele] · 101 m Sprung [Drohne → Tele] · 104 m Sprung [Drohne → Tele] · Ziel |
| 3D 4711-3-3d Irre (Leicht, Extras automatisch) | Looping 34,5 · **Steilwand 69° 39,9** · Röhre 29,6 · Achterbahn-Wellen 3× Luft 18,2 · **Nitro 346 km/h 77** · Spitze 346 km/h 24,4 | 27,4 s: Looping · Steilwand [Drohne] · Nitro [Action → Onboard → Drohne] · Ziel |
| Gelände 1234-3-g Irre | Looping 34,5 · **Schluchtsprung 102 m 172** · Röhre 27,2 · Nitro 199 km/h 47 · **Plateau-Sprung 9 m tief 126** · Spitze 253 km/h 8,8 | 25,9 s: Schluchtsprung [Heli → Tele] · Nitro · Plateau-Sprung [Heli] · Ziel |
| Sammlung sam-042 | Looping 34,5 · **55 m Sprung 94** · Korkenzieher 37,6 · Nitro 236 km/h 54,5 · Korkenzieher 37,7 | 26,2 s: Sprung · Nitro · Korkenzieher [Action] · Ziel |
| 3D 2026-2-3d Sportlich | **102 m Sprung 140** · Achterbahn-Wellen 14 · **Wendel 6 m hinauf 36,7** · **Klippensprung 6 m tief 80** | 22,4 s: Sprung · Wendel [Heli] · Klippe [Drohne → Action] |

Plausibel: Sprünge der neuen Schanze (~100 m, 2,3 s, ~4 m) liegen vorn, Schlucht und Klippe/Plateau ebenso; zwei gleiche
Loopings kommen nicht beide; Nitro auf der Geraden mit 346 km/h schlägt Röhre/Looping; die n19-Teile (Steilwand,
Wellen, Wendel, Klippe) werden erkannt. Spirale/Steilabfahrt kamen auf diesen 5 Strecken nicht vor bzw. brachten
< 25 km/h (Formel und Erkennung sind drin). Überführungen werden nicht als Moment gewertet (sieht man im Film kaum).

**Kameras über alle 5 Filme, 60 Hz, quer (Pixel 7, Balken 9 %) und hoch:** über Boden/Wasser **100 %** aller Bilder
(jede Art); freie Sicht aufs Auto Drohne/Action/Onboard 100 %, Hubschrauber 99,2 %, Tele 97,7 % (kurz hinter
Looping-Pfeiler/eigenem Bauwerk); **ganzes Auto (Bug und Heck) im Bild** zwischen den Balken 99,9–100 % (Action-Cam:
Mitte des Autos). Zeitlupen-Kurve stetig (größter Sprung 0,012 je 1/240 s), Abspielzeit = Filmlänge.

**Browser** (`python3 tests/test_kinoreplay.py beide`, Pixel 7 quer + hoch, Gelände 1234-3-g, Mittel/Autopilot):
Film startet von selbst, Ergebnis erst danach, läuft durch (26,3 s Film, 26,8–29,3 s gemessen – headless mit 8–10 Bildern/s greift die Bildzeit-Grenze von 0,1 s) → Ergebnis; „🎬 Highlights“
startet erneut; Antippen überspringt → Ergebnis; Einstellung aus → direkt Ergebnis; Balken quer 35 px oben/unten, hoch 0;
Video MP4 3,8–7,9 MB (zwei Läufe, H.264 + AAC) heruntergeladen; alle Knöpfe ≥ 48 px im Bild; **0 Fehler**.
**Bildrate** (`tests/perf_kinoreplay.py`, je 3 Runden, Kino-Stufe, volle Pixelzahl 2402×1082, headless über die GPU):
quer Rennen 8,5 → Film **10,0** Bilder/s, hoch 12,5 → **13,2**. Die Tiefenschärfe (halbe Auflösung, 12 Abtastungen)
kostet in Einzelmessungen nichts Messbares; headless schwankt die Bildrate um ±20 %, deshalb mehrere Runden.

**Fotos** (Burst 6 × 160 ms je Kamera-Art, mit Vision geprüft – Auto im Bild, keine Kamera in Wand/Gelände, Balken):
`tests/shots/kinoreplay/{quer,hoch}_{drone,action,tele,heli,onboard}_burst.jpg`, Standbilder aus dem Video
`video_bilder.jpg`. Nachgebessert nach der Sichtprüfung: Tele am Looping zeigte nur einen Ausschnitt (jetzt der ganze
Looping), Action-Cam saß zu dicht am Hinterrad (Rad füllte das halbe Bild), hochkant schnitten Drohne und Action-Cam
das Auto am Rand ab (jetzt eigene Hochformat-Werte).

**Tests:** Node 26/26 (neu `test_kinoreplay.mjs`), Browser grün: test_race, test_hochformat, test_kinolook, test_blur,
test_cockpit_ui, test_reset_ui, test_extras_ui, test_leicht_zeiten, test_strecken3d_ui, test_touch, test_zoom,
test_sammlung_ui, test_gelaende_ui, neu test_kinoreplay + perf_kinoreplay. Die älteren Browser-Tests erwarten das Ergebnis
direkt nach dem Ziel; `tests/util.py` schaltet den Film für sie per `window.__noKino` ab (`KINO=1` lässt ihn an – dann
ist test_race erwartungsgemäß rot). `hochformat_shots.py klein` meldet „Sportlich“ zu breit im Menü – das war schon vor
n18 so (gleiches Ergebnis ohne die Änderungen).

## Handy-Test (Peter)
1. https://drpeterkalmar.github.io/stuntbahn/ – eine Strecke mit Stunts, z. B. Code **1234-3-g** (Schlucht, Looping,
   Plateau) oder **4711-3** (zwei 100-m-Sprünge), auf Leicht oder Mittel ins Ziel fahren.
2. Film läuft? Quer: Balken; hoch: Auto ganz im Bild. Ton: Motor in der Zeitlupe tiefer, „Wusch“ beim Langsamwerden.
3. Antippen → Ergebnis sofort. Optionen → „🎬 Kino-Replay nach dem Ziel“ aus → nach dem Ziel direkt das Ergebnis.
4. **Video:** im Ergebnis „🎥 Als Video“, Film durchlaufen lassen, dann „📤 Video“ → iPhone: Teilen-Blatt (in Fotos
   sichern); Android: Teilen bzw. Download. Bitte melden, ob es dort geht und wie groß die Datei ist.
5. Ruckelt der Film mehr als das Rennen? (Grafik Automatisch regelt beides gleich.)

## Grenzen / offen
- Kein echtes Handy gemessen (Bildrate, Video). iPhone kann MediaRecorder seit iOS 14.5 (MP4); ob das Teilen-Blatt die
  Datei annimmt, ist dort ungeprüft. Die Videogröße folgt der Renderauflösung (höchstens 1280 px breit, 30 Bilder/s).
- Ton im Film ist aus Tempo/Drehzahl nachgestellt (Gas wird geschätzt), Crash-Geräusche spielt der Film nicht.
- Crash-Momente sind nur in Node mit künstlichen Marken geprüft (die Testfahrten crashten nicht); bei Totalschaden aus
  dauert der aufgezeichnete Crash nur 0,35 s bis zum Reset – meist bleibt daher der Weg in den Crash, nicht das Wrack.
- Sehr kurze Fahrten (< 5 s Aufzeichnung) bekommen keinen Film; Strecken ohne Stunts nur Nitro/Spitzentempo + Ziel.
