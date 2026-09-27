# Stuntbahn – Bericht Nacht 2: .TRK-Import (27.09.2026)

**Live:** https://drpeterkalmar.github.io/stuntbahn/ · Menü → **📂 Strecke laden (.TRK)**
Stand: Parser, alle Elemente, Gelände, Fahrweg, Autopilot, Oberfläche umgesetzt; live geprüft (HTTP 200,
Build = lokal, 0 Fehler, Import einer lokalen .TRK per Datei-Auswahl → Probefahrt → Ziel auf „Leicht“).

## Was geht
- **Import** per Datei-Auswahl (Handy) oder Drag & Drop (Desktop): einzelne `.TRK`, Replays `.RPL`
  (enthalten die Strecke) und **ganze ZIP-Archive** (werden im Browser entpackt). Bibliothek bis 400
  Strecken mit **Vorschau-Minikarte**, Bestzeiten je Fahrhilfe, Fahren, Löschen. Alles bleibt im Browser.
  Kaputte Dateien → klare deutsche Meldung (zu kurz, ungültige Geländecodes, keine Start/Ziel-Linie …).
- **Parser** (1802 Bytes, Strecke Süd→Nord, Gelände Nord→Süd, Horizont, Bliss-Titel/Autor) – reines
  Modul, in Node getestet. Byte-Layout empirisch an 3603 Archivdateien bestätigt.
- **Alle 151 Strecken- + 28 Szenerie-Codes** als Datentabelle (`src/track/trkelems.js`, keine if-Ketten):
  Grundform je Art (Fußabdruck, Wege, Höhen) + Drehung/Spiegelung. Neu gebaut: Korkenzieher-Rolle
  (360° um die Fahrachse, Mittelwand) und -Wendel (Hochstraßen-Auffahrt), Röhre + Einfahrt + Hindernis,
  Tunnel, Autobahn + Übergang, Slalom, Schikane (S über ein Feld, Asphalt-Vorfeld), Steilstraße +
  Übergänge + Steilkurve, Hochstraße auf Pfeilern/Damm/Brückenfeld, Überführung, Hochstraßen-Kurve,
  Hochstraßen-/Brücken-/Dammrampen, Abzweige, Kreuzungen, Schotter und Eis (weniger Haftung).
- **Sprünge:** Rampe → freie Felder → Rampe ist im Original der Standard-Sprung (oft über Häuser,
  Straßen, Schiffe). Offene Rampen werden Schanze (18° Lippe) bzw. Landerampe; Tempo-Fenster wird
  ballistisch aus der echten Geometrie berechnet; Szenerie unter Sprüngen wird niedrig gebaut.
- **Gelände:** Hügel = eine Hochstraßen-Ebene (5 m), Hänge mit demselben Profil wie die Straßen darauf,
  Wasser mit Uferböschung und Spiegelung, Rampen auf Gegenhängen = waagrechte Hochstraße (wie im Original).
- **Szenerie:** eigene Modelle – Palme, Kaktus, Tanne, Tennisplatz, Tankstelle, Scheune, Bürohaus,
  Windmühle, Schiff, Imbiss („DINER“), geparkte Autos (vereinfachtes Modell, bei Bedarf geladen).
- **Fahrweg:** ab Start/Ziel über das Raster, an Abzweigen der Weg zurück ins Ziel mit den meisten
  Feldern, Checkpoints bei ¼, ½, ¾; unbefahrene Teile als Deko. Autopilot-Probefahrt beim ersten Laden
  → Ideallinie, Tempo-Profil (Haftung/Bremsweg je Belag), alle drei Fahrhilfen sofort nutzbar.
- **Beispielstrecke** (eigene, im Repo): alle Sonderteile auf einem Rundkurs (`?trk=demo-rundkurs`).
- **Deine Änderungen integriert:** Kamera näher (5,0/1,75 m) und Tempo 1,25× auch auf Importen geprüft –
  in Tunnel, Röhre, Wendel und Korkenzieher keine Kamera in Wand/Decke (Kamera-Strahltest greift);
  Totalschaden-Option (Standard aus) gilt auch für Importe, Korpus unten ist mit dieser Logik gemessen.

## Korpus-Test (lokal, Archiv-Strecken nie im Repo)
Alle 3603 Dateien (ZakStunts Track-Pack + Wettbewerbs-Archiv 2024): **3585 lesbar** (17 leer, 1 zu kurz),
3575 mit Weg ab Start/Ziel (10 ohne Start/Ziel-Linie), **3567 Rundkurse**; Wegsuche ~0,7 ms je Strecke.
Fahrtest an 200 Strecken, gleichmäßig über beide Archive verteilt (`node tests/node/test_trk_corpus.mjs 200`):

| Prüfung | Anzahl | Quote | Ziel |
|---|---|---|---|
| parsebar | 200 | 100 % | ≥ 95 % ✅ |
| vollständig gemappt + gebaut | 200 | 100 % | ≥ 95 % ✅ |
| Rundkurs gefunden | 199 | 99,5 % | |
| **Autopilot im Ziel, Fahrhilfe Leicht** (ohne „Überspringen“) | **194** | **97,0 %** | ≥ 80 % ✅ |
| davon ohne einen einzigen Crash | 178 | 89,0 % | |
| Autopilot im Ziel ohne jede Hilfe | 172 | 86,0 % | |

123 der 200 Strecken haben Sprünge (119 davon auf Leicht im Ziel). Länge Median 2,1 km, max. 9,3 km;
Bauzeit Median 88 ms, max. 274 ms (Node).
**Ausfälle Leicht (6):** 2× Aufprall bei Sprung (sehr knappe Fenster), 2× festgefahren am Looping
(u. a. Looping über einer Hügelkante, s. u.), 1× Wendel, 1× Brückenrampe. Im Spiel hängt man dort trotzdem nicht fest: nach
wiederholtem Scheitern setzt das Spiel hinter das Hindernis (zählt hier als Ausfall).
**Ausfälle ohne Hilfen (28):** 7× Slalom (direkt nach Kurven, Auto kommt schräg an), 5× Hochstraßen-Kurve,
5× Sprung/Brückenrampe, 3× Korkenzieher, 2× Looping, 2× Steilstraßen-Übergang, 4× Sonstiges.

## Messwerte
| Prüfung | Ergebnis |
|---|---|
| Node-Tests | Parser 424/424, Import 1522/1522 (jeder Code, jeder Weg baubar), Gate ✅, Generator 36/36 |
| Generator-Regression | **30/30 lösbar**, 0 Entschärfungen; Fahrhilfe-Bots ✅; Reset-Test ✅ |
| Browser (Nacht-1-Tests + neu) | Smoke, Rennen/Geist/Replay, Touch, Import-UI (ZIP, RPL, kaputte Datei, Drag & Drop, Ziel, Bestzeit + Geist, Neuladen, Löschen): alle grün, 0 Fehler |
| Draw-Calls große Importe | 90–157 (Übersicht aus der Luft), im Rennen 57–105 (vorher bis 322 → Chunks 200 m, instanzierte Schilder/Autos) |
| Dreiecke | 180–265 k je nach Strecke (geparkte Autos vorher bis 1,3 Mio.) |
| Download gesamt | **7,75 MB** (neues Auto-LOD 0,1 MB, Import-Code ~0,1 MB) |
| Live | HTTP 200, Build = lokal, DEFAULT.TRK und Monaco importiert → im Ziel, PWA installierbar, offline ok |

Fotos: `tests/shots/final/nacht2_*` (Handy quer + Desktop, nur eigene Strecken). Archiv-Strecken
(Monaco, Bathurst, Minas Tirith, Gibraltar, Dublin, DEFAULT u. a.) nur lokal unter `tests/shots/trk/`.

## Fehlend / unsauber (ehrlich)
- **Eigene Deutung, wo die Doku schweigt:** Röhren-„Hindernis“ als Buckel im Boden, Maße von Rolle und
  Wendel, Autobahn: Autopilot fährt rechts (links ist befahrbar).
- **Hang-Sonderfälle:** Kurven/Looping/Röhren-Einfahrt über einer Hügelkante (11 von 3603 Strecken)
  werden eben gebaut → Stufe am Ende.
- **Abzweige:** die zweite Spur ist befahrbar, zählt aber nicht als Fahrweg (> 30 m neben der Linie → „Abseits“).
- **Horizont** (Wüste, Alpen, Stadt …) wird nur angezeigt, die Kulisse bleibt „Land“.
- Original-Physikfehler (Looping-/Slalom-„Bug“, schnelles Gras) werden nicht nachgebaut – außer dem
  Asphalt-Vorfeld an Schikanen. Illusions-Strecken (Füllfelder überbaut) sehen anders aus als im Original.
- Ufer an diagonalen Küstenfeldern wirken aus der Luft leicht gezackt (5-m-Geländeraster).

## Bitte am Handy testen
1. **Strecken besorgen:** am Handy https://zak.stunts.hu → *Downloads* → „zak-track-pack.zip“ (2600
   Strecken) oder „competition-archive-2024.zip“ (Wettbewerbsstrecken, empfehlenswert) laden. Im Spiel
   Menü → **📂 Strecke laden** → **Datei wählen** → die ZIP aus „Downloads“ wählen (bis 400 Strecken werden
   übernommen). Einzelne .TRK/.RPL gehen genauso. Alternativ archive.org, Suche „stunts tracks“.
2. Eine bekannte Strecke wählen (Minikarte!), **▶ Fahren** – wie lange dauert Laden + Probefahrt?
3. Auf **Leicht** eine Runde: Sprünge, Korkenzieher, Röhre, Hochstraße – wirkt es wie „damals“?
4. **Mittel/Original** probieren; Kamera (näher) in Tunnel/Röhre/Wendel ok? Ruckelt es auf großen Strecken?
5. Strecken **löschen**, Handy neu starten → bleibt die Bibliothek erhalten?
6. Welche Elemente sehen falsch aus oder fahren sich komisch? (Foto + Streckenname genügt.)

## Vorschlag Nacht 3
Horizont-Kulissen (Wüste/Alpen/Stadt), Hang-Sonderfälle, zweite Spur an Abzweigen als gültiger Weg,
Autopilot ohne Hilfen an Slalom/Hochstraßen-Kurven verbessern, danach Feintuning nach deinem Handy-Test.
