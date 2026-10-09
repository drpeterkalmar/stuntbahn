# Vorbau n32 – Wetter + Kulissen/Zuschauer (Leicht-Spur, 08.10.2026)

Branch `vorbau/stuntbahn-n32-wetter-kulissen` (3 Commits auf `origin/main` 0091793). **Nichts davon ist im Browser gesehen
worden.** Es gab keinen Browser, keinen Server, keinen Bundler. Geprüft wurde nur mit Node-Tests (three.js aus `lib/` und
Attrappen). `main` ist unverändert.

## Kurz für den Heavy-Job
1. **Vorher-Messung auf `main`** (0091793) machen, bevor du diesen Branch zusammenführst.
2. Branch zusammenführen. Danach `npm run test:node` laufen lassen: Im Vorbau waren alle 44 Tests grün (43 + Korpus) (in Teilen gelaufen,
   jeder Aufruf unter 2 min).
3. Abnahme im Browser, in dieser Reihenfolge: Seitenfehler → Wetter (Regen, Schnee, Klar = wie vorher) → 3D-Zuschauer →
   Tribünen/Event-Gelände → Start/Ziel → Perf-Gate → Collagen. Die Einzelpunkte stehen unten.
4. **Standard ist AN.** Das Wetter steht auf „Passend“: Meist ist es klar, manchmal regnet oder schneit es. Die neuen
   Kulissen sind ebenfalls an. Rückweg für A/B: **`?wetter=klar`** = Aussehen genau wie bis n31. **`?kulisse=alt`** =
   Kulissen-Planung exakt wie bis n31; das ist gegen Prüfsummen von main belegt. Wenn etwas im Bild nicht taugt, stell
   den Standard auf aus. Eine Stelle reicht dafür: `KULISSE2_URL` in `src/track/kulisse2.js` bzw. der Standard
   `wetter: 'auto'` in `src/game/store.js`.

## Etappe 1 – Wetter (nur Optik)
**Fertig.** Regler sind `?wetter=klar|regen|schnee|auto` und die Einstellung `store.settings.wetter` (Standard `'auto'`).
- `src/track/wetter.js` (rein rechnend):
  - Auswahl in dieser Reihenfolge: URL, dann Einstellung, dann passend.
  - „Passend“ ist deterministisch aus Seed (bzw. Schlüssel bei .TRK) und Thema.
  - Chancen je Thema (`WETTER_CHANCE`): Land 18 % Regen, Stadt 20 %, Herbst 22 % Regen und 7 % Schnee, Alpen je 12 %,
    Küste 15 % Regen, Wüste 5 % Regen, Winter 60 % Schnee.
  - Schnee gibt es bei „Passend“ nie in Wüste, Küste, Land oder Stadt. Eine feste Wahl gilt überall, auch Schnee in der Wüste.
  - Alle Aussehens-Werte stehen in `WETTER_LOOK`, die Teilchen in `WETTER_AIR`, die Mengen je Grafikstufe in `WETTER_TEILCHEN`.
- **Klar** = das Thema unverändert, auch der leichte Schneefall im Winter-Thema bleibt. Alle Shader-Zweige hängen an
  Uniforms, die 0 sind.
- `src/gfx/wetter.js` legt das Wetter über die gemerkten Werte des Themas (`ThemeManager.base`). Ein Wechsel braucht keinen
  Neubau der Welt; „Klar“ stellt alles **exakt** zurück (Test).
  - Licht: Sonne ×0,32 (Regen) bzw. ×0,45 (Schnee), kühler; Umgebungslicht ×0,78 bzw. ×0,92.
  - Nebel ×0,5 bzw. ×0,42 und in der Dunstfarbe.
  - Himmel abgedunkelt und entsättigt (neues Uniform `wSky` in `env.js makeSky`), Horizont zum Dunst, Wolkendecke 0,86 bzw. 0,8.
    Land und Winter haben ohne Wetter keine Zusatzwolken; bei Regen/Schnee bekommen sie eine Decke.
  - Kino-Look: eigene Farbkorrektur `wetter_regen` / `wetter_schnee`, dichtere Luftperspektive.
- **Nasse Fahrbahn** (`patchRoad`): dunkler und glatter. Pfützen per Rauschen, bevorzugt in den Spurrinnen; dort ist die
  Normale geglättet, damit sich Himmel und Sonne über die Umgebungskarte spiegeln. Pfützen gibt es erst ab Standard.
  Das Gelände wird nass dunkler.
- **Schnee:**
  - Schneedecke auf flachem Gelände (Hänge ab ~40° bleiben frei) und auf Tannen (`tTreeSnow`).
  - Dächer, Tribünen, Hütten und Höfe bekommen Schnee über `patchSnowCover` am Paint-Material und an den Hochhäusern.
  - Die Fahrbahn bleibt dunkel und befahrbar, mit Matsch und Schneewall am Rand.
  - Helle Reifenspuren neben der Fahrbahn (fx SkidMarks: negative Stärke = Schnee-Spur).
  - Auspuffdampf.
- **Regenstreifen:** neue Teilchen-Art 4 in `AirMotes` (`deko.js`). Jeder Streifen ist ein Strich von der Lage jetzt zur
  Lage vor 0,045 s, relativ zur Kamera-Bewegung (`uCamVel`, main.js aus dem Kamera-Weg, bei Schnitten 0). Bei Fahrt
  werden die Streifen also schräg und lang.
  - Mengen Regen: Einfach 308, Standard 840, Kino 1400. Schnee: 330 / 900 / 1500.
  - Bei „Deko sparsam“ halbiert statt aus. `AIR_MAX` ist von 1100 auf 1600 gestiegen. Die ersten 1100 Zufallswerte sind
    gleich, also bleibt die Luft der Themen bei Klar identisch.
- **Gischt** hinter den Hinterrädern ab 60 km/h, auch im Replay. Dazu **Spritzer an Kerbs** (`MAT.KERB`). Beides ab
  Standard, über die vorhandenen Partikel von fx: kein neuer Draw-Call.
- **Scheibe:** `src/gfx/scheibe.js` zeichnet Tropfen und Schlieren in einem Vollbild-Durchgang.
  - Nur bei Regen, nur in der Cockpit-Kamera (vor dem Cockpit-Overlay) und in der Stoßstangen-Kamera (große Linsentropfen).
  - Im Tunnel blendet es aus (`air.covered`).
- **Regengeräusch:** `rainLoop()` in `sound.js` ist synthetisch: band-begrenztes Rauschen plus Tropfen, nahtlos.
  `MIX.rain` = 0,16, im Cockpit ×1,3. Läuft nur, wenn der Ton läuft (Rennen).
- **Menü:** Knopf „🌦️ Wetter“ in der Zeile neben „Landschaft“, mit Blatt Passend/Klar/Regen/Schnee. In der Info-Zeile
  steht „· 🌧️ Regen“ bzw. „· 🌨️ Schnee“, aber nur wenn es nicht klar ist. Die Wahl wird gespeichert und gilt schon beim
  Start (`loadTrack` → `wendeWetter`).
- **Nur Kosmetik, belegt:**
  - Der Bau hängt nicht am Wetter (Hashes gleich mit jedem `?wetter=`).
  - `?wetter=` ist kein A/B-Zusatz (wertet); im Bestzeit-Schlüssel steht kein Wetter.
  - `node tools/kulissen_bitgleich.mjs tests/out/n32/head` → **47/47 bitgleich** gegen eine git-archive-Kopie von main.
    Sie liegt lokal und ist gitignored; neu anlegen mit `git archive 0091793 src | tar -x -C tests/out/n32/head`.
  - Physik-Tests grün.

**Geprüft:** `tests/node/test_wetter.mjs` (199 Prüfungen): Auswahl/Häufigkeiten, Speicher, Bau byte-gleich, Werte im
Rahmen, Rückkehr auf Klar exakt, Teilchen-Mengen, Shader-Anker in three r186, Schnee-Patch, Regen-Loop (Naht, Pegel).

**Im Browser abnehmen:**
1. `?wetter=klar` gegen main: Das Bild muss gleich sein (Bildvergleich). Bitte in allen 7 Themen prüfen, auch Winter.
2. Bei `?wetter=regen` auf drei Dinge achten:
   - Der Shader übersetzt (Fahrbahn: `ROAD_WET_GLSL` steht in `patchRoad` hinter dem Markierungsblock).
   - Wirken die Pfützen und spiegeln sie? Schlieren und Tropfen in der Cockpit- und Stoßstangen-Kamera, hochkant und quer.
   - Wie hören sich Gischt und Regen an?
3. Bei `?wetter=schnee` prüfen:
   - Wo liegt die Schneedecke, auch im Winter-Thema?
   - Werden Dächer und Tribünen weiß? Rand-Matsch, Dampf, Spuren im Schnee.
4. Den Menüknopf hochkant prüfen: Die Zeile hat jetzt **drei** Knöpfe („📂 Strecke laden (.TRK)“ ist lang) und darf nicht
   umbrechen. Dazu `test_hochformat` und Menü quer.
5. Perf-Gate mit Regen auf Standard und Kino. Es zählen die Regenstreifen (Überzeichnung) und der Scheiben-Durchgang;
   der Autopilot darf nicht dauerhaft eine Stufe tiefer gehen.

**Annahmen und Risiken (Startwerte, nur am Bild abstimmbar):**
- Alle Zahlen in `WETTER_LOOK`, `WETTER_GRADES`, `ROAD_WET_GLSL` (Abdunklung 0,4, Rauheit −0,42/−0,6, Pfützen-Schwelle
  0,66), `SCHEIBE`, Regenstreifen-Breite 0,012 m und Alpha 0,38.
- Die „Spiegelung von Lichtern“ läuft nur über die Umgebungskarte und das Sonnen-Glanzlicht. Es gibt keine echte
  Bildschirm-Spiegelung: Die wäre zu teuer am Handy.
- Die Shader-Kommentare enthalten Umlaute und Gedankenstriche, wie im bestehenden Code (dort funktioniert es).
- Die Oktaeder-Impostor-Bäume (n30) bekommen bei Schnee **keinen** Schnee. Sie haben ein eigenes Material; das ist noch zu prüfen.
- `?deko=0` zeigt Wetter ohne Teilchen (dort gibt es keine `AirMotes`).

**Nicht gemacht:**
- Atemdampf der Zuschauer bei Schnee: Es gibt nur den Auspuffdampf.
- Eigene Wolkenschicht-Textur: Es wird die vorhandene Wolkenschicht mit mehr Bedeckung genutzt.
- Scheibenwischer.

## Etappe 2 – Mehr und schönere Kulissen und Zuschauer
**Fertig (Planung + Zeichnen).** Regler: `?kulisse=alt` (Standard: neu an).

**Planung `src/track/kulisse2.js`** (rein rechnend, eigener Zufall). `planDeco` ruft sie nach `planKulisse` und vor der
Vegetation auf; Bäume und Büsche weichen also aus. Alles bis n31 Geplante bleibt Stück für Stück gleich (Test). Geplant wird:
- **3D-Zuschauer** (`plan.fans`): je Gruppen-Karte 9 Einzelne (Einfach 3). Haltung (stehen, Arme hoch, Handy/klatschen,
  Fahne, sitzen), Größe 0,9–1,1, Farbe, Phase, Kamerablitz bei ~25 % an Stunts.
  - Mehr Zuschauer an Stunts: Reihen bei hw + 13,4 m.
  - Sitzende beim Picknick; in der Stadt Leute auf Dachterrassen (die 6 nächsten Wohnblöcke).
  - Obergrenze 160 / 480 / 900 je Stufe.
- **Fangzäune** 3,8 m (`plan.catchFences`) zwischen Fahrbahn und Stunt-Zuschauern bzw. Stunt-Tribünen. Belegt: nie hinter
  den Zuschauern.
- **Bandenreihen** (`plan.banden`, hw + 5,4 m) an Stunts (±40 m) und an Start/Ziel (−70 … +50 m).
- **Start/Ziel:**
  - Startaufstellung (6 Winkel auf der Fahrbahn hinter der Startlinie, versetzt).
  - Startampel am Portal bzw. am Mast mit Ausleger.
  - Boxenmauer gegenüber der Haupttribüne, Rennleitungsturm (hw + 26 m), Großbildleinwand (hw + 34 m).
  - Konfetti-Ort.
- **Event-Gelände** (2 je Strecke, Einfach 1): bei Start und erstem Stunt, 55–130 m neben der Strecke, flach.
  - Zelte, Foodtrucks, Sonnenschirme mit Bierbänken, Parkplatz und ein Erdweg zur Zuschauerlinie.
  - Sonderbau je Thema: Land/Herbst Riesenrad oder Hüpfburg, Küste Strandbar, Alpen/Winter Après-Ski-Hütte.
- **Picknick** an ansteigenden Hängen mit Blick auf die Strecke: Decke, Klappstühle, Kühlbox, Sitzende, manchmal ein
  geparktes Auto.
- **Pyro-Abschussrohre** an Stunts.
- **Tribünen-Bauform** je Thema (`STAND_FORMS`): 0 klassisch, 1 Stahl mit Fachwerk-Dach, 2 offene Alu-Tribüne.
- Regeln wie n20: MIN_CLEAR je neuer Art (`MIN_CLEAR2`), nie in Sprunglücke, Schlucht oder Wasser, nah nur auf
  Fahrbahnhöhe (dieselbe Regel, die `planDeco` am Ende anwendet, hier vorab).

**Zeichnen `src/gfx/kulisse2.js`** (aus `buildDeco`):
- **3D-Zuschauer** als prozedurale Low-Poly-Figur: 130 Dreiecke, 260 Ecken, eigene Arbeit, 0 KB.
  - Ein instanziertes Mesh. Haltung, Jubel (Arme hoch, Hüpfen in Reichweite von `uCheer`), Fahne, Sitzen und Kamerablitz
    rechnet der Vertex-Shader.
  - Blob-Schatten als 1 Draw-Call.
  - LOD: 3D bis 58–74 m (Kino) bzw. 36–48 m (Standard). Die Gruppen-Karten blenden in der Nähe aus (`crowdNear`, nur
    Atlas-Zeilen 2/3); die Tribünen-Streifen bleiben Karten.
  - **Einfach: nur Karten wie bis n31.**
- **Tribünen-Bauformen 1/2:** Sitzreihen, Treppen in drei Gängen mit Zwischenstufen, Geländer vorn/seitlich/hinten,
  Unterbau (Stützen, Längsträger). Form 1 hat ein auskragendes Dach (0,45 m stark) mit Fachwerkträgern und Blende.
  Form 0 bleibt die bisherige Geometrie.
- **Ein Mesh „kulisse2-bauten“** (Paint-Material, also auch Schnee) für alles Gebaute: Banden-Rahmen, Boxenmauer (Beton
  mit roten/weißen Feldern), Fangzaun-Pfosten, Turm, Leinwand-Gestell, Ampelmast, Zelte, Foodtrucks, Schirme, Autos,
  Riesenrad, Hüpfburg, Strandbar, Hütte, Picknick, Pyro.
- Dazu Fangzaun-Netz, **Banden-Werbung** mit dem **Werbe-Atlas jetzt 2048 × 1024** (vorher 1024 × 512; bei `?kulisse=alt`
  wie bisher), Startaufstellung, Ampel-Lichter und Leinwand-Bild.
- **Startampel:** `kulisse2Uniforms.uAmpel`. main.js setzt sie über `ampelAus()`: 1 bis 5 rote Lichter im Countdown,
  dann 1,5 s grün.
- **Pyro an Stunts:** `stuntPyro()` in main.js. Beim Einsetzen des Jubels feuern die 6 nächsten Rohre (bis 140 m) 0,8 s
  lang Funkenfontänen oder roten/weißen Rauch, über die vorhandenen fx-Partikel. Nur ab Standard.
- Die Zielbogen-Kamera (`cinecam.js`) meidet jetzt auch Turm, Leinwand, Riesenrad, Zelte usw.
- Draw-Calls: höchstens **+9** (Test), dazu höchstens 2 weitere für zusätzliche Tribünen-Formen.

**Geprüft:**
- `test_kulissen2.mjs`: Mit 3 Seeds 175 819 Prüfungen, in der Suite mit 2 Seeds.
  - `?kulisse=alt` liefert **70/70 Planungen exakt wie n31**. Die Prüfsummen hat `tools/kulisse_plan_hash.mjs` auf der
    main-Kopie erzeugt: `tests/node/data/deco_plan_n31.json`.
  - Alt-Objekte bleiben unverändert, Abstände/Wasser/Lücken/Hang, Zaun vor den Zuschauern, Startaufstellung,
    Event-Gelände, Picknick, Determinismus.
- `test_kulissen2_gfx.mjs` (891 Prüfungen): Bau für 4 Strecken × 4 Themen × 3 Stufen ohne Fehler, Draw-Calls ≤ 9,
  Dreiecke, Shader-Einbau, `?kulisse=alt` baut nichts.
- `test_kulissen 4` (1 089 971) und `test_deco 10` (731 885) laufen mit den neuen Arten weiter grün.

**Im Browser abnehmen** (mit Vision, hoch und quer, je Thema):
1. Seitenfehler und Shader-Übersetzung der Figuren (`fanMaterial`) und der Ampel (ShaderMaterial mit `attribute vec3 color`).
2. Figuren:
   - Proportionen, Farben (`color_vertex`-Palette), Blickrichtung zur Strecke (lokal +z).
   - Arme hoch beim Jubel: Drehrichtung von `fRotX(-a)`, ggf. das Vorzeichen tauschen.
   - Sitzen beim Picknick (Beine nach vorn, Körper −0,8 m).
   - Fahne weht, Blitze bei Sprüngen.
3. LOD-Übergang Karten ↔ 3D bei 58–74 m: kein Loch, keine Doppelung. Wenn es hakt, `FAN_FADE`/`crowdNear` anpassen.
4. Tribünen-Formen 1/2: Passen die Zuschauer-Streifen auf die Stufen? Dach-Schatten in der gebackenen Karte.
5. Event-Gelände, Riesenrad (Perlenketten-Felge, steht quer zur Strecke), Hüpfburg, Strandbar, Hütte, Autos: Maßstab,
   „Baukasten“-Wirkung, Weg.
6. Start/Ziel:
   - Ampel am Portal: Lage unter der Brücke `y + 9,2`, die Brücke liegt bei H = 10,5.
   - Ampel schaltet im Countdown.
   - Startaufstellung liegt sauber auf der Fahrbahn (polygonOffset).
   - Boxenmauer, Turm, Leinwand.
7. Banden: Schrift scharf? Rahmen (`rot` quer zur Punktreihe) richtig ausgerichtet?
8. Perf-Gate auf dem Mittelklasse-Profil:
   - Die Figuren kosten Vertex-Arbeit. Bei 900 auf Kino werden alle Ecken gerechnet, auch die ausgeblendeten.
   - Falls das zu teuer ist: `FAN_MAX` (900/480) senken oder die Figuren nach Entfernung auf der CPU vorsortieren.
   - Draw-Calls auf der größten Strecke ≤ 200.
9. Ladegröße: Es kommt keine neue Datei dazu (alles prozedural). Nur die Werbe-Textur ist im Grafikspeicher 4× größer.

**Annahmen und Risiken:**
- Alle Maße und Farben sind Startwerte.
- Pyro-Mengen und -Höhen sind Startwerte. Die Funken teilen sich den Vorrat von 160 mit den Karosserie-Funken.
- Fans, deren Gruppen-Karte durch die Obergrenze `crowd: 90` von planDeco wegfällt (nur sehr lange .TRK-Strecken),
  stehen ohne Karte da. In der Ferne ist dort dann niemand.
- Tribünen sitzen weiter als Karten-Streifen (keine 3D-Sitzenden auf Tribünen). Grund: Budget von ~170 Figuren je Tribüne.

**Asset-Frage (3D-Zuschauer):**
- Gewählt wurde eine **prozedurale Figur**: eigene Arbeit, keine Lizenzfrage, 0 KB Download, Animation passt direkt in den
  Shader.
- CC0-Alternativen gibt es, zum Beispiel Kenney „Mini Characters“ (12 Figuren, CC0) und Quaternius-Packs
  (z. B. „LowPoly RPG Characters“, CC0, opengameart.org). Beide sind stilisiert. In n20 wurden Kenneys Low-Poly-Palmen als
  „Spielzeug“ verworfen; das passt nicht zum Kino-Look.
- Falls doch gewünscht: Modell als glb laden, die Ecken je Körperteil mit `aPart` und `aCls` markieren (wie in
  `fanGeometry()`), dann bleibt der Shader gleich. Die Lizenz auf der Primärquelle prüfen und in `assets/LICENSES.md`
  eintragen.

**Nicht gemacht und warum:**
- **Konfetti im Ziel:** Gibt es schon seit n27 (Zielshow-Pyro). Der Ort steht zusätzlich in `plan.konfetti`, falls Kanonen
  sichtbar werden sollen.
- **Fahnen in der Menge, Kamerablitze, Kontaktschatten:** über die Figuren erledigt (siehe oben).
- **Dachterrassen in der Stadt:** nur Leute auf den Blöcken, keine Geländer oder Möbel.
- **„Mehr Fernkulisse, wo es leer wirkt“:** nicht angefangen. Das braucht den Blick aufs Bild.
- **Rennleitungsturm, Leinwand und Riesenrad als Fern-Silhouette:** gibt es nicht (nur nah im Mesh).

## Nicht Aufgabe des Vorbaus (offen für den Heavy-Job)
- Vorher/Nachher-Messung und Perf-Gate.
- Screenshots, Collagen, Vision.
- Browser-Suiten, Live-Check.
- Version, Cache-Busting, Service-Worker.
- `WETTER_KULISSEN_BERICHT.md`, Credits im Spiel: „Zuschauer, Event-Bauten: eigene Arbeit“, Regengeräusch synthetisch.
- Status-Zeile in `~/.hermes/plans/stunts-remake.md`.

## Dateien
- Neu:
  - `src/track/wetter.js`, `src/gfx/wetter.js`, `src/gfx/scheibe.js`
  - `src/track/kulisse2.js`, `src/gfx/kulisse2.js`
  - `tests/node/test_wetter.mjs`, `test_kulissen2.mjs`, `test_kulissen2_gfx.mjs`, `tests/node/data/deco_plan_n31.json`
  - `tools/kulisse_plan_hash.mjs`
- Geändert:
  - `src/main.js` (Wetter, Scheibe, Regenstreifen-Kamera, Ampel, Pyro)
  - `src/gfx/materials.js`, `env.js`, `themes.js`, `deko.js`, `fx.js`, `deco.js`, `kulisse.js`
  - `src/audio/sound.js`, `src/ui/ui.js`, `src/game/store.js`, `src/game/cinecam.js`
  - `src/track/deco.js`, `src/track/kulisse.js` (`makeGapFree` herausgelöst, gleiche Wirkung)
  - `tests/node/three_haken.mjs` (löst jetzt auch `three/addons/` auf), `tests/node/run_all.mjs` (+3 Tests)
