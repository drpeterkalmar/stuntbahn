# Stuntbahn n17 – „Kino-Look“: realistische Grafik und mehr Details (02.10.2026)

Peters Wunsch (28.09.): „Mehr Details und realistische Grafik, ich denke an Effekte wie Forza 6 mit DLSS 5.“ und „Generell
wäre eine Art DLSS-5-Effekt für alle Spiele cool.“

**Ehrlich vorweg:** Echtes DLSS 5 (NVIDIA, generatives Neural Rendering) braucht eine RTX-Grafikkarte und eine native
Engine-Anbindung – im Browser und am Handy geht das nicht. Der Kino-Look holt denselben *Eindruck* mit klassischen
Echtzeit-Techniken, die WebGL2 auf einem Mittelklasse-Handy schafft. **Ergebnis: Handy-Niveau mit Film-Anmutung, nicht
Konsolen-Niveau.**

## Kurz
- **Live:** https://drpeterkalmar.github.io/stuntbahn/ – Build **604499754c** (Commit f68ca0f), headless geprüft: Standard (Handy quer),
  Kino (Desktop) und `?look=alt` laden mit 0 Fehlern, 15 KTX2-Texturen, Übertragung 6,98 MB (gzip; unkomprimiert 9,28 MB).
- **Einstellung „Grafik“: Automatisch / Einfach / Standard / Kino** (Optionen). Handy startet mit Standard, Desktop mit Kino,
  die Automatik regelt nach Bildrate (zuerst Renderauflösung, dann Deko, dann Stufe). A/B per Link: `?look=0|1|2`,
  **`?look=alt` = Bild wie bis n22**, einzelne Stufen `?kl=-bloom,+ssao` (Namen siehe unten).
- **Ein Modul** `src/gfx/kinolook.js` (Szene/Kamera/Renderer rein, Bild raus), die n7-Bewegungsunschärfe ist darin
  aufgegangen (ein Szenen-Durchlauf, keine doppelte Kopie). Portierungs-Notiz: `KINOLOOK.md`.
- **Standard ist am Handy nicht teurer als bisher, beim Fahren sogar billiger** (gemessen bei hoher Pixelzahl, wo die GPU
  wie am Handy an den Pixeln rechnet: Stand 13,2 → 10,9 ms, Fahrt 17,9 → 11,8 ms). Trick: kleinere Renderauflösung +
  Hochskalieren mit Kantenglättung und Nachschärfen bezahlt die Effekte.
- **Budgets eingehalten:** M1 headless Standard Demo-Strecke quer **143 fps** (≥ 60), Erstladung **9,05 → 9,28 MB**
  (< 15), Draw-Calls **max. 89** auf normalen Strecken, 126 + 8 auf der 38-km-Archivstrecke (< 200).
- Alle Tests grün (Node 25/25, Browser-Tests, neuer `test_kinolook.py`), 0 Seitenfehler.

## Vergleichsfotos (gleiche Kamera, gleiche Zeit)
Collagen „Heute (bis n22) | Einfach | Standard | Kino“ – Handy quer (Pixel 7), Demo-Strecke:
`tests/shots/kinolook/vergleich_start.jpg`, `…_gerade.jpg` (mit Bewegungsunschärfe), `…_kurve.jpg` (Randdetails),
`…_looping.jpg`, `…_sprung.jpg` (Landung), `…_cockpit.jpg`, `…_hochformat.jpg`.
Dazu Gelände-Strecke 4711-2-g (`vergleich_gelaende_*.jpg`) und die n19-Teile aus der Galerie
(`vergleich_n19_teil_spiral|waves|wall|cliff|slope.jpg`: Spirale, Achterbahn-Wellen, Steilwand, Klippensprung, Steilabfahrt).
**Je Stufe ohne/mit** aus exakt demselben Bild: `tests/shots/kinolook/stufe_*.jpg`.

Selbst bewertet (Vision, jede Collage):
- **Realistischer?** Ja, am deutlichsten durch Farbkorrektur (Gras oliv statt neongrün, mehr Kontrast, warme Lichter/kühle
  Schatten), Luftperspektive (Hügel staffeln sich in die Tiefe), Fels mit Klüften, Asphalt mit Flicken und vergossenen
  Querrissen, Kontaktschatten und (Kino) Umgebungsverdeckung unter dem Auto, an Wänden und Leitplanken.
- **Matschig?** Nein – Standard rechnet mit 84 % der Auflösung, das Nachschärfen holt die Asphaltkörnung zurück (stufe_aa.jpg).
- **Überstrahlt?** Erste Fassung ja (weiße Linien/Zielkaro glühten, Schleier um die Sonne) → Bloom-Schwelle 0,9, Himmel
  zählt kaum, Sonnenglühen kleiner; jetzt nur noch ein leichter heller Hauch in Sonnennähe.
- **Banding?** Nicht sichtbar (Dither im Endbild, Himmelsverlauf glatt).
- Gefunden und behoben: Streifen in der Umgebungsverdeckung auf flachem Boden (Tiefe nicht an Texelmitte gelesen), ein
  gerader „Längsriss“ wirkte wie ein Strich auf der Straße (entfernt), Kiesbetten fast weiß wie Schnee (abgedunkelt,
  feinere Körnung), Rauch mit harter Kante am Boden (höher erzeugt), Kringel-Risse (durch gerade Querrisse ersetzt).

## Was jede Stufe bringt (Bild + Kosten)
Kosten = Unterschied der GPU-Bildzeit mit/ohne Stufe auf M1, gemessen bei 8,3 MP (1920×1080, Pixeldichte 2), damit die GPU an
den Pixeln rechnet wie ein Handy (bei Handy-Auflösung rechnet der M1 an der Latenz, ±1 ms Rauschen). Am Handy (Standard
rechnet ~0,6 MP) grob durch 5–6 teilen. Rohdaten `tests/out/n17/ablation_big2.txt` (lokal).

| Stufe (`?kl=-…`) | Bild | Standard | Kino | Kosten (8,3 MP) |
|---|---|---|---|---|
| Hochskalieren + Kantenglättung (FXAA-Art) + Nachschärfen (CAS-Art), `scale`/`aa`/`sharpen` | stufe_aa.jpg | 84 % Auflösung, kein MSAA | 100 %, MSAA 4×, nur Schärfen | spart 1,6 ms (Standard) |
| Farbkorrektur je Tageszeit + S-Kurve + Grün-Bremse, `grade` | stufe_grade.jpg | ✓ | ✓ | ≤ 0,3 / ~1 ms |
| Luftperspektive (Dunst nach Tiefe und Höhe, zur Sonne warm), `aerial` | stufe_aerial.jpg | ✓ | ✓ | im Rauschen |
| Bloom (¼-Auflösung, 3/4 Ebenen, Dual-Filter), `bloom` | stufe_bloom.jpg | ✓ | ✓ | 0,8 / 1,5 ms |
| Sonnen-Blendung, Lens-Flare, flacher Streifen, `flare` | stufe_flare.jpg | ✓ | ✓ | im Rauschen (vorher 3 ms, s. u.) |
| Vignette + Dither, `vignette`/`dither` | stufe_vignette.jpg | ✓ | ✓ | im Rauschen |
| Umgebungsverdeckung (½-Auflösung, 6/10 Abtastungen), `ssao` | stufe_ssao.jpg | – (zuschaltbar) | ✓ | 1,6 ms |
| Kontaktschatten unter dem Auto, `contact` | stufe_contact.jpg | ✓ | ✓ (auch Einfach) | 1 Draw-Call |
| Hitzeflimmern hinter den Endrohren (Start, Nitro), `haze` | stufe_haze.jpg | – | ✓ | im Rauschen |
| Bewegungsunschärfe (n7, jetzt in der Pipeline), `blur` | vergleich_gerade.jpg | ½-Auflösung | volle Auflösung | 1,0 / 12 ms bei 4K |
| Weiche statische Schatten (8 statt 4 Abtastungen) | – | – | ✓ | im Rauschen |

Material/Details (kein eigener Schalter, an mit Standard/Kino): Asphalt-Flicken mit Nahtkante und mit Bitumen vergossene
Querrisse (glänzen), großflächige Helligkeitsflecken gegen Kachel-Wiederholung, Randsteine mit abgeplatzter Farbe,
Gummiabrieb und Schmutz, Kies dunkler/feiner, Fels mit Klüften und Flechten. Effekte: Funken beim Schleifen und harten
Aufsetzen (glühen über den Bloom), dichterer, treibender Reifenrauch mit Wolkenstruktur, Staubwolken auf Wiese.

**Optimierung unterwegs:** Die Lens-Flare-Geister liefen in einer Schleife über ein Array – auf Apple-GPUs landet das im
langsamen Speicher (3 ms bei 8,3 MP). Ausgeschrieben + Sonnen-Sichtbarkeit in einem 1-Pixel-Durchgang: jetzt ~0 ms.

## Leistung und Budgets
GPU-Bildzeit Median (Szene angehalten), Handy-Profil = Pixel 7 quer (Stufe 0/1), Desktop 1280×720 (Stufe 2); „Fahrt“ mit
realistischer Unschärfe-Bewegung. fps = echte Bildrate im laufenden Rennen, headless mit entsperrter Bildrate (ohne
Entsperren drosselt headless Chrome auf ~10 fps). Rohdaten `tests/out/n17/perf_{vorher,nachher}.jsonl`.

| Strecke | Stufe | Stand heute → n17 | Fahrt heute → n17 | Draw-Calls | fps |
|---|---|---|---|---|---|
| Demo | 0 Einfach | 3,0 → 2,9 ms | 3,4 → 3,1 ms | 48 → 49 | 142 |
| | 1 Standard | 5,6 → 4,6 ms | 7,1 → 6,3 ms | 69 → 75 | 143 |
| | 2 Kino | 4,8 → 6,6 ms | 8,6 → 9,8 ms | 68 → 77 | 139 |
| Gelände 4711-2-g | 0 / 1 / 2 | 2,3 / 4,0 / 3,8 → 2,4 / 5,4 / 6,1 ms | 2,9 / 6,1 / 8,0 → 2,9 / 6,0 / 9,6 ms | max. 89 | ≥ 132 |
| 3D 4711-3-3d | 0 / 1 / 2 | 2,5 / 4,4 / 4,8 → 2,7 / 5,5 / 7,2 ms | 2,8 / 6,0 / 8,2 → 2,9 / 5,9 / 10,6 ms | max. 72 | ≥ 137 |

Handy-nah gemessen (8,3 MP, GPU rechnet an den Pixeln): **Standard Stand 13,2 → 10,9 ms, Fahrt 17,9 → 11,8 ms** (billiger als
heute); Kino 19,0 → 30,1 / 34,9 → 41,1 ms (Kino ist für starke Geräte; die Automatik senkt dort zuerst die Renderskala bis 70 %).

- **Handy-Profil Stufe 1:** Die Bildrate fällt nicht unter die bisherige Zielgrenze – Standard braucht bei Handy-Pixelzahl
  nicht mehr GPU-Zeit als heute, und die Automatik hält 58–60 fps mit der Renderskala (84 % → bis 62 %), bevor sie an Deko
  oder Stufe geht (Node-Test `test_quality_blur.mjs`). Kein echtes Handy gemessen (siehe Grenzen). Eine CPU-Drossel per
  Chrome-Entwicklertools bringt hier nichts (das Spiel ist GPU-begrenzt; gemessen eher höhere Bildrate, Messartefakt).
- **Stufe 0 bleibt so leicht wie heute** (2,4–2,9 ms, direktes Zeichnen wie bisher, nur der Kontaktschatten kam dazu).
- **M1 headless ≥ 60 fps Standard, Demo-Strecke quer:** 143 fps.
- **Erstladung:** heute 9,05 MB → **9,28 MB** (Kino-Look-Code 0,06 MB, KTX2-Texturen 2,97 MB statt 3,4 MB WebP, Basis-
  Transcoder 0,58 MB). Budget 15 MB.
- **KTX2/Basis lohnt sich für den Grafikspeicher:** 15 kachelnde PBR-Texturen bleiben auf der GPU komprimiert (ETC1S →
  ETC2/ASTC/BC) – rund **73 MB → ~18 MB** Grafikspeicher (RGBA8 + Mipmaps gegen 8 bit/Pixel), Download praktisch gleich
  (+0,17 MB inkl. Transcoder). Optisch gleich (geprüft im Vergleich WebP/KTX2). Atlanten (Pflanzen, Tannen) und Kies bleiben
  WebP. Rückfall auf WebP automatisch bzw. `?ktx=0`. Neu bauen: `node tools/build_ktx2.mjs`.
- **Draw-Calls:** Kino-Look +6…9 (Bloom-Ebenen, Verdeckung, Endbild, Sonne, Kontaktschatten, Funken); größter Wert normal 89,
  38-km-Archivstrecke im Überblick 126 (+ ~8) – unter 200.
- Tonemapping verglichen (AgX gegen Neutral, `?tm=agx`): AgX wirkt grauer/flauer, Neutral + eigene Farbkorrektur hat mehr
  Biss → **Neutral bleibt**.

## Technik (Kurzfassung)
- Szene → Render-Target in Renderskala (Tonemapping + sRGB schon im Material, 8 bit, Tiefe als Textur).
- Endbild in voller Bildschirmauflösung: kantenbewusstes Hochskalieren (bilinear + FXAA-artige Glättung entlang der Kante +
  kontrastadaptives Nachschärfen, eigener Code nach der Idee von FSR1/SGSR, kein Fremdcode – FSR1 wäre MIT, SGSR
  BSD-3, beides nicht übernommen), Hitzeflimmern, Unschärfe, Verdeckung, Luftperspektive, Bloom, Blendung, Farbkorrektur,
  Vignette, Dither. Das Cockpit wird danach scharf darübergelegt.
- Shader-Varianten je Stufe per `#define` – was aus ist, kostet nichts.
- Funken-Ort/-Normale aus der Physik (`car.scrapeP`, nur aufgezeichnet, ändert die Physik nicht; alte Codes bitgleich).

## Tests
- `npm run test:node`: 25/25 grün (inkl. erweitertem `test_quality_blur`: Renderskala vor Deko vor Stufe).
- Browser (nacheinander, GPU/Metal): `test_kinolook.py` (neu: Stufen per URL/Einstellung, `?look=alt`, `?kl=`, dynamische
  Auflösung, Kontaktschatten im Sprung aus, Bild plausibel, Draw-Calls, Hochformat, KTX2 geladen), smoke, test_blur,
  test_hochformat, test_fx, test_cockpit_ui, test_extras_ui, test_race, test_touch, test_reset_ui, test_lineviz – alle grün,
  0 Seitenfehler. `test_touch` maß die Auto-Fläche über `Box3.setFromObject` und zählte den neuen Kontaktschatten mit
  (Auto „zu groß“ → Tasten überdecken es) – Test misst jetzt ohne Effekt-Objekte wie das Spiel selbst. `test_hochformat`
  lief einmal in einen Zeitüberlauf beim Antippen von „▶ Weiter“ (Karte noch in der Einblendung), danach 2× grün. perf_optik, perf_gelaende, perf_welt, perf_gross, optik_shots, optik_detail: laufen ohne Fehler (Zahlen oben).
  perf_ablation braucht SwiftShader (CPU-Rasterung) und wurde nach der Headless-Regel nicht gestartet.
- Werkzeuge: `tests/kinolook_shots.py` (Fotos gleiche Kamera/Zeit), `tests/kinolook_collage.py`, `tests/kinolook_stufen.py`,
  `tests/perf_kinolook.py` (`PERF_DEV=big` für die Pixel-Messung).

## Ehrliche Grenzen
- **Handy-Niveau, nicht Konsole:** keine echten Spiegelungen, kein Raytracing, keine Volumenwolken, kein temporales
  Upscaling (TAA/DLSS bräuchte Bewegungsvektoren je Objekt und flimmert ohne gute Zusatzdaten). Bäume/Büsche bleiben Karten
  (n7), von oben erkennbar.
- **Kein echtes Handy gemessen.** M1 bei Handy-Auflösung ist latenz- statt pixelbegrenzt; die 8,3-MP-Messung ist eine
  Näherung für ein pixelbegrenztes Handy. Bitte am Handy prüfen (unten).
- Schatten: keine Kaskaden. Der statische Sonnenschatten ist weiter eine einmal gerenderte Karte über die ganze Strecke
  (2048/4096), auf Kino weicher gefiltert; scharf ist nur der Echtzeit-Schatten des Autos. Eine Nah-Kaskade hätte jedes Bild
  die Strecke und tausende Deko-Instanzen ein zweites Mal gezeichnet – zu teuer für Stufe 1.
- Cockpit-Innenraum wird ohne Farbkorrektur darübergelegt (sonst würden Unschärfe/Dunst ihn erfassen).
- Weiche Partikel (Rauch, der weich am Boden ausläuft) bräuchten die Tiefe während des Szenen-Durchlaufs – nicht drin.
- Bloom arbeitet auf dem 8-bit-Bild (nach dem Tonemapping) – einfacher und Handy-schonend, aber weniger „HDR“ als in Forza.
- Nur eine Tageszeit (HDRI „Kloofendal“ Mittag); weitere Farbkorrekturen (morgen/abend/nacht) sind für andere Himmel/Spiele
  vorbereitet.

## Portierungs-Plan für die anderen Spiele
Details und Checkliste: `KINOLOOK.md`.

| Spiel | Aufwand | Was |
|---|---|---|
| Bandenkick (three.js, Neutral) | ½–1 Tag | Modul einhängen, Dunst/AO auf Fußballplatz-Maßstab, Kontaktschatten unter Spielern und Ball |
| Schmetterlingswiese (three.js, eigene Toon-Post-Kette) | 1–2 Tage | eigene Bloom/DoF-Kette durch das Modul ersetzen oder nur Hochskalieren + Grade übernehmen |
| Koboldkeller, Bären-Beautysalon (Canvas 2D) | je 1–2 Tage | **eigene 2D-Variante**: WebGL-Overlay bekommt das 2D-Bild als Textur → Grade, Bloom, Vignette, Dither (ohne Tiefe: kein Dunst/AO) |
| Spielebox (DOM) | lohnt nicht | – |

## Bitte am Handy prüfen
1. Strecke des Tages auf **Grafik Automatisch**: flüssig wie vorher? Fühlt es sich realistischer an?
2. Direkt vergleichen: `https://drpeterkalmar.github.io/stuntbahn/?look=alt` (bis n22) gegen ohne Zusatz (Kino-Look).
   Stufen einzeln: `?look=0`, `?look=1`, `?look=2`.
3. Grafik „Kino“ am Handy: ruckelt es? (Dann bleibt Standard die richtige Wahl fürs Handy.)
4. Gefällt die Farbe (Gras oliv, mehr Kontrast) – oder lieber bunter? Ein einzelner Schalter, z. B. `?kl=-grade`, zeigt den
   Unterschied.
