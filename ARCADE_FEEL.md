# ARCADE_FEEL – Feel-Datenblatt für n37 (Vorbild San Francisco Rush 2049, Straßenlage Beetle Adventure Racing)

Stand 18.10.2026 · Etappe 0 von n37. **Clean-Room:** Hier stehen nur Mechaniken und Zahlen in eigenen Worten. Es gibt keinen
Code, keine übersetzten Funktionen und keine Assets. Die Quellen wurden nur gelesen (per `gh api`, raw.githubusercontent.com und
WebFetch). Im Spiel tauchen keine Namen, Autos oder Logos der Vorbilder auf.

**Einheiten:** Die Vorbild-Quellen rechnen in Fuß, Sekunden, Pfund und slug. Ich habe umgerechnet: 1 ft = 0,3048 m,
1 mph = 1,609 km/h, 1 lb = 0,4536 kg, 1 slug·ft² = 1,356 kg·m².

**Sicherheit der Angaben:** ● = sicher (steht so im Quelltext oder Handbuch) · ◐ = wahrscheinlich (Ableger-Build, Guide, Deutung)
· ○ = unsicher (eigene Überschlagsrechnung, Rezension).

## Quellen

| Kürzel | Quelle | Lizenz / Status |
|---|---|---|
| **RtR** | Arcade-Quelltext des Vorgängers „Rush the Rock“ (`historicalsource/rushtherock`, Ordner `game/`). Die Fahrphysik wurde in 2049 weitgehend übernommen. | keine Lizenz, Copyright Time Warner Interactive → nur gelesen |
| **GC** | Debug-Build `rush_d.elf` mit Symbolnamen im Repo `cabi24/SFRush2049-decomp` (späterer GameCube/PC-Ableger von 2049). Daraus wurden nur Konstanten und Tabellen gelesen. | keine Lizenz → nur gelesen |
| **Decomp-Doku** | `cabi24/SFRush2049-decomp` `docs/*.md`, `src/game/stunt.c` | **nicht verwendet**: Das sind nachträglich ausgedachte Texte, die dem echten Code widersprechen. |
| **N64-HB / DC-HB** | Handbücher N64 und Dreamcast (regvault.org): Stunt Scoring S. 27, Default Controls S. 6, „Flying“ | Handbuch |
| **ARC-HB** | Betreiber-Handbuch des Automaten (aurcade.com, Nr. 00000444) | Handbuch |
| **FAQ-GF / FAQ-JP** | GameFAQs-Guides von superstar64 (v3.0) und JPlayer (Stunt/Race Coin FAQ v1.06), gelesen über web.archive.org | Fan-Guides |
| **Rev** | Rezensionen bei blackfalcongames (p=299, p=202) und videogamecritic (DC) | Rezension |
| **BAR** | `synamaxmusic/bar-decomp`: `src/modules/gamegui.c`, `src/game_init.c`, `src/modules/uvcont_rom.c`, `include/structs.h`. Fahrphysik (`motion.c`, `uvdyn_rom.c`, `cam.c`) ist dort **noch nicht dekompiliert**. Dazu das US-Handbuch S. 4, Nintendo Power 119 und das Fan-Wiki „Top speed stats“. | **AGPL-3.0** → nur Zahlen und Bezeichner gelesen |
| **SB** | Stuntbahn heute (Stand n36, `?physik=alt`), gemessen mit `tools/arcade_mess.mjs` in Node mit derselben Physik wie im Spiel | eigene Messung |

Video-Zeitstempel gibt es keine: Alle Angaben stammen aus Quelltext, Handbüchern und Guides, die genauer sind als Videos.

## 1. Wie Rush 2049 fährt (in eigenen Worten)

- **Grundmodell:** Unter der Haube steckt ein echtes Fahrzeugmodell mit Federbeinen, Reifen-Schräglauf, Drehmomentkurve und
  4-Gang-Automatik. Das Auto ist schwer, rund 1,6 t ●. Die Trägheit liegt bei 1360 / 2070 / 2220 kg·m² für Rollen, Nicken und
  Gieren ● (RtR `cars.c` `ROLL_MOI`/`PITCH_MOI`/`YAW_MOI`, GC `gCarModels` mit denselben Werten).
- **Haftung:** Die Reifen haften extrem gut, mit einem Reibwert von 2,6 vorn und 2,8 hinten ● (RtR `cars.c` `TIRE_*`). Ihr
  Maximum erreichen sie erst bei großem Schräglauf, vorn bei etwa 25°, hinten bei etwa 13° (aus `tire_constants` berechnet). Das
  Auto schiebt daher im Grenzbereich sanft über die Vorderräder. Eine einstellbare **Schleuder-Hilfe** erzeugt ein
  Gegen-Giermoment proportional zu Schräglauf × Tempo, in den Stufen stark, mittel und aus ● (RtR `drivsym.c` `antispin`;
  in 2049 je Handling-Stufe 1,0 / 0,5 / 0 ◐ GC `gTune`).
- **Lenkung:** Der größte Radeinschlag beträgt 33,75° ● (RtR `initiali.c` `steer_constants`). Am Pad gibt es eine Totzone von
  ±5 % ◐ (GC `_ReadSteeringWheel`). Eine tempoabhängige Begrenzung des Einschlags habe ich nicht gefunden. Laut Rezensionen lenkt
  das Auto langsam und berechenbar ein, lange Kurven quietschen und rutschen, und Drift steht nicht im Mittelpunkt ◐ (Rev,
  FAQ-GF). In scharfen Kurven tippt man die Bremse an, statt sie zu halten ◐ (FAQ-GF).
- **Tempo:** Im 4. Gang fährt das Auto etwa 290 km/h (180 mph). Pfeil-Booster bringen es auf etwa 320 km/h ◐ (FAQ-GF,
  N64-HB-HUD zeigt 202 mph). 2049 begrenzt hart bei 300 ft/s = 329 km/h ◐ (GC `velocities`). Für 0–100 km/h ergibt meine
  Überschlagsrechnung aus Motor, Getriebe und Masse etwa 2,3–2,7 s ○.
- **Wände:** Wände werfen das Auto nicht zurück. Es gibt eine weiche Kontaktschicht von 7,6 cm. Darin wird die Geschwindigkeit
  senkrecht zur Wand auf leicht nach außen gesetzt, es gibt also **keinen Rückprall** ● (RtR `stree.c` `COLL_test4`). Entlang
  der Wand reibt das Auto mit bis zu etwa dem 1,5-Fachen seines Gewichts. Es **schrammt** also und verliert dabei Tempo, steht
  aber nicht ● (RtR `stree.c`, Fall `SURF_COLLIDE`). Streifen erzeugt Funken ohne Explosion, parallel an der Wand verliert man
  wenig. Frontal bei hohem Tempo explodiert das Auto ◐ (Rev, FAQ-GF). Für 2049 wurde der Wandkontakt neu geschrieben; seine
  Konstanten sind nicht entschlüsselt ○ (GC `CarApplyCollision`).
- **Luft:** Es gilt volle Erdschwere (9,81 m/s²). Im Menü lässt sie sich auf ×1,15 / ×1,3 / ×1,5 erhöhen ● (RtR `modelcom.h`
  `GRAVCON`, GC `gravityArray`). Gefühlt ist die Schwerkraft trotzdem niedrig: Schon kleine Buckel heben ab, und je schneller
  die Anfahrt, desto weiter der Sprung ● (Rev, N64-HB). **Ohne Flügel gibt es keine Luftsteuerung**, das Auto dreht nur mit dem
  Schwung vom Absprung weiter ◐ (GC `torques`).
- **Flügel (nur Konsole):** Man hält eine Taste; die Flügel kommen erst, wenn alle Räder mehr als 1,5 m über dem Boden sind ◐.
  Stick vor und zurück nickt (Stick oben = Nase runter), Stick links und rechts rollt ● (N64-HB „Flying“). Das Moment wächst
  mit dem Tempo: Bei 110 km/h ergibt das etwa 150°/s² Nicken und 230°/s² Rollen ◐ (GC `torques`, `gWingSizes` 30/40/50).
  Beim **Sinken** tragen die Flügel einen Teil des Gewichts, je Typ ×0,8 oder ×0,5 Schwerkraft ◐ (GC `forces2`, `gWingLift`).
  Hält man zu lange, überschlägt sich das Auto; man fängt mit der Gegenrichtung ab ● (N64-HB). Eine Drehbremse in der Luft gibt
  es praktisch nicht ◐ (GC `gWingAngVDrag`).
- **Landen und Crash:** Es gibt keine echte Landehilfe ○. Man muss die Nase an die Neigung der Fahrbahn anpassen. Zu schief oder
  zu schnell führt zur Explosion; Gas bei der Landung führt eher zum Dreher ● (N64-HB, Rev). Crash-Regeln ● (RtR `drivsym.c`
  `checkok`) bzw. ◐ (GC `checkok`):
  - mehr als **135°** gekippt mit Straßenkontakt
  - Dach am Boden, kopfüber und unter 1,5 m/s
  - Gierrate über **10 rad/s**
  - sehr große geglättete Kraftsumme (harter Aufschlag)
- **Wiedereinstieg:** Nach einem Crash vergehen **3,5 s**, dann folgt ein **1,5 s** langer, durchsichtiger Flug im Bogen
  zurück auf die Ideallinie ● (RtR `resurrect.h` `CRASHDEL`, `RESURRECT_TIME`). Im Automaten wird die Wartezeit mit jedem
  Crash um 0,5 s kürzer, bis auf etwa 1 s ●. Der Einsetzpunkt wird so weit vorausgerechnet, dass man kaum Strecke verliert ●
  (`resurrect_car`). Man startet mit Teil-Tempo: im Automaten 40 % des Ideal-Tempos, in 2049 höchstens 160 km/h ●/◐.
- **Stunt-Wertung (Konsole):** Gezählt wird in **halben Umdrehungen** (180°) um eine Hauptachse. Erkannt werden sie ab 144°,
  bei der Landung reichen 99° ◐ (GC `_CheckFlip`/`_CheckRoll`/`_CheckSpin`).
  - Je halbe Drehung 5 Punkte, egal ob Salto vorwärts oder rückwärts, Rolle links oder rechts oder Drehung um die Hochachse ●
    (N64-HB). Gemischte Achsen geben 3 Punkte ●.
  - Airtime gibt 5 Punkte je Sekunde, aber erst **ab 5 s** Flug ●.
  - Eine „reine“ Figur ohne andere Achse bringt ×15 (Drehung) bzw. ×25 (Salto/Rolle) ●.
  - Flügel kosten Wertung: ohne Flügel ×7, unter 3 s Flügel ×2 ◐ (FAQ-GF).
  - Vielfalt multipliziert stark: 3 bis 10 verschiedene Figuren ergeben ×10 … ×1000 ◐.
  - **Nur eine Landung auf allen Rädern zählt**: Der Sprung wird 1 s nach der Landung abgerechnet, ein Crash nimmt die Punkte
    des Sprungs ● (N64-HB, DC-HB; GC `CheckForStunt`).
- **Kamera:** Die Verfolgerkamera hängt etwa **4,9 m hinter** dem Auto und 0,9 m hoch ◐ (GC `init_view3`; im Automaten 1,8 m ●
  RtR `camera.c` `View3Cam`). Mit dem Tempo wächst der Abstand um bis zu 25 %, und das Nachziehen wird straffer: von 0,8 im Stand
  auf 0,2 ab 150 km/h ●. Das horizontale Sichtfeld beträgt 90° ◐ (GC `HFOV`). **In der Luft** schwenkt die Kamera in 1 s auf den
  Blick entlang der Flugbahn mit Welt-Oben; sie dreht sich also bei Saltos nicht mit ●. Eine Sichtfeld-Weitung mit dem Tempo
  habe ich nicht gefunden.

### Ergänzung Straßenlage (Beetle Adventure Racing)
- Volle Lenkung kommt schon deutlich vor dem Anschlag des Sticks: Totzone ±7 von ±68–70 Rohwerten, dazwischen linear ● (BAR
  `uvcont_rom.c` `uvContNormalizeStick`). Das macht das Lenken direkt und verzeihend.
- Der Powerslide ist absichtlich leicht: in der Kurve kurz bremsen und dabei Gas halten, dann kommt das Heck. Eine eigene
  Handbremse sorgt für härtere Dreher ● (Handbuch S. 4, Nintendo Power 119).
- Die Höchstgeschwindigkeiten liegen je nach Klasse zwischen 159 und 213 km/h ◐ (Fan-Wiki, gemessen). Das Tempogefühl entsteht
  durch Strecke und Bildrate, nicht durch die Zahl.
- Wände und Gegner federn eher ab, und an manchen Wänden gleitet man entlang ○ (Rezension). Ein Reset-Knopf setzt sofort zurück ◐.
- Schwerkraft, Grip-Kurven, Kamera-Abstand und Luftverhalten: **nicht gefunden**, weil der Code noch nicht dekompiliert ist.

## 2. Vorbild vs. Stuntbahn heute (gleiche Messgrößen)

Die Stuntbahn-Werte sind gemessen mit `node tools/arcade_mess.mjs --var=alt` in echten Sekunden. Die Spielzeit wird durch das
Spieltempo geteilt: Mittel 1,0, Original 1,25. Die Welt der Stuntbahn ist doppelt so groß (Felder 40 m), und Original fährt
bewusst bis 580 km/h. Deshalb vergleiche ich Gefühl und Größenordnung, nicht Gleichheit.

| Messgröße | Vorbild (Rush 2049) | Stuntbahn heute 🟡 Mittel | Stuntbahn heute 🔴 Original |
|---|---|---|---|
| 0–100 km/h | ~2,3–2,7 s ○ | 3,06 s | 1,57 s |
| 0–200 km/h | ~6–7 s ○ | 7,08 s | 2,83 s |
| Höchsttempo | ~290 km/h, Deckel 329 ◐ | 264 km/h | 580 km/h |
| mit Boost/Nitro | Booster ~320 km/h (×1,1) ◐ | 306 km/h (×1,16) | 694 km/h (×1,20) |
| Kurvengrenze (Querbeschl.) | Reibwert 2,6–2,8 ● | R 25/50/100 m: 102 / 161 / 289 km/h | 82 / 125 / 215 km/h |
| Lenkung | 33,75° Einschlag, kein Tempo-Abschlag gefunden; lenkt „langsam, berechenbar“ ◐ | 0,6 rad / (1 + v/15) + 2°, 3 rad/s Lenkgeschwindigkeit | wie Mittel |
| Rutschen | schiebt über vorn, Schleuder-Hilfe je Stufe ● | Schleuderschutz (Gierrate) + Traktionskontrolle, Schwimmwinkel bei Übertempo 4–9° | ohne Hilfe |
| Wandkontakt | kein Rückprall, schrammt mit Reibung ≈ 1,5 g, frontal → Explosion ● | 150 km/h: 5° −7 %, 10° −8 %, **ab 15° Crash** (Aufprall ab 9,5 m/s senkrecht) | 5° −3 %, 10° −6 %, **ab 15° Crash** |
| Schwerkraft im Flug | 1,0 g (Option bis 1,5), mit Flügel beim Sinken ×0,8/×0,5 ◐ | 0,7 g nach 0,2 s Flug | 0,7 g |
| Airtime typischer Sprung | Rennstrecke ~1,5–3 s ○; Air-Punkte erst ab 5 s ● | Schanze 2,63 s / 97 m / Scheitel 5,9 m; Klippe 1 Ebene 1,87 s / 48 m; Klippe 2 Ebenen 2,28 s / 66 m | 2,18 s / 102 m; 1,53 s / 49 m; 1,84 s / 67 m |
| Luftsteuerung | nur mit Flügel: Nicken ~150°/s², Rollen ~230°/s² bei 110 km/h, wächst mit dem Tempo ◐ | **keine** (Lagehilfe richtet die Nase nach der Flugbahn aus, 15°/s) | **keine** |
| Landen ohne Crash | bis 135° Kippung ● (keine Hilfe) | flach bis 100° Rollen / 88° Nicken, gerade bis 22,6 m/s Sinken | 97° / 80°, 22,7 m/s |
| Crash → weiterfahren | 3,5 s + 1,5 s Rückflug = 5 s (Automat bis ~1 s) ● | 0,36 s (Totalschaden aus), 1,42 s (an) | 0,29 s / 2,09 s |
| Stunt-Wertung | 5 je halbe Drehung, Air ab 5 s, Landung Pflicht ● | **keine im Rennen** (nur Highlight-Film nach dem Ziel) | keine |
| Kamera Abstand / Höhe | 4,9 m / 0,9 m (Automat 1,8 m), +25 % mit Tempo ◐ | 5,0 m / 1,75 m (+1,2 m / +1,0 m bei Tempo) | 5,0 m / 1,75 m |
| Kamera Sichtfeld | 90° horizontal, fest ◐ | 62° vertikal (≈ 94° horizontal bei 16:9), +14 … +20° mit Tempo (halbiert) | wie Mittel, volle Weitung |
| Kamera in der Luft | schwenkt in 1 s auf die Flugbahn, Welt-Oben ● | Oben → Welt-Oben, Blickrichtung folgt aber der **Nase** des Autos | wie Mittel |

## 3. Was n37 daraus macht (Ziele)

| Zutat | Stuntbahn n37 (🟡 Mittel; 🔴 Original = gleiche Physik ohne Hilfen) | Begründung |
|---|---|---|
| Beschleunigung / Tempo | Mittel 0–100 ≤ 2,5 s, Vmax ~290–300 km/h (Nitro ×~1,19) | wie das Vorbild knackig; Peter fand n23 (Vmax 560 km/h) „unkontrollierbar“, daher kein Original-Tempo |
| Einlenken | Lenkgeschwindigkeit höher, volle Lenkung früher | direkter (BAR: volle Lenkung vor dem Anschlag) |
| Rutschen | Schleuderschutz lässt einen Schwimmwinkel bis ~15° zu und fängt erst darüber; kein Dreher | kontrollierbares Rutschen statt Schiene |
| Wand | weiche Kontaktschicht ohne Rückprall, wenig Reibung längs, das Auto dreht sich parallel zur Wand; Crash nur frontal (steiler Winkel und hohes Tempo senkrecht) | Vorbild: schrammen statt stoppen |
| Luft | Steuerung **ohne Flügel-Taste**: Gas = Nase runter, Bremse = Nase hoch, Lenken = Rollen; Moment wächst mit dem Tempo; 360° Salto in ~1,5 s | Touch hat keine Flügel-Taste; Saltos und Schrauben müssen auf der normalen Schanze (2,6 s) gehen |
| Schwerkraft im Flug | bleibt 0,7 g (Tempo-Fenster, Generator und Prüffahrt hängen daran) | Airtime ist schon lang; die Flugbahn ändert sich durch Drehen nicht |
| Landung | Mittel: sanfte Landehilfe, wenn die Lage höchstens ~50° vom Ziel abweicht; Crash erst über ~110° oder auf dem Dach | „Crash nur bei wirklich schiefen Landungen“ |
| Crash → weiter | ≤ 1,5 s auf allen Stufen (Original mit Totalschaden heute 2,09 s) | Vorbild 5 s ist zu lang fürs Handy |
| Stunt-Wertung | Anzeige mit der Formel aus dem Vorlagen-Datenblatt: Punkte je 0,1 s Luft, halbe Saltos, Drehungen und Rollen, saubere Landung ×1,25, Ketten-Fenster, Wiederholungs-Abschlag | nur Anzeige, Bestzeiten bleiben zeitbasiert |
| Kamera | in der Luft Blick entlang der Flugbahn statt der Nase, Welt-Oben | Saltos bleiben lesbar, keine Übelkeit |

## Unsicher / offen
- Für 2049 sind Beschleunigungswerte und 0–100 eigene Rechnungen aus Motor- und Getriebedaten des Vorgängers.
- Die Wandkonstanten von 2049 sind nicht entschlüsselt; die Beschreibung stammt vom Vorgänger und aus Rezensionen.
- Wie lange Sprünge auf den Rennstrecken des Vorbilds dauern, ist nicht belegt. Belegt ist nur, dass Air-Punkte erst ab 5 s Flug
  zählen, also sind lange Flüge üblich.
- BAR liefert nur Bedienung und Topspeeds, keine Physikzahlen.
