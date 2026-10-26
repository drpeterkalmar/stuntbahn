# Changelog – Stuntbahn

Kurzfassung je Version; Details in den Abschnitten der `README.md` und in den Berichten (`*_BERICHT.md`).

## 0.14.0 – 26.10.2026 (Zieljubel-Stunt)
- **Neu: Stunt nach der Ziellinie** (Peter 20.10.: „automatischer Nitro und Sprung und Schraube oder Front-/Backflip im
  Ziel“): Nitro mit Flammen → Sprung → Schraube, Frontflip oder Backflip → saubere Landung → ausrollen, dann Zielbogen.
  Nur Show – Zeit, Bestzeit, Geist und Online-Wertung unverändert. Im Replay und Highlight-Film zu sehen („🏁 Ziel · Backflip“).
- Nur mit Platz hinter dem Ziel, sonst wie bisher. Option „Zieljubel: Stunt/Dreher/Aus“ jetzt **Standard Stunt**, `?zieljubel=`.
- Cockpit/Stoßstange zeigen den Stunt im Verfolger; weiche Landung (G-Messer im Film ≤ 3 G statt einer 10-G-Spitze).

## 0.13.0 – 26.10.2026 (Tier-Zuschauer)
- **Neu: herzige Tier-Zuschauer** (Peter 20.10.: „niedlichere Zuschauer (herzige Tiere)“): Bärchen, Häschen, Füchse, Pinguine,
  Kätzchen und Kühe statt Menschen – am Rand, auf den Tribünen, in der Ferne und als Ohren in der Fan-Cam. Sie jubeln mit
  hochgerissenen Pfoten. Option „Zuschauer: Tiere/Menschen“ (Standard Tiere), `?zuschauer=mensch`.
- Vorbereitet (noch nicht Standard): Option „Zieljubel: Stunt/Dreher/Aus“ – Stunt nach der Ziellinie (Nitro, Sprung, Schraube
  oder Front-/Backflip), `?zieljubel=stunt`. Standard bleibt der bisherige Dreher.
- Bericht `N40_BERICHT.md`, Tests `test_tiere.mjs`, `test_zielstunt.mjs`.

## 0.12.4 – 25.10.2026 (Reset-Knopf)
- **Neu: ↺ Reset-Knopf** (Peter 22.10.: „Bitte 1 Klick Reset auf die Strecke (statt Zurückspulen)“): ersetzt ⏪ im HUD, auf
  allen Stufen. Ein Tipp setzt das Auto wie der Crash-Reset zurück auf die Fahrbahn (mittig, in Fahrtrichtung, mit Schwung;
  vor einem Stunt mit dessen Anlauftempo) – +5 s wie ein Crash, nie eine Abkürzung, Doppeltipp-Schutz 1 s.
- Tasten `T`/`Backspace`, Gamepad Y = Reset; Zurückspulen weiter mit `R`, Gamepad Steuerkreuz ◀ und im Pause-Menü.
- Mit KI-Gegnern und online: kurze Geist-Phase nach dem Reset (kein Einschlag), Strafe zählt in der Zieltabelle.
- Hilfe/Steuerungsseite angepasst; Bericht `RESET_KNOPF_BERICHT.md`, Test `tests/test_reset_knopf.py`.

## 0.12.3 – 25.10.2026 (Lack wie früher)
- **Autos wieder fotorealistisch** (Peter 22.10.: „Autos sehen derzeit aus wie Comiczeichnungen“): Die dynamische
  Lack-Spiegelung aus n30 (nur Grafik „Kino“) legte rosa-weiße Glanzflächen und helle Kanten über den Lack. Jetzt Peters
  Variante D: Spiegelung standardmäßig aus, großes Umgebungs-HDR (1024×512, Float) wieder Standard – Bild wie am 07.10.
  Kino 14–19 % flüssiger (p95, Handy-Profil, 3 Gegner), Standard gleich. Alt per `?reflex=1` / `?reflex=standard` / `?hdr=512`.
- Mess-Gate schließt seine Browser jetzt sicher (blieben vorher nach jeder Messung offen).
- Bericht `LACK_BERICHT.md`, Vergleich `tests/lack_vergleich.py`, Collagen `tests/shots/lack/`.

## 0.12.2 – 20.10.2026 (Looping-Kamera)
- **Verfolger im Looping höher** (Peter: „kamera in looping zu niedrig, clippt durch boden“): Neigt sich das Auto steiler als
  ~32° (Looping, Korkenzieher, Röhre, Steilwand), steigt die Verfolger- bzw. Hubschrauberkamera weich um 1,2 m (voll ab
  senkrecht), danach sinkt sie sanft zurück. Bisher blieb sie 1,75 m über dem Auto, und 5 m dahinter liegt die Bahn im Looping
  schon über der Tangente → die Kamera tauchte in die Fahrbahn. Regler `?camloop=0` (alt) bis `?camloop=4` (Meter).

## 0.12.1 – 20.10.2026 (Scheinwerfer)
- **Scheinwerfer in Lampenhöhe** (Peter: „Scheinwerferlichter sind zu hoch“): Die zwei Leuchtpunkte vorn saßen 1,14 m über
  dem Boden – auf Höhe der Windschutzscheibe, ~0,5 m über der Haube (sichtbar in Action-Momenten/Replays von vorn). Jetzt
  0,48 m, vorn an der Nase innerhalb der Karosserie; Lichtquelle mit abgesenkt, der Lichtfleck trifft die Fahrbahn wie
  bisher ~17 m vor dem Auto. Test `tests/test_scheinwerfer.py`.

## 0.12.0 – 20.10.2026 (n36 Action-Momente)
- **Neu: 🎬 Action-Momente live im Rennen** – Bullet-Time am Scheitel großer Sprünge und beim Crash (Zeit fast eingefroren,
  Kamera im Halbkreis ums Auto, ruckartig zurück), Speed-Ramp + Zoom-Punch im Looping/Korkenzieher kopfüber, beim knappen
  Überholen, nach Takedowns, bei der Landung nach dem weitesten Sprung, nach Stunt-Ketten und beim Foto-Finish.
- Optionen/Pause: **Aus / Selten (Standard) / Oft**, **⚡ Blitze reduzieren**; Link `?action=0|1|2`.
- Fair: Physik nur langsamer, Rennzeit gleich, Eingaben (auch kurze Tipps) gelten weiter; nie vor Kurven/Bremsstellen.
- Online: nur Bild-Effekte (Physik in Echtzeit); Bullet-Time als Standbild mit Kreisfahrt im Highlight-Film.
- Effekte im Kino-Look (Sättigung, Vignette, Farbsäume, Radial-Unschärfe), Kino-Balken; Grafik „Einfach“ per CSS.
  Shader beim Laden vorübersetzt (kein Ruckler beim ersten Moment).
- Tests: `tests/node/test_action.mjs`, `tests/test_action_ui.py`, `tests/action_shots.py`, `tools/action_mess.mjs`,
  `tests/perf_szenen_action.json`. Bericht: `N36_ACTION_BERICHT.md`.

## 0.11.0 – 19.10.2026 (n35 Online)
- 👥 Online-Mehrspieler für 2–4 (ohne Server, Trystero/WebRTC), Lobby mit QR/Link, Kurzrufe, Aufgeben, Revanche
  (`ONLINE_BERICHT.md`, `NETZ.md`).

## 0.10.x – 18.10.2026 (n34 KI-Gegner + Schaden)
- 🏁 KI-Gegner (Aus/1/3/5, Stärken, Gummiband), Schadensmodell (Aus/Nur Optik/Mit Fahrfolgen) (`GEGNER_BERICHT.md`).

## 0.9.0 – 18.10.2026 (n39)
- 🗺️ 3D-Minikarte im Rennen (`N39_MINIKARTE_BERICHT.md`).

## 0.8.0 – 18.10.2026 (n38)
- 🔥 Stunts laden Nitro nach, ruhige Hand, Bauwerke, Landeschub, Zwischenzeiten, Drift-Turbo zum Testen (`N38_VORLAGEN_BERICHT.md`).

## 0.7.0 – 18.10.2026 (n37)
- 🤸 Arcade-Stunt-Fahrgefühl: Saltos, Schrauben, Wände schrammen (`N37_ARCADE_BERICHT.md`).

## Davor
- Siehe README-Abschnitte n17–n33 (Kino-Look, Kino-Replay, 3D-/Gelände-Strecken, Sammlung, Zielshow, Wetter/Nacht, Hindernisse …).
