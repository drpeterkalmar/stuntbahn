# Stuntbahn – Totalschaden optional, Standard = Fahrbahn-Reset mit 5 s Zeitstrafe (27.09.2026)

Wunsch von Peter: „Der Hauptfrustfaktor bei Stunts war für mich der Totalschaden. Standardmäßig ausschalten,
wahlweise in den Optionen einschalten. Statt des Crashs ein Fahrbahn-Reset mit 5 s Zeitstrafe.“

## Verhalten
- **Neue Option „💥 Totalschaden“** (Optionen → Crash), **Standard: Aus**, gilt für alle drei Fahrhilfen und wird
  gespeichert. Bisher hing das Wrack an der Stufe (Leicht ohne, Mittel/Original mit Wrack); diese Kopplung ist weg.
- **Totalschaden aus:** Jeder Crash (Überschlag, Aufprall an der Wand, Absturz, harte Landung, Abseits,
  Festgefahren, falsche Richtung …) → **kein Wrack**. Sofort +5 s auf die Uhr, großes „+5 s“ mit dem Grund darunter,
  kurzes Aufblitzen (0,35 s Spielzeit, ≈ 0,28 s echt) und ein kurzes „Wusch“ statt des langen Crash-Geräuschs.
  Dann steht das Auto über `safeReset()` auf der Fahrbahn vor dem Element, richtig ausgerichtet, mit Profil-Tempo
  (fliegender Neustart). Die Kamera setzt neu an (kein Schwenk quer über die Strecke).
  - Die **Uhr läuft durch** (sie wird nie zurückgedreht), HUD zeigt dauerhaft „inkl. +10 s Strafe“.
  - **Wiederholt am selben Element gescheitert:** auf Leicht wird man schon beim 2. Crash hinter das Element
    gesetzt (dort fährt der Autopilot die Stunts, ein zweiter Crash wäre kein Spielerfehler), auf Mittel/Original
    beim 3. Jeder dieser Crashs kostet +5 s, eine Endlosschleife gibt es nicht.
  - Ergebnis: „💥 2 Strafen × 5 s = +10 s“ bzw. „✨ Ohne Crash – keine Strafzeit“, dazu die Totalschaden-Einstellung.
- **Totalschaden an:** Wrack wie bisher. Leicht/Mittel spulen danach 3 s zurück (samt Uhr), Original setzt vor das
  Element. Neu ist nur, dass Leicht mit Totalschaden an jetzt auch ein Wrack zeigt, denn das ist der Sinn des Schalters.

## Entscheidung zum ⏪-Knopf
Ohne Totalschaden **spult ⏪ nur das Auto zurück, nicht die Uhr** (keine zusätzliche Strafe). Begründung:
Das ist von selbst fair. Man steht wieder dort, wo man vor 3 s war, und die Uhr zeigt die volle Zeit, also kostet
jedes Rückspulen genau die Zeit, die man neu fährt, und bringt nie einen Vorteil. Als Rettung kurz vor einem
sicheren Crash ist es trotzdem sinnvoll (~3 s statt 5 s), und das ist eine erlaubte Fahrhilfe. Eine pauschale
+5-s-Strafe würde den Knopf nutzlos machen, weil man dann lieber crasht. Nach einem Reset wird der Rückspul-Puffer
geleert, damit ⏪ nicht zurück in den Crash spult. Die Aufzeichnung läuft weiter (Replay zeigt einen Schnitt, der
Geist bleibt synchron). Mit Totalschaden an bleibt ⏪ wie bisher (Uhr wird mit zurückgedreht), damit die übernommenen
Bestzeiten vergleichbar bleiben. Auf Original gibt es ⏪ weiterhin nicht.

## Bestzeiten und Geister: 6 getrennte Wertungen, Migration ohne Umkopieren
Schlüssel `Strecke|Wertung` mit `modeKey(Stufe, Totalschaden)` (`src/game/store.js`):

| | Totalschaden aus | Totalschaden an |
|---|---|---|
| 🟢 Leicht | `easy` (bisheriger Schlüssel) | `easy+wrack` (neu) |
| 🟡 Mittel | `medium+reset` (neu) | `medium` (bisheriger Schlüssel) |
| 🔴 Original | `original+reset` (neu) | `original` (bisheriger Schlüssel) |

Die bisherigen Schlüssel behalten damit genau die Bedeutung aus dem Auftrag (Leicht = aus, Mittel/Original = an).
Es wird nichts umkopiert, und ein Zurückrollen ist gefahrlos möglich. Menü und Bibliothek zeigen die Zeiten der
aktuellen Einstellung, gekennzeichnet mit „↺ Reset +5 s“ bzw. „💥 mit Totalschaden“. Ehrlicher Hinweis: Alte
Leicht-Zeiten sind mit kostenlosem Rückspulen entstanden. Da Leicht in allen Bot-Tests ohne Crash fährt, ist der
Unterschied praktisch null.
**Geist:** Jede Strafe wird in der gespeicherten Geisterfahrt als 5 s Stillstand an der Crash-Stelle eingefügt,
damit Geist und Uhr zusammenpassen (Rennzeit = Aufzeichnungszeit + Strafen).

## Replay
Resets (und ⏪ ohne Totalschaden) sind in der Aufzeichnung als Schnitt markiert. Das Replay blendet ±0,3 s um den
Schnitt über (Aufblitzen), interpoliert nicht über den Sprung und setzt die Kamera neu an, also kein Teleport-Ruckler.
Oben im Replay-Overlay stehen die Rennzeit inkl. Strafen und „💥 1× +5 s“, beim Passieren der Crash-Stelle erscheint
„+5 s Strafe“. Nebenbei behoben: Das Wrack (Totalschaden an) wird jetzt mit aufgezeichnet. Vorher fehlten diese
Sekunden in Replay und Geist.

## Belege
| Prüfung | Ergebnis |
|---|---|
| `node tests/node/test_reset.mjs` (neu, in `npm run test:node`) | **alle OK** |
| · Crash im Looping (Überschlag), am Sprung (Absturz), an der Brückenwand (Aufprall) × Leicht/Mittel/Original, Totalschaden aus | nie 'wreck', Uhr springt je Crash um genau 5,000 s, Reset 0,7 m neben der Linie, aufrecht (up 1,00), 56–89 km/h; Autopilot im Ziel; Endzeit = gefahrene Zeit + 5 s × Strafen (exakt) |
| · Replay-Zeit am Ende = Endzeit, Geist +5,0 s Stillstand je Strafe | 9/9 |
| · dieselben 9 Fälle mit Totalschaden an | Wrack → Rückspulen (Leicht/Mittel) bzw. Reset (Original), 0 Strafen |
| · Crash mitten in **jedem** Stunt-Element von 3 Strecken (15 Stunts): Leicht mit Spieler „nichts“ und „zappelig“ | **0 Folgecrashs** nach dem Reset, 0× hängen geblieben |
| · dasselbe Mittel/Original mit perfektem Fahrer | 0 Folgecrashs |
| · immer wieder im selben Looping scheitern | Leicht: 2 Crashs → dahinter (+10 s); Mittel/Original: 3 → dahinter (+15 s) |
| · ⏪ ohne Totalschaden / mit | Uhr bleibt 0:06,00 / wird auf 0:02,71 zurückgedreht |
| Alle Node-Tests (`npm run test:node`) | 8/8 grün, Generator **30/30 lösbar** |
| Fahrhilfen-Bots (test_assists), Totalschaden aus vs. an | Original + „normaler“ Fahrer: **3/3 im Ziel** (7–9 Crashs) statt 2/3 (bis 22 Crashs, einmal nie im Ziel). Mittel + „normal“ ist etwas langsamer als bisher (1:13 statt 1:07), weil Crashs jetzt Zeit kosten statt sie zurückzuspulen |
| `python3 tests/test_reset_ui.py` (neu, Pixel 7 quer + hoch) | 19/19 OK: Schalter, Speicherung, „+5 s“ + Aufblitzen, HUD, Ergebnis, eigene Bestzeit-Wertung, alte Mittel-Zeit erscheint nur bei „an“, Replay-Schnitt + Overlay, Knöpfe ≥ 48 px, **0 Fehler** |
| smoke / test_race / test_touch / test_trk_ui / test_fx | alle grün, 0 pageerrors (test_fx schaltet für den Wrack-Rauch jetzt Totalschaden an) |
| Cache-Busting | `tools/update_sw.py` → neue Version |

Screenshots (selbst geprüft): `tests/shots/final/reset_*.jpg`: Optionen mit Schalter, „+5 s“ im Crash-Moment,
Ergebnis quer und hoch mit Strafenzähler, Replay am Schnitt.
Randbefund (alt, nicht angefasst): Hochkant laufen in den Optionen „Automatisch“ und „Sparsam“ ineinander.

## Bitte am Handy testen
1. Optionen → **💥 Totalschaden** ist aus. Eine Strecke auf **Mittel** fahren und absichtlich im Looping zu langsam
   sein: Kommt „+5 s“ sofort, fühlt sich das Aufblitzen kurz genug an, stehst du mit Schwung vor dem Looping?
2. Sind 5 s die richtige Strafe (zu hart, zu mild)? Zahl in `src/game/race.js` → `PENALTY`.
3. ⏪ auf Mittel: Leuchtet dir ein, dass die Uhr weiterläuft?
4. **Original** ohne Totalschaden: Macht es so mehr Spaß als mit Wrack?
5. Ergebnis und Replay: Sind Strafenzähler und „+5 s“ im Replay gut lesbar?
6. Einmal Totalschaden **an**: Siehst du deine alten Mittel/Original-Bestzeiten wieder?
