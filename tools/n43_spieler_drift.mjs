// n43 „alle Autos driften mehr“ – Spieler-Auto (lockeres Heck, physics/car.js HECK) in Node messen, alt (HECK aus = 0.17.0)
// gegen neu, je Fahrhilfe-Stufe. Fahrer:
//   glatt  – Leicht: Sauber-Autopilot „Hände weg“; Mittel/Original: Lenkung und Pedale des Autopiloten (Bestzeit-Maßstab: die
//            Rundenzeit darf sich höchstens ± 2 % ändern, sonst passen gespeicherte Bestzeiten nicht mehr)
//   mensch – wie ein Handy-Spieler: Gas/Bremse digital (an/aus nach dem Autopiloten, also Gas-Lupfer und Bremsimpulse), Lenkung
//            des Autopiloten mit langsamem Rauschen (± rausch) in groben Stufen; Leicht: Hände weg + Lenk-Tipps (Rauschen)
//   vollgas – Arcade-Handy-Spieler (Mittel/Original): immer Vollgas, spät und voll bremsen, Lenkung in Stufen
// Kennzahlen wie tools/drift_mess.mjs: Kurvenzeit (Plan-Querbeschleunigung ≥ 5 m/s², keine Stunts) mit Schwimmwinkel > 10°,
// Drifts (> 12° mindestens 0,4 s), Rundenzeit, Crashs, im Ziel.
// Aufruf: node tools/n43_spieler_drift.mjs [--n=42] [--von=0] [--stufen=easy,medium,original] [--fahrer=glatt,mensch]
//         [--heck=0,1] [--rausch=0.15] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const { driftTracks } = await imp('tools/drift_mess.mjs');
const { verifySync } = await imp('src/track/verify.js');
const { Race } = await imp('src/game/race.js');
const { HECK } = await imp('src/physics/car.js');
const { mulberry } = await imp('src/ai/gegner.js');
const DT = 1 / 120;
// Abstimmen: --hset=easy.gas:0,original.lift:0.2,liftDrop:0.8 (HECK in physics/car.js)
for (const kv of String(arg('hset', '')).split(',').filter(Boolean)) { const [k, x] = kv.split(':'); const [a, b] = k.split('.'); if (b) HECK[a][b] = +x; else HECK[a] = +x; }
const STUFEN = arg('stufen', 'easy,medium,original').split(',');
const FAHRER = arg('fahrer', 'glatt,mensch').split(',');
const HECKS = arg('heck', '0,1').split(',').map(Number);
const RAUSCH = +arg('rausch', 0.15);

export function fahrt(env, stufe, fahrer, seed = 1) {
  const race = new Race(env, { assist: stufe, countdown: 0.5, fahrstil: 'sauber', seed });
  const L = env.track.line, P = env.prof, car = race.car, r = mulberry(seed * 977 + 13);
  const M = { t: 0, curve: 0, curve10: 0, drive: 0, b10: 0, drifts: 0, bmax: 0 };
  let ep = 0, rs = 0, rz = 0, rT = 0;
  const lim = Math.max(150, L.total / 5);
  while (M.t < lim && race.state !== 'finished') {
    let inp;
    const o = race.ap.out;
    if (stufe === 'easy') inp = { steer: 0, throttle: 0, brake: 0 };
    else inp = { steer: o.steer, throttle: o.throttle, brake: o.brake };
    if (fahrer === 'vollgas' && stufe !== 'easy') {
      // Arcade-Spieler: immer Vollgas, nur bei deutlichem Bremsbedarf voll in die Eisen (spät, digital), Lenkung in Stufen
      if ((rT -= DT) <= 0) { rz = (r() * 2 - 1) * RAUSCH; rT = 0.4 + r() * 0.6; }
      rs += (rz - rs) * Math.min(1, DT * 5);
      inp = { steer: Math.round(Math.max(-1, Math.min(1, o.steer + rs)) * 2) / 2, throttle: o.brake > 0.35 ? 0 : 1, brake: o.brake > 0.35 ? 1 : 0 };
    }
    else if (fahrer === 'mensch') {
      // langsames Lenk-Rauschen: neues Ziel alle 0,4 … 1 s, weich angefahren
      if ((rT -= DT) <= 0) { rz = (r() * 2 - 1) * RAUSCH; rT = 0.4 + r() * 0.6; }
      rs += (rz - rs) * Math.min(1, DT * 5);
      if (stufe === 'easy') inp.steer = Math.abs(rs) > RAUSCH * 0.7 ? Math.sign(rs) * 0.6 : 0;   // kurze Tipps
      else {
        // Handy: Lenkung in groben Stufen (0, ± 0,5, ± 1) – wie ein Daumen auf den Pfeil-Knöpfen
        inp.steer = Math.round(Math.max(-1, Math.min(1, inp.steer + rs)) * 2) / 2;
        inp.throttle = o.throttle > 0.3 ? 1 : 0;
        inp.brake = o.brake > 0.15 ? 1 : 0;
      }
    }
    race.step(DT, inp); M.t += DT; race.events.length = 0;
    if (race.state !== 'running') { ep = 0; continue; }
    const F = car.frame, sp = car.speed(), ti = race.tracker.idx;
    const vf = car.v.x * F.f.x + car.v.y * F.f.y + car.v.z * F.f.z, vr = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
    const b = Math.abs(Math.atan2(vr, vf)) * 180 / Math.PI;
    if (car.onGround >= 3 && sp > 8 && !car.surfaceKind) {
      M.drive += DT; if (b > 10) M.b10 += DT;
      const stunt = L.loop[ti] || L.tube[ti] || L.air[ti] || race.isJumpZone(ti);
      if (!stunt && Math.abs(P.kA[race.ap.tr.idx]) * sp * sp >= 5) { M.curve += DT; if (b > 10) M.curve10 += DT; }
      M.bmax = Math.max(M.bmax, b);
      if (b > 12) ep += DT; else { if (ep >= 0.4) M.drifts++; ep = 0; }
    }
  }
  M.ok = race.state === 'finished'; M.time = race.finalTime ?? null; M.crashes = race.crashes;
  return M;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url).replace(/\?.*$/, "")) {
  const list = (await driftTracks()).slice(+arg('von', 0), +arg('von', 0) + +arg('n', 42));
  const S = {};
  for (const [name, mk] of list) {
    const v = verifySync(mk());
    if (!v.env) continue;
    const z = [];
    for (const st of STUFEN) for (const fa of FAHRER) for (const h of HECKS) {
      HECK.k = h;
      const M = fahrt(v.env, st, fa);
      const K = (S[`${st}/${fa}/${h}`] ||= { n: 0, ok: 0, cr: 0, curve: 0, curve10: 0, drifts: 0, zeiten: {} });
      K.n++; if (M.ok) { K.ok++; K.zeiten[name] = M.time; } K.cr += M.crashes; K.curve += M.curve; K.curve10 += M.curve10; K.drifts += M.drifts;
      z.push(`${st[0]}/${fa[0]}/${h}: ${M.ok ? M.time.toFixed(1) : 'X'} ${(M.curve10 / Math.max(1e-6, M.curve) * 100).toFixed(0)}%${M.crashes ? ' cr' + M.crashes : ''}`);
    }
    console.log(name.padEnd(15), z.join(' | '));
  }
  HECK.k = 1;
  console.log('\nStufe/Fahrer      Heck  im Ziel  Crashs/10  Kurvenzeit > 10°  Drifts/Runde  Rundenzeit zu Heck 0 (gleiche Strecken, Summe)');
  for (const st of STUFEN) for (const fa of FAHRER) for (const h of HECKS) {
    const K = S[`${st}/${fa}/${h}`], B = S[`${st}/${fa}/${HECKS[0]}`];
    let a = 0, b = 0; for (const nm in K.zeiten) if (B.zeiten[nm] != null) { a += K.zeiten[nm]; b += B.zeiten[nm]; }
    console.log(`${(st + '/' + fa).padEnd(18)} ${String(h).padEnd(4)}  ${K.ok}/${K.n}   ${(K.cr / K.n * 10).toFixed(1).padStart(5)}      ${(K.curve10 / Math.max(1e-6, K.curve) * 100).toFixed(1).padStart(5)} %          ${(K.drifts / K.n).toFixed(1).padStart(4)}        ${((a / b - 1) * 100).toFixed(2)} %`);
  }
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(S));
}
