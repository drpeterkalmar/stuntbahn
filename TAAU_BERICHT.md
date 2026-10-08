# TAAU-Bericht (n31) – temporales Hochskalieren als „DLSS-Ersatz“

Stand 08.10.2026, gebaut und gemessen auf **omen16** (Arch Linux, RTX 3070 Laptop, Chromium 1243 headless über
ANGLE/Vulkan). Alle Zahlen in diesem Bericht sind **auf omen16 gemessen**, vorher und nachher mit denselben Flags – keine
Vergleiche mit alten Mac-Zahlen.

## 1. Kurzfassung

- **Gebaut und im Browser abgenommen:** TAAU als Kino-Look-Stufe `taa` auf WebGL2 (eigener Code, ein Resolve-Durchgang),
  Halton-Jitter, Reprojektion über Tiefe, Auto als Körper mit eigener Bewegung, Varianz-Clip, Disocclusion, Hochskalieren
  in die Bildschirmauflösung, negativer Mip-Bias, Autopilot-Stufe mit Rückfall auf die FXAA-Art. **Kein Ghosting am Auto**
  (Verfolger, Hubschrauber, Cockpit, Kino-Replay). Masten und Leitplanken flimmern beim Schwenk nicht mehr wie mit der
  FXAA-Art.
- **Bildqualität** (Abweichung zu einem 16-fach-Bezug, kleiner = besser): TAAU 0,7 liegt klar vor der FXAA-Art 0,65 und
  gleichauf mit MSAA 4 bei 0,7, aber deutlich hinter 1,0 + MSAA 4. „0,6–0,7 sieht aus wie 1,0“ gilt im **Standbild** fast
  (Asphaltrisse, Kanten), **in Fahrt nicht** (weicher).
- **Kosten:** Der Resolve in Ausgabeauflösung kostet so viel, wie die kleinere Renderskala spart. Füllraten-Probe 4K:
  1,0 + MSAA 4 = 5,77 ms GPU, TAAU 0,7 = 5,57 ms, MSAA 4 bei 0,7 = 3,66 ms. MSAA ist auf der GPU fast gratis, das Shading
  der Stuntbahn billig – TAAU gewinnt hier nicht pro Millisekunde.
- **Entscheidung (laut Auftrag „ehrlich, `?taa=0` als Standard lassen“):** TAAU bleibt **zuschaltbar** (`?taa=1`),
  Standard aus. Der Baustein ist sauber gekapselt und dokumentiert (`KINOLOOK.md` „TAAU in ein anderes Spiel“) – sinnvoll
  dort, wo MSAA nicht greift (Gras-/Laubkarten mit Alpha-Test) oder das Shading je Pixel teuer ist.
- Version 0.4.0. Etappen live: d76b92d (E1+E2), f434199 (E3+E4), Abschluss siehe Abschnitt 10.

## 2. Ablauf

1. Vorbau (Leicht-Spur, `vorbau/stuntbahn-n31-taau`, 4 Commits, ohne Browser) gelesen; Übergabe ist in diesen Bericht
   eingearbeitet (Abschnitt 9), die Datei `VORBAU_stuntbahn-n31-taau.md` ist entfernt. Den Vorbau-Branch löscht der Mac-Hermes.
2. **E0:** Plattform-Weiche Linux in `tests/util.py` und `tests/perf_gate.py` (ANGLE/Vulkan statt Metal, Renderer
   „ANGLE (NVIDIA, Vulkan … RTX 3070 Laptop GPU)“), Vorher-Messung auf a825539 **vor** dem Merge
   (`tests/perf/2026-10-08_vorher_omen_a.json`, `_b.json`). Commit 6b5a419.
3. Merge des Vorbaus (`--no-ff`, keine Konflikte), Node-Tests: alles grün außer den zwei bekannten Mac/Linux-Abweichungen
   (`test_gelaende` 1 von 38, `test_stuntgroesse` 7 von 99 – Gleitkomma-Referenzen vom Mac, nicht angefasst).
4. **E1+E2** (Jitter/Reprojektion, Clamp/Verwerfung) abgenommen und korrigiert → live d76b92d.
5. **E3+E4** (Hochskalieren gemessen, Autopilot) → live f434199.
6. Abschluss: Vorher/Nachher-Messung, Bericht, Doku, Version.

Die vier Etappen des Auftrags gingen als zwei Commits live (E1+E2, E3+E4): die Korrekturen aus der Abnahme stecken im
selben Shader und ließen sich nicht sinnvoll trennen. Jede Etappe wurde vor dem Push im Browser geprüft.

## 3. Was gebaut ist (Technik)

| Teil | Umsetzung | Abweichung von der Vorgabe |
|---|---|---|
| Jitter | Halton(2,3), Länge nach Renderskala (8 bei 1,0, 16 bei ≥ 0,7, 32 darunter; `?jit=`), Versatz in Render-Pixeln auf die Projektionsmatrix, nur um den Szenen-Durchlauf | 32 Phasen unter 0,7 (Vorgabe 8 oder 16): bei 0,65 braucht jedes Zielpixel mehr Phasen, um getroffen zu werden |
| Reprojektion | Tiefe + unverschobene inverse View-Projection → vorige View-Projection. Bewegung an Tiefenkanten von der vordersten der 3×3-Abtastungen, sonst von der mittleren | – |
| Bewegte Objekte | Auto als „fester Körper“ über seine Box: Weltpunkte in der Box werden mit `vorige Welt · aktuelle Inverse` des Autos reprojiziert (kein Velocity-MRT nötig). Geist als „durchsichtiger Körper“ (Strahltest, dort ≥ 50 % neues Bild) | Masken-ID statt Velocity-Puffer; Partikel/Karten nur über den Clip geschützt |
| History | HalfFloat RGBA in Bildschirmauflösung, Ping-Pong; Alpha = Tiefe der mittleren Abtastung, Vorzeichen = Körper | – |
| Clip | Varianz-Clip in YCoCg (3×3, γ 1,25, geschnitten mit Min/Max), Clip Richtung Boxmitte | – |
| Verwerfung | Bereichstest: History-Tiefe gegen [Min, Max] der 3×3-Nachbarschaft (um die Tiefenänderung verschoben), beste von 4 Texeln; Welt↔Körper-Wechsel; außerhalb/hinter der Kamera; Schnitte | Bereich statt Punktvergleich (Abschnitt 4) |
| Hochskalieren | je Zielpixel die 3×3 Render-Abtastungen an ihrer echten Lage; Beitrag zur History mit engem Kern (σ 0,35 Zielpixel), Ersatz bei verworfener History Lanczos-2 (geklemmt); History-Kern Keys-Kubik a = −0,75 (5 Zugriffe); bewegungsabhängiger Mindestanteil des neuen Bilds (0,4 × Nachkommaanteil der Verschiebung) | – |
| Mip-Bias | `mipBiasEinbauen()`: Konstante `TAA_MIP` = log2(Start-Renderskala) in den three.js-Map-Bausteinen + Fahrbahn-Detail + Gelände, beim Start vor dem ersten Übersetzen | neu (in der Vorgabe nicht genannt, für TAAU aber Pflicht) |
| Danach | Endbild liest die History, nur CAS-Nachschärfen (Kino 0,4, Standard 0,5), MSAA 0, keine FXAA-Art | – |
| Durchgänge | genau **ein** zusätzlicher Vollbild-Durchgang (Resolve) | – |
| Cockpit | Innenraum und Spiegel sind Overlay nach dem Endbild → scharf, ohne Versatz; keine eigene Maske nötig | – |
| Replay-DoF | Tiefenschärfe und Dunst lesen die unverschobene Tiefe (`uJitUv`) | – |
| Autopilot | Stufe `taa` (Kosten 0,4, gemessen), Rückfall auf die FXAA-Art; Renderskala < 0,6 → FXAA-Art; ohne HalfFloat-Ziel bisheriger Weg | – |

**URL-Regler für Peters A/B:** `?taa=0|1`, `?taaw=` (History-Gewicht 0,9), `?jit=auto|8|16|32|0`, `?taaskala=`
(Start-Renderskala), `?taasharp=`, `?taamip=` (0 = ohne Mip-Bias), `?taagamma=`, `?taadis=`, `?taacub=`, `?taamot=`,
`?taasig=`; Debug-Ansicht `?taadbg=1|2|3` (eigenes Material, kostet ohne den Regler nichts); `?gpumess=1` (GPU-Zeit bei
fester Stufe).

Beispiele: https://drpeterkalmar.github.io/stuntbahn/?taa=1 (TAAU, Kino 0,7) ·
https://drpeterkalmar.github.io/stuntbahn/?taa=1&taaskala=0.65 · https://drpeterkalmar.github.io/stuntbahn/?taa=1&taadbg=1

## 4. Abnahme im Browser – was am Vorbau falsch war

Der Vorbau-Shader übersetzte auf Anhieb fehlerfrei, das Bild war ruhig, der Jitter verschwand im Endbild (Vorzeichen
richtig). Die Debug-Ansicht (`?taadbg`) zeigte aber:

1. **Verwerfung an jeder Tiefenkante im Standbild.** Der Punkttest (Tiefe der vordersten Abtastung gegen die gespeicherte
   vorderste Tiefe) schlug an Masten, Horizont, Zaun laufend an, weil das 3×3-Fenster mit dem Jitter um ein Render-Pixel
   springt – genau dort, wo geglättet werden soll. **Fix:** History speichert die Tiefe der Abtastung nächst der
   Zielmitte, verglichen wird mit dem Tiefenbereich der Nachbarschaft (`disoBereich`, Node-Test). Danach im Standbild
   praktisch keine Verwerfung mehr.
2. **Fahrbahn unter dem Heck zählte zum Auto.** Box-Unterkante 3 cm über den Reifen (Vorbau-TODO): durch Federung und
   Neigung lag Fahrbahn in der Box und wurde mit dem Auto verschoben. **Fix:** 10 cm. (Die danach noch verworfene Fläche
   hinter dem Heck ist echte Disocclusion: Fahrbahn, die das Auto im Vorbild verdeckte – richtig so.)
3. **In Fahrt viel zu weich.** Gegen den 16-fach-Bezug war TAAU 0,65 anfangs *schlechter* als die FXAA-Art bei 0,65
   (Abweichung 4,06 gegen 3,28). Ursachen und Fixes, jeweils gemessen (Fahrt ohne Bewegungsunschärfe, 0,65):

   | Schritt | Abweichung | Schärfe | Flimmerfehler |
   |---|---|---|---|
   | Vorbau | 4,06 | 0,37 | 4,30 |
   | + History-Kern Keys a = −0,75 und Bewegungsanteil 0,2 | 3,52 | 0,52 | 4,04 |
   | + Lanczos-2 statt Gauß als Ersatzbild, Bewegungsanteil 0,4 aus dem Ersatzbild | 3,25 | 0,56 | 3,62 |
   | + negativer Mip-Bias log2(0,65) | **3,16** | 0,58 | **3,17** |
   | zum Vergleich: FXAA-Art 0,65 | 3,28 | 0,46 | 4,00 |
   | zum Vergleich: 1,0 + MSAA 4 | 1,92 | 0,98 | 2,33 |

   Die wichtigsten Einsichten: (a) Bei 0,65 trägt jedes neue Bild nur ~4 % bei, die History lebt ~25 Bilder und wird jedes
   Bild bikubisch nachgeführt – das dämpft feine Details jedes Mal ein wenig; bei halbzahliger Verschiebung am meisten.
   (b) Ohne Mip-Bias sind Texturdetails schon vor dem Jitter weg (die GPU wählt die Mipmaps für 0,65). Nicht geholfen
   haben: Bewegung immer von der mittleren statt vordersten Abtastung (gleich), breiterer Clip (gleich), engerer Kern
   σ 0,25 (gleich), stärkeres Nachschärfen (+0,03 Schärfe, sonst gleich).
4. **Debug-Code im normalen Shader** (per Uniform abgefragt, inklusive eines zweiten History-Zugriffs) → hinter
   `#define TAA_DEBUG` in ein eigenes Material.

## 5. Bildqualität

**Methode** (`tests/taau_folge.py`, `tests/taau_wertung.py`): `requestAnimationFrame` per Testhaken, jedes Bild genau
1/60 s – alle Varianten zeigen in Bild n exakt dieselbe Szene (Gegenprobe Bezug gegen sich selbst: 0,02/255). Bezug =
Renderskala 2 + MSAA 4 (16 Abtastungen je Pixel). Maße im Bildinneren (ohne HUD), Graustufen: **Abweichung** = mittlere
Differenz zum Bezug, **Schärfe** = Kantenenergie relativ zum Bezug, **Flimmerfehler** = Abweichung der Bild-zu-Bild-Änderung
von der des Bezugs. Strecke seed 4711, Verfolgerkamera, Querformat Pixel 7.

| Kino | Fahrt mit Bewegungsunschärfe „leicht“ (Standard) | Standbild (angehalten) | Schwenk über Masten (6 mm/Bild) |
|---|---|---|---|
| 1,0 + MSAA 4 (heute) | **1,70** / 0,96 / 1,97 | **1,79** / 0,93 / 1,03 | **1,82** / 0,98 / 0,93 |
| MSAA 4 bei 0,7 (Autopilot unten) | 2,60 / 0,55 / 2,54 | – | 2,82 / 0,52 / 1,23 |
| FXAA-Art 0,65 | 2,86 / 0,51 / 3,26 | 3,07 / 0,44 / 1,51 | 3,18 / 0,47 / 1,43 |
| TAAU 0,65 | 2,65 / 0,63 / 2,75 | – | 2,73 / 0,61 / 1,22 |
| **TAAU 0,7 (Start)** | 2,53 / 0,65 / 2,59 | 2,57 / 0,62 / 1,37 | 2,61 / 0,64 / 1,21 |
| TAAU 1,0 | 1,92 / 0,82 / 2,03 | 2,01 / 0,78 / 1,17 | 2,07 / 0,81 / 1,01 |

(je Zelle Abweichung / Schärfe / Flimmerfehler). **Standard** (eigener Bezug, da andere Effekte): FXAA-Art 0,84 (heute)
2,41 / 0,54 / 2,77 in Fahrt, 2,44 / 0,60 / 1,10 im Schwenk; TAAU 0,7 2,67 / 0,56 / 2,86 bzw. 2,51 / 0,66 / 1,06.

Was man sieht (selbst angesehen):
- `tests/shots/taau/stand_quer.jpg`, `stand_hoch.jpg` (Looping, Fahrbahnrand, Gras, Zaun; je Zeile volles Bild + 2×):
  im Stand bringt TAAU 0,65 Asphaltrisse und Kanten fast wie 1,0 + MSAA 4; die FXAA-Art ist sichtbar verwaschen und treppig
  am Autoumriss.
- `tests/shots/taau/fahrt_vergleich_quer.jpg`: in Fahrt ist TAAU 0,7 weicher als 1,0 + MSAA 4, ungefähr wie MSAA 4 bei 0,7.
- `tests/shots/taau/schwenk_bildwechsel_quer.jpg` (Bild-zu-Bild-Differenz ×6): bei der FXAA-Art blitzen Masten und Fahnen,
  TAAU ist dort ruhig wie der Bezug.
- `tests/shots/taau/ghosting_auto_quer.jpg`: **kein Ghosting am Auto** (K.-o.-Kriterium erfüllt), Verfolger- und
  Hubschrauberkamera, ohne Bewegungsunschärfe (nichts kaschiert). Cockpit (Instrumente/Spiegel scharf) und Kino-Replay mit
  Tiefenschärfe ohne Auffälligkeiten; im angehaltenen Replay bleibt ein Rest-Jitter von 0,2–0,3/255 (unsichtbar).
- Grenze: die winzigen Blumentupfen in den Wiesen werden zu einem schwachen Farbschimmer gemittelt (1,0 + MSAA 4 zeigt sie
  als funkelnde Einzelpixel, der Bezug deutlicher). Bei schneller Fahrt wird die Fahrbahn direkt hinter dem Heck jedes Bild
  frei (Disocclusion) und kommt dort aus dem 0,7-Bild (Lanczos) – mit Bewegungsunschärfe nicht auffällig.

## 6. Leistung

**Mess-Gate** (`tests/perf_gate.py`, Handy-Profil: CPU-Drossel ×4, DPR 2,6, 412×915 / 915×412, ungedeckelt,
A/B im Wechsel, 3 Runden, Median). Auf omen16 ist das Spiel damit **CPU-gebunden** (GPU-Zeit ~1–1,5 ms je Bild).

Standardweg (TAAU aus) gegen den Ausgangsstand a825539 – unverändert (`tests/perf/2026-10-08_ab_vorher_nachher_{1,2,3}.json`):

| Szene | hoch p95 vorher → nachher | quer p95 vorher → nachher |
|---|---|---|
| menu_kino | 7,1 → 6,5 | 5,8 → 5,7 |
| looping_kino | 4,1 → 4,1 | 4,2 → 4,5 (Einzelrunden 4,0–4,3 / 4,2–4,6) |
| rennen_kino | 7,0 → 7,0 | 7,4 → 7,3 |
| rennen_standard | 4,6 → 4,6 | 4,9 → 4,9 |
| cockpit_kino | 5,0 → 5,1 | 5,2 → 5,1 |
| replay_kino | 6,6 → 6,6 | 7,1 → 7,1 |

TAAU an gegen aus (gleicher Stand, `ab_taau_kino1.json`, `ab_taau_standard.json`, ms p95 / GPU-Median):

| Szene | aus | TAAU 0,7 | TAAU 1,0 |
|---|---|---|---|
| looping_kino hoch | 4,3 / 1,21 | 4,3 / 1,26 | 4,4 / 1,27 |
| looping_kino quer | 4,8 / 1,16 | 5,5 / 1,16 | 5,4 / 1,29 |
| rennen_kino hoch | 7,0 / 1,37 | 7,6 / 1,35 | 7,4 / 1,55 |
| rennen_kino quer | 7,5 / 1,51 | 7,6 / 1,44 | 7,4 / 1,60 |
| looping_standard hoch | 4,2 / 1,06 | 4,3 / 1,19 | – |
| looping_standard quer | 4,1 / 0,97 | 4,3 / 1,17 | – |
| rennen_standard hoch | 4,6 / 0,94 | 4,6 / 0,76 | – |
| rennen_standard quer | 5,0 / 1,01 | 5,0 / 0,81 | – |

Budget laut Auftrag: Kino p95 „gleich oder besser“ → auf omen16 gleich innerhalb der Streuung (Einzelrunden schwanken hier
um ±30 %); Standard ≤ +5 % → 0 bis +5 %. **Aber** omen16 ist CPU-gebunden – das sagt wenig über ein Handy, wo die Pixel
zählen. Deshalb zusätzlich:

**Füllraten-Probe 4K** (`tests/taau_gpu.py`: Desktop 1920×1080 bei DPR 2 → Kino-Ziel 3840×2160, Spiel angehalten,
GPU-Zeit je Abschnitt per Timer-Abfrage):

| Kino | gesamt | Szene | Resolve |
|---|---|---|---|
| 1,0 + MSAA 4 (heute) | 5,77 ms | 4,54 ms | – |
| MSAA 4 bei 0,7 | 3,66 ms | 2,58 ms | – |
| TAAU 0,7 | 5,57–5,70 ms | 2,21 ms | 2,25–2,35 ms |
| TAAU 0,85 | 6,33 ms | 2,94 ms | – |
| TAAU 1,0 | 7,27 ms | 3,90 ms | 2,29 ms |
| **Standard** FXAA-Art 0,84 (heute) | 2,13 ms | 1,61 ms | – |
| **Standard** TAAU 0,7 | 2,95 ms (+38 %) | 1,19 ms | 1,28 ms |

Die Szene halbiert sich bei 0,7 wie erwartet, aber der Resolve frisst die Ersparnis: TAAU 0,7 kostet so viel wie
1,0 + MSAA 4 und sieht schlechter aus; gegen MSAA 4 bei 0,7 (gleiche Bildqualität) ist TAAU ~50 % teurer. Auf Standard
reißt TAAU das +5-%-Budget bei GPU-Last deutlich. Der Resolve ist mit ~0,15–0,3 ns je Ausgabepixel in der Größenordnung
von FSR 2 – kein Fehler, sondern der Preis von TAAU in Ausgabeauflösung. Aufgeschlüsselt (Abwandlungen des Shaders, nur
im Browser, `PATCH=`): leerer Durchgang 0,20 ms, + 3×3-Schleife 0,26 ms, bis zum Weltpunkt 0,6 ms; Debug-Code −0,06,
History bilinear statt bikubisch ±0, Disocclusion 1 statt 4 Texel −0,17, ohne Tiefenzugriffe −0,2, ohne Körpertests
−0,3 ms – die Kosten verteilen sich, es gibt keinen einzelnen Übeltäter, der eine Halbierung brächte.

Autopilot (`tests/test_autopilot.py "&taa=1"`, künstliche Last): ohne Last ruhig, Last → erster Schritt nach 1,2 s, nach
20 s alles unten (TAAU → FXAA-Art, Stufe Einfach), Last weg → nach 2,6 s rauf, volle Qualität inkl. TAAU nach 52 s, an der
Kante kein Pendeln, 0 Fehler. Ohne TAAU unverändert ALLE OK.

## 7. Entscheidung

`?taa=0` bleibt Standard (Presets Standard/Kino ohne `taa`), TAAU ist per `?taa=1` bzw. `?kl=+taa` zuschaltbar und
vollständig abgenommen. Begründung: auf beiden gemessenen Achsen (Bild je Millisekunde) ist der heutige Weg besser –
Kino mit MSAA 4 (1,0 oder vom Autopilot bis 0,7), Standard mit der FXAA-Art bei 0,84. Ghosting war kein Problem.

Was es bräuchte, damit TAAU hier gewinnt: ein Resolve unter ~1 ms bei 4K (z. B. Farbe und Tiefe in einem Ziel, weniger
Zugriffe, Halbe-Auflösung-Statistik) **und** teureres Shading – oder ein Gerät, auf dem MSAA teuer ist. Auf einem echten
Handy ist das nicht gemessen (kein Gerät auf omen16); dort wäre der erste Test `?taa=1` gegen `?taa=0` mit `?gpumess=1`.

## 8. Grenzen und offene Punkte

- Partikel, Rauch, Feuerwerk, Zuschauer-Karten haben keine Bewegungsdaten; nur der Clip schützt (im Bild keine
  Schlieren gesehen, Feuerwerk der Zielshow nicht eigens geprüft).
- Bloom und die halbe Unschärfe lesen weiter das verschobene Bild (niedrige Frequenz, nicht sichtbar).
- `tests/taau_shots.py` (Vorbau): `stand` benutzt; `schwenk`/`fahrt` laufen in Echtzeit und sind nicht deterministisch –
  für Vergleiche `tests/taau_folge.py` nehmen.
- Im Kino-Look ist der Resolve teurer (2,3 ms) als auf Standard (1,3 ms) bei gleicher Ausgabegröße – vermutlich das
  HalfFloat-Szenenziel als Eingang; nicht weiter verfolgt.

## 9. Vorbau (Leicht-Spur) – eingearbeitet

Der Vorbau (`vorbau/stuntbahn-n31-taau`, e90db39 … be9b9e6) hatte ohne Browser gebaut: `kern/taau_mathe.js` (Halton,
Projektions-Jitter, Reprojektion inkl. Körper, YCoCg-Clip, Disocclusion, Einsatz-Entscheidung, CPU-Referenz des Resolves
mit Simulation „Zaun bei 0,65“), `kern/taau.js` (Klasse `TAAU`, Resolve-Shader, History), Anschluss im Kino-Look (Stufe
`taa`, Presets `taaScale`/`taaSharpen`, Tiefe für Dunst/DoF unverschoben), Autopilot-Stufe, URL-Regler, Node-Tests mit
Renderer-Attrappe, `tests/taau_shots.py`, KINOLOOK-Abschnitt. Alles davon lief im Browser auf Anhieb; geändert wurden die
Punkte in Abschnitt 4 sowie Autopilot-Kosten 0,05 → 0,4. Die CPU-Referenz `taauReferenz` ist mitgezogen (Bereichstest,
Lanczos-Ersatzbild); Simulation „Zaun bei 0,65“ jetzt 0,0192 gegen 0,0228 vorher (1,0 + MSAA 4: 0,0156). History-Kern
und Bewegungsanteil sind nur im Shader (die CPU-Simulation bewegt in ganzen Pixeln). Nicht angefangen (wie im Vorbau
begründet): Velocity-MRT für Partikel, eigene Behandlung der Nitro-Flammen.

## 10. Tests und Live

- Node: `npm run test:node` – alles grün außer den zwei bekannten Mac/Linux-Abweichungen (unverändert). Neu/erweitert:
  `test_taau.mjs` (Bereichstest, Lanczos), `test_taau_kino.mjs` (Mip-Bias-Einbau, Box 10 cm, Kosten 0,4).
- Browser (omen16, Vulkan): `tests/smoke.py`, `tests/test_kinolook.py` (ALLE OK), `tests/test_autopilot.py` mit und ohne
  TAAU (ALLE OK), `tests/test_live.py` nach E1+E2 (0 Fehler, offline spielbar).
- Live: E1+E2 Build d9f8ede91f (d76b92d), E3+E4 (f434199); Abschluss-Build siehe Commit „n31 Abschluss“.

## 11. Dateien

`src/gfx/kern/taau.js`, `src/gfx/kern/taau_mathe.js`, `src/gfx/kinolook.js`, `src/gfx/materials.js` (`TAA_MIP`),
`src/main.js` (Regler, Mip-Bias beim Start, `?gpumess`), `tests/taau_folge.py`, `tests/taau_wertung.py`,
`tests/taau_gpu.py`, `tests/taau_shots.py`, `tests/perf_gate.py` (GPU-Zeit, Linux-Weiche), `tests/util.py`,
`tests/test_autopilot.py`, `tests/perf/2026-10-08_*`, Collagen `tests/shots/taau/*.jpg`, `KINOLOOK.md`,
`src/gfx/kern/LIESMICH.md`, `README.md`.
