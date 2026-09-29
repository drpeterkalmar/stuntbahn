# Stuntbahn – Fahrgefühl (n14, 29.09.2026)

Peters Wünsche vom 28.09.2026:
- **Leicht:** „ein bisschen mitlenken müssen, um auf der Ideallinie zu bleiben“ – keine Schienen.
- **Ideallinie/Autopilot schneller**, kürzere Bremszonen; die Linie farbig wie bei Forza (grün Gas, gelb Gas weg, rot bremsen).
- **Mittel:** „Bei Mittel bremst mich die Ideallinie ab“ – keine Zwangsbremse.
- **Original:** „mehr Bodenhaftung“.

## Kurz
- **Leicht:** Ohne Lenken treibt das Auto in Kurven nach außen. Es fährt im Schnitt 1,3–1,8 m neben der Linie
  (bis n13 waren es 0,2–0,3 m). Es bleibt dabei auf dem Asphalt, crasht nicht und ist 9–17 % langsamer als der
  Autopilot. Wer mitlenkt, fährt die Linie (Ø 0,14–0,34 m) und ist so schnell wie der Autopilot.
  Mit `?lk=0` kommen die alten Schienen zurück.
- **Tempo:** Der Autopilot ist im Mittel **11,2 % schneller** (37 Strecken). Auf der Demo sind es 6,6 %,
  beim Generator 9,8 %, in der Sammlung 11,7 %.
  - Der Regler pendelt nicht mehr: Gas↔Bremse wechselte bisher ~800-mal pro Minute, jetzt 49-mal.
  - Zu früh gebremst hat er bisher 1014 s lang, jetzt 110 s.
  - Die Bremszeit sinkt um 20 %. Der Bremsanteil fällt von 43 auf 38 %. Die ≤ 25 % aus dem Auftrag sind
    physikalisch nicht drin, die Begründung steht unten.
- **Farben:** Die Linie färbt sich jetzt aus dem Pedal-Plan des Profils.
  - Wo der Autopilot bremst, ist sie rot: 98 % (bis n13: 70 %).
  - Wo er Gas gibt, ist sie grün: 92 % (bis n13: 36 %).
  - Bis n13 war die Linie auf 65 % der Strecke rot, und der Autopilot gab dort die halbe Zeit Gas.
- **Mittel:** Die Zwangsbremse ist weg. Ein Vollgas-Spieler wurde bisher 20–34 % der Rennzeit eingebremst,
  jetzt 0,0–0,1 %.
  - Stattdessen gibt es „▼ Bremsen!“ im HUD mit einem kurzen Ton.
  - Neue Option „Bremshilfe“: Aus / **Hinweis** (Standard) / Sanft.
  - Das ESP greift weicher ein und lässt bei deutlichem Gegenlenken in 0,3 s los.
- **Original:** mehr Haftung und mehr Abtrieb.
  - Reifen mu 1,5 → 1,7, Abtrieb 1,5 → 2,5 als Bodeneffekt, Antrieb 50/50.
  - Ein Sägezahn in der verwundenen Fahrbahn ist beseitigt.
  - Der „normal“-Bot crasht auf Original 25 → 10-mal (−60 %).
  - Der perfekte Fahrer hebt 66 → 31-mal ab (−53 %), an Steilkurven 39 → 0-mal.
- **Lösbarkeit:** keine Strecke ist neu unlösbar.
  - Sammlung: 250/250 auf allen Stufen, streng sogar 249 → 250.
  - Generator: 120/120.
  - Import-Korpus: Leicht 195 → 195, streng 190 → 192.
- **Ehrlich offen:**
  - Hände weg liegt auf 3 von 4 Strecken knapp unter dem Ziel von 1,5 m (1,34–1,48 m).
  - „Daumen 0,3“ erreicht auf der Demo 0,97 statt ≥ 1 m.
  - Die Demo allein wird nur 6,6 % schneller. Das Mittel über alle Strecken erfüllt die ≥ 8 % trotzdem.
  - Bremsanteil 38 % statt ≤ 25 %.
  - Mittel mit perfekter Eingabe crasht in 250 Sammlungs-Strecken 2-mal (vorher 1-mal), beide Male im Slalom.

---

## A. Leicht – mitlenken statt Schienen

**Ursache:** Bis n13 zog die Hilfe mit 82 % der Autopilot-Lenkung zur Linie (`steerPull 0,82`). Mit den Händen weg
fuhr das Auto damit Ø 0,2–0,3 m neben der Linie und so schnell wie der Autopilot.

**Neues Modell** (`src/game/race.js`: `LEICHT`, `leichtSteer`, `corridor`):
- **Teil-Vorsteuerung:** Die Hilfe liefert nur 20 % (1 − lk) der Lenkung, die eine Kurve braucht. Den Rest lenkt
  der Spieler. Die Hilfe füllt nur auf, was er nicht schon selbst lenkt, damit das Auto nicht doppelt einlenkt.
- **Band um die Linie (± 3,5 m):**
  - Es reicht nie über die Fahrbahngrenze der Ideallinie hinaus (Rad-Außenkante 0,4 m vor der Kante).
  - Ab 30 m/s wird es schmaler, bis auf 30 % bei 60 m/s. Sonst trieb das Auto bei 200+ km/h an Leitplanken und
    Hochstraßen-Wände.
  - An Steilkurven ist es ± 1 m breit.
  - Vor Engstellen und angekündigten Stunts schrumpft es weich auf 0.
  - Im Band zieht nichts zur Linie. Nur eine schwache Kurshaltung (5 %) verhindert Schlingern.
- **Außerhalb des Bandes** führt die Hilfe das Auto wie der Autopilot zum Bandrand zurück (Kurs + Querfehler).
  Dabei schaut sie 0,3 s voraus. Quer fährt es dabei höchstens 4 m/s bzw. 12 % des Tempos. Die Hilfe allein
  bringt das Auto also nie ins Schleudern.
- **Tempo:** Ab 1,1 m neben der Linie nimmt die Tempo-Automatik in Kurven Gas weg, am Bandrand bis 30 %. Wer die
  Hände weg lässt, ist deshalb langsamer.
- **Freies Lenken (Übernahme)** gibt es nur, wenn der Spieler außerhalb des Bandes weiter von der Linie
  wegdrückt. Mitlenken in die Kurve bleibt Hilfe. Die Abkürz-Regel und das freie Lenken ins Gelände bleiben.
- **Vor Stunts** lenkt wie bisher ~1,2 s vorher der Autopilot. Er übernimmt jetzt weich überblendet, damit das
  Auto gerade und mittig in Looping, Röhre oder Schanze fährt. Bei selbst gezündetem Nitro ist das Band schmal.
- **Nebenbei gefunden:** Am Autobahn-Übergang lag die Grenze zur Mittelleitplanke falsch (fest −3,2 m statt der
  Spur folgend). Das fiel erst auf, als das Auto neben der Linie treiben durfte (`pieces_trk.js`).

**Messung** mit `tests/out/n14/leicht_probe.mjs` (die Probe aus dem Auftrag). Gleiche Bots, gleiche 4 Strecken:
Demo, S20260927/2, S4711/3, S1000/1. Gezählt wird nur normale Fahrbahn, ohne Stunts und ohne den Autopilot-Vorlauf.

| Fahrer | Maß | vorher (n13) | nachher | Ziel |
|---|---|---|---|---|
| **Hände weg** | Ø Abstand zur Linie | 0,19–0,34 m | **1,34–1,75 m** (p95 ≤ 3,2 m) | 1,5–3 m (3 von 4 knapp darunter) |
| | Runde gegen Autopilot | −0,4…−0,6 % | **+9,5…+17,1 %** | +8…+20 % ✓ |
| | Crashs / neben dem Asphalt | 0 / 0 s | **0 / 0 s** (auch auf 6 Strecken) | 0 / nie ✓ |
| **Daumen 0,3** (schief aufgelegt) | Ø Abstand | 0,60–0,62 m | **0,97–2,04 m** | ≥ 1 m (Demo 0,97) |
| | Runde / Crashs / Übernahmen | −0,6…−0,8 % / 0 / 0 | +3,8…+14 % / 0 / 0 | im Ziel ohne Übernahme ✓ |
| **normal** (lenkt mit, 0,1 s spät + Rauschen) | Ø Abstand | 0,30–0,56 m | **0,14–0,34 m** | ≤ 0,6 m ✓ |
| | Runde gegen Autopilot | −0,5…−0,9 % | **−0,5…+0,8 %** | ≤ +2 % ✓ |
| **Kind** (0,25 s spät, grob, Totzone) | im Ziel | 4/4 | **4/4** (6/6) | im Ziel ✓ |
| | Ø Abstand / Runde | 5,7–31,9 m / +47…+99 % | 1,0–2,6 m / +10…+31 % | – |
| | Crashs / Übernahmen (4 Strecken) | 2 / 39 | 1 / 4 | – |
| | Crashs / neben dem Asphalt (6 Strecken, `leicht_ext`) | 2 / 25–74 s | 3 / 0–26 s | – |

Absolut ist „Hände weg“ etwa so schnell wie bisher, auf der Demo 32,60 → 33,48 s. Der Autopilot ist auf diesen
Strecken nämlich 7–10 % schneller geworden. Wer mitlenkt, ist 6–9 % schneller als bisher, auf der Demo
32,57 → 30,57 s.

Weitere Varianten der Regler zeigen, wovon das Treiben bei „Hände weg“ abhängt (4 Strecken):
- Es hängt vor allem an der Bandbreite, kaum an lk.
  - lk 0,8 → 0,9: Ø 1,34–1,75 → 1,38–1,78 m.
  - Band 3,5 → 4 m: 1,44–1,93 m, aber der Kind-Bot crasht dann 4-mal statt 1-mal.
- Deshalb bleibt das Band bei 3,5 m. Zum Ausprobieren gibt es `?lkband=`.

## B. Schnellere Ideallinie, kürzere Bremszonen

### Messung vorher: woher die Bremszeit kam
Die Messung läuft mit `tools/fahr_analyse.mjs` über 37 Strecken: Demo, 6 Generator-Strecken und 30 aus der Sammlung.
Zum Vergleich läuft dasselbe Werkzeug mit `--root=` gegen eine Kopie des Stands vor n14.

| Ursache | vorher | nachher |
|---|---|---|
| **Regler bremst zu früh** (> 2 m/s unter dem Plan-Tempo der Stelle) | **1014 s = 75 % der Bremszeit** | 110 s = 10 % |
| Regler pendelt an einer Grenze | 125 s (9 %) | 71 s (7 %) |
| Gas↔Bremse-Wechsel je Minute | 386–866 (Mittel 797) | 41–51 (Mittel 49) |
| Regler-Verlust (Autopilot gegen 1-D-Plan) | 156 s = 5,2 % | **16 s = 0,6 %** |
| Plan-Bremse gegen echte Vollbremsung | 63–66 % (fest 12 m/s² × Aero) | 66–71 % (70 % des Haftungskreises) |
| Bremszeit gesamt / Bremsanteil | 1360 s / 43 % | **1084 s / 38 %** |

**Der alte Regler** zielte auf das kleinste Profil-Tempo der nächsten 0,35 s. Er gab Gas mit 0,35 + 0,45·Fehler
und bremste erst unter −0,4 m/s. In Bremszonen lag er deshalb ~4 m/s unter dem Plan und bremste 0,35 s zu früh.
Dazwischen wechselte er bis zu 17-mal je Sekunde zwischen Gas und Bremse.

Was jede Grenze **im Plan** kostet, zeigt eine Gegenrechnung in 1-D: dieselbe Runde ohne diese Grenze.

| Grenze | vorher | nachher |
|---|---|---|
| Kuppe (Anpressdruck) | −139 s (4,6 %) | −108 s (3,9 %) |
| Engstelle/Slalom (V_NARROW) | −119 s (3,9 %) | −46 s (1,6 %) |
| Kurven-Reserve (82 % → jetzt 76 % der höheren Haftung) | −107 s (3,5 %) | −132 s (4,7 %) |
| Plan-Bremse statt Vollbremsung | −85 s (2,8 %) | −63 s (2,3 %) |
| Schanzen-Fenster | −16 s (0,5 %) | −20 s (0,7 %) |
| Anfahrt Looping/Röhre/Korkenzieher (65 %) | −6,5 s (0,2 %) | −4,4 s (0,2 %) |

### Änderungen
- **Tempo-Regler neu** (`src/ai/autopilot.js`, `SPEED`):
  - Vorsteuerung aus dem Profil: die Soll-Beschleunigung d(v²/2)/ds kurz voraus.
  - Dazu ein P-Anteil auf den Tempofehler.
  - Beides wird über das Fahrzeugmodell (Luft- und Rollwiderstand, Steigung, Antriebs- und Bremskraft) stetig in
    Gas bzw. Bremse umgerechnet.
  - So folgt das Auto dem Profil eng, ohne früh zu bremsen und ohne zu pendeln.
- **Profil** (`src/ai/profile.js`, `PROF`):
  - **Bremsplan** aus dem Haftungskreis: 70 % dessen, was die Reifen neben der Kurvenkraft noch übertragen können,
    höchstens so viel, wie die Bremse kann.
  - **Kuppen** rechnen mit Abtrieb.
  - **Kurven:** 76 % der jetzt höheren Haftung. Bots wie Menschen behalten so Reserve.
  - **Engstellen:** 25 m/s statt 15,5 m/s. Mit 25 m/s scheitert keine der 244 Slalom-Strecken der Sammlung ohne
    Hilfen, mit 22 und mit 30 m/s je eine.
  - **Standard-Schanzen:** 1,5 m/s unter der Obergrenze des Fensters. Die Landung bleibt auf der Rampe.
  - **Import-Sprünge** bleiben beim alten Zielwert. In Sprung-Ketten kam das Auto sonst zu schnell zur nächsten
    Lippe (AP_HARD3.TRK).
- Dazu kommt die höhere Haftung aus D.

### Ergebnis: Autopilot-Runden (Leicht-Rennen, nur Autopilot)
| Gruppe | Runde vorher | Runde nachher | Δ je Strecke | Bremsanteil | Gas↔Bremse/min | Crashs |
|---|---|---|---|---|---|---|
| Demo | 0:32,76 | 0:30,58 | **−6,6 %** | 41 → 36 % | 386 → 41 | 0 → 0 |
| Generator (6) | 1:19,11 | 1:11,32 | **−9,8 %** | 42 → 40 % | 519 → 51 | 0 → 0 |
| Sammlung (30) | 1:28,64 | 1:18,33 | **−11,7 %** | 43 → 38 % | 866 → 49 | 0 → 0 |
| **alle 37** | 1:25,58 | 1:15,90 | **−11,2 %** | 43 → 38 % | 797 → 49 | 0 → 0 |

Am meisten gewinnt sam-055 (−15,7 %), am wenigsten die Demo (−6,6 %). Die Hermes-Probe `tempo_probe.mjs` misst
auf 6 Strecken dieselbe Richtung:
- Demo 0:32,76 → 0:30,58, S4711/3 1:36,08 → 1:27,48, S1000/1 0:44,50 → 0:40,51.
- Vmax auf den Strecken 161–225 → 182–261 km/h.
- Bremsanteil 38–44 → 36–42 %.

### Tempo an Hindernissen (Plan, Mittel / min / max, km/h)
| Hindernis | Anzahl | vorher | nachher |
|---|---|---|---|
| Engstelle/Slalom | 59 | 56 / 53 / 56 | **85 / 57 / 90** |
| Looping (Einfahrt) | 42 | 102 | **109** |
| Röhre (Einfahrt) | 16 | 160 / 92 / 305 | **185 / 96 / 370** |
| Korkenzieher | 41 | 81 / 78 / 82 | 82 / 79 / 82 |
| Sprung (Standard, Lippe) | 9 | 63 | **65** |
| Sprung (Import, Lippe) | 27 | 93 | 93 (bewusst unverändert) |

Mit den schnelleren Schanzen fliegt das Auto länger: Die Flugzeit (Median, 120 Generator-Strecken auf Leicht) steigt
von 2,06 auf 2,23 s. Der härteste Aufprall der Karosserie steigt von 4,4 auf 6,5 m/s. Ein Crash kommt erst ab
13 m/s. Alle 120 Strecken kommen weiterhin ohne Crash ins Ziel.

### Warum der Bremsanteil nicht auf ≤ 25 % sinkt
Der Plan selbst (1-D, 7 Strecken) bremst:
- 44 % der Zeit mit 70 % des Haftungskreises,
- **38,6 % mit 100 %**, also mit der physikalisch stärksten Bremsung,
- 35,9 % sogar mit unmöglichen 120 %.

Das Auto beschleunigt mit 2,2 MW fast so stark, wie es bremst. Die Strecken reihen Kurve an Kurve, Kuppe an Kuppe.
Also fährt es fast immer entweder Vollgas oder bremst; nur 2 % der Zeit rollt es. Unter 25 % käme man nur mit
niedrigeren Spitzentempi. Das würde die Runden langsamer machen, also gegen das Ziel „schneller“.
Verkürzt wurde, was kürzbar war:
- das Zu-früh-Bremsen: 1014 → 110 s,
- das Pendeln: 125 → 71 s,
- die Plan-Bremse von 63–66 auf 66–71 % der Vollbremsung.

### B.3 Linie in Forza-Farben
`pedalPlan` (profile.js) liest das Plan-Tempo (Vorwärtslauf) über ~4 m und vergleicht die Soll-Verzögerung mit dem
Ausrollen:
- **grün** = Gas,
- **gelb** = Gas weg (Plan verzögert etwa wie Ausrollen),
- **orange → rot** = bremsen, je dunkler, desto stärker,
- **blau** = Luft.

Schnipsel unter 3 m werden geglättet. `lineviz.js` färbt damit das Band. Das gilt auf allen Stufen mit Linie
(Leicht, Mittel). Aus/Dezent/Kräftig bleibt, die Scheitel-Keile auch.

Gemessen auf 7 Strecken (Demo, 3 Generator, 3 Sammlung), mit dem Autopiloten auf Leicht:
| | vorher (Faustregel „vt fällt in 90 m um > 6 m/s“) | nachher (Pedal-Plan) |
|---|---|---|
| Strecke rot / gelb / grün | 65 / 14 / 20 % | 47 / 0,3 / 52 % |
| wo der Autopilot bremst, ist die Linie rot | 70 % | **98 %** |
| wo der Autopilot Gas gibt, ist sie grün | 36 % | **92 %** |
| wo die Linie rot ist, bremst er / gibt er Gas | 51 % / 49 % | **84 % / 9 %** |

Gelb kommt kaum vor, weil der Plan dieses Autos fast nie rollt (siehe oben). Am Bremspunkt verläuft die Farbe
sichtbar über Gelb nach Orange und Rot.

Fotos, verkleinert, alle visuell geprüft: `tests/shots/final/fahrgefuehl_*.jpg`.
- quer: Mittel Kräftig, Leicht Dezent und der Brems-Hinweis.
- hoch: Leicht Kräftig, Mittel Dezent und der Brems-Hinweis.

Alle 10 Fotos in voller Größe erzeugt `python3 tests/linie_farben_shots.py` nach `tests/shots/linie_farben/`.

## C. Mittel – keine Zwangsbremse

Bis n13 nahm die Hilfe ab 6 % Übertempo Gas weg und bremste. Das Gas nahm sie 28–41 % der Rennzeit weg, gebremst hat sie
20–34 % der Rennzeit, obwohl der Spieler Vollgas gab.

Neu (`race.js` `BRAKE_HELP`, Einstellung „Bremshilfe (Mittel)“ in den Optionen, auch während des Rennens umschaltbar):
- **Aus:** keine Hilfe beim Bremsen.
- **Hinweis** (Standard): „▼ Bremsen!“ groß im HUD, dazu ein kurzer Ton. Er kommt, sobald man schneller ist als
  das Profil 0,7 s voraus (+3 % + 1 m/s), höchstens alle 1,5 s. Die Hilfe bremst nie selbst.
- **Sanft:** bremst leicht mit, aber nur bei mehr als 15 % Übertempo **und** ohne Vollgas. Sie baut sich in 0,25 s
  auf und gibt in höchstens 0,3 s frei.
- **ESP** (Gegenlenken bei großem Kurswinkel): greift erst ab 0,6 statt 0,5 rad ein, mit höchstens 50 statt 80 %.
  Lenkt der Spieler deutlich dagegen, blendet es in 0,3 s ganz aus.

Gemessen mit `tests/out/n14/mittel_probe.mjs`. Der Bot hält Vollgas und lenkt wie der Autopilot; 6 Strecken:
| | vorher | nachher (Hinweis) |
|---|---|---|
| **eingebremst** (Hilfe bremst) | 20–34 % der Rennzeit | **0,0–0,1 %** |
| Gas weggenommen | 28–41 % | 15–30 % (nur ESP, wenn das Auto rutscht) |
| Brems-Hinweise je Runde | – | 4–19 |
| Crashs des Vollgas-Bots | 5 | 23 (er bremst nie – bisher bremste die Hilfe für ihn) |

Die Bots aus `test_assists`, die selbst bremsen, crashen auf 3 Strecken so oft:

| Bot | vorher | nachher |
|---|---|---|
| normal | 0/4/0 | 0/0/0 |
| schlampig | 1/5/5 | 1/4/1 |
| perfekt | 0 | 0 |

Alle kommen ins Ziel.

## D. Original – mehr Bodenhaftung

**Messung vorher** (`fahr_analyse --teil=haftung`, Original, 17 Strecken):
- Der perfekte Fahrer hob 66-mal außerhalb von Sprüngen ab, davon 39-mal an **Steilkurven**.
- Ursache war ein Sägezahn: Die verwundenen Fahrbahn-Dreiecke an Steilkurven-Eingängen ließen die Radlast mit
  ~30 Hz springen, im Schnitt 0,51-mal je Schritt um mehr als die doppelte Standlast.
- Dazu kamen knappe Reifenhaftung und wenig Abtrieb.

**Änderungen** (physikalisch plausibel):
- `src/physics/car.js`:
  - Reifen mu 1,5 → 1,7.
  - Abtrieb downK 1,5 → 2,5 als **Bodeneffekt** (`groundFx` 0,5 m). Er wirkt nur mit Radkontakt bzw. nahe der
    Fahrbahn und nimmt mit dem Bodenabstand ab. Sprünge und Flüge bleiben deshalb, wie sie waren.
  - Antrieb 42/58 → 50/50: weniger Übersteuern beim Gasgeben in der Kurve.
- `src/track/build.js` `splitTwisted`: Verwundene Fahrbahn-Stücke werden quer fein geteilt (Toleranz 1 cm).
  Der Sägezahn ist damit weg.
- Profil, Linie und Autopilot rechnen mit den neuen Werten (Abschnitt B). Die Lösbarkeit ist geprüft (unten).
- **Physik-Version 3:** Bestzeiten bekommen den Zusatz „@t3“, also eine neue Wertung. Die bisherigen Zeiten bleiben
  und stehen im Menü als **„alte Physik“**. Die Zeiten von vor dem 27.09. heißen jetzt „erste Physik“.
  `?grip=1` fährt mit Haftung, Profil und Fahrbahn wie bis n13 und wertet dort.

**Messung nachher:**
| Maß | vorher | nachher |
|---|---|---|
| **Crashs Original „normal“** (test_assists, 3 Test-Strecken) | 25 (5/14/6) | **10 (2/7/1) = −60 %** |
| Crashs Original „schlampig“ (test_assists) | 32 (10/14/8) | 24 (9/12/3) |
| Crashs Original „normal“ (fahr_analyse, 17 Strecken) | 130 | 74 (−43 %) |
| Abheben „normal“ (≥ 0,05 s mit höchstens 1 Rad, ohne Sprünge) | 223 (103 s) | 179 (89 s) = −20 % |
| **Abheben perfekter Fahrer** | 66 (21 s) | **31 (17 s) = −53 %** |
| davon an Steilkurven (perfekt / normal) | 39 / 47 | **0 / 23** |
| Lastsprünge an Steilkurven je Schritt (S4711/3) | 0,51 | **0,017** |
| Querbeschleunigung p90 in schnellen Kurven („normal“) | 37,6 m/s² | 43,7 m/s² (mehr Grip genutzt) |
| Rutschwinkel p90 („normal“) | 23,9° | 21,4° |

**Kuppen:** Der „normal“-Bot hebt dort gleich oft ab (77 → 80). Das Profil fährt Kuppen jetzt schneller, und der
Bot fährt bis 8 % darüber. Bei **gleichem Tempo** hebt das Auto später ab. Gemessen an einer Generator-Kuppe:
- Die Schwelle steigt von ~77 auf ~79 km/h.
- Bei 80 km/h fliegt es 0,47 statt 1,05 s.

Mehr ist bei so niedrigem Tempo physikalisch nicht drin. Abtrieb wächst mit v², bei 80 km/h trägt er nur ~10 % des
Gewichts. „Kleben“ an Kuppen würde die Physik verbiegen, und Sprünge wären dann keine mehr.

## Lösbarkeit (vorher/nachher, gleiche Prüfwege)
| Korpus | Prüfung | vorher | nachher |
|---|---|---|---|
| Sammlung 250 | Leicht, Hände weg: im Ziel ohne Crash | 250 | **250** |
| | Mittel, Autopilot-Eingabe: im Ziel | 250 (1 Crash: sam-221) | **250** (2 Crashs: sam-061, sam-200) |
| | streng (Original, Autopilot, erster Crash = durchgefallen) | 249 (sam-185) | **250** |
| Generator (40 Seeds × 3 Stufen) | Autopilot lösbar, Entschärfungen | 120/120, 0 | **120/120, 0** |
| | Leicht ohne Crash im Ziel | 120/120 | **120/120** |
| Import-Korpus (200, 198 lesbar) | Leicht im Ziel ohne Crash | 195 | **195** |
| | streng | 190 | **192** (neu: MOHACS, STEVENA3) |

Die zwei Mittel-Crashs liegen beide in Slalom-Gassen: Dort fährt das Profil jetzt 90 statt 56 km/h. Ohne Hilfen fährt der
Autopilot beide Strecken ohne Crash. In Mittel wirkt zusätzlich der „Magnet“ der Hilfe. Er gibt mehr Haftung und damit
mehr Kippmoment. sam-200 überschlägt sich bei 87 km/h, sam-061 prallt nach einem Rutscher bei 26 km/h an. Beide kommen
mit +5 s ins Ziel. Keine Strecke ist neu unlösbar.

## Tests
- `npm run test:node`: alle 16 grün. Neu ist `tests/node/test_fahrgefuehl.mjs`. Es prüft:
  - Leicht mitlenken: Hände weg, normal, Daumen, jeweils Abstand, Zeit und neben dem Asphalt.
  - Pendeln des Tempo-Reglers, Linienfarben = Pedale des Autopiloten.
  - Mittel: Vollgas ohne Einbremsen, „Sanft“ gibt frei, ESP blendet aus.
  - Lastsprünge an Steilkurven, Abheben auf Original.
- `test_free_steer` ist an das Mitlenk-Modell angepasst:
  - A3 prüft jetzt „nach dem Loslassen wieder ganz auf der Fahrbahn ≤ 7,5 s“. Bisher hieß es „zurück auf der Linie
    (< 1 m) ≤ 7 s“. Das Band zieht bewusst nicht mehr bis auf die Linie; das alte Leicht braucht mit der neuen
    Physik 6,6 s.
  - A4 erlaubt eine Gierrate < 1,5 statt < 1,3 rad/s.
  - B ist strenger: Das Auto muss die ganzen 3 s mindestens 0,9 m vor der Kante bleiben, nicht nur am Ende.
  - A1 misst die Übernahme ab dem Moment, in dem die Hilfe gegenhält.
- `test_reset` prüft die neue Wertung @t3.
- **Browser** (einzeln, GPU/Metal, Pixel 7): alle grün, jeweils 0 Fehler.
  - smoke, test_race, test_touch, test_lineviz, test_extras_ui, test_hochformat, test_sound_pad.
  - test_reset_ui erwartet jetzt „erste Physik“ für die Zeiten von vor dem 27.09. und prüft neu „alte Physik“ für
    die Zeiten bis 28.09.
  - `tests/linie_farben_shots.py`: 0 Fehler. Der Hinweis „▼ Bremsen!“ liegt hoch und quer im Bild.
- Analyse-Werkzeug: `node tools/fahr_analyse.mjs [--root=<Kopie>] [--teil=bremse,tempo,haftung]`.

## Regler und URL-Parameter
| Wo | Konstante | Wert (bis n13) | Bedeutung |
|---|---|---|---|
| race.js | `LEICHT.lk` | 0,8 (–) | Anteil der Kurve, den der Spieler lenkt; **`?lk=0…1`**, 0 = alte Schienen |
| | `LEICHT.dz` | 3,5 m | Band um die Linie; **`?lkband=`** |
| | `dzBank`, `vFast`, `fastMin` | 1 m, 30–60 m/s, 0,3 | Band an Steilkurven / bei hohem Tempo |
| | `hold`, `look`, `kE`, `vlat`, `vlatK` | 0,05, 0,3 s, 8, 4 m/s, 0,12 | Kurshaltung, Vorausschau, Rückführung |
| | `slow`, `slowFrom`, `gain`, `awayEx` | 0,3, 1,1 m, 0,6, 0,5 m | Tempo-Abschlag, Spieler-Anteil, Übernahme |
| race.js | `BRAKE_HELP` | look 0,7 s, hintOver 3 %, gap 1,5 s, over 15 %, inT 0,25 s, outT 0,3 s | Hinweis / Sanft |
| | | espFrom 0,6 (0,5) rad, espMax 0,5 (0,8), espOut 0,3 s | ESP |
| autopilot.js | `SPEED` | preview 0,03 s, kv 8/s, dead 0,02 | Tempo-Regler |
| profile.js | `PROF` | res 0,76 (0,82), vNarrow 25 (15,5) m/s, crestAero an (aus), brakeCircle 0,7 (0), jumpSafe 1,5 (0) m/s | Profil |
| car.js | `CAR_DEF` | mu 1,7 (1,5), downK 2,5 (1,5), groundFx 0,5 (0) m, driveFront 0,5 (0,42) | Haftung |
| build.js | `TWIST_TOL`, `TWIST_MAX` | 1 cm, 24 | Aufteilung verwundener Fahrbahn |

Weitere URL-Parameter:
- **`?grip=1`**: Haftung, Profil und Fahrbahn wie bis n13; wertet unter „alte Physik“.
- `?auto=alt`: die erste Physik bis 27.09.

## Was du am Handy testen solltest
1. **Leicht, Hände weg gegen mitlenken:**
   - Mit dem Daumen weg treibt das Auto in Kurven nach außen und wird langsamer. Es bleibt aber auf dem Asphalt.
     Erwartet: ~10–17 % über der Autopilot-Referenz.
   - Dann mitlenken: Wer die Linie trifft, ist so schnell wie der Autopilot.
   - Zum Vergleich: `?lk=0` (alte Schienen), `?lkband=5` (mehr Treiben), `?lkband=2` (weniger).
   - Fühlt sich das richtig an, oder soll die Hilfe mehr bzw. weniger lenken (`?lk=0.6` / `?lk=0.9`)?
2. **Mittel mit Vollgas:**
   - Die Hilfe bremst nicht mehr ein. Vor Kurven erscheint „▼ Bremsen!“ mit kurzem Ton. Wer nicht bremst, fliegt raus
     (+5 s).
   - Optionen → „Bremshilfe“ → Sanft ausprobieren.
   - Beim Rutschen hilft das ESP. Lenkt man deutlich dagegen, lässt es los.
3. **Original an Kuppen und Steilkurven:**
   - An Steilkurven-Eingängen sollte das Auto nicht mehr hüpfen. In schnellen Kurven hat es mehr Grip.
   - An Kuppen hebt es bei gleichem Tempo etwas später ab. Mit Vollgas über eine Kuppe fliegt es weiterhin.
   - A/B-Vergleich mit `?grip=1`.
4. **Linie:** die Farben bei Dezent und Kräftig, hoch und quer. Rot heißt, dort bremst die Referenz wirklich.
5. **Bestzeiten:** Deine bisherigen Zeiten stehen unter „alte Physik“. Die neue Wertung beginnt leer.

## Commits (n14)
- `bf5a806` Analyse-Werkzeug
- `32c2d35` Haftung und Profil
- `343a4ea` Leicht mitlenken, Mittel ohne Zwangsbremse
- `de99439` Linienfarben
- `e4436c8` Autobahn-Grenze
- `310cdd1` Engstellen 25 m/s, Schanzen
- `8aad8c8` Leicht-Band
- `2b38512` test_fahrgefuehl
- `abd4919` ?lkband
- `661e26f` README
- `f97cc36` Bestzeiten-Test
- `6fc1a80` Farb-Fotos
- `ac39748` Service Worker
- `abe2cfb`, `496d2b9` Analyse-Zuordnung
- dazu dieser Bericht
