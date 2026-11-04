# n44 – Start hängt bei „Strecke bauen …“ (Peter 02.11.2026)

## Ursache (kurz)
Die Landschafts-Pakete (Wüste, Alpen, Küste, Stadt, Herbst, Winter) liegen nicht im Offline-Speicher und werden nach jedem
Update gelöscht; kam ein Paket aus dem Netz nicht an (Netz da, aber keine Antwort – schwaches Netz, WLAN-Wechsel), wartete
der Streckenbau ohne Zeitlimit ewig bei „Strecke bauen …“. Am 02.11. traf das genau zusammen: die Tagesstrecke (Gelände) hatte
als erste seit Tagen die **Wüste**, und am Nachmittag kam 0.19.2 (alle Landschaften aus dem Speicher weg).

Ehrlich: Auf Peters Handy selbst ist es nicht nachgemessen. Nachgestellt ist der Mechanismus (hängender Abruf → ewiger Hänger,
rot auf 0.19.2); alle anderen Verdächtigen sind ausgeschlossen (siehe unten). Die Regression durch 07cd3eb war es nicht.

## Fix
- `themes.use(id, limit)`: Landschafts-Paket höchstens 10 s, dann „Land“ (immer im Offline-Speicher). Das Paket lädt weiter, der
  Service Worker legt es ab → nächstes Laden hat die richtige Landschaft. Baum-Atlanten und Shader-Vorübersetzen ebenfalls mit
  Limit. `?ladelimit=<ms>`, 0 = ohne Limit (wie 0.19.2).
- Absicherung: Fehler beim Streckenbau beim Start → flache Strecke des Tages (bzw. Teststrecke) + Hinweis; bei 🎲 Neue Strecke →
  bisherige Strecke + Hinweis; Landschaft wählen → Hinweis. Der Ladebalken bleibt nie stehen. Test-Haken `?ladefehler=N`.
- Nach 1,5 s Warten auf die Landschaft steht „Landschaft laden …“ statt „Strecke bauen …“ (man sieht, worauf es wartet).
- Fix aus 07cd3eb (Neue Strecke nach Replay) unverändert; `tests/test_neue_strecke_nach_replay.py` grün.
- Physik, Strecken, Optik im Normalfall unverändert → Zeiten/Bestzeiten unverändert (Normalfall 02.11. weiter Wüste).

## Test `tests/test_n44_strecke_bauen.py` (vorher/nachher)
| Fall | 0.19.2 | mit Fix |
|---|---|---|
| Start 02.11. Gelände (Wüste), Netz hängt | **hängt** (> 25 s, „Strecke bauen …“) | Menü nach 12,7 s, Land |
| Start 02.11. 3D (Winter), Netz hängt, Desktop | **hängt** (> 25 s) | Menü nach 12,3 s, Land |
| Start 02.11. Gelände, Netz normal | 2,5 s, Wüste | 2,3 s, Wüste |
| 🎲 Neue Strecke (Alpen), Netz hängt | **hängt** (> 25 s) | 10,4 s, Land |
| Baufehler beim Start (`?ladefehler=1`) | – (gab es nicht) | Ersatzstrecke, Menü 3,4 s |
| Baufehler bei Neue Strecke (`?ladefehler=2`) | – | bisherige Strecke, Menü |

Rohdaten: `tests/perf/n44_strecke_bauen_v0192.json` (alt), `tests/perf/n44_strecke_bauen.json` (neu).

## Was sonst geprüft wurde (alles ohne Hänger, live 0.19.2)
- Frischer Start Handy/Desktop/iPhone-WebKit (quer + hoch): 2,9–6,9 s bis zum Menü.
- Tagesstrecken 02.–05.11. × Gelände/3D/flach: 12/12 ok.
- Gespeicherte Stände (`tests/n44_boot_probe.py`): alle 7 Landschaften, Regen/Schnee, Abend/Nacht, Grafik 0/1/2, 3 Profi-Gegner,
  Menschen-Zuschauer, Mittel+Cockpit, Kombinationen, alte Stände (vor n22 `flat`, ohne Reset-Marken): 23/23 ok.
- Wiederkehr mit Service Worker (4 Besuche): ok, 1,3 s.
- Service-Worker-Update 0.19.1 → 0.19.2 (`tests/n44_sw_update.py`, echte Live-Adresse aus lokalen Ständen): ok, keine
  gemischten Dateien im neuen Speicher. Nebenbefund (nicht behoben): beim Update lädt der neue Service Worker die Dateien in
  der Messung mehrfach (bis ~10×), harmlos für den Start.
- Offline: Paket-Fehler → schon bisher Land, kein Hänger. Nur ein *hängender* Abruf blockierte.
- WebGL-Kontextverlust während des Streckenbaus (`tests/n44_kontext_probe.py`): kein Hänger.
- Generator + Aufbau, 100 Zufalls-Seeds je Streckenart × Stufe (900 Strecken, `node tools/n44_seed_sweep.mjs`): max. 0,28 s, 0
  Fehler (`tests/perf/n44_seed_sweep.json`).
- Browser 🎲 Neue Strecke, 10 je Art × Stufe (90, inkl. Autopilot-Prüfung, `tests/n44_neue_strecke_sweep.py`): max. 4,0 s, 0
  Hänger (`tests/perf/n44_neue_strecke_sweep.json`).

## Für Peter (Handy)
Einmal die Seite **neu laden** (ggf. zweimal: das erste Laden holt das Update, das zweite startet es). Hängt das Netz, steht
nach höchstens ~10 s das Menü – dann eben mit der grünen Land-Landschaft; beim nächsten Öffnen kommt die richtige.
