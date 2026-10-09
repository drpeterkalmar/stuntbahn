# Stuntbahn n32 – Wetter, Tageszeit (Abend/Nacht), schönere Kulissen und Zuschauer (09.10.2026)

Peters Wunsch (08.10.): „Regen- und Schneewetter (fürs Erste nur Kosmetik), mehr und schönere Kulissen und Zuschauer.“
Nachtrag (09.10.): Nachtmodus mit Flutlicht, Scheinwerfern, Lichterketten; Abend als Golden Hour.
**Alles ist nur Optik:** Physik, Grip, Autopilot, Strecken und Bestzeit-Schlüssel sind unverändert (47/47 Strecken bitgleich,
alte Codes 249/249 identisch, alle 45 Node-Tests grün). Version **0.5.0**, live: https://drpeterkalmar.github.io/stuntbahn/

## Kurz – was du am Handy siehst
- **🌦️ Wetter** (Menü, neben „Landschaft“): Passend (Standard: meist klar, je Strecke manchmal Regen oder Schnee – Schnee nie
  in Wüste/Küste/Land/Stadt), Klar, Regen, Schnee. Die Wahl bleibt gespeichert.
  - **Regen:** Regenstreifen (bei Fahrt schräg gezogen), grauer Wolkenhimmel, dichter Dunst, **nasse Fahrbahn** mit Glanz in
    den Spurrinnen und kleinen Pfützen, Gischt hinter den Reifen ab ~60 km/h, Spritzer an den Randsteinen, Tropfen auf
    Scheibe (Cockpit) und Linse (Stoßstange), leises Regenrauschen.
  - **Schnee:** Schneefall, verschneite Wiesen, Bäume und Dächer, Matsch und Schneewall am Fahrbahnrand, helle
    Reifenspuren neben der Strecke, Auspuffdampf, kühles Licht.
- **🕒 Tageszeit** (Menü, daneben): Passend (meist Tag, manchmal Abend oder Nacht), Tag, Abend, Nacht.
  - **Abend:** tiefe, warme Sonne, lange Schatten, Abendrot am Horizont, Lichter schon an.
  - **Nacht:** Sternenhimmel mit Mond, Flutlichtmasten mit Lichtinseln, **Streckenlaternen alle ~80 m**, Scheinwerfer am Auto
    (dreht im Looping mit), rote Rücklichter, **Lichterketten** an Looping, Röhre, Korkenzieher und Schanzen, Leitpfosten,
    die im Scheinwerferlicht aufleuchten, beleuchtete Tribünen, Start/Ziel, Zelte, Hütten und Lagerfeuer, Fenster in der
    Stadt. **Nacht + Regen:** die nasse Fahrbahn spiegelt die Lichter als lange Streifen – das Ziel-Bild.
- **Kulissen:** Zuschauer stehen jetzt in der Nähe als **3D-Figuren** (jubeln, schwenken Fahnen, blitzen mit dem Handy bei
  Sprüngen, sitzen beim Picknick) mit Schatten am Boden, in Kleidung wie auf echten Tribünen; weiter weg bleiben die
  Bildkarten. Fangzäune vor den Zuschauern, Bandenreihen an Stunts und am Start, **Startaufstellung, Startampel (zählt den
  Countdown mit), Boxenmauer, Rennleitungsturm, Großbildleinwand**, zwei neue Tribünen-Bauformen (Stahl mit Dach, offene
  Alu-Tribüne), **Event-Gelände** je Landschaft (Zelte, Foodtrucks, Sonnenschirme, Parkplatz mit Autos, Riesenrad oder
  Hüpfburg, Strandbar an der Küste, Après-Ski-Hütte in Alpen/Winter), Picknick an Hängen, Pyro an Stunts.
- **Leistung:** hochkant so schnell wie vorher, quer +3 bis +7 % (0,2–0,4 ms, im Messrauschen). Abschnitt 4.

## A/B-Links
| Link | zeigt |
|---|---|
| https://drpeterkalmar.github.io/stuntbahn/?wetter=regen | Regen (`=schnee`, `=klar` = Bild wie bis n31) |
| https://drpeterkalmar.github.io/stuntbahn/?zeit=nacht | Nacht (`=abend`, `=tag` = wie bisher) |
| https://drpeterkalmar.github.io/stuntbahn/?zeit=nacht&wetter=regen | Nacht + Regen (Spiegelungen) |
| https://drpeterkalmar.github.io/stuntbahn/?zeit=abend&thema=wueste | Golden Hour in der Wüste |
| https://drpeterkalmar.github.io/stuntbahn/?kulisse=alt | Kulissen-Planung genau wie bis n31 |
| https://drpeterkalmar.github.io/stuntbahn/?fans3d=0 | Zuschauer nur als Bildkarten |
| https://drpeterkalmar.github.io/stuntbahn/?zeit=nacht&wetter=regen&spiegel=0 | Nacht + Regen ohne Licht-Spiegelungen (`=1 … 4`) |
| https://drpeterkalmar.github.io/stuntbahn/?wetter=klar&zeit=tag&kulisse=alt | ungefähr der Stand vor n32 |

URL-Regler werten (kein A/B-Zusatz) – Wetter und Tageszeit ändern weder Strecke noch Bestzeiten. Handy: App einmal ganz
schließen und neu öffnen (neuer Service Worker).

## 1. Ablauf
1. **Vorbau** (Leicht-Spur `stuntbahn-n32-wetter-kulissen-vorbau`, ohne Browser, 4 Commits auf
   `vorbau/stuntbahn-n32-wetter-kulissen`): Wetter (E1) und Kulissen-Planung/-Zeichnen (E2) fertig, nur mit Node-Tests geprüft.
   Übergabe `VORBAU_stuntbahn-n32-wetter-kulissen.md` – hier eingearbeitet (Abschnitt 2 und 3), Datei entfernt, Branch gelöscht.
2. **Vorher-Messung** auf main 0091793 vor dem Merge (`tests/perf/2026-10-09_n32_vorher_hoch.json`, `_quer.json`), dazu eine
   git-archive-Kopie in `tests/out/n32/vorher` für alle Wechsel-Messungen und Bildvergleiche.
3. Merge `--no-ff` – **keine Konflikte**. Node-Tests 44/44 grün, 47/47 Strecken bitgleich.
4. Abnahme im Browser Etappe für Etappe, jeweils korrigiert, committet, gepusht, live geprüft:
   E1 Wetter (ad9b0a3) → E2 Kulissen (50ca05f) → Tageszeit (bc34428) → Leistung (1f4736b) → Abschluss.
5. Alle Test-Browser laufen jetzt stumm (`--mute-audio` in `tests/util.py` und `tests/perf_gate.py`).

## 2. Etappe 1 – Wetter: Abnahme und Korrekturen
| Vorbau-Teil | Befund im Browser | Korrektur |
|---|---|---|
| Regenstreifen (Teilchen-Art 4) | **unsichtbar**: Vierecke lagen je nach Richtung mit der Rückseite zur Kamera (weggeschnitten); dazu Kasten um die Kamera zentriert – die untere Hälfte steckte im Boden, vor der Landschaft kam fast nichts an; zu dünn/blass | beidseitig zeichnen, Regen-Kasten 40 × 14 m nach oben versetzt (Boden bis über das Auto), 3000 Streifen (Kino; Standard 60 %, Einfach 12 %), breiter und heller, Belichtung 0,07 s |
| Nasse Fahrbahn / Pfützen | Pfützen riesig und hellblau (wie verschütteter Lack/Eis) | kleine Lachen fast nur in den Spurrinnen, Asphalt dunkler mit Glanz in den Spurrinnen, Pfützen leicht unruhig statt Spiegel |
| Gischt | kaum zu sehen | doppelt so viele, größere Teilchen |
| Nebel/Himmel | Herbst und Winter liefen bei Regen/Schnee ins Weiße; Wüste/Stadt mit grell glänzendem Sand | Nebel-Untergrenze für dichte Themen, Luftperspektive schwächer (×1,6 statt ×2), nasses Gelände weniger glänzend; Himmel bei Regen dunkler |
| 3D-Zuschauer-Shader | **Übersetzungsfehler** (`vColor` ist in three r186 ein vec4) | `vColor.rgb = …` |
| Klar | – | Bild **pixelgleich** wie main in allen 7 Landschaften (max. 4/255; `tests/wetter_klar_gleich.py`) |
| Menü | drei, jetzt vier Knöpfe in einer Zeile, hoch und quer ohne Umbruch | – (`tests/wetter_menu.py`: Wahl wirkt, gespeichert, gilt nach Neuladen, URL hat Vorrang) |

Nicht gemacht: Scheibenwischer, Atemdampf der Zuschauer, eigene Wolkentextur (die vorhandene Wolkenschicht wird dichter),
die Oktaeder-Bäume bekommen Schnee über das vorhandene Themen-Uniform.

## 3. Etappe 2 – Kulissen und Zuschauer: Abnahme und Korrekturen
Die alten Vision-Befunde (n20) am aktuellen Stand geprüft: Konfetti-/Pappaufsteller-Zuschauer, Kasten-Tribünen, Bodengruppen
ohne Absperrung, Start ohne Event-Charakter, unscharfe Werbung, wenig Leben – alle sechs galten noch; der Vorbau adressiert sie.

| Teil | Befund | Korrektur |
|---|---|---|
| Farben aller neuen Bauten und Figuren | Bonbon-Look: Werte als sRGB gemeint, aber linear verwendet (Dunkelblau wurde Hellblau, Grau fast Weiß) | Umrechnung sRGB → linear für alles Neue |
| 3D-Zuschauer | Klötzchen in Regenbogenfarben | Kleidung wie auf echten Tribünen (viel Dunkel/Neutral, dazu Team-Farben), Jeans/Schwarz/Khaki, Schultern breiter als die Taille, natürliche Hauttöne |
| Geparkte Autos | zwei Kästen | Silhouette (Limousine, Kombi, Kleinwagen) mit Fensterband und Rädern, ~70 Dreiecke |
| Zelte | knallblau | meist weiße Pavillons, einzelne rot/blau/gelb |
| Tribüne „Stahl mit Dach“ | Dachplatte von unten unsichtbar (Unterseite fehlte) | Dachplatte und Blende mit Unterseite |
| Startampel am Portal | 90° verdreht (nur Schmalseite sichtbar) | quer über der Fahrbahn; zählt im Countdown 1 … 5 rote Lichter, dann grün |
| Rennleitungsturm/Leinwand | fehlten auf ~1/3 der Strecken (feste Kandidaten-Plätze) | mehr Ausweich-Plätze: Turm auf 54 statt 43 von 63 Strecken |
| Leistung Standard | +0,3–0,4 ms: der Grafikchip rechnete alle 480 Figuren, auch ausgeblendete | **Vorauswahl auf der CPU** (nur Figuren in Sichtweite im Zeichenpuffer, Hochladen nur bei geänderter Auswahl), Banden-Werbung und Fangzaun in die bestehenden Meshes, Startaufstellung ins Bauten-Mesh, Leinwand unbeleuchtet |

Weiter offen (Vorbau-Liste): Dachterrassen in der Stadt nur mit Leuten (ohne Geländer/Möbel), „mehr Fernkulisse, wo es leer
wirkt“ nicht angefangen, Turm/Leinwand/Riesenrad ohne Fern-Silhouette, Tribünen sitzen weiter als Bildkarten.
Zuschauer-Modell: **eigene prozedurale Figur** (0 KB, keine Lizenzfrage; Animation im Shader). Kenney „Mini Characters“
bzw. Quaternius (CC0) wären stilisiert – in n20 wurden Kenney-Palmen als „Spielzeug“ verworfen.

## 4. Tageszeit (Nachtrag 09.10.)
**Technik:** `src/track/zeit.js` (Auswahl, Werte, rein rechnend), `src/gfx/zeit.js` (Anwenden, Licht-Karte, Leuchtpunkte,
Spiegelungen). Die Tageszeit liegt **unter** dem Wetter: erst Licht/Himmel der Tageszeit, darauf das Wetter.
- **Abend:** Licht aus derselben Himmelsrichtung wie die Sonne des Themas, 7° hoch, warm; Sonnenschatten der Strecke werden
  neu gebacken; Abendrot und Sonnenscheibe im Himmels-Shader; der Sonnenfleck des Himmelsbilds wird gedämpft.
- **Nacht:** Himmelsbild abgedunkelt + Sterne + Mond im Himmels-Shader, Mondlicht (Sonne × 0,11, kühl), Umgebungslicht × 0,07.
  **Flutlicht ohne Dutzende Lichter:** eine gebackene Licht-Karte (512², beim ersten Abend/Nacht ~10 ms) mit allen Pfützen
  (Masten, Laternen, Tribünen, Start/Ziel, Zelte, Hütten, Lagerfeuer); jedes Material addiert sie. Leuchtpunkte in **2
  Draw-Calls** (≈500 Punkte + ≈1100 Kettenlichter auf der Galerie). **Ein** echtes Licht: der Scheinwerfer (SpotLight am Auto,
  dreht im Looping/kopfüber mit). Spiegel-Streifen auf nasser Fahrbahn: die 4 nächsten hellen Lichter (Standard 2), ihre Lage
  im Blickraum rechnet die CPU.
- **Lesbarkeit:** Laternen alle ~80 m, Ideallinie ×1,6 heller, Leitpfosten leuchten im Scheinwerferlicht. Gemessene mittlere
  Helligkeit der Fahrbahn vor dem Auto (0 … 1, Ausschnitt im Bild): Nacht Verfolger 0,12–0,15, Cockpit 0,09–0,17;
  Nacht + Regen 0,20–0,39; Abend 0,10–0,27; Tag (Regen) 0,28. Nirgends Absaufen ins Schwarz.
- **Automatik:** bei „Deko sparsam“ gehen zuerst die Lichterketten und die Spiegelungen aus; auf „Einfach“ keine Lichterketten.
- **Geprüft:** Abend/Nacht/Nacht + Regen in allen Landschaften (quer), Cockpit, hochkant, Looping kopfüber (Lichterketten,
  Scheinwerfer), Zielshow mit Feuerwerk im Regen und Highlight-Film nachts (0 Fehler). Eigene Bewertung der Bilder:
  „stimmungsvolle Nachtrennen-Optik, Strecke klar lesbar“ **8/10** (Abzug: Cockpit nachts recht hell, Lichtpfützen
  gleichförmig rund). `tests/node/test_zeit.mjs` (55 Prüfungen), Tag = pixelgleich wie vorher.
- Korrekturen unterwegs: Scheinwerfer-Punkte waren von hinten durchs Auto zu sehen (jetzt nur von vorn), Lichterketten lagen
  zuerst am Start (falsche Teile-Zuordnung) und dann hinter den Looping-Seitenwänden, Start nachts taghell (Pfützen ×0,6),
  Scheinwerfer-Fleck im Looping überbelichtet (flacherer Abfall), Mond/Abendsonne zu groß.

## 5. Messwerte (Mess-Gate Handy-Profil, Wechsel-Modus gegen main, Median aus 3 Runden, p95 in ms)
| Szene | Gerät | vorher | nachher | Δ |
|---|---|---|---|---|
| Rennen Kino | hoch | 10,9 | 10,8 | −1 % |
| Cockpit Kino | hoch | 16,3 | 15,5 | −5 % |
| Rennen Standard | hoch | 5,5 | 5,5 | ±0 |
| Rennen Einfach | hoch | 3,8 | 3,8 | ±0 |
| Replay Kino | hoch | 10,5 | 10,4 | −1 % |
| Rennen Automatik | hoch | 10,8 | 9,5 (zweiter Lauf; erster +11 %) | streut mit der Wahl der Automatik |
| Rennen Kino | quer | 11,3 | 11,8 | +4 % |
| Rennen Standard | quer | 5,8 | 6,0–6,2 | +3 bis +7 % |

Dieselbe Variante streut zwischen zwei Läufen ±5 %; mit ausgeblendeten neuen Kulissen bleibt quer +2 %. Kosten der Extras
gegen „Tag/Klar“ auf dem neuen Stand: Regen +2 %, Schnee +3–6 %, Nacht +3–5 %, **Nacht + Regen +5 %** (anfangs +37 % – die
Spiegelungen wurden umgebaut), Cockpit mit Regen +1 %.
Ein Fund unterwegs: schon **übersprungener** Nacht-Code in allen Materialien kostete tagsüber ~0,5 ms → er wird jetzt nur
bei Abend/Nacht in die Shader eingebaut (das Umschalten übersetzt die Materialien einmal neu).
- **Draw-Calls** größte Strecken (Kino): Rennen höchstens 152–156, Überblick 159–162 (auch Nacht + Regen), LONG_GO2.TRK ≤ 140.
  Grenze 200 ✅.
- **Ladegröße:** Erstladung 9,98 MB roh / **7,10 MB gzip** (vorher 9,84 / 7,04), Themen-Pakete unverändert (≤ 2,5 MB),
  **keine neuen Assets** (alles im Spiel erzeugt) ✅.
- Dateien: `tests/perf/2026-10-09_n32_*.json`. Ein echtes Handy habe ich nicht gemessen (Mac M1, CPU ×4 gedrosselt).

## 6. Fotos (selbst angesehen)
`tests/shots/n32/`: `kulissen_start_quer.jpg`, `kulissen_kurve_quer.jpg`, `kulissen_sprung_quer.jpg` (je Landschaft vorher/
nachher), `kulissen_hoch.jpg`, `kulissen_nah_quer.jpg` (Figuren, Jubel, Picknick, Tribünen, Ampel, Turm, Leinwand,
Event-Gelände), `wetter_themen_quer.jpg` (7 Landschaften × Klar/Regen/Schnee), `wetter_kameras_quer.jpg`, `wetter_hoch.jpg`,
`zeit_themen_quer.jpg` (Abend, Nacht, Nacht + Regen, Cockpit je Landschaft), `zeit_details_quer.jpg` (Start nachts, Looping
mit Lichterketten, Zielshow/Film), `zeit_hoch.jpg`.
Ehrlich: Die Sprung-Fotos (Schluchtsprung von hinten) zeigen kaum Unterschied; die neuen Zuschauer/Banden stehen dort
außerhalb des Bildausschnitts. „Forza statt Baukasten“ ist bei den Bauten erreicht, soweit Kästen es erlauben – Hüpfburg,
Hütten und Zelte bleiben einfache Formen.

## 7. Lizenzen
Keine neuen Fremd-Assets. Zuschauer, Tribünen-Formen, Event-Bauten, Ampel, Turm, Leinwand, Laternen, Regen, Schnee,
Nachthimmel, Licht-Karte: eigene Arbeit, im Spiel erzeugt. Regengeräusch synthetisch. Credits im Spiel ergänzt.

## 8. Worauf du am Handy achten sollst
1. `?zeit=nacht&wetter=regen` und Cockpit-Kamera: Spiegel-Streifen auf der Fahrbahn, Tropfen auf der Scheibe – ruckelt es?
2. Ist die Strecke nachts im Verfolger gut genug lesbar (Laternen, Linie, Leitpfosten)? Ist das Cockpit nachts zu hell?
3. Regen tagsüber: Sind die Streifen zu dicht/zu hell? Pfützen glaubwürdig?
4. Zuschauer aus der Nähe (Start, Stunts): wirken sie wie Menschen oder wie Figuren?
5. Menü hochkant: vier Knöpfe in der Zeile „Strecke laden / Landschaft / Wetter / Tageszeit“ – gut tippbar?
