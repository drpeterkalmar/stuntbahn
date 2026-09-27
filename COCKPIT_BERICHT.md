# Stuntbahn – Cockpit-Kamera mit analogen Instrumenten (27.09.2026)

Peters Wunsch: „Eine Cockpit-Cam natürlich, mit analogen Zeigern für km/h, Drehzahl und Gang.“

## Was es gibt
- **Neuer Kameramodus „Cockpit“**, in der Reihenfolge direkt nach dem Verfolger: 🎥-Knopf, `C`, Gamepad LB.
  Im Replay als Knopf **🏁 Cockpit**. Die Kamerawahl im Rennen wird jetzt gespeichert (vorher startete jedes Rennen im
  Verfolger); das Replay startet wie bisher im Verfolger.
- **Fahrerplatz:** Augenpunkt links der Mitte, ~1 m über der Straße, Blick 3° gesenkt. Die Kamera dreht voll mit dem Auto
  (Looping, Korkenzieher). Gegen Übelkeit am Handy: Nicken und Wanken aus der Federung nur zur Hälfte, Lage um ~60 ms
  geglättet, der Kopf federt bei Landungen höchstens 4 cm nach. Festes Sichtfeld (75° waagrecht im Querformat, kein Tempo-Zoom).
- **Eigenes Cockpit:** `goblin.glb` hat kein brauchbares Interieur (offener Boden, Räder von innen sichtbar, kein Lenkrad,
  geprüft per Kamera am Fahrerplatz). Deshalb gibt es ein eigenes Low-Poly-Cockpit: Armaturenbrett mit Instrumenten-Hutze,
  Rohre und Chromringe, A-Säulen, Dachrahmen, Innenspiegel und Kotflügel-Buckel in der gewählten Lackfarbe.
  Dazu ein Lenkrad mit Lederkranz, Griffwülsten, gelber 12-Uhr-Marke und Alu-Speichen, das sich mit `steerAng` dreht
  (Übersetzung 4,2 : 1). Es wird nur in diesem Modus gezeichnet, in einem zweiten Durchgang mit gelöschtem Tiefenpuffer.
  Dadurch gibt es nie Clipping mit Wänden, Röhren oder Loopings. Die Außenkarosserie ist im Cockpit ausgeblendet.
- **Analoge Instrumente** (echte Mesh-Zeiger, Skalen einmal auf ein Canvas gezeichnet):
  - Tacho 0–300 km/h (Vmax gemessen 286 km/h, aufgerundet), 260° Skala, ruhiger Zeiger.
  - Drehzahlmesser 0–8 ×1000 U/min (Begrenzer 7600), rot ab 7000; der Zeiger ist flink und schwingt leicht nach.
  - Gang als **Schaltkulisse**: Der rote Knauf fährt über die Neutralgasse in R/1–6, der aktuelle Gang leuchtet orange.
    R erscheint bei Rückwärtsfahrt.
  - Im Replay werden Tempo und Drehzahl aus der Aufzeichnung genommen. Den Gang rechnet das Replay mit der Schaltlogik
    der Physik aus dem Tempo nach (99,9 % Übereinstimmung).
- **Handy zuerst:** Das Layout wird in Bildschirm-Pixeln berechnet. Die Instrumente sitzen mittig unten zwischen den
  Touch-Tasten (die freie Zone wird aus dem DOM gemessen); bei „Leicht“ wandern die ◀ ▶-Pfeile an die Ränder.
  Das Digital-Tempo ist im Cockpit ausgeblendet, Rundenzeit, Checkpoints und Knöpfe bleiben. Im Replay wandert die
  Leiste im Cockpit nach oben, damit die Instrumente unten frei bleiben.
- **Crash:** Ohne Totalschaden (Standard) bleibt die Kamera im Cockpit, das Aufblitzen und der Reset laufen wie bisher.
  Mit Totalschaden wechselt die Kamera fürs Wrack in den Verfolger (wie im Original) und danach zurück ins Cockpit.

Dateien: `src/gfx/cockpit.js` (Geometrie, Canvas, Layout), `src/gfx/gauges.js` (reine Logik, in Node getestet),
`src/gfx/camera.js` (Modus), `src/main.js`, `src/game/replay.js`, `src/ui/ui.js`, `css/style.css`. Keine neuen Assets.

## Belege
| Prüfung | Ergebnis |
|---|---|
| `tests/cockpit_shots.py` Handy quer (Pixel 7): Gerade, Kurve, Looping kopfüber (up −0,94), Sprung, R, 4× Replay + Replay-Looping | **10/10**: Zeiger = Tempo/Drehzahl (Abweichung 0,0°), Kulisse = Gang, nichts unter Touch-Knöpfen |
| dito Desktop 1280×720 | **10/10** |
| dito Tablet hochkant 820×1180 (Rennen mit Touch-Tasten) | **10/10** |
| dito Handy hochkant (Rennen zeigt „Bitte quer halten“ → nur Replay) | **5/5** |
| `tests/test_cockpit_ui.py`: Knopf → Cockpit, gespeichert nach Neuladen, Wrack → Verfolger → Cockpit, Leicht-Pfeile frei, Replay-Knopf, Replay-Zeiger = Aufzeichnung | **alle grün, 0 Fehler** |
| Draw-Calls (gleiche Stelle) | Verfolger 58 → **Cockpit 43** (Außenauto aus, Cockpit ~14 Aufrufe) |
| `npm run test:node` (+ neuer `test_cockpit.mjs`: Skalen, Vmax ≤ Tacho, Nachschwingen, Kulisse, Replay-Gang) | **alle grün** |
| Browser-Regression: Smoke, Rennen/Geist/Replay, Touch, Reset-UI | **0 Fehler**, keine Knöpfe < 48 px im Rennen |

Fotos (Auswahl, verkleinert): `tests/shots/final/cockpit_*.jpg` – `quer_gerade`, `quer_kurve` (Lenkrad gedreht),
`quer_looping` (kopfüber), `quer_sprung`, `quer_rueckwaerts` (R), `quer_replay_1`, `quer_wrack_verfolger`, `hoch_replay_1`,
`hoch_replay_looping`, `desktop_kurve`, `desktop_looping`, `tablet_kurve`.
Alle Fotos in voller Größe samt Messwerten (`*_werte.json`) erzeugt `python3 tests/cockpit_shots.py quer|hoch|desktop|tablet`
nach `tests/shots/cockpit/` (nicht im Repo).

## Grenzen (ehrlich)
- Der Stil ist schlicht und realistisch schattiert, aber Low-Poly ohne Leder- oder Kunststoff-Texturen. Der Innenspiegel spiegelt nur
  den Himmel, keine echte Rücksicht (die würde einen zweiten Welt-Durchgang kosten).
- Im Cockpit wirft das eigene Auto keinen Schatten (die Karosserie ist ausgeblendet).
- Der Lenkradkranz läuft oben quer durchs Bild und verdeckt bei starkem Einschlag kurz einen Teil der Skalen (wie im echten Auto).
- Im Looping kopfüber wird das Armaturenbrett dunkel (das Licht kommt dann von „unten“). Die Instrumente bleiben durch
  die Hinterleuchtung lesbar.
- Bildrate nur in SwiftShader gemessen (bedeutungslos). Der zweite Durchgang ist klein, am Handy aber ungetestet.

## Bitte am Handy testen
1. Rennen starten, 🎥 einmal tippen → Cockpit. Sind Tacho, Drehzahl und Kulisse beim Fahren gut lesbar? Groß genug?
2. **Mittel/Original:** Liegen die Daumen auf ◀ ▶ / GAS / BREMSE, ohne die Instrumente zu verdecken?
3. **Looping, Korkenzieher, Sprung** im Cockpit: Wird einem schlecht? Ist das Nachfedern bei der Landung zu viel oder zu wenig?
4. Lenkrad: Dreht es passend zum Lenken? Stört der Kranz oben im Bild?
5. Im Stand Bremse halten → rückwärts: Springt die Kulisse auf **R**?
6. Neu laden → startet das nächste Rennen wieder im Cockpit?
7. Replay → **🏁 Cockpit**: Bewegen sich die Zeiger passend? Stört die Leiste oben?
8. Ruckelt es im Cockpit mehr als im Verfolger?
