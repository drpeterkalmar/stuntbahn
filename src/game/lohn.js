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
//   landeschub – (Etappe 2) saubere Landung nach langer Luftzeit gibt einen kurzen Schub (Stufen schub: [ab Luft s, Dauer s, Stärke
//               k wie NITRO.k]); nie schneller als das sichere Absprungtempo der nächsten Schanze (Tempo-Fenster vmax) und das
//               Brems-Profil der nächsten schubLook s (es enthält den Bremsweg zu Kurven, Loopings) – darüber setzt der Schub aus. Hüpfer und Bauwerke nicht.
//               ?landeschub=0 = aus.
//   luftton   – (Etappe 2) ab tonAb s in der Luft wird der ganze Ton dumpf (Tiefpass auf tonHz, weich in tonIn s), bei der Landung
//               in tonOut s zurück + kurzer Bass-Schlag. ?luftton=0 = aus.
//   schweif   – (Etappe 2) in der Luft (ab 0,5 s) zieht das Auto einen Schweif: hell = „ruhige Hand“ noch drin, matt = nur noch
//               „sauber“. ?schweif=0 = aus.
//   zwischen  – (Etappe 3) Zwischenzeiten: an jedem Checkpoint der Abstand zur Bestfahrt derselben Wertung (blau schneller, rot
//               langsamer), im Ziel eine Tabelle je Abschnitt; die Zwischenzeiten werden mit der Bestzeit gespeichert (Leicht: mit
//               den letzten Zeiten, Vergleich mit der schnellsten davon). ?zwischen=0 = keine Anzeige.
//   driftturbo – (Etappe 4, Standard AUS bis zum Handy-Test) Mittel/Original: Rutschwinkel ≥ deg füllt in fill s ein Meter, die
//               zweite Hälfte ist die rote Zone. Bremse ANTIPPEN (≤ tap s) in der roten Zone = Mini-Turbo (Stärke linear 0 → k,
//               Dauer d0 … d1 s, je später, desto mehr; Deckel wie der Landeschub), im grünen Bereich = Meter leer, kein Schub;
//               höchstens max je Drift; Meter läuft voll ohne Tipp = Serie vorbei. ?driftturbo=1. ?driftturbo=2 = Touch-Variante
//               ohne Timing: Driften lädt nur den Nitro nach (pts Punkte je s, wie Stunt-Punkte).
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
  landeschub: num('landeschub', 0, 1) ?? 1,
  schub: [[1.2, 0.8, 0.35], [2.0, 1.0, 0.5], [2.8, 1.2, 0.7]],
  schubFade: 0.25,  // s weich aus
  schubLook: 0.5,   // s voraus: Brems-Profil (vt, enthält schon den Bremsweg zu Kurven/Loopings) als Deckel
  schubRand: 0.97,  // Anteil des Tempo-Fensters der nächsten Schanze (vmax), über dem der Schub aussetzt
  luftton: num('luftton', 0, 1) ?? 1,
  tonAb: 0.5, tonHz: 1200, tonIn: 0.3, tonOut: 0.08,
  schweif: num('schweif', 0, 1) ?? 1,
  zwischen: num('zwischen', 0, 1) ?? 1,
  driftturbo: num('driftturbo', 0, 2) ?? 0,
  dt: { deg: { medium: 7, original: 15 }, vMin: 15, fill: 0.96, tap: 0.2, k: 0.5, d0: 0.4, d1: 1.0, max: 3, end: 0.3, pts: 8 },
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
export const LOHN_AUS = { tank: 0, kette: 6, nitroWin: 0, stuntpkt: 0, landung: 0, hopChain: 1, landeschub: 0, luftton: 0, schweif: 0, zwischen: 0 };
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

// Landeschub-Stufe nach einem abgerechneten Stunt r → null oder { stufe (1 …), dur, k }
export function landBoostStage(r) {
  if (!LOHN.landeschub || !r || r.bau || r.hop || r.landing !== 'clean') return null;
  let st = null;
  LOHN.schub.forEach(([air, dur, k], i) => { if (r.air >= air) st = { stufe: i + 1, dur, k }; });
  return st;
}
// Hüllkurve des Landeschubs (0 … 1) t s nach dem Start, Dauer dur
export function landBoostLevel(t, dur) {
  if (!(t >= 0)) return 0;
  if (t < dur) return 1;
  const u = (t - dur) / LOHN.schubFade;
  return u >= 1 ? 0 : 0.5 + 0.5 * Math.cos(Math.PI * u);
}

// Zwischenzeiten (Etappe 3). ref = { t (Endzeit), sp: [Rennzeit an CP 1, 2, …] } der Bestfahrt. Abstand am n-ten Checkpoint
// (1 …) bzw. im Ziel (n = null): Rennzeit − Bestfahrt (negativ = schneller) oder null ohne Vergleich
export function splitDelta(t, ref, n = null) {
  if (!ref) return null;
  const r = n == null ? ref.t : ref.sp && ref.sp[n - 1];
  return Number.isFinite(r) ? t - r : null;
}
// Abschnitte: je Checkpoint und das Stück bis ins Ziel { t (Abschnittszeit), d (gegen den Abschnitt der Bestfahrt, null ohne) };
// Summe der d = Abstand im Ziel (Messgröße 7)
export function sectorDeltas(splits, final, ref) {
  const cur = [...splits, final], rr = ref ? [...(ref.sp || []), ref.t] : null, out = [];
  for (let i = 0; i < cur.length; i++) {
    const t = cur[i] - (i ? cur[i - 1] : 0);
    const ok = rr && rr.length === cur.length && rr.every(Number.isFinite);
    out.push({ t, d: ok ? t - (rr[i] - (i ? rr[i - 1] : 0)) : null });
  }
  return out;
}
// „−0,42“ / „+0,31“ / „±0,00“
export function fmtDelta(d) {
  if (d == null || !Number.isFinite(d)) return '';
  const a = Math.abs(d).toFixed(2).replace('.', ',');
  return Math.abs(d) < 0.005 ? '±' + a : (d < 0 ? '−' : '+') + a;
}

// Drift-Turbo (Etappe 4): reines Meter je Physikschritt. step(dt, beta (rad, Betrag des Rutschwinkels), ground, v (m/s), brake (Spieler
// 0 … 1), deg (Schwelle °)) → null | { turbo: { k, dur, u } } | { pts } (Variante 2 am Drift-Ende); stat zählt fürs Testen mit
export class DriftTurbo {
  constructor() { this.reset(); this.stat = { drifts: 0, taps: 0, red: 0, green: 0, full: 0, turbos: 0 }; this.bOn = false; this.bT = 0; this.m0 = 0; }
  reset() { this.m = 0; this.on = false; this.n = 0; this.over = false; this.offT = 0; this.pts = 0; }
  step(dt, beta, ground, v, brake, deg) {
    const D = LOHN.dt, drifting = ground && v > D.vMin && beta >= deg * Math.PI / 180;
    let out = null;
    if (drifting) {
      this.offT = 0;
      if (!this.on) { this.reset(); this.on = true; this.stat.drifts++; }
      this.pts += D.pts * dt;
      if (!this.over) { this.m += dt / D.fill; if (this.m >= 1) { this.m = 0; this.over = true; this.stat.full++; } }
    } else if (this.on) {
      this.offT += dt;
      if (this.offT > D.end || !ground) { if (LOHN.driftturbo === 2 && this.pts >= 1) out = { pts: Math.round(this.pts) }; this.reset(); }
    }
    // Brems-Tipp: Zeitpunkt = Drücken, gilt nur, wenn innerhalb von tap s wieder losgelassen
    if (brake > 0.5 && !this.bOn) { this.bOn = true; this.bT = 0; this.m0 = this.on && !this.over ? this.m : -1; }
    else if (this.bOn) {
      this.bT += dt;
      if (brake <= 0.5) {
        this.bOn = false;
        if (this.bT <= D.tap && this.m0 >= 0 && LOHN.driftturbo === 1 && this.on && !this.over) {
          this.stat.taps++;
          if (this.m0 < 0.5) { this.stat.green++; this.m = 0; }
          else {
            const u = Math.min(1, (this.m0 - 0.5) / 0.5);
            this.stat.red++; this.stat.turbos++; this.n++; this.m = 0;
            if (this.n >= D.max) this.over = true;
            out = { turbo: { k: D.k * u, dur: D.d0 + (D.d1 - D.d0) * u, u } };
          }
        }
      }
    }
    return out;
  }
}
