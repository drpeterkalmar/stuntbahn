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
// n38 (Regler in lohn.js LOHN, 0 = wie n37): Kettenfenster LOHN.kette statt win; Bauwerke (Looping & Co.) zählen als Stunt und
// sind Kettenglieder, Sprung ohne Drehung nicht halbiert (stuntpkt); Landestufe „ruhige Hand“ × LOHN.calm (landung): sauber
// gelandet und LOHN.calmT s vor dem Aufsetzen keine Änderung an Lenken/Gas/Bremse (Spieler-Eingabe, ctx.inp).
import { LOHN } from './lohn.js';

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
  if (!(LOHN.kette > 0)) return 1;
  let f = 1;
  for (let k = 0; k < n; k++) f += k < STUNT.chain.length ? STUNT.chain[k] : STUNT.chainStep;
  return Math.min(STUNT.chainMax, f);
}
// Fenster (s) nach einer Landung als n-tes Glied (0 = erster) mit pts Punkten
export function chainWindow(n, pts) { return LOHN.kette > 0 ? Math.max(STUNT.winMin, LOHN.kette - STUNT.winStep * n) + STUNT.winPerPt * pts : 0; }

// Punkte eines Sprungs. j = { air (s), flip, spin, roll (rad), landing: 'clean' | 'ok' | 'crash', calm (ruhige Hand), hop, repeat,
// chain (Vorgänger) } → null (zu kurz) oder { pts, base, flips, spins, rolls, mult, chainMult, landing, calm, air }
export function scoreJump(j) {
  const S = STUNT;
  if (!(j.air >= S.airMin)) return null;
  const flips = halves(j.flip || 0), spins = halves(j.spin || 0), rolls = halves(j.roll || 0);
  let base = Math.floor(j.air * 10 + 1e-6) * S.perTenth + flips * S.flip + spins * S.spin + rolls * S.roll;
  // n38 (stuntpkt): ohne Drehung nicht halbiert – außer beim Hüpfer (sonst lohnte Dauer-Hüpfen mehr als Schanzen)
  if (!flips && !spins && !rolls && (!LOHN.stuntpkt || j.hop)) base *= S.noRot;
  if (j.hop) base *= S.hop;
  if (j.repeat) base *= S.repeat;
  let mult = 1, chainMult = 1;
  const calm = !!(j.calm && j.landing === 'clean' && LOHN.landung);
  if (j.landing === 'crash') base *= 0.5;
  else { if (j.landing === 'clean') mult = calm ? LOHN.calm : S.clean; chainMult = chainFactor(j.chain || 0); }
  const pts = Math.max(1, Math.round(base * mult * chainMult));
  return { pts, base, flips, spins, rolls, mult, chainMult, landing: j.landing, calm, air: j.air, hop: !!j.hop, repeat: !!j.repeat };
}

// n38 Bauwerk-Stunt. b = { kind, v (mittleres Tempo m/s), dur (s), over (war kopfüber), steep (s steil), repeat, chain } →
// null (zählt nicht) oder { pts, base, kind, … } – Grundwerte wie der Highlight-Film (LOHN.bau)
export const BAU_NAME = { loop: 'Looping', cork: 'Korkenzieher', wendel: 'Wendel', tube: 'Röhre', tubewall: 'Röhre mit Wand', zigzag: 'Zickzack', wall: 'Steilwand', halfpipe: 'Halfpipe' };
export function scoreBau(b) {
  const H = LOHN.bau[b.kind];
  if (!H || !(b.dur >= 0.5)) return null;
  if (H.over && !b.over) return null;
  let base;
  if (H.perS) { if (!(b.steep >= 0.25)) return null; base = H.base + H.perS * b.steep; }
  else base = H.base * (0.6 + 0.4 * Math.min(1.5, b.v / H.v0));
  if (b.repeat) base *= STUNT.repeat;
  const chainMult = chainFactor(b.chain || 0);
  return { pts: Math.max(1, Math.round(base * chainMult)), base, kind: b.kind, bau: true, flips: 0, spins: 0, rolls: 0, mult: 1, chainMult, landing: 'ok', calm: false, air: 0, hop: false, repeat: !!b.repeat };
}
// Bauwerk-Art je Linienpunkt (null = keins), wie der Highlight-Film (highlights.js) die Stücke einteilt
export function bauKinds(env) {
  const L = env.track.line, out = new Array(L.n).fill(null);
  for (let i = 0; i < L.n; i++) {
    const k = L.piece[i], pc = env.track.pieces[k] || {}, lp = env.layout && env.layout.pieces ? env.layout.pieces[k] || {} : {}, t = pc.type || lp.type || '';
    out[i] = t === 'tr_corkud' ? 'wendel' : L.loop[i] ? (/cork/.test(t) ? 'cork' : 'loop') : L.tube[i] ? (t === 'tube_wall' ? 'tubewall' : 'tube')
      : t === 'zigzag' || t === 'zigzag2' ? 'zigzag' : t === 'wall' ? 'wall' : t === 'halfpipe' ? 'halfpipe' : null;
  }
  return out;
}

export class StuntTracker {
  constructor() { this.total = 0; this.n = 0; this.best = 0; this.links = 0; this.winLeft = 0; this.seen = new Map(); this.cur = null; this.onScore = null; this.last = null; this.bau = null; this.queue = []; this.inKey = ''; this.inT = 0; this.maxLinks = 0; }
  // nach Versetzen/Rückspulen: laufender Sprung/laufendes Bauwerk verfällt, Kette vorbei
  reset() { this.cur = null; this.links = 0; this.winLeft = 0; this.bau = null; }
  // Nitro gezündet (n38): laufendes Kettenfenster um s verlängern
  extend(s) { if (this.winLeft > 0 && s > 0) this.winLeft = Math.min(STUNT.winMax, this.winLeft + s); }
  // je Physikschritt (nach car.step). ctx = { piece, lap, loop (Looping/Röhre: Auto am Boden der Bahn), bau (n38: Bauwerk-Art
  // oder null), inp (n38: Spieler-Eingabe) }. Liefert das Ergebnis einer abgerechneten Landung bzw. eines Bauwerks oder null.
  step(dt, car, ctx) {
    // ruhige Hand (n38): Zeit seit der letzten Änderung an Lenken/Gas/Bremse (grob: Richtung, gedrückt ja/nein)
    if (ctx.inp) {
      const u = ctx.inp, k = `${u.steer > 0.3 ? 1 : u.steer < -0.3 ? -1 : 0}${u.throttle > 0.5 ? 1 : 0}${u.brake > 0.5 ? 1 : 0}${u.pitch > 0.3 ? 1 : u.pitch < -0.3 ? -1 : 0}`;
      if (k !== this.inKey) { this.inKey = k; this.inT = 0; } else this.inT += dt;
    }
    const rb = LOHN.stuntpkt ? this.bauStep(dt, car, ctx) : null;
    const rj = this.jumpStep(dt, car, ctx);
    if (rj && rb) this.queue.push(rb);
    return rj || rb || this.queue.shift() || null;
  }
  // Bauwerk (n38): von der ersten bis zur letzten Berührung des Stücks; abgerechnet beim Verlassen
  bauStep(dt, car, ctx) {
    if (car.crash) { this.bau = null; return null; }   // Crash im Bauwerk zählt nicht
    const k = ctx.bau || null, B = this.bau;
    if (B && (k !== B.kind || ctx.piece !== B.piece)) {
      this.bau = null;
      const lap = B.lap, key = `B|${B.piece}|${B.kind}`, first = this.seen.get(key), repeat = first != null && first < lap;
      const res = scoreBau({ kind: B.kind, v: B.vs / Math.max(1, B.n), dur: B.t, over: B.minUp < -0.2, steep: B.steep, repeat, chain: B.chain });
      if (res && first == null) this.seen.set(key, lap);
      if (res) {
        this.links = B.chain + 1; this.maxLinks = Math.max(this.maxLinks, this.links);
        this.winLeft = Math.min(STUNT.winMax, Math.max(0, this.winLeft) + chainWindow(B.chain, res.pts));
        if (!(LOHN.kette > 0)) { this.links = 0; this.winLeft = 0; }
        res.chain = B.chain + 1;
        this.book(res);
        if (k) this.bau = this.newBau(k, ctx);
        return res;
      }
    }
    if (k && !this.bau) this.bau = this.newBau(k, ctx);
    const C = this.bau;
    if (C) {
      C.t += dt; C.vs += car.speed(); C.n++;
      const uy = car.frame.u.y;
      if (uy < C.minUp) C.minUp = uy;
      const H = LOHN.bau[C.kind];
      if (H && H.upY && uy < H.upY) C.steep += dt;
    }
    return null;
  }
  newBau(kind, ctx) { return { kind, piece: ctx.piece, lap: ctx.lap, t: 0, vs: 0, n: 0, minUp: 1, steep: 0, chain: this.winLeft > 0 ? this.links : 0 }; }
  book(res) {
    this.total += res.pts; this.n++; this.best = Math.max(this.best, res.pts);
    res.total = this.total;
    this.last = res;
    if (this.onScore) this.onScore(res);
  }
  jumpStep(dt, car, ctx) {
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
      c.land = 0; c.calm = this.inT >= LOHN.calmT;
      const sp = Math.hypot(car.v.x, car.v.y, car.v.z);
      const vF = car.v.x * F.f.x + car.v.y * F.f.y + car.v.z * F.f.z, vR = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
      c.slip = sp > 3 ? Math.abs(Math.atan2(vR, Math.abs(vF))) : 0;
    } else c.land += dt;
    if (c.wheelsT < 0 && car.onGround === 4) c.wheelsT = c.land;
    if (c.land >= STUNT.settle) return this.finish(c.wheelsT >= 0 && c.wheelsT <= STUNT.cleanT && c.slip <= STUNT.cleanSlip ? 'clean' : 'ok');
    return null;
  }
  // Crash (Rennlogik): laufender Sprung als Crash-Landung abrechnen
  crash(car) { this.bau = null; if (this.cur && (this.cur.land >= 0 || this.cur.t >= STUNT.airMin)) return this.finish('crash'); this.cur = null; this.links = 0; this.winLeft = 0; return null; }
  finish(landing) {
    const c = this.cur; this.cur = null;
    const flips = halves(c.flip), spins = halves(c.spin), rolls = halves(c.roll);
    const key = `${c.piece}|${flips}|${spins}|${rolls}|${c.hop ? 1 : 0}`, first = this.seen.get(key);
    const repeat = first != null && first < c.lap;
    if (first == null) this.seen.set(key, c.lap);
    // n38 (hopChain 0): ein Hüpfer ist kein Kettenglied – kein Faktor, Kette und Fenster bleiben, wie sie sind
    const solo = c.hop && !LOHN.hopChain;
    const res = scoreJump({ air: c.t, flip: c.flip, spin: c.spin, roll: c.roll, landing, calm: c.calm, hop: c.hop, repeat, chain: solo ? 0 : c.chain });
    if (!res) return null;
    if (solo) { res.chain = 0; this.book(res); return res; }
    if (landing === 'crash' || !(LOHN.kette > 0)) { this.links = 0; this.winLeft = 0; }
    else { this.links = c.chain + 1; this.maxLinks = Math.max(this.maxLinks, this.links); this.winLeft = Math.min(STUNT.winMax, Math.max(0, this.winLeft) + chainWindow(c.chain, res.pts)); }
    res.chain = landing === 'crash' ? 0 : c.chain + 1;
    this.book(res);
    return res;
  }
  // für die Anzeige im Flug: Luftzeit, bisher gezählte halbe Drehungen, ruhige Hand bisher (n38: seit calmT s keine Änderung)
  live() { const c = this.cur; return c && c.land < 0 ? { t: c.t, flips: halves(c.flip), spins: halves(c.spin), rolls: halves(c.roll), calm: !!LOHN.landung && this.inT >= LOHN.calmT } : null; }
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
  const air = r.bau ? '' : `✈ ${r.air.toFixed(1).replace('.', ',')} s`;
  const land = r.landing === 'clean' ? (r.calm ? `ruhige Hand ×${String(r.mult).replace('.', ',')}` : 'sauber ×1,25') : r.landing === 'crash' ? '💥 halbe Punkte' : '';
  const ch = r.chainMult > 1 ? `Kette ×${r.chainMult.toFixed(2).replace(/0$/, '').replace('.', ',')}` : '';
  return { head: r.bau ? BAU_NAME[r.kind] || 'Bauwerk' : fig.length ? fig.join(' · ') : r.hop ? 'Hüpfer' : 'Sprung', sub: [air, land, ch, r.repeat ? 'Wiederholung ½' : ''].filter(Boolean).join(' · '), pts: `+${r.pts}` };
}
