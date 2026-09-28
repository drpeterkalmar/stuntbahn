# Stuntbahn

**Stunt-Rennspiel im Browser** – Loopings, Schanzen, Steilkurven, Röhren und Brücken auf einem
30×30-Raster, wie bei den großen Stunt-Klassikern der frühen 90er. Realistische Grafik, Arcade-Physik,
spielbar am Handy (quer oder hochkant), mit Gamepad oder Tastatur. Als App installierbar (PWA), läuft offline.

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
- **Doppelt so schnell** (seit 27.09.2026): Vmax ~586 km/h, 0–200 in 3,8 s, Rennreifen und Abtrieb (Details:
  `TEMPO_BERICHT.md`). Bestzeiten der alten Physik bleiben gespeichert und stehen im Menü als „alte Physik“.
- **Cockpit-Kamera** (🎥 / `C` / Gamepad LB): Blick durch die Frontscheibe, analoger Tacho (bis 600 km/h), Drehzahlmesser
  (0–8 ×1000, rot ab 7000, Zeiger schwingt leicht nach), Schaltkulisse mit Knauf (R, 1–6), Lenkrad dreht mit.
  Die Kamerawahl bleibt gespeichert. Beim Wrack kurz Verfolger, dann wieder Cockpit (Details: `COCKPIT_BERICHT.md`).
- **Replay** der letzten Fahrt mit Verfolger-, Cockpit-, Hubschrauber-, Strecken- und Stoßstangenkamera.
- **Extras je Runde (seit 28.09.2026): 1× Hüpfer 🦘 und 1× Nitro 🔥**, an Start/Ziel wieder voll. Hüpfer: ~3,5 m hoch aus der
  Fahrt, Auto bleibt waagrecht, nur mit Bodenkontakt, in Looping/Röhre/Korkenzieher und an Schanzen gesperrt. Nitro: 3 s
  +70–80 % Beschleunigung (Vmax ~700 statt 586 km/h), dann 0,7 s weich zurück, mit Flammen, Tempo-Streifen, weiterem
  Sichtfeld und Fauchen. Auf Leicht nutzt der Autopilot sie auf Wunsch selbst („Extras automatisch“). Abschaltbar
  (Optionen → „Hüpfer & Nitro“); Bestzeiten mit und ohne Extras getrennt (Details: `EXTRAS_BERICHT.md`).

- **Bewegungsunschärfe (seit 28.09.2026):** Optionen → Grafik → „Bewegungsunschärfe“ Aus / **Leicht** (Standard) / Stark.
  Verwischt die Umgebung ab ~80 km/h (volle Stärke ab ~190 km/h, mit Nitro kräftiger), das Auto bleibt scharf. Kamera-
  Bewegungsunschärfe aus Tiefe + voriger/aktueller Kamera, Drehungen nur zu 45 % (Kurven bleiben lesbar). Nicht in Menü,
  Pause, Replay-Standbild. Grafik „Sparsam“: keine Unschärfe, nur Tempo-Streifen am Rand ab ~260 km/h. Kostet die
  Unschärfe spürbar Bildrate (> 8 % unter der Bildrate ohne, unter 58 fps), schaltet die Automatik sie für die Sitzung ab.
  Dazu sehr dezentes Kameraschütteln auf Bodenwellen (Verfolger). Details: `OPTIK_BERICHT.md`.

- **Detailliertere Umgebung (seit 28.09.2026)**, auf generierten und importierten Strecken automatisch: Randstreifen und
  Kiesbetten an Kurven-Außenseiten, Reifenabrieb auf der Ideallinie, Reifenstapel, Leitplanken mit (fiktiver) Bandenwerbung,
  Tribünen am Start, Zuschauer mit Zaun an scharfen Kurven, Streckenposten, Bremstafeln 150/100/50, Flutlichtmasten,
  Gras/Blumen/Büsche nahe der Strecke (blenden ab ~40–55 m aus, wiegen sich im Wind), Laubbäume, Felsen, Felder mit Hecken
  und Bauernhöfe in der Ferne, Wald am Bergkranz, wandernde Wolkenschatten, Wasser mit Wellen. Keine Kollision, immer mit
  Abstand zu jeder Fahrbahn (auch Hochstraßen/Rampen), nie im Wasser. Dosiert nach Grafikstufe; ruckelt es, blendet die
  Automatik (nach der Unschärfe) zuerst Gras/Büsche/Wolkenschatten aus. `?deko=0` / `?wolken=0` zum Vergleich.

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
| 🟢 **Leicht** | Gas automatisch (Bremse des Spielers geht vor). Ohne Lenken fährt das Auto allein die Ideallinie; deutlicher Lenkeinschlag (kurz gehalten) gibt dem Spieler Vorrang – auch quer durchs Gelände, Loslassen führt weich zurück. Loopings, Röhren, Korkenzieher und Sprünge lenkt das Auto selbst (mit Ansage im HUD). Handy: linke/rechte Bildschirmhälfte halten (oder Neigen). |
| 🟡 **Mittel** | Bremsassistent, leichter Zug zur Linie (in Stunts stärker), Stabilitätshilfe, farbige Ideallinie (grün = Gas, gelb = vom Gas, rot = bremsen), Rückspul-Knopf. |
| 🔴 **Original** | Keine Hilfen – so tricky wie damals. |

Die Fahrhilfe ist jederzeit im Pause-Menü umschaltbar.

**Ideallinie** (Optionen/Pause, Leicht und Mittel): Aus / **Dezent** (Standard: schmaler, 28 % Deckkraft, weicher Rand,
blendet ab ~60 m vor/hinter dem Auto aus) / Kräftig (bisheriger Look). Im Rennen schaltet der Knopf oben rechts, `L` oder
Gamepad-Back zwischen Aus und der gewählten Stufe um. Nur Anzeige – die Lenkhilfe bleibt gleich. Die Linie ist die
Minimal-Krümmungs-Linie (exakt gelöst): außen anfahren, am Scheitel innen bis an den Sicherheitsabstand, außen raus;
Keile am Innenrand markieren die Scheitelpunkte. Loopings, Röhren, Korkenzieher, Sprünge und Steilkurven bleiben auf der
Bausteinspur.

**Abkürzen** lohnt nicht (alle Stufen): Wer neben der Fahrbahn mehr Strecke gutmacht, als er fährt, wird an die Stelle
zurückgesetzt, an der er die Fahrbahn verlassen hat (Uhr läuft weiter). Ab 18 m Abstand erscheint „Zurück zur Strecke ↺“.

**Crash** (Option „💥 Totalschaden“, gilt für alle Stufen):
- **Aus (Standard):** kurzes Aufblitzen → Fahrbahn-Reset vor das Element mit Profil-Tempo, **+5 s** (groß angezeigt,
  im HUD, Ergebnis und Replay). Die Uhr läuft durch. Am selben Element wiederholt gescheitert → dahinter gesetzt
  (Leicht beim 2., sonst beim 3. Crash; jeder Crash kostet +5 s). ⏪ Rückspulen spult nur das Auto zurück, nicht die Uhr.
- **An:** Wrack wie früher; Leicht/Mittel spulen danach 3 s zurück (samt Uhr), Original setzt vor das Element.

## Steuerung
- **Handy (quer oder hochkant):** Leicht – Bildschirmhälften halten; Mittel/Original – links ◀ ▶, rechts GAS und BREMSE
  (Bremse im Stand = rückwärts; hochkant alle vier Tasten unten in einer Reihe). Runde Knöpfe darüber: links 🦘 Hüpfer,
  rechts 🔥 Nitro. Optional „Lenken durch Neigen“
  (hochkant: seitlich kippen oder wie ein Lenkrad drehen). Keine Wischgesten. Drehen im Rennen → kurze Pause mit „▶ Weiter“.
- **Tastatur:** Pfeile/WASD (bremsen ↓/S), **Leertaste Hüpfer**, **Shift oder `N` Nitro**, `R` zurückspulen, `C` Kamera,
  `L` Ideallinie, `Esc` Pause. (Bis 28.09.2026 bremste die Leertaste.)
- **Gamepad:** linker Stick lenken, RT/A Gas, LT/X Bremse, **B Hüpfer, RB Nitro**, Y zurückspulen, LB Kamera, Back Ideallinie, Start Pause.

## Technik
- three.js r186 als ES-Module mit Import-Map, **kein Build-Schritt**; GitHub Pages; PWA mit Service-Worker
  (Cache-Busting über Inhalts-Hash, `tools/update_sw.py`).
- **Eigene Arcade-Physik** (feste 120 Hz, entkoppelt vom Rendering): Starrkörper mit 4 Raycast-Federbeinen,
  Reifenkräfte mit Haftungskreis, Abtrieb, Karosserie-Kontakte als Impulse, Crash-Erkennung.
  Kollision = exakt die gerenderte Streckengeometrie. Echte Loopings: das Auto fährt kopfüber (bis ~6 g).
  **Sprünge wie im Original:** im Flug wirkt nur 70 % der Schwerkraft, 28°-Schanze → ~2× so hoch, ~+65 % Flugzeit
  (Details: `SPRUNG_BERICHT.md`).
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
node tests/node/test_free_steer.mjs       # Leicht: Spieler-Vorrang, weiche Rückführung, Abkürz-Regel, Stunt-Ansage
node tools/linie_analyse.mjs --laps       # Ideallinie: Scheitel-Nutzung, Löser-Zeit, Autopilot-Runden auf allen Stufen
python3 tests/linie_shots.py              # Fotos: Linie mit Scheitel-Keilen, HUD-Ansagen (tests/shots/linie/)
python3 tests/smoke.py                    # Browser (Playwright, Pixel 7 quer), Screenshots nach tests/shots/
python3 tests/test_race.py                # Rennen, Bestzeit nach Reload, Geist, Replay
python3 tests/test_touch.py               # Touch-Steuerung quer + hochkant, Knopfgrößen ≥ 48 px, Layout
python3 tests/test_hochformat.py          # Drehen im Rennen (quer→hoch→quer), keine hängenden Finger, Neigen-Achse, Platz für 2 Knöpfe
python3 tests/hochformat_shots.py         # Fotos + Layout-Prüfung aller Bildschirme (pixel7 iphone14 klein | …q = quer)
python3 tests/hochformat_cam.py 4711      # Verfolger hoch vs. quer: Auto-Lage, Horizont, Strecke voraus (m)
node tests/node/test_tilt.mjs             # Neigen: richtige Achse je Bildschirm-Ausrichtung
python3 tests/test_reset_ui.py            # Totalschalter, „+5 s“, Strafen in Ergebnis/Replay, Bestzeit-Wertungen
node tests/node/test_cockpit.mjs          # Instrumente: Skalen, Vmax ≤ Tacho, Zeiger-Dynamik, Kulisse, Replay-Gang
python3 tests/test_cockpit_ui.py          # Cockpit: Kamera-Knopf, gespeichert, Wrack → Verfolger, Replay, 0 Fehler
python3 tests/cockpit_shots.py quer       # Cockpit-Fotos + Zeigerprüfung (quer|hoch|desktop|tablet) nach tests/shots/cockpit/
node tools/jump_measure.mjs               # Sprung-Messung: Scheitel, Airtime, Weite (--air 1 --lip 15 = alt)
node tools/jump_easy_batch.mjs 10         # Generator-Strecken auf „Leicht“: im Ziel ohne Crash, Flugzeiten
python3 tests/jump_shots.py               # Fotos am Sprung-Scheitel (neu gegen alt) nach tests/shots/sprung/
node tools/tempo_measure.mjs --laps      # Tempo: Vmax, 0–200/0–400, Bremswege alt/neu, Autopilot-Runden aller Stufen
python3 tests/tempo_shots.py              # Fotos bei Vollgas (Verfolger, Cockpit) + HUD/Tacho/Kamera-Prüfung
node tests/node/test_extras.mjs           # Extras: Ladungen, Auffüllen, Sperren, Physik, Replay/Geist, Leicht-Automatik 30 Strecken
node tools/extras_measure.mjs             # Hüpfer (Scheitel/Flugzeit/Neigung) + Nitro (Beschleunigung, Vmax) auf der Ebene
node tools/extras_batch.mjs 40            # Leicht ohne/mit „Extras automatisch“: im Ziel, Crashs, Rundenzeit
node tests/node/test_trk_corpus.mjs 200 --assist=easy --extras   # Korpus mit „Extras automatisch“
python3 tests/test_extras_ui.py           # Knöpfe quer/hoch/Desktop, Touch/Tastatur, Cockpit, Replay-Flammen, Option aus
python3 tests/extras_shots.py             # Fotos: Knöpfe voll/leer, Nitro-Flammen, Hüpfer von der Seite
node tests/node/test_quality_blur.mjs     # Automatik: Unschärfe aus, sobald sie Bildrate kostet; dann „Deko sparsam“
node tests/node/test_deco.mjs 10          # Deko: Abstand zu jeder Fahrbahn, kein Wasser, Mengen (Generator + .TRK + Korpus)
python3 tests/optik_detail.py             # Detail-Fotos (Streckenrand, Luftbild), Draw-Calls/Dreiecke
python3 tests/perf_gross.py [Wurzel]      # große .TRK (LONG_GO2, nur lokal): Draw-Calls < 200, Dreiecke, Bauzeit
python3 tests/load_mb.py [Wurzel]         # Erstladung in MB
python3 tests/test_blur.py                # Unschärfe: an bei Tempo, aus in Menü/Pause/Replay-Standbild/Stufe 0, Aus/Leicht/Stark, Nitro
python3 tests/perf_optik.py [Wurzel]      # Frame-Zeit/Draw-Calls/Dreiecke je Stufe, Unschärfe Aus/Leicht/Stark (WEBGL=swiftshader als Näherung)
python3 tests/optik_shots.py . nachher    # Vorher/Nachher-Fotos: quer/hoch/Desktop × 3 Strecken × Start/Gerade/Kurve/Landschaft
```
Nützliche URL-Parameter: `?seed=4711&d=3`, `?demo`, `?gallery` (alle Bausteine), `?trk=demo-rundkurs`
(Beispielstrecke im .TRK-Format), `?speed=1` (Originaltempo statt 1,25×), `?q=0|1|2` (Grafikstufe), `?nosw`,
`?air=1` (volle Schwerkraft im Flug, Standard 0.7), `?lip=15` (alte Schanze; mit `?air=1` exakt der alte Sprung).
`?blur=off|light|strong` (Bewegungsunschärfe übersteuern).
`?auto=alt` (alte, langsamere Abstimmung bis 27.09.2026 zum Vergleich; wertet in der alten Bestzeiten-Liste).
`?welt=1` (alter, kleiner Weltmaßstab bis 27.09.2026 zum A/B-Vergleich, Standard 2 = Felder 40 statt 20 m;
erlaubt 1 … 2,5; wertet in der Bestzeiten-Liste der jeweiligen Welt). In Node: `STUNT_WELT=1 node …`.

## Credits
- **Auto:** „Fictional supercar – V12 Goblin“ von **Olli Teittinen (ollitei)**, CC-BY 4.0 (Sketchfab), für das Spiel optimiert.
- **Himmel:** „Kloofendal 48d Partly Cloudy (Pure Sky)“ von Greg Zaal & Jarod Guest, Poly Haven, CC0.
- **Texturen:** Poly Haven (CC0) – Rob Tuytel, Charlotte Baglioni, Rico Cilliers.
- **Umgebung:** Poly Haven (CC0) – Pflanzen, Felsen, Kies von Rico Cilliers, Rob Tuytel, James Ray Cock, Jenelle van Heerden, Kless Gyzen, Dimitrios Savva (Details in `assets/LICENSES.md`).
- **Bibliothek:** three.js (MIT).
Details: [`assets/LICENSES.md`](assets/LICENSES.md). Code, Bausteine, Physik, Ton: eigene Arbeit.
Kein Code und keine Assets aus „Stunts“/„4D Sports Driving“ oder „Ultimate Stunts“ – nur die Spielidee.
