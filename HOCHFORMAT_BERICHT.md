# Stuntbahn – Bericht Hochformat (27.09.2026)

**Wunsch:** „Stuntbahn sollte auch am Handy im Hochformat gehen.“
**Live:** https://drpeterkalmar.github.io/stuntbahn/ – Handy einfach hochkant halten.

## Was jetzt geht
- **Kein Sperrbildschirm mehr** („Bitte das Handy quer halten“ ist weg). Das Manifest steht auf
  `"orientation": "any"`, die installierte App dreht mit. Am Desktop bleibt alles wie bisher.
- **Hochkant funktionieren vollständig:** Rennen, Countdown, Pause, Ergebnis, Replay mit allen Kameras,
  Optionen, Streckenwahl, Hilfe, Bibliothek und .TRK-Import.
- **Verfolger-Kamera hochkant** (`PORTRAIT` in `src/gfx/camera.js`):
  - 88° vertikales Sichtfeld, 2,2 m weiter hinten, 3,6 m höher, Blick weiter voraus. Das Auto sitzt im
    unteren Drittel.
  - **Blick in die Kurve:** Die Kamera dreht anteilig (50 %, höchstens 14°) zu einem Streckenpunkt
    40 m + 0,6 s × Tempo voraus. Hochkant ist das Bild schmal, und Kurven liefen sonst seitlich hinaus.
  - In Looping, Röhre und Korkenzieher (erkannt 18 m vorher) und in der Luft entfallen Zielen und Zusatzhöhe
    weich. Dort verhält sich die Kamera wie quer, weil sie sonst am Bauwerk hängen bliebe.
  - Quer ändert sich nichts: Der Hochkant-Anteil ist dort 0.
- **Cockpit hochkant:** Die Instrumente liegen über der Tastenreihe und sind gut lesbar (ca. 110–125 px
  Durchmesser). Das Digital-Tempo ist wie quer ausgeblendet.
- **HUD hochkant:**
  - Oben links stehen Zeit, Checkpoint, Strafzeit und Bestzeit.
  - Oben rechts sitzen die Schnell-Umschalter (Ideallinie, Rückspulen, Kamera, Pause) mit drei Knöpfen je
    Zeile, Pause in der Ecke, darunter die Fahrhilfe.
  - Der Stunt-Hinweis und kurze Meldungen stehen darunter im Himmel.
  - Das Tempo steht unten mittig, bei Tasten links über den Lenktasten.
  - Notch/Kamerainsel oben und Gestenleiste unten werden über die safe-area-insets freigehalten (als
    CSS-Variablen `--sat/--sab/…`, damit Tests sie simulieren können).
- **Touch hochkant:**
  - Leicht: Bildschirmhälften wie gewohnt.
  - Mittel/Original: ◀ ▶ | BREMSE GAS in einer Reihe unten. Die Breite skaliert mit dem Bildschirm (60–92 px,
    80–96 px hoch). Zwischen Lenk- und Pedaltasten bleiben mindestens 55 px (360 px breites Handy), beim
    Pixel 7 69 px.
  - Alle Touch-Ziele sind mindestens 48 px groß. Die Umschalter liegen oben rechts und damit weit weg von
    den Daumen.
- **Neigen:** Die Achse wird jetzt für jede Ausrichtung aus der Schwerkraft berechnet (`tiltSteerDeg`).
  - Hochkant: seitlich kippen oder wie ein Lenkrad drehen. Nicken lenkt nicht.
  - Quer: genau wie bisher (beta).
  - Nebenbei behoben: Bei `screen.orientation.angle = 270` (quer andersherum, manche Android-Geräte) wurde
    bisher die falsche Achse genommen.
- **Drehen im laufenden Rennen:**
  - Renderer, Kamera, HUD und Cockpit-Instrumente stellen sich sofort um. Die Größe wird zusätzlich jedes
    Bild geprüft, falls das `resize`-Ereignis zu spät kommt.
  - Alle Finger gelten als losgelassen, es bleibt kein Gas und keine Lenkung hängen. Das gilt auch beim
    Wechsel der App.
  - Am Touch-Gerät pausiert das Rennen kurz (Pause-Karte mit „▶ Weiter“). Am Desktop läuft es beim
    Fenster-Ziehen einfach weiter.
- **Platz für zwei weitere runde Knöpfe (n6 Nitro/Hüpfer, n7 Optik):**
  - Die Knöpfe gehören in `#hud .rbs`: quer bis vier je Zeile, hochkant drei. Pause bleibt in der Ecke.
  - Mit sechs Knöpfen ist das in allen Formaten geprüft (915×412, 740×360, 412×915, 360×740): nichts
    überlappt.
- **Mitbehoben (quer, schmale Handys):**
  - Bei 740×360 überlagerte der Fahrhilfe-Text im Menü die Knöpfe; die Spalte scrollt jetzt.
  - Der Stunt-Hinweis lag unter dem Ideallinien-Knopf; er bricht jetzt um.
  - Pause-, Optionen- und Bibliotheks-Karten ragten in die Gestenleiste.
  - „Tages-Strecke“ war abgeschnitten.
  - Die Zeichenfläche nutzt `100dvh`, damit sie in Safari mit Adressleiste nicht gestreckt wird.

## Messwerte
Verfolger, gemessen an 44–58 Stellen je Strecke mit `tests/hochformat_cam.py`. „Voraus“ sind die Meter
Mittellinie, die am Stück im Bild bleiben. Median und 10-%-Wert stehen für enge Kurven.

| Strecke | quer 915×412 | hochkant **alte** Kamera | hochkant **neu** (412×915) | neu 360×740 |
|---|---|---|---|---|
| 4711-2 | 232 m / 97 m | 23 m / 1 m | **101 m / 36 m** | 105 m / 40 m |
| 20260927-3 | 215 m / 77 m | 22 m / 1 m | **76 m / 22 m** | 83 m / 36 m |
| Demo-Rundkurs (.TRK) | 300 m / 25 m | 58 m / 2 m | **196 m / 14 m** | 203 m / 18 m |

- **Auto im Bild:** Höhe −0,40 (NDC, unteres Drittel beginnt bei −0,33), vorher −0,23. Seitlich liegt es
  höchstens bei 0,34, das Auto bleibt also immer gut im Bild. Autobreite 28 % der Bildbreite, vorher 68 %.
- **Leistung:**
  - Die Pixelzahl ist hoch und quer identisch (Breite × Höhe getauscht, gleiche Auflösungsskalierung).
  - Draw-Calls hochkant im Mittel 38–41, quer 44–51. Dreiecke gleich (131–144 k).
  - Das Cockpit liegt hoch und quer bei 40 bzw. 41 Draw-Calls.
  - Die Qualitätsstufen mussten nicht geändert werden; es gelten dieselben FPS-Ziele.
  - Headless (GPU/Metal) laufen beide Formate mit 60 fps.
- **Tests:**
  - Alle Node-Tests grün, neu dabei `test_tilt.mjs` (15 Prüfungen).
  - `test_touch.py` prüft jetzt quer **und** hochkant mit Assertions, statt nur auszugeben.
  - `test_hochformat.py`: 32 Prüfungen (Drehen quer→hoch→quer im Rennen und im Cockpit, Pause/Weiter,
    kein hängendes Gas bzw. keine hängende Lenkung, Touch reagiert danach, Neigen-Achse, sechs Knöpfe,
    Drehen in Menü und Replay, Desktop).
  - `hochformat_shots.py`: Layout-Prüfung aller Bildschirme auf 6 Profilen mit je 45 Prüfungen.
  - `hochformat_stunts.py`: Auto bei Looping, Sprung, Röhre und Korkenzieher im Bild.
  - Die bestehenden Tests sind grün: Smoke, Rennen, Reset, Ideallinie, TRK-Import, Effekte, Ton, Cockpit.
  - 0 pageerrors.
- **Test-Browser** laufen jetzt über die GPU (`--use-angle=metal`) statt SwiftShader.

Fotos: `tests/shots/final/hochformat_*.jpg` (iPhone mit simulierter Notch/Gestenleiste, kleines Handy,
Pixel 7). Alle weiteren liegen unter `tests/shots/hochformat/` (nur lokal).

## Grenzen (ehrlich)
- **Minikarte:** Im Rennen gibt es keine Minikarte, es gab auch vorher keine. Die Minikarten in der Bibliothek
  funktionieren hochkant.
- Hochkant sieht man in engen Kurvenfolgen trotzdem weniger voraus als quer (10-%-Wert 14–40 m statt
  25–97 m). Das liegt am schmalen Bild. Stärkeres Zielen hatte ich geprüft (18°), es brachte keinen klaren
  Gewinn und ließ das Auto in S-Kurven zu weit zur Seite wandern.
- Im Looping-Scheitel und in der Röhre rückt die Kamera wie quer nah ans Auto, weil der Strahltest sie an der
  Wand abfängt.
- Echte Notch und Gestenleiste sind im Test nur simuliert (47/34 px). Chromium kennt keine Notch.

## Handy-Prüfliste für Peter
1. **Browser hochkant:** Stuntbahn öffnen. Ist das Menü ganz scrollbar und „▶ Losfahren“ gut erreichbar?
2. **Leicht, Verfolger:** Siehst du genug Strecke voraus? Sitzt das Auto angenehm unten? Wird dir beim leichten
   Eindrehen in Kurven schwindelig?
3. **Mittel:** Liegen die Daumen gut auf ◀ ▶ und BREMSE/GAS? Rutschst du versehentlich auf die falsche Taste?
4. **Cockpit hochkant** (🎥): Sind Tacho, Drehzahl und Gang lesbar?
5. **Umschalter oben rechts** (Ideallinie, ⏪, 🎥, ⏸): mit dem Daumen erreichbar, aber nicht aus Versehen?
6. **Im Rennen drehen** (hoch ↔ quer): Kommt die Pause mit „▶ Weiter“? Hängt danach nichts (Gas, Lenkung)?
7. **Neigen** (Optionen → „Lenken durch Neigen“): hochkant seitlich kippen bzw. wie ein Lenkrad drehen. Passen
   Richtung und Empfindlichkeit?
8. **Notch/Gestenleiste:** Wird oben (Zeit, Pause-Knopf) oder unten (Tasten) etwas verdeckt?
9. **Installierte App:** Neu installieren oder einmal neu laden, damit sie mitdreht; der Service-Worker lädt
   von selbst nach. Dreht die App jetzt mit?
10. **Replay, Ergebnis, Bibliothek/.TRK-Import** hochkant: Passt alles?
11. **Ruckelt es** hochkant mehr als quer?
