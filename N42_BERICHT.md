# Stuntbahn n42 – Ruckeln, langsamer Start, Pflicht-Hindernisse (26./27.10.2026)

Peter 26.10.: „ruckeln zeitweise und starten langsam“ (Handy, besonders Stuntbahn) und „Zufallsstrecken vergessen
Hindernisse“. Etappe 1 = Ruckeln + Start (eigener Release), Etappe 2 = Hindernisse (eigener Release).

## Kurz – was du am Handy merkst (Etappe 1, Version 0.15)
- **Keine Standbilder mehr, wenn die Grafik-Automatik nachregelt.** Bisher wurden beim Abschalten des Auto-Schattens alle
  Shader neu übersetzt – am Mac (CPU gedrosselt) 1,7 s Standbild, am Handy eher länger. Das war mit hoher Wahrscheinlichkeit
  das „zeitweise Ruckeln“: es passiert genau dann, wenn das Handy ins Schwitzen kommt. Jetzt: 0 Hänger über 50 ms.
- **Kein Ruck beim Losfahren, beim ersten Action-Moment, bei Kulissen, die erst mitten im Rennen ins Bild kommen, beim
  Feuerwerk im Ziel und am Ende der Zielshow** (je 0,1–0,5 s vorher). Alles wird jetzt im Ladebildschirm bzw. unsichtbar im
  Menü einmal vorbereitet.
- **Schnellerer Start:** erster Besuch (leerer Cache, Fast 4G) ~3 s schneller bis zum Menü, neue Strecke des Tages ~0,8 s.
  Die Autopilot-Prüfung der Strecke läuft jetzt nebenher; tippst du „Losfahren“, bevor sie fertig ist, steht kurz
  „Autopilot prüft die Strecke …“. Der Offline-Speicher lädt beim ersten Besuch nicht mehr alles ein zweites Mal.
- **Optik unverändert** (Standbild-Vergleich pixelgleich, Abschnitt 4).
- Bitte am Handy testen: App einmal ganz schließen und neu öffnen (neue Version), dann 2–3 Rennen fahren; achte auf
  Ruckler beim Losfahren, im Looping und im Ziel. Rückweg zum alten Verhalten (A/B): `?glatt=0`.

## 1. Wie gemessen wurde
`tests/n42_mess.py` (neu) im Profil „Mittelklasse-Android“ wie das Mess-Gate: CPU-Drossel ×4 (CDP), DPR 2,6, 915×412 quer,
Browser per `open` (keine geerbte Zeitgeber-Drossel), ein Browser zur Zeit, stumm.
- **Netz „Fast 4G“ auf dem Server** (`tests/n42_server.mjs`, neu): HTTPS + HTTP/2 + gzip + ETag/max-age=600 wie GitHub Pages,
  9 Mbit/s × 0,9 und 165 ms je Anfrage (DevTools-Werte), gemeinsame Leitung – so trifft die Drossel auch den Service Worker
  (die CDP-Netzdrossel gilt nur für die Seite). Zertifikat per SPKI-Hash als gültig (sonst speichert Chrome nichts im
  HTTP-Cache und der Vergleich wäre unfair).
- **Kaltstart** (`kalt`): (1) leerer Cache, (2) Service-Worker-Cache + neue Strecke (Prüfung läuft), (3) Service-Worker-Cache +
  bekannte Strecke. Menü sichtbar = Ladebild weg und Bilder laufen; „Losfahren“ per Klick bis das Rennen läuft. Lade-Phasen,
  Wasserfall, Long-Tasks, Server-Protokoll (was lädt doppelt), auf Wunsch JS-Profil (`--profil`, JS-Self-Profiling).
- **Rennen** (`rennen`): Autopilot fährt 180 s (zwei Neustarts wie „Nochmal“), ungedeckelt wie das Mess-Gate, Action-Momente an,
  Zufall fest (gleiche Rennen vorher/nachher). Je Bild Physik-/Zeichenzeit; je Hänger Zeitpunkt, Streckenteil und Ursache:
  neue Shader-Programme (mit Uniform-Namen), **erstes Zeichnen** je Programm/Ziel, Texturen, Geometrie, Speicherbereinigung
  (Heap-Sprung), Auflösung/Stufe der Automatik, Aufgaben außerhalb des Bilds; mit `--profil` die teuersten Funktionen.
- **Lastwechsel** (`rennen --last 14`): alle 30 s für 12 s künstliche Arbeit je Bild – die Grafik-Automatik regelt wie am
  Handy herunter und wieder hoch (am Mac allein bleibt sie oben, das Handy-Verhalten war sonst nicht sichtbar).
- **Allokationen** (`alloc`): Stichproben-Heap-Profil im Rennen, je Funktion und je auslösendem Spielcode.
- Vorher = Stand 0.14.0 (Kopie von main), im Wechsel gemessen. Der Mac hatte zeitweise Hintergrundlast (lokales
  Sprachmodell) – deshalb je Fall mehrere Runden und Median.

## 2. Messung vorher → nachher

### Rennen (180 s, CPU ×4, je 2 Läufe; `tests/perf/2026-10-26_n42_rennen_gate_rennen.json`)
| | p50 ms | p95 ms | p99 ms | Bilder > 50 ms | > 100 ms | längster Hänger |
|---|---|---|---|---|---|---|
| vorher | 5,9 / 5,9 | 8,4 / 8,5 | 9,9 / 10,1 | **4 + 3 = 7** | 3 + 2 = 5 | **275 ms** |
| nachher | 5,9 / 5,9 | 8,6 / 8,6 | 10,4 / 10,3 | **2 + 1 = 3** | **0** | **70 ms** |

Gate: > 50 ms mehr als halbiert (7 → 3) ✅, längster Hänger < 100 ms ✅. p95 8,45 → 8,6 ms (+2 %): im Rauschen dieses
Macs – im direkten Wechsel `an`/`?glatt=0` im selben Lauf 8,5 gegen 8,6 ms (`…_rennen_gc_ab.json`), ehrlich: nicht besser.

Hänger vorher und ihre Ursachen (alle behoben):
| wann | Dauer | Ursache |
|---|---|---|
| 1,7 s nach dem Start (Tempo > 80 km/h) | 133–231 ms | Endbild-Variante „Bewegungsunschärfe“ erst jetzt übersetzt + erstmals gezeichnet |
| Looping, Action-Moment | 469 + 252 ms | Endbild-Varianten mit Action-Effekt |
| Kurve, ~25 s | 284 ms | Ampel-Kulisse kommt erstmals ins Bild: Shader war übersetzt, aber **erstes Zeichnen** in das echte Ziel kostet (ANGLE/Treiber bauen die Pipeline) |
| Ziellinie | 180–275 ms | Feuerwerk-Shader + Aufbau, Text-Satz der großen Zielzeit (41 ms Schrift-Formung) |
| Ende der Zielshow | 110–140 ms | Highlight-Film in einem Stück berechnet |
| zwischendurch | 75–125 ms | Speicherbereinigung (u. a. durch Programmwechsel, unten) |

Übrig nachher: 1–2 Speicherbereinigungen je 3 min (60–70 ms, in die Physik eines Bilds gefallen).

### Rennen mit Lastwechsel (Grafik-Automatik regelt; `…_rennen_gate_last.json`, Probe davor `…_vorher_last.json`)
| | p95 | > 50 ms | > 100 ms | längster Hänger | Ursache des längsten |
|---|---|---|---|---|---|
| vorher | 19,4 ms | 3 (Probe: 6) | 2 (Probe: 4) | **556 ms** (Probe: **1727 ms**) | Auto-Schatten aus → 31–33 Shader neu |
| nachher | 19,0 ms | **0** | **0** | **42 ms** | – |

### Kaltstart bis Menü / bis das Rennen fährt (4 Runden im Wechsel, Median; `…_kalt_gate_kalt.json`, `…_kalt_gate_kalt2.json`)
| Fall | vorher Menü | nachher Menü | Klick → Rennen läuft* |
|---|---|---|---|
| leerer Cache, Fast 4G | 15,7 / 17,6 / 17,4 / 17,9 → **17,5 s** | 12,7 / 14,0 / 15,6 / 14,8 → **14,4 s** (−18 %) | 2,9–4,7 → 2,9–4,3 s |
| Cache + neue Strecke (Strecke des Tages) | 5,3 / 7,1 / 7,0 / 7,2 → **7,05 s** | 4,6 / 6,2 / 6,4 / 6,3 → **6,25 s** (−11 %) | 2,8–3,4 → 2,9–3,3 s |
| Cache + bekannte Strecke | 4,5 / 5,6 / 6,1 / 6,3 → **5,85 s** | 6,5 / 6,0 / 5,6 / 6,7 → **6,25 s** | 2,9–3,4 → 2,8–3,6 s |

\* enthält den Countdown (~2,8 s). Bekannte Strecke: im Rahmen der Streuung (4,5–6,7 s) gleich – dort gab es nichts zu
sparen (keine Prüfung, alles aus dem Cache); ehrlich: nicht schneller. Übertragen beim ersten Besuch (Server): **15,7 →
10,3 MB** (vorher lud der Vorab-Cache 10,9 MB ein zweites Mal; in der ersten Messung ohne gültiges Zertifikat sogar 17,5 MB).

Lade-Wasserfall erster Besuch (vorher): Module über 2,4 s Stufe für Stufe (124 Dateien, 1,1 MB), dann alle Assets parallel
(größte: Auto 872 kB, Landschafts-HDR 645 kB, 15 KTX2-Texturen ~3 MB, Laub-Atlas 327 kB, Ton 274 kB, Basis-Transcoder 248 kB);
Hauptthread-Blöcke im Startpfad (CPU ×4): Gelände-Netz 0,7 s, Tunnel-Attribut 0,58 s, Autopilot-Probefahrt ~1,7 s, Welt
bauen ~1 s, Schattenkarte 0,3 s.

## 3. Maßnahmen (je mit Regler zum Abschalten; `?glatt=0` = alle aus, Stand 0.14)
| Maßnahme | Regler | Wirkung |
|---|---|---|
| Auto-Schatten der Automatik ohne Shader-Wechsel: Sonne wirft weiter Schatten, nur das Auto nicht, Karte einmal leer gezeichnet und eingefroren; beim nächsten Streckenbau wieder die volle Regel | `?schattenfix=0` | 1,7 s Standbild weg |
| Vorwärmen: alle Endbild-Varianten (Unschärfe, Hitze, Action, Kantenglättung bei Renderskala < 1, Film: Tiefenschärfe, Reißschwenk) beider Grafikstufen im Hintergrund übersetzen (`compileAsync`) und je Bild eine 1 Pixel groß zeichnen; Feuerwerk-Objekt beim Laden anlegen; Text der Zielanzeige unsichtbar vorsetzen | `?vorwaermen=0` | Losfahren, Action, Stufenwechsel, Ziel ohne Ruck |
| Erst-Zeichnung: je Strecke einmal alles (auch Verstecktes: Geist, Auto-LOD, Flammen, Feuerwerk) ohne Sicht-Prüfung in 1×1-Ziele zeichnen (Kino-Format MSAA 4, Standard-Format, Bildschirm), dazu Cockpit, Spiegel, Minikarte – im Menü, 12 Bilder nachdem es steht | `?vorwaermen=0` | Kulissen mitten im Rennen ohne Ruck |
| Highlight-Film in Häppchen während der letzten Show-Bilder (Generator, je Bild ≤ 6 ms, gleiches Ergebnis) | `?filmhaeppchen=0` | Show-Ende ohne Ruck |
| Durchsichtige, beidseitige Flächen in einem Durchgang (Reifenabrieb, Ideallinie, Funken, Flammen, Regen/Blätter): three.js wechselte dafür je Bild zweimal das Programm | `?einseitig=0` | weniger Speicher-Müll |
| Material je Merkmal-Kombination (einfach/instanziert/Instanzfarbe …) eigener Klon: der Lack hing an Kulisse und Reifenstapeln, 4 Programmwechsel je Bild | `?programmfest=0` | Speicher-Müll 7,95 → 6,6 MB/s |
| Autopilot-Prüfung der Zufallsstrecke im Worker nebenher (`track/pruefung_worker.js`); entschärft er (selten), wird vor dem Losfahren die geprüfte Fassung gebaut | `?pruefung=alt` | −1,7 s bei neuer Strecke |
| Service Worker erst 2 s nach dem Menü registrieren; Vorab-Cache fragt mit ETag nach (`no-cache` statt `reload`) | `?swfrueh=1` | erster Besuch −5,4 MB |
| `modulepreload` aller Start-Module (von `tools/update_sw.py` erzeugt) | – (Liste in `index.html`) | Module parallel statt Stufe für Stufe (~0,8 s erster Besuch) |
| Ton-Aufnahmen erst nach dem Menü | `?tonfrueh=1` | 274 kB + Dekodieren aus dem Startpfad |
| Tunnel-Attribut: Hüllquader je Batch (bitgleich) | – | 0,58 s → kurz |

Nicht gemacht (bewusst): Gelände-Netz (0,7 s CPU ×4) nicht umgebaut – zu riskant für bitgleiche Strecken; Texturen nicht
weiter verkleinert (KTX2 sind es schon); Renderskala-Regler unverändert (im Lastwechsel kein Hänger mehr messbar).

## 4. Optik unverändert
`tests/n42_bild.py`: Rennen angehalten, feste Kamera und Welt-Uhr, genau ein Bild gezeichnet und direkt aus dem Zeichenpuffer
gelesen; vorher gegen nachher und nachher gegen sich selbst (`tests/shots/n42/bildvergleich*.jpg/.json`):
| Szene | mittlere Abweichung (0–255) | Pixel > 8 | Rauschen nachher/nachher |
|---|---|---|---|
| Rennen Kino | **0,000** | **0,000 %** | 0,000 |
| Rennen Standard | 0,009 | 0,067 % | 0,008 / 0,062 % (Dither) |

Zwei Funde dabei behoben: die Erst-Zeichnung verstellte die Zoom-Nachführung der Minikarte (Zustand wird jetzt gesichert),
und Minikarten-Band/Feuerwerk überlappen sich selbst – sie bleiben bei zwei Durchgängen.

## 5. Tests
- Node: alle grün, neu `tests/node/test_n42.mjs` (Film in Häppchen = Film in einem Stück; Prüfung im Worker-Weg = bisherige
  Schleife für flach/3D/Gelände; Tunnel-Attribut bitgleich; Schalter).
- Browser: `tests/smoke.py` 0 Fehler (dabei regelte die Automatik bis „Einfach“ – neuer Schatten-Weg ohne Fehler);
  `tests/test_kinoreplay.py quer`: alles grün bis auf einen Punkt, der **vorher genauso rot** ist (Serienfotos der Kamera
  „onboard“ fallen zum Teil in die nächste Einstellung) – kein Effekt von n42.

## 6. Grenzen, ehrlich
- **Kein echtes Handy gemessen.** Am Handy dauern Shader-Übersetzungen eher länger – die Hänger waren dort größer, die
  Maßnahmen wirken entsprechend stärker; die Zahlen oben sind Mac mit CPU ×4.
- Die Vorbereitung kostet einmal etwas: Erst-Zeichnung ~0,6 s (CPU ×4) kurz nachdem das Menü steht (ein kurzer Ruck im Menü
  statt mehrerer im Rennen); Vorwärmen läuft im Hintergrund.
- p95 im Rennen nicht besser (8,45 → 8,6 ms, Rauschen); bekannte Strecke startet nicht schneller.
- Restliche Hänger: große Speicherbereinigungen (1–2 je 3 min, ~65 ms). Die Physik erzeugt je Schritt Hilfsobjekte; das
  umzubauen hätte die bitgleiche Physik (Bestzeiten) gefährdet.

## Etappe 2 – Pflicht-Hindernisse in Zufallsstrecken

### Kurz – was du am Handy merkst
- **Neue Zufallsstrecken haben jetzt immer alle Hindernisse, die ihre Stufe vorsieht** (Zickzack, Röhre mit Wand,
  Spiralen-Hochstraße, Looping, Schanzen …). Vorher fehlten sie oft – flach „Irre“ hatte in **keiner** von 100 Strecken die
  volle Liste, 3D in 0–6 %.
- **Neu dabei: Teile aus dem Original**, die es bisher nur in importierten .TRK-Strecken gab: **Röhre** (große Röhre mit
  Portalen), **Autobahn** (zwei Fahrbahnen, Mittelwand), **Lücken-Sprung** (Schanze – Lücke – Landerampe, selten, braucht
  lange Geraden) und öfter der **Korkenzieher**.
- Neue Codes tragen ein **„p“** (z. B. 4711-2-gp, Strecke des Tages ebenso). **Alte Codes („h“ und ohne Zusatz) und ihre
  Bestzeiten bleiben genau gleich.** Beim ersten Start einmal ein Hinweis im Menü.
- Bitte testen: „🎲 Zufall“ ein paarmal auf „Irre“, auch im Modus Hochstraße (3D).

### Was gefunden wurde
Hermes' Zahlen bestätigt (`tools/pflicht_mess.mjs`, gleiche Seeds `s·7919+13`, 100 je Modus/Stufe; Datei
`tests/perf/n42_pflicht_vorher.json`): der Autopilot entschärft nichts – der **Generator** ließ Pflicht-Elemente aus, wenn
kein Platz war. Grund: die Pflicht-Teile brauchen mehr freie Geraden, als die Grundform hat (flach „Irre“: 8 Elemente
≈ 35 Felder mit Anlauf/Auslauf, die Strecke bietet ~34), kurze Elemente zerstückelten die Geraden für lange, und in 3D
belegen die Hochstraßen-Ausflüge die Geraden auf Ebene 0. Bei der Spiralen-Hochstraße fehlte oft der Platz neben der
Fahrbahn → nur eine einfache Brücke.

**Darstellungs-Problem?** Nein (`tools/darstellung_mess.mjs`): je Modus 30 Zufallsstrecken (Version 2 und 3) gebaut und je
Teil gezählt, ob in seinen Feldern Strecken-Geometrie liegt – **0 von 2 989 (v2) bzw. 4 943 (v3) Teilen ohne Geometrie**
(Gegenprobe mit absichtlich verschobenen Feldern schlägt an). Im Browser zusätzlich Fotos der seltenen Elemente.

### Lösung: Generator-Version 3 (Code-Zusatz „p“)
- Gleiche Pflicht-Listen wie Version 2 (`DIFFS2`, `d3V2`, `GD2`), aber sie werden erfüllt: **lange Elemente zuerst**,
  **Anläufe** (deterministisch je Code) bis die Liste ohne Ersatz erfüllt ist, alle 16 Anläufe wächst die Grundform um ein
  Feld je Seite und eine Ausbeulung; in 3D späte Anläufe mit weniger Ausflügen nach oben (weiter mehrstöckig).
- **Ersatz** nur, wenn kein Anlauf passt, und gezählt (`meta.pflicht`): Zickzack → kurzer Zickzack, Korkenzieher → Wendel
  (3D „Irre“: in 49 % der Strecken, dort fehlt auf Ebene 0 fast immer der Platz für Korkenzieher **und** zwei weitere Stunts).
- **Seltene Original-Elemente** (`src/track/selten.js`): Platzhalter im Generator, danach in die .TRK-Teile zerlegt wie beim
  Import (`tr_pipeT/tr_pipe`, `tr_hwyT/tr_hwy`, `tr_road`-Schanze + `tr_gapK` + Landerampe); in die Gewichte der passenden
  Modi/Stufen aufgenommen und je Strecke ein „Wunsch-Platz“ vor dem Auffüllen (sonst kamen sie per Gewicht kaum zum Zug).
  Crasht der Autopilot daran, wird das ganze Element zu Geraden (nie gebraucht, s. u.). Lücken-Sprünge nicht im Gelände
  (dort gibt es den Schluchtsprung).
- `?pflicht=0` = neue Strecken wieder wie Version 2 (A/B). `bump()` (Ausbeulen) prüft günstige Bedingungen zuerst –
  gleiche Zufallszahlen, alte Codes bitgleich (249/249), aber deutlich schneller (die Anläufe rufen es oft auf).

### Vorher → nachher (100 Codes je Modus/Stufe; `tests/perf/n42_pflicht_vorher.json` / `…_nachher.json`)
| Modus/Stufe | Pflicht-Liste | erfüllt vorher (v2) | erfüllt nachher (v3) | davon mit Ersatz | je Element vorher → nachher |
|---|---|---|---|---|---|
| flach Sanft | loop zigzag2 crest | 56 % | **100 %** | 0 % | loop 84→100, zigzag2 61→100, crest 93→100 |
| flach Sportlich | jump loop sbridge zigzag | 27 % | **100 %** | 0 % | jump 78→100, loop 94→100, sbridge 41→100, zigzag 13→100 |
| flach Irre | 2× jump, 2× loop, sbridge, zigzag, tube_wall, tube | 0 % | **100 %** | 0 % | jump 2→100, loop 5→100, sbridge 41→100, zigzag 24→100, tube_wall 36→100, tube 95→100 |
| 3D Sanft | loop crest waves zigzag2 | 4 % | **100 %** | 0 % | loop 52→100, crest 71→100, waves 27→100, zigzag2 7→100 |
| 3D Sportlich | jump loop waves zigzag | 6 % | **98 %** | 0 % | jump 38→100, loop 47→98, waves 64→100, zigzag 2→100 |
| 3D Irre | jump loop tr_corklr waves tube_wall zigzag | 0 % | **98 %** | 49 % | jump 31→100, loop 40→100, tr_corklr 7→49 (+49 Wendel), waves 58→100, tube_wall 29→100, zigzag 0→100 |
| Gelände Sanft | loop zigzag2 | 76 % | **100 %** | 0 % | loop 96→100, zigzag2 76→100 |
| Gelände Sportlich | loop zigzag jump | 70 % | **100 %** | 0 % | loop 94→100, zigzag 45→100, jump 95→100 |
| Gelände Irre | loop zigzag tube_wall jump tube | 46 % | **100 %** | 0 % | loop 93→100, zigzag 35→100, tube_wall 54→100, jump 93→100, tube 96→100 |

Seltene Original-Elemente (Anteil Strecken; vorher alle 0 %, nur Korkenzieher 3D Irre 7 %, Gelände Sportlich 1 %):
| Modus/Stufe | Röhre | Autobahn | Lücken-Sprung | Korkenzieher |
|---|---|---|---|---|
| flach Sanft | 16 % | 23 % | – | – |
| flach Sportlich | 15 % | 33 % | 3 % | 13 % |
| flach Irre | 55 % | – | 0 % | 20 % |
| 3D Sanft | 11 % | 11 % | – | – |
| 3D Sportlich | 4 % | 37 % | 3 % | 2 % |
| 3D Irre | 42 % | – | 1 % | 49 % |
| Gelände Sanft | 64 % | – | – | – |
| Gelände Sportlich | 15 % | 22 % | – | 16 % |
| Gelände Irre | 32 % | – | – | 18 % |

**Lösbar:** 180 Version-3-Strecken (20 je Modus/Stufe) mit Autopilot-Prüfung: alle ins Ziel, **0 Entschärfungen**; dazu die
8 Foto-Strecken mit seltenen Elementen im Browser je eine Autopilot-Runde ins Ziel, 0 Crashs, 0 Fehler
(`tests/n42_selten_fotos.py`, `tests/shots/n42/selten.jpg`).
**Bauzeit** (Mac, je Code): Gelände (Standard) Median 0,2–0,4 ms (max 3 ms), flach bis 7 ms (max 72 ms „Irre“), 3D Median
24–28 ms (max ~120 ms) – Version 2: < 2 ms. Die Prüfung läuft ohnehin im Worker; der Bau der gezeigten Strecke im Menü
kostet in 3D am Handy geschätzt bis ~0,3 s.

### Tests
`tests/node/test_n42.mjs` Teil E–I: Pflicht ≥ 95 % (40 Codes je Modus/Stufe, tatsächlich 39–40), Schlüssel („p“, „h“, ohne),
Autopilot lösbar ohne Entschärfen (je Modus/Stufe), seltene Elemente lückenlos zerlegt, gebaut, als Ganzes entschärft,
Darstellung je Teil. `test_alte_codes.mjs`: 249/249 alte Codes bitgleich; `test_hindernisse.mjs` angepasst (Standard
jetzt Version 3, Hinweis n42).

### Grenzen, ehrlich
- 3D „Irre“: in knapp der Hälfte der Strecken ist der Korkenzieher durch eine Wendel ersetzt (gezählt), 2 % ohne volle Liste;
  3D Sportlich 2 % ohne einen Looping. Ziel ≥ 95 % erreicht, 100 % nicht überall.
- Lücken-Sprünge bleiben selten (0–3 %): sie brauchen 5–6 freie Geraden am Stück, die Pflicht-Elemente haben Vorrang.
- Die Strecke des Tages hat ab jetzt den Code mit „p“ – deren Bestzeit-Liste beginnt neu (alte Codes bleiben spielbar).
