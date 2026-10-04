# G-Kräfte und Show-Tacho (n24 Etappe 1, 04.10.2026)

Peter (04.10., 22:35): „Vielleicht kannst du der Stuntbahn im Cockpit und im Replay bzw. Highlights die G-Kräfte
dazuschreiben? Muss nicht genau sein, aber soll cool aussehen. Und vielleicht die langsamen Geschwindigkeiten mit mehr
km/h angeben, 40 in der Kurve klingt langweilig.“

Beides ist **reine Anzeige**. Physik, Autopilot, Bremshinweis, Highlight-Schwellen, Bestzeiten und alle Messungen rechnen
weiter mit den echten Werten.

## Show-Tacho
Eine Funktion für alle km/h-Anzeigen (`src/core/showspeed.js`):
`show = v + 1,5 · v · max(0, 1 − v/250)²`. Unter 250 km/h zeigt der Tacho mehr, ab 250 km/h genau.

| echt km/h | 10 | 20 | 30 | 40 | 60 | 100 | 150 | 200 | 250 | 400 | 586 (Vmax) | ~700 (Nitro) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Tacho vorher** | 10 | 20 | 30 | 40 | 60 | 100 | 150 | 200 | 250 | 400 | 586 | ~700 |
| **Tacho jetzt** | 24 | 45 | 65 | 82 | 112 | 154 | 186 | 212 | 250 | 400 | 586 | ~700 |

- Die Kurve steigt streng: Die kleinste Steigung ist 0,5 (bei ~167 km/h echt), es gibt keinen Sprung und keinen Knick bei 250.
  Getestet in 0,5er-Schritten über 0–800 km/h (`tests/node/test_gkraft.mjs`).
- Umgestellt sind: HUD-Tempo, Cockpit-Tachozeiger (Skala 0–600 bleibt), Replay (Cockpit-Zeiger und neue km/h-Zeile unter dem
  G-Meter), Kino-Replay (Einblendung und Untertitel „🔥 Nitro · 211 km/h“, „⚡ … km/h Spitze“, „⬇️ Steilabfahrt +… km/h“) und der
  Hilfetext „Unschärfe ab ~140 km/h auf dem Tacho“ (echt 80).
- Bewusst mit echten Werten rechnen weiter (Durchsicht aller `3.6`-Stellen):
  - Physik, KI und Bremshinweis (`warn.js`)
  - Bewegungsunschärfe und Tempo-Streifen
  - Kamera-Sichtfeld und Fahrtwind-Ton
  - Highlight-Schwellen (`HL.top.min` = 250 echte km/h, Nitro- und Steilabfahrt-Punkte)
  - alle Messwerkzeuge
- **Wiese:** Peters Regel vom 30.09. („Wiese höchstens 30 km/h“) gilt in der Physik weiter: echt höchstens 30 km/h.
  **Der Tacho zeigt dort ~65 km/h.** Das ist so gewollt (Show-Tacho) und steht auch im Hilfetext („Auf der Wiese steht ~65“).
- A/B: **`?tacho=echt`** = Anzeige wie bisher, `?tacho=1.2` = anderer Faktor (0 … 2,9; ab 3 würde die Kurve nicht mehr streng
  steigen).

## G-Kräfte
`src/core/gforce.js`, eine Rechnung für live, Replay und Kino-Replay.
- **Quelle:** die Aufzeichnung (60 Hz), aus der auch Replay und Kino-Replay lesen. Live und Replay zeigen deshalb an jeder
  Stelle dieselbe Zahl (Abweichung im Test 2·10⁻⁷).
- **Berechnung:** Beschleunigung aus der zweiten Positionsdifferenz, zerlegt am Auto in längs (Gas/Bremse), quer
  (Kurve/Drift) und vertikal (Kuppe, Looping, Landung).
- **Was gezeigt wird:** die Beschleunigung des Autos. Im Stand 0,0 G, im Flug ~0,9 G (Flug-Schwerkraft 70 %).
- **Glättung:** 0,2 s. Spitzen bleiben 0,6 s stehen und fallen danach mit 6 G/s ab.
- **Landungen:** Nach mindestens 0,2 s Flug zählt 0,3 s lang zusätzlich ein schneller Filter (0,05 s). Der Aufsetz-Stoß
  bleibt so als Spitze sichtbar, statt in der 0,2-s-Glättung zu verschwinden.
- **Show-Faktor:**
  - Fahrt: `7 · tanh(1,25 · G / 7)`. Kleine Werte werden etwas größer, große weich gedeckelt (nie über 7).
  - Landung: `10 · tanh(0,85 · G / 10)`, nie über 10.
- Schnitte (Reset, Rückspulen) setzen die Rechnung neu an. So entstehen keine Fantasie-Spitzen durch das Versetzen.

### Messung (5 Fahrten: flach Irre, Hochstraße Irre/Sportlich, Gelände Irre, Sammlung; `node tools/gkraft_mess.mjs`)
| Situation | echt (nur geglättet) | **angezeigt** | Ziel laut Auftrag |
|---|---|---|---|
| Stand | 0,0 | **0,0 G** | 0,0 |
| Kurve (Median / P90) | 1,6 / 2,3 | **2,0 / 2,7 G** | typ. 1–3 |
| Looping (Spitzen) | 7,1–7,9 | **6,0–6,2 G** | 3–6 |
| Korkenzieher | 5,3–5,4 | **5,2 G** | – |
| Schanze/Schlucht (Landung) | 3,5–4,5 (geglättet) bzw. 9–12 (Stoß) | **6,3–7,7 G** | harte Landung bis ~8–10 |
| Klippe/Plateau | 2,5–3,3 / 7,7 | **5,7 G** | – |
| Flug | 0,7 | **0,9 G** | – |
| Nitro (längs) | – | **3,2–3,6 G** | – |
| größter Wert überhaupt | – | **7,7 G** (nie über 10) | nie absurd |

Die Looping-Spitzen liegen mit 6,0–6,2 G knapp über dem Richtwert 3–6. Das ist bewusst so: Echt sind es ~7–8 G, die
Show-Kurve dämpft sie schon. Noch tiefer stünde der Looping unter der Schanzen-Landung, das wirkt falsch herum.
Harte Landungen (Aufprall über 10,5 m/s) kamen in den Testfahrten nicht vor. Rechnerisch ergibt ein Stoß von 13–16 G über die Stoß-Kurve 8,6–9,6 G angezeigt.

### Wo es zu sehen ist
- **Cockpit:** rundes G-Meter auf der Instrumentenhutze zwischen Drehzahlmesser und Tacho, über der Schaltkulisse.
  Die Kulisse sitzt dafür etwas tiefer und ist 8–12 % kleiner. Das Meter zeigt:
  - einen Punkt im „Reibungskreis“ (Rechtskurve = Punkt links, Bremsen = Punkt oben, Rand = 4 G) mit kurzer Leuchtspur
  - die Zahl „2,6 G“ (ab 4 G orange, ab 6,5 G rot)
  - darüber klein „max 6,2“, die Spitze der Runde

  Gleicher Stil wie die Zifferblätter. In der kompakten Instrumenten-Stufe ist das Meter kleiner. In der Stufe ohne
  Rundinstrumente steht die G-Zahl im HUD.
- **Verfolger-HUD:** eine dezente Zahl „2,4 G“ hinter Tempo und Gang, ab 4 G orange.
  - quer: in der Tempo-Zeile
  - hochkant mit Tasten: in der Zeile „km/h · Gang · G“
  - hochkant Leicht (Bildschirmhälften): über der Tempo-Zahl, weil die Zeile sonst die Pfeile ◀ ▶ berührt
    (von `test_touch` gefunden und behoben)

  Touch-Zonen bleiben frei (`test_touch` grün).
- **Replay:** G-Meter oben links mit km/h darunter. Im Cockpit-Replay sitzt es auf dem Armaturenbrett.
- **Kino-Replay:** G-Meter mit km/h (quer unten rechts über dem Kino-Balken, gegenüber dem Untertitel; hochkant oben rechts).
  Es ist auch im aufgenommenen Video zu sehen.
- **Highlight-Untertitel** mit Spitzenwert, z. B.:
  - „🌀 Looping · 6,2 G“
  - „🚀 104 m Sprung · 7,7 G“ (Landung)
  - „🏞️ Schluchtsprung · 102 m · 6,3 G“
  - „🍥 Korkenzieher · 5,2 G“
  - „🧱 Steilwand · 69° · 4,2 G“
  - „🔥 Nitro · 346 km/h · 3,6 G“ (längs)
  - harte Landung: „💥 Harte Landung · x,x G“ (statt „… km/h Aufprall“)
- **Neue Highlight-Art „🏁 Kurve · 3,5 G quer“:** die stärkste Kurve der Fahrt, mindestens 2,6 G quer über 0,4 s, auf normaler
  Fahrbahn ohne Crash danach. Sie zählt wenig Punkte (8 + 8 je G über 2,6) und füllt nur Filme mit wenigen Stunts. Sie doppelt
  sich mit nichts: Loopings, Steilwände und Sprünge sind ausgenommen, und es gibt höchstens eine je Fahrt.
- A/B: **`?g=echt`** = ohne Show-Faktor (nur geglättet), **`?g=0`** = Anzeige ganz aus, `?g=1.5` = anderer Faktor.

## Prüfungen
- `node tests/node/test_gkraft.mjs`: 24 Prüfungen grün. Geprüft werden:
  - Monotonie, Fixpunkte, Identität ab 250, Umkehrung
  - G-Werte auf zwei aufgezeichneten Runden: keine NaN, nie über 10, Stand 0,0, Kurve 1–3, Looping 3–7, Landung > Kurve
  - live = Replay
  - Untertitel mit G
- `npm run test:node`: alle 28 Suiten grün (inkl. Kino-Replay, Cockpit, Extras, Korpus).
- Browser, Pixel 7 quer und hoch, alle mit 0 Fehlern:
  - `tests/gkraft_shots.py` 8/8 je Lage, `cockpit_shots` 7/7 (quer) und 5/5 (hoch)
  - `test_cockpit_ui`, `test_kinoreplay beide`, `test_touch`, `tempo_shots`, `mittel2_shots`, `test_extras_ui`, `test_race`,
    `test_grafik_start`, `smoke`
  - Die Tests, die Tacho gegen Physik vergleichen, rechnen jetzt mit dem Show-Tacho (`show_kmh` in `tests/util.py`).
  - `test_hochformat` scheitert schon auf dem Stand vor n24 an derselben Stelle („▶ Weiter“ der Pause-Karte wird nicht
    sichtbar). Das hat mit dieser Etappe nichts zu tun.
- A/B im Browser geprüft:
  - `?tacho=echt&g=0`: Zeiger = echte km/h, kein G-Meter
  - `?g=echt`: Meter mit echten Werten
  - ohne Zusatz: Zeiger = Show-Tacho
- **Bildrate** (`tests/perf_gkraft.py`, Grafik Standard, Pixel 7 quer, Bildrate entsperrt, je 3 Läufe abwechselnd,
  Median):

  | Ansicht | vorher | nachher | Unterschied |
  |---|---|---|---|
  | Cockpit | 138,9 fps | 138,1 fps | −0,6 % |
  | Verfolger | 127,6 fps | 128,4 fps | +0,6 % |
  | Replay | 134,5 fps | 131,9 fps | −1,9 % |

  Alle drei bleiben unter 2 %. Keine neue Textur: Das G-Meter ist ein kleines 2D-Canvas und wird höchstens 30× je Sekunde
  neu gezeichnet.

## Fotos (`tests/shots/final/gkraft_*.jpg`, alle Bilder lokal in `tests/shots/gkraft/`)
| Datei | Was |
|---|---|
| `quer_cockpit_kurve.png`, `hoch_cockpit_kurve.png` | Cockpit in der Kurve, 2,6 G, Tacho 165 (echt 115) |
| `quer_cockpit_landung.png`, `hoch_cockpit_landung.png` | Cockpit direkt nach der Schanzen-Landung, 7,7 G rot, „max 7,7“ |
| `quer_hud_kurve.png`, `hoch_hud_kurve.png` | Verfolger-HUD mit G-Zahl |
| `quer_replay_spitze.png`, `quer_replay_mitte.png`, `*_replay_cockpit.png` | Replay mit G-Meter und km/h |
| `quer_cine_0.png`, `quer_cine_1.png`, `hoch_cine_*.png` | Kino-Replay: „🌀 Looping · 6,2 G“, „🚀 101 m Sprung · 6,5 G“ mit G-Meter |

Alle Fotos habe ich mit Vision geprüft:
- Zahl am Handy lesbar.
- Nichts verdeckt: keine Touch-Taste, kein Knopf, kein Untertitel.
- Im Cockpit liegt das Meter im dunklen Bereich der Hutze, die Fahrbahn bleibt frei.

## Code
| Datei | Was |
|---|---|
| `src/core/showspeed.js` | Show-Tacho |
| `src/core/gforce.js` | G-Rechnung `GMeter`, `gTrack`, Show-Kurven |
| `src/ui/gmeter.js` | rundes Display |
| `src/main.js` | live nachführen (`gLiveSync`), Lage im Cockpit (`cockpitGSpot`), Tacho-Zeiger |
| `src/game/replay.js` | `gState` |
| `src/game/highlights.js` | Untertitel, Art „curve“ |
| `src/ui/ui.js` | HUD-Zahl, Lage im Replay/Film, Hilfetexte |
| `src/ui/cliprec.js` | G-Meter im Video |
| `src/gfx/cockpit.js` | Schaltkulisse tiefer |
| `tools/gkraft_mess.mjs` | Messung |
