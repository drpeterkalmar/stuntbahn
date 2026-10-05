# Stuntbahn n27 – Zielshow, mehr Fan-Cam im Highlight-Film, schöneres Cockpit (05.10.2026)

Peters Wünsche (03.10., „nicht wichtig“): „Pyro-Effekte bei Zieleinfahrt, ein paar Sekunden weiterfahren nach dem
Ziel-Durchfahren (auch im Replay und Highlight). Mehr Fan-Cam-Schwenks und Effekte bei den Highlights. Cockpit
detaillierter und schöner machen.“

## Kurz
- **Live:** https://drpeterkalmar.github.io/stuntbahn/ – Build **9f8ff0fc2e**, im Browser geprüft (Pixel 7 quer, auch test_live): Rennen →
  Zielshow mit 4017 Feuerwerks-Teilchen (Bestzeit) → Highlight-Film „Looping · Röhre · ⭐ 100 m Sprung [Kran → Boden] ·
  99 m Sprung [Fan-Cam → Heck] · Ziel [Tele → Zielbogen]“, Cockpit mit Spiegelbild, **0 Fehler**.
- **Zielshow:** An der Ziellinie zünden Funkenfontänen und Flammensäulen links und rechts, Raketen steigen auf und
  zerplatzen über dem Ziel (mit Rauch, Lichtblitz und Glitzer), Konfetti regnet, die Fahrbahn leuchtet unter den Fontänen.
  Bei **Bestzeit** größer und golden, auf Leicht bzw. ohne Bestzeit kleiner. Das Auto **rollt 5 Sekunden aus** (erst mit
  Tempo, dann sanft; auf Leicht/Brachial wenn Platz ist ein **Jubel-Dreher**), die Kamera **schwenkt vom Auto auf den
  Zielbogen**, die Zeit steht groß im Bild – dann Film bzw. Ergebnis. **Antippen überspringt.**
- **Replay und Film zeigen das Auslaufen samt Feuerwerk**, Bild für Bild gleich wie live. Rennzeit, Bestzeit und
  Geisterauto enden weiter an der Linie (gemessen bitgleich).
- **Highlight-Film:** fünf neue Kameras – **Fan-Cam** (Handkamera eines Zuschauers, mit Köpfen und Händen im
  Vordergrund), **Kran/Dolly**, **Bodenkamera** (Auto donnert vorbei), **Heckkamera** (Blick zurück), **Zielbogen** –,
  dazu **Reißschwenks**, **Speed-Ramps**, **Freeze-Frame beim Rekord-Stunt (⭐)**, **Weißblitz**, Landungs-Ruckeln, mehr
  Staub/Funken in der Zeitlupe. Film 35,6–37,4 s (Momente höchstens 30 s wie bisher + Zieleinlauf ~9 s).
- **Cockpit:** Leder-Armaturenbrett mit Ziernaht, Carbon, Lüftungsdüsen, **Drehzahl-LEDs**, schlanke gepolsterte
  A-Säulen, Lenkrad mit Speichen, Nabe und Schaltwippen, Schalthebel, gewölbtes Instrumentenglas, **echter Innenspiegel**,
  Licht im Tunnel, **leichtes Kopfnicken** bei G-Kräften. Straße sichtbar wie bisher oder mehr (schmalere Säulen).
- **Bildrate nicht schlechter** (Messung unten), Draw-Calls im Cockpit +10 (Budget +15), Zusatz-Download **0 KB**
  (alle Materialien und Töne werden im Spiel erzeugt).
- Handy: **App einmal ganz schließen und neu öffnen** (PWA), dann ist der neue Stand da.

## 1. Zielshow
**Ablauf** (Spielsekunden ab der Linie, `ZIEL` in `src/game/zielshow.js`): 0 s Fontänen, Flammen, erste Raketen, Funken am
Heck; 0,7 s Schnitt auf die Zielbogen-Kamera, die in 1,5 s vom wegfahrenden Auto hinauf auf Bogen und Feuerwerk schwenkt;
4,6 s Ende → Highlight-Film (Einstellung an) bzw. Ergebnis-Karte. Antippen, Esc, Enter oder Leertaste überspringt (ab
0,35 s; ein noch liegender Finger zählt nicht). Die Zeit steht unten links groß (Bestzeit golden mit „🏆 Neue Bestzeit!“,
Leicht „Deine Zeit“).

**Feuerwerk** (`src/game/zielshow.js` plant, `src/gfx/pyro.js` zeichnet): ein einziges instanziertes Mesh (1 Draw-Call); je
Teilchen Startort, Startzeit, Geschwindigkeit, Lebensdauer, Größe, Luftwiderstand, Farbe. Die Flugbahn rechnet der
Grafikchip aus der Zeit seit dem Zieldurchgang – deshalb ist das Feuerwerk im Rennen, im Replay und im Film identisch
(auch in Zeitlupe und beim Springen im Film). Funken liegen als Striche entlang ihrer Flugrichtung, Glut wächst und
verglüht, Konfetti flattert und deckt, Rauchwolken zeigen die Bursts auch am hellen Taghimmel. Je Burst ein Lichtblitz:
Bloom und Helligkeit des Kino-Looks steigen kurz. „Licht aufs Umfeld“ als Bodenschein unter Fontänen und Bogen (echte
Lichtquellen hätten alle Materialien neu übersetzen und je Pixel mehr rechnen lassen). Nacht-Strecken gibt es nicht; in
Tunneln/unter Brücken wirkt der Bodenschein entsprechend stärker. Ton (nur wenn an, synthetisch, ~0,3 MB im Speicher, keine
Datei): Pfeifen der Raketen, Knall (Gold: tiefer, länger), Knistern, Zischen der Fontänen, Wusch der Flammen, Plopp der
Konfetti-Kanone – leiser mit dem Abstand, in der Zeitlupe tiefer.

| Grafikstufe | normal | Bestzeit | Budget | Raketen normal/Bestzeit | Flammen, Konfetti, Rauch |
|---|---|---|---|---|---|
| Einfach | 417 | 753 | 800 | 2 / 6 | nein |
| Standard | 1371 | 2255 | 2300 | 4 / 8 | ja |
| Kino | 2469 | 4017 | 4096 | 6 / 10 | ja (+ Glitzer bei Gold) |

**Auslaufen** (`race.js runout`): 0,9 s Tempo halten, dann sanft ausrollen (höchstens 6,5 m/s², bis 30 % des Ziel-Tempos).
Kommt hinter dem Ziel ein Stunt (Schanze, Looping, Röhre), hält das Auto 25 m davor an; reicht der Weg nicht, fährt der
Autopilot ihn mit Profil-Tempo (nie zu kurz springen). **Jubel-Dreher** (nur Leicht + Fahrstil Brachial): kräftig auf
~94 km/h herunterbremsen, dann Handbremse und Heck herum (Soll-Schwimmwinkel bis 150°), Auto bleibt quer stehen – aber
nur, wenn 45 m gerade, breite Fahrbahn ohne Stunt/Steilkurve/Hochstraße frei sind **und** ein Probe-Dreher (3 s Physik
vorab, 3,7 ms) zeigt, dass die Wagenmitte ≥ 1,4 m innerhalb der Kante bleibt; sonst gerade ausrollen. Gemessen auf 21
Strecken (7 Seeds × flach/3D/Gelände): **9 Jubel-Dreher**, die Wagenmitte blieb mindestens **1,8 m** innerhalb der Kante.

**Aufzeichnung:** 5 s nach der Linie (`ZIEL.rec`). Gemessen auf 5 Fahrten (`tests/node/test_zielshow.mjs`): Auslauf 5,0 s
aufgezeichnet, Rennzeit unverändert (z. B. 83,825 s mit und ohne Auslauf), Aufzeichnung bis zur Linie **bitgleich**,
Geisterauto endet an der Linie, Replay-Uhr bleibt an der Linie stehen, kein Crash, Auto auf der Fahrbahn. Wird die Show
übersprungen, rechnet das Spiel den Rest des Auslaufs sofort vor – Replay und Film haben ihn trotzdem.

## 2. Highlight-Film
**Neue Kameras** (`src/game/cinecam.js`, reine Rechnung, in Node gegen Strecke/Gelände/Wasser geprüft):

| Kamera | Wie | Prüfung (5 Filme, 60 Hz, quer + hoch) |
|---|---|---|
| **Fan-Cam** | Zuschauerplatz aus dem Streckenrand-Plan (Zuschauer, Tribünen) oder am Rand in Augenhöhe; Handkamera-Wackeln, Schwenk mit Verzug, Zoom „pumpt“ nach, Schärfe zieht hinterher (kurz unscharf, wenn das Auto schnell näher kommt); Köpfe und jubelnde Hände als unscharfe Silhouetten im Vordergrund (auch im Video) | über Boden 100 %, Sicht 100 %, Auto im Bild 100 % (am Looping Sicht 80 % – Gerüst davor) |
| **Kran/Dolly** | fährt neben der Strecke mit (55 % des Auto-Tempos, das Auto fährt durchs Bild), steigt von 2,5 auf 9 m, Schärfe wandert vom Vordergrund aufs Auto | 100 / 100 / 100 % (Looping: Sicht 74 %) |
| **Bodenkamera** | 36 cm über Fahrbahn/Gelände, ≥ 2 m seitlich jeder Lage des Autos (nie überfahren), weites Objektiv, Rumpeln, wenn das Auto nah ist | 100 / 100 / 100 % |
| **Heckkamera** | über dem Dach, Blick zurück übers Heck (im Sprung: auf die Lippe) | 100 % über Boden, Sicht 100 % |
| **Zielbogen** | s. Zielshow (live und im Film gleich) | 100 % über Boden, Bogen im Bild 99–100 % |

Wo eine neue Kamera keinen guten Platz findet (Fan-Cam/Kran in der Röhre, Bodenkamera eingeklemmt), springt die
Action-Cam (in Bauwerken) bzw. die Drohne ein. Die bisherigen Kameras bleiben (Drohne, Action, Tele, Hubschrauber,
Onboard: weiter 99–100 %).

**Effekte:** Speed-Ramp 1,35 → 1 → Zeitlupe 0,25 → 1 → 1,35 (weich, größter Sprung 0,012 je 1/240 s); **Reißschwenk**
zwischen zwei Einstellungen eines Clips (schneller Schwenk um die Hochachse mit Bewegungsunschärfe im Kino-Look);
Übergänge zwischen Clips im Wechsel Schwarzblende / **Weißblitz** / Reißschwenk; **Freeze-Frame** 0,7 s mit Weißblitz am
Höhepunkt des besten Moments (ab 60 Punkten, Einblendung mit ⭐); Kamera ruckelt bei Landungen; Staubwolke und Funken bei
jeder Landung (in der Zeitlupe bis 2,5× mehr); Sonnen-Blendung im Film 1,5× kräftiger. **Abwechslung:** je Stunt-Art
mehrere Kamera-Folgen; gewählt wird die mit den bisher seltensten Kameras, nie dieselbe Kamera zweimal hintereinander.
Drift (n25): Fan-Cam → Kran, Bodenkamera → Heck, Kran → Action. Große Stunts (n26): Fan-Cam und Kran am Looping mit
weiterem Bildausschnitt (26 m), Bodenkamera an der Landung der Schanze.
**Split-Screen** habe ich bewusst weggelassen: zwei Szenen-Durchgänge kosten am Handy die halbe Bildrate, und quer mit
Kino-Balken bleiben zwei sehr flache Streifen – nicht „sauber“.

**Länge:** Momente wie bisher höchstens 30 s (gemessen 27,1–28,5 s), dazu der Zieleinlauf mit Zielshow 7,4–8,9 s → Film
35,6–37,4 s. Überspringen bleibt, Video-Export (MediaRecorder) läuft: MP4 heruntergeladen, > 100 KB, mit Silhouetten
(`tests/test_kinoreplay.py`).

## 3. Cockpit
Vorher (Vision am Screenshot): flache Klötze als Säulen/Dach/Spiegel, Armaturenbrett eine Fläche, Lenkrad nur ein Ring,
Spiegel ohne Bild, keine Materialien. Jetzt (`src/gfx/cockpit.js`, `src/gfx/cockpitmat.js`):
- **Armaturenbrett** aus Leder (Narbung als Normal-Map, Glanz schwankt), gerundete Vorderkante (Wulst mit Lichtkante),
  orange **Ziernaht**, **Carbon-Leiste**, darunter Kunststoff; **runde Lüftungsdüsen** (Alu-Ring, Lamellen) neben der Hutze
  und flache Düsen außen; Instrumenten-Hutze aus Leder mit Naht und gerollter Lippe.
- **Drehzahl-LEDs** (12, grün → gelb → rot → blau) auf der Hutze, ab 5600 U/min der Reihe nach, über 7300 blinken alle.
- **Lenkrad:** Lederkranz (leicht oval) mit dicken Griffen bei 10 und 2 Uhr, Naht innen und außen, gelbe 12-Uhr-Marke,
  drei **Carbon-Speichen**, Nabe mit Carbon-Prallplatte, Tasten und Drehschalter (bewusst dunkel – hochkant liegt die Nabe
  zwischen den Touch-Tasten), **Schaltwippen**. Statt 11 Teilen nur noch 3 Draw-Calls.
- **A-Säulen** schmaler (links unten 0,06 statt 0,095 Bildbreiten), gepolstert gewölbt, mit Gummidichtung; **Dachhimmel**
  aus Alcantara.
- **Mittelkonsole mit Schalthebel** rechts unten (ruckt beim Hochschalten nach hinten, beim Runterschalten nach vorn) –
  nur, wenn rechts neben dem Tacho Platz ist (hochkant würde er den Tacho verdecken).
- **Instrumentenglas** gewölbt mit Klarlack-Spiegelung der Umgebung.
- **Innenspiegel** mit echtem Rückblick (Rendertarget 256×80, jedes 4. Bild, Weite 160 m, Kleinkram wie Gras/Banner im
  Spiegel aus) ab Grafik Standard; auf Einfach wie bisher spiegelndes Metall.
- **Licht:** Sonne durch die Scheibe mit **wandernden Schatten** der Säulen, des Dachs und des Lenkrads (ab Standard,
  Schattenkarte 512², jedes 3. Bild); **Tunnel/Brücke über dem Auto** (Strahl nach oben): Innenraum dunkler, warme
  **Tunnellampen streifen** alle ~12 m von vorn nach hinten über Brett und Säulen.
- **Kopfnicken:** Der Kopf gibt den G-Kräften gedämpft nach (1,4 cm und 0,4° je G längs, 1,1 cm und 0,5° je G quer,
  Feder kritisch gedämpft, höchstens 3 G) – Cockpit bleibt am Auto, nur der Blick bewegt sich minimal. `?kopf=0` aus,
  `?kopf=2` doppelt.
- **Hände/Handschuhe:** weggelassen (nicht gebaut). Hände am Lenkrad säßen genau links und rechts über den Instrumenten bzw.
  hochkant auf ihnen und unter den Touch-Tasten; selbst gebaute Low-Poly-Hände wirken neben den Leder-/Carbon-Flächen schnell
  billig, gute Hände bräuchten ein eigenes Modell mit Gelenken. Peters n15-Wunsch „Straße sehen“ hat Vorrang.
- **Einfach-Stufe:** ohne Normal-Maps (beim Start auf Einfach), ohne Spiegelbild, ohne Schatten-Neuberechnung.

**Straße frei** (`tests/cockpit_sicht.py`, Pixel 7, Anteil der Bildzeilen mit freier Fahrbahn / Cockpit-Anteil):

| Szene | Fahrbahn vorher → nachher | Brett-Oberkante | Cockpit-Anteil vorher → nachher |
|---|---|---|---|
| hoch, gerade (Demo) | 39,7 → **40,0 %** | 67,1 → 65,9 % | 55,2 → **51,0 %** |
| hoch, Kurve 4711-3 | 36,7 → **38,7 %** | 67,1 → 67,7 % | 55,2 → **49,4 %** |
| quer, gerade (Demo) | 37,2 → **39,4 %** | 61,9 → 60,2 % | 58,7 → **54,7 %** |
| quer, Kurve 4711-3 | 33,6 → **36,5 %** | 62,9 → 62,9 % | 58,8 → **53,8 %** |

Instrumente nie unter Touch-Tasten, Zeiger = Tempo/Drehzahl (Abweichung 0,0°): `cockpit_shots.py` quer 7/7, hoch 5/5,
desktop 7/7.

**Budget:** Cockpit-Durchgang 17 → 21 Draw-Calls (mit Schatten-Neuberechnung), Spiegel im Mittel 6 (30 je Spiegelbild, jedes
4. Bild) → **+10** (Budget +15); im Cockpit-Modus gesamt 87,9 → 98,5 (Mittel über 5 s). Zusatz-Download: **0 KB**
(Texturen werden beim Start erzeugt, 4 × 256²).

## Bildrate vorher/nachher
`tests/perf_zielshow.py` (headless über die Mac-GPU, Grafik Kino fest, je 2 Runden abwechselnd vorher = Commit a8b16d0 /
nachher, Median). Ohne Last stehen beide am Anschlag des Headless-Browsers (~73–76 Bilder/s, kein Unterschied messbar);
deshalb zusätzlich mit erzwungener 4- bzw. 3-facher Renderauflösung (Grafikchip voll ausgelastet):

| Szene | Pixel 7 quer, Last ×4: vorher → nachher | Desktop 1280×720, Last ×3: vorher → nachher |
|---|---|---|
| Rennen (Verfolger, Referenz) | 34,1 → 33,8 | 24,9 → 24,6 |
| Cockpit | 30,7 → 29,8 (−3 %) | 22,3 → 21,7 (−3 %) |
| nach dem Ziel (vorher Ergebnis, nachher Zielshow mit Feuerwerk) | 36,4 → 36,3 | 26,7 → 27,0 |
| Highlight-Film | 31,7 → 35,1 | 23,3 → 25,4 |

Das Cockpit liegt im Rauschen der Messung (±5 %); Feuerwerk und neue Kameras kosten nichts Messbares. **Ein echtes Handy
habe ich nicht gemessen.**

## Fotos (mit Vision geprüft)
`tests/shots/final/`: `n27_zielshow_quer_bestzeit.jpg`, `n27_zielshow_quer_leicht.jpg` (Cockpit-Start, normale Größe),
`n27_zielshow_hoch_bestzeit.jpg` (Alpen, hochkant), `n27_zielshow_live.jpg`; Fan-Cam in drei Einstellungen
`n27_fancam_1_looping.jpg`, `n27_fancam_2_looping.jpg`, `n27_fancam_3_schlucht.jpg`, `n27_fancam_hoch.jpg`; `n27_kran.jpg`,
`n27_bodenkamera.jpg`, `n27_heckkamera.jpg`, `n27_reissschwenk_freeze.jpg`; Cockpit `n27_cockpit_{quer,hoch}_{gerade,kurve,
tunnel,einfach}.jpg`, `n27_cockpit_vorher_desktop.jpg` / `n27_cockpit_nachher_desktop.jpg`.
Nachgebessert nach der Sichtprüfung: Explosionen waren am hellen Himmel unsichtbar (reines Addieren auf Weiß; dazu ein
Shader-Fehler – gedrehte Funken-Rechtecke lagen gespiegelt und wurden als Rückseite weggelassen) → Funken decken jetzt teils,
Rauchwolken, größere Bursts, Kamera näher; Zielbogen-Kamera stand hinter einem Fahnenmast → Streckenrand-Objekte meiden;
Heckkamera zeigte nur Straße → übers Dach; Schalthebel verdeckte hochkant den Tacho → nur mit Platz; bunte Lenkradtasten
wirkten hochkant wie Bedienknöpfe → dunkel; Leder war fast schwarz ohne Struktur → aufgehellt; Tunnellicht zu orange → schwächer.

## Tests
- **Node:** `npm run test:node` alle grün (31 Tests + Korpus-Stichprobe), neu `tests/node/test_zielshow.mjs` (Aufzeichnung ≥ 3 s, Zeit/Geist
  unverändert, bitgleich bis zur Linie, Auslaufen sicher, Jubel-Dreher auf der Fahrbahn, Pyro-Budget je Stufe,
  deterministisch, Zielbogen-Kamera frei); `test_kinoreplay.mjs` erweitert (alle Kameras gegen Gelände/Fahrbahn/Sicht,
  Speed-Ramp, Zieleinlauf mit Auslauf).
- **Browser:** grün – test_kinoreplay (quer + hoch, Video, Überspringen, alle 9 Kamera-Arten), zielshow_shots (quer,
  hoch Gelände), fancam_shots, cockpit_n27_shots (quer, hoch), cockpit_shots (quer, hoch, desktop), cockpit_sicht,
  test_cockpit_ui, test_touch, test_hochformat, test_race, test_reset_ui, test_leicht_zeiten, test_blur, test_kinolook,
  test_strecken3d_ui, test_gelaende_ui, test_zoom, test_bestzeiten_reset, test_grafik_start, test_fx, test_sound_pad, smoke,
  test_live. Ältere Tests schalten Film **und** Zielshow ab (`window.__noKino`, `window.__noShow` in `tests/util.py`).
- **Schon vor n27 rot** (gleiches Ergebnis auf dem Stand a8b16d0, nicht angefasst): `test_extras_ui` – auf sehr kleinem
  Querformat berührt die Tempo-Anzeige die BREMSE-Taste; `test_lineviz` – im Pause-Menü liegen „Neustart“/„Menü“ auf
  412 px Höhe am unteren Rand.

## Handy-Test (Peter)
1. App einmal ganz schließen und neu öffnen. Eine Strecke auf Mittel ins Ziel fahren (erste Zeit = Bestzeit → goldenes
   Feuerwerk). Kommt die Zielshow, schwenkt die Kamera auf den Bogen, sieht man die Raketen? Ruckelt es?
2. Antippen während der Show → gleich weiter? Danach Film: Fan-Cam (Köpfe im Vordergrund), Kran, Bodenkamera, Reißschwenk,
   ⭐-Standbild beim besten Stunt. Endet der Film mit Zieleinlauf, Feuerwerk und Auslaufen?
3. Leicht mit Fahrstil Brachial: Gibt es nach dem Ziel manchmal einen Jubel-Dreher?
4. Cockpit: Wirkt es hochwertig (Leder, Naht, Carbon, Lenkrad)? Zeigt der Innenspiegel das Bild nach hinten? Leuchten die
   LEDs beim Hochdrehen? Im Tunnel dunkler mit vorbeiziehendem Lampenlicht? Wird einem vom Kopfnicken schlecht?
   (`?kopf=0` schaltet es ab.)

## Grenzen / offen
- Kein echtes Handy gemessen; Headless-Messung mit erzwungener Last als Ersatz.
- Keine echten Lichtquellen fürs Feuerwerk (Bodenschein + Lichtblitz statt Punktlichtern); keine Nacht-Strecken im Spiel.
- Fan-Cam und Kran am Looping sehen das Auto zeitweise durchs Stahlgerüst (wie eine echte Kamera daneben).
- Der Spiegel zeigt die Welt ohne Gras, Banner, Feuerwerk und mit ~15 Bildern/s.
- Das Kopfnicken nutzt die angezeigten G-Werte (Show-Faktor), gedämpft und auf 3 G begrenzt.
