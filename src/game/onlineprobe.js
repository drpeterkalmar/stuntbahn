// Mess-Probe „Online“ (n35, Mess-Gate auf EINEM Gerät): ?onlineprobe=N (1–3) – N Attrappen-Mitspieler im selben Tab.
// Sie fahren als KI (ai/gegner.js, eigenes Feld, ohne Kollision), ihre Lage geht aber nur als Netz-Paket (25 Hz, binär) über
// ein Fake-Netz (net/fake.js, 20 ± 5 ms je Richtung, Zeit = echte Zeit) an die eigene Sitzung – dort wie bei echten Menschen:
// Uhr-Abgleich, Puffer, Vorausrechnen, Darstellung (GegnerVis), Kollision, Rangliste. Gemessen wird also der ganze
// Online-Pfad PLUS die KI-Physik der Attrappen (obere Schranke; deren Anteil zeigt die n34-Szene ?gegner=N). Schnittstelle wie
// game/onlinespiel.js (S, rennenBauen, takt), main.js startet damit startOnlineRace. Im Browser NICHT geprüft (Vorbau).
import { FakeNetz } from '../net/fake.js';
import { Sitzung } from '../net/sitzung.js';
import { OnlineRennen, AUTO_SCHEMA, LIN, zustandKi } from './online.js';
import { GegnerFeld } from '../ai/gegner.js';
import { GAME_SPEED_STD } from './race.js';

const DT = 1 / 120;
export const PROBE = { latenz: 20, jitter: 5, hz: 25 };
export function probeAnzahl(search = typeof location !== 'undefined' ? location.search : '') {
  const q = new URLSearchParams(search);
  return q.has('onlineprobe') ? Math.max(1, Math.min(3, +q.get('onlineprobe') || 3)) : 0;
}

export class OnlineProbe {
  constructor(n, opt = {}) {
    this.n = n; this.tempo = opt.tempo || GAME_SPEED_STD;
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
  sichtbar() {}
  verlassen() { for (const b of this.bots) b.verlassen(); this.S.verlassen(); }
}
