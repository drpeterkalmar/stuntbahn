# KI-Gegner – Portierungs-Notiz (n34, Pilot aus der Stuntbahn)

Gegner-Logik, Auto-Auto-Kollision und Rennfeld (Raster, Rangliste, Abstände) sind **drei eigenständige Module ohne Grafik**
(reines JavaScript, deterministisch, laufen in Node und im Browser). Sie sind für zwei Nachnutzer gebaut:
**n35 Online-Mehrspieler** (gleiche Darstellung fremder Autos, gleiche Kollision, gleiche Rangliste) und den geplanten
**WipeOut-artigen Racer** (KI + Netz-Schicht). Lizenz: eigener Code. Stand: n34 abgenommen (18.10.2026, Version 0.10.x; Vorbau rog17 + Abnahme/Ausbau am Mac). Bericht mit
Messwerten: `GEGNER_BERICHT.md`.

| Modul | Aufgabe | hängt ab von |
|---|---|---|
| `src/game/rennfeld.js` | Startraster (2er-Reihen, versetzt), Spieler-Startplatz, Rangliste, Zeitnahme/Abstände (TV-Grafik), Hochrechnung der Restzeit | nichts (nur eine Linie `{ n, s, total, closed, px…, tx…, nx…, bx…, hw }`) |
| `src/physics/autoauto.js` | Karosserie-Quader gegen Quader (Trennachsen-Test), Impuls + Drehmoment, Reibung, Lagekorrektur, Swept-Test gegen Durchrutschen, Härte weich/mittel/hart | einem Starrkörper mit `pos, q, v, w, frame{r,u,f}, def.mass, _kEff(), _impulse(), _pointVel(), setCrash()` (Stuntbahn: `physics/car.js`) |
| `src/ai/gegner.js` | Stärke-Profile, Persönlichkeit, Fehler-Modell, Verkehr (Überholen/Folgen/Abstand vor Stunts), Crash + Reset, Schiene außerhalb der Sicht, Rückspulen, Aufzeichnung, Feld-Steuerung | Fahrzeug (`car.js`), Linienfolger (`ai/autopilot.js`), Tempo-Profil (`ai/profile.js`), Strecken-Masken (`game/race.js`: `haftOffAt`, `zigMask`, Konstanten) |
| `src/gfx/gegnervis.js` | Darstellung: Autos mit Lack, LOD (inaktive Stufen aus dem Szenengraph gehängt), Schatten nur nah und nur Karosserie, Namensschild, Nitro-Flammen, Replay aus der Aufzeichnung | three.js, `gfx/carmesh.js` |
| `src/physics/schaden.js` + `src/gfx/schadenvis.js` + `src/gfx/schadenlook.js` | Schadensmodell: Dellen, abfallende Teile, Trümmer, Kratzer beim Schrammen; Darstellung (Dellen auf der Karosserie, Kratzer/Lack ab/Ruß/Scheibe im Shader) | `car.js` (`onTreffer`, `scrape*`), three.js |

## Einbau (Ablauf je Physikschritt)
```js
import { GegnerFeld, gegnerOptionen } from './ai/gegner.js';
const GO = gegnerOptionen(location.search, settings);            // ?gegner=0…5&staerke=locker|ebenbuertig|profi …
const feld = GO.anzahl ? new GegnerFeld(env, { anzahl: GO.anzahl, staerke: GO.staerke, seed, startplatz: GO.startplatz,
  wreckOn, assist: 'easy'|'medium'|'original', aufholhilfe: GO.aufholhilfe, schiene: GO.schiene, physik: GO.physik }) : null;
if (feld) feld.spielerAufstellen(race);                           // Spieler auf seinen Rasterplatz (vor dem Countdown)
// je Physikschritt, NACH dem Schritt des Spielers:
race.step(dt, input);
if (feld) {
  feld.step(dt, race);
  // Leicht (Fahrhilfe fair): Seitenversatz + Abstand halten hinter Gegnern, an denen es nicht vorbeigeht
  if (assist === 'easy') { const A = feld.ausweichen(race, dt); race.ap.avoid = A.versatz; race.ap.vCap = A.vCap; }
}
// HUD (4 Hz): feld.stand(race) → [{ platz, name, nummer, farbe, zeit, vor, hinter, spieler, hochgerechnet }]
// Ziel: feld läuft nach dem Spieler höchstens NACHLAUF = 10 s weiter, dann feld.abschliessen() (Rest hochgerechnet)
// Replay: feld.fahrer.map((g) => g.aufnahme()) → { hz: 15, frames, data } (Format des Geisterautos, 8 Floats je Bild)
```
Ohne `race` (Server, Messung, KI gegen KI): `feld.step(dt, null, sichtPunkt)`.
`env = { track: { line, jumps, pieces, obstacles, start: { idx } }, world (Raycasts), ideal (Ideallinie mit blo/bhi), prof (vt, kA) }`.

## Was jeder Teil macht (und welche Zahl man im neuen Spiel zuerst anfasst)
- **Stärke** (`STAERKEN`): `tempo` (Faktor aufs Profil außerhalb von Stunts), `reaktion` (s bis zum Bremsen, vorher Gas weg),
  `streu` (m Linien-Rauschen), `pSpaet`/`pPatzer` (Anteil der Bremszonen bzw. Stunts mit Fehler). Abgestimmt auf 60 Sammlungs-
  Strecken (Endstand n34, Physik der Stufe): Mittel Locker +35,5 %, Ebenbürtig +15,8 %, Profi +3,4 %; Original +35,5 / +13,9 /
  −0,3 % zur Autopilot-Zeit (`tools/gegner_mess.mjs --assist=medium|original`).
  WipeOut: kein Stunt-Mindesttempo → `muss`-Maske leer lassen, `tempo` direkt wirken lassen; Fehler = Wand-Kontakt statt Crash.
- **Profil der Stunts** (`gegnerProfil`): in Looping/Röhre/Schanze immer volles Profil-Tempo (sonst zu kurz/zu langsam),
  davor Rückwärtslauf mit der Volllast-Beschleunigung, damit das langsamere Auto die Stunt-Anfahrt schafft.
- **Persönlichkeit** (`CHARAKTERE`): Folge-Abstand, seitlicher Abstand beim Überholen, Wechsel-Tempo, Mut.
- **Verkehr** (`VERKEHR`, `STUNT_ABSTAND`, `ENG_FENSTER`): Auto voraus mit seitlicher Überdeckung → Überholen per
  Seitenversatz (innerhalb der Spur-Grenzen 100 m voraus) oder Folgen (Tempo-Deckel); vor Stunts ab 220 m mehr Abstand, im
  Stunt kein Überholen. Spieler-Hilfe (Leicht): tempoabhängige Grenzen 30/60/100 m; Gegner machen auf Leicht Platz
  (`PLATZ_MACHEN`).
- **Fehler-Plan** (`fehlerPlan`): je Seed vorab festgelegt (Rückspulen-fest, netz-tauglich: nur der Seed muss übertragen werden).
- **Schiene** (`SCHIENE`): außer Sicht (> 170 m, zurück < 150 m) fährt der Gegner das Profil ohne Raycasts; 60× billiger,
  Zeit im Mittel +0,45 % zur Physik (60 Strecken). Fehler kosten dort pauschal Zeit (`verlustPatzer/Spaet`, `pCrash`).
- **Kollision** (`HAERTE`): `weich` (Leicht: anstupsen, Δv ≤ 6 m/s, wenig Drehung, nie Crash), `mittel` (Crash ab 16 m/s),
  `hart` (Original: voller Starrkörper, Crash ab 9,5 m/s wie Wandaufprall). `SWEPT.ab`: ab 0,5 m relativer Bewegung je Schritt
  wird der Weg in 0,35-m-Stücken abgetastet.

## Seit der Abnahme (n34-Heavy, 18.10.2026)
- **Physik der Stufe** (`opt.physik`, Standard `'stufe'`): jedes Gegner-Auto bekommt `Race.carAssist(car, ASSISTS[assist], false,
  assist)` – also dieselbe Arcade-Physik wie der Spieler (n37: Wand schrammt statt Crash, Crash-Schwellen, Mittel-Antrieb mit
  Deckel, Landehilfe), aber ohne Luft-Tricks (`airCtl = airTap = 0`). `antrieb(car, v)` rechnet die Volllast-Beschleunigung mit
  diesen Fahrhilfen (Schiene, Profil-Rückwärtslauf, Hochrechnung). `'roh'` = Physik der Prüffahrt (Vorbau).
- **Gummiband** (`AUFHOL`, Standard an, Peter 15.10.): stetiger Regler je Gegner aus dem Abstand zum Spieler (Totband `tot`,
  proportional über `vorL`/`hinterL`, Filter `tau`/`tauVor`), Grenzen in Sicht `physVor … physHinter` (nie über das Profil-Tempo,
  in Stunt-Nähe 1, nie unter `mindestTempo()` vor einem Stunt), außer Sicht `schVor … schHinter` (wartet bzw. holt auf);
  Aufholen von hinten blendet `ende` m vor dem Ziel aus. Option `aufholhilfe` (`?aufholhilfe=0`), Stärke `?gummi=0…2`.
  **WipeOut:** dieselbe Rechnung; ohne Stunts entfällt `mindestTempo`, `physVor` eher 0,6 (hohes Grundtempo wirkt sonst träge).
- **Schiene auch nach Streckenweg** (`SCHIENE.weitS/nahS`): Rundkurs – quer übers Feld nah, auf der Strecke weit → Schiene.
- **Verkehr robuster:** Not-Deckel in der Stunt-Anfahrt (nur Mindestabstand – lieber verpatzt der Gegner seinen Stunt, als dass er
  einem kriechenden Spieler ins Heck fährt), Bremsen hinter einem Auto mit kurzer Reaktion (`VERKEHR.reaktion`), Platz machen für
  den schnelleren Spieler auf allen Stufen bzw. wenn er `folgeZeit` s dahinter hängt (`PLATZ_MACHEN`), Leicht-„Geduld“
  (`LEICHT_AUSWEICHEN.geduld/vorbei/stups`: nach 2 s lässt der Gegner den Leicht-Spieler vorbei, Leicht darf sanft anstupsen), Geist-Phase nach Reset/Rückspulen (`GEIST`, keine
  Auto-Auto-Kollision, verlängert solange jemand nah ist), Warten im Verkehr zählt bis 15 s nicht als „festgefahren“.
- **Physik-Takt** (`TAKT`): ohne anderes Auto im Umkreis von `frei` m rechnet ein Gegner im halben Takt (60 Hz, abwechselnd).
- **Nitro** (`GEGNER_NITRO`): Abklingzeit wie beim Spieler (`COOLDOWN` aus `physics/extras.js`), gezündet am Kurvenausgang weit vor
  dem nächsten Stunt; der Schub hilft nur beim Beschleunigen (Autopilot regelt weiter aufs Profil). Hüpfer nutzen die Gegner nicht.
- **Funken beim Schleifen** (Ereignis `schleif`), **Crash-Ton nach Entfernung** (Ereignis `gegnerCrash`).
- **Minikarte**: `minikarte.setMarkers([{ pos, farbe, groesse }])` je Bild (vor dem Spieler größer).
- **Schaden-Optik im Shader** (`gfx/schadenlook.js`): je Auto ein Satz Uniforms (`car.sbU`: bis 12 Treffer Ort/Radius/Richtung/
  Tiefe, Gesamtschaden, Scheibe), gefüllt aus dem kompakten Schadens-Zustand – n35 überträgt nur `packen(S)` (3 + 8 Byte je Delle).
  Kratzer entstehen auch beim Schrammen an Wänden (`KRATZER`, flache Treffer).

## n35 Online-Mehrspieler – was übernommen wird
- **Fremde Autos** = `GegnerVis` (Lack, Namensschild, LOD) mit Lage aus dem Netz statt aus der KI (gleiches `sync(feld …)`-
  Prinzip: Lage vor/nach dem letzten Netz-Paket interpolieren).
- **Kollision**: lokal nur Spieler ↔ fremdes Auto mit `stoss(…, { festB: true })` (das fremde Auto bewegt sich nicht – sein
  Besitzer rechnet seine eigene Reaktion); Stoß-Ereignis (`vn`, `p`, `n`) mitsenden.
- **Rangliste/Abstände/Raster**: `rennfeld.js` unverändert; Fortschritt (m) je Auto mitsenden.
- **Gegner im Netz**: der Gastgeber rechnet die KI-Gegner (`GegnerFeld`) und sendet Lage + Zustand (15 Hz reicht, Format wie
  `aufnahme()`), Fehler-Plan und Stärke folgen aus dem Seed.

**Stand n35-Vorbau (18.10.2026):** gebaut in `src/game/online.js` + `src/net/` (Port-Notiz `NETZ.md`). Haken im Feld (Standard
unverändert, Node-Test `test_gegner.mjs` grün): `opt.online` (kein Mit-Rückspulen, kein Nachlauf-Abschluss), `opt.rasterN` +
`opt.plaetze` + `opt.spielerPlatz` (Raster für Menschen + KI), `feld.fremde` (fremde Menschen als feste Körper in Verkehr und
Kollision; Spieler ↔ fremd rechnet online.js), `feld.sichtPunkte` (Schiene nur fern von allen Menschen), `g.resets`
(Sprungzähler fürs Netz). Online-KI ohne Gummiband.

## Was nicht automatisch passt
- **Linie mit gleichen Indizes**: Fortschritt nutzt die Mittellinie mit den Indizes der Ideallinie (Stuntbahn: `ideal.js
  makeLine` behält die Indizes). Eine andere Ideallinie braucht eine Abbildung Index → Bogenlänge.
- **Rennen über mehrere Runden**: Fehler-Plan und Ziel sind für eine Runde gebaut (`zielFortschritt`); für n Runden Ziel und
  Plan je Runde erweitern.
- **Kollision kennt nur Quader**: Spoiler/Spiegel ragen nicht heraus; für WipeOut-Gleiter Quader aus der Hülle nehmen.

## Prüfung
`node tests/node/test_autoauto.mjs` (25), `node tests/node/test_gegner.mjs` (~75, ~30 s, inkl. Gummiband), `node tests/node/test_gegner_gfx.mjs`
(16, Attrappen), `python3 tests/test_gegner_ui.py` (Browser, 3 Stufen), `node tools/gummiband_probe.mjs 0|1 [--sieht=1]` (Gummiband), `node tools/gegner_mess.mjs --von=0 --bis=20` (60 Strecken in 3 Häppchen), `--vergleich` (Schiene ↔ Physik),
`--anzahl=5` (Feld). Mess-Gate Browser: `tests/perf_szenen_gegner.json` mit `tests/perf_gate.py --ab …` (Mess-Regler `?gegnervis=0`, `?gegnerlod=`,
`?gegnerschatten=0`, `?gegnertakt=voll|halb`, `?schadenprobe=1`).
