// Wiese = Wiese (n21, Peter 30.09.2026: „Die Wiese darf nicht schneller sein als 30 km/h. Es ist eine Wiese!“).
// Prüft mit tools/wiese_probe.mjs: Vollgas-Endtempo ≤ 30 km/h (auch mit Nitro), Abkommen mit 200/300 km/h → in
// ~2 s bei 30 km/h ohne Crash/Überschlag, Lenken auf der Wiese geht, Rückweg aus Senken/über Böschungen auf die
// Fahrbahn, ?wiese=alt (WIESE.on = false) = Verhalten bis n19.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { run, abkommen, rueckweg } from '../../tools/wiese_probe.mjs';
import { WIESE } from '../../src/track/defs.js';
import { Car } from '../../src/physics/car.js';
import { chain, setup } from './common.mjs';
import { generate } from '../../src/track/generator.js';
import { prepare } from '../../src/track/verify.js';
import { trkToLayout } from '../../src/track/trkimport.js';
import { parseTrk } from '../../src/track/trk.js';
import { tracksOf } from '../../src/game/sammlung.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const DT = 1 / 120;

check(WIESE.on, 'Wiese-Regel aktiv (ohne ?wiese=alt)');
// 1. Vollgas
const v0 = run(0, { throttle: 1, brake: 0 }, 12), v150 = run(150 / 3.6, { throttle: 1, brake: 0 }, 6);
check(v0.mat === 'GRASS' && Math.max(...v0.kmh) <= 30, `Vollgas ab 0: höchstens ${Math.max(...v0.kmh)} km/h (≤ 30; bis n19 390 km/h nach 12 s)`);
check(Math.max(...v150.kmh.slice(2)) <= 30, `Vollgas ab 150 km/h: nach 2 s ${v150.kmh[1]} km/h, danach höchstens ${Math.max(...v150.kmh.slice(2))} km/h (≤ 30)`);
// mit Nitro
{
  const c = chain(5, 15, 0, ['start', 'straight', 'straight', 'straight']);
  const env = setup({ pieces: c.pieces, seed: 1 });
  const L = env.ideal, si = env.track.start.idx, h = Math.hypot(L.tx[si], L.tz[si]);
  const fw = [L.tx[si] / h, 0, L.tz[si] / h];
  const x = L.px[si] - fw[2] * 120, z = L.pz[si] + fw[0] * 120, g = env.world.ray(x, 200, z, 0, -1, 0, 400, true);
  const car = new Car(); car.place([x, g.y, z], fw, [g.nx, g.ny, g.nz], 0);
  car.input.throttle = 1; car.boost = 1;
  let vmax = 0;
  for (let t = 0; t < 8; t += DT) { car.step(DT, env.world); vmax = Math.max(vmax, car.speed() * 3.6); }
  check(vmax <= 30, `Vollgas mit Nitro: höchstens ${vmax.toFixed(1)} km/h (≤ 30)`);
  // Lenken auf der Wiese: voller Einschlag bei ~25 km/h → enger Bogen
  car.boost = 0; car.input.steer = 1;
  let yaw = 0;
  for (let t = 0; t < 3; t += DT) { car.step(DT, env.world); const F = car.frame, w = car.w; if (t > 1) yaw = Math.max(yaw, Math.abs(w.x * F.u.x + w.y * F.u.y + w.z * F.u.z)); }
  const r = car.speed() / Math.max(1e-3, yaw);
  check(r < 15 && !car.crash, `Lenken auf der Wiese geht: Wendekreis-Radius ${r.toFixed(1)} m bei ${(car.speed() * 3.6).toFixed(0)} km/h (< 15 m), kein Crash`);
}
// 2. Abkommen
for (const kmh of [200, 300]) for (const [nm, o] of [['geradeaus', {}], ['voll gelenkt', { steer: 1 }], ['Vollgas + gelenkt', { steer: 0.6, throttle: 1 }]]) {
  const r = abkommen(kmh, o), lim = kmh === 200 ? 2.0 : 2.8;
  check(r.t30 !== null && r.t30 <= lim && !r.crash && r.tilt < 25, `Abkommen mit ${kmh} km/h, ${nm}: ≤ 30 km/h nach ${r.t30 && r.t30.toFixed(2)} s (≤ ${lim} s), Neigung max ${r.tilt.toFixed(0)}° (< 25°), ${r.crash || 'kein Crash'}`);
}
// 3. Rückweg aus dem Gelände (Senken, Hügel, Böschungen) – einfacher Fahrer, Vollgas auf die Strecke zu
{
  const T = tracksOf(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sammlung.json'), 'utf8')));
  const bin = new Uint8Array(fs.readFileSync(path.join(ROOT, 'assets/sammlung.bin')));
  const list = [['S4711/3', () => generate(4711, 3)]];
  for (const k of [40, 120]) list.push([T[k].id, () => trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), T[k].id)).layout]);
  let all = [];
  for (const [nm, lay] of list) all = all.concat(rueckweg(prepare(lay(), { treeCount: 0 }), 16, nm.length).map((q) => ({ ...q, nm })));
  const ok = all.filter((q) => q.ok), climb = Math.max(...ok.map((q) => q.climb)), vg = Math.max(...all.map((q) => q.vmaxGrass));
  // Rest: Leitplanke/Wand im Weg, unter eine Hochstraße gefahren (einfacher Fahrer) – mit ?wiese=alt 35/48
  check(ok.length >= 0.7 * all.length && climb > 3 && vg <= 31, `Rückweg aus dem Gelände: ${ok.length}/${all.length} zurück auf der Fahrbahn (≥ 70 %), Ø ${(ok.reduce((a, q) => a + q.t, 0) / ok.length).toFixed(1)} s, bergauf bis ${climb.toFixed(1)} m, Wiese höchstens ${vg.toFixed(0)} km/h`);
}
// 4. ?wiese=alt
WIESE.on = false;
const alt = run(0, { throttle: 1, brake: 0 }, 6);
WIESE.on = true;
check(Math.max(...alt.kmh) > 200, `?wiese=alt: Vollgas auf der Wiese wie bis n19 (${Math.max(...alt.kmh)} km/h nach 6 s)`);

console.log(fails ? `${fails} Fehlschläge` : 'Wiese: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
