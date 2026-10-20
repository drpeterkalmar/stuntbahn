# Changelog – Stuntbahn

Kurzfassung je Version; Details in den Abschnitten der `README.md` und in den Berichten (`*_BERICHT.md`).

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
