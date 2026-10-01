// Bodenhaftung bei Tempo (n21, Peter 30.09.2026: „Viel mehr Bodenhaftung bei hoher Geschwindigkeit“): Saugkraft
// (car.js haftN/haftA/haftV/haftR) hält das Auto über Kuppen am Boden, wirkt nicht an Schanzen und nicht im Hüpfer;
// ?haft=alt (haftA 0, rollH 0,3) = Stand bis n19. Bots-Messung: tools/fahr_analyse.mjs --teil=haftung.
import { chain, setup } from './common.mjs';
import { Car, CAR_DEF, CAR_DEF_HAFT_ALT } from '../../src/physics/car.js';
import { Autopilot } from '../../src/ai/autopilot.js';
import { haftOffAt } from '../../src/game/race.js';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const DT = 1 / 120;
const NEU = { ...CAR_DEF };
const ALT = { ...CAR_DEF, ...CAR_DEF_HAFT_ALT };

// Strecke fahren: Autopilot lenkt, Gas fest (Tempo erzwingen) bzw. Profil; misst Zeit mit ≤ 1 Rad am Boden je Abschnitt
function fahrt(list, def, { v0, thr = null, T = 12 } = {}) {
  const c = chain(5, 15, 0, list);
  const env = setup({ pieces: c.pieces, seed: 1 });
  const L = env.ideal, si = env.track.start.idx;
  const car = new Car(def);
  car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], v0);
  const ap = new Autopilot(L, env.prof); ap.tr.reset(si);
  let t = 0, lift = 0, apex = -1e9, crash = null, vMax = 0;
  while (t < T) {
    const o = ap.control(car);
    car.input.steer = o.steer; car.input.throttle = thr ?? o.throttle; car.input.brake = thr != null ? 0 : o.brake;
    car.surfaceKind = 0; car.haftOff = haftOffAt(env.track, ap.tr.idx);
    car.step(DT, env.world); t += DT;
    if (car.onGround <= 1) lift += DT;
    apex = Math.max(apex, car.pos.y); vMax = Math.max(vMax, car.speed());
    if (car.crash) { crash = car.crash.reason; break; }
    if (ap.tr.idx >= L.n - 3) break;
  }
  return { lift, apex, crash, vMax };
}

// 1. Kuppe mit Tempo (Gas fest 0,6 → ~170–200 km/h über die Kuppe)
for (const v0 of [40, 50]) {
  const n = fahrt(['start', 'straight', 'crest', 'straight', 'straight'], NEU, { v0, thr: 0.6, T: 6 });
  const a = fahrt(['start', 'straight', 'crest', 'straight', 'straight'], ALT, { v0, thr: 0.6, T: 6 });
  check(n.lift <= 0.05 && !n.crash && a.lift > 0.15, `Kuppe mit ${(v0 * 3.6).toFixed(0)} km/h: in der Luft ${n.lift.toFixed(2)} s (≤ 0,05; ?haft=alt ${a.lift.toFixed(2)} s), ${n.crash || 'kein Crash'}`);
}
// 2. Schanze unverändert (Saugkraft an der Schanze aus): Scheitel und Flugzeit wie ohne Saugkraft
{
  const list = ['start', 'straight', 'straight', 'jump', 'straight', 'straight'];
  const n = fahrt(list, NEU, { v0: 0, T: 30 }), a = fahrt(list, { ...NEU, haftA: 0 }, { v0: 0, T: 30 });
  check(Math.abs(n.apex - a.apex) < 0.15 && !n.crash, `Schanze: Scheitel ${n.apex.toFixed(2)} m wie ohne Saugkraft (${a.apex.toFixed(2)} m), ${n.crash || 'kein Crash'}`);
}
// 3. Langsam (unter haftV[0]) und satt aufliegend wirkt nichts: Ebene, Tempo 5 m/s → keine Zusatzkraft
{
  const c = chain(5, 15, 0, ['start', 'straight', 'straight']);
  const env = setup({ pieces: c.pieces, seed: 1 });
  const L = env.ideal, si = env.track.start.idx, car = new Car(NEU);
  car.place([L.px[si], L.py[si], L.pz[si]], [L.tx[si], L.ty[si], L.tz[si]], [L.nx[si], L.ny[si], L.nz[si]], 40);
  let fMax = 0;
  for (let t = 0; t < 1.5; t += DT) { car.input.throttle = 0.5; car.step(DT, env.world); if (t > 0.5) fMax = Math.max(fMax, car.haftF || 0); }
  check(fMax < 0.05 * 9.81 * NEU.mass, `Ebene mit 144 km/h: Saugkraft höchstens ${(fMax / NEU.mass / 9.81).toFixed(2)} g (satt aufliegend wirkt sie nicht)`);
}
check(CAR_DEF_HAFT_ALT.haftA === 0, '?haft=alt schaltet die Saugkraft ab (haftA 0, rollH 0,3)');

console.log(fails ? `${fails} Fehlschläge` : 'Bodenhaftung: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
