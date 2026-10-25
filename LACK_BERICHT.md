# n40 Lack – Autos wieder fotorealistisch (Variante D)

Anlass (Peter 22.10.2026): „Autos sehen derzeit aus wie Comiczeichnungen, früher waren sie photorealistischer.“
Peter wählte Variante **D = `?reflex=0&hdr=1k`**, „wenn es nicht zu viel Leistung kostet“.

## Kurz für Peter
Der Comic-Look kam von der Lack-Spiegelung, die am 08.10. auf der Grafikstufe „Kino“ dazukam. Sie hat rosa-weiße
Glanzflächen und helle Kanten über das ganze Auto gelegt. Jetzt ist sie standardmäßig aus und das große Himmelsbild ist
wieder an, die Autos sehen aus wie am 07.10. Das kostet nichts: Kino läuft sogar 14–19 % flüssiger, und die App lädt beim
Start etwa 0,5 MB mehr.

## 1. Beleg: gleiche Szene, fünf Stände

Szene: Strecke `4711-3-g` (Gelände, Alpen), Tag, klar, Grafik fest auf Kino (`q=2`), Autopilot, Verfolgerkamera,
Startaufstellung und Fahrt nach 9 s (212 km/h). Browser **WebKit mit iPhone-15-Emulation** (wie beim Befund von
Mac-Hermes), hoch und quer, Anzeigen ausgeblendet. Je Bild das Gesamtbild und darunter eine Nahaufnahme des Autos
(Ausschnitt um die projizierte Auto-Hülle). Der Stand vom 07.10. ist `git archive 49c8d3c` und läuft vom selben Server.
Skript: `tests/lack_vergleich.py`.

| Collage | Inhalt |
|---|---|
| `tests/shots/lack/vergleich_kino_webkit_quer.jpg` | 07.10. / vor n40 / B `reflex=0` / C `hdr=1k` / D beides, quer |
| `tests/shots/lack/vergleich_kino_webkit_hoch.jpg` | dasselbe hochkant |
| `tests/shots/lack/vergleich_nah_fahrt_quer.jpg` | Nahaufnahme in der Fahrt groß: 07.10. / vor n40 / D |
| `tests/shots/lack/vergleich_standard_webkit_quer.jpg` | Grafik „Standard“: 07.10. / vor n40 / C / D |
| `tests/shots/lack/vergleich_kino_n40_webkit_quer.jpg`, `…_hoch.jpg` | nach dem Umbau: 07.10. / vor n40 / D / neuer Standard ohne Zusatz |

**Was man sieht (Kino):** Vor n40 hat der Lack große rosa-weiße Glanzflächen auf Dach, Heck und Kotflügeln und hell
leuchtende Kanten wie ein Umriss – der Spielzeug-Look. B und D sehen wieder aus wie am 07.10.: tiefes Rot, dunklere
Flächen, kleine Glanzpunkte. C (nur großes HDR, Spiegelung an) sieht aus wie vor n40.

Zahlen aus dem Auto-Ausschnitt (quer, Fahrt):

| Stand | mittlere Farbe RGB | Anteil sehr heller Pixel (> 200) | Rot-Anteil |
|---|---|---|---|
| 07.10. | 71 / 60 / 78 | **2,6 %** | 20,8 % |
| vor n40 | 90 / 82 / 97 | **9,6 %** | 18,9 % |
| B `reflex=0` | 79 / 64 / 83 | 3,0 % | 26,4 % |
| C `hdr=1k` | 90 / 82 / 97 | 9,7 % | 19,1 % |
| D beides | 79 / 64 / 83 | 3,0 % | 26,7 % |

**Ergebnis:** D kommt dem 07.10. am nächsten (gleichauf mit B). Die eigentliche Ursache ist die **dynamische
Lack-Spiegelung** aus n30 (`src/gfx/kern/reflex.js`): Ihr Würfel zeigt den Himmel als 8-bit-Bild mal 3 (damit das Auto
mit Spiegelung nicht dunkler wirkt) und die helle Strecke; das legt sich als milchiger, leicht rosa Glanz über den ganzen
Klarlack. Das kleine Himmelsbild (HDR-Diät) macht für sich keinen sichtbaren Unterschied (C ≈ vor n40, D ≈ B). Ein
Bisect war deshalb nicht nötig.

**Standard-Stufe:** Dort war die Spiegelung schon immer aus – alle vier Stände sehen gleich aus wie am 07.10. (Collage
`vergleich_standard_webkit_quer.jpg`). Der Comic-Look betraf also nur Geräte auf „Kino“ (das ist die Startstufe, also
auch das iPhone).

Was bleibt anders als am 07.10. (gewollt, kein Lack): leuchtende Rücklichter/Bremslichter (n28 Etappe 3, kam am 07.10.
abends), Banden, Startampel und Minikarte.

## 2. Umbau (Variante D als Standard)

- `src/main.js`: Lack-Spiegelung standardmäßig **aus** (kein Würfel, kein Shader-Zusatz, keine Vorwärm-Runde).
  `?reflex=1` = wie bis 0.12.2 (nur Kino), `?reflex=standard` = auch auf Standard (früher `?reflex=1`).
- `src/gfx/env.js`: Umgebungs-HDR wieder **1024×512 mit Float** als Standard; `?hdr=512` = n30-Diät (512×256,
  Halbfloat). Die Sonne wird zur Laufzeit wie am 07.10. bei Leuchtdichte 4 gekappt – das war schon damals so (sonst
  steckte die Sonne doppelt im unbeschattbaren Umgebungslicht). Der Unterschied zur Diät ist die Auflösung: die Spiegel-
  Stufen des Klarlacks sind doppelt so scharf, der Sonnenfleck wird nicht erst verkleinert und dabei verschmiert.
- `tools/update_sw.py`: vorab gecacht wird jetzt `assets/hdr/sky_1k.hdr` statt `sky_512.hdr`; neue Service-Worker-
  Version. Themen-HDRs weiter erst beim ersten Abruf. `tools/ladegroesse.py` zählt die 1k-Themen-HDRs.
- Prüfung, dass der neue Standard wirklich D ist: Bild „neu (ohne Zusatz)“ gegen „D“ weicht im Mittel 0,6–3,8 von 255 ab
  – das ist das normale Rauschen zwischen zwei Läufen derselben Variante (0,7–6,0; Teilchen, Gras, Wolken).
- Nebenbei: `tests/perf_gate.py` ließ jeden per `open` gestarteten Mess-Browser offen (ein einzelnes TERM direkt nach
  `Browser.close` verpuffte). Jetzt wiederholt, zuletzt KILL – nach jeder Messung bleiben 0 Browser übrig.

## 3. Leistung

Mess-Gate `tests/perf_gate.py`, Handy-Profil (CPU ×4, DPR 2,6), A/B im Wechsel, 3 Runden je Variante (Median),
**3 Gegner** (`gegner=3&staerke=ebenbuertig`), Szenen aus `tests/perf_szenen_gegner.json`. vorher =
`&reflex=1&hdr=512` (= Standard bis 0.12.2), nachher = neuer Standard ohne Zusatz. Ergebnisse `tests/perf/2026-10-25_n40_*.json`.

| Szene | Gerät | p95 vorher | p95 nachher | Änderung | Draw-Calls vorher → nachher |
|---|---|---|---|---|---|
| Rennen Mitte Kino | hoch | 10,4 ms | 8,4 ms | **−19 %** | 113 → 101 |
| Start im Pulk Kino | hoch | 9,7 ms | 8,3 ms | **−14 %** | 107 → 107 |
| Rennen Mitte Kino | quer | 10,5 ms | 8,8 ms | **−16 %** | 123 → 112 |
| Start im Pulk Kino | quer | 10,7 ms | 8,7 ms | **−19 %** | 132 → 120 |
| Rennen Mitte Standard | hoch | 7,3 ms | 7,1 ms | −3 % | 97 → 100 |
| Start im Pulk Standard | hoch | 6,9 ms | 7,0 ms | +1 % | 104 → 106 |
| Rennen Mitte Standard | quer | 7,2 ms | 7,1 ms | −1 % | 108 → 108 |
| Start im Pulk Standard | quer | 8,2 ms | 8,1 ms | −1 % | 108 → 120 |

Grenze „p95 höchstens +5 %“: eingehalten. Kino wird deutlich schneller (die Spiegelung kostete je Bild eine
Würfelseite), Standard bleibt im Rauschen (±3 %; die Spiegelung war dort schon aus). Die letzte Zeile lief zum Teil
gleichzeitig mit den Node-Tests – im A/B-Wechsel trifft das beide Varianten gleich.

**Ladegröße** (alles bis „spielbereit“ + 4 s, gzip-9, Strecke 4711 = Alpen), je zweimal im Wechsel:

| | vorher | nachher |
|---|---|---|
| gesamt gzip | 4,81 / 5,02 MB | 5,34 / 5,20 MB |
| davon Umgebungs-HDR | `alpen/env_512.hdr` 192 KB | `alpen/env.hdr` 667 KB |

→ **+0,48 MB gzip** beim Start (Rest der Schwankung = Nachladen nach Zeit). Service-Worker-Vorab-Cache: `sky_1k.hdr`
954 KB statt `sky_512.hdr` 278 KB gzip (+0,68 MB). Wer alle sieben Landschaften besucht, lädt insgesamt höchstens
+3,5 MB gzip mehr. Grenze „+5 MB“: eingehalten.

**Landschaftswechsel:** Umgebungslicht aus dem HDR erzeugen dauert im Handy-Profil 126–166 ms statt 98–114 ms
(+40 ms, hinter dem Ladebildschirm) – nicht spürbar.

Kein Kompromiss nötig.

## 4. Tests

- `npm run test:node`: alle grün.
- Browser: `tests/smoke.py` (0 Fehler), `tests/test_grafik_start.py`, `tests/test_autopilot.py`, `tests/test_scheinwerfer.py`,
  `tests/test_kinolook.py` – alle OK. Schalter geprüft: `?reflex=1` an auf Kino/aus auf Standard, `?reflex=standard` an auf
  Standard, ohne Zusatz keine Spiegelung.

## A/B-Links
| Link | was |
|---|---|
| https://drpeterkalmar.github.io/stuntbahn/ | neu (D) |
| https://drpeterkalmar.github.io/stuntbahn/?reflex=1&hdr=512 | wie bis 0.12.2 (Comic-Look auf Kino) |
| https://drpeterkalmar.github.io/stuntbahn/?reflex=1 | Spiegelung an, großes HDR (C) |
| https://drpeterkalmar.github.io/stuntbahn/?hdr=512 | ohne Spiegelung, kleines HDR (B) |

Handy: App einmal ganz schließen und neu öffnen, damit der neue Service-Worker greift.
