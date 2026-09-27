# Stuntbahn – Höhere Sprünge (27.09.2026)

Peters Wunsch: „Das Auto soll höher springen, das machte einen Teil des Original-Stunts-Feelings aus.“
Grafik bleibt realistisch, die Physik ist im Flug bewusst unrealistisch: das Auto hängt länger und höher in der Luft.

## Was sich geändert hat
| Regler | alt | neu | Datei |
|---|---|---|---|
| **Luft-Schwerkraft** (nur wenn alle 4 Räder frei und nicht in Looping/Röhre/Korkenzieher) | 1,0 | **0,7** – ab 0,2 s Flugzeit, dann in 0,2 s eingeblendet; beim ersten Radkontakt in 0,06 s zurück auf 1 | `src/physics/air.js`, `car.js` |
| Schanzen-Lippe | 15° (2,1 m hoch) | **28°** (3,8 m hoch), gleicher Kreisbogen ab 4 m | `src/track/pieces.js` `JUMP` |
| Landerampe | 2,5 m hoch, 18 m, Verlauf u² | **3,5 m** hoch (≈ Lippe, Rampe → Lücke → Rampe wie im Original), **20 m**, weicher S-Verlauf (oben/unten flach, Mitte ~15°) | `pieces.js` `landY` |
| Zielpunkt des Autopiloten | 45 % der Landerampe | 85 % | `JUMP.aim` |
| Anzeige-Flugbahn (Linie/Kamera) | feste Parabel −0,012·x² | echte Flugbahn bei vbest | `pieces.js` |
| Verfolgerkamera im Flug | zog mit hoch | bleibt auf Absprunghöhe (85 % des Steigens nicht mitgenommen), 1,5 m weiter zurück, Blick waagrecht, Horizont gerade; am Boden unverändert 5,0 m / 1,75 m; auch im Replay | `src/gfx/camera.js` |

**Eine gemeinsame Rechnung:** `flightPath()` in `src/physics/air.js` integriert die Flugbahn genau wie die Physik
(120 Hz, gleiche Verzögerung/Einblendung, Luftwiderstand des Autos). Sie wird überall genutzt: Tempo-Fenster der
Schanze (`jumpWindow`, jetzt in `pieces.js`), Import-Sprünge (`genericJumpWindow`), Autopilot und Stufe „Leicht“
(über das Tempo-Profil) und die Anzeige-Flugbahn. Alle alten Werte stehen als Kommentar im Code.

**Warum 28° statt 22–26°:** Die Weite ist durch das Element festgelegt (Lücke 20 m + Landerampe 20 m). Bei gleicher
Weite hängt die Scheitelhöhe fast nur vom Lippenwinkel ab, nicht von der Schwerkraft (die verlängert die Flugzeit).
Mit 26° kam der Scheitel nur auf ×1,8 oder die Weite auf +23 %. 28° erreicht ×1,9 bei nur +15 % Weite.
Folge: Das Auto springt mit ~60 statt ~80 km/h ab (langsamer, dafür höher und länger in der Luft).

**Nebenbei behoben:** Palmen in Sprunglücken (.TRK) werden jetzt wie die übrige Szenerie niedrig gebaut. Mit der
höheren Flugbahn streifte das Auto sonst auf einer Korpus-Strecke den Stamm (mit alter Physik gab es dort auch schon einen Crash).

## Messungen (Node-Sim, `node tools/jump_measure.mjs`, Standard-Schanze, Autopilot bei vbest, ohne Lagehilfe)
| | alt (15°, volle Schwerkraft) | neu (28°, Faktor 0,7) | Änderung | Ziel |
|---|---|---|---|---|
| Tempo an der Lippe | 22,3 m/s (80 km/h) | 16,8 m/s (60 km/h) | | |
| **Scheitel über der Lippe** (Fahrzeugmitte) | 1,56 m | **2,96 m** | **×1,9** | ~×2 ✅ |
| **Airtime** (alle Räder frei) | 1,29 s | **2,13 s** | **+65 %** | +50–80 % ✅ |
| **Weite** (Lippe → erster Radkontakt) | 29,2 m | **33,7 m** | **+15 %** | moderat ✅ |
| Tempo-Fenster | 22,1–27,7 m/s | 14,2–19,5 m/s | Breite gleich | |
| Aufprall Karosserie/Anschlag bei vbest | 0 | 0 | | |

Robustheit: Tempo an der Lippe 14,3–19,3 m/s (Profil −15 % … +15 %) → kein Crash. Härtester Aufprall 5,6 m/s (Crash erst ab
13 m/s Unterboden / 15 m/s Federanschlag); zu langsam = kurz vor der Rampe, zu schnell = hinter der Rampe, beides ohne Crash.
Mit Lagehilfe („Leicht“): Scheitel 2,96 m, Airtime 2,11 s.
Gegenprobe: `?lip=15&air=1` ergibt wieder 1,59 m / 1,30 s / 29,6 m (= alter Sprung).

**Import-Sprünge (.TRK):** gleiche Luft-Physik, aber die Geometrie (Rampenwinkel, Landerampe) stammt aus dem Original
und legt die Weite fest. Deshalb werden sie länger, nicht höher. Beispielstrecke (`node tools/jump_measure_trk.mjs`):
Flugzeit 1,68 → **1,97 s (+17 %)**, Höhe 1,53 → 1,40 m, Absprung 20,1 → 18,4 m/s.

## Regression
| Prüfung | vorher | nachher |
|---|---|---|
| Node-Tests (`npm run test:node`): Parser 424/424, Import 1522/1522, Looping-Gate, Generator 36/36, Fahrhilfen, Reset | grün | **grün** |
| Generator 10 Seeds × 3 (Autopilot ohne Hilfen) | 30/30 | **30/30**, 0 Entschärfungen |
| Generator 40 Seeds × 3 | 120/120 (1 Entschärfung) | **120/120** (0 Entschärfungen) |
| Generator „Leicht“, Spieler tut nichts (`tools/jump_easy_batch.mjs`, 30 Strecken, 23 Schanzen) | 30/30 ohne Crash, Flugzeit 1,21 s | **30/30 ohne Crash, Flugzeit 2,02 s** |
| dito 120 Strecken, 86 Schanzen | – | **120/120 ohne Crash** |
| .TRK-Korpus 200: Autopilot im Ziel, Leicht | 194 (97,0 %) | **194 (97,0 %)** |
| .TRK-Korpus 200: ohne Hilfen | 172 (86,0 %) | **172 (86,0 %)** |
| Browser: Smoke, Rennen/Geist/Replay, Import-Oberfläche | 0 Fehler | **0 Fehler** |

Zwischendurch ohne die 0,2-s-Verzögerung: Kurze Hüpfer über Bodenwellen wurden ebenfalls „schwebend“, und
1 von 120 Generator-Strecken blieb danach in einer Haarnadel hängen. Mit Verzögerung gelten die normalen Hüpfer wie früher, nur echte Sprünge schweben.

Fotos: `tests/shots/final/sprung_seite_neu.jpg` / `_alt.jpg` (Streckenkamera am Scheitel),
`sprung_verfolger_scheitel_neu.jpg` / `_alt.jpg`, `sprung_landung_neu.jpg`. Ganze Serie: `python3 tests/jump_shots.py`.

## URL-Parameter
- `?air=0.7` Standard · `?air=1` = volle Schwerkraft auch im Flug (Original-Physik) · `?air=0.6` noch mehr Schweben (0,3–1)
- `?lip=28` Standard · `?lip=24` flachere Lippe · `?lip=15` = alte Schanze **samt alter Landerampe**
- `?lip=15&air=1` = exakt der alte Sprung (zum direkten Vergleich)

## Grenzen (ehrlich)
- Absprung mit ~60 statt ~80 km/h: Das folgt aus „höher, aber kaum weiter“ bei festem Element.
- Das Auto kippt im Flug langsam mit der Nase nach unten (~−15° bei der Landung). Das passt zur Landerampe; auf „Original“
  kann eine schiefe Landung bei falschem Tempo crashen (so gewollt).
- Import-Sprünge schweben länger, sind aber nicht höher (Original-Geometrie). Ihre Anzeige-Linie bleibt die bisherige Näherung.
- Sieht man vom Verfolger direkt von hinten, verdeckt die Landerampe teils den Blick in die Lücke. Die Höhe wirkt am
  stärksten in der Strecken- und Hubschrauberkamera (Kamera-Knopf/`C`).

## Bitte am Handy testen
1. **Strecke des Tages** oder `4711-2` auf **Leicht**: Wirkt der Sprung wie „damals“ – hoch, lange in der Luft? Zu viel/zu wenig?
2. Gleich danach mit `?lip=15&air=1` am Link (alter Sprung) vergleichen, dann `?air=0.6` (mehr Schweben) und `?air=0.8`.
3. **Mittel/Original**: Schanze mit eigenem Gas – findet man das Tempo (ideal ~60 km/h an der Lippe, Fenster 51–70 km/h)?
4. Kamera im Flug: Sieht man die Höhe? Einmal mit `C` auf Hubschrauber/Strecke umschalten und vergleichen.
5. Landung: Fühlt sie sich hart genug an (Federweg, Geräusch), ohne zu nerven?
6. Eine .TRK-Strecke mit Sprüngen (z. B. aus dem Wettbewerbs-Archiv): schweben die Sprünge angenehm länger?
