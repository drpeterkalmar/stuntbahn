# Stuntbahn – Bericht Nacht 1 (27.09.2026)

**Live:** https://drpeterkalmar.github.io/stuntbahn/ · **Repo:** https://github.com/drpeterkalmar/stuntbahn
Stand: alle Phasen 1–6 inkl. 4b umgesetzt, Kern spielbar, live geprüft (HTTP 200, 0 Fehler).

## Was geht
- **Fahren mit echter Physik:** eigene Arcade-Physik (120 Hz, 4 Raycast-Federbeine, Haftungskreis,
  Karosserie-Kontakte). Loopings werden wirklich kopfüber gefahren, Sprünge fliegen ballistisch,
  Steilkurven tragen, Röhre mit befahrbaren Wänden.
- **15 Bausteintypen** (+ Links/Rechts): Start/Ziel, Gerade, Checkpoint, enge/weite Kurve, Steilkurve,
  Schikane, Bodenwellen, Kuppe, Rampe hoch/runter, Hochstraße, Bogenbrücke mit Teich, Sprungschanze
  mit Wassergrube, Looping (Klothoide + Stahlgerüst), Röhre mit Betonportalen. Kollision = Grafik.
- **Generator:** Code + Schwierigkeit (Sanft/Sportlich/Irre) → Rundkurs; jede Strecke fährt vorab der
  Autopilot (ohne Hilfen) – Crash-Stelle wird entschärft. **Strecke des Tages** = Datum als Code.
- **Fahrhilfen** 🟢 Leicht / 🟡 Mittel / 🔴 Original als Mischung Spieler/Autopilot, jederzeit im Pause-Menü
  umschaltbar; Bestzeiten + Geisterautos getrennt je Stufe.
- **Renn-Logik:** Countdown, Checkpoints in Reihenfolge, Ziel, Wrack (Rauch/Feuer), Rückspulen,
  Festgefahren-/Abseits-Erkennung, Replay mit Verfolger/Hubschrauber/Streckenkamera/Stoßstange.
- **Grafik:** HDRI-Himmel (Poly Haven) + Bildlicht, PBR-Texturen, V12-Goblin-Auto mit Klarlack in
  Wunschfarbe, **vorberechneter Sonnenschatten** für die Strecke + vorberechnetes AO im Gelände,
  Echtzeit-Schatten nur fürs Auto, Bremsspuren, Qualitätsstufen nach Bildrate.
- **Ton** vorgerendert (V12-Motor drehzahlabhängig, Reifen, Wind, Crash, Signale), abschaltbar.
- **Steuerung:** Handy quer (Hälften bzw. Tasten, optional Neigen), Tastatur, Gamepad. PWA, offline.

## Gate Phase 2 – Physik: **echt bestanden** (kein Magnet-Fallback nötig)
Autopilot fährt Ebene → Schanze → Steilkurve → Looping → Röhre → Rampe/Brücke ohne Crash
(`node tests/node/test_loop_gate.mjs`). Im Looping: Oberseite nach unten (up.y = −0,99) auf 14 m Höhe,
alle 4 Räder mit Kontakt, 18 m/s im Scheitel, Spitzenlast ~6–8 g. Nach ca. 1,5 h erreicht.
Wichtigste Lehren: Stanley-Regler statt Pure Pursuit (funktioniert kopfüber), Looping-Spur mit
seitlichem Versatz nur oben + Ideallinie wechselt vorher die Spur (sonst kreuzen sich Ein-/Auslauf).

## Messwerte
| Prüfung | Ergebnis |
|---|---|
| Generator + Autopilot (Node, 10 Seeds × 3 Stufen) | **30/30 lösbar**, 0 Entschärfungen, Prüfzeit Median 132 ms |
| Fahrhilfe Leicht, Spieler „nichts“ / „zappelig“ (3 Strecken) | 6/6 im Ziel, Autopilot-Tempo, 0 Crashs |
| Fahrhilfe Mittel, menschenähnlicher Bot | 3/3 im Ziel (4–9 Crashs, auto. zurückgespult) |
| Original, perfekter Fahrer / normaler Bot | 3/3 bzw. 2/3 – bewusst so tricky wie früher |
| Baustein-Galerie im Browser | Autopilot fährt alle 15 Typen ins Ziel (43,9 s), 0 Crashs |
| Rennen → Bestzeit nach Reload → Geist → Replay | alles grün, 0 Page-/Console-Errors |
| Touch (Pixel 7 quer) | Hälften/Tasten wirken, alle Knöpfe ≥ 48 px, nichts abgeschnitten |
| Draw-Calls / Dreiecke (renderer.info) | Menü 44 / 172k · Rennen 51–82 / 178–195k (Budget < 200 DC) |
| JS-Heap / Download gesamt | 23 MB / **7,5 MB** (Budget < 15 MB; Auto 0,9 MB) |
| Boot headless (SwiftShader, inkl. Autopilot-Prüfung) | 7–9 s |
| Ton-Pegel | Motor −1,9 dBFS Spitze, Crash/Aufsetzer −3 dBFS |
| **Live** (GitHub Pages) | HTTP 200, Build = lokal, PWA installierbar (0 Fehler), offline neu laden ok |

Screenshots: `tests/shots/final/` (Handy quer, Desktop, Handy hoch).

## Offene Punkte / ehrliche Grenzen
- **Echtes Handy ungetestet:** Bildrate nur in SwiftShader gemessen (bedeutungslos). Qualitätsstufen
  schalten automatisch herunter, müssen aber am Gerät bestätigt werden.
- **Neigen-Lenkung** und **Ton** nur technisch geprüft (Sensor/Lautsprecher fehlen headless).
- „Mittel“ und „Original“ sind in Loopings/Sprüngen anspruchsvoll; Feintuning nach deinem Test.
- Nicht in Nacht 1: .TRK-Import, Korkenzieher, Hochstraßen-Kurven, Kreuzungen, weitere Autos, Editor.
- AO nur im Gelände (nicht auf Bauwerken); Landerampe hat eine glatte Beton-Stirnfläche.
- Physik-Determinismus zwischen Browsern (Math.sin/tanh) nicht garantiert → Geist/Bestzeit pro Gerät.

## Bitte am Android-Handy testen
1. Link öffnen, **quer halten**. Ladezeit? Ruckelt es (Menü → Optionen → Grafik: Automatisch/Sparsam/Hoch)?
2. **Leicht:** Bildschirmhälften halten – folgt das Auto? Macht es Spaß oder ist es „zu automatisch“?
3. **Mittel:** Tasten ◀ ▶ / GAS / BREMSE mit den Daumen gut erreichbar? Hilft die farbige Linie?
4. **Original:** Schaffst du Looping und Schanze? Zu schwer, zu leicht?
5. Optionen → **Lenken durch Neigen**: Richtung und Empfindlichkeit richtig?
6. **Ton** nach dem ersten Tippen da? Lautstärke ok?
7. „Zum Startbildschirm hinzufügen“ → startet es im Vollbild und auch im Flugmodus?
8. Strecke des Tages fahren, Code + Zeit notieren – unfair wirkende Stellen melden.

## Vorschlag Nacht 2 – .TRK-Import
1. Parser für das 1802-Byte-Format (30×30 Strecke + Terrain) nach wiki.stunts.hu, Datei-Auswahl/Drag & Drop
   (fremde Strecken nur lokal, nicht ins Repo).
2. Abbildung der 149 Strecken- + 28 Szenerie-Elemente auf die Bausteine (viele sind Drehungen/Varianten);
   fehlende bauen: Korkenzieher, Halbröhre, Slalom, Split/Kreuzung, Hochstraßen-Kurven, Terrain-Hügel mit Rampen.
3. Terrain-Höhen → Höhenfeld; Fahrlinie für beliebige Layouts (Start suchen, Weg verfolgen).
4. Autopilot-Probefahrt auch für Importe → Ideallinie/Fahrhilfen funktionieren sofort.
5. Dazu Feintuning nach deinem Handy-Test (Tempo, Lenkgefühl, Schwierigkeit „Mittel“).
