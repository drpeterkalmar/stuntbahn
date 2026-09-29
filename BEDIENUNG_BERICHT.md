# Stuntbahn – Bedienung n15: Straße im Cockpit, größere Tasten, Leicht ohne Bestzeiten (29.09.2026)

Peters Wünsche (28./29.09.): „Im Cockpit sieht man die Straße nicht.“ · „Tasten bei Mittel und Schwer vergrößern.“ ·
„Leicht-Modus soll keine Highscores machen, nur Zeit notieren.“ · „Bei der Stoßstangenperspektive die zwei Striche
entfernen.“ · „Kein versehentlicher Doppeltipp-Zoom am Handy.“
**Live:** https://drpeterkalmar.github.io/stuntbahn/

## 1. Cockpit: Straße sichtbar
**Ursache (gemessen):** Der Blick lag mittig (Horizont bei 43–47 % der Bildhöhe), und das Armaturenbrett begann genau am
Horizont. Hochkant (vertikal 75°, also viel Bild unter dem Horizont) war die ganze untere Hälfte Armaturenbrett und
Lenkrad. Fahrbahn gab es nur ab 43–110 m Entfernung als schmalen Streifen. Die Augenhöhe (0,45 m) war nicht das Problem.

**Änderungen:**
- **Horizont ins obere Drittel** per Objektiv-Verschiebung (`setViewOffset`): Das Bild wird nach unten verschoben,
  ohne die Kamera zu neigen. Das feste Sichtfeld bleibt (quer 75° waagrecht, hochkant 75° senkrecht), Senkrechte bleiben
  senkrecht. Horizont quer bei 32 %, hochkant bei 30 %.
- **Armaturenbrett tief:** Die Oberkante liegt bei 70 % der Bildhöhe, Instrumente und Hutze darunter, das Lenkrad ist flacher
  (Neigung 6° statt 14°). Die hintere Kante der Hutze ragte vorher als „Kuppel“ ins Bild; sie wird jetzt in
  Bildschirm-Pixeln gebaut.
- **Hochkant** sitzen die Rundinstrumente zwischen 🦘 und 🔥 über der Tastenreihe (vorher darüber gestapelt).
- **Drei Stufen je nach Platz:**
  - „voll“: 2 Rundinstrumente mit Schaltkulisse.
  - „kompakt“: 2 Rundinstrumente mit Gang-Schild, z. B. auf 360-px-Handys.
  - „HUD“: Tempo und Gang digital, nur bei sehr engem Querformat 740×360 mit großen Tasten.
  Das Armaturenbrett rückt in keiner Stufe mehr nach oben.
- **Ruhiger:** Nicken und Wanken der Federung werden voll statt halb ausgeglichen, das Auf und Ab des Aufbaus ebenfalls.
  Das Nachfedern des Kopfes bei Landungen ist entfallen. Das feste Sichtfeld bleibt.
- **Regler:** `?eye=` (Augenhöhe, Standard 0,45), `?hz=` (Horizont), `?dash=` (Oberkante Armaturenbrett), `?cpsusp=`
  (Federungs-Ausgleich; 0,5 entspricht dem alten Stand).

**Messung** (`tests/cockpit_sicht.py`, Pixel 7, Mittel mit Touch-Tasten). „Fahrbahn“ ist der Anteil der Bildzeilen mit
freier Fahrbahn; die Sichtweite ist gemessen per Strahltest gegen Strecke und Gelände, mit Maske des Cockpits.

| Stelle | hoch vorher | **hoch nachher** | quer vorher | **quer nachher** |
|---|---|---|---|---|
| Demo-Strecke, Gerade | 2 % (ab 112 m) | **40 % (ab 1,7 m)** | 7 % (ab 43 m) | **38 % (ab 4,3 m)** |
| 4711-1, Gerade | 0 % | **38 %** | 4 % (ab 45 m) | **34 % (ab 4,3 m)** |
| 4711-1, Kurve | 0 % | **36 %** | 5 % (ab 44 m) | **34 % (ab 4,3 m)** |
| 4711-1, vor der Kuppe (bergauf) | 0 % | **26 %** | 0 % | **7 % (5–11 m)** |
| Horizont (Gerade) | 47 % | **30 %** | 43 % | **32 %** |
| Oberkante Brett/Lenkrad (Mitte) | 47 % | **67 %** | 43 % | **62 %** |

Zielwert ≥ 30 % erreicht auf Geraden und in Kurven, hoch wie quer. Ausnahme ist die Anfahrt einer Kuppe: Dort zeigt die
Nase bergauf, und hinter der Kuppe fällt die Straße weg. Das ist wie im echten Auto; vorher war dort gar nichts zu sehen.

**Wackeln** (Hochpass über 0,5 s, 12 s Autopilot auf einer Strecke mit Bodenwellen):

| | Nicken | Wanken |
|---|---|---|
| vorher | 0,41° | 0,069° |
| nachher | **0,38°** | **0,053°** |

Der Rest kommt von der Fahrbahn selbst: Stärkeres Glätten hatte ich geprüft (Rate 2/8/16), es änderte nichts.

Fotos: `tests/shots/final/n15_cockpit_{quer,hoch}_{vorher,nachher}.jpg`, `n15_cockpit_*_kurve.jpg`,
`n15_cockpit_kompakt_klein.jpg`, `n15_cockpit_hud_kleinq.jpg`.

## 2. Größere Touch-Tasten (Mittel/Original)
- **Optionen → „Tastengröße“:** Normal (Stand bis 28.09.) / **Groß** (Standard, +30 %) / Riesig (+50 %). Leicht
  (Bildschirmhälften) ist unverändert, die Extras-Knöpfe bleiben dort, wo sie waren.
- **Trefferfläche** 6 px je Seite größer als die sichtbare Taste. Technisch ist das ein transparenter Rand; bei 12 px
  Abstand stoßen die Trefferflächen aneinander, überlappen aber nie. Die Trefferfläche bleibt außerhalb von Notch und
  Gestenleiste.
- **Extras (🦘/🔥) und Tempo** rücken mit der Tastenhöhe nach oben. Die Cockpit-Instrumente messen den freien Platz selbst.

| sichtbare Größe (px) | Lenken | Bremse | Gas |
|---|---|---|---|
| quer vorher | 86×86 | 92×86 | 104×118 |
| **quer Groß** | **112×112** | **120×112** | **135×153** |
| quer Riesig | 129×129 | 138×129 | 156×177 |
| hoch vorher (412 px breit) | 72×80 | 72×80 | 86×96 |
| **hoch Groß** | **81×104** | **81×104** | **97×125** |

Hochkant begrenzt die Breite (vier Tasten in einer Reihe, 24 px zwischen Lenk- und Pedaltasten), deshalb wachsen die
Tasten vor allem in der Höhe (Fläche +46 %).

**Nachweis** (`tests/test_touch.py`, Bounding-Boxen hoch und quer, Verfolger und Cockpit, Normal/Groß/Riesig):
- Größen wie in der Tabelle, Abstand ≥ 12 px.
- Keine Überlappung mit dem Auto (projizierte Modell-Box), Tempo, Extras, HUD oben und Instrumenten.
- `hochformat_shots.py`: Layout auf 6 Geräten (Pixel 7, iPhone 14, 360er hoch und quer), 96/96 Prüfungen.
- Fotos: `n15_tasten_gross_{hoch,quer}.jpg`, `n15_tasten_gross_cockpit_{hoch,quer}.jpg`, `n15_tasten_riesig_cockpit_quer.jpg`.

## 3. Leicht: Zeit statt Bestzeit
- Auf Leicht gibt es keine Bestzeit-Wertung, keinen „Neue Bestzeit!“-Jubel und kein Geisterauto. Rang- oder
  Medaillen-Anzeigen gab es nicht.
- Das Ergebnis zeigt „**Deine Zeit**“ und „Deine letzten Zeiten hier“: die letzten 5 je Strecke, neueste oben, mit Datum
  und Crash-Zahl; die gerade gefahrene ist grün hervorgehoben.
- Im HUD steht „Zuletzt …“ statt „Beste …“.
- Menü, Bibliothek und Sammlung zeigen nur noch 🟡/🔴-Bestzeiten, im Menü dazu „🟢 zuletzt …“.
- Die Sammlungs-Sortierung „Eigene Bestzeit“ und der Filter „mit meiner Bestzeit“ nutzen auf Leicht Mittel/Original.
- **Alte Leicht-Bestzeiten** bleiben unverändert gespeichert. Die der aktuellen Physik kommen einmalig als Eintrag
  („früher“) in die Zeiten-Liste.
- Mittel und Original werten wie bisher.
- Tests:
  - `tests/test_leicht_zeiten.py` (Browser): Leicht bis ins Ziel → keine Bestzeit und kein Geist gespeichert, Zeit in der
    Liste, zweite Fahrt oben. Danach Mittel → Bestzeit und Geist wie bisher.
  - `tests/node/test_leicht_zeiten.mjs`: Speicher, Übernahme, 5er-Liste, Neuladen.
  - `test_race.py` fährt jetzt auf Mittel.
  - `test_sammlung_ui.py` holt die Bestzeit aus einer Mittel-Fahrt.
- Fotos: `n15_leicht_ergebnis.jpg`, `n15_leicht_menue.jpg`.

## 4. Stoßstangen-Kamera ohne Striche
Per Foto bestätigt: Die Kamera saß 0,2 m hinter der Wagenmitte **in** der Karosserie. Die zwei Querstriche waren die
Dachkante und der Scheibenrahmen des eigenen Autos, dazu Motorhaube und Innenraum. Das Auto bedeckte 28–39 % des Bildes.

Jetzt sitzt die Kamera 12 cm vor der Frontschürze und etwa 42 cm über der Fahrbahn. Maße kommen aus der Modell-Box.
Das Auto bleibt sichtbar (Schatten), liegt aber hinter der Kamera: **0 % eigenes Auto im Bild**, auch mit Nitro und im
Replay, hoch und quer (`tests/stossstange_shots.py`).

Fotos: `n15_stossstange_quer_{vorher,nachher}.jpg`, `n15_stossstange_hoch_replay_{vorher,nachher}.jpg`.

## 5. Kein versehentlicher Doppeltipp-Zoom
- **Scrollbereiche** haben `touch-action: pan-y` (scrollen ja, zoomen nein): Menü hochkant, Menüspalte bei niedrigem
  Querformat, Pause-, Ergebnis- und Blatt-Karten, Streckenliste. Vorher standen sie auf `auto`, weil touch-action nur bis
  zum nächsten Scrollbereich wirkt.
- **Knöpfe, Listeneinträge, Karten, Chips, Eingaben** haben `manipulation`. Spielfläche und Touch-Tasten bleiben `none`.
- **Eingaben/Auswahl** mit mindestens 16 px Schrift.
- **iOS:** `gesturestart`/`gesturechange`/`gestureend` und `dblclick` auf dem Dokument werden abgefangen.
- Kein pauschales `preventDefault` auf touchstart/touchend, damit Klicks und die Ton-Freischaltung bleiben.
- `tests/test_zoom.py` (Pixel 7 hochkant, 19 Prüfungen):
  - Jeder Scrollbereich in Menü, Streckenliste mit Sammlung, Optionen, Rennen, Pause und Ergebnis hat touch-action.
  - Eingaben haben ≥ 16 px Schrift.
  - CDP-Doppeltipps auf Menü, Streckenliste, Pause, Ergebnis, HUD-Knopf, Spielbild und GAS: `visualViewport.scale`
    bleibt 1.
  - Doppel-Tap auf GAS und zwei schnelle Einzeltaps ergeben je **2 Auslösungen**, danach hängt keine Taste.
- **Ehrlich:** Chromium hält sich ohnehin an `user-scalable=no`. Ob iOS Safari jetzt wirklich nicht mehr zoomt, lässt
  sich nur am iPhone prüfen (siehe unten).

## Tests (alle grün, 0 Seitenfehler)
- **Node:** `npm run test:node` 17/17, neu `test_leicht_zeiten.mjs`.
- **Browser:** smoke, test_cockpit_ui, test_touch (quer + hoch), test_hochformat, test_race, test_sammlung_ui,
  test_reset_ui und test_extras_ui.
- **Weitere Browser-Läufe:** hochformat_shots (6 Geräte), cockpit_shots quer 10/10, hoch 5/5 und desktop 10/10 (Zeiger =
  Tempo/Drehzahl), dazu neu test_leicht_zeiten und test_zoom.
- **Service-Worker:** neue Version (Cache-Busting).

## Grenzen
- Hochkant beginnt die Fahrbahn schon ~1,7 m vor dem Auge. Die Motorhaube fehlt, weil die Außenkarosserie im Cockpit
  ausgeblendet ist.
- Beim Einlenken dreht das Lenkrad mit; hochkant laufen die Speichen dann kurz über die Instrumente, wie bisher.
- Sehr enges Querformat (740×360) mit Tastengröße Groß/Riesig: Dort zeigt das Cockpit das Tempo digital, weil zwischen
  den Tasten kein Platz für Rundinstrumente ist. Auf 390er iPhones quer sind die Instrumente kompakt (80 px).
- Das „Wackeln“ ist nur etwas geringer: Den Großteil macht die Fahrbahn selbst.

## Bitte am Handy testen
1. **Cockpit** (🎥), hoch und quer: Siehst du die Straße gut? Sitzt der Horizont angenehm? Wird dir auf Bodenwellen,
   Sprüngen oder im Looping schlecht?
2. Sind Tacho, Drehzahl und Gang noch gut lesbar? Kleines Handy: Ist das runde Gang-Schild erkennbar?
3. **Tasten Mittel/Original:** Passt „Groß“? Optionen → Tastengröße → Normal/Riesig probieren. Verdecken die Tasten etwas
   Wichtiges? Triffst du die richtige Taste?
4. **Leicht** bis ins Ziel: Steht „Deine Zeit“ und die Liste der letzten Zeiten da? Gibt es keinen Bestzeit-Jubel und kein
   Geisterauto?
5. **Replay → 🎯 Stoßstange:** freie Sicht, keine Striche?
6. **Zoom (iPhone):** Menü, Streckenliste und Pause-Blatt zweimal schnell antippen und mit zwei Fingern
   auseinanderziehen. Es darf nichts zoomen. Zwei schnelle Taps auf GAS sollen weiter zweimal Gas geben.
