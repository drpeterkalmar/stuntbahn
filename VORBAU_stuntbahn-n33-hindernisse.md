# Vorbau n33 – Original-Stunt-Hindernisse (Leicht-Spur, 09./10.10.2026)

Branch `vorbau/stuntbahn-n33-hindernisse` (von `origin/main` be11bcb). **main ist unberührt** – die Vorher-Messung des
Heavy-Jobs kann direkt auf main laufen. Alles ohne Browser gebaut und in Node geprüft. **Im Browser ist nichts abgenommen.**

## Kurz
- Drei neue Elemente: **Zickzack-Barriere** (`zigzag` 3 Felder / 5 Blöcke, kurz `zigzag2` 2 Felder / 3 Blöcke), **Röhre mit
  Mittelwand** (`tube_wall`, 360°-Rolle kopfüber über die Wand), **Spirale auf flachen Strecken** (Hochstraße: Spirale
  hinauf → Brücke → Spirale/Rampe/Klippensprung hinunter) und **Spiralen in 3D häufiger** (×1,5).
- **Generator-Version 2** mit Code-Zusatz **„h“** (`4711-2-h`, `4711-2-3dh`, `4711-2-gh`). Ohne „h“ baut alles wie bis
  n32 → **alte Codes behalten ihr Layout und ihre Bestzeiten** (nichts gelöscht, nur einmal ein Hinweis-Toast für
  bisherige Spieler). Zufall / Strecke des Tages / „Weiter“ erzeugen Version 2.
- **Regler:** `?hindernis2=0` = Generator wie vorher (alle Strecken Version 1), je Element `?zickzack=0`,
  `?roehrewand=0`, `?spirale2=0`. Alle werten nicht (A/B). Node: `STUNT_HINDERNIS2=0`, `STUNT_ZICKZACK=0`,
  `STUNT_ROEHREWAND=0`, `STUNT_SPIRALE2=0`. Standard: **alles an**.
- `npm run test:node`: alle 47 Tests grün (einzeln in Gruppen gelaufen, Leicht-Spur), neu `tests/node/test_hindernisse.mjs`.

## Etappe 1 – Zickzack-Barriere
**Fertig**
- `src/track/pieces_hind.js`: `ZIGZAG` = 5 Blöcke, Abstand 26 m, 3,2 m lang, 8,0 m tief in die 14,6 m breite Fahrbahn
  (über die Mitte hinaus, Gasse 6,6 m), 1,3 m hoch, Kappe; `ZIGZAG2` = 3 Blöcke, 24 m, 7,3 m tief (bis zur Mitte). Erster
  Block per `pc.m` rechts oder links (Generator würfelt). Blöcke `MAT.WALL`, kollidieren (Aufprall → Crash/Zurückspulen
  wie n21-Hindernisse). Gelb-schwarze Warnflächen auf Stirn- und Innenseite (`pb.markPoly` → `track.marks` →
  `gfx/jumpdeck.js`, gleiche Streifen-Textur wie Schanze/Buckel).
- Fahrlinie bleibt gerade; an jedem Block ist die befahrbare Breite (lo/hi) auf die freie Seite verengt → die
  Minimal-Krümmungs-Ideallinie fährt den Slalom von selbst (bis ±4,9 m Versatz), Tempo-Fenster aus deren Krümmung.
- **Tempo-Deckel 70 km/h** in der Zickzack-Zone (`L.wave = 5`, `PROF.vZig` in `ai/profile.js`, ab 8 m vor dem ersten
  Block). Ohne Deckel plante das Profil bis 155 km/h bis kurz vor den ersten Block und bremste erst dort – der
  Original-Bot schaffte 3/24, mit Deckel 24/24.
- `race.js`: Zickzack-Zone (`zigMask`, ab 30 m vor dem ersten bis 6 m hinter dem letzten Block): Leicht = Autopilot
  lenkt („Zickzack voraus – Autopilot lenkt“), Mittel = **Spurhilfe zur Ideallinie** (nicht zur Fahrbahnmitte – dort stehen
  Blöcke; „Zickzack – Spurhilfe“), kein Auto-Nitro. Mit 14 m Vorlauf stand der Mittel-Bot vor dem ersten Block noch auf
  der falschen Seite (1/16 ohne Crash), mit 30 m 11/16.
- Generatoren: flach Sanft höchstens eine `zigzag2` (Pflicht), Sportlich/Irre `zigzag` (Pflicht, Ersatz `zigzag2`, wenn
  3 Felder nicht frei); 3D und Gelände ebenso (3D ohne eigenen Anlauf). Entschärfen: Zickzack → Geraden.
- Gelände: `zigzag`/`zigzag2` stehen auf Sockel (RIGID/ON_BASE in `gelaende.js`, nur Version-2-Layouts betroffen).

**Geprüft (Node)**: `tools/hindernis_mess.mjs fest` – festes Tempo, Lenkung Autopilot (Abstand = Karosserie-Umriss ↔ Blockfläche):

| | Plan | 60–95 km/h | 100 km/h | 105/120 km/h | Autopilot |
|---|---|---|---|---|---|
| zigzag flach | 70 km/h | ok, ≥ 0,38 m | ok (0,41 m) | Aufprall | ok, 0,37 m |
| zigzag Ebene 1 | 70 km/h | ok, ≥ 0,39 m | Aufprall (streift) | Aufprall | ok, 0,38 m |
| zigzag2 flach / Ebene 1 | 70 km/h | ok, ≥ 0,48 m | ok | ok (0,75 m) | ok, 0,48 m |

**Im Browser abnehmen**: Optik der Blöcke (Höhe, Kappe, Streifen gut sichtbar? aus Cockpit/Stoßstange, hoch + quer);
Ideallinie (lineviz) zeigt den Slalom farbig; Leicht/Mittel/Original je einmal; HUD-Texte; Kino-Replay-Clip „🚧 Zickzack“
(Kameras low/drone/fan); Nacht/Regen (Blöcke ohne eigenes Licht).

**Annahmen/Risiken**: Blockform/Farbe nur am Bild abstimmbar (Startwerte `ZIGZAG.h`, Kappe, `MAT.WALL`). Deckel 70 km/h
ist ein Kompromiss (Strecke physikalisch bis ~95 km/h fahrbar, Mittel-/Original-Bots brauchen den Deckel).

## Etappe 2 – Spirale als Stunt
**Fertig**
- `generator.js` Version 2: Bauteil `sbridge` (5 Felder): Spirale hinauf (wenn die 2 Seitenfelder frei sind, sonst
  Rampe) → Brücke (Ebene 1, Fluss/Bogen wie bisher) → Spirale oder Rampe hinunter, mindestens eine Spirale; zu gut einem
  Drittel `sbridgeC` (6 Felder) mit **Klippensprung hinunter** (`cliff`, eine Ebene), wenn dahinter ein Feld frei ist.
  Sportlich/Irre: Pflicht statt der alten Brücke. Belegung (Seitenfelder) geprüft.
- `generator3d.js` Version 2: Spirale ×1,5 in den Ebenenwechsel-Gewichten (mit ×2 verdrängten die Spiralen die
  Geraden auf Ebene 0, auf denen die Stunts stehen).
- Kulissen-Spots (Zuschauer/Tribüne/Kamerakran) am unteren Ende jeder Spirale – nur Version 2 (`hindSpots` in
  `track/kulisse.js`, auch in `kulisse2.js`), alte Codes bitgleich.
- Häufigkeit (120 Seeds): flach Sportlich 54 Spiralen, Irre 66; 3D Sportlich 184 statt 139, Irre 287 statt 253;
  Klippen-Abfahrt 9 von 600 flachen Strecken (braucht 7 freie Geraden).

**Geprüft**: Prüffahrt aller 9 Strecken mit Spirale → Klippe ohne Entschärfen; `test_hindernisse` E (Aufbau
Spirale↑ → Brücke → ↓, Belegung), Lösbarkeit siehe unten.

**Im Browser abnehmen**: flache Strecke mit Spirale (z. B. `?seed=9&d=2&h=1`: Spirale hinauf → Brücke → Klippe),
Pfeiler/Geländer/Überhöhung, Bäume/Deko nicht auf der Spirale, Fluss unter der Brücke, Zuschauer am Spiralfuß.

**Nicht gemacht: Spirale auf Gelände-Strecken.** Die Spirale überquert sich selbst (oberes Ende 6 m über dem Anfang);
das Gelände-Höhenfeld folgt dort der Fahrbahn und bräuchte an derselben Stelle zwei Höhen, Pfeiler stünden auf dem
noch nicht gebauten Gelände (`buildGelTerrain` formt nach `pb.ground`). Ohne Sichtprüfung zu riskant. Vorschlag für
später: Spirale als Sockel-Gruppe mit Einschnitt/Tunnel unter der Überquerung (wie Gelände-Tunnel n22) – Browser nötig.

## Etappe 3 – Röhre mit Mittelwand
**Fertig**
- `pieces_hind.js` `tube_wall` (2 Felder wie die Röhre): Portal und Röhren-Querschnitt wie die normale Röhre, hinter
  dem Portal wird der Querschnitt über 8 m **kreisrund** (Boden ±3,5 m → 0, Radius 5,6 m = halbe Röhrenhöhe) – eine
  flache Decke hätte keinen Anpressdruck. **Rolle 56 m**: rechts die Wand hinauf, oben kopfüber über die Mitte, links
  hinunter (m = −1 gespiegelt), Drehrate an den Enden weich angelaufen (`tubeWallPhase`, sonst 32°-Knick am Eingang).
  **Mittelwand** bei f = T: Kreisabschnitt bis Oberkante 5,6 m (untere Hälfte), 0,8 m dick, kollidiert; Warnstreifen
  Vorderseite + Oberkante. Röhre als Band mit aufrechtem Querschnitt (`profile tube` mit `s.tb`), Linie ohne eigene
  Geometrie (`prof: 'none'`), als Röhre markiert (`L.tube`: Spurhilfe, Leicht-Autopilot, Kamera, Profil-Reserve).
- Tempo-Fenster aus dem Profil: oben ≥ 51 km/h (Anpressdruck ≥ PROF.nmin), Plan in der Rolle bis ~113 km/h.
- HUD: „Röhre voraus – Wand! – Überkopf – Autopilot lenkt“ (Leicht) bzw. „Röhre – Wand! – Überkopf – Spurhilfe“
  (Mittel), bis zur Wand; danach „Röhre – …“.
- Highlights: „🔄 Röhre über Kopf“ (nur wenn wirklich kopfüber, Kameras action/crane/rear), Gewicht wie Korkenzieher.
- Generatoren: flach Irre Pflicht, Sportlich Gewicht 2; 3D Irre ersetzt die Pflicht-Röhre; Gelände Irre Pflicht,
  Sportlich Gewicht 2; nie in Sanft. Entschärfen: Röhre mit Wand → Röhre (Buckel) → Geraden.

**Geprüft (Node)**: festes Tempo (`tools/hindernis_mess.mjs fest`, flach und Ebene 1 gleich):

| Einfahrt | oben | ohne Radkontakt in der Rolle | Lage (up.y min) | Dach über Wand-Oberkante | Ergebnis |
|---|---|---|---|---|---|
| 40 km/h | 36 km/h | 1,54 s | −1,00 | 1,57 m | fällt von der Decke → Crash (gewollt) |
| 50 km/h | 49 km/h | 0,39 s | −0,99 | 3,88 m | ok (kurz abgehoben) |
| 55–100 km/h | = Einfahrt | 0,00 s | −1,00 | 4,00–4,23 m | ok |
| 110/120 km/h | 108/110 km/h | 0,00 s | −1,00 | 4,25 m | ok |
| Autopilot | 100 km/h | 0,00 s | −1,00 | 4,23 m | ok |

Kamera-Vorprüfung in Node (`tools/hindernis_kamera.mjs`, echte `CameraRig`-Logik mit Verdeckungs-Strahlen, Leicht fährt
durch, flach + Ebene 1): Verfolger quer/hoch ≤ 3,5 m von der Röhrenachse (Radius 5,6 m), Cockpit ≤ 4,7 m, Stoßstange
≤ 5,4 m – **nie außerhalb**, Sicht aufs Auto **nie durch die Wand verdeckt**; Zickzack: nie durch einen Block verdeckt.

**Im Browser abnehmen**: Übergang Portal → Kreis (Naht/Lichtspalt am Portal? Portal-Fassade hat die Röhrenform, die Röhre
dort ebenfalls), Innenraum-Helligkeit (**„Licht in der Röhre“ nicht gebaut**, s. u.), Wand mit Streifen von weitem
sichtbar, Rolle aus Verfolger/Cockpit/Stoßstange hoch + quer (Übelkeit? Cockpit dreht voll mit), Nacht: Lichterketten
(`gfx/zeit.js` nimmt Röhren über `/tube/` – bei der Rolle laufen sie entlang der rollenden Linie als Spirale; ansehen),
Kino-Replay-Clip „Röhre über Kopf“, HUD-Texte.

**Annahmen/Risiken**: In der Rolle fährt das Auto auf Beton (Mantel `MAT.CONCRETE`, Haftung 1,05 statt Asphalt 1,25) –
so gemessen. Länge 56 m / Radius / Oberkante sind Startwerte (`TUBE_WALL`), physikalisch belegt, optisch offen.

## Etappe 4 – Kulissen, Highlights, Menü, Code
**Fertig**: Kulissen-Spots (s. o.), Highlights (`tubewall`, `zigzag`), Menü-Symbole 🚧/🔄 mit Namen, Code-Eingabe mit „h“
(`ui.js`, Eingabe-Hinweis), `?seed=…&h=1`, Prüf-Cache `VBUILD` + `HIND_TAG` (abgeschaltete Elemente getrennt), Store
`HIND_NOTE = 33` (Toast „🚧 Neue Hindernisse … neue Zufallsstrecken haben ein „h“ im Code, alte Codes und Bestzeiten
bleiben“ – nur für bisherige Spieler, einmal), A/B-Regler in `AB_PARAMS`.
**Im Browser abnehmen**: Toast einmal, Code-Dialog (`4711-2-gh` / `4711-2-g`), Menü-Zeile mit Symbolen, Strecke des
Tages hat jetzt den Code `…-2-gh`, Bestzeiten alter Codes noch da.

## Lösbarkeit (Prüffahrt mit Entschärfen, `node tools/hindernis_mess.mjs quote`, je 50 Seeds × Stufe, v1 = vorher)
| | Sanft v1 → v2 | Sportlich v1 → v2 | Irre v1 → v2 |
|---|---|---|---|
| flach | 100 → 100 % | 100 → 100 % | 100 → 100 % |
| 3D | 100 → 100 % | 100 → 100 % | 100 → 100 % (0 Entschärfungen) |
| Gelände | 100 → 98 % (1/50) | 100 → 100 % | 100 → 100 % |

Die eine Gelände-Strecke (`7268-1-gh`) stürzt an einer Kurve weit hinter der kurzen Zickzack ab (Stück 27 von 44, nicht
am neuen Element); im Spiel greift die Ersatz-Variante (`main.js` probiert bis Variante 3). Alle neuen Elemente
überstehen die Prüffahrt ohne Entschärfen (flach/3D/Gelände). `test_verify_batch` 30/30.

## Fahrer (90 Zufallsstrecken v2 mit neuen Elementen, `node tools/hindernis_mess.mjs fahrer --art=… --d=2,3 --n=30`)
Leicht je 1 Runde, Mittel-Handy-Bot und Original-Bot je 2 Seeds. „geschafft“ = Stück ohne Crash/Reset durchfahren.

| Fahrer | im Ziel | Zickzack | Zickzack kurz | Röhre mit Wand | Spirale | Röhre (Vergleich) | Looping (Vergleich) |
|---|---|---|---|---|---|---|---|
| Leicht Sauber | 90/90 | 100 % (24) | 100 % (54) | 100 % (27) | 100 % (65) | 100 % | 100 % |
| Leicht Brachial | 90/90 | 100 % | 100 % | 100 % | 100 % | 100 % | 100 % |
| Mittel-Handy | 180/180 | 78 % (47/60) | 92 % (111/121) | 78 % (55/71) | 68 % | 99 % | 73 % |
| Original | 180/180 | 92 % (48/52) | 86 % (106/124) | 69 % (49/71) | 84 % | 73 % | 93 % |

Leicht Brachial: 2 Crashs in 90 Runden, beide an normalen 3D-Kurven/Rampen (Drift), nicht an neuen Elementen.
Bot-Modell geändert (`tools/mittel_probe.mjs`): Der Mittel-Handy-Bot zielt **in der Zickzack-Zone** durch die Gassen
(Ideallinie) statt auf die Fahrbahnmitte (dort stehen die Blöcke) – sonst unverändert. `stunt_mess.mjs` zählt die
neuen Elemente.

## Leistung (Node, `tests/out/n33/dreiecke.log`)
Zickzack +720 Grafik-Dreiecke (Schikane +880), 300 Kollisions-Dreiecke (Schikane 600); kurz +432 / 196; Röhre mit Wand
3990 statt 3352 (Röhre) Grafik-, 2204 statt 1898 Kollisions-Dreiecke; je ein Batch mehr (Kappe/Wand). Mess-Gate n30 im
Browser offen.

## Bitgleichheit
- Version 1 flach: `test_alte_codes` 249/249; 3D und Gelände: Layout-Hashes gegen main n32 (`tests/node/data/
  layout_hashes_n32.json`, 120/120 je Art); Kulissen-Planung gegen main n32 (`deco_plan_n32.json`, 70/70);
  `test_gelaende` (Bau-Hash n22), `test_stuntgroesse` (n25), `test_roehre_buckel` (.TRK/glatt), `test_sammlung`,
  `test_trk_import`, Korpus – alle grün. Die .TRK-Slalom-Deko (`pieces_trk.js`) ist unangetastet.

## Dateien
Neu: `src/track/pieces_hind.js`, `tools/hindernis_mess.mjs`, `tools/hindernis_kamera.mjs`, `tests/node/test_hindernisse.mjs`,
`tests/node/data/layout_hashes_n32.json`, `tests/node/data/deco_plan_n32.json`, diese Datei.
Geändert: `src/track/defs.js` (HINDERNIS2, GEN_V, HIND_TAG), `build.js` (markPoly, obstacleInfo, `s.tb`, marks/obstacles),
`generator.js`, `generator3d.js`, `generatorG.js`, `gelaende.js` (RIGID), `kulisse.js`, `kulisse2.js`, `src/ai/profile.js`
(vZig, wave 5), `src/game/race.js`, `highlights.js`, `store.js`, `src/gfx/jumpdeck.js`, `src/main.js`, `src/ui/ui.js`,
`tools/mittel_probe.mjs`, `tools/stunt_mess.mjs`, `tests/node/run_all.mjs`.

## Offen für den Heavy-Job (Browser)
1. Vorher-Messung auf main, dann Branch zusammenführen.
2. Sichtprüfung je Element (Leicht/Mittel/Original, hoch + quer, Verfolger/Cockpit/Stoßstange), Screenshots mit Vision.
   A/B: `?hindernis2=0`. Teststrecken: `?seed=3194&d=3&h=1` (flach Irre: Spirale, kurze Zickzack, Röhre mit Wand),
   `?seed=9&d=2&h=1` (Zickzack, Spirale → Klippe), `?seed=3000&d=3&g=1&h=1` (Gelände: Röhre mit Wand, Zickzack),
   `?seed=3291&d=2&3d=1&h=1` (3D kurze Zickzack).
3. **Licht in der Röhre** (nicht gebaut): Tagsüber ist die Röhre innen so dunkel wie die normale Röhre. Idee: Leuchtbänder
   an der Decke links/rechts der Rolle (emissiv, ein Draw-Call), nur am Bild abstimmbar.
4. Warnstreifen (`jumpdeck.js`): Dreiecke in Node erzeugt; Polygon-Offset/Sichtbarkeit im Browser prüfen.
5. Mess-Gate n30 (p95), 0 Seitenfehler, Version/Cache-Busting/Service-Worker, Live-Check, `HINDERNISSE_BERICHT.md`,
   README, Status-Zeile in `~/.hermes/plans/stunts-remake.md`.

Rohdaten (lokal, nicht im Repo): `tests/out/n33/` (quote*.log, fahrer*.log, fest_*.log, kamera.log, dreiecke.log).
