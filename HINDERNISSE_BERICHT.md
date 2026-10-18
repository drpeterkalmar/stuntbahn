# Stuntbahn n33 – Original-Stunt-Hindernisse + Tunnel-Einfahrt (18.10.2026)

Peters Wunsch (08.10.): „Mehr Original-Stunts-Hindernisse: Zickzack-Barriere, Spirale, Röhre mit Wand in der Mitte, um eine
Überkopf-Spirale zu erzwingen.“ Nachtrag (09.10.): „Tunneleinfahrt sieht aus wie eine Wand.“
Version **0.6.0**, live: https://drpeterkalmar.github.io/stuntbahn/ – alles gepusht und live geprüft (0 Fehler, offline spielbar).
Gebaut in zwei Schritten: Leicht-Spur „Vorbau“ ohne Browser (Geometrie, Generatoren, Node-Messungen), dann hier die
Browser-Abnahme mit Korrekturen, der Tunnel, das Licht in der Röhre und die Spirale im Gelände.

## Kurz – was du am Handy siehst
- **🚇 Tunnel sehen aus wie Tunnel** (Gelände-Strecken): Die Öffnung ist frei und dunkel statt einer Felswand, das Portal
  ist eine helle Betonwand mit sichtbarer Wandstärke, dunklem Rand und gelb-schwarzen Warnstreifen. Innen ist es dunkel,
  Leuchtbänder an der Decke ziehen rhythmisch vorbei, der Ausgang leuchtet hell. Nachts ist das Portal angestrahlt.
- **🚧 Zickzack-Barriere:** 5 Betonblöcke (kurze Variante 3) ragen abwechselnd von links und rechts über die Fahrbahnmitte,
  gelb-schwarz markiert – man muss Slalom fahren (Tempo-Deckel 70 km/h, Blöcke sind hart: Aufprall = Crash/Zurückspulen).
- **🔄 Röhre mit Wand:** In der Röhrenmitte sperrt eine Wand die untere Hälfte. Man fährt die Rohrwand hinauf, **kopfüber
  über die Wand** und auf der anderen Seite wieder hinunter (360°-Rolle, ab ~50 km/h trägt die Decke). Innen dunkel mit
  **Lichtringen** rund ums Rohr.
- **🌀 Spirale als Stunt:** Spirale hinauf auf eine Hochstraße/Brücke und per Spirale, Rampe oder Klippensprung wieder
  hinunter – jetzt auch auf flachen **und Gelände-Strecken** (im Gelände auf einem eingeebneten Sockel mit Teich unter der
  Brücke), in 3D häufiger.
- **Hilfen:** Leicht fährt alles selbst. Mittel: Spurhilfe durch die Zickzack-Gassen und durch die Rolle, HUD „Zickzack –
  Spurhilfe“ bzw. „Röhre – Wand! – Überkopf – Spurhilfe“. Original ohne Hilfe.
- **Neue Zufallsstrecken haben ein „h“ im Code** (z. B. `4711-2-gh`, `4711-2-3dh`, `4711-2-h`). **Alte Codes ohne „h“
  bauen genau wie vorher und behalten ihre Bestzeiten** – nichts gelöscht, bisherige Spieler sehen einmal einen Hinweis.
  Strecke des Tages / Zufall / „Weiter“ nehmen die neuen Hindernisse.

## A/B-Links (werten nicht)
| Was | Link |
|---|---|
| Tunnel neu / alt | `?seed=1000&d=3&g=1` / `?seed=1000&d=3&g=1&tunnelalt=1` |
| Zickzack + Spirale→Klippe (flach) | `?seed=9&d=2&h=1` |
| Röhre mit Wand, Spirale, kurze Zickzack (flach Irre) | `?seed=3194&d=3&h=1` |
| Gelände: Röhre mit Wand, Zickzack | `?seed=3000&d=3&g=1&h=1` |
| Gelände: Spiralen-Hochstraße | `?seed=2&d=2&g=1&h=1`, `?seed=4&d=3&g=1&h=1` |
| 3D: kurze Zickzack | `?seed=3291&d=2&3d=1&h=1` |
| Generator wie vorher / einzeln aus | `&hindernis2=0` · `&zickzack=0` · `&roehrewand=0` · `&spirale2=0` |
| Nacht | `&zeit=nacht` |

## 1. Tunnel-Einfahrt (Etappe 0, Commit 18b04a6)
**Ursache:** Das Gelände ist ein Höhenfeld im 5-m-Raster. Am Portal sprang es zwischen zwei Rasterpunkten von der Zufahrt
(Fahrbahnhöhe) auf den Hügel (+9 … +15 m) – als schräge Felsfläche quer durch die Öffnung, an der Ausfahrt sogar bis 5 m
über die Straße hinaus. Gemessen (10 Gelände-Strecken): an 13 von 22 Portalen lag Gelände 0,5–3 m hinter der Wand quer in der
Öffnung, an den Ausfahrten zusätzlich vor dem Portal über der Fahrbahn. Nebel/Dunst waren es nicht (der Kino-Dunst
macht auf 140 m nur ~4 % aus).
**Lösung (nur Optik, `src/track/tunnel.js`, `?tunnelalt=1` = alt):**
- Die Rasterzellen um jedes Gelände-Portal werden durch ein feineres, ungleichmäßiges Netz ersetzt (fein an der Wand und an
  den Öffnungskanten, ~1 400 Punkte je Portal): davor Einschnitt knapp unter der Fahrbahn, dahinter Hügel über dem Gewölbe,
  dazwischen ein Schlitz direkt hinter der Portalwand (von oben vom „Kragen“ verdeckt). Ränder exakt wie die Nachbarzellen
  (Abweichung 0 m, keine Risse). Im ganzen Rohr liegt danach nirgends Gelände (Test).
- Neue Portal-Stirnwand vor der alten (die bleibt als Kollision): heller Beton, Laibung mit Wandstärke, dunkler Rand an der
  Öffnung, Gesims, gelb-schwarze Warnstreifen an den Leibungen. Ein Draw-Call für alle Portale.
- Innen (Shader-Attribut je Eckpunkt): Himmels-/Umgebungslicht 20 %, Sonne aus, weicher Verlauf über 11 m hinter dem Portal,
  Leuchtbänder an der Decke alle 12 m (leuchten in den Bloom), Lichtpfützen darunter (Leuchten strahlen nach unten), Nebel
  innen fast aus, Lack und Cockpit spiegeln im Tunnel weniger Himmel. Nachts zwei Strahler am Portal. Shader-Code nur auf
  Strecken mit Tunnel.
- **.TRK-Kastentunnel** hatten das Wand-Problem nicht (kein Höhenfeld davor), sind aber innen jetzt ebenfalls dunkel mit Leuchten.
- **Nicht gemacht:** Belichtungsanpassung beim Ein-/Ausfahren (optional) – der Ausgang wirkt durch das dunkle Innere ohnehin
  hell.
**Geprüft:** Anfahrt 140/90/55 Punkte, innen, Ausgang, Cockpit, Außenansicht – Wüste, Alpen, Stadt (nachts), hoch + quer,
Nacht; selbst angesehen: „Öffnung klar als Tunnel erkennbar“ in allen (vorher: Felswand in der Öffnung).
Bilder: `tests/shots/n33/tunnel_vorher_nachher_hoch.jpg`, `tunnel_vorher_nachher_quer.jpg`, `tunnel_trk_quer.jpg`.

## 2. Zickzack-Barriere (Etappe 1)
- `zigzag` (3 Felder, 5 Blöcke, 26 m Abstand, 8,0 m tief in die 14,6 m breite Fahrbahn, Gasse 6,6 m, 1,3 m hoch, Kappe),
  `zigzag2` (2 Felder, 3 Blöcke bis zur Mitte; Sanft). Blöcke kollidieren. Die Ideallinie fährt den Slalom von selbst (an
  jedem Block ist die befahrbare Breite auf die freie Seite verengt), Tempo-Deckel 70 km/h ab 8 m vor dem ersten Block.
- Leicht: Autopilot lenkt; Mittel: Spurhilfe zur Ideallinie durch die Gassen (ab 30 m vor dem ersten Block), kein Auto-Nitro.
- Generatoren: flach Sanft höchstens die kurze, Sportlich/Irre Pflicht; 3D und Gelände ebenso (Gelände auf Sockel).
- Browser: Leicht/Mittel/Original × Verfolger/Cockpit/Stoßstange, hoch + quer: 0 Crashs, HUD „Zickzack – Spurhilfe“,
  Warnstreifen gut sichtbar (auch aus Cockpit/Stoßstange und nachts). `tests/shots/n33/zickzack.jpg`.
- Fund unterwegs (kein Spielfehler): Wer im Test das Auto per Teleport zurücksetzt, bekam nach 5 s „Festgefahren“, weil der
  Fortschrittszähler nicht mit zurückgesetzt wird – im Spiel setzen Zurückspulen/Reset ihn zurück. Testskripte setzen ihn mit.

| Zickzack (festes Tempo, Autopilot lenkt) | Plan | 60–95 km/h | 100 km/h | 105/120 km/h | Autopilot |
|---|---|---|---|---|---|
| zigzag flach | 70 km/h | ok, Abstand ≥ 0,38 m | ok (0,41 m) | Aufprall | ok, 0,37 m |
| zigzag Ebene 1 | 70 km/h | ok, ≥ 0,39 m | Aufprall (streift) | Aufprall | ok, 0,38 m |
| zigzag2 flach / Ebene 1 | 70 km/h | ok, ≥ 0,48 m | ok | ok (0,75 m) | ok, 0,48 m |

## 3. Röhre mit Mittelwand (Etappe 3)
- `tube_wall` (2 Felder): hinter dem Portal wird der Querschnitt über 8 m kreisrund (Radius 5,6 m), 56 m Rolle: rechts die
  Wand hinauf, kopfüber über die Mitte, links hinunter; Mittelwand (untere Hälfte, 0,8 m dick, Warnstreifen) kollidiert.
  Tempo-Fenster aus dem Profil: oben ≥ 51 km/h, Plan bis ~113 km/h. HUD Mittel „Röhre – Wand! – Überkopf – Spurhilfe“.
- Generatoren: flach Irre Pflicht, Sportlich Gewicht 2; 3D Irre statt der Pflicht-Röhre; Gelände Irre Pflicht; nie Sanft.
- **Neu in der Abnahme:**
  - **Kamera:** Der Verfolger kam in der Rolle bis 0,1 m an die Rohrwand (die Verdeckungs-Strahlen treffen die gekrümmte Wand
    erst spät) → Blick nach draußen auf Wiese und Röhren-Außenseite. Die Stoßstangen-Kamera (0,4 m über der Wand, weites
    Sichtfeld) schnitt mit der Nahebene seitlich durch die Wand. Jetzt bleiben beide mindestens 1,3 m von der Wand
    (Verfolger ≤ 4,3 m, Stoßstange ≤ 4,1 m von der Achse, Radius 5,6 m); Cockpit 4,6 m (unverändert, sauber).
  - **Licht in der Röhre:** innen dunkel wie im Tunnel, dazu Lichtringe rund ums Rohr alle 12 m (die Linie rollt durch den
    ganzen Querschnitt, Deckenbänder lägen auf der Fahrbahn) – nur die Innenwand, nicht der Außenmantel.
- Browser: Leicht/Mittel/Original × drei Kameras, hoch + quer, flach und Gelände, kopfüber bei ~85–100 km/h: 0 Crashs.
  Kino-Replay-Clip „🔄 Röhre über Kopf“ im Film. `tests/shots/n33/roehre_wand.jpg`, `nacht_hindernisse.jpg`.

| Röhre mit Wand (festes Tempo) | oben | ohne Radkontakt | Lage | Dach über Wand-Oberkante | Ergebnis |
|---|---|---|---|---|---|
| 40 km/h | 36 km/h | 1,54 s | −1,00 | 1,57 m | fällt von der Decke → Crash (gewollt) |
| 50 km/h | 49 km/h | 0,39 s | −0,99 | 3,88 m | ok (kurz abgehoben) |
| 55–100 km/h | = Einfahrt | 0 s | −1,00 | 4,0–4,2 m | ok |
| 110/120 km/h | 108/110 km/h | 0 s | −1,00 | 4,25 m | ok |
| Autopilot | 100 km/h | 0 s | −1,00 | 4,23 m | ok |

## 4. Spirale als Stunt (Etappe 2)
- Flach: „Spiralen-Hochstraße“ (Spirale hinauf → Brücke → Spirale oder Rampe hinunter, mindestens eine Spirale), gut ein
  Drittel mit **Klippensprung** hinunter, wenn Platz. 3D: Spiralen ×1,5. Kulissen-Spots (Zuschauer/Tribüne/Kran) am Spiralfuß.
- **Neu: im Gelände** (Vorbau hatte das offen gelassen – die Spirale überquert sich selbst, das Höhenfeld bräuchte dort zwei
  Höhen): Die ganze Gruppe ist ein Sockel, das Gelände bleibt darunter eingeebnet, die Pfeiler stehen auf dem Sockel, unter
  der Brücke liegt ein Teich. Sportlich ~50 %, Irre ~65 % der Strecken; die Grundform ist dort etwas größer, die übrigen
  Elemente kommen gleich oft oder öfter als ohne Spirale (Zickzack 62 statt 50, Röhre mit Wand 41 = 41 je 80 Strecken).
  `tests/shots/n33/spirale.jpg`, `spirale_gelaende.jpg`.

## 5. Lösbarkeit und Fahrer
Prüffahrt mit Entschärfen (`node tools/hindernis_mess.mjs quote`), v1 = vorher:

| | Sanft v1 → v2 | Sportlich v1 → v2 | Irre v1 → v2 |
|---|---|---|---|
| flach | 100 → 100 % | 100 → 100 % | 100 → 100 % |
| 3D | 100 → 100 % | 100 → 100 % | 100 → 100 % (0 Entschärfungen) |
| Gelände (Vorbau) | 100 → 98 % (1/50, Kurve weit hinter dem Element) | 100 → 100 % | 100 → 100 % |
| Gelände mit Spirale (neu, 40 Seeds) | 100 % | 100 %, 0 Entschärfungen | 100 %, 0 Entschärfungen |

Fahrer auf Zufallsstrecken Version 2 (Vorbau 90 Strecken flach/3D/Gelände + 16 Gelände-Strecken mit Spirale), „geschafft“ =
Element ohne Crash/Reset:

| Fahrer | Zickzack | Zickzack kurz | Röhre mit Wand | Spirale | Röhre (Vergleich) | Looping (Vergleich) |
|---|---|---|---|---|---|---|
| Leicht (Sauber/Brachial) | 100 % | 100 % | 100 % | 100 % (auch Gelände 10/10) | 100 % | 100 % |
| Mittel-Handy-Bot | 78 % | 92 % | 78 % | 68 % (Gelände 85 %) | 99 % | 73 % |
| Original-Bot | 92 % | 86 % | 69 % | 84 % (Gelände 87 %) | 73 % | 93 % |

## 6. Leistung (Mess-Gate n30, Handy-Profil CPU ×4, DPR 2,6; im Wechsel gegen main 09baf5b, Median aus 2–3 Runden, p95 ms)
| Szene | Gerät | vorher | nachher | Δ |
|---|---|---|---|---|
| Rennen Kino (4711-3-g, mit Tunnel) | hoch | 10,0–12,3 | 10,5–12,7 | −3 bis +18 % (streut; dritter Lauf −3 %) |
| Rennen Kino | quer | 14,4 / 33,1 | 12,3 / 33,8 | −15 / +2 % |
| Rennen Standard | hoch / quer | 8,0–9,7 / 7,1–11,6 | 7,3–8,9 / 7,0–10,2 | −1 bis −12 % |
| Rennen Einfach | hoch / quer | 4,7 / 5,1 | 4,8 / 5,2 | +2 % |
| Cockpit Kino | hoch / quer | 31–32 / 34–36 | 32–33 / 35–36 | 0 bis +6 % (Bildspitzen ~33 ms in beiden) |
| Looping Kino | hoch / quer | 28,1 / 8,5 | 16,4 / 7,6 | besser |
| **Im Tunnel** Kino | hoch / quer | 30,7 / 25,2 | 29,4 / 17,4 | −4 / −31 % |
| **Im Tunnel** Standard | hoch / quer | 8,2 / 8,5 | 8,1 / 7,8 | −1 / −8 % |

Neue Elemente (nur Version 2, nicht im Wechsel messbar; Bezug Looping Kino 17–27 ms, Tunnel Kino 27–28 ms p95):
Zickzack Kino p95 28/30 ms (p50 8,8/11,7), Röhre mit Wand Kino 27/27 ms (p50 9,5/10), Röhre mit Wand Standard 7,0/7,3 ms,
Gelände-Spirale Kino 29/28 ms (p50 10). Draw-Calls höchstens 132 (Grenze 200). Dreiecke: Zickzack +720, Röhre mit Wand 3 990
statt 3 352, Gelände-Portal ~2 600 je Portal statt 320. Dieselbe Variante streut zwischen zwei Läufen ±5–15 % (headless).
Dateien `tests/perf/2026-10-18_n33_*.json`. Ein echtes Handy habe ich nicht gemessen.

## 7. Kompatibilität
- Alte Codes (ohne „h“): flach 249/249 identisch, 3D und Gelände 120/120 Layout-Hashes wie main n32, Kulissen-Planung 70/70,
  Sammlung und .TRK bitgleich (Röhre/Slalom-Deko unangetastet). Bestzeiten bleiben, keine Löschung.
- Codes mit „h“ sind neu. Hinweis: Gelände-„h“-Codes, die zwischen den Pushes 2ecb907 und 3ed88ae (18.10., ~1 Stunde) erzeugt
  wurden, bekamen danach die Spirale dazu und sehen jetzt anders aus.
- Regler `?hindernis2=0`, `?zickzack=0`, `?roehrewand=0`, `?spirale2=0`, `?tunnelalt=1` werten nicht. Node:
  `STUNT_HINDERNIS2=0` usw., `STUNT_TUNNELALT=1`.

## 8. Tests
- `npm run test:node`: 47/47 grün; neu `tests/node/test_tunnel.mjs` (Läufe, Portal-Lage, Öffnung frei, keine Risse, Maske,
  Portal-Front, .TRK, Röhre/Kamera), `tests/node/test_hindernisse.mjs` (+ G: Spirale im Gelände: Sockel, Pfeiler, Prüffahrt).
- Browser: `python3 tests/tunnel_shots.py hoch wueste,alpen,stadt "" neu 1000 3` (Tunnel-Fotos), `python3 tests/hindernis_shots.py
  quer "seed=3194&d=3&h=1" tube_wall easy,medium,original chase,cockpit,bumper` (Abnahme je Element, meldet Crashs, HUD,
  Kamera-Abstand zur Röhrenachse), `python3 tests/hindernis_runde.py "seed=9&d=2&h=1" easy` (ganze Runde),
  `python3 tests/test_hindernisse_ui.py` (Strecke des Tages mit „h“, Hinweis einmal, Code mit/ohne „h“, Bestzeit bleibt).
- Mess-Gate: `python3 tests/perf_gate.py --ab vorher=<Ordner mit altem Stand>:: --ab nachher= --nur tunnel_kino,rennen_kino`.

## Am Handy testen
1. Strecke des Tages (Gelände) oder Code `1000-3-g` → am Tunnel: Öffnung dunkel, Portal hell mit Warnstreifen, innen Licht.
2. Code `3194-3-h` → Röhre mit Wand auf Leicht (fährt selbst), dann Mittel (Gas geben, Spurhilfe lenkt; unter ~50 km/h fällt
   man von der Decke), Cockpit- und Stoßstangen-Kamera in der Rolle.
3. Code `9-2-h` → Zickzack auf Mittel und Original, danach Spirale → Brücke → Klippe.
4. Code `2-2-gh` → Spiralen-Hochstraße im Gelände. Alles auch nachts (Menü 🕒 Nacht).

## Was offen bleibt
- Belichtungsanpassung beim Tunnel-Ein-/Ausfahren (optional) nicht gebaut.
- Mittel-Bot schafft Röhre mit Wand / Spirale zu 68–85 % (Looping 73 %) – am Handy prüfen, ob die Spurhilfe in der Rolle
  stärker sein soll.
- Zickzack-Tempo-Deckel 70 km/h ist ein Kompromiss (physikalisch bis ~95 km/h fahrbar; Mittel/Original brauchen den Deckel).
