# Motor- und Crashgeräusche aus Aufnahmen (n16, 30.09.2026)

Wunsch (Peter, 28.09.): „Motorgeräusche und Crashgeräusch verbessern.“ Maßstab sind moderne Rennspiele: Der Motor soll nach
echtem Rennwagen klingen, der Crash nach Blech und Karbon statt nach Synthesizer.

## Was neu klingt

| | bis n15 (Synthesizer) | jetzt (Aufnahmen) |
|---|---|---|
| **Motor** | V12 aus Sinus-Obertönen, 4 Loops | Echter Motor auf dem Prüfstand. 6 Loops unter Last, 3 im Schiebebetrieb, dazu der Leerlauf. Jeder Loop ist in der Tonhöhe geglättet, zwischen den Loops wird überblendet, die Tonhöhe folgt der Drehzahl. |
| Gangwechsel | Drehzahl springt nur | Hochschalten: kurze Zündunterbrechung (85 ms), manchmal ein Knall. Runterschalten: Zwischengas. |
| Gas weg | leiser | Eigene Schiebebetrieb-Loops (dunkler) und 2–4 Fehlzündungen nach schnellem Gaswegnehmen, danach vereinzelt weitere. |
| Drehzahlbegrenzer | – | An der Höchstdrehzahl mit Vollgas setzt die Zündung im 17-Hz-Takt aus. |
| Nitro | helles Zischen | eigene, dunklere Fauch- und Grollschicht, dazu wird der Motor lauter |
| Cockpit | wie außen | Innenraum-Klang: Motor gedämpft (Tiefpass 1,3 kHz), Wind und Reifen leiser |
| **Crash** | Rauschen, Sinus-Wumms, 4 Dreieckstöne | Nach Schwere geschichtet: Aufprall-Wumms und Motorhaube immer, Blech-Knirschen ab mittel, rieselnde Trümmer ab mittel-schwer, Glas nur bei schweren Crashs. Die Schwere kommt aus dem Aufprall-Tempo. |
| Schleifen | – | Metallschleifen, solange die Karosserie an Wand, Leitplanke oder Boden gleitet (Lautstärke und Tonhöhe nach Gleit-Tempo) |
| Landungen | ein Sinus-Stoß | Stoß auf Blech nach Fallhöhe, ab 8 m/s mit Motorhaube, ab 12 m/s mit Knirschen |
| Reifen | gefiltertes Rauschen | zwei Aufnahmen von quietschenden Reifen, bei jedem Rutschen zufällig eine; Tonhöhe folgt dem Schlupf |
| Zufall | – | Auswahl, Tonhöhe (±10 %) und Einsatz variieren, nichts wiederholt sich identisch |

Countdown-, Checkpoint-, Ziel- und Brems-Töne sowie Fahrtwind und Hüpfer bleiben wie bisher.

## Quellen und Lizenzen
13 Aufnahmen von freesound.org, alle **CC0**. Die Lizenz ist an der Seite jedes Klangs geprüft (`tools/fetch_sounds.py` bricht sonst ab). Urheber, Links und Verwendung stehen in `assets/LICENSES.md`.
- Motor: ein Prüfstandslauf. Crash: Autocrash, Metallschlag, Motorhaube, Trümmer, Glas. Außerdem Metallschleifen, zwei Aufnahmen quietschender Reifen, zwei Fehlzündungen.
- Keine Sonniss- oder „Royalty-free“-Pakete, keine Markennamen.
- Datei im Spiel: `assets/snd/sfx.m4a` (AAC, mono, 96 kbit/s, 21 s) mit `sfx.json`, zusammen **0,27 MB** (Budget 1,5 MB).
- Bau: `python3 tools/fetch_sounds.py && python3 tools/build_sounds.py`.

## Messwerte
Alle Werte sind offline im Headless-Chrome mit der echten `src/audio/sound.js` gerendert (`tests/ton_probe.py`).
- Vorher = `?snd=alt`. Nachher = Aufnahmen.
- Beide Fassungen fahren identisch.
- „Handy“ = Hochpass 400 Hz (2× Butterworth). „>2 kHz“ = Anteil davon über 2 kHz.

| Szene | Spitze vorher → nachher | übersteuert | RMS dBFS vorher → nachher | am Handy hörbar | davon > 2 kHz |
|---|---|---|---|---|---|
| **30 s Rennen** (Mittel, Crash + Abkürzung) | 0,57 → 0,54 | 0 / 0 | −20,0 → −19,4 | 30 % → 36 % | **1,6 % → 8,4 %** (Ziel ≤ 10 %) |
| Start + Vollgas durch alle Gänge, dann Schiebebetrieb | 0,34 → 0,46 | 0 / 0 | −20,4 → −20,8 | 50 % → 50 % | 0,9 % → 10,1 % |
| dasselbe im Cockpit | 0,34 → 0,41 | 0 / 0 | −20,4 → −22,0 | 50 % → 38 % | 0,9 % → 2,3 % |
| Crash leicht / mittel / schwer | 0,59 → 0,61 | 0 / 0 | −22,9 → −21,8 | 42 % → 49 % | 18,8 % → 13,1 % |
| Leitplanke schleifen (2,5 s) | 0,25 → 0,40 | 0 / 0 | −22,0 → −22,1 | 37 % → 47 % | 0,5 % → 11,4 % |
| Landung klein / mittel / hoch | 0,57 → 0,52 | 0 / 0 | −23,3 → −22,9 | 31 % → 49 % | 0,3 % → 10,5 % |

- **Lautheit wie bisher:** Die 30-s-Szene ist 0,6 dB lauter, der Vollgas-Lauf 0,4 dB leiser. Nirgends Übersteuerung.
- **Handy-Lautsprecher:**
  - Mehr vom Klang kommt am Handy an (36 % statt 30 % der Energie über 400 Hz): Der Motor trägt dort über seine Obertöne, Crash und Schleifen über ihren Körper bei 300–700 Hz.
  - Der Anteil über 2 kHz bleibt mit 8,4 % unter dem Ziel von 10 %.
  - Der Crash ist oben sogar dunkler als der alte (13 % statt 19 %).
  - Dazu wurde beim Bau alles oben sanft gekappt und bei 450–600 Hz leicht angehoben. Im Spiel liegt ein Tiefpass auf dem Motor: 3,8 kHz unter Last, 2,2 kHz im Schiebebetrieb, damit das Turbo-Rauschen am Handy nicht zischelt.
- Einzelklänge (Handy-Anteil > 2 kHz, `tests/out/n16/ton/probe_final.txt`):
  - Reifen: 1 % und 4 %
  - Landungen: 0,2–1,5 %
  - Schleifen: 7 %
  - Blech: 13–21 %
  - Glas: 76 % (nur bei schweren Crashs)
  - Die rohen Motor-Loops liegen hoch (bis 70 %, Ansaug- und Turbo-Rauschen). Das nimmt im Spiel der Tiefpass heraus, siehe Szenen.
- **Loop-Nähte** (`tests/sound_levels.py`): Der Sprung am Loop-Ende ist bei allen 14 Loops höchstens 2,8× so groß wie ein typischer Sprung im Loop, also kein Knacken. Die Motor-Loops liegen gleich laut (−18 bis −17 dBFS).
- **CPU** (`tests/ton_cpu.py`, 3 × 25 s Rennen, CPU aller Browser-Prozesse, Ton-Anteil = Ton an − Ton aus):
  - bisher 4,6 %, jetzt **2,5 %** eines Kerns
  - Es laufen nur die gerade hörbaren Stimmen: unter Last meist 2 Motor-Loops. Nitro, Reifen, Schleifen und Begrenzer werden nur bei Bedarf gestartet.
  - Die Messung schwankt um etwa ±3 %.
- **Laden:**
  - Die Seite lädt 0,27 MB mehr.
  - Die Tondatei wird schon beim Laden der Seite dekodiert, ohne auf den ersten Tipp zu warten.
  - Nach dem Start-Tipp ist der Klangvorrat nach 0,5–0,8 s bereit, genauso schnell wie bisher (der Synthesizer rendert in derselben Zeit).
  - Der Service-Worker speichert die Datei für offline.
- **Rückfall:** Lässt sich die Tondatei nicht laden, spielt der bisherige Synthesizer (getestet mit blockierter Datei). `?snd=alt` erzwingt ihn zum A/B-Vergleich.

Spektrogramme: `tests/out/n16/ton/*.png` (lokal). Im Vergleich der 30-s-Szene (`szene30_ab.png`):
- oben: saubere Synthesizer-Linien
- unten: Aufnahme mit Gangwechsel-Lücken und der Pause beim Crash-Reset

## Hörproben (vorher/nachher)
`~/Downloads/Stuntbahn-Ton/`:
- `vorher_szene30.m4a` / `nachher_szene30.m4a` (30 s Rennen mit Crash)
- `…_vollgas.m4a` (Start, alle Gänge, Gas weg)
- `…_cockpit.m4a`
- `…_crash.m4a` (leicht, mittel, schwer)
- `…_schleifen.m4a`
- `…_landung.m4a`

## Nicht gemacht
- **Geisterauto und Replay mit Doppler:** Im Replay gibt es weiterhin keinen Ton. Ein zweiter Motor für den Geist würde die CPU-Last wieder erhöhen. Das „falls billig“ ist damit nicht erfüllt, also offen.
- Echte Karbon-Aufnahmen gibt es unter CC0 nicht in brauchbarer Form. Das Blech-Knirschen deckt den Klang ab.

## Handy-Test
1. Handy laut stellen, den **Lautlos-Schalter aus** (iPhone). Die Seite neu laden und einmal tippen: Der Ton startet beim ersten Tipp.
2. Mittel oder Original, Vollgas auf der Geraden: Der Motor dreht hoch, bei jedem Gangwechsel gibt es eine kurze Lücke. Gas weg: dunkler, mit ein paar Knallen.
3. Kamera auf Cockpit (C bzw. Kamera-Knopf): Der Motor klingt gedämpft wie von innen.
4. Absichtlich gegen eine Wand und an der Leitplanke entlang: Es schleift, solange du dran bist. Ein harter Crash klingt nach Blech, Trümmern und Glas.
5. Zum Vergleich dieselbe Seite mit `?snd=alt` öffnen (alter Ton).
