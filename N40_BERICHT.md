# n40 – Herzige Tier-Zuschauer und Zieljubel-Stunt (26.10.2026)

Auftrag (Peter 20.10.2026 ~21:45): „stuntbahn: niedlichere zuschauer (herzige tiere), kamera in looping zu niedrig, clippt
durch boden. wenn möglich automatischer nitro und sprung und schraube oder front/backflip im ziel“.
Nachtrag 20.10. ~22:00: Kamera erledigt Hermes direkt (0.12.2), „menü tiere reicht völlig“.

## Kurz für Peter
- **0.13.0 – Tier-Zuschauer (live):** Statt Menschen jubeln jetzt Bärchen, Häschen, Füchse, Pinguine, Kätzchen und Kühe am
  Rand und auf den Tribünen – großer Kopf, große Kulleraugen, rosa Bäckchen. Beim Stunt hüpfen sie und reißen die Pfoten hoch,
  manche schwenken Fahnen. In der Fan-Cam des Films haben die Köpfe jetzt Tier-Ohren.
  Umschalten: **Optionen → Zuschauer: Tiere / Menschen** (Standard Tiere).
- **0.14.0 – Zieljubel-Stunt (live):** Nach der Ziellinie zündet dein Auto den Nitro, springt und macht zufällig eine
  **Schraube, einen Frontflip oder Backflip**, landet sauber und rollt aus; danach wie gewohnt der Schwenk auf den Zielbogen.
  Ist hinter dem Ziel kein Platz (Looping, Sprung, Kurve gleich danach), kommt der alte Dreher bzw. Ausrollen.
  **Zeit, Bestzeit, Geisterauto und Online-Wertung bleiben exakt gleich** (bitgleich gemessen). Im Replay und Highlight-Film
  ist der Stunt zu sehen („🏁 Ziel · Backflip“). Umschalten: **Optionen → Zieljubel: Stunt / Dreher / Aus**.
- **Kamera im Looping:** wie besprochen nicht angefasst (deine 0.12.2 bleibt). Neu nur: Fährst du im Cockpit, zeigt der
  Ziel-Stunt kurz den Verfolger – sonst würde sich beim Flip das ganze Bild überschlagen.
- Ruckeln: Tiere kosten im Handy-Profil 0–4 % Bildzeit (Messstreuung ±5 %), gleich viele Zeichenaufrufe, nichts Neues zu laden.
- Handy: App einmal ganz schließen und neu öffnen (neuer Service-Worker).

Zum Ausprobieren:
| Link | Was |
|---|---|
| https://drpeterkalmar.github.io/stuntbahn/ | neuer Standard: Tiere + Stunt |
| https://drpeterkalmar.github.io/stuntbahn/?zuschauer=mensch | Menschen wie bisher |
| https://drpeterkalmar.github.io/stuntbahn/?zstunt=back | Stunt immer als Backflip (`schraube`, `front`) |
| https://drpeterkalmar.github.io/stuntbahn/?zieljubel=dreher | Zieljubel wie bis 0.13 |

## 1. Ablauf
1. **Vorbau** (Leicht-Spur, rog17, 23.10., ohne Browser): Branch `vorbau/stuntbahn-n40-tiere-kamera-zieljubel`, Basis main
   @ 14863df. Übergabe-Datei `VORBAU_stuntbahn-n40-tiere-kamera-zieljubel.md` – hier eingearbeitet (Abschnitte 2, 3, 6), Datei
   entfernt, Branch lokal gelöscht (lag nie auf GitHub).
2. **Vorher** auf main @ 3c670b1 (0.12.4): `npm run test:node` 62/62 grün; Kopie des Stands für Vergleiche in
   `tests/out/n40/vorher` (nicht im Repo).
3. **Merge `--no-ff`** – keine Konflikte (main war inzwischen bei n40-Lack und n41-Reset-Knopf; der Vorbau berührte deren
   Dateien nicht bzw. nur andere Stellen von ui.js/main.js).
4. Abnahme im Browser Etappe für Etappe, Korrekturen, Push **0.13.0** (Tiere, Zieljubel-Standard noch Dreher), live geprüft,
   dann **0.14.0** (Zieljubel-Standard Stunt), live geprüft.

## 2. Etappe 2 – Tier-Zuschauer (0.13.0)
Vom Vorbau übernommen: `src/gfx/tierform.js` (Arten, Farben, Figur als Zahlenlisten, Mischung nach Seed, Atlas-Plan,
`zuschauerModus`), `src/gfx/tiere.js` (Geometrie, Shader mit Maske je Art, Karten-Atlas), Einbau in `kulisse2.js`/`deco.js`,
Option in `src/ui/n40optionen.js`, Fan-Cam-Ohren. Alle 6 Arten stecken in **einer** Figur; die Ecken der anderen Arten fallen
im Vertex-Shader in den Rumpf → weiter 1 Draw-Call + Blob-Schatten, Vorauswahl unverändert.

| Prüfung im Browser | Befund | Korrektur |
|---|---|---|
| Shader übersetzt (Kino feine Figur, Standard grobe Figur; Pixel 7 quer/hoch, Desktop) | 0 Fehler | – |
| Vision „niedlich und als Tiere erkennbar?“ (`tiere_quer.jpg`, `tiere_quer_q1.jpg`, `tiere_desktop.jpg`, `tiere_nah_quer.jpg`) | ja: Hase, Bär, Fuchs, Pinguin, Katze, Kuh klar erkennbar, Kulleraugen mit Glanzpunkt, Bäckchen; Tribüne nah/fern und Karten in 90 m stimmig | – |
| Jubel | Tiere hüpften, aber die kurzen Ärmchen verschwanden hinter dem großen Kopf (die „Spreizung“ der Menschen dreht die Arme leicht nach **innen**) | `TIER_J.up/spread` negativ → Pfoten oben in V-Form neben dem Kopf; Menschen-Shader weiter Zeichen für Zeichen gleich (Test) |
| Fotoskript Jubel | zeigte kaum Jubel (Spiel lässt den Jubel jedes Bild abklingen – galt auch für die alten n32-Fotos) | `tests/n40_shots.py` setzt den Jubel direkt vor dem Foto |
| Fan-Cam im Film (`fancam_tiere_quer.jpg`) | Hasen-/Katzen-/Bärenohren an den Silhouetten gut lesbar, bei „Menschen“ ohne Ohren | – |
| Optionen-Menü (`tests/n40_menu.py`, hoch/quer) | Umschalten baut die Welt richtig um, gespeichert, `?zuschauer=` hat Vorrang – **aber** nach dem Umschalten landete man im Hauptmenü | ui.js: nach dem Neubau zurück in die Optionen |
| Lizenz | – | Hinweis im Info-Blatt: Tier-Zuschauer eigene Arbeit (im Spiel erzeugt) |

**Leistung** (`tests/perf_gate.py`, Handy-Profil CPU ×4 / DPR 2,6, quer, 3 Runden im Wechsel, Strecke 4711-3-g mit 509
Zuschauern, Szenen `tests/perf_szenen_n40.json`, Ergebnis `tests/perf/2026-10-26_n40_tiere_ab_quer.json`):

| Szene | p95 Menschen | p95 Tiere | Draw-Calls | Dreiecke Menschen → Tiere |
|---|---|---|---|---|
| Menü am Start (Kino) | 7,5 ms | 7,6 ms (+1 %) | 89 → 90 | 303 k → 335 k |
| Startlinie, Countdown (Kino) | 7,3 ms | 7,5 ms (+3 %) | 116 → 116 | 318 k → 350 k |
| Startlinie, Countdown (Standard) | 4,5 ms | 4,7 ms (+4 %) | 114 → 114 | 271 k → 287 k |
| Rennen (Kino) | 8,6 ms | 8,6 ms (±0) | 102 → 102 | 310 k → 314 k |
| Rennen (Standard) | 6,2 ms | 6,3 ms (+2 %) | 100 → 100 | 265 k → 266 k |

Gleiche Variante streut zwischen zwei Läufen ±5 %. Hebel falls nötig (nicht gebraucht): grobe Figur auch auf Kino
(`tierGeometry(true)`), kürzere Ausblend-Entfernung, weniger Unterteilung in `tierForm`.

## 3. Etappe 3 – Zieljubel-Stunt (0.14.0)
Vom Vorbau übernommen: `src/game/zielstunt.js` (Ablauf, Platz-Prüfung, Figur aus Strecke + Zielzeit, gerechnete Flugbahn),
`race.js` (Phasen bremsen → Nitro → Flug → ausrollen, Aufzeichnung länger), `highlights.js` (Tele bis nach der Landung, Titel),
`main.js` (Zielshow-Zeiten), Töne. Ablauf: an der Linie auf ~79 km/h bremsen → 0,5 s Nitro mit Flammen → Absprung → 1,5 s Flug,
Scheitel ~2,7 m, volle Drehung → Landung genau in Fahrtlage → ausrollen → Schwenk auf den Zielbogen.

| Prüfung im Browser | Befund | Korrektur |
|---|---|---|
| Fotoserien je Figur (`stunt_*_quer.jpg`, `stunt_schraube_hoch.jpg`) | Nitro-Flammen, Sprung, Schraube/Front-/Backflip, Landung gut zu sehen; Verfolger hält den Horizont gerade | – |
| **G-Messer** im Film | bei der „sauberen“ Landung **9,7 G** (harte Landung). Zwei Ursachen: Flugbahn landete mit 7,4 m/s Sinkrate in einem Bild, und im Landebild fehlte ein halber Schritt (Flugzeit kein Vielfaches eines Bildes) | weiche Landung: Bahn flacht zum Ende ab (`ZSTUNT.soft`, ~2,2 m/s), Sinkrate wird an die Federung übergeben, Rest des Landebilds weitergefahren → **≤ 3,1 G** (neuer Test); Drehung jetzt 8–78 % der Flugzeit, Bodenfreiheit dabei 0,43 m (vorher 0,34) |
| **Cockpit** | beim Flip überschlug sich das ganze Bild | ab dem Nitro zeigen Cockpit/Stoßstange den Verfolger (harter Schnitt) mit dessen Flug-Regeln (Welt-Oben, Blick entlang der Flugbahn) – `stunt_schraube_quer_cockpit.jpg` |
| Bitgleich (`tests/n40_ziel_probe.py`, Leicht, 4-2) | Rennzeit 59,392 s, Aufzeichnung bis zur Linie, Bestzeiten/Geist-Speicher **identisch** für Aus/Dreher/Stunt | – |
| Highlight-Film (`film_ziel_quer.jpg`) | „🏁 Ziel · Backflip“, Tele folgt Absprung, Flip und Landung, danach Zielbogen mit Feuerwerk | – |
| Optionen | Stunt/Dreher/Aus gespeichert, gilt im nächsten Rennen, `?zieljubel=` hat Vorrang (`tests/n40_menu.py`) | – |
| Rauchtest Desktop + Pixel 7 quer (Kino/Standard, mit Stunt) | 0 Fehler | – |

Node (`tests/node/test_zielstunt.mjs`): echte Fahrten auf 8 Strecken – Stunt auf 7 (Backflip 5, Schraube 1, Frontflip 1; 2-2 hat
~70 m hinter dem Ziel einen Looping → Dreher), danach aufrecht, 1,6–3,3 m innerhalb der Kante, nie Crash, im Replay kopfüber +
Flammen, **Rennzeit, Geist und Aufzeichnung bis zur Linie bitgleich mit/ohne Stunt 8/8**, zweimal gefahren bitgleich.

Offen / bewusst so gelassen:
- Der Absprung selbst zeigt im G-Messer ~5,5 G (Auto bekommt im Absprung-Bild seinen Schwung nach oben – wie eine Schanze).
- Hochkant schneidet die Zielbogen-Kamera (n27) den Bogen seitlich an – unverändert seit n27.
- Generierte Rundkurse haben oft schon 70–110 m nach dem Ziel einen Looping – dort gibt es (wie beim Dreher) keinen Stunt.
- Online: der Stunt läuft nach der eigenen Zeitnahme; die anderen sehen ihn über die Positionsdaten (nicht eigens geprüft).
- Kein „🔥 NITRO“-Banner im Ziel (Absicht, über der Zielshow).

## 4. Tests
- `npm run test:node`: vorher 62/62, nachher **64/64** (neu `test_tiere.mjs`, `test_zielstunt.mjs`; beide in `run_all.mjs`).
  Am Mac war vorher kein Test rot (die im Vorbau genannten rog-roten Tests sind Windows-/Pfad-Effekte).
- Browser: `tests/n40_shots.py tiere|stunt`, `tests/n40_ziel_probe.py`, `tests/n40_menu.py`, `tests/fancam_shots.py`,
  `tests/smoke.py` – alle grün, 0 pageerrors. Test-Browser stumm (`--mute-audio`).
- Werkzeug: `node tools/zielstunt_g.mjs <seed> <diff>` (G-Verlauf rund um den Stunt), `tools/version_setzen.py` (Version beim
  Zusammenführen).

## 5. Dateien
`src/gfx/tierform.js`, `src/gfx/tiere.js`, `src/game/zielstunt.js`, `src/ui/n40optionen.js` (neu); geändert `kulisse2.js`,
`deco.js`, `race.js`, `highlights.js`, `camera.js`, `main.js`, `ui.js`, `store.js`, `sound.js`. Fotos `tests/shots/n40/`.

## 6. Aus der Vorbau-Übergabe (rog17, 23.10.)
- Vorbau-Budget: Figur 638 Ecken/872 Dreiecke (sichtbar je Art 404–504), Menschen 260/~120; grobe Figur auf Standard 538 Ecken.
  Gezählte Dreiecke über alle Instanzen z. B. 4711-3 Kino 452 k statt 74 k – gezeichnet werden nur die nahen (≤ 83 m), daher im
  Bild nur +16–32 k (Tabelle oben).
- Platz-Prüfung hinter dem Ziel (`stuntRaum`, `flugFrei`): ab 15 m vor dem Absprung bis Landung + Anhalteweg keine
  Schanze/Looping/Röhre/Luftstrecke/Hindernis, Querneigung ≤ 0,12, Fahrbahn ≥ 9 m, Linie unter der Flugbahn ≤ 2,5 m seitlich,
  Kuppe ≤ 0,8 m, Senke ≤ 4 m, keine Decke; beim echten Absprung noch einmal mit dem echten Tempo, sonst Abbruch und Ausrollen.
- Startwerte, die am Bild bestätigt wurden: Bremsen bis 2 g direkt hinter der Linie, Nitro 0,5 s, Flug 1,5 s, Tempo 15–28 m/s,
  Zielshow mit Stunt bis 8,1 s (sonst 4,6 s), „Antippen überspringt“ rechnet den Rest vor (Film hat den Stunt trotzdem).
