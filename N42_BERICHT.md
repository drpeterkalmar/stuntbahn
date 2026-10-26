# Stuntbahn n42 – Ruckeln, langsamer Start, Pflicht-Hindernisse (26./27.10.2026)

Peter 26.10.: „ruckeln zeitweise und starten langsam“ (Handy, besonders Stuntbahn) und „Zufallsstrecken vergessen
Hindernisse“. Etappe 1 = Ruckeln + Start (eigener Release), Etappe 2 = Hindernisse (eigener Release).

## Kurz – was du am Handy merkst (Etappe 1)
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

## Etappe 2 – Pflicht-Hindernisse
(folgt)
