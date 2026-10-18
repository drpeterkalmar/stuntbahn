// Uhr-Abgleich (n35 Netz-Schicht, spielunabhängig): jedes Gerät schätzt den Versatz seiner eigenen Uhr zur
// Sitzungsuhr (= Uhr des ersten Gastgebers; ein neuer Gastgeber führt sie mit seinem Versatz weiter, damit Startzeit,
// Zieleinläufe und Puffer nach einem Wechsel nicht springen).
// Verfahren wie NTP: Gast sendet t0 (eigene Uhr), Gastgeber antwortet mit seiner Sitzungszeit th, Gast misst t2.
// Laufzeit rtt = t2 − t0, Versatz o = th + rtt/2 − t2. Aus den letzten FENSTER Proben zählen die mit der kleinsten
// Laufzeit (Anteil BESTE) – dort ist der Fehler durch ungleiche Hin-/Rückwege am kleinsten; davon der Median.
// Schätzfehler ≤ halbe Laufzeit-Asymmetrie; bei 150 ms Ping mit Schwankung typisch < 10 ms (Test).
// Node-Test: tests/node/test_netz.mjs.

// Abgestimmt auf 40 Zufalls-Netze (150 ms Ping, ±60 ms je Richtung, 5 % Verlust): Start-Spanne 3 Geräte max 33 ms, Mittel 12 ms
export const UHR = { fenster: 24, beste: 0.2, schnell: 6, takt: 300, taktStart: 120, glatt: 0.25, sprung: 40 };

export class UhrAbgleich {
  constructor(jetzt) {
    this.jetzt = jetzt;            // () => ms der eigenen Uhr (performance.now)
    this.versatz = 0;              // Sitzungszeit = jetzt() + versatz
    this.proben = [];              // [{ rtt, o }]
    this.fest = false;             // Gastgeber: Versatz ist maßgeblich (wird nicht nachgeführt)
    this.gueltig = false;          // mindestens eine Probe (bzw. Gastgeber)
    this.rtt = null;               // Median der Laufzeit (ms) – Anzeige, Puffer
  }
  zeit() { return this.jetzt() + this.versatz; }
  // Gastgeber werden: eigene Schätzung wird zur Sitzungsuhr (ohne Sprung)
  alsGastgeber() { this.fest = true; this.gueltig = true; }
  alsGast() { this.fest = false; }
  // Antwort auf eine Uhr-Anfrage auswerten
  probe(t0, th, t2 = this.jetzt()) {
    if (this.fest) return;
    const rtt = t2 - t0;
    if (!(rtt >= 0) || rtt > 10000) return;
    const o = th + rtt / 2 - t2;
    this.proben.push({ rtt, o });
    if (this.proben.length > UHR.fenster) this.proben.shift();
    const s = this.proben.slice().sort((a, b) => a.rtt - b.rtt);
    const k = Math.max(1, Math.round(s.length * UHR.beste));
    const os = s.slice(0, k).map((p) => p.o).sort((a, b) => a - b);
    const ziel = os[(os.length - 1) >> 1] * 0.5 + os[os.length >> 1] * 0.5;
    const rs = this.proben.map((p) => p.rtt).sort((a, b) => a - b);
    this.rtt = rs[rs.length >> 1];
    // erste Proben bzw. großer Fehler: direkt übernehmen; sonst (auch nach einem Gastgeber-Wechsel – der alte Versatz
    // ist ein guter Startwert) sanft nachführen, damit Puffer und Countdown nicht springen
    if (!this.gueltig || (this.proben.length <= UHR.schnell && !this.bezugAlt) || Math.abs(ziel - this.versatz) > UHR.sprung) this.versatz = ziel;
    else this.versatz += (ziel - this.versatz) * UHR.glatt;
    this.gueltig = true;
  }
  // nach Gastgeber-Wechsel: alte Proben (gegen den alten Gastgeber) verwerfen, Versatz bleibt als Startwert
  neuerBezug() { this.proben.length = 0; this.bezugAlt = this.gueltig; }
  // wie oft fragen (ms): anfangs schnell, dann im Takt
  abstand() { return this.proben.length < UHR.schnell ? UHR.taktStart : UHR.takt; }
}
