// Stunt-Lohn (n38) – Stunts sind im Rennen etwas wert. Vorlagen-Datenblatt ~/.hermes/plans/vorlagen/stuntbahn.md (Clean-Room:
// nur Mechanik und Größenordnungen in eigenen Worten, eigene Startwerte, Messung entscheidet; Berichte N38_VORLAGEN_BERICHT.md).
// EINE Parametergruppe für alle n38-Zutaten, jede hinter ihrem URL-Regler (0 = Verhalten bis n37):
//   tank      – Stunt-Punkte verkürzen die Nitro-Abklingzeit (Peter 15.10.: Nitro unbegrenzt mit Abklingzeit, daher kein Tank in
//               Ladungen): tank Punkte = eine ganze Abklingzeit (COOLDOWN.nitro). Lädt der Nitro gerade nach, läuft die Rest-
//               zeit um den Anteil ab; ist er bereit (oder brennt), wandert der Überschuss in einen Vorrat (höchstens eine ganze
//               Abklingzeit = „Vorrat voll“), der beim nächsten Zünden abgezogen wird – voller Vorrat = nach dem Ausbrennen sofort
//               wieder bereit. Crash-Landungen zahlen nichts ein. Auf Leicht zündet der Autopilot („Extras automatisch“) dann auf
//               jeder lohnenden Geraden, sobald der Nitro bereit ist (bis n37 nur auf der längsten). ?tank=<Punkte>, 0 = aus.
//   kette     – Fenster der Stunt-Kette (s, stunts.js STUNT.win): nächster Stunt innerhalb des Fensters → Kette +1; Nitro zünden
//               verlängert ein laufendes Fenster um nitroWin s. ?kette=<s>, 0 = keine Kette.
//   stuntpkt  – Bauwerke zählen als Stunt (Looping, Korkenzieher, Wendel, Röhre, Röhre mit Wand, Zickzack, Steilwand, Halfpipe;
//               Grundwerte wie der Highlight-Film, highlights.js HL) und ein Sprung ohne Drehung wird nicht mehr halbiert
//               (Messgröße 3 des Datenblatts: gerade saubere Schanze 30–40 Punkte). ?stuntpkt=0 = Wertung wie n37.
//   landung   – Landestufe „ruhige Hand“: saubere Landung ohne Änderung an Lenken/Gas/Bremse in den letzten calmT s vor dem
//               Aufsetzen → × calm statt × 1,25. ?landung=0 = nur „sauber“.
const q = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
const num = (k, lo, hi) => { if (!q) return null; const v = q.get(k); return v !== null && v !== '' && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : null; };
// Node: Umgebung STUNT_N38=alt = alle Regler aus (Messungen gegen den Stand n37)
const ALT = !!(globalThis.process && globalThis.process.env && globalThis.process.env.STUNT_N38 === 'alt');

export const LOHN = {
  tank: num('tank', 0, 2000) ?? 60,      // Messung (tools/lohn_mess.mjs): 60 → Profi-Mittel 0,8 / 1,6 / 2,7 Abklingzeiten je Runde (Sanft/Sportlich/Irre)
  kette: num('kette', 0, 12) ?? 12,    // s (n37: 6) – Stunts liegen weit auseinander; Deckel STUNT.winMax 12 s
  nitroWin: 1,
  stuntpkt: num('stuntpkt', 0, 1) ?? 1,
  landung: num('landung', 0, 1) ?? 1,
  calmT: 1.0,       // s ohne Eingabe-Änderung vor dem Aufsetzen
  calm: 1.5,        // Faktor „ruhige Hand“ (statt sauber × 1,25)
  autoSpots: 6,     // Leicht automatisch: höchstens so viele Nitro-Stellen je Runde
  hopChain: 0,      // Hüpfer zählen nicht als Kettenglied (n37: 1)
  hopPay: 0,        // Anteil, den ein Hüpfer-Stunt in die Abklingzeit einzahlt (Messgröße 6: Dauer-Hüpfen < 15 % der Einnahmen)
  hopWin: 20,       // s: jeder weitere Hüpfer-Stunt in diesem Zeitraum zahlt nur halb so viel ein wie der vorige
  // Bauwerke: Punkte = base · (0,6 + 0,4 · min(1,5, mittleres Tempo / v0)); Steilwand/Halfpipe: base + perS · Zeit steil
  bau: {
    loop: { base: 42, v0: 40, over: true }, cork: { base: 48, v0: 40 }, wendel: { base: 36, v0: 35 }, tube: { base: 28, v0: 40 },
    tubewall: { base: 50, v0: 30, over: true }, zigzag: { base: 16, v0: 22 },
    wall: { base: 24, perS: 14, upY: 0.5 }, halfpipe: { base: 26, perS: 10, upY: 0.8 },
  },
};
// Stand n37: alle Regler aus
export const LOHN_AUS = { tank: 0, kette: 6, nitroWin: 0, stuntpkt: 0, landung: 0, hopChain: 1 };
export function setLohn(o) { Object.assign(LOHN, o); }
if (ALT) setLohn(LOHN_AUS);

// Sekunden Abklingzeit, die pts Stunt-Punkte wert sind (cdNitro = ganze Abklingzeit in s)
export function cooldownGain(pts, cdNitro, tank = LOHN.tank) { return tank > 0 && pts > 0 && cdNitro > 0 ? pts / tank * cdNitro : 0; }

// Gutschrift sec auf den Nitro-Zustand x = { ready (bereit), cd (Rest-Abklingzeit s), bank (Vorrat s) } mit ganzer Abklingzeit
// full; liefert { cd, bank, used (auf die Restzeit), stored (in den Vorrat) } – lädt er gerade nach, zuerst die Restzeit
export function creditNitro(x, sec, full) {
  let cd = x.cd, bank = x.bank || 0, used = 0;
  if (!x.ready && cd > 0) { used = Math.min(sec, cd); cd -= used; sec -= used; }
  const nb = Math.min(full, bank + sec);
  return { cd, bank: nb, used, stored: nb - bank };
}
