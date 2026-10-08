# Stuntbahn n30 – Technik-Nacht „Forza-Look bei 60 fps am Handy“ + gemeinsamer Grafik-Kern (08.10.2026)

Peters Auftrag (05.10.): „Überlege, wie wir Stuntbahn Details bekommen wie Forza … bei flüssiger Webapp-Leistung.“
Grundlage: `~/.hermes/plans/grafik-audit-spiele.md` (Abschnitt Stuntbahn, Maßnahmen #1, #2, #4–#9) und
`grafik-tricks-katalog.md`. Spielmechanik, Physik, Steuerung, Bestzeiten und Streckencodes sind unverändert (alle 39
Node-Tests grün, Rennen bis ins Ziel live geprüft). WebGL2 bleibt, kein WebGPU, kein TAAU (kommt in n31).

## Kurz – was du am Handy siehst
- **Der Lack spiegelt die Strecke** (Grafik „Kino“): Horizont, Fahrbahn und Hügel laufen beim Fahren über den
  Klarlack, statt nur ein milchiger Himmel. Das Auto ist so hell wie vorher, nur satter. Auf „Standard“ aus (zu teuer, s. u.).
- **Bäume sind plastisch** (Standard und Kino): Tannen, Laub-, Köcher-, Insel- und Jacaranda-Bäume sind keine gekreuzten
  Bildkarten mehr, sondern sehen aus jedem Blickwinkel wie ein echter Baum aus, mit Licht und Schatten von der Sonne. Im Winter
  tragen sie Schnee, im Herbst ist nur das Laub bunt. Ganz nah (unter ~15 m) wirken sie etwas weicher als die alten Karten.
- **Asphalt nah** hat feines Korn und glatter gefahrene Spurrinnen (Verfolger, Stoßstange, Cockpit).
- **Die Grafik regelt sich besser selbst**: Kino bleibt die Startstufe. Beim allerersten Start misst das Spiel im
  Ladebildschirm 20 Bilder und startet gleich mit der passenden Auflösung (danach merkt es sich das Gerät). Wird es eng, nimmt
  der neue Autopilot schrittweise Auflösung, Deko, Lack-Spiegelung, Auto-Schatten und erst zuletzt die Stufe zurück – und
  **holt sie wieder**, wenn Luft ist (die alte Automatik ging nur nach unten). Im Energiesparmodus (Bildrate auf 30 gedeckelt)
  regelt er nicht mehr sinnlos herunter.
- **Ladegröße kleiner**: erster Besuch gzip 7,15 → 7,03 MB, alles zusammen (mit allen Landschaften) roh 21,9 → 17,7 MB.
- **Bildzeit** (Handy-Profil, vorher/nachher im Wechsel gemessen): **Kino** in allen Szenen gleich oder schneller (bis −32 % im
  Cockpit), **Einfach** gleich, **Standard** 0,1–0,4 ms langsamer (+2 bis +7 %) – knapp über dem Budget, Erklärung in Abschnitt 2.
  Draw-Calls am Looping (Kino) im Mittel 81–79 (vorher 82–80; im Rennen Kino 94–109, Grenze 120).
- Live: https://drpeterkalmar.github.io/stuntbahn/ – Build siehe Abschnitt 8.

## 1. Wie gemessen wurde – und eine wichtige Entdeckung
**Mess-Gate** `tests/perf_gate.py` (Grafik-Kern, Baustein 1): Playwright, Profil „Mittelklasse-Android“ – CPU ×4
gedrosselt, Pixeldichte 2,6, 412×915 hochkant und 915×412 quer, je Szene 10 s; p50/p95 der Bildzeit, Draw-Calls,
Dreiecke, Texturen; Ergebnis als JSON in `tests/perf/`. Die Szenen stehen in `tests/perf_szenen.json` (nur diese Datei
kennt die Stuntbahn): Menü, Start (erste 10 s), Looping Kino und Standard, Rennen Kino/Standard/Einfach, Cockpit, Replay,
Rennen mit Grafik-Automatik.

**Entdeckung:** Die Bildraten aller bisherigen Headless-Messungen auf diesem Mac waren verfälscht. Ein Browser, der aus der
Coding-Queue heraus gestartet wird, erbt von macOS eine starke Zeitgeber-Drosselung: selbst eine **leere Seite** lief nur mit
15 Bildern/s, `time.sleep(0,05)` dauerte 143 ms. Das ist kein Grafik-, sondern ein Prozess-Problem (Hintergrund-Herkunft
des Prozessbaums). Abhilfe: Browser per `open` als normales Programm starten und über CDP verbinden → 60 Bilder/s.
Außerdem sättigte p95 mit 60-Hz-Deckel bei 16,7 ms (alles „flüssig“, keine Unterschiede sichtbar). Das Gate misst deshalb
ohne Deckel: die Bildzeit ist dann die echte Arbeit je Bild. Und weil der Mac nebenher arbeitet (dieselbe Variante
schwankte zwischen zwei Läufen bis ±40 %), vergleicht der **Wechsel-Modus** `--ab` vorher und nachher Runde für Runde
abwechselnd und nimmt je Variante den Median aus 3 Runden. Die Zahlen in DEKO_BERICHT.md (n28) und früher stammen aus der
gedrosselten Umgebung – ihr relativer An/Aus-Vergleich bleibt brauchbar, die absoluten Bildraten nicht.

Was die Zahlen bedeuten: Auf dem Mac (M1) ist die Stuntbahn **durch die Grafik begrenzt** (Kino ≈ 6–8 ms je Bild); die
CPU-Drosselung ×4 verlängert die Bildzeit nur wenig. Ein Mittelklasse-Handy hat eine 4–6× schwächere Grafik – die
absoluten Werte übertragen sich also nicht 1:1, die Verhältnisse vorher/nachher schon. **Ein echtes Handy habe ich nicht
gemessen.**

## 2. Messung vorher → nachher
Vorher = Stand 7ab9f75 (n28, als zweite Kopie `~/dev/stuntbahn_vorher`), nachher = dieser Stand; im Wechsel gemessen,
Median aus 3 Runden, Bildzeit in ms (kleiner = besser), Datei `tests/perf/2026-10-08_vorher_nachher.json`.

| Stufe | Szene | Gerät | p50 vorher → nachher | **p95 vorher → nachher** | Δ p95 | Draw-Calls vorher → nachher (Mittel) |
|---|---|---|---|---|---|---|
| Kino | Menü | hoch | 6,6 → 6 | 7,8 → **7,7** | -1 % | 81 → 93 |
| Kino | Menü | quer | 6,7 → 6,1 | 7,9 → **8** | +1 % | 85 → 97 |
| Kino | Start, erste 10 s | hoch | 6,7 → 6,1 | 7,8 → **7,8** | +0 % | 82 → 95 |
| Kino | Start, erste 10 s | quer | 6,7 → 6,2 | 7,9 → **7,9** | +0 % | 86 → 99 |
| Kino | Looping ¹ | hoch | 6,1 → 5,5 | 7,6 → **6,8** | -11 % | 82 → 81 |
| Kino | Looping ¹ | quer | 5,5 → 4,8 | 6,7 → **6,3** | -6 % | 80 → 79 |
| Kino | Rennen | hoch | 7,7 → 7,1 | 10,6 → **9,9** | -7 % | 84 → 94 |
| Kino | Rennen | quer | 8,1 → 7,7 | 11 → **10,3** | -6 % | 99 → 109 |
| Kino | Cockpit | hoch | 9,2 → 8,4 | 17 → **11,5** | -32 % | 75 → 73 |
| Kino | Cockpit | quer | 9,8 → 9,1 | 18,5 → **16,1** | -13 % | 81 → 79 |
| Kino | Replay | hoch | 8,1 → 7,7 | 10 → **9,3** | -7 % | 83 → 94 |
| Kino | Replay | quer | 8,4 → 8,2 | 10,4 → **9,8** | -6 % | 97 → 107 |
| Standard | Looping ¹ | hoch | 3,7 → 3,8 | 4,4 → **4,5** | +2 % | 79 → 79 |
| Standard | Looping ¹ | quer | 3,6 → 3,7 | 4,3 → **4,4** | +2 % | 77 → 77 |
| Standard | Rennen ¹ | hoch | 3,6 → 3,8 | 5,2 → **5,3** | +2 % | 81 → 82 |
| Standard | Rennen ¹ | quer | 4 → 4,3 | 5,5 → **5,9** | +7 % | 96 → 96 |
| Einfach | Rennen | hoch | 2,3 → 2,6 | 3,7 → **4** | +8 % | 54 → 54 |
| Einfach | Rennen | quer | 2,5 → 2,6 | 4 → **4** | +0 % | 66 → 66 |
| automatisch | Rennen, Automatik | hoch | 7,4 → 7 | 10,4 → **9,9** | -5 % | 84 → 95 |
| automatisch | Rennen, Automatik | quer | 8,2 → 7,2 | 11,2 → **9,6** | -14 % | 97 → 109 |

¹ nach den letzten Korrekturen (Vertex-AO nur Kino, Impostors auf Standard mit einer Ansicht, Spiegelung pausiert kopfüber)
neu gemessen (`tests/perf/2026-10-08_vorher_nachher_2.json`); die übrigen Zeilen aus dem großen Lauf
(`…_vorher_nachher.json`, vor diesen Korrekturen – sie wirken dort nicht oder nur in Richtung schneller).

**Je Stufe:** **Kino** in allen Szenen gleich oder schneller (p95 −1 bis −32 %; SSAO fällt weg, die Spiegelung kostet
weniger als das). Im Looping pausiert die Spiegelung, weil das Auto kopfüber steht – Rennen, Menü, Start und Replay
enthalten sie. **Einfach** gleich (Einzelrunden 3,9/5,0/4,0 gegen 4,3/3,7/3,7 ms – Rauschen). **Standard** knapp nicht
erfüllt: Looping +2 %, Rennen +2 % (hoch) bzw. +4–7 % (quer), das sind 0,1–0,4 ms. Aufgeschlüsselt
(`…_ab_std*.json`): erst der Autopilot-Rahmen, die Auto-LOD-Umschaltung und die Impostors **zusammen** abgeschaltet ergeben
wieder genau „vorher“; jeder Posten allein liegt mit ~0,05–0,1 ms im Messrauschen. Das sind Kernstücke des Auftrags, ich
habe sie nicht zurückgedreht – A/B für Peter: `?autopilot=0&lod=0&impostor=0`. Am Handy entscheidet ohnehin der
Autopilot: in der Szene „Rennen, Automatik“ ist nachher 5–14 % schneller.
**Draw-Calls:** Kino in Rennen/Menü/Replay +10–12 im Mittel durch die Spiegelseite (94–109, Grenze 120), Looping gleich
(Spiegelung pausiert kopfüber), Cockpit −2, Standard/Einfach gleich.

**Ladegröße** (`tools/ladegroesse.py`, gzip Stufe 6; zählt nur, was das Spiel wirklich lädt):

| | vorher | nachher |
|---|---|---|
| erster Besuch (Vorab-Cache), roh / gzip | 10,15 / 7,15 MB | 9,79 / **7,02 MB** |
| Landschafts-Pakete (bei Bedarf), roh / gzip | 11,73 / 8,68 MB | 7,88 / 7,06 MB |
| **gesamt roh / gzip** | 21,87 / 15,83 MB | **17,67 / 14,08 MB (−4,2 / −1,75 MB)** |

Die HDR-Diät spart 6,1 MB roh. Dazu kommen Auto-LOD (+0,4 MB) und Impostor-Atlanten (+1,4 MB für 9 Baumarten, erst
2,9 MB, dann Normalen in halber Auflösung). Das Ziel „−5 MB“ ist mit −4,2 MB knapp verfehlt, weil die Bäume Daten
mitbringen. Keine neuen externen Abrufe; Service Worker mit neuer Version (Cache-Busting).

## 3. Etappen – was gebaut, was abgenommen, was korrigiert
Der Leicht-Spur-Job `stuntbahn-n30-vorbau` hatte ohne Browser vorgearbeitet (Branch `vorbau/stuntbahn-n30-technik`, 13
Commits, Übergabe `VORBAU_stuntbahn-n30-technik.md`). Ich habe zuerst auf main gemessen, dann gemergt (**keine Konflikte**),
jede vorgebaute Sache im Browser abgenommen und korrigiert, was durchfiel. Die Übergabe-Datei ist hier eingearbeitet und
aus dem Repo entfernt, der Branch gelöscht.

### E0 Mess-Gate
Vorbau: Gate + Szenen fertig, aber nie gelaufen. Abnahme: läuft, aber erst nach den Korrekturen aus Abschnitt 1
(Start per `open`, ohne 60-Hz-Deckel, Warte-Schleifen im Browser statt tausender Einzelaufrufe – sonst dauerte eine
Looping-Szene ~9 min –, A/B-Wechsel-Modus, `blob:`-Adressen nicht als „extern“). Neue Szenen: Start, Rennen
Standard/Einfach.

### E1 Sofort-Gewinne
| Teil | Abnahme | Ergebnis |
|---|---|---|
| HDR-Diät 512×256, Halbfloat | je Landschaft Lack + Himmel gegen `?hdr=1k` (`hdr_quer_a/b.jpg`) | mittlere Abweichung 0,13–0,31 von 255 – nicht sichtbar ✅ |
| Start-Kurzmessung | Ladezeit, Ergebnis `__app.startProbe` | +1,5 s beim allerersten Laden (Mac), dann gespeichert; Mac: Skala 1,0 ✅ |
| Heldenauto-LOD | Collage `lod_quer.jpg` | ❌ Mittel/Fern hatten **silberne Flecken im Lack** (alte Normalen nach dem Vereinfachen) → neu gebaut mit meshopt `simplifyWithAttributes` (Normalen + UVs im Fehlermaß): 15,8 k / 8,7 k Dreiecke, sauber ✅ |
| Schattenkamera eng, 1024 | `schatten_quer.jpg` | Bild gleich wie bisher 2048 (Abweichung 0,01/255) ✅ |
| Fahrbahn-Detail | `detail_quer.jpg` (Ausschnitte) | feines Korn, Spurrinne leicht glänzend, kein Moiré, kostet nichts Messbares ✅ |

### E2 Qualitäts-Autopilot
Vorbau: Logik + Node-Test mit künstlichem Gerät. Neu: **`tests/test_autopilot.py`** im echten Browser (künstliche Arbeit
je Bild über `__app.testLast`): ohne Last 10 s keine Umschaltung · schwere Last → erster Schritt nach unten nach
**1,2 s** · Last weg → erster Schritt nach oben nach **2,9 s** (erst 3,15 s → „rauf“ nach 5 statt 6 guten Messfenstern) ·
nach 43 s wieder volle Qualität · an der Kante kein Pendeln · 0 Fehler. Zusätzlich: Ist die Bildrate niedrig, die gemessene
Arbeit (CPU und GPU) aber unter der Hälfte des Bildtakts, ist sie von außen gedeckelt (Energiesparmodus, 30-Hz-Bildschirm)
→ kein Herunterregeln (Node-Test). Die Bildrate wird auch bei fester Stufe weiter mitgeführt (`info().fps`).
GPU-Zeit (`EXT_disjoint_timer_query_webgl2`) liefert headless-Chrome auf dem Mac; viele Android-Geräte geben sie nicht frei –
dann regelt er wie bisher nach Bildrate, nur mit Hysterese und Sperre gegen Pendeln.

### E3 Forza-Eindruck
| Teil | Abnahme | Ergebnis |
|---|---|---|
| Dynamische Lack-Spiegelung | Draw-Calls, A/B, Fotos `reflex_quer.jpg` | ❌ Vorbau-Fassung: Draw-Calls 81 → 161 (Grenze 120), WebGL-Warnung (Schattenkarte fehlte beim ersten Bild), Auto dunkler (8-bit-Himmelsbild statt HDR), p95 Kino +30–50 % durch das Vorfiltern jedes 6. Bild. **Neu gebaut:** nur große Flächen spiegeln (eigene Ebene, 150 m), Würfel mit Mipmaps statt Vorfiltern, nur die Klarlack-Schicht liest ihn, Himmel darin ×3, an/aus ohne Shader-Neuübersetzung, Vorwärmen im Ladebildschirm. Ergebnis Kino **+0–3 % p95**, Standard +26–31 % → **nur auf Kino** (Regel des Auftrags: über +8 % nur Kino) ✅ |
| Bäume als Oktaeder-Impostors | Atlanten gebacken, Fotos nah/fern je Landschaft (`baeume_quer.jpg`), A/B | ❌ vier Fehler: Atlas-Textur vom Dateinamen überschrieben (Start brach ab), Themenbäume 14-fach gestreckt, Schnee nur auf einer Baumhälfte (Normalen beim Backen falsch gedreht), Herbstfarbe auch am Stamm; die selbst gebaute 3D-Tanne war zu licht (44 statt 30 Quirle, breitere Äste). Alle behoben. Kosten **p95 ±1 %, +1–2 Draw-Calls** ✅. Palmen bleiben Karten (kein Modell). |
| Gebackene Vertex-AO | Fotos an Röhre, Wand, Brücke, Looping (`vao2_quer.jpg`) | ❌ Brückenfahrbahn wurde fast schwarz (Strahlen trafen die Rückseite der Kollisionsfläche) und auch danach dunkelgrau (die Fahrbahn hat quer nur Ecken am Rand – Banden- und Bogenverdeckung verschmierte über die Spur). **Jetzt:** nur Vorderseiten, Fahrbahn/Randstein ohne Vertex-AO; Wände, Röhre, Looping-Unterseite, Pfeiler mit. Wirkung dezent, ähnlich wie SSAO. Danach **SSAO auf Kino aus** (`?vao=0` = SSAO wie bisher) – das bezahlt die Lack-Spiegelung. Standard bekommt die Bauwerks-AO gratis ✅ |

## 4. Fotos (selbst angesehen, ehrliche Bewertung)
`tests/shots/technik/`:
- `hdr_quer_a.jpg`, `hdr_quer_b.jpg` – je Landschaft Lack und Himmel, links bisher (1k), rechts neu (512): kein Unterschied zu sehen.
- `lod_quer.jpg` – Auto in Stufe 0/1/2 und automatisch, 6/30/70 m: Stufe 1/2 aus 6 m etwas kantiger, ab 25 m nicht zu unterscheiden.
- `schatten_quer.jpg`, `detail_quer.jpg` – gleich bzw. feines Korn nah.
- `reflex_quer.jpg` – mit Spiegelung: Horizont und Fahrbahn im Lack, Farbe satter. Klar besser.
- `baeume_quer.jpg` – Karten gegen Impostors je Landschaft nah/fern; aus Fahrersicht ähnlich, aus der Nähe plastischer.
- `vao_quer.jpg`, `vao2_quer.jpg` – AO-Varianten: Unterschied klein (Banden-Innenseiten, Looping-Unterseite).
- Abschluss-Collagen hoch und quer: `looping_hoch/quer.jpg` (vorher-Look gegen n30), `reflex_hoch/quer.jpg`, `baeume_hoch/quer.jpg`, `detail_hoch/quer.jpg`.

## 5. A/B-Links für Peter
| Link | zeigt |
|---|---|
| https://drpeterkalmar.github.io/stuntbahn/?reflex=0 | ohne Lack-Spiegelung (`?reflex=1`: auch auf Standard) |
| https://drpeterkalmar.github.io/stuntbahn/?impostor=0 | Bäume als alte Karten |
| https://drpeterkalmar.github.io/stuntbahn/?detail=0 | Fahrbahn ohne Korn/Spurrinnen |
| https://drpeterkalmar.github.io/stuntbahn/?vao=0 | ohne gebackene AO, Kino mit SSAO wie bisher |
| https://drpeterkalmar.github.io/stuntbahn/?lod=0 | Auto immer volles Modell |
| https://drpeterkalmar.github.io/stuntbahn/?autopilot=0 | alte Grafik-Automatik |
| https://drpeterkalmar.github.io/stuntbahn/?hdr=1k | alte große Umgebungs-HDRs |
| https://drpeterkalmar.github.io/stuntbahn/?schattenkam=0 | alte Auto-Schattenkarte (±7 m, Kino 2048) |
| https://drpeterkalmar.github.io/stuntbahn/?startprobe=0 | ohne Start-Kurzmessung |
| https://drpeterkalmar.github.io/stuntbahn/?reflex=0&impostor=0&detail=0&vao=0&lod=0&hdr=1k&schattenkam=0 | ungefähr der Look vor n30 |

Handy: App einmal ganz schließen und neu öffnen (neuer Service Worker).

## 6. Grafik-Kern `src/gfx/kern/` – zum Kopieren in Bandenkick und Schmetterlingswiese
Ausführlich: `src/gfx/kern/LIESMICH.md`. In drei Zeilen je Baustein:
- **Mess-Gate** (`tests/perf_gate.py`): Datei unverändert kopieren, eine eigene `perf_szenen.json` schreiben (Szenen als
  URL + Schritte). Vorher-Stand als zweite Kopie (`git worktree add`), dann `--ab vorher=../alt:: --ab nachher=`.
  Startet den Browser auf dem Mac selbst per `open` (sonst falsche 15 Bilder/s) und misst ohne 60-Hz-Deckel.
- **Autopilot + Kurzmessung** (`kern/autopilot.js`, `kern/startprobe.js`): Bandenkick `autoQuality()` bzw.
  Schmetterlingswiese `Renderer.sample()` ersetzen; je abschaltbarer Sache `ap.register(name, kosten, setzer)`, je Bild
  `ap.bild(dt, cpuMs, gpu.ms)`. Vorlage für den Anschluss: `src/gfx/quality.js` und `startAutopilot()` in `src/main.js`.
- **Asset-Kette** (`tools/hdr_diaet.mjs`, `tools/build_assets.mjs --car-mid`): HDR → 512×256 mit gekappter Sonne (reines
  Node); Modell-LOD mit `simplifyWithAttributes` (Normalen + UVs im Fehlermaß, sonst fleckiger Lack). Pfade oben im Skript anpassen.
- **Impostor-Bäcker** (`kern/oktaeder.js`, `kern/impostor.js`, `tools/build_impostor.{mjs,html,py}`): Modelle in
  `tools/impostor_modelle.mjs` eintragen, `python3 tools/build_impostor.py` backt 8×8 Ansichten; zur Laufzeit
  `ImpostorBibliothek` + `impostorMesh()` (1 Draw-Call je Art). Bandenkick: Häuser, Schmetterlingswiese: ferne Tiere/Bäume.
- Dazu `kern/reflex.js` (Lack-Spiegelung) mit den Lehren aus Abschnitt 3.

## 7. Was in n31 (TAAU) kommt
Temporales Hochskalieren als neue Kino-Look-Stufe: Halton-Versatz der Kamera, Rückprojektion über Tiefe und
Kameramatrix (die Welt ist statisch), Auto per Maske ausgenommen, Nachbarschafts-Begrenzung. Ersetzt Kantenglättung +
MSAA 4 auf Kino; Renderskala 0,6–0,7 soll aussehen wie 1,0. Gemessen wird mit demselben Gate (`--ab`). Der Autopilot hat
die Stellschraube dafür schon (Renderskala stufenlos).

## 8. Offen, Grenzen, ehrlich
- **Kein echtes Handy gemessen.** Der Mac ist grafikbegrenzt; die CPU-Drosselung ×4 bildet ein Handy nur teilweise ab.
- **Budget Standard knapp gerissen** (+2 bis +7 % p95, 0,1–0,4 ms; Abschnitt 2). Kino und Einfach halten es.
- Lack-Spiegelung pausiert, solange das Auto kopfüber steht (Looping, Korkenzieher) – der letzte Würfel bleibt stehen.
- Vertex-AO nur auf Kino (auf Standard kostete sie 0,2 ms bei kaum sichtbarer Wirkung; `?vao=1` erzwingt sie).
- Impostor-Bäume sind aus der Nähe (< 15 m) weicher als die Karten (128 px je Ansicht). Ein echtes Nahmodell (Auftrag:
  „darf bleiben“) habe ich nicht gebaut. Palmen bleiben Karten.
- Die Vertex-AO wirkt nur dezent; auf der Fahrbahn gar nicht (bewusst, s. o.).
- Lack-Spiegelung nur auf Kino; auf Standard per `?reflex=1` testbar.
- Start-Kurzmessung: der Faktor Rennen/Menü (`szenenFaktor`) steht auf 1,0 – am echten Gerät abstimmen.
- Das Gutachten aus `burn-stuntbahn-2026-10-05` gibt es nicht: der Job wurde am 06.10. wegen der Burn-Frist abgebrochen,
  bevor er lief (`docs/audit/` existiert nicht). Ich habe ohne gearbeitet.
- Ladegröße −4,2 MB statt −5 MB (Bäume bringen 1,4 MB mit).
- Live: <<LIVE>>
