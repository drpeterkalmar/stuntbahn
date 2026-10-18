# Vorbau n34 – KI-Gegner + Schadensmodell (Leicht-Spur, rog17, 10.10.2026)

**Basis: vorbau/stuntbahn-n33-hindernisse @ 169a0f3** (n33 Hindernisse/Tunnel, am Mac noch nicht abgenommen). Branch
`vorbau/stuntbahn-n34-gegner`, gepusht nach `mac`. **main ist unberührt** – die Vorher-Messung des Heavy-Jobs kann direkt auf
main (bzw. auf 169a0f3) laufen. Alles ohne Browser gebaut und in Node geprüft. **Im Browser ist nichts abgenommen.**

## Kurz
- **Gegner** (`src/ai/gegner.js`): 0–5 Autos mit echter Physik (`car.js`) + Autopilot mit menschlichen Fehlern, Stärke
  Locker/Ebenbürtig/Profi, Persönlichkeit aggressiv/sauber, fiktive Fahrer mit Lack + Startnummer, Verkehr (Überholen,
  Folgen, kein Überholen und Abstand an Stunts), Crash + Reset wie der Spieler, **Schiene außerhalb der Sicht** (> 170 m,
  zurück < 150 m), Rückspulen, Aufzeichnung 15 Hz (Geister-Format), Zieleinlauf + Hochrechnung.
- **Auto-Auto-Kollision** (`src/physics/autoauto.js`): Quader gegen Quader, Impuls + Drehmoment, Swept-Test; weich (Leicht) /
  mittel / hart (Original).
- **Rennfeld** (`src/game/rennfeld.js`): Startraster 2er-Reihen versetzt, Spieler-Startplatz, Rangliste, Abstände, Hochrechnung.
- **Spiel-Einbindung**: Menü „🏁 Gegner“, HUD „Platz 3/6“ + Abstände, Namensschilder, Zieltabelle, eigene Bestzeiten-Liste
  „mit Gegnern“, Replay/Kino-Replay mit Gegnern, Leicht weicht aus.
- **Schadensmodell** (Nachtrag): `src/physics/schaden.js` (Logik) + `src/gfx/schadenvis.js` (Darstellung): Dellen mit Deckel,
  abfallende Teile (Goblin zur Laufzeit zerlegt), Trümmer, Rauch, Fahrfolgen (Original + Totalschaden), Rückspulen.
- **Regler / Standard:** `?gegner=0…5` (Standard **0 = Aus**, Menü merkt sich die Wahl), `&staerke=locker|ebenbuertig|profi`
  (Standard ebenbuertig), `&startplatz=auto|vorne|mitte|hinten`, `&schilder=0`, `&aufholhilfe=1` (Standard aus),
  `&schiene=0` (A/B: alle Gegner volle Physik), `?schaden=aus|optik|fahrt` (Vorbau-Standard **aus**).
- **Gegner Aus = bitgleich** zur Basis (12 Rennen: Aufzeichnung, Zeit, Crashs; `tests/node/test_gegner.mjs` Abschnitt 13).

## Node-Messung (rog17, `tools/gegner_mess.mjs`, 60 Sammlungs-Strecken gleichmäßig aus 250)
| | im Ziel | Zeit / Autopilot (Mittel, Median, 10–90 %) | Crashs |
|---|---|---|---|
| 1 Gegner Locker | 60/60 | +35,9 %, +36,3 %, +29,9 … +43,7 % | 2 |
| 1 Gegner Ebenbürtig | 60/60 | +14,9 %, +14,6 %, +12,4 … +17,4 % | 1 |
| 1 Gegner Profi | 60/60 | +0,8 %, +0,8 %, +0,7 … +1,0 % (60/60 in ± 5 %) | 0 |
| Reihenfolge Locker > Ebenbürtig > Profi | | **60/60 Strecken** | |
| 5 Gegner Ebenbürtig (Feld) | 300/300 | +20,5 % (Gedränge) | 22 (15 Zusammenstoß) |

Bezug: menschenähnliche Bots aus MITTEL2/3 brauchen 1,37–1,8 × Autopilot, ein fehlerfreier Mittel-Fahrer 1,07 × –
Locker ist schlagbar, Ebenbürtig etwa ein geübter Mittel-Fahrer, Profi ≈ Autopilot (Brief: ± 5 %).
Schiene ↔ Physik (ohne Fehler, Ebenbürtig): Zeit im Mittel **+0,45 %** (−4,2 … +1,6 %), Rechenzeit **9,2 → 0,15 ms je
Auto-Sekunde** (rog17, ~60× billiger). Feld 5 Gegner nach den Verkehrs-Fixes: Stöße > 1,5 m/s in Stunts 24 → 5 (16 Strecken).

## Etappe 1 – Gegner-Modul `src/ai/gegner.js`
**Fertig**
- `STAERKEN` (tempo 0,58/0,76/0,975 außerhalb von Looping/Röhre/Schanze, reaktion 0,35/0,2/0,08 s, streu 1,2/0,7/0,3 m,
  Fehler-Anteile), `CHARAKTERE` (Folge-Abstand, Überhol-Abstand, Mut), `FAHRER` (8 fiktive Namen + Lack), `gegnerListe` (Seed).
- `gegnerProfil`: Tempo-Faktor wirkt nicht in Looping/Röhre/Korkenzieher/Schanzen-Zone (dort Mindesttempo, `muss`-Maske,
  Rampe 60/20/30 m), davor Rückwärtslauf mit Volllast-Beschleunigung (sonst kamen langsame Gegner zu langsam an die Lippe).
- `fehlerPlan` (je Seed vorab: „zu spät gebremst“ an Bremszonen, „Stunt verpatzt“ = Anfahrt × 0,55 oder × 1,28; nicht in
  den ersten 50 m), Brems-Reaktion (bis zur Reaktionszeit Gas weg), Streuung (glattes Rauschen, Rückspul-fest).
- Verkehr: Überholen per Seitenversatz innerhalb der Spur-Grenzen **100 m voraus** (30 m war zu kurz: Aufprall an
  Autobahn-Verengungen), Folgen mit Tempo-Deckel, **vor Stunts ab 220 m mindestens 22 m + 0,55 s × Tempo**, in der
  Stunt-Anfahrt kein Deckel (Profil-Tempo nötig), kein Überholen 70 m vor bis 25 m nach Stunts, daneben ausweichen.
- Crash/Reset wie `Race.recover` auf Leicht (12 m bzw. 45 m vor Stunts zurück, zweimal an derselben Stelle → dahinter,
  nicht in ein anderes Auto), +5 s ohne Totalschaden, 2,6 s Wrack mit Totalschaden; Wächter Abseits/festgefahren/abgestürzt.
- Schiene: Pose über `car.place` (keine Raycasts), Wechsel nur ruhig (4 Räder, kein Stunt), Fehler dort pauschal: das Auto
  steht genau `verlustCrash` 4,5 s (Patzer mit Crash, Anteil `pCrash` 0,2 + Strafzeit), `verlustPatzer` 1,6 s,
  `verlustSpaet` 0,2 s – kalibriert mit `tools/gegner_fehler.mjs` (30 Strecken Locker, je Rennen mit/ohne Fehler-Plan:
  Patzer → Crash 5/24 = 21 %, Verbremser kosten ~0 s; Schiene ↔ Physik mit Fehlern +1,1 % / −0,1 % je 15 Strecken).
- „Zu spät gebremst“ mit kurzer Panik-Vollbremsung (`STAERKEN.*.panik` 0,2–0,7 s) – ohne war spätes, hartes Bremsen sogar
  minimal schneller; auch mit Panik kostet ein Verbremser im Mittel kaum Zeit (Profil hat Brems-Reserve). Wirkung ist klein;
  sichtbare Fehler sind die Patzer (Stunt zu langsam/zu schnell → Crash in ~21 %).
- `GegnerFeld`: Raster, `spielerAufstellen(race)`, `step(dt, race)`, Kollisionen, Rückspulen (10 Hz, 8 s; Totalschaden an
  → Gegner spulen mit), Zieleinlauf, `NACHLAUF` 10 s, `abschliessen()` (Hochrechnung), `stand(race)`, `ausweichen(race)`,
  Aufzeichnung (`aufnahme()`), Aufholhilfe ±5 % (Option).

**Geprüft (Node)**: `tests/node/test_gegner.mjs` (69 Prüfungen, ~28 s mit 2 Strecken): Optionen/URL, Fahrerliste,
Rangliste/Zeitnahme/Abstände, Raster ohne Überlapp auf der Fahrbahn, Masken = `haftOffAt`, Hochrechnung ± 8 %,
3 Stärken × 3 Gegner im Ziel + Reihenfolge, Profi ± 5 %, deterministisch, Schiene ± 3 %, 30 Wechsel Schiene ↔ Physik ohne
Crash, Aufzeichnung, Rückspulen, Spieler-Rennen mit Raster/Zieltabelle/Hochrechnung, Leicht weicht aus, Feld mit Schaden,
Gegner Aus bitgleich, Bestzeiten-Liste. `tools/gegner_mess.mjs` (Tabelle oben; Häppchen `--von/--bis`, `--vergleich`,
`--anzahl=5`, `--summe`).

**Im Browser abnehmen**: Start mit `?gegner=3&staerke=ebenbuertig` (und 1/5, alle Stärken): Gegner fahren sichtbar
menschlich (Linie, Bremsen), überholen nicht in Looping/Röhre/Korkenzieher, Crash + Reset eines Gegners sieht ok aus
(Blitz/Versatz wie beim Spieler?), Schiene ↔ Physik-Wechsel ohne Sprung (Kamera auf einen Gegner, der 150 m Abstand kreuzt),
Startaufstellung + gemeinsamer Countdown, Zieleinlauf: Gegner rollen aus, Zieltabelle nach ≤ 10 s.

**Annahmen/Risiken**: Stärke-Faktoren sind auf Node-Bots abgestimmt; ob „Ebenbürtig“ sich für Menschen ebenbürtig
anfühlt, nur im Spiel prüfbar (Stellschraube `STAERKEN.*.tempo`). Gegner-Crashs werden ohne eigenen Ton gemeldet
(Ereignis `gegnerCrash` – TODO: Ton nach Entfernung). Fehler-Plan gilt für 1 Runde (Rennen sind 1 Runde).

## Etappe 2 – Auto-Auto-Kollision `src/physics/autoauto.js`
**Fertig**: OBB-Trennachsen-Test (15 Achsen, Kantenachsen mit Abschlag), Kontaktpunkt aus den eindringenden Ecken,
Impuls mit Stoßzahl und Reibung über `Car._kEff/_impulse`, Hebel je Härte verkürzt (weich dreht wenig), Δv-Deckel
(weich 6 m/s), Lagekorrektur, Swept-Test ab 0,5 m relativer Bewegung je Schritt (0,35-m-Stücke), festes Auto möglich
(n35). Crash „Zusammenstoß“ ab 16 m/s (mittel) bzw. 9,5 m/s (hart, wie Wandaufprall), nie auf weich.
**Geprüft**: `tests/node/test_autoauto.mjs` (25): Auffahren, Seitenkontakt, Gegenverkehr 2 × 50 und 2 × 150 m/s (kein
Durchrutschen), T-Stoß 80 m/s, nie > 0,35 m ineinander, Impulserhaltung, weich dreht weniger, fest, deterministisch.
**Im Browser abnehmen**: Anstupsen auf Leicht fühlt sich weich an, Original hart; Funken + Blech-Ton bei Stößen mit dem
Spieler (`main.js gegnerSchritt`, höchstens alle 0,25 s); Zusammenstoß-Crash auf Original nicht zu empfindlich (16/9,5 m/s).
**Risiko**: Kontaktpunkt ist eine Mittelung (Flächenkontakt → Flächenmitte); Spoiler/Spiegel ragen nicht aus dem Quader.

## Etappe 3 – Startaufstellung, Rangliste, HUD, Ziel
**Fertig**: `rennfeld.js` (Raster 9 m Reihen, rechte Spalte halbe Reihe versetzt, ±42 % der halben Breite, Rundkurs über
den Start zurück mit Runde −1; offene Strecke rückt zusammen). Spieler-Startplatz `auto`: Locker hinten, sonst Mitte
(Brief: „hinten/mitte je nach Stufe“). `main.js`: Feld beim Rennstart, Spieler auf seinen Platz (`race.tracker.lap = −1`
bei Plätzen hinter der Linie – `Race`-Zielregel `lap >= 1` bleibt richtig), Gegner-Schritt nach `race.step`.
`ui.js`: HUD `.gpos` „Platz 3/6“, ▲ Vordermann +x s, ▼ Hintermann −x s (4 Hz), Ergebnis „🏆 Sieg!“ / „Platz n von m“ +
Zieltabelle (Nummer im Lack, * hochgerechnet), Hinweis „Bestzeiten-Liste mit Gegnern“.
**Geprüft**: test_gegner (Raster, Rangliste, Spieler-Rennen), `tests/node/test_gegner_gfx.mjs` (16, Attrappen: HUD-Text,
Zieltabelle, Menü-Beschriftung, Interpolation, Schatten/Schild, Replay-Pose).
**Im Browser abnehmen**: Raster-Bild (hoch + quer), HUD-Lage/Größe (CSS `#hud .gpos`, TODO am Bild), Zieltabelle,
Namensschilder lesbar (Größe wächst mit Abstand, `SCHILD` in `gegnervis.js`), aus bei `?schilder=0`.
**Risiko**: Race-Zustände `maxProgress`/`onRoad`/Abkürzungs-Regel starten mit Fortschritt 0, der Spieler steht im Raster
bei bis zu −25 m – in Node (Autopilot Original) kein Problem, Leicht/Mittel mit Abkürzungs-Wächter im Browser prüfen.

## Etappe 4 – Darstellung `src/gfx/gegnervis.js`
**Fertig**: je Gegner ein `makeCar`-Auto mit eigenem Lack, LOD ab Mittel (`min: 1`; nah mit Dellen LOD 0), Echtzeit-Schatten
nur bis 60 m, Namensschild-Sprite (Nummer im Lack-Kreis + Name), Interpolation zwischen Physikschritten, Replay aus der
15-Hz-Aufzeichnung (Reset-Sprung ohne Zwischenbild). Autos werden einmal gebaut (bis 5) und wiederverwendet.
**Im Browser abnehmen**: Lack sRGB richtig (n32 hatte „Bonbon-Hellblau“ bei neuen Farben!), LOD-Wechsel unauffällig,
Schild nicht durch Wände (depthTest an), Kino-Replay zeigt Gegner, keine JS-Fehler beim ersten Bau (async `bereit`).
**Nicht gemacht**: Gegner-Autos in der Lack-Spiegelung (`reflexOpts.hide`) – Gegner spiegeln sich im Heldenauto (gewollt?).

## Etappe 5 – Fahrhilfen fair, Bestzeiten, Replay
**Fertig**: Leicht: `feld.ausweichen(race, dt)` → `race.ap.avoid` (Autopilot.avoid, 0 = wie bisher) + `race.ap.vCap`:
vorbei, wenn Platz ist (Spurgrenzen tempoabhängig 30/60/100 m, Versatz weich 2,2 m/s), sonst Abstand halten (nicht in der
Stunt-Anfahrt; gecrashter Gegner bremst nicht auf 0). Weil Leicht das Auto mit „Hände weg“ im ±3,5-m-Band treiben lässt
und einen Versatz kaum fährt, **machen die Gegner auf Leicht dem schnelleren Spieler von hinten Platz** (`PLATZ_MACHEN`).
Probe `tools/gegner_spieler_probe.mjs` (Leicht „Hände weg“, 5 Locker-Gegner, Rasterplatz hinten): im Ziel ohne Crash,
Platz 1 bzw. 4, Kontakt-Schritte 383/554 (vorher bis 2482 bzw. hängen geblieben mit „Festgefahren“); vom Rasterstart keine
falschen Abkürzungs-/Reset-Ereignisse (Leicht und Mittel). Gegner selbst entscheiden/ begrenzen weiter mit 100 m
(tempoabhängig gab es im 5er-Feld 11–12 statt 6 Crashs). Gegner halten an Stunts Abstand/überholen nicht. Bestzeiten: `modeKey(…, gegner)` → Liste `@g`, eigener Geist, Leicht-Zeiten mit Kennung `g`;
Geisterauto + Gegner gleichzeitig. Replay/Kino-Replay: `gegnerRec` aus `aufnahme()`.
**Im Browser abnehmen**: Leicht weicht einem langsamen Gegner sichtbar aus (gerade Strecke), Bestzeit „mit Gegnern“
getrennt (Solo-Liste unverändert), Highlights-Film zeigt Gegner.

## Etappe 6 – Schadensmodell (Nachtrag 08.10.)
**Asset-Recherche**: nicht neu gemacht (kein Sketchfab-Zugang auf rog17); die Mac-Vorrecherche im Brief gilt (kein freies
Modell mit Schadens-System). Umgesetzt wurde der Plan „prozedural am Goblin“: **keine neue Asset-Datei** –
`tools/schaden_teile.mjs` liest `goblin.glb` (meshopt, Decoder aus `lib/`) in Node, rechnet wie `makeCar` in
Auto-Koordinaten um und bestimmt die Teile-Bereiche per Querschnitt (Spiegel = dichter Knoten bei |x| 0,8–1,0,
y 0,25–0,35, z −0,85 … −0,65; der Goblin hat **keinen aufgesetzten Flügel** → „Spoiler“ = Heck-Abrisskante). Zur Laufzeit
zerlegt `schadenvis.js` Karosserie, Lack und Glas (alle LOD-Stufen) in Rumpf + Teile (+1 Draw-Call je Mesh, nur mit
Schaden an). LICENSES.md braucht deshalb keinen Eintrag „Änderungen“ (Datei unverändert) – Heavy-Job bitte bestätigen.
**Fertig**: Dellen (radial, glattes Rauschen, Tiefe ≤ 16 cm je Delle, Summe ≤ 20 cm, nie in den Innenraum-Quader,
höchstens 12, nahe zusammengelegt), nachgezogene Normalen (analytisch), Teile-Ablösung je Bereich nach Treffer-Summe
(Spiegel 6, Abrisskante 14, Stoßstangen 18, Haube 30 m/s über 3 m/s), Trümmer (Wurf, Abprall an Strecke/Gelände, 6 s),
Rauch ab 70 %, Fahrfolgen (ab 60 % Ziehen bis 0,05 rad + Leistung bis × 0,75, 100 % = Wrack „Totalschaden“; nur
`?schaden=fahrt` + Original + Totalschaden), kompakter Zustand 3 + 8 Byte je Delle (n35), Rückspul-Verlauf (Rückspulen
mit Uhr spult Schaden mit; Reset repariert nicht; neues Rennen = repariert), Gegner gleich (Dellen nur nah).
Haken: `car.onTreffer` (Karosserie-Treffer, Physik unverändert), `race.schadenFolgen` (null = aus).
**Geprüft**: `tests/node/test_schaden.mjs` (31: Deckel über alle 27 534 Goblin-Punkte nach 40 Treffern, Normalen gegen
Differenzen, Packen ± 4 mm, Teile, Fahrfolgen, Trümmer, Wand-Crash, Haken ändert Physik nicht, Rückspulen mit/ohne Uhr),
`tests/node/test_schaden_gfx.mjs` (9, echte Goblin-Geometrie: 35 687 Dreiecke vollständig zerlegt, Spiegel ab,
Rückspulen, Trümmer, Dellen in Häppchen). Dellen-Rechnung über mehrere Bilder verteilt (`DELLEN_BUDGET` 1 ms je Bild;
schwerer Treffer am Stück ~6–8 ms Desktop, jetzt erstes Bild ~3 ms inkl. Planung, Rest in 1–2 Folgebildern).
Rückspulen: Uhr zurück (Totalschaden an) → Stand zur Zeit; Uhr läuft weiter → Stand des zurückgeholten Schnappschusses.
**Im Browser abnehmen**: `?schaden=optik`, dann `__game.treffer([0, 0, -2.4], [0, 0, -1], 15 | 25 | 40)` für leicht/mittel/
stark (hoch + quer), Dellen sichtbar und nicht „durchstochen“, Teile fallen ab und fliegen, Rauch, Replay; kein Ruckler beim
Treffer am Handy (Budget 1 ms/Bild, ggf. `DELLEN_BUDGET` anpassen). Mess-Gate Schaden ≤ 5 % p95 und keine
Shader-Neu-Übersetzung (es gibt keine Shader-Änderung).
**Nicht gemacht (TODO n34-Heavy)**: Kratzer-/Ruß-Decals und gesprungene Scheibe (CC0-Texturen ambientCG/Poly Haven laden,
am Bild abstimmen – `OPTIK.scheibe` 45 % ist vorbereitet), Funken beim Schleifen an Gegnern (nur Stoß-Funken), Ton beim
Abfallen eines Teils ist der kleine Crash-Ton. Standard bleibt „aus“, bis abgenommen (dann `SCHADEN_STD = 'optik'`).
**Risiken**: Planung eines Treffers (Raster-Suche) bleibt am Stück (~2 ms Desktop); Teile-Bereiche sind Startwerte; Gegner
mit Dellen nah = LOD 0 (Dreiecke!); Wechsel der Fahrhilfe im Pause-Menü ändert die Kollisions-Härte erst im nächsten Rennen.

## Screenshots (vorbereitet, NICHT ausgeführt)
`python3 tests/gegner_shots.py quer|hoch [4711-2]` → `tests/shots/n34/`: Menü-Knopf + Blatt „🏁 Gegner“, Startaufstellung
(Verfolger + Hubschrauber), Zweikampf (Verfolger + Stoßstange, HUD-Platz), Schaden leicht/mittel/stark (Abnahme-Haken
`__game.treffer`), Zieltabelle, Replay; gibt JSON mit HUD-Text, Tabellen-Zeilen, Schaden-Zustand und JS-Fehlern aus.
Nur `py_compile` geprüft – Selektoren/Wartezeiten beim ersten Lauf anpassen.

## Mess-Gate (vorbereitet, NICHT ausgeführt)
`tests/perf_szenen_gegner.json` für `tests/perf_gate.py` im A/B-Modus:
`python3 tests/perf_gate.py --szenen tests/perf_szenen_gegner.json --stand n34_gegner --ab aus= --ab "g5=&gegner=5&staerke=ebenbuertig" --ab "g5phys=&gegner=5&staerke=ebenbuertig&schiene=0" --runden 3`
(Szenen: Pulk am Start, Feld nach 25 s, Cockpit, Replay; Kino/Standard/Einfach; Zusatz: Gegner in Physik, Stöße, Platz).
Gate: g5 p95 ≤ aus × 1,15. Schaden extra: `--ab "s=&schaden=optik"` (≤ 5 %). `main.js`: mit ausdrücklichem `?gegner=` gibt es
Gegner auch beim Autopilot-Start der Szenen.

## Geänderte Dateien der Basis (n33/main), alle ohne Wirkung bei Gegner Aus / Schaden aus
- `src/ai/autopilot.js`: Feld `avoid` (0) im Ziel-Versatz und in `lat`.
- `src/physics/car.js`: `onTreffer`-Haken in `_contacts` (nur Aufruf, keine Rechnung).
- `src/game/race.js`: `schadenFolgen`-Haken vor `car.step` (null).
- `src/game/store.js`: `modeKey(…, gegner)` (+ `@g`), `bestFor/loadGhost(…, gegner)`, `submit(meta.gegner)`.
- `src/main.js`, `src/ui/ui.js`, `css/style.css`: Einbindung (s. o.). **n33-Dateien** (pieces_hind, generatoren, test_hindernisse):
  nicht angefasst.
- `tests/node/run_all.mjs`: + test_autoauto, test_gegner, test_gegner_gfx, test_schaden, test_schaden_gfx.

## Tests auf rog17 (Abschluss)
- **n34 neu, alle grün:** test_autoauto 25, test_gegner 69 (inkl. „Gegner Aus“ bitgleich zur Basis), test_gegner_gfx 16,
  test_schaden 31, test_schaden_gfx 9 – alle in `run_all.mjs`.
- **Bestand grün** (einzeln, ≤ 110 s je Test): test_reset, test_extras, test_free_steer, test_tilt, test_cockpit,
  test_zielshow, test_kinoreplay, test_wetter, test_zeit, test_drift, test_mittel3, test_roehre_buckel, test_leicht_zeiten,
  test_sammlung, test_sprung, test_haftung, test_wiese, test_gkraft, test_quality_blur, test_autopilot, test_fahrgefuehl,
  test_alte_codes (249/249), test_loop_gate, test_trk_parser, test_trk_import, test_generator, test_strecken3d,
  test_leicht3d, test_verify_batch.
- **Nicht vollständig gelaufen:** test_assists und test_generator3d (> 110 s Zeitlimit der Leicht-Spur; test_assists bis dahin
  29 OK, 0 FAIL). `test_hindernisse` (n33) bricht auf Windows nach 43 OK an einem `c:`-Import ab – **auf der Basis 169a0f3
  identisch** (Windows-Pfad, nicht n34; am Mac prüfen). Die schon vor n34 auf rog17 roten Tests (test_lod, test_hdr,
  test_detail, test_gelaende, test_kulissen, test_kulissen2, test_stuntgroesse) nicht erneut gelaufen – n34 ändert dort nichts
  (Gegner/Schaden aus = bitgleich).

## Hinweise für den Heavy-Job
- **Service-Worker-Liste** (`sw.js`, `tools/update_sw.py`): neue Dateien `src/ai/gegner.js`, `src/game/rennfeld.js`,
  `src/physics/autoauto.js`, `src/physics/schaden.js`, `src/gfx/gegnervis.js`, `src/gfx/schadenvis.js` müssen in den
  Offline-Cache (Versionsnummer/Cache-Busting macht der Heavy-Job).
- `tests/out/n34/*.json` (Mess-Rohdaten) liegen nur auf rog17 (ignoriert); Tabellen oben sind daraus.
- README-Entwurf (zum Einfügen):
  > **KI-Gegner (n34):** Im Menü „🏁 Gegner“ 1, 3 oder 5 Gegner zuschalten (Stärke Locker/Ebenbürtig/Profi, Startplatz,
  > Namen-Schilder, Aufholhilfe). Gegner fahren mit derselben Physik, machen Fehler, überholen nicht in Loopings und
  > halten Abstand vor Stunts; Berührungen sind auf Leicht sanft, auf Original hart. Rennen mit Gegnern zählen in eine eigene
  > Bestzeiten-Liste. Link: `?gegner=3&staerke=profi`. **Schaden** (Optionen): Beulen, abfallende Teile, Rauch – auf
  > Original mit Totalschaden auch mit Fahrfolgen (`?schaden=optik|fahrt`). Technik: `GEGNER.md`.

## Nicht in diesem Vorbau
Browser-Abnahme, Screenshots/Collagen, Perf-Messung, Versionsnummer/SW-Cache, Bericht `GEGNER_BERICHT.md`, README-Abschnitt
(Entwurf: Port-Notiz `GEGNER.md` liegt bei), Asset-Download (Decals).
