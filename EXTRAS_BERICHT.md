# Stuntbahn – pro Runde 1× Hüpfer und 1× Nitro (28.09.2026)

Peters Wunsch: „Cool wäre pro Runde einmal springen und einmal Nitro-Boost.“
Die Physik übertreibt dabei bewusst (Arcade), die Grafik bleibt realistisch.

## Kurz
- **🦘 Hüpfer:**
  - Das Auto springt aus der Fahrt senkrecht zur Fahrbahn ab, **~3,5 m hoch** und **~2 s** lang in der Luft.
  - Das Vorwärtstempo bleibt, das Auto bleibt waagrecht (höchstens 0,5° Neigung).
  - In der Luft wirkt dieselbe Schwerkraft wie bei den Schanzen (Faktor 0,7).
  - Er geht nur mit Bodenkontakt, eine verpatzte Landung lässt sich also nicht retten.
  - **Gesperrt** (Knopf ausgegraut): in Looping, Röhre, Korkenzieher und an Schanzen, außerdem, wenn der Flug
    hineinreichen würde oder eine Brücke/Decke über der Flugbahn liegt.
  - Die Höhe ist auf das Auto bezogen und wächst nicht mit der Welt.
- **🔥 Nitro:**
  - **3 s** kräftiger Schub, danach **0,7 s** weich zurück.
  - **+73 bis +83 % Beschleunigung** bis 300 km/h.
  - **Vmax 586 → 700 km/h** (+20 %), falls man den Nitro dauernd hätte.
  - Effekte: Flammen aus den beiden Endrohren, Tempo-Streifen am Bildrand, Sichtfeld +8° (hochkant +4°),
    Zisch-Zündung und Fauchen.
  - Auch im Looping erlaubt.
- **Ladungen:**
  - Je 1 pro Runde, beim Überfahren von Start/Ziel wieder voll. Ansparen geht nicht (höchstens je 1).
  - Die Rennen haben genau eine Runde. „Pro Runde“ heißt deshalb praktisch: 1× pro Rennen. Das Auffüllen greift
    an der Ziellinie (getestet mit einem Rundenwechsel ohne Zieleinlauf).
- **Leicht + „Extras automatisch“** (Standard an), 120 Generator-Strecken:
  - **120/120 im Ziel ohne Crash**, alle **schneller**, im Mittel −0,50 s.
  - Wo der Autopilot über Bodenwellen hüpft (9 von 120 Strecken): −2,5 bis −3,2 s.
- **.TRK-Korpus** (dieselben 200 Strecken wie im Welt-Bericht):
  - Im Ziel 196 → 196, ohne Crash 195 → **196**.
  - 195 schneller, 1 langsamer (Erklärung unten), im Mittel −0,60 s.

## Werte (Node, `node tools/extras_measure.mjs`, Asphalt-Ebene)
| Hüpfer bei | Scheitel (Fahrzeugmitte) | Flugzeit | Weite | größte Neigung |
|---|---|---|---|---|
| 60 km/h | 3,49 m | 1,98 s | 41 m | 0,1° |
| 120 km/h | 3,48 m | 1,98 s | 74 m | 0,2° |
| 200 km/h | 3,41 m | 1,95 s | 116 m | 0,2° |
| 300 km/h | 3,35 m | 1,92 s | 163 m | 0,2° |

Der Absprung erfolgt mit 7,7 m/s senkrecht zur Fahrbahn. Die Landungen gehen ohne Aufprall ab.

| Nitro bei | Beschleunigung ohne → mit | Zuwachs |
|---|---|---|
| 30 km/h | 13,8 → 23,9 m/s² | +73 % |
| 100 km/h | 14,9 → 26,3 m/s² | +77 % |
| 200 km/h | 18,2 → 33,3 m/s² | +83 % |
| 300 km/h | 15,9 → 27,7 m/s² | +74 % |
| 400 km/h | 9,6 → 19,1 m/s² | +99 % (nahe Vmax zählt der Luftwiderstand mehr) |

**Ein Nitro-Stoß (3,7 s Vollgas):**

| Start | ohne Nitro | mit Nitro |
|---|---|---|
| aus dem Stand | 197 km/h | 355 km/h |
| ab 150 km/h | 372 km/h | 471 km/h |
| ab 200 km/h | 405 km/h | 495 km/h |

**Abstimmung auf die große Welt:** Ab 100–150 km/h legt man mit Nitro in den 3,7 s 300–350 m zurück. Das ist etwa
eine lange Gerade der Welt mit Maßstab 2.

**Wie der Schub wirkt:** Er greift am Schwerpunkt an (0,7 × Antriebskraft des Motors, anteilig zum Gas). Über die
Reifen wäre er am Haftungslimit verpufft.
- Mit Radkontakt schiebt er, in der Luft nicht. Die Tempo-Fenster der Schanzen bleiben so gültig.
- Bremsen oder Gas weg: Der Schub ruht, die Uhr des Nitro läuft aber weiter.

Alle Werte stehen in `src/physics/extras.js`: `HOP.h`, `NITRO.dur`, `NITRO.fade`, `NITRO.k`.

## Bedienung
| | Hüpfer 🦘 | Nitro 🔥 |
|---|---|---|
| Handy | runder Knopf links über ◀ ▶ | runder Knopf rechts über GAS |
| Tastatur | **Leertaste** | **Shift** oder **N** |
| Gamepad | **B** | **RB** |

- **Leertaste:** Sie war bisher die Bremse. Peter wollte sie als Hüpfer, gebremst wird jetzt mit ↓ oder S. Die
  Hilfe, das README und die Tests sind angepasst.
- **Gamepad:** A/X (Gas/Bremse), Y (Rückspulen), LB (Kamera), Back und Start bleiben unverändert.
- **Knöpfe am Handy:**
  - Größe: 60 px, hochkant und auf sehr niedrigen Handys quer 54–58 px.
  - Abstand zu GAS/BREMSE bzw. zu den Lenktasten: 20–38 px.
  - Sie lösen schon beim Antippen aus und liegen über den Leicht-Bildschirmhälften. Ein Tipp auf 🔥 lenkt dort
    nicht (getestet).
- **Anzeige:**
  - Voll: farbiger Rand.
  - Verbraucht oder gerade gesperrt: grau.
  - Nitro aktiv: ein oranger Ring läuft als Restzeit ab.
  - Beim Auffüllen leuchten beide Knöpfe kurz auf, dazu „🦘 🔥 wieder voll“.
  - Wer gesperrt drückt, bekommt einen kurzen Hinweis, warum.
  - Im Cockpit bleiben die Knöpfe sichtbar, die Instrumente rücken hochkant darüber.
  - Am Desktop sitzen sie unten rechts mit Tasten-Hinweis.
- **Optionen:**
  - „🦘🔥 Hüpfer & Nitro“ (Standard an; für Puristen aus).
  - „🤖 Extras automatisch (Leicht)“ (Standard an).
  - Mittel und Original nutzen die Extras nie von selbst (getestet).

## Leicht: der Autopilot nutzt die Extras selbst
- **Nitro:** Der Autopilot rechnet vorab für jede Stelle der Runde den Zeitgewinn aus. Dafür nimmt er eine 1-D-Rechnung
  auf dem Tempo-Profil, gedeckelt vom Brems-Profil.
  - Er zündet dort, wo es am meisten bringt, in voller Fahrt. Das ist der Anfang der längsten Geraden.
  - Wenn während der Wirkung ein Sprung, Looping, Korkenzieher oder eine Röhre käme, zündet er nicht.
  - Das Tempo-Profil bleibt die Obergrenze: Vor Kurven nimmt der Autopilot Gas weg, und ohne Gas ruht der Schub.
  - Die Vorhersage stimmt: vorhergesagt 0,61/0,62/0,82 s, gemessen 0,60/0,60/0,82 s.
  - Direkt am stehenden Start brächte der Nitro im Mittel ~0,25 s mehr. Peter wollte ihn aber auf der Geraden.
    Selbst drücken geht immer.
- **Hüpfer:** nur über **Bodenwellen** und nur, wenn alles sicher ist:
  - Die Landung liegt hinter den Wellen.
  - Über die ganze Flugstrecke plus 25 m ist die Fahrbahn gerade, ohne Schanze und ohne Engstelle.
  - Hinter den Wellen muss bis zur Landung nicht gebremst werden, denn in der Luft kann das Auto nicht bremsen.
  - Sonst hüpft er gar nicht. Das trifft auf 9 von 120 Strecken zu; die übrigen Bodenwellen liegen zu dicht an Kurven.
- Lenkt der Spieler gerade selbst (freies Lenken auf Leicht), greift die Automatik nicht ein.

## Bestzeiten, Geist, Replay
- **Bestzeiten mit Extras bekommen eine eigene Liste** (Schlüssel-Zusatz `@x`).
  - Die bisherigen Zeiten sind ohne Extras gefahren. Sie bleiben unverändert und sind genau die Liste mit
    ausgeschalteter Option.
  - Das Menü zeigt sie klein als „ohne Extras: …“. Es wird nichts gelöscht.
- Die Extras sind auf allen Stufen gleich. Jeder hat dieselben Ladungen, die Zeiten sind also vergleichbar.
- **Replay:** Die Flammen erscheinen genau während des Nitro. Wird er durch einen Crash-Reset abgebrochen, gehen sie
  sofort aus.
- **Hüpfer:** steckt in den aufgezeichneten Positionen (Replay und Geist).
- **Geisterauto:** Die Nitro-Zeiten werden mit der Bestzeit gespeichert, der Geist zeigt dann ebenfalls Flammen.
- Das Ergebnis zeigt „Extras: 🦘 ✓ 🔥 ✓“.

## Belege
| Prüfung | Ergebnis |
|---|---|
| `node tests/node/test_extras.mjs` (neu, in `npm run test:node`) | **alle grün** |
| · Ladung verbraucht → zweiter Druck wirkungslos | Hüpfer und Nitro. Beim Nitro startet die Wirkung auch nicht neu. |
| · Start/Ziel überfahren | beide wieder voll, genau 1× „refill“, kein Ansparen |
| · Hüpfer in der Luft | gesperrt, Ladung bleibt |
| · Hüpfer in Looping (Mitte, Scheitel), 30 m davor, Schanzen-Anlauf, Röhre, Korkenzieher | überall `lock`, Ladung bleibt |
| · Nitro im Looping | erlaubt |
| · Option aus | keine Ladungen, Tasten wirkungslos |
| · Replay-Flammen | nur während des Nitro; Crash beendet ihn sofort |
| · Mittel/Original mit „automatisch“ | nutzen nie selbst |
| · Leicht automatisch, 30 Generator-Strecken | 30/30 ohne Crash, 30 schneller |
| `node tools/extras_batch.mjs 40` (120 Strecken) | 120/120 ohne Crash (vorher 120/120), 120 schneller, Mittel −0,50 s |
| `.TRK`-Korpus 200 (`--list=…korpus_nachher.json --assist=easy`, ohne/mit `--extras`) | im Ziel 196/196, ohne Crash 195 → 196, 195 schneller, 1 langsamer, Mittel −0,60 s |
| Alle Node-Tests (`npm run test:node`) | **12/12 grün** (`test_reset`: Schlüssel-Test um „@x“ erweitert) |
| Playwright, nacheinander über die GPU | **alle grün, 0 pageerrors:** smoke, test_race, test_touch, test_reset_ui, test_cockpit_ui, test_lineviz, test_trk_ui, test_fx, test_sound_pad, test_hochformat, hochformat_shots (6 Profile), cockpit_shots quer 10/10 |
| `python3 tests/test_extras_ui.py` (neu) | **57/57** |
| · Handy-Profile | 4 (quer/hoch, groß/klein): Knöpfe ≥ 48 px, Abstand zu den Tasten ≥ 20 px, keine Überlappung, Touch löst aus, grau wenn verbraucht |
| · weitere Fälle | Leicht-Hälften, Auffüllen mit Aufleuchten, Cockpit quer/hoch, Desktop-Tasten, Replay-Flammen, Option aus |
| Cache-Busting | `tools/update_sw.py` → neue Version |

**Der eine langsamere Korpus-Fall (DTZ22.TRK, +2,7 s)** ist kein Extras-Fehler:
- Der Nitro bringt dort wie erwartet −0,54 s.
- 2,5 km später verfährt sich der Autopilot in einer Kurvenfolge.
- Das tut er **auch ohne Extras**, sobald er nur 0,5 % schneller unterwegs ist (`speedScale 1.005` → +3,5 s). Das
  ist eine vorhandene Empfindlichkeit an dieser Stelle.

**Fehler unterwegs gefunden und behoben:** Beim Foto-Test löste der Hüpfer in einem Schanzen-Anlauf aus und verdarb
den Sprung.
- Die Schanze gehört jetzt mit zu den Sperrzonen.
- Das ist neuer Test „im Schanzen-Anlauf: gesperrt“.
- Auf Leicht war das besonders wichtig: Dort hätte die Hüpfer-Lage die Landung schief gemacht.

## Fotos (selbst angesehen)
Unter `tests/shots/final/extras_*.jpg`:
- `extras_quer_voll`, `extras_hoch_voll`: Beide Knöpfe voll über den Daumen, nichts verdeckt.
- `extras_quer_leer`, `extras_hoch_leer`: Beide verbraucht, grau.
- `extras_quer_aufgefuellt`: Knöpfe leuchten nach Start/Ziel auf.
- `extras_quer_nitro`, `extras_hoch_nitro`, `extras_desktop_nitro`: Nitro bei 183–216 km/h, Flammen aus beiden
  Endrohren, Restzeit-Ring am Knopf, Tempo-Streifen am Rand.
- `extras_quer_nitro_seite`: Flamme von der Seite.
- `extras_quer_huepfer_seite`, `extras_hoch_huepfer_seite`: Auto im Hüpfer von der Seite, bei 117 km/h ~3,5 m über
  der Fahrbahn, waagrecht, der Schatten liegt darunter.
- `extras_quer_huepfer_verfolger`: dasselbe von hinten.
- `extras_quer_cockpit`: Cockpit mit beiden Knöpfen, die Instrumente sind frei.
- `extras_desktop_replay_nitro`: Replay mit Flammen.

## Grenzen (ehrlich)
- Auf Leicht hüpft der Autopilot selten (9 von 120 Strecken, im .TRK-Korpus nie). Er hüpft nur über Bodenwellen und
  nur, wenn es sicher ist. Einen Hüpfer „einfach so“ auf der Geraden macht er bewusst nicht: In der Luft kann das
  Auto nicht beschleunigen, das kostet Zeit.
- Die Tempo-Streifen sind der billige Ersatz für Bewegungsunschärfe (ein CSS-Verlauf, kein zweiter Render-Durchgang).
- Das Cockpit behält beim Nitro sein festes Sichtfeld (gegen Übelkeit, wie im Cockpit-Auftrag).
- Von direkt hinten wirken die Flammen kurz, weil man in die Rohre blickt. Von der Seite und schräg sieht man sie gut.
- Der Ton ist nur rechnerisch geprüft, nicht am Handy gehört.

## Bitte am Handy testen
1. **Mittel, quer:** Sind 🦘 (links) und 🔥 (rechts) gut mit dem Daumen erreichbar? Löst du sie versehentlich aus,
   wenn du Gas gibst oder lenkst?
2. **Hochkant:** dasselbe. Stören die Knöpfe über ◀ und GAS?
3. **Nitro auf einer langen Geraden:** Fühlt es sich nach „Boost“ an (Schub, Flammen, Streifen, Fauchen)? Sind 3 s
   zu kurz oder zu lang?
4. **Hüpfer:** Sind ~3,5 m hoch genug für den Spaß? Ist die Landung angenehm?
5. **Leicht mit „Extras automatisch“:** Merkst du den Nitro auf der Geraden? Soll er lieber gleich am Start zünden
   (bringt ~0,25 s mehr)?
6. **Tastatur:** Stört es, dass die Leertaste jetzt hüpft statt bremst?
7. Optionen → „Hüpfer & Nitro“ aus: Sind die Knöpfe weg, und stehen deine alten Zeiten wieder oben?
