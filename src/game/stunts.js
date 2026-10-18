// Stunt-Wertung (n37) – nur Punkte und Anzeige, Bestzeiten bleiben zeitbasiert. Formel nach dem Vorlagen-Datenblatt
// (~/.hermes/plans/vorlagen/stuntbahn.md §3, Clean-Room, eigene Startwerte; Hintergrund ARCADE_FEEL.md):
//   Grundpunkte = 1 je 0,1 s Luft (ab airMin s) + flip je halbem Salto + spin je halber Drehung um die Hochachse + roll je
//   halber Rolle; halbe Drehungen gerundet (ab 90° zählt die erste). Ohne jede Drehung halbiert, Hüpfer-Luft × hop,
//   dieselbe Figur am selben Bauteil in einer späteren Runde × repeat.
//   Landung: sauber (alle Räder binnen cleanT s, Rutschwinkel ≤ cleanSlip) × clean; Crash-Landung: halbe Grundpunkte,
//   keine Faktoren, Kette vorbei.
//   Kette: nächster Absprung innerhalb des Fensters → Glied +1, Faktor 1 + 0,20 + 0,15 + 0,10 + 0,05, danach je +0,02
//   (höchstens chainMax). Fenster je Landung: max(winMin, win − winStep × Glieder) + winPerPt × Punkte, der Rest wird
//   mitgenommen (höchstens winMax); in der Luft läuft es nicht ab.
// Reine Funktionen (scoreJump, chainFactor, chainWindow) + StuntTracker (zählt Drehungen aus der Drehrate des Autos, je
// Physikschritt). n38 hängt sich an: Race-Ereignis 'stunt' { pts, total, … } bzw. race.stunts.onScore(res).
export const STUNT = {
  airMin: 0.5, perTenth: 1, flip: 15, spin: 10, roll: 20, noRot: 0.5, hop: 0.6, repeat: 0.5,
  clean: 1.25, cleanT: 0.15, cleanSlip: 22.5 * Math.PI / 180,
  chain: [0.2, 0.15, 0.1, 0.05], chainStep: 0.02, chainMax: 2.0,
  win: 6, winStep: 0.5, winMin: 3, winPerPt: 0.02, winMax: 12,
  settle: 0.4,    // s nach dem ersten Radkontakt wird abgerechnet (Crash in dieser Zeit = Crash-Landung)
};

// halbe Umdrehungen (gerundet: ab 90° die erste)
export const halves = (rad) => Math.round(Math.abs(rad) / Math.PI);
// Ketten-Faktor für ein Glied mit n Vorgängern in der Kette (0 = erster Sprung)
export function chainFactor(n) {
  let f = 1;
  for (let k = 0; k < n; k++) f += k < STUNT.chain.length ? STUNT.chain[k] : STUNT.chainStep;
  return Math.min(STUNT.chainMax, f);
}
// Fenster (s) nach einer Landung als n-tes Glied (0 = erster) mit pts Punkten
export function chainWindow(n, pts) { return Math.max(STUNT.winMin, STUNT.win - STUNT.winStep * n) + STUNT.winPerPt * pts; }

// Punkte eines Sprungs. j = { air (s), flip, spin, roll (rad), landing: 'clean' | 'ok' | 'crash', hop, repeat, chain (Vorgänger) }
// → null (zu kurz) oder { pts, base, flips, spins, rolls, mult, chainMult, landing, air }
export function scoreJump(j) {
  const S = STUNT;
  if (!(j.air >= S.airMin)) return null;
  const flips = halves(j.flip || 0), spins = halves(j.spin || 0), rolls = halves(j.roll || 0);
  let base = Math.floor(j.air * 10 + 1e-6) * S.perTenth + flips * S.flip + spins * S.spin + rolls * S.roll;
  if (!flips && !spins && !rolls) base *= S.noRot;
  if (j.hop) base *= S.hop;
  if (j.repeat) base *= S.repeat;
  let mult = 1, chainMult = 1;
  if (j.landing === 'crash') base *= 0.5;
  else { if (j.landing === 'clean') mult = S.clean; chainMult = chainFactor(j.chain || 0); }
  const pts = Math.max(1, Math.round(base * mult * chainMult));
  return { pts, base, flips, spins, rolls, mult, chainMult, landing: j.landing, air: j.air, hop: !!j.hop, repeat: !!j.repeat };
}

export class StuntTracker {
  constructor() { this.total = 0; this.n = 0; this.best = 0; this.links = 0; this.winLeft = 0; this.seen = new Map(); this.cur = null; this.onScore = null; this.last = null; }
  // nach Versetzen/Rückspulen: laufender Sprung verfällt, Kette vorbei
  reset() { this.cur = null; this.links = 0; this.winLeft = 0; }
  // je Physikschritt (nach car.step). ctx = { piece, lap, loop (Looping/Röhre: Auto am Boden der Bahn) }. Liefert das Ergebnis
  // einer abgerechneten Landung oder null.
  step(dt, car, ctx) {
    const air = car.onGround === 0 && !car.surfaceKind && !ctx.loop;
    if (!this.cur && !air) { if (this.winLeft > 0) { this.winLeft -= dt; if (this.winLeft <= 0) { this.links = 0; this.winLeft = 0; } } return null; }
    if (!this.cur) {
      this.cur = { t: 0, flip: 0, spin: 0, roll: 0, piece: ctx.piece, lap: ctx.lap, hop: !!car.hopUp, land: -1, wheelsT: -1, slip: 0, chain: this.winLeft > 0 ? this.links : 0 };
      if (!(this.winLeft > 0)) this.links = 0;
    }
    const c = this.cur, F = car.frame, w = car.w;
    if (car.crash) return this.finish('crash');
    if (c.land < 0) {
      if (air) {
        c.t += dt;
        c.flip += (w.x * F.r.x + w.y * F.r.y + w.z * F.r.z) * dt;
        c.roll += (w.x * F.f.x + w.y * F.f.y + w.z * F.f.z) * dt;
        c.spin += (w.x * F.u.x + w.y * F.u.y + w.z * F.u.z) * dt;
        return null;
      }
      // erster Kontakt: zu kurz in der Luft → kein Sprung (Kette läuft weiter)
      if (c.t < STUNT.airMin) { this.cur = null; return null; }
      c.land = 0;
      const sp = Math.hypot(car.v.x, car.v.y, car.v.z);
      const vF = car.v.x * F.f.x + car.v.y * F.f.y + car.v.z * F.f.z, vR = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
      c.slip = sp > 3 ? Math.abs(Math.atan2(vR, Math.abs(vF))) : 0;
    } else c.land += dt;
    if (c.wheelsT < 0 && car.onGround === 4) c.wheelsT = c.land;
    if (c.land >= STUNT.settle) return this.finish(c.wheelsT >= 0 && c.wheelsT <= STUNT.cleanT && c.slip <= STUNT.cleanSlip ? 'clean' : 'ok');
    return null;
  }
  // Crash (Rennlogik): laufender Sprung als Crash-Landung abrechnen
  crash(car) { if (this.cur && (this.cur.land >= 0 || this.cur.t >= STUNT.airMin)) return this.finish('crash'); this.cur = null; this.links = 0; this.winLeft = 0; return null; }
  finish(landing) {
    const c = this.cur; this.cur = null;
    const flips = halves(c.flip), spins = halves(c.spin), rolls = halves(c.roll);
    const key = `${c.piece}|${flips}|${spins}|${rolls}|${c.hop ? 1 : 0}`, first = this.seen.get(key);
    const repeat = first != null && first < c.lap;
    if (first == null) this.seen.set(key, c.lap);
    const res = scoreJump({ air: c.t, flip: c.flip, spin: c.spin, roll: c.roll, landing, hop: c.hop, repeat, chain: c.chain });
    if (!res) return null;
    if (landing === 'crash') { this.links = 0; this.winLeft = 0; }
    else { this.links = c.chain + 1; this.winLeft = Math.min(STUNT.winMax, Math.max(0, this.winLeft) + chainWindow(c.chain, res.pts)); }
    res.chain = landing === 'crash' ? 0 : c.chain + 1;
    this.total += res.pts; this.n++; this.best = Math.max(this.best, res.pts);
    res.total = this.total;
    this.last = res;
    if (this.onScore) this.onScore(res);
    return res;
  }
  // für die Anzeige im Flug: Luftzeit und bisher gezählte halbe Drehungen
  live() { const c = this.cur; return c && c.land < 0 ? { t: c.t, flips: halves(c.flip), spins: halves(c.spin), rolls: halves(c.roll) } : null; }
}

// Text der Anzeige (HUD) zu einem Ergebnis: ganze Drehungen als „Salto“ / „2× Salto“, halbe als „½ Salto“
export function stuntText(r) {
  const fig = [];
  const fmt = (h, name) => {
    if (!h) return;
    const g = Math.floor(h / 2), half = h % 2;
    fig.push([g ? (g > 1 ? g + '× ' : '') + name : '', half ? '½ ' + name : ''].filter(Boolean).join(' + '));
  };
  fmt(r.flips, 'Salto'); fmt(r.rolls, 'Schraube'); fmt(r.spins, 'Dreher');
  const air = `✈ ${r.air.toFixed(1).replace('.', ',')} s`;
  const land = r.landing === 'clean' ? 'sauber ×1,25' : r.landing === 'crash' ? '💥 halbe Punkte' : '';
  const ch = r.chainMult > 1 ? `Kette ×${r.chainMult.toFixed(2).replace(/0$/, '').replace('.', ',')}` : '';
  return { head: fig.length ? fig.join(' · ') : r.hop ? 'Hüpfer' : 'Sprung', sub: [air, land, ch, r.repeat ? 'Wiederholung ½' : ''].filter(Boolean).join(' · '), pts: `+${r.pts}` };
}
