# KI-Gegner – Portierungs-Notiz (n34, Pilot aus der Stuntbahn)

Gegner-Logik, Auto-Auto-Kollision und Rennfeld (Raster, Rangliste, Abstände) sind **drei eigenständige Module ohne Grafik**
(reines JavaScript, deterministisch, laufen in Node und im Browser). Sie sind für zwei Nachnutzer gebaut:
**n35 Online-Mehrspieler** (gleiche Darstellung fremder Autos, gleiche Kollision, gleiche Rangliste) und den geplanten
**WipeOut-artigen Racer** (KI + Netz-Schicht). Lizenz: eigener Code. Stand: Vorbau n34 (Node-geprüft, Browser-Abnahme folgt).

| Modul | Aufgabe | hängt ab von |
|---|---|---|
| `src/game/rennfeld.js` | Startraster (2er-Reihen, versetzt), Spieler-Startplatz, Rangliste, Zeitnahme/Abstände (TV-Grafik), Hochrechnung der Restzeit | nichts (nur eine Linie `{ n, s, total, closed, px…, tx…, nx…, bx…, hw }`) |
| `src/physics/autoauto.js` | Karosserie-Quader gegen Quader (Trennachsen-Test), Impuls + Drehmoment, Reibung, Lagekorrektur, Swept-Test gegen Durchrutschen, Härte weich/mittel/hart | einem Starrkörper mit `pos, q, v, w, frame{r,u,f}, def.mass, _kEff(), _impulse(), _pointVel(), setCrash()` (Stuntbahn: `physics/car.js`) |
| `src/ai/gegner.js` | Stärke-Profile, Persönlichkeit, Fehler-Modell, Verkehr (Überholen/Folgen/Abstand vor Stunts), Crash + Reset, Schiene außerhalb der Sicht, Rückspulen, Aufzeichnung, Feld-Steuerung | Fahrzeug (`car.js`), Linienfolger (`ai/autopilot.js`), Tempo-Profil (`ai/profile.js`), Strecken-Masken (`game/race.js`: `haftOffAt`, `zigMask`, Konstanten) |
| `src/gfx/gegnervis.js` | Darstellung: Autos mit Lack, LOD, Schatten nur nah, Namensschild, Replay aus der Aufzeichnung | three.js, `gfx/carmesh.js` |

## Einbau (Ablauf je Physikschritt)
```js
import { GegnerFeld, gegnerOptionen } from './ai/gegner.js';
const GO = gegnerOptionen(location.search, settings);            // ?gegner=0…5&staerke=locker|ebenbuertig|profi …
const feld = GO.anzahl ? new GegnerFeld(env, { anzahl: GO.anzahl, staerke: GO.staerke, seed, startplatz: GO.startplatz,
  wreckOn, assist: 'easy'|'medium'|'original', aufholhilfe: GO.aufholhilfe, schiene: GO.schiene }) : null;
if (feld) feld.spielerAufstellen(race);                           // Spieler auf seinen Rasterplatz (vor dem Countdown)
// je Physikschritt, NACH dem Schritt des Spielers:
race.step(dt, input);
if (feld) { feld.step(dt, race); race.ap.avoid = assist === 'easy' ? feld.ausweichen(race) : 0; }
// HUD (4 Hz): feld.stand(race) → [{ platz, name, nummer, farbe, zeit, vor, hinter, spieler, hochgerechnet }]
// Ziel: feld läuft nach dem Spieler höchstens NACHLAUF = 10 s weiter, dann feld.abschliessen() (Rest hochgerechnet)
// Replay: feld.fahrer.map((g) => g.aufnahme()) → { hz: 15, frames, data } (Format des Geisterautos, 8 Floats je Bild)
```
Ohne `race` (Server, Messung, KI gegen KI): `feld.step(dt, null, sichtPunkt)`.
`env = { track: { line, jumps, pieces, obstacles, start: { idx } }, world (Raycasts), ideal (Ideallinie mit blo/bhi), prof (vt, kA) }`.

## Was jeder Teil macht (und welche Zahl man im neuen Spiel zuerst anfasst)
- **Stärke** (`STAERKEN`): `tempo` (Faktor aufs Profil außerhalb von Stunts), `reaktion` (s bis zum Bremsen, vorher Gas weg),
  `streu` (m Linien-Rauschen), `pSpaet`/`pPatzer` (Anteil der Bremszonen bzw. Stunts mit Fehler). Abgestimmt auf 60 Sammlungs-
  Strecken: Locker +36 %, Ebenbürtig +15 %, Profi +0,8 % zur Autopilot-Zeit (`tools/gegner_mess.mjs`).
  WipeOut: kein Stunt-Mindesttempo → `muss`-Maske leer lassen, `tempo` direkt wirken lassen; Fehler = Wand-Kontakt statt Crash.
- **Profil der Stunts** (`gegnerProfil`): in Looping/Röhre/Schanze immer volles Profil-Tempo (sonst zu kurz/zu langsam),
  davor Rückwärtslauf mit der Volllast-Beschleunigung, damit das langsamere Auto die Stunt-Anfahrt schafft.
- **Persönlichkeit** (`CHARAKTERE`): Folge-Abstand, seitlicher Abstand beim Überholen, Wechsel-Tempo, Mut.
- **Verkehr** (`VERKEHR`, `STUNT_ABSTAND`): Auto voraus mit seitlicher Überdeckung → Überholen per Seitenversatz (innerhalb
  der Spur-Grenzen 100 m voraus) oder Folgen (Tempo-Deckel); vor Stunts ab 220 m mehr Abstand, im Stunt kein Überholen.
- **Fehler-Plan** (`fehlerPlan`): je Seed vorab festgelegt (Rückspulen-fest, netz-tauglich: nur der Seed muss übertragen werden).
- **Schiene** (`SCHIENE`): außer Sicht (> 170 m, zurück < 150 m) fährt der Gegner das Profil ohne Raycasts; 60× billiger,
  Zeit im Mittel +0,45 % zur Physik (60 Strecken). Fehler kosten dort pauschal Zeit (`verlustPatzer/Spaet`, `pCrash`).
- **Kollision** (`HAERTE`): `weich` (Leicht: anstupsen, Δv ≤ 6 m/s, wenig Drehung, nie Crash), `mittel` (Crash ab 16 m/s),
  `hart` (Original: voller Starrkörper, Crash ab 9,5 m/s wie Wandaufprall). `SWEPT.ab`: ab 0,5 m relativer Bewegung je Schritt
  wird der Weg in 0,35-m-Stücken abgetastet.

## n35 Online-Mehrspieler – was übernommen wird
- **Fremde Autos** = `GegnerVis` (Lack, Namensschild, LOD) mit Lage aus dem Netz statt aus der KI (gleiches `sync(feld …)`-
  Prinzip: Lage vor/nach dem letzten Netz-Paket interpolieren).
- **Kollision**: lokal nur Spieler ↔ fremdes Auto mit `stoss(…, { festB: true })` (das fremde Auto bewegt sich nicht – sein
  Besitzer rechnet seine eigene Reaktion); Stoß-Ereignis (`vn`, `p`, `n`) mitsenden.
- **Rangliste/Abstände/Raster**: `rennfeld.js` unverändert; Fortschritt (m) je Auto mitsenden.
- **Gegner im Netz**: der Gastgeber rechnet die KI-Gegner (`GegnerFeld`) und sendet Lage + Zustand (15 Hz reicht, Format wie
  `aufnahme()`), Fehler-Plan und Stärke folgen aus dem Seed.

## Was nicht automatisch passt
- **Linie mit gleichen Indizes**: Fortschritt nutzt die Mittellinie mit den Indizes der Ideallinie (Stuntbahn: `ideal.js
  makeLine` behält die Indizes). Eine andere Ideallinie braucht eine Abbildung Index → Bogenlänge.
- **Rennen über mehrere Runden**: Fehler-Plan und Ziel sind für eine Runde gebaut (`zielFortschritt`); für n Runden Ziel und
  Plan je Runde erweitern.
- **Kollision kennt nur Quader**: Spoiler/Spiegel ragen nicht heraus; für WipeOut-Gleiter Quader aus der Hülle nehmen.

## Prüfung
`node tests/node/test_autoauto.mjs` (25), `node tests/node/test_gegner.mjs` (~60, ~20 s), `node tests/node/test_gegner_gfx.mjs`
(16, Attrappen), `node tools/gegner_mess.mjs --von=0 --bis=20` (60 Strecken in 3 Häppchen), `--vergleich` (Schiene ↔ Physik),
`--anzahl=5` (Feld). Mess-Gate Browser: `tests/perf_szenen_gegner.json` mit `tests/perf_gate.py --ab …`.
