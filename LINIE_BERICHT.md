# Ideallinie mit Scheitelpunkten + „Leicht“ frei lenkbar (27.09.2026)

Peters Wünsche: „Die Ideallinie sollte die Kurvenscheitelpunkte beinhalten.“ – „Auf Leicht sollte man auch von der
Strecke lenken können.“ Beides ist umgesetzt.

## Teil 1 – Ideallinie

### Löser: exaktes QP statt Relaxation
Die alte bi-Laplace-Relaxation (1400 lokale Schritte) konvergierte nicht. Nach 60 000 Schritten lag sie auf der Demo
noch 47 cm, auf Seed 7 noch 137 cm neben dem Optimum. **Neu (`src/ai/ideal.js`)** wird dasselbe Ziel direkt gelöst:
min Σ|Q[k−1] − 2Q[k] + Q[k+1]|² mit Q = P + B·o und lo ≤ o ≤ hi.

- **Band-LDLᵀ:** Die Hesse-Matrix ist fünfdiagonal. Auf Rundkursen koppeln nur die beiden letzten Punkte über das
  Ende. Diese werden abgetrennt, der Rest ist ein reines Band plus ein 2×2-Schur-Komplement. Jede Lösung kostet O(n).
- **Active-Set:** Randpunkte werden festgehalten, der Rest exakt gelöst. Zuerst läuft Primal-Dual-Active-Set (schnell).
  Falls es pendelt (die Matrix ist keine M-Matrix), folgt ein primales Active-Set mit Schrittweite. Das ist monoton, weil
  jeder Schritt die Krümmung senkt. Zwei benachbarte feste Punkte entkoppeln die Linie, deshalb schreitet jeder Abschnitt
  für sich voran. Toleranzen (1e-5 m, 1e-6) verhindern endloses Pendeln auf Geraden, wo die Linie kraftlos am Rand liegt.
- **Grob nach fein (24 → 12 → 6 → 3 → 1,5 m):** Die Lösung der gröberen Stufe liefert Startwert und Randmenge für die
  nächste. Dadurch braucht die feinste Stufe meist nur 3–15 Durchgänge.

Warum so und nicht nur Mehrgitter-Relaxation: Das Ergebnis ist das echte Optimum und nicht bloß „nah dran“, und es gibt
keine Iterationszahl, die man je Strecke einstellen müsste. Die 5-cm-Grenze wird damit bei Weitem unterschritten.
**Fixpunkt-Test:** Die alte Relaxation, 30 000 Schritte lang auf der neuen Lösung gestartet, bewegt sich höchstens
0,3 cm. Der KKT-Rest liegt im Korpus bei < 1e-5.

**Laufzeit am Mac:** Typische Strecken 0,6–4 ms (vorher 13–46 ms). Korpus mit 148 Strecken: Median 5 ms (vorher 48 ms),
p90 20 ms, Maximum 69 ms (4,4 km). Die 20-km-Strecke LONG_GO2 braucht 226 ms (vorher 423 ms).

### Grenzen der Linie
- Die **Stunt-Abschnitte bleiben unverändert** auf der Bausteinspur (±0,3 m): Loopings, Röhren, Korkenzieher (Rolle und
  Wendel), Schanzen-Anlauf (30 m) und -Landung (bis 30 m hinter der Lücke). Luftabschnitte bleiben bei Versatz 0.
- **Überhöhte Fahrbahn** (Steilkurven, Steilstraßen und ihre Übergänge): höchstens ±1,2 m. Bei voller Breite hob das Auto
  am verwundenen Übergang ab oder rutschte in der Steilkurve nach innen. Das zeigte die Korpus-Analyse.
- **Start ±0,5 m**, weil das Auto in der Mitte steht.
- **Randzuschlag 0,5 m:** Die Baustein-Grenzen lassen nur 1,3 m bis zur Kante, das ist die Rad-Außenkante plus 0,4 m. Der
  Autopilot weicht am Rand bis ~0,5 m ab (99. Perzentil). Ohne Zuschlag rutschten auf Hochstraßen Räder über die Kante.
  Der Scheitel liegt daher 1,8 m vor der Innenkante (Linie = Wagenmitte, Innenräder ~0,9 m vor der Kante).
- **„Scheitel leicht spät“** ist nicht umgesetzt. Die Linie bleibt das symmetrische Minimal-Krümmungs-Optimum, sonst
  wäre der Maßstab (≤ 5 cm zum konvergierten Ergebnis) verletzt.

### Scheitel-Nutzung (Node, `node tools/linie_analyse.mjs --laps --ref=30000`)
Gezählt sind nur Kurven auf normaler Fahrbahn. 100 % heißt: Die Linie liegt am inneren Sicherheitsabstand. „Vorher“ ist
der alte Löser (1400 Schritte), gemessen an denselben Grenzen.

| Strecke | Länge | Kurven | Scheitel-Nutzung vorher → nachher | ≥ 95 % | eng (R < 20 m) | Abstand Linie–Innenkante | Löser | Fixpunkt |
|---|---|---|---|---|---|---|---|---|
| Demo | 553 m | 4 | 10 % → **100 %** | 0 → 4 | – | 4,23 → 1,80 m | 17 → 1,8 ms | 0,3 cm |
| Showcase | 1465 m | 5 | 25 % → **80 %** | 0 → 2 | 49 → 56 % | 3,83 → 2,34 m | 46 → 4,0 ms | 0,1 cm |
| Seed 7/2 | 1128 m | 11 | 37 % → **73 %** | 0 → 4 | 52 → 58 % | 3,49 → 2,52 m | 26 → 1,8 ms | 0,1 cm |
| Seed 42/3 | 1367 m | 15 | 48 % → **74 %** | 0 → 6 | 59 → 65 % | 3,14 → 2,47 m | 33 → 2,1 ms | 0,1 cm |
| Seed 20260927/2 | 981 m | 13 | 50 % → **67 %** | 0 → 3 | 53 → 64 % | 3,11 → 2,66 m | 26 → 1,4 ms | 0,0 cm |
| Seed 4711/3 | 1340 m | 15 | 50 % → **65 %** | 0 → 1 | 53 → 63 % | 3,16 → 2,74 m | 28 → 2,9 ms | 0,2 cm |
| Seed 1000/1 | 708 m | 8 | 36 % → **81 %** | 0 → 4 | 55 → 62 % | 3,54 → 2,31 m | 15 → 0,6 ms | 0,1 cm |
| OVAL.TRK | 588 m | 4 | 10 % → **100 %** | 0 → 4 | – | 4,23 → 1,80 m | 13 → 0,9 ms | 0,0 cm |
| SCHOTTER.TRK | 708 m | 4 | 10 % → **100 %** | 0 → 4 | – | 4,23 → 1,80 m | 15 → 0,7 ms | 0,1 cm |
| LONG_GO2.TRK (Korpus, 20 km) | 20030 m | 32 | 59 % → **93 %** | 0 → 24 | 59 → 94 % | 2,92 → 1,98 m | 423 → 226 ms | 0,2 cm |

Einzelne Kurven berühren den Innenrand 100 %ig. Kurven in Folgen (S-Kurven, Kurve direkt nach Kurve) tun das
physikalisch korrekt nicht. Die Minimal-Krümmungs-Linie nimmt dort nicht jeden Scheitel mit. Deshalb liegen die Werte
für enge Kurven der Generator-Strecken bei ~60 %.

### Nachgezogen
- **Tempo-Profil** (`profile.js`): Es rechnet auf der neuen Linie, größere Radien ergeben höhere Kurventempi.
- **Autopilot/Fahrhilfen:**
  - Der Tracker bestraft Sprünge entlang der Linie. An Kreuzungen lag der andere Durchgang sonst manchmal näher.
  - Resets setzen das Auto jetzt auf die Ideallinie statt in die Fahrbahnmitte.
- **Generator-Prüfung** (`verify.js`): `computeIdeal(line, { track })`. 30/30 Seeds lösbar, 0 Entschärfungen.
- **Anzeige** (`lineviz.js`): An jedem Scheitel liegt ein flacher Keil in Linienfarbe von der Linie bis kurz vor die
  Innenkante. Er ist Teil desselben Meshes, erscheint also nur bei eingeschalteter Linie und folgt Aus/Dezent/Kräftig.

### Autopilot-Runden vorher → nachher (alle 0 Crashs, alle Sprünge gelandet und im Tempo-Fenster)
| Strecke | Leicht | Mittel | Original |
|---|---|---|---|
| Demo | 0:28,52 → 0:27,94 (−2,0 %) | 0:28,49 → 0:27,93 (−2,0 %) | 0:28,54 → 0:27,99 (−1,9 %) |
| Showcase | 1:17,06 → 1:15,42 (−2,1 %) | 1:16,83 → 1:15,33 (−2,0 %) | 1:17,38 → 1:16,03 (−1,7 %) |
| Seed 7/2 | 1:11,27 → 1:10,07 (−1,7 %) | 1:11,97 → 1:10,68 (−1,8 %) | 1:12,36 → 1:11,14 (−1,7 %) |
| Seed 42/3 | 1:21,76 → 1:21,36 (−0,5 %) | 1:22,00 → 1:21,63 (−0,4 %) | 1:22,26 → 1:21,89 (−0,4 %) |
| Seed 20260927/2 | 0:59,77 → 0:58,96 (−1,4 %) | 0:59,85 → 0:59,06 (−1,3 %) | 1:00,15 → 0:59,33 (−1,4 %) |
| Seed 4711/3 | 1:20,78 → 1:21,62 (+1,0 %) | 1:20,93 → 1:21,73 (+1,0 %) | 1:21,31 → 1:22,11 (+1,0 %) |
| Seed 1000/1 | 0:40,22 → 0:39,34 (−2,2 %) | 0:40,18 → 0:39,33 (−2,1 %) | 0:40,32 → 0:39,45 (−2,1 %) |
| OVAL.TRK | 0:26,36 → 0:24,55 (−6,9 %) | 0:26,36 → 0:24,55 (−6,9 %) | 0:26,42 → 0:24,61 (−6,8 %) |
| SCHOTTER.TRK | 0:33,02 → 0:31,21 (−5,5 %) | 0:33,06 → 0:31,22 (−5,5 %) | 0:33,29 → 0:31,41 (−5,7 %) |
| LONG_GO2.TRK | 16:50,96 → 17:02,21 (+1,1 %) | 16:44,32 → 16:55,82 (+1,1 %) | 16:48,65 → 16:58,70 (+1,0 %) |

Seed 4711 und LONG_GO2 sind etwa 1 % langsamer. Grund sind die bewusst verengten Steilkurven/Übergänge und der
Randzuschlag. Die alte, nicht konvergierte Linie fuhr dort zufällig breiter. Ohne diese Grenzen war der Korpus
unsicherer, siehe unten.

**Korpus, 200 Archiv-Strecken:**

| Prüfung | vorher | nachher |
|---|---|---|
| Autopilot im Ziel auf Leicht | 194 | 194 |
| davon ohne Crash | 182 | 181 |
| streng ohne Hilfen | 172 | 172 |
| Rundenzeit (Median) | – | −3,1 % Leicht / −3,4 % streng |

Streng verschieben sich 8 Strecken in jede Richtung. Ohne die Stunt- und Steilkurven-Grenzen und ohne den Randzuschlag
wären es anfangs 94 statt 104 von 120 gewesen.

## Teil 2 – „Leicht“ frei lenkbar (`src/game/race.js`, `FREE`)
- **Vorrang:** Ab |Lenkung| > 0,5, 0,2 s gehalten, blendet der Zug zur Linie in 0,25 s aus, danach lenkt nur der Spieler.
  Gemessen mit Tastatur-Rampe: ganz aus nach 0,61 s ab Tastendruck. Kleine Einschläge (< 0,5) übernehmen nicht, dann
  fährt Leicht wie bisher auf der Linie.
- **Loslassen** (< 0,15 für 0,2 s): Die Hilfe blendet in 1 s ein. Das Ziel des Autopilots startet an der Autoposition
  und wandert mit glattem Verlauf (1,2–3 s) auf die Linie. Es liegt dabei höchstens 5 m seitlich vor dem Auto, damit der
  Anfahrwinkel flach bleibt. Die Lenkänderung der Hilfe ist auf 4/s begrenzt, also ohne Ruck und ohne Zurückschnappen.
  Mit großem Kurswinkel bremst das Auto auf der Wiese erst etwas ab.
- **Gas** bleibt automatisch, neben der Fahrbahn höchstens 16 m/s und 80 % Gas. **Die Bremse des Spielers geht immer vor.**
- **Stunts:** Loopings, Röhren, Korkenzieher und Sprunganlauf lenkt weiter der Autopilot, dazu die letzten ~1,2 s davor
  (Ausrichten). Ab ~2,5 s vorher ist Übernahme gesperrt, und das HUD zeigt „🤖 Looping voraus – Autopilot lenkt“.
- **Abkürzen (alle Stufen):** Neben der Fahrbahn (Wagenmitte > 1 m hinter der Kante) wird der Streckenfortschritt gegen
  die gefahrene Strecke gerechnet. Ist der Gewinn größer als 8 m + 15 %, geht es zurück an die Stelle, an der das Auto die
  Fahrbahn verlassen hat, samt Checkpoint-Stand. Die Uhr läuft weiter, das HUD zeigt „Abkürzung ↺“. Herumfahren ohne
  Gewinn ist erlaubt. Die Festgefahren-Regel greift beim freien Fahren im Gelände erst nach 20 s ohne Fortschritt.
- **Abseits** bleibt großzügig (30 m, 4 s). Ab 18 m zeigt das HUD „Zurück zur Strecke ↺“.
- **Eingabegeräte:** Alle (Tastatur, Gamepad, Touch-Hälften, Touch-Knöpfe, Neigen) laufen über `input.steer`, es gilt
  also überall. Hilfe-Text (Steuerung, Optionen/Ideallinie, Fahrhilfe-Hinweis im Menü) und README sind angepasst.

### Node-Test `tests/node/test_free_steer.mjs` (in `run_all`)
- A: Nach 2 s voll links (Tastatur, ~78 km/h) ist das Auto **10,5 m neben der Fahrbahn**. Nach dem Loslassen ist es nach
  **5,5 s** ohne Crash zurück auf der Linie (< 1 m). Das Auto lief nach dem Loslassen noch bis 24 m hinaus, weil das
  Einblenden 1 s dauert und es auf der Wiese erst umlenken muss. Lenkänderung der Hilfe ≤ 3/s. Danach fährt Leicht
  allein ins Ziel.
- B: Lenkeinschlag 0,4 übernimmt nicht.
- C: Abkürzen bringt keine Zeit.
  - Kehre: kein Gewinn auf allen Stufen.
  - Schleife (180 m Umweg, Schenkel 20 m auseinander): Die Regel greift auf allen 3 Stufen. Mittel ohne Regel 14,3 s statt
    17,3 s, mit Regel 29,4 s.
- D: Der Spieler lenkt ab 40 m vor dem Looping dauernd voll. Die Ansage kommt, der Looping wird ohne Crash durchfahren.

Nebenwirkung: Der Stress-Bot „zappelig“ (Zufallslenkung, test_assists) hat auf Leicht nun Vorrang und fährt deshalb
wild. Er kommt weiter ins Ziel, aber mit Crashs und Resets (vorher „auf Schienen“ 0 Crashs). Das ist gewollt.

## Sichtprüfung (`python3 tests/linie_shots.py`, Fotos in tests/shots/linie/)
Pixel 7 quer und Desktop geprüft:
- Kurven von schräg oben: Die Linie kommt außen an, erreicht am Keil die Innenseite und läuft außen hinaus.
- Kräftig: Der Keil ist deutlich sichtbar. Dezent: Er ist zart, aber erkennbar. Aus: weder Linie noch Keil.
- Fahrbahn und Markierungen bleiben lesbar.
- Verfolgerkamera: Die Linie schwenkt vor der Kurve nach außen.
- HUD: Ansage vor dem Looping und „Zurück zur Strecke ↺“ im Gelände sind lesbar.
- 0 Seitenfehler.

## Tests
- `npm run test:node`: alle 10 grün, inklusive Korpus-Stichprobe.
- Playwright grün: smoke, test_race, test_touch, test_reset_ui, test_lineviz, test_cockpit_ui, test_trk_ui, test_fx,
  test_sound_pad, linie_shots.
- Cache-Busting über `tools/update_sw.py` (neue Version in sw.js/src/build.js).

## Grenzen / offen
- Scheitel „leicht spät“ vor langen Geraden ist nicht umgesetzt (siehe oben).
- Steilkurven werden bewusst nicht voll ausgenutzt (±1,2 m).
- Handy-Test von Peter:
  - Fühlt sich die Übernahmeschwelle 0,5 / 0,2 s beim Neigen gut an?
  - Ist die Rückführung nach großen Ausflügen (~5–6 s) angenehm?
