// n45 Arcade-Drift messen (Peter 04.11.2026: „die autos (ich auf mittel und schwer, npcs) driften noch immer nicht“).
// Spieler (Mittel/Original): Fahrer glatt / mensch / vollgas wie tools/n43_spieler_drift.mjs; alt = Stand 0.19.3 (?drift=n43:
// lockeres Heck n43, kein Arcade-Drift), neu = Arcade-Drift. Kennzahlen: Kurvenzeit (Plan-Querbeschleunigung ≥ 5 m/s², keine
// Stunts) mit SICHTBAREM Schwimmwinkel > 12° bzw. > 15°, Ø/größter Winkel, Crashs je 10 Runden, Rundenzeit zu alt.
// Gegner (--gegner=1): je Stärke 1 Gegner ohne Spieler in voller Physik (in Sicht), Kurvenzeit > 15° sichtbar, Ø Winkel in Drift-Kurven.
// Aufruf: node tools/n45_drift_mess.mjs [--n=42] [--stufen=medium,original] [--fahrer=glatt,mensch,vollgas] [--gegner=1] [--json=…]
import fs from 'fs'; import path from 'path'; import url from 'url';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const { driftTracks } = await imp('tools/drift_mess.mjs');
const { verifySync } = await imp('src/track/verify.js');
const { Race, arcadeSperre } = await imp('src/game/race.js');
const { GegnerFeld, mulberry } = await imp('src/ai/gegner.js');
const { ARCADE_DRIFT } = await imp('src/core/arcadedrift.js');
const DT = 1 / 120, RAUSCH = 0.15, GRAD = 180 / Math.PI;
for (const kv of String(arg('set', '')).split(',').filter(Boolean)) { const [k, x] = kv.split(':'); ARCADE_DRIFT[k] = +x; }

// sichtbarer Schwimmwinkel (Grad): Arcade-Drift an → arcade.gesamt, sonst echter Winkel aus der Physik
function winkel(car) {
  if (car.arcade && ARCADE_DRIFT.an) return Math.abs(car.arcade.gesamt) * GRAD;
  const F = car.frame, vf = car.v.x * F.f.x + car.v.y * F.f.y + car.v.z * F.f.z, vr = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
  return Math.abs(Math.atan2(vr, vf)) * GRAD;
}

export function fahrt(env, stufe, fahrer, neu, seed = 1) {
  ARCADE_DRIFT.an = neu;
  const race = new Race(env, { assist: stufe, countdown: 0.5, fahrstil: 'sauber', seed });
  const L = env.track.line, P = env.prof, car = race.car, r = mulberry(seed * 977 + 13);
  const M = { curve: 0, c12: 0, c15: 0, sum: 0, bmax: 0, t: 0 };
  let rs = 0, rz = 0, rT = 0;
  const lim = Math.max(150, L.total / 5);
  while (M.t < lim && race.state !== 'finished') {
    const o = race.ap.out;
    let inp = { steer: o.steer, throttle: o.throttle, brake: o.brake };
    if (fahrer !== 'glatt') {
      if ((rT -= DT) <= 0) { rz = (r() * 2 - 1) * RAUSCH; rT = 0.4 + r() * 0.6; }
      rs += (rz - rs) * Math.min(1, DT * 5);
      const st = Math.round(Math.max(-1, Math.min(1, o.steer + rs)) * 2) / 2;
      inp = fahrer === 'vollgas' ? { steer: st, throttle: o.brake > 0.35 ? 0 : 1, brake: o.brake > 0.35 ? 1 : 0 } : { steer: st, throttle: o.throttle > 0.3 ? 1 : 0, brake: o.brake > 0.15 ? 1 : 0 };
    }
    race.step(DT, inp); M.t += DT; race.events.length = 0;
    if (race.state !== 'running') continue;
    const ti = race.tracker.idx, sp = car.speed();
    if (car.onGround >= 3 && sp > 8 && !car.surfaceKind) {
      const stunt = L.loop[ti] || L.tube[ti] || L.air[ti] || race.isJumpZone(ti);
      const b = winkel(car);
      if (!stunt && Math.abs(P.kA[race.ap.tr.idx]) * sp * sp >= 5) { M.curve += DT; if (b > 12) M.c12 += DT; if (b > 15) M.c15 += DT; M.sum += b * DT; }
      M.bmax = Math.max(M.bmax, b);
    }
  }
  M.ok = race.state === 'finished'; M.time = race.finalTime ?? null; M.crashes = race.crashes;
  // Kontrolle: im Sperrbereich (Stunt-Nähe) nie quer
  return M;
}

export function gegnerFahrt(env, staerke, assist = 'medium') {
  ARCADE_DRIFT.an = true;
  const F = new GegnerFeld(env, { anzahl: 1, staerke, seed: 3, assist, startplatz: 'hinten', schiene: 'nie' });
  const g = F.fahrer[0], L = env.track.line, P = env.prof, S = arcadeSperre(env.track, env.prof);
  const M = { curve: 0, c15: 0, c12: 0, sum: 0, bmax: 0, sperreQuer: 0, dk: 0, dsum: 0 };
  let t = 0;
  while (t < 300 && !g.fertig) {
    F.step(DT); t += DT;
    const c = g.car, i = g.idx(), sp = c.speed();
    if (g.zustand !== 'fahrt' || c.onGround < 3 || sp < 8 || c.surfaceKind) continue;
    const b = winkel(c);
    if (S[i] && b > 15) M.sperreQuer += DT;
    const stunt = L.loop[i] || L.tube[i] || L.air[i] || F.M.stunt[i];
    if (!stunt && Math.abs(P.kA[i]) * sp * sp >= 5) {
      M.curve += DT; if (b > 15) M.c15 += DT; if (b > 12) M.c12 += DT; M.sum += b * DT;
      if (g.drift && g.drift.segAt && g.drift.segAt[i] >= 0) { M.dk += DT; M.dsum += b * DT; }
    }
    M.bmax = Math.max(M.bmax, b);
  }
  M.ok = g.fertig; M.zeit = g.zeit;
  return M;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const list = (await driftTracks()).slice(+arg('von', 0), +arg('von', 0) + +arg('n', 42));
  const out = { spieler: {}, gegner: {} };
  if (arg('gegner', '0') !== '1') {
    const STUFEN = arg('stufen', 'medium,original').split(','), FAHRER = arg('fahrer', 'glatt,mensch,vollgas').split(',');
    for (const [name, mk] of list) {
      const v = verifySync(mk()); if (!v.env) continue;
      const z = [];
      for (const st of STUFEN) for (const fa of FAHRER) for (const neu of [false, true]) {
        const M = fahrt(v.env, st, fa, neu);
        const K = (out.spieler[`${st}/${fa}/${neu ? 'neu' : 'alt'}`] ||= { n: 0, ok: 0, cr: 0, curve: 0, c12: 0, c15: 0, sum: 0, bmax: 0, zeiten: {} });
        K.n++; if (M.ok) { K.ok++; K.zeiten[name] = M.time; } K.cr += M.crashes; K.curve += M.curve; K.c12 += M.c12; K.c15 += M.c15; K.sum += M.sum; K.bmax = Math.max(K.bmax, M.bmax);
        z.push(`${st[0]}/${fa[0]}/${neu ? 'n' : 'a'} ${M.ok ? M.time.toFixed(1) : 'X'} ${(M.c12 / Math.max(1e-6, M.curve) * 100).toFixed(0)}%${M.crashes ? ' cr' + M.crashes : ''}`);
      }
      console.log(name.padEnd(15), z.join(' | '));
    }
    console.log('\nStufe/Fahrer        Stand  im Ziel  Crashs/10  Kurvenzeit >12°  >15°   Ø Winkel  max   Rundenzeit zu alt');
    for (const k of Object.keys(out.spieler)) {
      const K = out.spieler[k], B = out.spieler[k.replace(/neu$/, 'alt')];
      let a = 0, b = 0; for (const nm in K.zeiten) if (B.zeiten[nm] != null) { a += K.zeiten[nm]; b += B.zeiten[nm]; }
      K.zeit = (a / b - 1) * 100;
      console.log(`${k.padEnd(26)} ${K.ok}/${K.n}   ${(K.cr / K.n * 10).toFixed(1).padStart(5)}     ${(K.c12 / K.curve * 100).toFixed(1).padStart(5)} %   ${(K.c15 / K.curve * 100).toFixed(1).padStart(5)} %  ${(K.sum / K.curve).toFixed(1).padStart(5)}°  ${K.bmax.toFixed(0).padStart(3)}°   ${K.zeit.toFixed(2)} %`);
    }
  } else {
    for (const assist of arg('stufen', 'medium,original').split(',')) for (const st of ['locker', 'ebenbuertig', 'profi']) {
      const K = (out.gegner[`${assist}/${st}`] = { n: 0, ok: 0, curve: 0, c15: 0, c12: 0, sum: 0, bmax: 0, sperreQuer: 0, dk: 0, dsum: 0 });
      for (const [, mk] of list) {
        const v = verifySync(mk()); if (!v.env) continue;
        const M = gegnerFahrt(v.env, st, assist);
        K.n++; if (M.ok) K.ok++; for (const f of ['curve', 'c15', 'c12', 'sum', 'sperreQuer', 'dk', 'dsum']) K[f] += M[f]; K.bmax = Math.max(K.bmax, M.bmax);
      }
      console.log(`${assist}/${st}: im Ziel ${K.ok}/${K.n} · Kurvenzeit > 15° ${(K.c15 / K.curve * 100).toFixed(1)} % (> 12° ${(K.c12 / K.curve * 100).toFixed(1)} %) · Ø ${(K.sum / K.curve).toFixed(1)}° · in Drift-Kurven Ø ${(K.dsum / Math.max(1e-6, K.dk)).toFixed(1)}° · max ${K.bmax.toFixed(0)}° · quer im Sperrbereich ${K.sperreQuer.toFixed(1)} s`);
    }
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(out));
}
