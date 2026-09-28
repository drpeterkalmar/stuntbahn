# Stuntbahn – Bericht „Sammlung“: 250 eigene Strecken im Stil der Stunts-Wettbewerbe (28.09.2026)

**Live:** https://drpeterkalmar.github.io/stuntbahn/ · Menü → **📂 Strecke laden (.TRK)** → **⭐ Sammlung (250)**
Commits: `cfe54f9` (Phase A: Modell, Generator, Paket), `c2c6cc1` (Phase B: Oberfläche), `cbc0b39` (Verzeichnis kleiner).
Live geprüft (Build `79328c5460`): Abschnitt klappt auf, Strecke des Tages lädt und fährt ins Ziel, Suche + Filter +
Sortierung, Zustand nach Neuladen, 0 Seitenfehler; PWA/Offline-Start ok.

## Kurz
- **Keine fremde Strecke** im Repo oder Paket – auch nicht abgewandelt. Die 250 Strecken baut ein eigener Generator
  (`src/track/trkgen.js`) aus Zufall (Seed) + einem Stil-Modell, das nur **Häufigkeiten** aus den 306
  ZakStunts-Wettbewerbsstrecken enthält (`assets/sammlung_stil.json`).
- Jede Strecke hat ein **Ähnlichkeits-Tor** gegen alle 306 Vorbilder **und** gegen die übrige Sammlung bestanden
  (strenger als die Vorbilder untereinander) und wurde vom **Autopilot auf „Leicht“ ins Ziel** gefahren.
- Paket: `assets/sammlung.bin` (250 × 1802 Byte, ein Request) + `assets/sammlung.json`; ausgeliefert (gzip, GitHub Pages)
  **110,4 + 8,7 = 119,1 KB** ≤ 120 KB. Lädt erst beim Aufklappen, nicht beim Start; im Service-Worker für offline.
- **Eingefroren** seit dem ersten Push: spätere Builds hängen nur an (`--anzahl=N`), Nummern `sam-001 …` bleiben.

## Regeln (Recht) – wie sie umgesetzt sind
| Regel | Umsetzung / Nachweis |
|---|---|
| 1 Kein Byte/Karte/Name aus dem Korpus | `trk_local/` bleibt gitignored, nichts daraus committet. Test: kein 1802-Byte-Block gleicht einer der **3 623** lokalen .TRK-Dateien; Suche nach allen 306 Namen/Ids/Designern in `sammlung.json` und `sammlung_stil.json`: keine Treffer. Minikarten-Vergleichsbilder mit Korpus-Strecken nur lokal (`tests/out/`). |
| 2 Keine Vorlage | Generator liest nie eine Korpus-Strecke: Skelett = „Schildkröte“ + A*-Schluss aus dem Seed, Belegung nach Häufigkeiten. |
| 3 Nur Aggregate, Muster ≥ 5 Strecken / ≥ 3 Designer | Modell = Mittel/Quantile/Anteile je Merkmal, gewichtet nach Fahrern. Übergänge zwischen Elementarten: 272 erlaubt, 44 verworfen (zu selten). Alle 18 Formbausteine des Generators geprüft: z. B. Sprung 142 Strecken/27 Designer, Überführung 38/13, Wendel 17/10 – alle ✅ (sonst würde der Generator sie weglassen). |
| 4 Ähnlichkeits-Tor | siehe nächster Abschnitt: Grenzen aus der Kalibrierung, gegen Korpus **und** innerhalb der Sammlung. |
| 5 Namen | eigene deutsche Namen (Adjektiv mit passender Endung + Nomen, erweiterte Wortlisten), 250 eindeutig, keiner mit Levenshtein ≤ 2 (ohne Groß/klein) zu einem der 306 Original-Namen. |
| 6 Credits | Absatz in `assets/LICENSES.md` (Wortlaut wie vorgegeben), dazu README. |

## Ähnlichkeits-Tor und Kalibrierung
- **(a) Fahrbahnfelder:** alle Felder mit Strecken-Elementen (auch Füllfelder, ohne Szenerie) als 30-Bit-Zeilen; Jaccard in
  allen 8 Lagen (4 Drehungen × Spiegelung), Schwerpunkte übereinander ± 3 Felder in x und y.
- **(b) Gemeinsamer Abschnitt:** Tokenfolge entlang des Fahrwegs; Token = Elementart + relative Abbiegerichtung +
  Höhenwechsel (Schikane mit Händigkeit); gleiche gerade Tokens hintereinander = ein Token; zyklisch, verglichen mit der
  Folge selbst, gespiegelt, rückwärts gefahren und beidem. **Elementart** = Elementtyp der .TRK-Tabelle (Hochstraßen-,
  Brücken-, Dammrampe verschieden); nur Start/Ziel zählt als Straße. (Die gröbere Lesart – alle Rampen gleich – ergibt
  dieselben Grenzen; siehe unten.) Umsetzung schnell: „Abschnitt ≥ 6“ ⇔ gemeinsame 6er-Folge → Zahlen-Set.
- **Kalibrierung** über alle **37 993** Paare von Korpus-Strecken **verschiedener** Designer:

| Maß | Median | p95 | p99 | max | Grenze (strengere aus p95 und Obergrenze) |
|---|---|---|---|---|---|
| Jaccard Fahrbahnfelder | 0,220 | 0,319 | 0,372 | 0,944 | **≤ 0,319** (Obergrenze 0,35) |
| Gemeinsamer Abschnitt (Token) | 3 | 5 | 7 | 34 | **≤ 5** (Obergrenze 6) |
| (grobe Token-Lesart, nur zum Vergleich) | 4 | 5 | 7 | 34 | ≤ 5 |

- **Größte Werte der Sammlung:** gegen den Korpus Jaccard **0,319** / Abschnitt **5**; innerhalb der Sammlung Jaccard
  **0,319** / Abschnitt **5** – alle ≤ Grenze (Test `tests/node/test_sammlung.mjs` rechnet es jedes Mal neu nach).
- Wie streng das ist: **Nur 1 von 306 Korpus-Strecken** würde dieses Tor gegen die übrigen Korpus-Strecken bestehen
  (Median der Maxima: Jaccard 0,375, Abschnitt 7). Unabhängige menschliche Designer sind sich also ähnlicher, als es
  die Sammlung zu irgendeinem Vorbild oder untereinander ist.

## Build-Protokoll (`node tools/build_sammlung.mjs`)
| | Anzahl |
|---|---|
| Kandidaten (Seeds 1 … 18 267) | 18 267 |
| verworfen: Korpus, gemeinsamer Abschnitt | 13 473 |
| verworfen: Sammlung, gemeinsamer Abschnitt | 3 463 |
| verworfen: Korpus, Felder-Überdeckung | 809 |
| verworfen: Sammlung, Felder-Überdeckung | 272 |
| verworfen: Autopilot „Leicht“ nicht im Ziel / Stunt übersprungen | 0 |
| verworfen: nicht lesbar / kein Rundkurs / Name | 0 |
| **angenommen** | **250** (Laufzeit 5,3 min) |

Jede angenommene Strecke: Autopilot „Leicht“ im Ziel ohne übersprungenen Stunt (alle ohne Crash), „Mittel“ (Autopilot
als Spieler durch die Mittel-Hilfen) 250/250 im Ziel, ohne Hilfen 249/250 (sam-185: Überschlag an einer Hochstraßen-Rampe;
im Spiel steht dann wie bei Importen „Probefahrt ohne Hilfen: … – Fahrhilfe Leicht hilft“). Nachgefahren: Leicht 250/250,
0 Crashs. Zeiten stehen im Verzeichnis.
Längen p10/p50/p90: 1,62 / 2,85 / 3,74 km → Filter **kurz < 2,45 km ≤ mittel < 3,1 km ≤ lang**. Schwierigkeit (Stunts
und enge Kurven je km, Sprünge, Eis/Schotter, Crashs im Mittel-Lauf, Scheitern ohne Hilfen) in Dritteln: Sanft 84,
Sportlich 82, Irre 84. Landschaft: Wüste 27, Tropen 78, Alpen 46, Stadt 40, Land 59. Stil-Nähe (0–100, „Empfohlen“)
p10/p50/p90: 64 / 77 / 84.

## Was beliebte Strecken ausmachen (Top 50 nach Fahrern gegen den Rest)
Mittelwerte je Strecke, d = Unterschied in Standardabweichungen (Effektstärke):

| Merkmal | Top 50 | Rest | d |
|---|---|---|---|
| Hügel-Anteil der Felder | 0,31 | 0,24 | +0,39 |
| Wendel (Korkenzieher hoch/runter) | 0,36 | 0,60 | −0,31 |
| Kurven weit | 2,9 | 3,6 | −0,30 |
| Loopings | 1,2 | 1,0 | +0,27 |
| Schikanen | 1,3 | 1,7 | −0,25 |
| Felder belegt | 142 | 159 | −0,20 |
| Buckel / Sprünge | 1,5 / 1,6 | 1,2 / 1,3 | +0,19 / +0,18 |
| Szenerie / Wasser-Anteil | 124 / 0,26 | 108 / 0,22 | +0,19 / +0,18 |
| Länge | 3,2 km | 3,4 km | −0,18 |
| Elemente, Tunnel, Röhren, Steilkurven, Hochstraße, Autobahn, Kreuzungen | ≈ gleich | | \|d\| < 0,11 |

**Ehrlich:** Die Unterschiede sind **klein** (alle |d| < 0,4; Standardfehler von d ≈ 0,16) und bei 24 Merkmalen ist ein
Teil davon Zufall. Tendenz: beliebte Strecken sind etwas hügeliger, etwas kompakter und kürzer, mit etwas mehr Loopings,
Sprüngen und Buckeln und weniger Wendeln/weiten Kurven/Schikanen. „Fahrer im Scoreboard“ misst vor allem die **Saison**:
Die Top 50 kommen zu 19 aus 2004–07 und zu 21 aus 2020–26 (teilnehmerstarke Jahre). Das Modell gewichtet deshalb nur
sanft nach Fahrern und nimmt den ganzen Korpus als Stil-Vorbild.

## Stil-Treue: Sammlung gegen gewichteten Korpus
| Merkmal | Korpus (gewichtet) Mittel | Sammlung Mittel | Korpus: Anteil Strecken mit | Sammlung: Anteil mit |
|---|---|---|---|---|
| Elemente (Fahrweg) | 63,2 | 54,6 | | |
| Länge (m) | 3 329 | 2 767 | | |
| Tokens | 57,4 | 50,1 | | |
| Belegte Felder | 156 | 110 | | |
| Box lange Seite | 24,4 | 25,9 | | |
| Looping | 1,02 | 1,43 | 70 % | 89 % |
| Korkenzieher (Rolle) | 1,31 | 1,78 | 84 % | 92 % |
| Korkenzieher (Wendel) | 0,54 | 0,35 | 40 % | 29 % |
| Röhren | 0,79 | 0,63 | 64 % | 57 % |
| Tunnel-Felder | 2,67 | 3,79 | 83 % | 100 % |
| Slalom | 1,48 | 2,12 | 75 % | 98 % |
| Schikanen | 1,66 | 1,15 | 72 % | 66 % |
| Sprünge (Rampe–Lücke–Rampe) | 1,39 | 1,03 | 72 % | 76 % |
| Buckel (Rampe hoch/runter) | 1,26 | 1,27 | 62 % | 83 % |
| Hochstraßen/Brücken | 0,99 | 1,57 | 61 % | 77 % |
| Hochstraßen-Felder | 5,5 | 5,6 | 88 % | 81 % |
| Autobahnen | 0,98 | 0,61 | 69 % | 54 % |
| Steilkurven | 2,66 | 0,74 | 88 % | 55 % |
| Steilstraßen-Felder | 2,25 | 0,60 | 64 % | 39 % |
| Kurven eng | 4,93 | 5,35 | 93 % | 100 % |
| Kurven weit | 3,43 | 3,22 | 94 % | 95 % |
| Hochstraßen-Kurven | 1,81 | 0,92 | 75 % | 62 % |
| Kreuzungen (eben) | 1,49 | 1,91 | 45 % | 95 % |
| Überführungen | 1,17 | 0,45 | 44 % | 20 % |
| Abzweige | 2,32 | 3,00 | 57 % | 100 % |
| Hang-Straßen (Hügel hoch/runter) | 5,48 | 3,91 | 90 % | 78 % |
| Höhenwechsel | 13,9 | 12,0 | | |
| Hügel-Anteil der Felder | 0,26 | 0,32 | 96 % | 100 % |
| Wasser-Anteil der Felder | 0,24 | 0,22 | 95 % | 99 % |
| Szenerie-Objekte | 115 | 98 | | |
| Schotter-/Eis-Anteil | 0,05 / 0,03 | 0,02 / 0,01 | 38 % / 29 % | 35 % / 16 % |
| Rechtskurven-Anteil | 0,50 | 0,48 | | |
| Horizont Wüste/Tropen/Alpen/Stadt/Land | 10/30/18/16/26 % | 11/31/18/16/24 % | | |

**Grob gleich**, mit einer systematischen Abweichung: Das Tor lässt Strecken mit vielen **festen Mehr-Token-Bausteinen**
(Steilkurve mit Übergängen, Autobahn, Überführung, Hochkurve) seltener durch – genau solche Folgen wiederholen sich
sonst zwischen 250 Strecken bzw. zum Korpus. Deshalb gibt es weniger Steilkurven (0,7 statt 2,7) und Überführungen und
dafür mehr Einzel-Elemente (Tunnel, Slalom, Kreuzungen, Abzweige). Die Strecken sind im Mittel ~15 % kürzer (weniger
Tokens → leichter eindeutig). Ich habe die Gewichte einmal nachgezogen (Steilkurven von 0,6 auf 0,7, Überführungen von 0,3
auf 0,45) – mehr ging nur mit deutlich weniger bestandenen Kandidaten. **Sichtprüfung** 4 Minikarten Sammlung neben
4 Korpus-Minikarten (Bild nur lokal): wirken wie Stunts-Strecken – Hochstraßen, Stunts, Seen, Hügel, Wälder, kleine
Ortschaften; die Vorbilder haben etwas kleinteiligere Linien und regelmäßigere Baumreihen/Inseln.

## Generator (`src/track/trkgen.js`, ~1000 Zeilen, deterministisch je Seed)
1. **Skelett:** „Schildkröte“ läuft gerade Stücke (Längen aus dem Modell) und Kurven, sucht gezielt rechtwinklige Kreuzungen
   über eigene Geraden, **A*** schließt den Rundkurs; nicht benachbarte Wegfelder berühren sich nie.
2. **Belegung:** Kreuzung eben oder **Überführung** (ein Durchgang als Hochstraße mit Rampen), **Hochstraßen/Brücken**
   (Hochstraßen-/Brücken-/Dammrampen, auch **Wendel** als Auf-/Abgang, **Hochkurven**), Kurven eng/weit/**Steilkurve**
   (mit Übergängen, doppelt, mit Steilstraße), **Schikane** aus S-Kurven, **Abzweig** als Kurve oder Gerade,
   **Hügel-Abschnitte** (Hang hoch → Plateau → Hang runter), gerade Bausteine (Looping, Korkenzieher, Röhre mit
   Hindernis, Autobahn, Tunnel, Slalom, Sprung über 1 Feld, Buckel, Kreuzung) nach den Häufigkeiten; feste Bausteine nie
   direkt hintereinander (Vielfalt); **Schotter/Eis**-Abschnitte.
3. **Gelände** aus Eckhöhen (Hügel mit Hängen und Kuppen/Mulden, ohne Sattel), **Seen** (auch unter Brücken und
   Sprüngen) mit Uferecken; **Szenerie** nach Horizont (Wälder, Palmen, Kakteen, Häuser, Schiffe …), **Ortschaften**
   (Straßenkarree mit Häusern) und **Nebenstraßen** an Kreuzungen/Abzweigen – wie die Deko-Straßen vieler Vorbilder.

**Nicht (oder kaum) im Wortschatz** – bewusst weggelassen statt erzwungen: großer Abzweig (2×2), echte alternative
Routen über Abzweige, Sprünge über 2+ Felder (im Korpus 3 von 423), Hochstraßen über Hügeln (Ebene 2 nur über Rampen/
Sprünge auf Plateaus), Straßen auf Uferfeldern, Horizont „Chaos“ (im Korpus nicht vorhanden).

## Oberfläche
- Bibliothek: **„⭐ Sammlung (250)“** unter „Meine Strecken“, über den Beispielen, eingeklappt, Untertitel „Neue Strecken
  im Stil der beliebtesten Stunts-Wettbewerbe“. Aufgeklappt: **📅 Strecke des Tages** (Tage seit Epoche mod 250), Hinweis
  „Original-Strecken der Community: auf zak.stunts.hu laden und hier importieren (.TRK oder .ZIP)“ mit Link,
  **Suchfeld** (16 px, kein Zoom; Tippen löst keine Spieltasten aus), **Sortierung**, Knopf **⚙️ Filter (n)** mit Chips
  (Schwierigkeit, Länge, enthält Stunt – mehrere = alle müssen vorkommen –, Landschaft, „noch nie gefahren“, „mit meiner
  Bestzeit“), Zähler + „Zurücksetzen“. Zeilen wie bei Importen (Minikarte träge, Name, Stufe, Länge, Landschaft,
  Stunt-Symbole, Bestzeiten je Fahrhilfe), ▶ Fahren, kein 🗑. Zustand in `store.settings.sam`, „zuletzt gefahren“ in
  `store.settings.samPlayed`.
- ▶ lädt wie ein Import (Id `sam-<nr>`, nicht in der TrkLib); Menü „⭐ Sammlung · Stufe · Landschaft · km“, bei der
  Tages-Strecke „📅 Strecke des Tages“; Autopilot-Referenz aus dem Paket (keine Probefahrt). `?trk=sam-042` geht auch.
- Paket fehlt (404): Abschnitt verschwindet beim Aufklappen, keine Meldung. Fotos: `tests/shots/final/sammlung_*.jpg`.

## Tests
| Prüfung | Ergebnis |
|---|---|
| `node tests/node/test_sammlung.mjs` | 250 lesbar + Rundkurs, Metadaten, **20/20 Autopilot Leicht**, Tor gegen Korpus + innerhalb (Grenzen neu kalibriert = Build), Namen, kein Korpus-Block, 15 Filter-/Sortier-Fälle, Strecke des Tages |
| `npm run test:node` | alle 15 grün (Sammlung neu dabei) |
| `python3 tests/test_sammlung_ui.py` | hoch + quer + 404: alle grün; **live** (`… https://drpeterkalmar.github.io/stuntbahn/`) alle 32 grün |
| `test_trk_corpus.mjs 200` | Leicht 195/200, ohne Hilfen 190/200 – **identisch** mit dem Stand vor dem Job (gleiche Stichprobe mit Commit 299d754 nachgefahren; `trk_local/` hat seit dem letzten Bericht neue Dateien, daher andere Stichprobe als dort) |
| `test_trk_ui.py`, `test_live.py` | grün (Import-Oberfläche unverändert; live PWA + offline ok) |
| Paketgröße | .bin 450 500 Byte roh, .json 41 KB roh; ausgeliefert gzip 110 366 + 8 695 Byte |

## Bitte am Handy testen
1. Menü → **📂 Strecke laden (.TRK)** → **⭐ Sammlung** antippen: Wie schnell ist die Liste da (Paket ~119 KB)? Ruckelt
   das Scrollen durch 250 Zeilen (Minikarten erscheinen erst beim Hinscrollen)?
2. **Strecke des Tages ▶ Fahren**: Laden ohne Probefahrt – wie lange dauert es bis zum Menü?
3. Suche tippen (zoomt die Seite? bleibt die Tastatur offen?), **⚙️ Filter** öffnen, z. B. „Irre“ + „Looping“,
   Sortierung „Länge“ → App schließen und neu öffnen: bleibt die Auswahl?
4. Ein paar Strecken quer durch Stufen/Landschaften fahren: Wirken sie wie „damals“? Zu viele Tunnel/Slaloms, zu wenige
   Steilkurven? Welche Stelle fährt sich falsch (Name + Foto genügt)?
5. Offline (Flugmodus nach einmaligem Laden): Sammlung aufklappen und fahren.

## Anhängen (später)
`node tools/build_sammlung.mjs --anzahl=300` prüft ab Seed 18 268 weiter und hängt nur an (Nummern, Grenzen kurz/mittel/
lang und Stufen bleiben). Braucht `trk_local/` (Korpus) für das Tor; ohne Korpus bricht der Build ab.
