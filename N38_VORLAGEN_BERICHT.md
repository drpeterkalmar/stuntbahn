# N38 – Stunt-Kette lädt Nitro, Landeschub, Zwischenzeiten (nach Vorlagen) – Bericht

Stand 18.10.2026 · Version **0.8.0** · live: https://drpeterkalmar.github.io/stuntbahn/
**Grundlage:** Vorlagen-Datenblatt von Hermes (Stand 10.10.2026, Vorlagen A–D). Umgesetzt ist nur Mechanik mit eigenen Zahlen
(Clean-Room): Es wurde kein Code der Vorlagen gelesen oder übernommen, es gibt keine Assets und keine Namen im Spiel.
**Nachtrag 15.10. hat Vorrang:** Nitro ist seit 09baf5b unbegrenzt mit Abklingzeit. Deshalb füllen Stunts keinen Tank, sondern
**verkürzen die Nitro-Ladezeit**; der „Tank“ des Datenblatts wurde in Ladezeit umgerechnet.

Peters Wunsch (10.10.): „Ein Nachahmer kopiert eine Idee, ein Genie tausende – implementiere alle guten Vorlagen in jedes
Spielprojekt.“

## 📱 Handy-Test für Peter
1. **Mittel**, Strecke `4711-2` (gleich nach dem Start kommt eine Schanze). Den 🔥-Knopf einmal drücken, damit Nitro nachlädt
   (Ring mit Sekunden). Dann über die Schanze, in der Luft **Gas kurz antippen** (Salto) und danach nichts mehr drücken.
   - Nach der Landung steht oben „Salto · ✈ 2,2 s · **ruhige Hand ×1,5** · +78“ und darunter „🔥 **Nitro sofort bereit!**“.
     Der Knopf leuchtet.
   - Ist der Nitro schon bereit, steht dort „🔥 +… s Nitro-Vorrat“, und um den Knopf läuft ein **goldener Ring**. Ist der Ring
     voll, ist der Nitro nach dem nächsten Ausbrennen sofort wieder da.
2. **In der Luft:** Der Ton wird dumpf. An den hinteren Ecken ziehen zwei Streifen: **gold** heißt, „ruhige Hand“ ist noch
   drin; **blass** heißt, du hast in der letzten Sekunde etwas gedrückt, dann gibt es nur noch „sauber ×1,25“.
3. **Nach einer sauberen Landung** gibt es kurz Schub (kleine Flammen, „🚀 Landeschub“). Er setzt von selbst aus, bevor du zu
   schnell für die nächste Schanze oder Kurve wirst.
4. **Looping, Korkenzieher, Röhre, Zickzack** bringen jetzt auch Punkte und Nitro, z. B. „Looping +37“.
5. **Zwischenzeiten:** Fahr dieselbe Strecke zweimal. Beim zweiten Mal steht an jedem Checkpoint unter der Zeit **blau −0,42**
   (schneller) oder **rot +0,31** (langsamer). Im Ziel steht unter den Knöpfen die Tabelle je Abschnitt.
6. **Drift-Turbo ausprobieren** (Standard aus): denselben Link mit **`?driftturbo=1`** öffnen und **Original** fahren. Wenn das
   Auto in der Kurve rutscht, füllt sich oben links unter der Zeit ein Balken. Sobald er **rot** wird, **Bremse kurz antippen**:
   Das gibt kurz Schub. Frage an dich: Trifft man das am Daumen? Soll es Standard werden?
7. Mittel- und Original-Bestzeiten **starten einmalig neu** (Hinweis im Menü). Leicht-Zeiten bleiben.
8. Zum Vergleich mit gestern: `?tank=0&kette=6&stuntpkt=0&landung=0&landeschub=0&zwischen=0` (wertet nicht).

## Releases (je Etappe aus Abschnitt 4 des Datenblatts)
| Etappe | Version | Inhalt |
|---|---|---|
| E1 Stunt-Kette lädt Nitro | 0.7.1 | Punkte → Ladezeit, Vorrat, Bauwerke als Stunt, ruhige Hand, Kette 12 s, Leicht-Automatik auf mehreren Geraden |
| E2 Landeschub + Luft-Ton + Schweif | 0.7.2 | Schub nach sauberer Landung mit Tempo-Deckel, Tiefpass in der Luft, Landestufen-Schweif |
| E3 Zwischenzeiten | 0.7.3 | Checkpoint-Abstand zur Bestfahrt, Abschnitts-Tabelle im Ziel, Speichern mit der Bestzeit |
| E4 Drift-Turbo (optional) | 0.7.4 | Brems-Tipp in der roten Zone, Standard aus (`?driftturbo=1`) |
| Abschluss | 0.8.0 | Bericht, README, Mess-Gate-Szene „Leicht mit Stunts“, Collagen |

## Arbeitsliste (Datenblatt Abschnitt 3: „übernehmen/anpassen“ mit Wirkung ≥ 3)
| Mechanik | Wirkung | Stand |
|---|---|---|
| Nitro-Tank (Vorlage A/D) | 5 | ✓ als **Ladezeit-Gutschrift** (Nachtrag 15.10.): 60 Punkte = eine ganze Ladezeit (5 s), Vorrat bis eine Ladezeit, Crash-Landung zahlt nicht |
| Stunt-Punkte live (B) | 4 | ✓ n37-Formel; neu: Bauwerke (Grundwerte des Highlight-Films), gerade Schanze nicht mehr halbiert (Messgröße 3) |
| Landestufe (B, Schweif) | 4 | ✓ sauber ×1,25 (n37), **ruhige Hand ×1,5** (1,0 s ohne Eingabe-Änderung), Schweif gold/blass |
| Kette (B/D) | 5 | ✓ Zuschläge wie n37, Fenster **12 s** (gemessen, Deckel 12 s), pausiert in der Luft, Nitro zünden +1 s, Hüpfer sind kein Glied |
| Luftzeit-Landeschub (A) | 4 | ✓ 1,2/2,0/2,8 s → 0,8/1,0/1,2 s mit k 0,35/0,5/0,7, Deckel = 0,97 × Fenster-vmax der nächsten Schanze und Brems-Profil |
| Zwischenzeiten (B) | 4 | ✓ |
| Ton in der Luft (D) | 3 | ✓ Tiefpass 1,2 kHz ab 0,5 s, zurück in 0,08 s + Bass-Schlag |
| Drift-Turbo (A) | 3 | ✓ hinter `?driftturbo=1` (Datenblatt: Standard erst nach Handy-Test), Variante `=2` ohne Timing (lädt Nitro) |
| Wiederholung, Crash kostet, Hüpfer-Komfort, Geist kompakter | 1–2 | nicht gebaut (Wirkung < 3 bzw. „weglassen“); Wiederholung ½ gab es schon seit n37 |
| Respawn mit Tempo | – | schon da (weglassen) |

## Messtabelle Vorlage-Ziel / vorher (n37) / nachher (n38)
Werkzeuge: `tools/lohn_mess.mjs 7` (63 Zufallsstrecken, Generator-Version 2: flach, Hochstraße, Gelände, je 21 je Stufe),
`tools/landeschub_mess.mjs 60 --zufall=8` (78 Strecken, davon 60 aus der Sammlung), `tools/driftturbo_mess.mjs`,
`tools/arcade_quote.mjs 4`, `tests/perf_gate.py`.
„Profi“ = Mittel, lenkt wie der Autopilot, Vollgas außer „Bremsen!“/„langsamer ▼“, tippt in der Luft einen Salto, zündet Nitro,
sobald er bereit ist. Vorher = alle n38-Regler aus (bitgleich n37).

| # | Messgröße | Ziel laut Datenblatt | vorher (n37) | nachher (n38) |
|---|---|---|---|---|
| 1 | Nitro-Einnahmen je Runde, Profi-Mittel (in ganzen Ladezeiten à 5 s) | Sanft 0,5–1 · Sportlich 1,5–2,5 · Irre 2–3 | 0 / 0 / 0 (Stunts zahlten nichts) | **0,83 / 1,67 / 2,44** ✓ (Leicht: 0,79 / 1,36 / 2,08) |
| 2 | Rundenzeit-Gewinn durch Stunt-Nitro | 2–6 % | – | Profi-Mittel **+0,1 / 0,0 / −0,7 %** (Nitro war mit Abklingzeit schon 6,6 / 9,1 / 10,4× je Runde da, jetzt 7,3 / 10,0 / 11,4×); **Leicht** (Extras automatisch) **+3,2 / +2,8 / +2,8 %** ✓ |
| 3 | Punkte je Schanze (2,6 s, gerade, sauber) | 30–40 | 16 | **33** (sauber), **39** (ruhige Hand); gemessen Leicht Ø 38–39 ✓ |
| 4 | Kettenlänge | Sportlich Median 2–4, Irre 4–7; Fenster nie > 12 s | Median 1; Ketten ≥ 2: 2/26 (Sportl.), 3/27 (Irre) | Median **1**; Ketten ≥ 2: **17/42** und **20/55**, längste 3–4; Fenster ≤ 12 s ✓ – **Median nicht erreicht** (siehe unten) |
| 5 | Landeschub-Sicherheit | 0 zusätzliche Crashs; Tempo nach Schub ≤ vmax | Leicht/Profi 0 Crashs; Mensch-Vollgas 1089, Handy 869 (2 Seeds) | Leicht/Profi **0**; Vollgas **1077**, Handy **867**; zu schnell an der Lippe mit aktivem Schub **0** (gesamt 200/246 → 198/241 bzw. 35/301 → 34/300) ✓ |
| 6 | Dauer-Hüpfen | < 15 % der Einnahmen | Hüpfer halten die Kette (Hüpf-Bot Median 4–5) | **0 %**: Hüpfer zahlen nicht ein und sind kein Kettenglied ✓ |
| 7 | Zwischenzeiten | Σ Abschnitte = Ziel ±0,01 s | – | exakt (Test: Brachial gegen Sauber −7,45 = −7,45) ✓ |
| 8 | Ton in der Luft | ab 0,5 s Luft, zurück ≤ 0,1 s | – | Browser: im Flug **1200 Hz**, 120 ms nach dem Aufsetzen **20 kHz** (Zeitkonstante 27 ms → nach 0,1 s 97 %) ✓ |
| 9 | Drift-Turbo Trefferquote rot | 30–60 % am Handy | – | Bot-Modell (Reaktion 0,22 ± 0,15 s): **46 %** auf Original, ~10 Drifts je Runde, Zeit −0,6 %; **Handy-Test offen** |
| 10 | Kompatibilität | Regler aus = bitgleich, alte Codes grün | – | **bitgleich n37** (9 Fahrten à 60 s, Leicht/Mittel/Original mit Nitro, Hüpfer, Saltos: `tests/node/n38_ref.mjs`), `?physik=alt` bitgleich n36, alte Codes grün ✓ |
| 11 | Leistung p95 (CPU ×4, DPR 2,6) | ±2 %, 0 Fehler | Rennen Standard hoch/quer p95 5,8 / 6,5 ms | 6,0 / 6,6 ms (+3 / +2 %, dort ist n38 aus → Rauschen); neue Szene **Leicht mit Stunts** hoch/quer 10,2 → 10,7 / 10,0 → 10,3 ms (**+5 / +3 %**; mit `tank=0&schweif=0` +1 %); 0 Fehler |

**Zu 2 (Mittel ohne Zeitgewinn):** Das Datenblatt ging von „1 Nitro je Runde“ aus. Seit dem 15.10. ist Nitro unbegrenzt. Ein
Mittel-Fahrer, der zündet, sobald der Knopf bereit ist, hat schon 7–11 Nitros je Runde, und die Gutschrift bringt +0,7 bis +1
Zündungen. Das ist im Rauschen der Rundenzeit. Spürbar ist die Gutschrift trotzdem: Nach einem Salto ist der Knopf sofort bereit.
Auf Leicht zündet der Autopilot jetzt auf bis zu 6 lohnenden Geraden statt nur auf der längsten, das bringt ~3 %.

**Zu 4 (Kette):** Die Schanzen und Bauwerke der Stuntbahn liegen im Mittel ~20 s auseinander (2,7 bzw. 4,8 Stunts je Runde auf
Sportlich/Irre). Auch mit dem größten erlaubten Fenster (12 s) bilden deshalb nur ~40 % der Stunts eine Kette. Eine Kette entsteht
bei Doppel-Elementen (Schanze → Looping, Röhre → Zickzack). Mehr ginge nur mit längeren Fenstern (über dem Datenblatt-Deckel) oder
mit mehr Kettengliedern (z. B. Drifts, Beinahe-Treffer mit Gegnern in n34).

**Zu 1 (Wert 60):** 120 Punkte je Ladung war der Startwert und brachte 0,41 / 0,85 / 1,49 (zu wenig). Mit 80 waren es
0,61 / 1,24 / 2,09, mit 60 dann 0,83 / 1,67 / 2,44, alle drei im Ziel. Mit 70 läge Sportlich knapp darunter.

**Zu 11:** Die Mehrkosten in der Stunt-Szene kommen etwa zur Hälfte daher, dass Leicht jetzt öfter Nitro zündet (Flammen und
Tempo-Streifen gab es vorher auch, nur seltener), und zur Hälfte vom Schweif. Den Schweif habe ich nach der ersten Messung auf
halbe Partikelzahl gesetzt (vorher quer +8 %, jetzt +3 %). Die Rennen-Szenen ohne n38 schwanken im selben Lauf um ±3 %, die
Kino-Szenen sogar um −14 / +12 %. Die Messgröße „±2 %“ liegt also unter dem Rauschen des Mess-Gates.

## Weitere Prüfungen
- **Crashs gesamt** (`arcade_quote.mjs 4`, 36 Strecken, n38 aus → an): Leicht Sauber/Brachial 36/36 ohne Crash (gleich),
  Mensch-Handy 65 → 56, Touch 110 → 118, Vollgas 185 → 180 (Rauschen).
- Profi-Mittel auf Irre: 0 → 2 Crashs auf 21 Strecken. Beide sind Salto-Landungen des Stunt-Bots auf einer Hochstraßen-Schanze,
  9–10 s nach dem letzten Nitro, mit `tank=0` 0 Crashs. Sie kommen also von leicht anderer Anfahrt, nicht von Nitro oder Schub
  an der Stelle. Mit `landeschub=0` gleich.
- **Drift auf Mittel:** Mit sauberer Lenkung rutscht das Auto auf Mittel nie über 7° (Schleuderschutz und Haftung), Mensch-Bots
  liegen 98 % der Zeit unter 10°. Darum ist die Drift-Schwelle je Stufe getrennt: Original 15° wie im Datenblatt, Mittel 7°.
- Node-Tests **49/49 grün** (neu: `test_lohn.mjs` mit 64 Prüfungen). Browser: `lohn_shots.py` quer + hoch grün (Salto lädt
  Nitro, Vorrat-Ring, Ton-Filter, Ergebniszeile, Zwischenzeiten, Ziel-Tabelle, Drift-Meter frei von Touch-Tasten),
  `smoke.py` und `test_race.py` 0 Fehler. `test_extras_ui.py`: nur der bekannte Fehlschlag „kleinq“, den es schon vor n37 gab.
- **Live:** `test_live.py` gegen GitHub Pages: Build stimmt, startet, 0 Fehler, offline spielbar.

## Gefunden und behoben
- Die erste Fassung des **Schubdeckels** nahm das Kurven-Tempo der nächsten 2,5 s, dadurch setzte der Schub praktisch nie ein
  (Deckel 74 km/h direkt nach der Landung). Jetzt gilt das Brems-Profil an der Stelle plus 0,5 s voraus; es enthält den Bremsweg
  zur Kurve schon.
- Der **Schweif** lag zuerst genau zwischen Auto und Verfolger-Kamera und war unsichtbar. Jetzt sind es Streifen an den hinteren
  Ecken, quer zur Flugbahn versetzt.
- „Nitro sofort bereit“ schaltete den Knopf erst einen Physikschritt später frei. Jetzt passiert es im selben Moment.
- **Checkpoint-Banner und Stunt-Anzeige** lagen übereinander, weil Checkpoints oft direkt hinter Schanzen liegen. Jetzt wartet
  die Stunt-Anzeige, bis das Banner weg ist.
- Die **Ergebnis-Karte** wurde mit Tabelle zu hoch. Tabelle und Stunt-Zeile stehen jetzt unter den Knöpfen, die damit am
  gewohnten Platz bleiben.
- `?physik=alt`-Referenz (n37): Sie vergleicht jetzt die Physik ohne die n38-Zutaten. Diese haben eigene Regler und einen
  eigenen Bitgleich-Test.

## Bilder
`tests/shots/n38/collage_quer.jpg`, `collage_hoch.jpg`: Salto im Flug, „Nitro sofort bereit“, Vorrat-Ring, Checkpoint mit
Zwischenzeit, Ziel-Karte mit Abschnitten, Drift-Meter.
Sichtprüfung (eigene Bewertung; das Hermes-Werkzeug `vision_analyze` gibt es in diesem Lauf nicht):
- Die Stunt-Anzeige ist hoch und quer gut lesbar und verdeckt keine Touch-Tasten.
- Der goldene Ring hebt sich klar vom Lade-Ring ab.
- Der Schweif ist als zwei goldene Lichtstreifen am Heck zu sehen. In der Zeitlupe der Testbilder ist er dünner, weil die
  Partikel in Echtzeit altern.
- Der Zwischenzeit-Abstand ist blau bzw. rot unter der Checkpoint-Zeit zu sehen.

## Regler (alle A/B, werten nicht außer Ton/Bild/Anzeige)
| Regler | Standard | 0 / alt |
|---|---|---|
| `?tank=<Punkte>` | 60 | 0 = nur Ladezeit wie bisher |
| `?kette=<s>` | 12 | 0 = keine Kette, 6 = n37 |
| `?stuntpkt=0/1` | 1 | 0 = Wertung wie n37 (nur Sprünge, ohne Drehung halb) |
| `?landung=0/1` | 1 | 0 = ohne „ruhige Hand“ |
| `?landeschub=0/1` | 1 | 0 = kein Schub |
| `?luftton=0/1` | 1 | 0 = Ton wie bisher |
| `?schweif=0/1` | 1 | 0 = kein Schweif |
| `?zwischen=0/1` | 1 | 0 = keine Zwischenzeiten |
| `?driftturbo=0/1/2` | **0** | 1 = Drift-Turbo mit Brems-Tipp, 2 = Driften lädt nur Nitro |
Alle Werte stehen in **einer** Parametergruppe: `src/game/lohn.js` (`LOHN`). In Node schaltet `STUNT_N38=alt` alle aus.

## Für n34 (KI-Gegner) und n36 (Action-Momente)
- Nitro-Gutschrift von außen: `race.lohnStunt({ pts, landing: 'ok' })` schreibt Ladezeit gut bzw. füllt den Vorrat und liefert
  `nitroSec`/`nitroNow`. Damit kann eine Rempler-Wertung (n34) Nitro geben, ohne eigene Logik.
- Ereignisse: `stunt` (jetzt auch Bauwerke: `bau: true, kind`; dazu `calm`, `schub`, `nitroSec`), `xgain`, `dturbo`; `checkpoint`
  und `finish` tragen `d` (Abstand zur Bestfahrt).
- Für n36 geeignet: „ruhige Hand“ und Luft ≥ 2 s als Auslöser für Bullet-Time; der Luft-Ton ist schon da.
- Offen: Replay und Geist zeigen den Landeschub nicht als Flamme (nur Nitro-Ereignisse werden aufgezeichnet).

## Offen / Grenzen
- Peters Handy-Test: Ist „ruhige Hand“ verständlich? Ist der Schweif am kleinen Bildschirm sichtbar genug? Drift-Turbo als
  Standard ja oder nein?
- Kettenlänge (Messgröße 4) wird bei den heutigen Abständen zwischen den Stunts nicht erreicht (siehe oben).
- Rundenzeit-Gewinn auf Mittel ≈ 0 (Nitro war schon fast immer da). Die Gutschrift ist ein Spaß-Bonus, kein Zeitvorteil.
