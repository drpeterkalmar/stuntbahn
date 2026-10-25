# n41 – ↺ Reset-Knopf (25.10.2026)

Auftrag (Peter 22.10.2026): „Bitte 1 Klick Reset auf die Strecke (statt Zurückspulen).“

## Kurz für Peter
Der Knopf oben rechts heißt jetzt **↺ Reset**: ein Tipp, und dein Auto steht sofort wieder mitten auf der Strecke, in
Fahrtrichtung und mit Schwung, wie nach einem Crash; das kostet wie ein Crash +5 s, damit es nie eine Abkürzung ist.
Zurückspulen gibt es weiter über Taste R, das Gamepad (Steuerkreuz ◀) und im Pause-Menü.

## Was sich geändert hat
- **HUD:** ⏪ → **↺ Reset** (Symbol mit „Reset“ darunter, 52 × 52 px), auf allen Stufen (⏪ war auf Original ausgeblendet).
  Gleich viele Knöpfe wie bisher, quer und hochkant ohne Überlappung (auch online mit 💬). Nach dem Tipp ist der Knopf 1 s
  gedimmt (Doppeltipp-Schutz).
- **Ablauf** (`Race.requestReset`, `src/game/race.js`): +5 s (`PENALTY`) auf die Uhr, groß „+5 s ↺ Reset“, Aufblitzen,
  nach 0,35 s (`RESET_DELAY`, wie beim Crash) `safeReset`: auf die Ideallinie, ~12 m zurück bzw. im/kurz vor einem Stunt
  ~45 m vor das Element mit dem Anlauftempo aus dem Profil. Gemessen: Looping und Schanze 46 m davor mit 74 bzw. 89 km/h
  (= Anlauftempo), danach ohne Crash hindurch (Leicht und Mittel).
- **Nie eine Abkürzung:** Strafe wie beim Crash; Rennzeit im Ziel = gefahrene Zeit + Strafen (geprüft auf allen drei
  Stufen mit 4 Resets). Neben der Fahrbahn zählt die Stelle, an der man sie verlassen hat (Runde, Checkpoints wie dort).
  Der Reset setzt nie hinter ein Element (das „Überspringen“ nach mehreren Crashs bleibt Crashs vorbehalten).
- **Totalschaden an:** Im Wrack holt der Knopf das Auto sofort zurück auf die Fahrbahn statt zurückzuspulen; auf die Uhr kommt
  nur die Restwartezeit (kein Vorteil gegenüber Warten). Während der Fahrt kostet er auch dort +5 s.
- **KI-Gegner:** Der Reset läuft über denselben Zustand wie der Crash-Reset → kurze Geist-Phase (≥ 1,5 s, solange ein Auto
  näher als 5,5 m ist). Test: Gegner exakt auf den Rücksetzpunkt gesetzt → 0 Stöße, kein Crash.
- **Online:** Während des Resets meldet das Auto „Crash“ (andere sehen einen Geist), danach zählt der Sprung-Zähler hoch
  (1,5 s ohne Kollision bei den anderen); die Strafe geht in die Zieltabelle. Test mit zwei Geräten im Fake-Netz.
- **Tasten:** `T` oder `Backspace` = Reset, Gamepad **Y** = Reset (bisher Zurückspulen); Zurückspulen: `R`, Gamepad
  **Steuerkreuz ◀**, Pause-Menü „⏪ 3 s zurückspulen“ (Leicht/Mittel). Im Pause-Menü zusätzlich „↺ Reset (+5 s)“.
- **Texte:** Steuerungsseite (neuer Abschnitt ↺ Reset, Tasten, Gamepad), Hinweis im Gelände „Zurück zur Strecke – oder
  ↺ Reset“, README, CHANGELOG.

## Tests
- `npm run test:node`: alle 62 grün; neu `test_reset.mjs` Teil F (Strafe, Doppeltipp, Countdown/Ziel gesperrt, 3 Resets
  hintereinander, Rennzeit, Looping/Schanze, Gelände, Totalschaden, KI-Gegner, Online-Zustand) und ein Online-Reset in
  `test_onlinespiel.mjs`.
- Browser (Pixel 7 quer + hoch, GPU, stumm): neu `tests/test_reset_knopf.py` (Knopf, Tipp, Doppeltipp, Tasten T/Backspace/R,
  nachgebautes Gamepad Y/◀, Pause-Menü Mittel/Original, Online-Leiste, Hilfe, KI-Gegner) grün; `test_reset_ui.py` grün;
  `smoke.py` 0 Fehler; `test_touch.py`: angepasst (Original zeigt jetzt ↺), einzig rot ist „settings sauber“ hochkant
  („Mit Fahrfolgen“ Text 114 > 105 px) – derselbe Fehler auch auf dem unveränderten main, nicht von dieser Änderung.
- Bilder: Collage `tests/shots/n41/collage_n41.jpg` (oben quer: HUD, Tipp „+5 s ↺ Reset“; unten hoch: HUD, Tipp, Pause-Menü);
  Einzelbilder erzeugt `python3 tests/test_reset_knopf.py` in `tests/shots/n41/`.
