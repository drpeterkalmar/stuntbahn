# Stuntbahn

**Stunt-Rennspiel im Browser** – Loopings, Schanzen, Steilkurven, Röhren und Brücken auf einem
30×30-Raster, wie bei den großen Stunt-Klassikern der frühen 90er. Realistische Grafik, Arcade-Physik,
spielbar am Handy (quer), mit Gamepad oder Tastatur. Als App installierbar (PWA), läuft offline.

▶ **Spielen:** https://drpeterkalmar.github.io/stuntbahn/

## Spielidee
- Jede Strecke ist ein Rundkurs: alle **Checkpoints** der Reihe nach, dann über die Ziellinie.
- Strecken entstehen aus **Code + Schwierigkeit** (z. B. `4711-2`): gleicher Code = gleiche Strecke,
  zum Teilen. **Strecke des Tages** = das heutige Datum als Code.
- Schwierigkeit **Sanft / Sportlich / Irre** steuert Länge, Kurvenradien, Stunt-Dichte und -Arten.
- Jede generierte Strecke fährt vorab ein **Autopilot probe** – wo er crasht, wird entschärft.
  Seine Rundenzeit steht als „Autopilot-Referenz“ im Menü.
- **Crash = kein Totalschaden** (Standard): das Auto steht sofort wieder auf der Fahrbahn vor dem Stunt,
  mit Schwung, **+5 s** auf die Rennzeit. Wer es wie früher mag: Optionen → **💥 Totalschaden** (Wrack).
- **Bestzeiten und Geisterautos** werden je Strecke, je Fahrhilfe *und* je Totalschaden-Einstellung getrennt gespeichert.
- **Replay** der letzten Fahrt mit Verfolger-, Hubschrauber-, Strecken- und Stoßstangenkamera.

## Strecken des Stunt-Klassikers laden (.TRK)
- Menü → **📂 Strecke laden (.TRK)** → Datei wählen (Handy) oder Dateien ins Fenster ziehen (Desktop).
  Geht mit einzelnen `.TRK`-Strecken, Replays (`.RPL`, enthalten die Strecke) und ganzen **ZIP-Archiven**.
- Woher? z. B. **zak.stunts.hu** → Downloads (Track-Pack, Wettbewerbs-Archiv) oder archive.org („stunts tracks“).
  Die Strecken bleiben **nur im eigenen Browser** (nichts wird hochgeladen, nichts davon liegt im Repo).
- Alle 151 Strecken- und 28 Szenerie-Elemente werden nachgebaut: Hochstraße, Rampen und Sprünge über
  Lücken, Korkenzieher (Rolle und Wendel), Röhre, Tunnel, Autobahn, Slalom, Steilkurven, Schikanen, Abzweige,
  Kreuzungen, Schotter und Eis, Hügel, Hänge und Wasser, Häuser, Windmühlen, Schiffe …
- Beim ersten Laden fährt der Autopilot die Strecke probe → Ideallinie, Tempo-Profil und alle drei Fahrhilfen
  funktionieren sofort; Bestzeiten und Geisterautos je Strecke und Fahrhilfe.
- Getestet an 3603 Archiv-Strecken: 99,5 % lesbar, 99,5 % davon Rundkurs; Autopilot auf „Leicht“ bei
  96,5 % einer Stichprobe von 200 im Ziel (Details: `NACHT2_BERICHT.md`).

## Fahrhilfen
| Stufe | Was hilft |
|---|---|
| 🟢 **Leicht** | Gas und Bremse automatisch, Lenkung wird stark zur Ideallinie gezogen, Stunts fährt das Auto selbst. Handy: linke/rechte Bildschirmhälfte halten (oder Neigen). |
| 🟡 **Mittel** | Bremsassistent, leichter Zug zur Linie (in Stunts stärker), Stabilitätshilfe, farbige Ideallinie (grün = Gas, gelb = vom Gas, rot = bremsen), Rückspul-Knopf. |
| 🔴 **Original** | Keine Hilfen – so tricky wie damals. |

Die Fahrhilfe ist jederzeit im Pause-Menü umschaltbar.

**Ideallinie** (Optionen/Pause, Leicht und Mittel): Aus / **Dezent** (Standard: schmaler, 28 % Deckkraft, weicher Rand,
blendet ab ~60 m vor/hinter dem Auto aus) / Kräftig (bisheriger Look). Im Rennen schaltet der Knopf oben rechts, `L` oder
Gamepad-Back zwischen Aus und der gewählten Stufe um. Nur Anzeige – die Lenkhilfe bleibt gleich.

**Crash** (Option „💥 Totalschaden“, gilt für alle Stufen):
- **Aus (Standard):** kurzes Aufblitzen → Fahrbahn-Reset vor das Element mit Profil-Tempo, **+5 s** (groß angezeigt,
  im HUD, Ergebnis und Replay). Die Uhr läuft durch. Am selben Element wiederholt gescheitert → dahinter gesetzt
  (Leicht beim 2., sonst beim 3. Crash; jeder Crash kostet +5 s). ⏪ Rückspulen spult nur das Auto zurück, nicht die Uhr.
- **An:** Wrack wie früher; Leicht/Mittel spulen danach 3 s zurück (samt Uhr), Original setzt vor das Element.

## Steuerung
- **Handy (quer halten):** Leicht – Bildschirmhälften halten; Mittel/Original – links ◀ ▶, rechts GAS und BREMSE
  (Bremse im Stand = rückwärts). Optional „Lenken durch Neigen“. Keine Wischgesten.
- **Tastatur:** Pfeile/WASD, Leertaste bremsen, `R` zurückspulen, `C` Kamera, `L` Ideallinie, `Esc` Pause.
- **Gamepad:** linker Stick lenken, RT/A Gas, LT/X Bremse, Y zurückspulen, LB Kamera, Back Ideallinie, Start Pause.

## Technik
- three.js r186 als ES-Module mit Import-Map, **kein Build-Schritt**; GitHub Pages; PWA mit Service-Worker
  (Cache-Busting über Inhalts-Hash, `tools/update_sw.py`).
- **Eigene Arcade-Physik** (feste 120 Hz, entkoppelt vom Rendering): Starrkörper mit 4 Raycast-Federbeinen,
  Reifenkräfte mit Haftungskreis, Abtrieb, Karosserie-Kontakte als Impulse, Crash-Erkennung.
  Kollision = exakt die gerenderte Streckengeometrie. Echte Loopings: das Auto fährt kopfüber (bis ~6 g).
- **Streckenbausteine** als Spline-Extrusion mit Querschnittsprofilen (Straße, Hochstraße, Steilkurve,
  Looping-Spur, Röhre, Schanze) auf dem 30×30-Raster.
- **Ideallinie** (Minimal-Krümmung innerhalb der Fahrbahn) + **Tempo-Profil** aus Querhaftung, Überhöhung,
  Looping-Anpressdruck und Sprung-Fenster; **Autopilot** = Stanley-Regler im Rahmen der Linie
  (funktioniert kopfüber). Fahrhilfen = Mischung Spieler/Autopilot.
- Grafik: HDRI-Himmel + bildbasiertes Licht, PBR-Texturen, Klarlack-Auto, **vorberechneter Sonnenschatten**
  für die statische Strecke (einmal gerenderte Tiefenkarte), Echtzeit-Schatten nur fürs Auto,
  automatische Qualitätsstufen nach Bildrate. Ton komplett vorgerendert (OfflineAudioContext).
- Debug-API `window.__game` (Headless-Tests).

## Entwicklung & Tests
```bash
npm run test:node                         # alle Node-Tests (Parser, Import, Physik, Generator, Fahrhilfen)
node tests/node/test_trk_parser.mjs       # .TRK-Parser + Elementtabelle (Byte-Layout, alle Codes)
node tests/node/test_trk_import.mjs       # jedes Element baubar, Wegverfolgung, Gelände, Beispielstrecke
node tests/node/test_trk_corpus.mjs 200   # nur lokal: Archiv-Strecken in trk_local/ (nicht im Repo)
python3 tests/test_trk_ui.py              # Import-Oberfläche: Datei-Auswahl, ZIP, Drag & Drop, Ziel, Löschen
node tests/node/test_loop_gate.mjs        # Physik-Gate: Ebene → Schanze → Steilkurve → Looping → Röhre
node tests/node/test_verify_batch.mjs 10  # Generator: 10 Seeds × 3 Stufen per Autopilot lösbar
node tests/node/test_assists.mjs          # Fahrhilfen mit simulierten Spielern
node tests/node/test_reset.mjs            # Crash in Looping/Sprung/Wand: Reset +5 s bzw. Wrack; nie Endlosschleife
python3 tests/smoke.py                    # Browser (Playwright, Pixel 7 quer), Screenshots nach tests/shots/
python3 tests/test_race.py                # Rennen, Bestzeit nach Reload, Geist, Replay
python3 tests/test_touch.py               # Touch-Steuerung, Knopfgrößen ≥ 48 px
python3 tests/test_reset_ui.py            # Totalschalter, „+5 s“, Strafen in Ergebnis/Replay, Bestzeit-Wertungen
```
Nützliche URL-Parameter: `?seed=4711&d=3`, `?demo`, `?gallery` (alle Bausteine), `?trk=demo-rundkurs`
(Beispielstrecke im .TRK-Format), `?speed=1` (Originaltempo statt 1,25×), `?q=0|1|2` (Grafikstufe), `?nosw`.

## Credits
- **Auto:** „Fictional supercar – V12 Goblin“ von **Olli Teittinen (ollitei)**, CC-BY 4.0 (Sketchfab), für das Spiel optimiert.
- **Himmel:** „Kloofendal 48d Partly Cloudy (Pure Sky)“ von Greg Zaal & Jarod Guest, Poly Haven, CC0.
- **Texturen:** Poly Haven (CC0) – Rob Tuytel, Charlotte Baglioni, Rico Cilliers.
- **Bibliothek:** three.js (MIT).
Details: [`assets/LICENSES.md`](assets/LICENSES.md). Code, Bausteine, Physik, Ton: eigene Arbeit.
Kein Code und keine Assets aus „Stunts“/„4D Sports Driving“ oder „Ultimate Stunts“ – nur die Spielidee.
