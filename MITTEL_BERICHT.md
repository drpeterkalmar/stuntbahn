# Mittel ohne Linien-Magnet, mit mehr Bodenhaftung (n16, 30.09.2026)

Wunsch (Peter, 29.09.): „Mittlere Schwierigkeit mehr Bodenhaftung und kein Magnet zur Ideallinie.“

## Was sich ändert

| | bis n15 | jetzt (n16) |
|---|---|---|
| Zug zur Ideallinie auf der Strecke | 28 % Autopilot-Lenkung beigemischt | **keiner** – du lenkst allein |
| Zug in Looping, Röhre, Luft, an Schanzen | 60 % zur Ideallinie | **Spurhilfe nur im Looping/in der Röhre**: 60 % zur **Fahrbahnmitte**, im HUD angekündigt („🛣️ Looping voraus – Spurhilfe“), deutliches Lenken schaltet sie in 0,26 s ab |
| Reifenhaftung (Grenze) | wie Original | **×1,15** |
| Lenkgefühl unter der Grenze | – | unverändert (Schräglauf-Kennlinie ×1,25, dadurch reagiert das Auto nicht giftiger) |
| Anpressdruck auf die Fahrbahn | 0,35 | **0,6** |
| Stabilitätshilfe (ESP) | lenkte wie der Autopilot (Kurs + Abstand zur Linie) | richtet **nur den Kurs** nach der Fahrbahn aus, zieht nicht zur Linie; gibt bei deutlichem Gegenlenken nach |
| Farblinie, Bremshilfe (Aus/Hinweis/Sanft), Lagehilfe in der Luft, Rückspulen | – | bleiben wie bisher |
| Leicht, Original | – | unverändert (im Test geprüft) |

- Alle Regler stehen in `src/game/race.js` (`MEDIUM_N16`, alte Werte in `MEDIUM_N15`, Spurhilfe in `SPUR`).
- **A/B am Handy:** `?mgrip=1` fährt Mittel genau wie bis n15. Die Zeiten landen dann in der alten Mittel-Liste.
- **Bestzeiten:** Mittel bekommt eine neue Wertung (Schlüssel-Zusatz `@m2`). Die bisherigen Mittel-Zeiten bleiben stehen und erscheinen im Menü als „alte Physik“. Die Schlüssel für Leicht und Original sind unverändert.

## Messungen vorher/nachher

### Kurvengrenztempo (Kreisbahn, Asphalt; `tools/kreisbahn.mjs`, im Test festgenagelt)

| Radius | Original | Mittel bis n15 | Mittel n16 | Zuwachs |
|---|---|---|---|---|
| 25 m | 82 km/h | 88 km/h | 97 km/h | **+10,5 %** |
| 50 m | 124 km/h | 131 km/h | 147 km/h | **+11,9 %** |
| 100 m | 200 km/h | 212 km/h | 244 km/h | **+15,0 %** |

Ziel war +10–15 %. Das ist erreicht.

**Keine Schiene:** Fährt man zu schnell mit voller Lenkung in die Kurve, rutscht das Auto weiter. Der Schwimmwinkel liegt bei 6,8° (20 m/s), 7,6° (30 m/s) und 8,7° (45 m/s); auch das steht im Test.

### Menschenähnlicher Fahrer
Messung mit `tools/mittel_probe.mjs` auf Demo, 6 Generator- und 4 Sammlungs-Strecken mit Loopings/Röhren, je 3 Durchläufe:
- Der Fahrer lenkt nur grob zur Fahrbahnmitte und sieht Kurven kommen.
- Er korrigiert mit 0,2 s Reaktionszeit.
- Er fährt Vollgas und bremst nur, solange „Bremsen!“ steht.

| | bis n15 (mit Zug) | ohne Zug, alte Haftung | ohne Zug, neue Haftung, ohne Spurhilfe | **n16** |
|---|---|---|---|---|
| im Ziel | 33/33 | 33/33 | 33/33 | **33/33** |
| Crashs gesamt | 127 | 296 | 267 | **247** |
| davon in Looping/Röhre/Korkenzieher | 35 | 140 | 139 | **102** |
| Dreher | 70 | 179 | 177 | **146** |
| Abflüge (neben die Bahn, Absturz, Überschlag) | 35 | 53 | 24 | **32** |
| Rundenzeit / Autopilot | 1,33 | 1,84 | 1,76 | **1,69** |

- **Ehrlich:** Das Ziel war „höchstens halb so oft drehen oder abfliegen wie ohne Zug und ohne Extra-Haftung“. Erreicht sind etwa −23 % (Dreher + Abflüge: 232 → 178), nicht −50 %.
- Die meisten Fehler dieses Fahrers sind Anstöße an Leitplanke und Wand sowie schiefe Einfahrten in Loopings. Dagegen hilft Haftung wenig.
- Mehr Haftung (×1,25) brachte in der Messung kaum weniger Dreher, hob aber das Kurvengrenztempo auf +17–23 %. Das fährt sich wie auf Schienen, deshalb bleibt es bei ×1,15.
- Ohne jeden Zug crasht dieser Fahrer im Looping viermal so oft wie bis n15 (140 statt 35). Deshalb gibt es die Spurhilfe. Sie senkt diese Crashs auf 102, denn den meisten Ärger macht die schiefe Anfahrt, und dort hilft bewusst nichts mehr.
- Mittel ist damit spürbar schwerer als bisher. Das ist gewollt: Du fährst selbst.

### Perfekte Eingabe (Lenkung und Pedale wie der Autopilot)

| | bis n15 | n16 |
|---|---|---|
| 60 Sammlungs-Strecken (Test `test_assists`) | 1 Crash, 60/60 im Ziel | **0 Crashs, 60/60** |
| 150 Sammlungs-Strecken (Probe) | 2 Crashs | **0 Crashs** |

- Die erste Fassung (nur Haftung ×1,15, ohne angepasste Schräglauf-Kennlinie) machte das Auto etwas giftiger in der Lenkung.
- Der perfekte Fahrer verfehlte dann an drei Engstellen die Mitte um knapp 1 m (1 Crash auf 100 Strecken).
- Mit gleichem Lenkgefühl unter der Grenze ist das weg.

### Vollgas-Probe aus n14 (`tests/out/n14/mittel_probe.mjs`, lenkt wie der Autopilot, immer Vollgas)
- Vorher: 6/6 im Ziel.
- Nachher: 5/6 im Ziel.
- Auf S42/3 fliegt der Dauer-Vollgas-Fahrer über eine langsame Schanze (Plan 65 km/h, er kommt mit 140), landet neben der Bahn und wird von der Abkürz-Regel immer wieder vor die Schanze gesetzt.
- Bis n15 endete derselbe Flug zufällig mit „Harte Landung“ und einem Reset hinter die Schanze.
- Wer bremst, wenn „Bremsen!“ steht, kommt durch (der menschenähnliche Fahrer oben: 33/33).
- **Hinweis für später:** Die Abkürz-Regel könnte nach 3 Versuchen an derselben Stelle wie bei Crashs weitersetzen (betrifft alle Stufen, nicht Teil dieses Auftrags).

## Tests
- `npm run test:node`: alle grün.
- `test_assists`, neu:
  - Leicht und Original unverändert
  - Mittel ohne Zug
  - „Hände weg“: Die Lenkung bleibt 0, der Abstand zur Linie wächst bis 3,5 m (bis n15 höchstens 1,0 m)
  - perfekte Eingabe auf 60 Sammlungs-Strecken
- `test_fahrgefuehl` E: Kurvengrenztempo +10–15 %, Schwimmwinkel ≥ 4°, Regler, Spurhilfe (Ansage, Fahrbahnmitte, ≤ 0,3 s abschaltbar)
- `test_reset` E: Schlüssel `@m2` nur für Mittel, alte Mittel-Zeit als „alte Physik“
- Browser: `tests/smoke.py` 0 Fehler, `tests/mittel_shots.py` (Demo, Mittel, hoch + quer) 0 Fehler.

Fotos (visuell geprüft): `tests/shots/final/mittel_quer_mittel_kurve.jpg`, `…_hoch_mittel_kurve.jpg` (Kurve mit Farblinie), `…_quer_mittel_looping.jpg`, `…_hoch_mittel_looping.jpg` („Looping voraus – Spurhilfe“).

## Handy-Test
1. Mittel wählen, Kurve zu schnell anfahren: Das Auto rutscht, lenkt aber nicht von selbst.
2. Auf der Geraden die Finger vom Lenken nehmen: Das Auto fährt geradeaus weiter und folgt der Linie nicht mehr.
3. Vor dem Looping steht „🛣️ Looping voraus – Spurhilfe“. Im Looping hält das Auto die Mitte. Wer deutlich lenkt, schaltet die Hilfe sofort ab.
4. Vergleich mit dem alten Mittel: dieselbe Seite mit `?mgrip=1` öffnen.
