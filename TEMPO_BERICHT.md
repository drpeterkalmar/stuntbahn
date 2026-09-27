# Stuntbahn – doppelt so schnell (27.09.2026)

Peters Wunsch: „Bitte schneller fahren (km/h können gut doppelt so hoch werden).“

## Kurz
- **Vmax 286 → 586 km/h** auf der Ebene. Das ist echte Geschwindigkeit der Physik, keine umgerechnete Anzeige.
  GAME_SPEED bleibt 1,25.
- **0–200 km/h: 10,8 → 3,8 s.** 0–400 km/h in 7,3 s. Bremsen aus Vmax mit bis zu 3,7 g.
- Rennreifen (Haftung ×1,5) und Abtrieb: Kurven sind ~22 % schneller, Bremswege kürzer.
- **Rundenzeiten 11–21 % schneller.** Das Höchsttempo auf den Strecken steigt um 20–45 %.
  Auf dem langen Test-Ring sind es 339 km/h, im Korpus bis 371 km/h.
- **Ehrliche Grenze:** Die ~580 km/h erreicht man auf keiner Strecke des Spiels. Das Raster hat 20-m-Felder
  (höchstens 600 m Gerade), und von 0 auf 500 km/h braucht das Auto 915 m. Die Generator-Strecken sind eng.
  Deshalb verdoppelt sich die angezeigte Spitze dort nicht. Sie steigt von ~100–140 auf ~110–200 km/h.
  Mehr ginge nur mit größerem Maßstab oder längeren Geraden (siehe „Offen“).
- Alle Stufen fahren alle Test-Strecken ohne Crash. Sprünge landen im Fenster, Loopings, Röhren und
  Korkenzieher laufen sauber.

## Weg: Option A (Abstimmung). Kein neuer Maßstab.
Option B hätte eine veränderliche Feldgröße für Generator-Strecken gebraucht. Loopings, Schanzen, Szenerie,
Gelände und die „Verirrt“-Grenze hängen alle an `TILE` = 20 m. .TRK-Kacheln sind ohnehin fest.
Das war für einen Auftrag zu riskant, denn Sprünge und Loopings hätten sich mit verändert.
Option A lässt die Stunt-Geometrie unverändert. Die Messungen zeigen, dass sie nirgends bricht:
Sprung-Scheitel 3,0 m, Flugzeit 2,16 s, Landung bei 14 m der Rampe, alles wie vorher.
Die Grenze liegt also nicht in kaputter Geometrie, sondern in der Länge der Geraden.

### Abstimmung (`src/physics/car.js`, alte Werte als `CAR_DEF_ALT`)
| | alt | neu |
|---|---|---|
| Leistung | 240 kW | **2,2 MW** |
| Luftwiderstand dragK | 0,43 | 0,48 (mehr Motorbremse bei Tempo, gleiche Vmax bei kräftigerem Durchzug) |
| Abtrieb downK | 1,1 | **1,5** |
| Reifen mu | 1,0 | **1,5** (Rennreifen) |
| Antrieb max. | 15,5 kN | 18 kN **× Aero-Last** |
| Bremse | 27 kN | 27 kN **× Aero-Last** |
| Gänge (Spitze m/s) | 13/22/31/41/53/70 | 20/35/55/82/117/165 |

**Neu ist die Aero-Last** `aeroLoad = 1 + Abtrieb/Gewicht`: Antriebs- und Bremskraft wachsen damit, weil der
Abtrieb die Reifen auf die Straße drückt. Bei 100 km/h ist das ×1,1, bei 360 km/h ×2,2, bei Vmax ×3,9.
So sind bei Tempo 3–4 g Bremsen möglich, bei niedrigem Tempo bleibt es beim Grip-Limit.
Warum auch Rennreifen: Nur mit Motor und Abtrieb stieg das Tempo auf den Strecken um bloß 10–15 %, die
Runden wurden nur 2 % schneller. Die engen Kurven (R = 10/30 m) und das Bremsen davor bestimmen die Zeit.

### Messung (Node, gleiche Physik, `node tools/tempo_measure.mjs`, Ebene Asphalt, Vollgas/Vollbremsung)
| | Vmax | 0–100 | 0–200 | 0–300 | 0–400 | 0–500 | Bremsweg 200→0 | Vmax→100 |
|---|---|---|---|---|---|---|---|---|
| alt | **286 km/h** | 2,8 s / 44 m | 10,8 s / 396 m | – | – | – | 106 m (1,4 g) | 158 m (1,6 g) |
| neu | **586 km/h** | 2,0 s / 28 m | **3,8 s / 100 m** | 5,2 s / 203 m | **7,3 s / 408 m** | 11,3 s / 915 m | 69 m (2,1 g) | 273 m (3,7 g) |

Drehzahl und Gänge: Bei Vmax läuft der 6. Gang mit 7445 U/min, knapp unter dem Begrenzer (7600).
Bei 339 km/h ist es der 5. Gang mit 5400 U/min. Auf engen Strecken fährt man meist im 1.–3. Gang (bis 126 km/h),
dort klingt der Motor wie bisher. Der Replay-Gang stimmt in 100 % der Bilder mit dem Gang der Physik überein.

## Nachgezogen
- **Tempo-Profil** (`src/ai/profile.js`):
  - Höchsttempo kommt aus der Abstimmung (`topSpeed`), vorher fest 68 m/s.
  - Die Bremsverzögerung wächst mit Tempo und Reifen (`brakeDecel`), vorher fest 8 m/s².
  - Die Vorwärtsrechnung nutzt `driveAccel`, vorher standen Motorwerte direkt im Code.
  - Kurven-Höchsttempo: Querhaftung mit Reifen-mu und 80 % des Abtriebs.
  - Kurventempi kommen weiter aus der neuen Ideallinie. Linie und Leicht-Vorrang sind unverändert.
- **Neue Profil-Grenzen.** Das alte Auto erreichte das Profil-Tempo oft gar nicht, das neue schon. Das deckte auf:
  - *Anfahrt zu Looping/Röhre/Korkenzieher/Engstelle:* In den 25 m davor gilt in Kurven 65 statt 82 % Haftung,
    damit das Auto nicht seitlich versetzt einfährt. Ohne das flog es im Korkenzieher ab.
  - *Engstellen* (Fahrgasse < 1 m, Slalom-Blöcke): höchstens 56 km/h, ab 20 m davor.
  - *Rollrate* höchstens 3,2 rad/s bei verwundener Fahrbahn.
  - *Import-Sprünge ohne gültiges Tempo-Fenster* bekommen ein Notfenster mit dem weichsten Aufprall.
    Vorher gab es gar keine Vorgabe, und das schnelle Auto flog weit über die Landung hinaus.
- **Sprünge:** `jumpWindow` sucht 8–70 m/s (vorher 10–40), `genericJumpWindow` 8–70 m/s (vorher 8–48).
  Die Fenster selbst bleiben gleich (Standard-Schanze 14,2–19,5 m/s), sie hängen an der Geometrie.
- **Autopilot:** Er nutzt denselben Lenkwinkel wie die Physik (`maxSteerAt`). Sonst musste nichts geändert werden.
- **Abkürz-Regel (Fehler behoben):** Der Rücksetzpunkt wird nur noch auf der Fahrbahn gemerkt, nie über einer
  Sprunglücke. Dort fiel das Auto nach dem Versetzen herunter. Mit dem schnelleren Auto trat das auf.
- **Generator:** Keine Änderung nötig. Die Strecken bleiben gleich (Strecke des Tages bleibt wiedererkennbar),
  die Prüfung läuft durch: 120/120 lösbar, 0 Entschärfungen.
- **Tacho:**
  - Cockpit-Skala 0–600 km/h, Zahlen alle 100, Striche alle 20.
  - HUD-Digitalfeld 3 Stellen breit, damit nichts springt.
  - Drehzahlmesser unverändert.
- **Kamera** (`src/gfx/camera.js`):
  - Der Verfolger hing bei Tempo zurück (Verzug ≈ Tempo/14, bei 580 km/h > 11 m). Jetzt nimmt er einen Teil
    der Autobewegung mit, der Verzug bleibt höchstens 3 m. Bis 150 km/h verhält er sich exakt wie bisher.
  - Das Sichtfeld wird über ~250 km/h sanft um bis zu 6° weiter (vorher Schluss bei +14°).
  - Das Cockpit behält das feste Sichtfeld (gegen Übelkeit, wie im Cockpit-Auftrag).
  - Motion Blur ist nicht eingebaut (Job n7).
- **Ton:** Der Fahrtwind wird ab 200 km/h lauter und heller (bis 0,6 statt 0,35, Tonhöhe ×1,45 bei Vmax).
- **Nitro:** nicht vorweggenommen (Job n6).

## Bestzeiten / Geister
Neue Physik = neue Wertung: Schlüssel mit Zusatz **`@t2`** (`src/game/store.js`, `PHYS`).
- Alte Einträge bleiben unverändert gespeichert. Nichts wird gelöscht oder umgeschrieben.
- Menü und Bibliothek zeigen sie klein als **„alte Physik: 🟢 1:10,3 …“** (nur Anzeige, nicht vergleichbar).
- Alte Geister werden nicht gegen die neue Physik abgespielt.
- `?auto=alt` fährt mit der alten Abstimmung und wertet dann wieder in den alten Listen. Das ist zum direkten
  Vergleich am Handy gedacht.

## Autopilot-Runden alt → neu (alle drei Stufen, `node tools/tempo_measure.mjs --laps`)
Leicht = Spieler tut nichts. Mittel/Original = Autopilot-Eingabe („perfekter Spieler“).
**In allen Zeilen: 0 Crashs/Resets. Alle Sprünge landen und liegen im Tempo-Fenster.**

| Strecke | Leicht | Mittel | Original | Höchsttempo alt → neu |
|---|---|---|---|---|
| Demo (553 m, 1 Sprung) | 0:27,94 → **0:23,97** (−14 %) | 0:27,93 → 0:24,00 | 0:27,99 → 0:24,06 | 97 → **125 km/h** |
| Showcase/Beispiel.TRK (1465 m, Looping, Slalom, Korkenzieher, Röhre, Sprung) | 1:15,42 → **1:07,22** (−11 %) | 1:15,33 → 1:07,02 | 1:16,03 → 1:07,42 | 138 → **197 km/h** |
| Seed 7/2 | 1:10,07 → **1:02,61** (−11 %) | 1:10,68 → 1:03,21 | 1:11,14 → 1:03,56 | 103 → 125 km/h |
| Seed 42/3 (2 Sprünge) | 1:21,36 → **1:12,42** (−11 %) | 1:21,63 → 1:12,64 | 1:21,89 → 1:12,82 | 101 → 134 km/h |
| Seed 20260927/2 | 0:58,96 → **0:50,84** (−14 %) | 0:59,06 → 0:50,94 | 0:59,33 → 0:51,10 | 87 → 107 km/h |
| Seed 4711/3 (2 Sprünge) | 1:21,62 → **1:11,70** (−12 %) | 1:21,73 → 1:11,88 | 1:22,11 → 1:12,15 | 101 → 126 km/h |
| Seed 1000/1 | 0:39,34 → **0:33,34** (−15 %) | 0:39,33 → 0:33,35 | 0:39,45 → 0:33,44 | 106 → 138 km/h |
| OVAL.TRK | 0:24,55 → **0:19,45** (−21 %) | 0:24,55 → 0:19,48 | 0:24,61 → 0:19,56 | 132 → **187 km/h** |
| SCHOTTER.TRK | 0:31,21 → **0:24,84** (−20 %) | 0:31,22 → 0:24,84 | 0:31,41 → 0:24,95 | 132 → 185 km/h |
| ZIP1.TRK | 0:21,96 → **0:17,51** (−20 %) | 0:21,97 → 0:17,53 | 0:22,02 → 0:17,59 | 127 → 176 km/h |
| ZIP2.TRK (Eis) | 0:41,03 → **0:33,27** (−19 %) | 0:41,79 → 0:33,84 | 0:42,48 → 0:34,31 | 104 → 132 km/h |
| Test-Ring (2 × 480 m Gerade, Browser) | – | – | – | **339 km/h**, Leicht 0 Crashs |

### Breitere Prüfungen
| Prüfung | vorher | nachher |
|---|---|---|
| Generator 40 Seeds × 3 Stufen (Autopilot ohne Hilfen) | 120/120 | **120/120**, 0 Entschärfungen |
| Generator „Leicht“, Spieler tut nichts (`jump_easy_batch 40`, 86 Schanzen) | 120/120 | **120/120 ohne Crash**, Flugzeit 2,06 s, härtester Aufprall 4,4 m/s |
| Sprung-Messung Standard-Schanze | Scheitel 2,96 m, 2,13 s, Weite 33,7 m | 3,01 m, 2,16 s, 34,4 m (leicht weniger Luftwiderstand) |
| .TRK-Korpus 200: Autopilot im Ziel, Leicht | 194 (97,0 %) | **194 (97,0 %)** |
| · davon ohne Crash | 181 | **185** |
| · streng ohne Hilfen | 172 (86,0 %) | **183 (91,5 %)** |
| · Höchsttempo je Strecke (Leicht), Median / 90 % / Max | 134 / 175 / 205 km/h | **183 / 286 / 371 km/h** |
| Simulierte Spieler (`test_assists`), Original „normal“, Crashs auf 3 Strecken | 8 / 12 / 6 | **4 / 8 / 4** (mehr Haftung verzeiht mehr) |
| Mittel „normal“ | 2 / 2 / 2 | 0 / 1 / 1 |

„vorher“ bei Korpus und Runden = Stand 88e1719 (LINIE_BERICHT bzw. derselbe Messlauf vor dem Umbau).
Im Korpus streng gewinnen 23 Strecken, 7 verlieren. Bei diesen 7 kommt der Autopilot ohne Hilfen fast immer
direkt aus einer engen Kurve in einen Slalom und trifft einen Block. Das alte Auto kam dort mit knapper Not durch.
Auf Leicht schaffen alle 7 das Ziel.

## Tests
- `npm run test:node`: **alle 10 grün**.
  - Angepasst: Tacho-Skala 600 (`test_cockpit`).
  - Neue Bestzeit-Schlüssel (`test_reset`).
  - `test_free_steer`: Das Anfahren geht jetzt bis 80 km/h statt fest 2,2 s. Die Rückkehr-Grenze liegt bei 7 statt
    6 s, weil das Auto mit Rennreifen bei vollem Einschlag enger einlenkt. Es steht dann steiler zur Strecke,
    der Rückweg dauert 6,2 s.
- Playwright, **alle grün, 0 pageerrors:**
  - smoke, test_race, test_touch, test_cockpit_ui, test_reset_ui, test_lineviz, test_trk_ui, test_fx, test_sound_pad
  - `cockpit_shots quer` **10/10**
  - neu `tempo_shots`: HUD = Physik, Tachozeiger = Tempo auf 0–600, Verfolger 5,7 m hinter dem Auto bei 334 km/h,
    Sichtfeld 77°, Ziel ohne Crash
  - `?auto=alt` im Browser: alte Leistung aktiv, 0 Fehler
- Cache-Busting: `tools/update_sw.py` → neue Version.

## Fotos (Handy quer, selbst angesehen)
Alle unter `tests/shots/final/`:
- `tempo_ring_verfolger.jpg` – 333 km/h, 5. Gang. Das Auto steht sauber im Bild und die Fahrbahn zieht
  sichtbar vorbei, HUD gut lesbar.
- `tempo_ring_cockpit.jpg` – Tachozeiger bei 339 auf der neuen Skala 0–600. Die Zahlen 0…600 sind lesbar,
  Drehzahl ~5400, die Kulisse zeigt den 5. Gang.
- `tempo_tag_verfolger.jpg` – Strecke des Tages auf Mittel an ihrer schnellsten Stelle (101 km/h, 2. Gang)
  mit Touch-Tasten.

## Offen / Grenzen (ehrlich)
- **Die 586 km/h sind auf keiner Strecke erreichbar**, weil die Geraden höchstens ~480 m lang sind. Auf den
  generierten Strecken liegt die Spitze meist bei 110–200 km/h.
  Wenn Peter auch dort deutlich höhere Zahlen sehen will, gibt es zwei Wege:
  1. **Generator-Variante mit langen Geraden und weiten Kurven** („Speedway“). Das wäre ein eigener Auftrag,
     weil sich damit alle generierten Strecken ändern würden.
  2. **Größerer Maßstab nur für generierte Strecken** (Option B).
- Die Stunt-Tempi (Looping, Sprung ~60 km/h, Slalom ≤ 56 km/h) bleiben bewusst gleich. Vor Sprüngen muss man
  jetzt aus viel höherem Tempo herunterbremsen.
- Der Fahrtwind-Ton ist nur rechnerisch geprüft. Die Lautstärke am Handy habe ich nicht gehört.

## Bitte am Handy testen
1. **Strecke des Tages** auf Leicht und auf Mittel: Fühlt sich das Anfahren aus Kurven deutlich kräftiger an?
   Zu nervös?
2. **Original:** Findet man den Bremspunkt vor Kurven und Sprüngen, bei bis zu 3–4 g Verzögerung?
3. Lange Gerade (z. B. eine Import-Strecke mit Autobahn): Wirkt 300+ km/h schnell genug? Passt das Sichtfeld?
   Hängt die Kamera ruhig hinter dem Auto?
4. Cockpit: Ist der Tacho mit 0–600 noch gut ablesbar?
5. Direkter Vergleich: denselben Link mit `?auto=alt` (alte Abstimmung).
6. Sollen die Geraden länger werden (Speedway-Generator) oder reicht das so?
