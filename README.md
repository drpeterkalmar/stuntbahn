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
- **Bestzeiten und Geisterautos** (Mittel und Original) werden je Strecke, je Fahrhilfe, je Totalschaden- *und*
  Extras-Einstellung getrennt gespeichert. **Seit 01.10.2026 (n21) neu gestartet:** alle bisherigen Bestzeiten und Geister
  wurden einmalig gelöscht (Peter: „Bestzeiten streichen“), es gibt keine Listen „alte Physik/alte Welt/erste Physik“ mehr.
  Links mit A/B-Zusatz (`?wiese=alt`, `?haft=alt`, `?schanze=alt`, `?grip=1`, `?welt=1` …) werten nicht.
  **Leicht wertet nicht** (seit 29.09.2026): kein Bestzeit-Jubel, kein Geisterauto – nur „Deine Zeit“ und die letzten
  5 Zeiten je Strecke mit Datum.
- **Doppelt so schnell** (seit 27.09.2026): Vmax ~586 km/h, 0–200 in 3,8 s, Rennreifen und Abtrieb (Details:
  `TEMPO_BERICHT.md`).
- **Mehr Bodenhaftung und schnellere Ideallinie** (seit 29.09.2026): Reifen mu 1,7 statt 1,5, mehr Abtrieb (wirkt nur mit
  Radkontakt, nimmt mit dem Bodenabstand ab), ruhige Räder an Steilkurven; der Autopilot fährt im Mittel 11 % schneller,
  pendelt nicht mehr zwischen Gas und Bremse (Details: `FAHRGEFUEHL_BERICHT.md`).
- **Wiese = Wiese** (seit 01.10.2026, n21): Neben der Strecke höchstens **30 km/h** (Vollgas ~27 km/h; seit n24 zeigt der
  Show-Tacho dort ~65). Wer mit 200 km/h
  abkommt, ist nach ~1,8 s bei 30 km/h – ohne Überschlag, Lenken geht weiter; Grasbüschel spritzen, die Kamera rumpelt.
  `?wiese=alt` = bisherige Wiese (A/B). Messung: `node tools/wiese_probe.mjs`, Test `tests/node/test_wiese.mjs`.
- **Bodenhaftung bei Tempo** (seit 01.10.2026, n21): Das Auto klebt bei Tempo wie ein Rennwagen – fällt die Radlast an
  Kuppen, Wellen oder Übergängen unter das Gewicht, zieht eine „Saugkraft“ es zur Fahrbahn (nicht an Schanzen, nicht im
  Hüpfer, nicht im Looping). Bots auf Original: Abheben an Kuppen 78 → 6, Crashs 73 → 42, Zeit mit < 4 Rädern 12,8 → 6,3 %.
  `?haft=alt` = Haftung wie bis n19 (A/B). Messung: `node tools/fahr_analyse.mjs --teil=haftung`, Test `test_haftung.mjs`.
- **Neue Schanze: weit statt hoch** (seit 01.10.2026, n21): flache Lippe (11°), Absprung mit ~140–168 km/h, ~100 m weit,
  ~4 m hoch, ~2,3 s Flug (auch mit 240 km/h höchstens ~10 m statt bis zu 34 m). **In der Lücke liegen Hindernisse**, je
  Schanze per Strecken-Code gewählt: Kanal mit Lastkahn und Schlepper, Busse in Reihe, Bauernhof (Heuballen, Traktor),
  Hafen (Container), Bahnübergang (Güterzug im Einschnitt), Zirkus (Zelt, Wagen). Alles unter der tiefsten Flugbahn;
  zu kurz gesprungen = „Zu kurz“/Aufprall → Reset. Gleiches Layout für alle Codes (Element bleibt 3 Felder).
  `?schanze=alt` = Schanze bis n19, `?hindernis=kanal|busse|bauernhof|hafen|zug|zirkus` erzwingt eine Variante.
- **Cockpit-Kamera** (🎥 / `C` / Gamepad LB): Blick durch die Frontscheibe, analoger Tacho (bis 600 km/h), Drehzahlmesser
  (0–8 ×1000, rot ab 7000, Zeiger schwingt leicht nach), Schaltkulisse mit Knauf (R, 1–6), Lenkrad dreht mit.
  Die Kamerawahl bleibt gespeichert. Beim Wrack kurz Verfolger, dann wieder Cockpit (Details: `COCKPIT_BERICHT.md`).
  **Seit 29.09.2026 sieht man die Straße:** Horizont im oberen Drittel, Armaturenbrett erst ab ~70 % der Bildhöhe, Fahrbahn
  ~34–40 % der Bildhöhe (vorher 0–7 %); Federung ruhig ausgeglichen. Wenig Platz zwischen den Tasten → kompakte
  Instrumente bzw. Tempo digital im HUD (Details: `BEDIENUNG_BERICHT.md`).
- **Replay** der letzten Fahrt mit Verfolger-, Cockpit-, Hubschrauber-, Strecken- und Stoßstangenkamera (Stoßstange seit
  29.09.2026 vor der Frontschürze, freie Sicht ohne Karosserie-Striche).
- **Extras je Runde (seit 28.09.2026): 1× Hüpfer 🦘 und 1× Nitro 🔥**, an Start/Ziel wieder voll. Hüpfer: ~3,5 m hoch aus der
  Fahrt, Auto bleibt waagrecht, nur mit Bodenkontakt, in Looping/Röhre/Korkenzieher und an Schanzen gesperrt. Nitro: 3 s
  +70–80 % Beschleunigung (Vmax ~700 statt 586 km/h), dann 0,7 s weich zurück, mit Flammen, Tempo-Streifen, weiterem
  Sichtfeld und Fauchen. Auf Leicht nutzt der Autopilot sie auf Wunsch selbst („Extras automatisch“). Abschaltbar
  (Optionen → „Hüpfer & Nitro“); Bestzeiten mit und ohne Extras getrennt (Details: `EXTRAS_BERICHT.md`).

- **Bewegungsunschärfe (seit 28.09.2026):** Optionen → Grafik → „Bewegungsunschärfe“ Aus / **Leicht** (Standard) / Stark.
  Verwischt die Umgebung ab ~80 km/h (volle Stärke ab ~190 km/h, mit Nitro kräftiger), das Auto bleibt scharf. Kamera-
  Bewegungsunschärfe aus Tiefe + voriger/aktueller Kamera, Drehungen nur zu 45 % (Kurven bleiben lesbar). Nicht in Menü,
  Pause, Replay-Standbild. Grafik „Einfach“: keine Unschärfe, nur Tempo-Streifen am Rand ab ~260 km/h. Kostet die
  Unschärfe spürbar Bildrate (> 8 % unter der Bildrate ohne, unter 58 fps), schaltet die Automatik sie für die Sitzung ab.
  Dazu sehr dezentes Kameraschütteln auf Bodenwellen (Verfolger). Details: `OPTIK_BERICHT.md`.

- **Detailliertere Umgebung (seit 28.09.2026)**, auf generierten und importierten Strecken automatisch: Randstreifen und
  Kiesbetten an Kurven-Außenseiten, Reifenabrieb auf der Ideallinie, Reifenstapel, Leitplanken mit (fiktiver) Bandenwerbung,
  Tribünen am Start, Zuschauer mit Zaun an scharfen Kurven, Streckenposten, Bremstafeln 150/100/50, Flutlichtmasten,
  Gras/Blumen/Büsche nahe der Strecke (blenden ab ~40–55 m aus, wiegen sich im Wind), Laubbäume, Felsen, Felder mit Hecken
  und Bauernhöfe in der Ferne, Wald am Bergkranz, wandernde Wolkenschatten, Wasser mit Wellen. Keine Kollision, immer mit
  Abstand zu jeder Fahrbahn (auch Hochstraßen/Rampen), nie im Wasser. Dosiert nach Grafikstufe; ruckelt es, blendet die
  Automatik (nach der Unschärfe) zuerst Gras/Büsche/Wolkenschatten aus. `?deko=0` / `?wolken=0` zum Vergleich.

## 🎆 Zielshow, mehr Fan-Cam im Film, schöneres Cockpit (seit 05.10.2026, n27)
- Peter: „Pyro-Effekte bei Zieleinfahrt, ein paar Sekunden weiterfahren nach dem Ziel-Durchfahren (auch im Replay und
  Highlight). Mehr Fan-Cam-Schwenks und Effekte bei den Highlights. Cockpit detaillierter und schöner machen.“
- **Zielshow:** Funkenfontänen und Flammensäulen am Zielbogen, Raketen mit Bursts, Rauch und Glitzer, Konfetti, Lichtblitze,
  Funken am Heck; bei **Bestzeit** größer und golden. Das Auto **rollt 5 s aus** (auf Leicht/Brachial mit Platz ein
  **Jubel-Dreher**), die Kamera **schwenkt aufs Feuerwerk**, dann Film bzw. Ergebnis – **Antippen überspringt**. Replay und
  Film zeigen Auslaufen und Feuerwerk genauso; Zeit, Bestzeit und Geist enden an der Linie. Budget je Grafikstufe
  (0,8k / 2,3k / 4,1k Teilchen, ein Draw-Call), Ton synthetisch. `?show=0` = ohne Show.
- **Highlight-Film:** neue Kameras **Fan-Cam** (Handkamera eines Zuschauers, Köpfe/Hände im Vordergrund), **Kran/Dolly**,
  **Bodenkamera**, **Heckkamera**, **Zielbogen**; Reißschwenks, Speed-Ramps, **Freeze-Frame beim Rekord-Stunt (⭐)**,
  Weißblitz, Landungs-Ruckeln, mehr Staub/Funken in der Zeitlupe; Kameras wechseln je Stunt-Art ab. Film ~36 s (Momente
  höchstens 30 s + Zieleinlauf).
- **Cockpit:** Leder-Armaturenbrett mit Ziernaht, Carbon, Lüftungsdüsen, **Drehzahl-LEDs**, schlanke A-Säulen (mehr Straße
  im Bild), Lenkrad mit Speichen, Nabe und Schaltwippen, Schalthebel, gewölbtes Instrumentenglas, **echter Innenspiegel**
  (ab Standard), wandernde Schatten, im Tunnel dunkler mit vorbeiziehendem Lampenlicht, leichtes **Kopfnicken** bei G-Kräften
  (`?kopf=0` aus). Materialien werden im Spiel erzeugt (0 KB Download).
- Bildrate gemessen gleich wie vorher (Cockpit −3 % im Rauschen), Draw-Calls im Cockpit +10. Details, Messwerte, Fotos:
  `ZIELSHOW_BERICHT.md`. Handy: App einmal ganz schließen und neu öffnen.

## 🌀 Größere Stunts, passend zur großen Welt (seit 05.10.2026, n26)
- Peter: „Und die Stunteinlagen ebenfalls vergrößern, passend zu den Strecken.“ Die Bauwerke hatten seit der doppelt so
  großen Welt und der breiteren Fahrbahn (n23) ihr altes Maß – jetzt wachsen sie mit (Stunt-Maßstab **1,6**).
- **Looping** 14,5 → **23 m** hoch, Spur 4,5 → **7,2 m** (kein Engpass mehr), **Röhre** 7 → **11 m** hoch und breiter als
  die Straße, **Korkenzieher** 7 → **11,5 m**, **Schanze** höher (Lippe 2,1 m, Landerampe 4 m, Scheitel ~7,7 m über Grund,
  Flug 2,75 statt 2,3 s, Fenster 122–144 km/h), **Steilwand** 18,6 m, **Halfpipe** Kante 6,4 m, **Schlucht** 28,6 m tief,
  Wellen, Bodenwellen und Kuppe etwas kräftiger. Stützen, Bügel, Banden, Portale wachsen mit. Alles bleibt in seinen
  Feldern – Strecken-Codes und Layouts unverändert.
- **Nicht schwerer:** Leicht weiter ohne Crash, Mittel crasht 15 % seltener (breitere Spuren), Original gleich. Mittel:
  Sprung-Hilfe kräftiger, kein „Bremsen!“ mehr im Looping. Klippe und importierte Strecken (.TRK, Sammlung) behalten
  bewusst ihr altes Maß (gemessen, Details im Bericht).
- **Bestzeiten der Zufallsstrecken einmalig neu** (Hinweis im Menü); Sammlung und .TRK behalten ihre Zeiten.
  `?stunt=1` = Stunts wie bis n25 (A/B, wertet nicht).
- Details, Messwerte, Fotos vorher/nachher: `STUNTGROESSE_BERICHT.md`. Handy: App einmal ganz schließen und neu öffnen.

## 🔥 Autopilot auf Leicht brachial: Driften und Schleudern (seit 05.10.2026, n25)
- Peter: „Kannst du den Autopilot auf Leicht etwas brachialer fahren lassen? Mit Driften und Schleudern so häufig wie
  möglich am oberen Grenzbereich des Machbaren?“
- **Neue Option „Autopilot-Fahrstil“** (Optionen, Pause-Menü auf Leicht): **🔥 Brachial** (Standard) / **🧼 Sauber** (wie
  bisher). `?fahrstil=sauber|brachial` gilt vorrangig.
- **Brachial:** Tempo am Limit (96 statt 76 % der Querhaftung, später bremsen), **Drifts quer durch die Kurven** (18–34°,
  Qualm, Gummispuren, Gegenlenken), ab und zu ein **Beinahe-Dreher** (~65°, eingefangen), **Ausritt mit zwei Rädern ins
  Gras**, Wackeln nach Landungen, Nitro am Kurvenausgang. Der Autopilot lenkt dabei selbst; Tippen schiebt mit, gehaltenes
  Wegdrücken übernimmt (dann Sauber-Tempo). Loopings, Röhren, Schanzen, Steilkurven, Wellen, Engstellen und Hochstraßen
  ohne Bande fährt er sauber.
- **Gemessen** (42 Strecken × 5 Seeds): alle im Ziel, **0 Crashs**, Drift in 29 % der Kurvenzeit (vorher 0,1 %),
  6,4 Drifts je Runde, Runden 11,6 % schneller als Sauber.
- Replay/Kino-Replay mit Qualm und Quietschen, **Drift-Kamera** (Verfolger folgt teils der Fahrtrichtung), neue
  Highlights „🔥 Längster/Stärkster Drift“ und „🌪️ Beinahe-Dreher“.
- Mittel, Original, Prüffahrt und Leicht-Sauber Bit für Bit unverändert. Details, Messwerte, Fotos: `DRIFT_BERICHT.md`.
  Handy: App einmal ganz schließen und neu öffnen.

## 🟡 Mittel kontrollierbar, Sprünge nicht zu weit, Schanze sauber (seit 05.10.2026, n24 Etappe 2)
- Peter: „Sprünge gehen zu weit und Auto ist unkontrollierbar schnell. Idee: weniger schnell beschleunigen. Textur der
  Sprungschanze sieht ungustiös aus.“
- **Mittel beschleunigt sanfter:** 0–100 / 0–200 km/h in 3,1 / 7,1 s statt 1,6 / 2,8 s, ab ~100 km/h weich weniger Schub,
  Höchsttempo ~264 statt ~560 km/h, Gas baut sich in 0,45 s auf.
- **Sprung-Hilfe in der Luft** (nur Mittel): Die Landung wird dezent bis an den Rand der Landerampe gezogen. Im Fenster
  wirkt sie nicht, und viel zu schnell bleibt zu weit.
- **Schanzen-Hinweis** im HUD mit dem Absprung-Tempo (Tacho-Zahl, grün/gelb/rot).
- **Bots:** saubere Landungen 51 → 91 %, Flüge hinter die Rampe 40 → 0, Crashs −30 %.
- Leicht, Original, Prüffahrt und Autopilot sind unverändert. **Mittel-Bestzeiten einmalig neu** (Hinweis im Menü).
  `?m=n23` = Mittel wie bisher, `?antrieb=0.8` zum Abstimmen (beide werten nicht).
- **Schanze** auf allen Stufen: sauberes hellgraues Stahl-Riffelblech statt Rost/Grün/Lila-Flecken, ohne Moiré,
  gelb-schwarze Warnstreifen an Lippe und Landerampe. Dateien kleiner als vorher.
- Details, Messwerte, Fotos: `MITTEL3_BERICHT.md`. Handy: App einmal ganz schließen und neu öffnen.

## 🌀 G-Kräfte und Show-Tacho (seit 04.10.2026, n24 Etappe 1)
- Peter: „Im Cockpit und im Replay bzw. Highlights die G-Kräfte dazuschreiben … und die langsamen Geschwindigkeiten mit
  mehr km/h angeben, 40 in der Kurve klingt langweilig.“ **Reine Anzeige**: Physik, KI, Hinweise, Bestzeiten unverändert.
- **Show-Tacho** für alle km/h-Anzeigen: `v + 1,5 · v · (1 − v/250)²`. Echt 40 → 82, 100 → 154, 200 → 212; ab 250 km/h genau.
  **Wiese:** echt weiter höchstens 30 km/h, der Tacho zeigt dort ~65. `?tacho=echt` = alte Anzeige (A/B).
- **G-Meter:**
  - im Cockpit (rundes Display auf der Hutze: Punkt im Reibungskreis, „2,6 G“, „max“ der Runde)
  - im HUD (dezente Zahl neben dem Tempo)
  - im Replay und Kino-Replay (mit km/h, auch im Video)

  Highlight-Untertitel mit Spitzenwert („🌀 Looping · 6,2 G“, „🚀 104 m Sprung · 7,7 G“), neue Highlight-Art
  „🏁 Kurve · 3,5 G quer“. Werte: Stand 0,0, Kurve ~2–3, Looping ~6, Schanzen-Landung 6–8 G, nie über 10.
  `?g=echt` = ohne Show-Faktor, `?g=0` = aus.
- Details, Messwerte, Fotos: `GKRAFT_BERICHT.md`. Code: `src/core/showspeed.js`, `src/core/gforce.js`, `src/ui/gmeter.js`.

## 🏞️ Landschaften und Streckenrand (seit 04.10.2026, n20)
- Peter: „Mehr Streckenelemente und Kulissen.“ **7 Landschafts-Themen** – 🌾 Land, 🏜️ Wüste & Canyon, 🏔️ Alpen, 🏝️ Küste &
  Tropen, 🏙️ Stadt, 🍂 Herbstwald, ❄️ Winter – je mit eigenem Himmel (Poly-Haven-HDRI), Licht, Nebel, Farbkorrektur im
  Kino-Look, Boden/Fels (ambientCG), Pflanzen und Fernkulisse (Berge mit Schnee, Tafelberge, Meer mit Strand und Inseln,
  Skyline mit Hochhäusern, Kränen, Hochstraße, Leuchtturm, Segelbooten). Alle Assets CC0 (`assets/LICENSES.md`).
- **Passend zur Strecke:** generierte Strecken aus Seed/Stufe/Streckenart, .TRK und Sammlung aus dem Horizont. Menü →
  **„🏞️ Landschaft“**: passend oder fest ein Thema; URL `?thema=wueste|alpen|kueste|stadt|herbst|winter|land`.
- **Streckenrand:** Tribünen an Start, Sprüngen, Loopings und Kurven, **jubelnde Zuschauer**, Start/Ziel-Portal, Fahnen mit
  erfundenen Marken, Kamerakräne, Heißluftballons, Zeppelin, Windräder. Keine Kollision, nie in Sprunglücken, Schluchten oder
  auf Böschungen; **Fahrbahn und Bestzeiten unverändert** (47/47 Strecken bitgleich).
- Themen-Pakete (1,7–2,5 MB) laden nur bei Bedarf, immer nur das aktuelle. Details, Messwerte, Fotos: `KULISSEN_BERICHT.md`.
  Code: `src/track/themes.js` (Themen, passend, Fernkulisse), `src/track/kulisse.js` (Planung), `src/gfx/themes.js` (Laden/
  Anwenden), `src/gfx/kulisse.js` (Bäume, Silhouetten, Meer, Bauten, Streckenrand).

## 🎞️ Kino-Replay nach dem Ziel (seit 03.10.2026, n18)
- Peter: „Nachdem man durchs Ziel ist: Cinematic Replay mit Slow-Mo-Drohnen-Action-Cam der besten Stunteinlagen.“
  Nach dem Zieleinlauf läuft ein **Highlight-Film (~22–30 s)**: die 3–5 besten Momente der Fahrt, zeitlich sortiert, je mit
  Zeitlupe (1,0 → 0,25 → 1,0, weiche Rampen), Einblendung („🚀 101 m Sprung“, „🌀 Looping“), tieferem Motor und Stinger in
  der Zeitlupe, Tiefenschärfe aufs Auto und Bewegungsunschärfe – zum Schluss der Zieleinlauf. Quer mit Kino-Balken,
  hochkant ohne Balken mit eigenem Bildausschnitt. **Antippen (oder Esc/Enter/Leertaste) überspringt**, danach das Ergebnis.
- Momente aus der Aufzeichnung (keine Neu-Simulation): Sprünge (Flugzeit × Höhe × Weite), Schluchtsprung, Klippen- und
  Plateau-Sprung, Hüpfer, Achterbahn-Wellen, Kuppen, Looping, Korkenzieher, Wendel, Röhre, Spirale, Steilwand, Halfpipe,
  Steilabfahrt, Nitro, Spitzentempo, Beinahe-Unfall/auf zwei Rädern, harte Landung, Crash mit Überschlag/Absturz (nur wenn
  spektakulär und höchstens 3 Crashs). Kameras: **Drohne, Action-Cam, Stativ/Tele, Hubschrauber, Onboard** – gegen Strecke,
  Gelände und Wasser geprüft.
- Optionen → **„🎬 Kino-Replay nach dem Ziel“** (Standard an). Im Ergebnis: **🎬 Highlights** (Film erneut), **📼 Replay**
  (ganze Fahrt wie bisher) und **🎥 Als Video** (Film mit Ton als MP4/WebM aufnehmen → **📤 Video** teilen/speichern).
- `?kino=0|1` übersteuert die Einstellung. Details, Punkte-Formel, Messwerte: `KINOREPLAY_BERICHT.md`.
  Code: `src/game/highlights.js` (Momente, Film), `src/game/cinecam.js` (Kameras), `src/ui/cliprec.js` (Video),
  Tiefenschärfe als Stufe `dof` in `src/gfx/kinolook.js`.

## 🎬 Kino-Look (seit 02.10.2026, n17)
- Peter: „Mehr Details und realistische Grafik, Effekte wie Forza mit DLSS.“ Echtes DLSS geht im Browser nicht – der Kino-Look
  holt den Eindruck mit Echtzeit-Techniken fürs Handy: Farbkorrektur mit Film-Kontrast, Luftperspektive (Dunst in der
  Ferne, zur Sonne warm), Bloom, Sonnen-Blendung, Vignette, Kontaktschatten unter dem Auto, Umgebungsverdeckung (Kino),
  Hitzeflimmern hinter den Endrohren (Kino), Funken beim Schleifen/Aufsetzen, dichterer Reifenrauch, Staub; Asphalt mit
  Flicken und vergossenen Rissen, abgenutzte Randsteine, Fels mit Klüften. Die Bewegungsunschärfe läuft in derselben Pipeline.
- **Grafik: Automatisch / Einfach / Standard / Kino** (Optionen). **Start immer mit Kino** (seit 02.10.2026, auch am Handy;
  die Automatik senkt bei Ruckeln zuerst die Renderauflösung, dann Deko, dann die Stufe). Standard rechnet mit ~84 % Auflösung und schärft
  kantenbewusst hoch (spart die Leistung für die Effekte), die Automatik regelt die Renderauflösung nach Bildrate.
- A/B: `?look=0|1|2`, `?look=alt` (Bild wie bis n22), einzelne Stufen `?kl=-bloom,-grade,+ssao …`, `?ktx=0` (WebP statt KTX2).
- Texturen der Strecke als **KTX2** (GPU-komprimiert, ~¼ Grafikspeicher). Modul `src/gfx/kinolook.js` für andere Spiele:
  `KINOLOOK.md`. Messungen, Fotos, Grenzen: `KINOLOOK_BERICHT.md`.

## ⛰️ Gelände-Strecken (seit 01.10.2026, n22) – Standard für neue Strecken
- Peter: „3D-Gelände wie bei Trackmania“. **Die Strecke fährt durch eine Landschaft** aus Hügeln, Tälern, Plateaus und
  Hängen (Höhenunterschied der Fahrbahn ~10–60 m, Landschaft 60/90/120 m je Stufe): Bergauf- und Talfahrten (Steigung
  höchstens 13/18/23 %), **Serpentine** (Kehren den Hang hinauf), **Kuppe mit kurzer Luftphase**, **Hang-Querfahrt**
  (Fahrbahn 8–12° seitlich geneigt), **Steilkurve in der Mulde**, **Schluchtsprung** (Schanze auf der Kante, Fluss mit
  Schiffen ~22 m tiefer), **Tunnel durch den Hügel** (Portal, Hügel darüber), **Brücke** über ein Tal (nur dort Pfeiler),
  Plateau-Abfahrt (Drop) und Halfpipe; Looping, Röhre, Korkenzieher stehen auf Gelände-Sockeln.
- Neben der Straße liegt das Gelände genau auf Fahrbahnhöhe, dahinter Böschungen (Damm/Einschnitt) bis zur Landschaft;
  Leitplanken, wo es hinuntergeht. Fels an steilen Hängen, Erde an Böschungen (Shader nach Neigung, `?gelfarbe=0` aus).
- **Code mit Zusatz „-g“** (z. B. `4711-3-g`), URL `?seed=4711&d=3&g=1`. Menü: Schalter **▭ flach / 🏗️ Hochstraße / ⛰️ Gelände**
  neben der Schwierigkeit. Alte Codes (`4711-3`, `4711-3-3d`) bleiben bitgleich.
- Streckenkarte im Menü mit Höhenschattierung. Verfolgerkamera wird auch vom Hang nie verdeckt.
- Details, Messwerte, Fotos: `GELAENDE_BERICHT.md`. Technik: `src/track/gelaende.js` (Landschaft, Höhenverlauf, Gelände),
  `src/track/generatorG.js`, `src/track/pieces_gel.js`.

## 🏗️ 3D-Strecken (seit 30.09.2026, n19)
- **Neue Zufallsstrecken und die Strecke des Tages sind 3D:** mehrere Ebenen übereinander (Sanft bis 2, Sportlich bis 3,
  Irre bis 4 Ebenen à 6 m), meist eine **Acht**, die sich über eine **Brücke** selbst kreuzt, dazu **Spiralen** hinauf und
  hinunter, **Steilrampen** (Bergab-Sprint), **Klippensprünge** eine oder zwei Ebenen tief, **Steilwand** (68°),
  **Achterbahn-Wellen** mit kurzer Luftphase, Korkenzieher, Wendel und Steilkurve des Klassikers.
- **Code mit Zusatz „-3d“** (z. B. `4711-3-3d`); Bestzeiten und Geister getrennt. **Alte Codes bleiben gültig:** `4711-3`
  ist dieselbe flache Strecke wie immer. Menü → Schalter **🏗️ 3D / ▭ flach** neben der Schwierigkeit.
- **Streckenkarte** im Menü: höher = heller, mit Schatten; an Kreuzungen liegt die obere Straße oben.
- Hochstraßen mit hohen Brüstungen (außen in Kurven höher), Pfeiler nie auf der unteren Fahrbahn. **Absturz** von einer
  Hochstraße = Crash und Reset (+5 s) wie jeder andere. **Leicht** gibt auf Hochstraßen keinen Vorrang über den Rand.
- Die Verfolgerkamera wird nie von Decks, Pfeilern oder der oberen Fahrbahn verdeckt (fünf Strahlen, weich heran).
- **Galerie** (`?gallery`) zeigt alle Teile hintereinander. Details, Quoten, Leistung: `STRECKEN3D_BERICHT.md`.
- URL: `?seed=4711&d=3&3d=1` (ohne `3d=1` wie bisher flach).

## ⭐ Sammlung: 250 eigene Strecken (seit 28.09.2026)
- Menü → **📂 Strecke laden (.TRK)** → Abschnitt **„⭐ Sammlung (250)“** (eingeklappt, lädt erst beim Aufklappen:
  `assets/sammlung.bin` + `.json`, zusammen ~117 KB gzip). Oben die **Strecke des Tages** (Kalendertag mod 250, für alle gleich).
- **Suche** nach Namen, **Filter** (Schwierigkeit, Länge kurz/mittel/lang, enthält Looping/Korkenzieher/Röhre/Sprung/Tunnel/
  Autobahn/Steilkurve/Hochstraße/Slalom/Schikane/Kreuzung, Landschaft, „noch nie gefahren“, „mit meiner Bestzeit“) und
  **Sortierung** (Empfohlen = Stil-Nähe, Name, Länge, Anzahl Stunts, Schwierigkeit, eigene Bestzeit, zuletzt gefahren);
  die Auswahl bleibt gespeichert. Bestzeiten und Geister je Strecke (`sam-001` …) wie bei Importen.
- **Eigene, generierte Strecken** im Stil der beliebtesten Stunts-Wettbewerbe (Generator `src/track/trkgen.js`). Aus den
  Wettbewerbsstrecken wurden nur allgemeine Häufigkeiten abgeleitet (`assets/sammlung_stil.json`); keine fremde Strecke ist
  enthalten, jede hat ein Ähnlichkeits-Tor gegen alle Vorbilder bestanden und der Autopilot ist sie auf „Leicht“ gefahren.
  Details: `SAMMLUNG_BERICHT.md`. Die Originale lädt man weiterhin selbst (zak.stunts.hu → .TRK/.ZIP importieren).
- Die Sammlung ist **eingefroren**: spätere Builds hängen nur an, bestehende Nummern ändern sich nie (Bestzeiten hängen daran).

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
| 🟢 **Leicht** | **Autopilot-Fahrstil (seit 05.10.2026, n25):** Standard **🔥 Brachial** – der Autopilot fährt am Limit, driftet durch die Kurven und lenkt selbst; Tippen schiebt mit, gehaltenes Wegdrücken übernimmt (`DRIFT_BERICHT.md`). **🧼 Sauber** = das Folgende. Gas automatisch (Bremse des Spielers geht vor). **Mitlenken statt Schienen** (seit 29.09.2026): Die Hilfe hält das Auto auf der Fahrbahn und lenkt einen Teil jeder Kurve; die Ideallinie trifft man mit etwas Mitlenken, ohne Lenken driftet das Auto nach außen und wird langsamer (`?lk=0` = alte Schienen, `?lk=0.5` weniger mitlenken). Wer deutlich über den Rand hinaus drückt, hat Vorrang – auch quer durchs Gelände, Loslassen führt weich zurück. Loopings, Röhren, Korkenzieher und Sprünge lenkt das Auto selbst (mit Ansage im HUD), Engstellen und Steilkurven hält es eng auf der Linie. Handy: linke/rechte Bildschirmhälfte halten (oder Neigen). |
| 🟡 **Mittel** | Du lenkst und bremst selbst. **Seit 05.10.2026 (n24):** sanftere Beschleunigung (0–100 in 3,1 s, Höchsttempo ~264 km/h, Gas-Rampe 0,45 s), Sprung-Hilfe in der Luft bis an den Rand der Landerampe, Schanzen-Hinweis mit Absprung-Tempo (`MITTEL3_BERICHT.md`, `?m=n23` = wie bisher). **Seit 03.10.2026 (n23):** Echtzeit (Spieltempo 1,0 statt 1,25 – die Tacho-Zahl ist das Tempo, das du siehst; Beschleunigung in echten Sekunden wie bisher), Traktionskontrolle, Schleuderschutz (ESP über die Drehrate, kein Zug zur Linie), Haftung ×1,3 (Kurvengrenztempo +30 % gegen Original), Touch-Pfeile mit Lenk-Rampe (tippen = kleine Korrektur), „Bremsen!“ tempoabhängig früher, Kamera schaut bei Tempo weiter voraus. **Dynamische Ideallinie:** das Stück vor dem Auto färbt sich nach deinem Tempo (grün/gelb/orange/rot, dieselbe Rechnung wie „Bremsen!“). Optionen → „Bremshilfe“ Aus / **Hinweis** / Sanft. Kein Zug zur Ideallinie (n16); Spurhilfe im Looping/in der Röhre, Rückspul-Knopf. Messung: `MITTEL2_BERICHT.md`. |
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
  rechts 🔥 Nitro. **Tastengröße** (Optionen): Normal / **Groß** (Standard, +30 %) / Riesig; die Trefferfläche ist 6 px größer
  als die sichtbare Taste. Kein versehentlicher Doppeltipp-Zoom (auch iOS). Optional „Lenken durch Neigen“
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
  **Sprünge wie im Original:** im Flug wirkt nur 70 % der Schwerkraft (Details: `SPRUNG_BERICHT.md`); seit n21 flache
  11°-Schanze für das echte Tempo mit Hindernissen in der Lücke (`HAFTUNG_BERICHT.md`).
- **Streckenbausteine** als Spline-Extrusion mit Querschnittsprofilen (Straße, Hochstraße, Steilkurve,
  Looping-Spur, Röhre, Schanze) auf dem 30×30-Raster.
- **Ideallinie** (Minimal-Krümmung innerhalb der Fahrbahn) + **Tempo-Profil** aus Querhaftung, Überhöhung,
  Looping-Anpressdruck und Sprung-Fenster; **Autopilot** = Stanley-Regler im Rahmen der Linie
  (funktioniert kopfüber). Fahrhilfen = Mischung Spieler/Autopilot.
- Grafik: HDRI-Himmel + bildbasiertes Licht, PBR-Texturen, Klarlack-Auto, **vorberechneter Sonnenschatten**
  für die statische Strecke (einmal gerenderte Tiefenkarte), Echtzeit-Schatten nur fürs Auto,
  automatische Qualitätsstufen nach Bildrate.
- **Ton aus Aufnahmen** (seit 30.09.2026, n16; CC0 von freesound.org, eine Datei `assets/snd/sfx.m4a`, 0,27 MB, beim Laden der
  Seite dekodiert): Motor aus Drehzahl-Loops eines Prüfstandslaufs (Last und Schiebebetrieb getrennt, überblendet,
  Tonhöhe folgt der Drehzahl), Zündunterbrechung beim Hochschalten, Zwischengas beim Runterschalten, Fehlzündungen im
  Schiebebetrieb, Drehzahlbegrenzer, Nitro-Schicht, im Cockpit Innenraum-Klang; Crash nach Schwere geschichtet (Wumms,
  Blech, Trümmer, Glas nur bei schweren), Schleifen an Wand/Leitplanke, Landungen nach Fallhöhe, Reifenquietschen.
  Neu bauen: `python3 tools/fetch_sounds.py && python3 tools/build_sounds.py`. Scheitert das Laden, spielt der
  bisherige Synthesizer; `?snd=alt` erzwingt ihn (A/B). Messungen: `SOUND_BERICHT.md`.
- Debug-API `window.__game` (Headless-Tests).

## Entwicklung & Tests
```bash
npm run test:node                         # alle Node-Tests (Parser, Import, Physik, Generator, Fahrhilfen)
node tests/node/test_trk_parser.mjs       # .TRK-Parser + Elementtabelle (Byte-Layout, alle Codes)
node tests/node/test_trk_import.mjs       # jedes Element baubar, Wegverfolgung, Gelände, Beispielstrecke
node tests/node/test_trk_corpus.mjs 200   # nur lokal: Archiv-Strecken in trk_local/ (nicht im Repo)
node tests/node/test_sammlung.mjs         # Sammlung: 250 lesbar + Rundkurs, 20× Autopilot Leicht, Tor/Namen (lokal), Filter/Sortierung
python3 tests/test_sammlung_ui.py [url]   # Sammlung im Browser: aufklappen, Tages-Strecke fahren, Suche/Filter/Sortierung, 404
node tools/sammlung_stil.mjs              # nur lokal: Stil-Modell aus den Wettbewerbsstrecken → assets/sammlung_stil.json (--kalib)
node tools/build_sammlung.mjs             # nur lokal: Sammlung bauen/anhängen (--anzahl=N, --zeit=s; eingefroren)
python3 tests/test_trk_ui.py              # Import-Oberfläche: Datei-Auswahl, ZIP, Drag & Drop, Ziel, Löschen
node tests/node/test_loop_gate.mjs        # Physik-Gate: Ebene → Schanze → Steilkurve → Looping → Röhre
node tests/node/test_verify_batch.mjs 10  # Generator: 10 Seeds × 3 Stufen per Autopilot lösbar
node tests/node/test_strecken3d.mjs       # n19: neue Teile (Spirale, Überführung, Wellen, Steilrampen, Klippe, Steilwand, TRK-Teile, Galerie)
node tests/node/test_generator3d.mjs 40   # n19: 3D-Generator – Belegung, Ebenen-Regeln, Kreuzungen, Lösbarkeit, Bauzeit ≤ +30 %
node tests/node/test_alte_codes.mjs       # n19: alte Codes identisch (Layout-Hash 83 Seeds × 3 Stufen, --verify)
node tests/node/test_leicht3d.mjs 6       # n19: Fahrhilfen auf 3D-Strecken, Leicht ohne Absturz, Absturz → Reset
node tools/quote3d.mjs 300 [--3d]         # n19: Lösbarkeit + Bauzeit je Stufe (flach bzw. 3D)
python3 tests/test_strecken3d_ui.py       # n19: Menü (Code -3d, Karte, Schalter), Rennen 3D, Kamera nie verdeckt
python3 tests/strecken3d_shots.py quer    # n19: Galerie-Fotos der neuen Teile (quer|hoch)
python3 tests/strecken3d_fahrt_shots.py quer  # n19: Fahrt-Fotos (Spirale, Überführung oben/unten, Klippenflug, Steilwand, Karte)
node tests/node/test_assists.mjs          # Fahrhilfen mit simulierten Spielern
node tests/node/test_reset.mjs            # Crash in Looping/Sprung/Wand: Reset +5 s bzw. Wrack; nie Endlosschleife
node tests/node/test_free_steer.mjs       # Leicht: Spieler-Vorrang, weiche Rückführung, Abkürz-Regel, Stunt-Ansage
node tests/node/test_fahrgefuehl.mjs      # Leicht mitlenken, Tempo-Regler, Linienfarben = Pedale, Mittel ohne Zwangsbremse, Haftung, Mittel n16 (Grenztempo, Spurhilfe), Mittel n23 (Grenztempo ≥ +20 %, 0–200 km/h, früherer Hinweis)
python3 tests/mittel2_shots.py            # n23: Mittel hoch+quer – Tacho = Physik bei Spieltempo 1,0, dynamische Linie langsam/normal/zu schnell, ?dynlinie=0, ?m=n16
node tools/mittel_probe.mjs --var=n16,neu --bot=mensch-handy,mensch-touch --sam=4   # Mensch-Bots (Handy, Touch-Daumen) vorher/nachher
node tools/mittel2_mess.mjs               # 0–200 km/h (Spielzeit/echte s), Kurvengrenztempo, Schwimmwinkel
node tools/breite_check.mjs               # breitere Fahrbahn: Überlappung benachbarter Abschnitte (STUNT_BREIT=alt = alte Breite)
node tools/fahr_analyse.mjs               # Bremsleistung Plan/Physik, Bremszeit + Zeitverlust je Ursache, Haftung (--root=Kopie)
node tools/linie_analyse.mjs --laps       # Ideallinie: Scheitel-Nutzung, Löser-Zeit, Autopilot-Runden auf allen Stufen
python3 tests/linie_shots.py              # Fotos: Linie mit Scheitel-Keilen, HUD-Ansagen (tests/shots/linie/)
python3 tests/smoke.py                    # Browser (Playwright, Pixel 7 quer), Screenshots nach tests/shots/
python3 tests/sound_levels.py             # Ton: Aufnahmen geladen, Pegel, Loop-Nähte, Rückfall auf den Synthesizer, ?snd=alt
python3 tests/ton_probe.py                # Ton offline gerendert alt/neu: Pegel, Übersteuerung, Handy-Filter; Hörproben ~/Downloads/Stuntbahn-Ton/
python3 tests/ton_cpu.py                  # CPU-Last des Tons: aus / alt / neu
python3 tests/test_race.py                # Rennen, Bestzeit nach Reload, Geist, Replay
node tests/node/test_mittel3.mjs          # n24: Mittel-Beschleunigung im Zielfenster, Gas-Rampe, Sprung-Hilfe, Landequote Bots, Schanzen-Hinweis, Bestzeiten
node tools/sprung_probe.mjs --seeds=7,8,9,10,11   # n24: Lippen-Tempo und Landungen (ok/weit/kurz) je Bot und Variante (--var=n23,n24, --pull=lo:10)
python3 tests/mittel3_shots.py quer       # n24: Mittel im Browser – Tempo nach 3 s, Schanzen-Hinweis, Sprung, ?m=n23 (quer|hoch)
python3 tests/schanze_shots.py quer . nachher   # n24: Schanze je Grafikstufe + Belagfarbe neutral (Wurzel/Name für Vorher-Fotos)
node tools/build_deck.mjs && node tools/build_ktx2.mjs metal   # n24: Schanzen-Belag aus dem CC0-Riffelblech neu bauen
node tests/node/test_drift.mjs            # n25: Fahrstil-Option, wo Brachial wirkt, Übernahme, Drift-Stellen, Drift-Regler, Regression (fester Seed, 8 Strecken), Kino-Replay-Drifts
node tools/drift_mess.mjs --seed=0        # n25: Leicht Sauber/Brachial auf 42 Strecken – Driftanteil, Drifts/Runde, Crashs, Rundenzeit, Schanzen (--set=spinP:1 …, --json, --sum)
python3 tests/drift_shots.py quer         # n25: Option, Drift-Fotoserien im Verfolger, Beinahe-Dreher, Cockpit, Kino-Replay (quer|hoch) → tests/shots/drift/
python3 tests/perf_drift.py 3 12          # n25: Bildrate Sauber gegen Brachial (Qualm-Partikel)
node tests/node/test_stuntgroesse.mjs     # n26: Stunt-Maße, Fenster erreichbar, keine Überlappung, Importe alt, Bestzeiten, ?stunt=1 = n25 bitgleich
node tools/stunt_masse.mjs                # n26: Maße + Tempo je Stunt (STUNT_STUNT=1 = bis n25; --json, --cmp=alt.json,neu.json)
node tools/stunt_check.mjs                # n26: Überlappung aller Stunt-Bauwerke (Feld, Lichtraum, Deko, Gelände) auf 613 Strecken
node tools/stunt_mess.mjs --seeds=1,2     # n26: Erfolgsquote je Stunt (Leicht Sauber/Brachial, Mittel-Handy, Original-Bot) auf 80 Strecken (--root=alter Stand, --sum=a.json,b.json)
node tools/stunt_quote.mjs 100            # n26: Prüffahrt flach/3D/Gelände je Stufe (ohne/mit Entschärfen)
python3 tests/stuntgroesse_shots.py quer  # n26: Fotos je Stunt (Verfolger + Fern; [Wurzel] [Name]) → tests/shots/stuntgroesse/, Collagen: python3 tools/stunt_collage.py
python3 tests/perf_stunt.py <vorher>      # n26: Bildzeit an den Bauwerken + Bildrate, vorher/nachher
node tests/node/test_gkraft.mjs           # n24: Show-Tacho (Monotonie, Fixpunkte, ab 250 echt) + G-Kräfte (Band, live = Replay, Untertitel)
node tools/gkraft_mess.mjs                # n24: G je Situation (Kurve, Looping, Landung, Flug, Stand); STUNT_G=echt ohne Show-Faktor
python3 tests/gkraft_shots.py quer        # n24: Fotos Cockpit Kurve/Landung, HUD, Replay, Kino-Replay mit G (quer|hoch|desktop)
python3 tests/perf_gkraft.py <vorher>     # n24: Bildrate vorher/nachher (Cockpit, Verfolger, Replay)
node tests/node/test_zielshow.mjs         # n27: Auslauf aufgezeichnet (Zeit/Geist/bitgleich), Jubel-Dreher auf der Fahrbahn, Pyro-Budget je Stufe, deterministisch, Zielbogen-Kamera
python3 tests/zielshow_shots.py quer 4711-3   # n27: Zielshow in Zeitlupe abfotografiert (Bestzeit, Leicht/Cockpit, Tippen überspringt) → tests/shots/zielshow/
python3 tests/fancam_shots.py quer 1234-3-g   # n27: Fan-Cam (3 Einstellungen), Kran, Bodenkamera, Heckkamera, Reißschwenk, Freeze-Frame → tests/shots/fancam/
python3 tests/cockpit_n27_shots.py quer   # n27: Cockpit gerade/Kurve/Tunnel/Einfach mit Draw-Calls, Spiegel, Tunnel-Abdunklung (quer|hoch|desktop)
STRESS=4 python3 tests/perf_zielshow.py <vorher> quer 2   # n27: Bildrate + Draw-Calls vorher/nachher (Rennen, Cockpit, nach dem Ziel, Film)
node tests/node/test_kinoreplay.mjs       # n18: Moment-Finder auf 5 Fahrten, Film-Regeln, Zeitlupe, Kameras gegen Strecke/Gelände (quer+hoch)
node tools/kinoreplay_probe.mjs           # n18: Kandidaten + Film je Fahrt anzeigen (--json=datei, --nur=0,2)
python3 tests/test_kinoreplay.py beide    # n18: Film nach dem Ziel, Überspringen, Highlights, Video, Balken, Fotos je Kamera (tests/shots/kinoreplay/)
python3 tests/perf_kinoreplay.py 3 '' quer   # n18: Bildrate Film gegen Rennen (mehrere Runden, Film ≥ 95 %)
python3 tests/test_touch.py               # Touch-Steuerung quer + hochkant, Knopfgrößen, Tastengröße, Bounding-Boxen, Layout
python3 tests/test_hochformat.py          # Drehen im Rennen (quer→hoch→quer), keine hängenden Finger, Neigen-Achse, Platz für 2 Knöpfe
python3 tests/hochformat_shots.py         # Fotos + Layout-Prüfung aller Bildschirme (pixel7 iphone14 klein | …q = quer)
python3 tests/hochformat_cam.py 4711      # Verfolger hoch vs. quer: Auto-Lage, Horizont, Strecke voraus (m)
node tests/node/test_tilt.mjs             # Neigen: richtige Achse je Bildschirm-Ausrichtung
python3 tests/test_reset_ui.py            # Totalschalter, „+5 s“, Strafen in Ergebnis/Replay, Bestzeit-Wertungen
node tests/node/test_cockpit.mjs          # Instrumente: Skalen, Vmax ≤ Tacho, Zeiger-Dynamik, Kulisse, Replay-Gang
python3 tests/test_cockpit_ui.py          # Cockpit: Kamera-Knopf, gespeichert, Wrack → Verfolger, Replay, 0 Fehler
python3 tests/cockpit_shots.py quer       # Cockpit-Fotos + Zeigerprüfung (quer|hoch|desktop|tablet) nach tests/shots/cockpit/
python3 tests/cockpit_sicht.py nachher    # Cockpit: Fahrbahn-Anteil, ab wie viel m, Horizont, Brett-Oberkante, Wackeln (hoch+quer)
python3 tests/stossstange_shots.py x      # Stoßstangen-Kamera: Anteil eigenes Auto im Bild (soll 0), Rennen + Replay
python3 tests/test_leicht_zeiten.py       # Leicht: keine Bestzeit/kein Geist, Zeiten-Liste; Mittel wertet wie bisher
node tests/node/test_leicht_zeiten.mjs    # Speicher: Bestzeiten einmalig gelöscht (n21, Alt-Profil), Leicht-Zeiten, Mittel, A/B wertet nicht
python3 tests/test_bestzeiten_reset.py    # n21 im Browser: Alt-Profil per add_init_script → gelöscht, Menü ohne alte Listen, Neuladen, A/B
node tests/node/test_wiese.mjs            # n21: Wiese ≤ 30 km/h, Abkommen 200/300 km/h, Rückweg aus Senken, ?wiese=alt
node tests/node/test_haftung.mjs          # n21: Bodenhaftung an Kuppen, Schanze unverändert, ?haft=alt
node tools/wiese_probe.mjs                # n21: Wiese messen (STUNT_WIESE=alt für vorher)
python3 tests/wiese_shots.py quer         # n21: Fotos Auto auf der Wiese mit Tacho (quer|hoch)
python3 tests/test_zoom.py                # kein Doppeltipp-Zoom: touch-action je Scrollbereich, Eingaben ≥ 16 px, Doppel-Taps
node tools/jump_measure.mjs               # Sprung-Messung: Scheitel, Airtime, Weite (--schanze alt = bis n19; --air 1 --lip 15 = bis 27.09.)
node tools/sprung_hindernis.mjs           # n21: jede Hindernis-Variante bei vmin/vbest/vmax, zu kurz = Crash, Dreiecke
node tests/node/test_sprung.mjs           # n21: Fenster/Scheitel/Flug, 6 Varianten überflogen, ?schanze=alt
python3 tests/sprung_hindernis_shots.py quer   # n21: Fotos je Variante (Strecke seitlich, Verfolger, Hubschrauber; quer|hoch)
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
node tests/node/test_kulissen.mjs 4       # n20: Kulissen in allen Themen (Abstand, Sprunglücken, Böschung), Strecke/Bestzeit-Schlüssel unverändert, Thema passend
node tools/kulissen_bitgleich.mjs [vorher] # n20: Strecken vorher/nachher Byte für Byte gleich (Wurzel = Stand vor n20)
python3 tests/kulissen_shots.py quer      # n20: Fotos je Thema (Start, Kurve mit Tribüne, Sprung, Horizont; quer|hoch)
python3 tests/kulissen_probe.py 4711-3-g land,alpen   # n20: schnelle Sichtprüfung je Thema (Start, Übersicht, Horizont)
python3 tests/perf_kulissen.py <vorher> gel,flach 0,1 auto,stadt,kueste   # n20: Bildzeit/fps vorher-nachher je Thema (PERF_DEV=big|desk)
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
Zielshow/Cockpit (n27): `?show=0` (nach dem Ziel ohne Show), `?kopf=0|2` (Kopfnicken im Cockpit aus/doppelt).
Cockpit: `?eye=0.45` (Augenhöhe in m über dem Auto-Ursprung), `?hz=0.32` (Horizont, Anteil der Bildhöhe von oben),
`?dash=0.7` (Oberkante Armaturenbrett, Anteil von oben), `?cpsusp=1` (Federungs-Ausgleich, 0,5 = Stand bis 28.09.).
`?auto=alt` (alte, langsamere Abstimmung bis 27.09.2026 zum Vergleich; wertet nicht).
`?snd=alt` (bisheriger Synthesizer-Ton statt der Aufnahmen, A/B).
`?grip=1` (Haftung und Ideallinie bis 28.09.2026 zum A/B-Vergleich; wertet nicht).
`?m=n16` (Mittel wie bis 02.10.2026, n16–n22: Spieltempo 1,25, ohne Traktionskontrolle/Schleuderschutz/Touch-Rampe, alter Hinweis – wertet nicht), `?breit=alt` (Fahrbahn so schmal wie bis n22: halbe Breite 5,6 statt 7,3 m – wertet nicht), `?dynlinie=0` (Ideallinie nur mit den festen Plan-Farben), `?mgrip=1` (Mittel wie bis 29.09.2026: Zug zur Ideallinie, weniger Haftung – A/B-Vergleich; wertet nicht). Messung: `MITTEL_BERICHT.md`.
`?lk=0…1` (Leicht: Anteil der Kurve, den der Spieler selbst lenkt, Standard 0.8; `?lk=0` = alte Schienen) und
`?lkband=3.5` (Leicht: Band um die Linie in m, in dem die Hilfe nicht zur Linie zieht – größer = mehr Treiben bei „Hände weg“).
`?stunt=1` (Stunt-Bauwerke wie bis n25, A/B, wertet nicht; erlaubt 1 … 2, Standard 1,6; in Node `STUNT_STUNT=1`).
`?welt=1` (alter, kleiner Weltmaßstab bis 27.09.2026 zum A/B-Vergleich, Standard 2 = Felder 40 statt 20 m;
erlaubt 1 … 2,5; andere Welt als 2 wertet nicht). In Node: `STUNT_WELT=1 node …`.

## Credits
- **Auto:** „Fictional supercar – V12 Goblin“ von **Olli Teittinen (ollitei)**, CC-BY 4.0 (Sketchfab), für das Spiel optimiert.
- **Himmel:** „Kloofendal 48d Partly Cloudy (Pure Sky)“ von Greg Zaal & Jarod Guest, Poly Haven, CC0; Landschafts-Themen (n20): 6 weitere Poly-Haven-Himmel, ambientCG-Böden und Poly-Haven-Pflanzen, alle CC0 (`assets/LICENSES.md`).
- **Texturen:** Poly Haven (CC0) – Rob Tuytel, Charlotte Baglioni, Rico Cilliers.
- **Umgebung:** Poly Haven (CC0) – Pflanzen, Felsen, Kies von Rico Cilliers, Rob Tuytel, James Ray Cock, Jenelle van Heerden, Kless Gyzen, Dimitrios Savva (Details in `assets/LICENSES.md`).
- **Bibliothek:** three.js (MIT).
- **Ton-Aufnahmen:** 13 CC0-Aufnahmen von freesound.org (Urheber und Links in `assets/LICENSES.md`).

Details: [`assets/LICENSES.md`](assets/LICENSES.md). Code, Bausteine, Physik, Ton-Synthese: eigene Arbeit.
Kein Code und keine Assets aus „Stunts“/„4D Sports Driving“ oder „Ultimate Stunts“ – nur die Spielidee.
