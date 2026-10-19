// Mess-Probe „Online“ (n35, Mess-Gate auf EINEM Gerät): ?onlineprobe=N (1–3) – N Attrappen-Mitspieler im selben Tab.
// Sie fahren als KI (ai/gegner.js, eigenes Feld, ohne Kollision), ihre Lage geht aber nur als Netz-Paket (25 Hz, binär) über
// ein Fake-Netz (net/fake.js, 20 ± 5 ms je Richtung, Zeit = echte Zeit) an die eigene Sitzung – dort wie bei echten Menschen:
// Uhr-Abgleich, Puffer, Vorausrechnen, Darstellung (GegnerVis), Kollision, Rangliste. Gemessen wird also der ganze
// Online-Pfad PLUS die KI-Physik der Attrappen (obere Schranke; deren Anteil zeigt die n34-Szene ?gegner=N). Schnittstelle wie
// game/onlinespiel.js (S, rennenBauen, takt), main.js startet damit startOnlineRace.
// ?probeart=linie (n35-Abnahme): Attrappen ohne Physik – sie gleiten mit dem Ziel-Tempo der Strecke die Mittellinie
// entlang (seitlich versetzt). So rechnet die Probe nur, was echte Mitspieler hier kosten (Netz, Puffer, Vorausrechnen,
// Darstellung, Kollision, Rangliste) – deren Physik rechnet ja ihr eigenes Gerät. Standard ('ki') wie im Vorbau.
import { FakeNetz } from '../net/fake.js';
import { Sitzung } from '../net/sitzung.js';
import { OnlineRennen, AUTO_SCHEMA, LIN, zustandKi } from './online.js';
import { GegnerFeld } from '../ai/gegner.js';
import { GAME_SPEED_STD } from './race.js';

const DT = 1 / 120;
export const PROBE = { latenz: 20, jitter: 5, hz: 25, linieTempo: 0.85, hoehe: 0.54 };
export function probeArt(search = typeof location !== 'undefined' ? location.search : '') { return new URLSearchParams(search).get('probeart') === 'linie' ? 'linie' : 'ki'; }
export function probeAnzahl(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.has('onlineprobe') ? Math.max(1, Math.min(3, +q.get('onlineprobe') || 3)) : 0;
}

export class OnlineProbe {
  constructor(n, opt = {}) {
    this.n = n; this.tempo = opt.tempo || GAME_SPEED_STD; this.art = opt.art || probeArt();
    this.N = new FakeNetz({ latenz: PROBE.latenz, jitter: PROBE.jitter, seed: 5 });
    this.t0 = opt.jetzt ? opt.jetzt() : performance.now(); this.jetzt = opt.jetzt || (() => performance.now());
    const mk = (id, gast) => { const t = this.N.teilnehmer(id, { uhr: gast ? 1000 * id.length : 0 }); return new Sitzung(t, { jetzt: t.jetzt, sid: 'probe-' + id, info: { name: gast ? 'Probe ' + id.slice(1) : 'Du', stufe: 'medium' }, gastgeber: !gast, schema: AUTO_SCHEMA, lin: LIN }); };
    this.S = mk('ich', false);
    this.bots = Array.from({ length: n }, (_, k) => mk('b' + (k + 1), true));
    this.rennen = null; this.feld = null; this.acc = 0; this.letzt = this.jetzt(); this.sendT = -1e9;
    // Beitritt + erste Uhr-Proben im Zeitraffer (virtuelle Zeit), dann Start
    for (let k = 0; k < 150; k++) { this.N.schritt(10); this.S.takt(); for (const b of this.bots) b.takt(); }
    this.S.starten({ tempo: this.tempo, ki: 0 }, []);
    for (let k = 0; k < 30; k++) { this.N.schritt(10); this.S.takt(); for (const b of this.bots) b.takt(); }
    this.vorlauf = this.N.zeit;
  }
  get aktiv() { return true; }
  rennenBauen(env, race) {
    const O = this.rennen = new OnlineRennen(this.S, env, race, { tempo: this.tempo });
    if (this.art === 'linie') {
      // Attrappen ohne Physik: Rasterplatz → Fortschritt längs der Mittellinie + seitlicher Versatz
      const L = env.track.line;
      this.linie = { L, vt: env.prof ? env.prof.vt : null, nI: env.ideal ? env.ideal.n : L.n };
      this.gleiter = this.bots.map((b) => { const r = O.raster[O.A.slotVon(b.sid)]; return { s: L.s[r.idx] + r.frac * ((L.s[Math.min(L.n - 1, r.idx + 1)] - L.s[r.idx]) || 0), lap: r.lapDelta, lat: r.lat, i: r.idx, weg: 0 }; });
      this.feld = { fahrer: [] };
      O.aufstellen();
      return O;
    }
    // Attrappen: KI-Feld auf den Rasterplätzen 2…N+1, ohne eigene Kollision (die macht der Online-Pfad)
    this.feld = new GegnerFeld(env, { anzahl: this.n, staerke: 'ebenbuertig', seed: 7, assist: 'medium', online: true, wreckOn: false, aufholhilfe: false, kollision: false, rasterN: O.A.n, plaetze: this.bots.map((b) => O.A.slotVon(b.sid)), spielerPlatz: O.slot });
    O.aufstellen();
    return O;
  }
  // je Bild (main.js onl.takt): Netz-Zeit = echte Zeit, Attrappen fahren (fester Physik-Takt) und senden 25 Hz
  takt() {
    const t = this.jetzt(), dt = Math.min(100, t - this.letzt); this.letzt = t;
    this.N.schritt(dt);
    this.S.takt(); for (const b of this.bots) b.takt();
    const R = this.rennen;
    if (!R || !this.feld) return;
    const laeuft = R.race.state !== 'countdown';
    if (this.linie) {
      if (laeuft) for (const g of this.gleiter) this._gleite(g, dt / 1000 * this.tempo);
      if (this.N.zeit - this.sendT >= 1000 / PROBE.hz - 2) { this.sendT = this.N.zeit; this.gleiter.forEach((g, k) => this.bots[k].sendeZustand(this._zustand(g))); }
      return;
    }
    if (laeuft) {
      this.acc += dt / 1000 * this.tempo;
      let k = 0;
      while (this.acc >= DT && k++ < 14) { this.feld.step(DT, null, R.race.car.pos); this.acc -= DT; }
      if (k >= 14) this.acc = 0;
    }
    if (this.N.zeit - this.sendT >= 1000 / PROBE.hz - 2) {
      this.sendT = this.N.zeit;
      this.feld.fahrer.forEach((g, k) => { const s = zustandKi(g, 0); s.f.ziel = false; this.bots[k].sendeZustand(s); });
    }
  }
  // Gleiter: Fortschritt mit dem Ziel-Tempo (Profil der Ideallinie) × linieTempo, Linienpunkt nachführen
  _gleite(g, dt) {
    const { L, vt, nI } = this.linie;
    const v = vt ? Math.max(8, vt[Math.min(vt.length - 1, Math.round(g.i * nI / L.n))] * PROBE.linieTempo) : 30;
    g.s += v * dt; g.weg += v * dt; g.v = v;
    if (g.s >= L.total) { if (L.closed) { g.s -= L.total; g.lap++; g.i = 0; } else g.s = L.total - 0.01; }
    while (g.i < L.n - 2 && L.s[g.i + 1] <= g.s) g.i++;
    g.lat *= Math.exp(-dt / 6);   // vom Rasterplatz langsam zur Mitte (±0,8 m bleibt)
  }
  _zustand(g) {
    const { L } = this.linie, i = g.i, j = Math.min(L.n - 1, i + 1), f = Math.max(0, Math.min(1, (g.s - L.s[i]) / ((L.s[j] - L.s[i]) || 1)));
    const m = (a) => a[i] + (a[j] - a[i]) * f;
    const t = norm([m(L.tx), m(L.ty), m(L.tz)]), n = norm([m(L.nx), m(L.ny), m(L.nz)]), b = [m(L.bx), m(L.by), m(L.bz)];
    const lat = g.lat + (g.lat >= 0 ? 0.8 : -0.8), h = PROBE.hoehe, v = g.v || 0;
    return {
      platz: 0, px: m(L.px) + b[0] * lat + n[0] * h, py: m(L.py) + b[1] * lat + n[1] * h, pz: m(L.pz) + b[2] * lat + n[2] * h,
      q: quatAus(t, n), vx: t[0] * v, vy: t[1] * v, vz: t[2] * v, lenk: 0, gas: 1, nitro: 0, f: {}, sprung: 0, fort: g.lap * L.total + g.s,
    };
  }
  sichtbar() {}
  verlassen() { for (const b of this.bots) b.verlassen(); this.S.verlassen(); }
}

const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
// Lage aus Vorwärts t und Oben n (Auto: vorn = −z, oben = +y, rechts = +x)
function quatAus(t, n) {
  const z = [-t[0], -t[1], -t[2]], x = norm([n[1] * z[2] - n[2] * z[1], n[2] * z[0] - n[0] * z[2], n[0] * z[1] - n[1] * z[0]]);
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const m00 = x[0], m11 = y[1], m22 = z[2], tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s]; }
  return { x: q[0], y: q[1], z: q[2], w: q[3] };
}
