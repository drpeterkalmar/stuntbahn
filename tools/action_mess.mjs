// n36 Action-Momente: Häufigkeit je Rennen auf geprüften Zufallsstrecken (flach, Hochstraße, Gelände; Stufen 1–3), mit und ohne
// KI-Gegner. Das Rennen läuft wie im Spiel in Bildern zu 1/60 s (Echtzeit), die Regie (game/action.js) bekommt je Bild Takt,
// Ereignisse und Zustand; in einem Moment laufen die Physikschritte langsamer (physK) – wie main.js.
//   Fahrer leicht – Leicht, Autopilot mit „Extras automatisch“
//          profi  – Mittel, lenkt wie der Autopilot, Vollgas außer bei „Bremsen!“/„langsamer ▼“, tippt in der Luft Gas (Salto)
// Kennzahlen je Rennen: Kandidaten, Momente (je Art), Momente je Minute, Anteil Zeitlupe an der Fahrzeit, längster Moment,
// abgelehnt wegen Gefahr/Abkühlzeit/Zufall; dazu Gleichheit: Rennzeit mit Regie = Rennzeit ohne (fair, gleiche Schritte).
// Aufruf: node tools/action_mess.mjs [N je Art und Stufe = 2] [--stufe=selten,oft] [--gegner=0,3] [--fahrer=leicht,profi] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { generate } = await imp('src/track/generator.js');
const { verifySync } = await imp('src/track/verify.js');
const { Race, REC_HZ } = await imp('src/game/race.js');
const { GegnerFeld } = await imp('src/ai/gegner.js');
const { ActionRegie, ACTION } = await imp('src/game/action.js');
const { mulberry } = await imp('src/ai/gegner.js');

const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const N = +(process.argv.find((a) => /^\d+$/.test(a)) || 2);
const STUFEN = arg('stufe', 'selten,oft').split(','), GEGNER = arg('gegner', '0,3').split(',').map(Number), FAHRER = arg('fahrer', 'leicht,profi').split(',');
const MODES = arg('modes', 'flach,3d,gel').split(',');
const DT = 1 / 120, FR = 1 / 60;

export function bodenFn(env) {
  return (x, y, z) => {
    const W = env.world, h = W.rayTrack(x, y, z, 0, -1, 0, 300, false);
    let yb = h ? y - h.t : -1e9;
    if (W.terrain) yb = Math.max(yb, W.terrain.height(x, z));
    return yb;
  };
}

// Ein Rennen in Bildern; regie = null → ohne (Vergleich). Liefert { zeit, fertig, regie, zlT (Echtzeit in Zeitlupe), echtT }
export function rennen(v, opt = {}) {
  const fahrer = opt.fahrer || 'leicht', key = fahrer === 'leicht' ? 'easy' : 'medium';
  const r = new Race(v.env, { assist: key, countdown: 0.05, autoExtras: fahrer === 'leicht', seed: opt.seed ?? 7, brakeHelp: 'hint' });
  const F = opt.gegner > 0 ? new GegnerFeld(v.env, { anzahl: opt.gegner, staerke: 'ebenbuertig', seed: opt.seed ?? 7, assist: key, startplatz: 'mitte' }) : null;
  if (F) F.spielerAufstellen(r);
  const R = opt.stufe ? new ActionRegie({ stufe: opt.stufe, online: !!opt.online, rnd: mulberry((opt.rseed ?? opt.seed ?? 7) * 7919 + 13) }) : null;
  const W = { race: r, env: v.env, gegner: F, boden: bodenFn(v.env), g: 9.81 * 0.7, recT: 0, best: opt.best ?? null, teile: false };
  const lim = Math.max(120, (v.apTime || 60) * 3);
  let inp = { steer: 0, throttle: 0, brake: 0 }, acc = 0, echt = 0, zl = 0, maxDur = 0, curDur = 0;
  const schritte = [];
  while (r.simTime < lim && r.state !== 'finished') {
    if (R) R.takt(FR);
    const k = R ? R.physK : 1;
    if (R && R.M && k < 0.999) { curDur += FR; zl += FR; } else { maxDur = Math.max(maxDur, curDur); curDur = 0; }   // Dauer = Zeitlupe (ohne Nachlauf)
    acc += FR * k; echt += FR;
    let n = 0;
    while (acc >= DT && n < 14) {
      r.step(DT, inp);
      if (F) { F.step(DT, r); if (R) for (const e of F.events) R.gegnerEreignis(e, W); F.events.length = 0; }
      acc -= DT; n++;
      inp = fahrerEingabe(r, fahrer);
      if (opt.spur) schritte.push(r.car.pos.x + r.car.pos.y * 1e-3);
    }
    if (R) { W.recT = r.recFrames() / REC_HZ; for (const e of r.events) R.ereignis(e, W); R.beobachte(W); }
    r.events.length = 0;
  }
  return { zeit: r.state === 'finished' ? r.finalTime : null, fertig: r.state === 'finished', crashes: r.crashes, regie: R, zlT: zl, echtT: echt, maxDur: Math.max(maxDur, curDur), schritte, race: opt.film ? r : null };
}

export function fahrerEingabe(r, fahrer) {
  if (fahrer === 'leicht') return { steer: 0, throttle: 0, brake: 0 };
  const o = r.ap.out, c = r.car;
  let inp = { steer: o.steer, throttle: r.bhOn || r.jumpSt === 'hi' ? 0 : 1, brake: r.bhOn ? 1 : 0 };
  if (c.onGround === 0) { const a = c.airTime; inp = { ...inp, throttle: a >= 0.32 && a < 0.38 ? 1 : 0, brake: 0 }; }
  return inp;
}

export function strecken(n, modes = MODES) {
  const out = [];
  for (const mode of modes) {
    const o = mode === '3d' ? { d3: true } : mode === 'gel' ? { gel: true } : {};
    for (const diff of [1, 2, 3]) for (let k = 0; k < n; k++) {
      const seed = 3100 + k * 37 + diff * 7;
      const v = verifySync(generate(seed, diff, { ...o, gv: 2 }));
      if (v.ok) out.push({ name: `${seed}-${diff}-${mode}h`, diff, mode, v });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const T = strecken(N);
  console.log(`${T.length} Strecken (${MODES.join(', ')}, Stufen 1–3, je ${N})`);
  const res = {};
  for (const stufe of STUFEN) for (const g of GEGNER) for (const f of FAHRER) {
    const key = `${stufe}|${g}|${f}`, A = res[key] = { rennen: 0, momente: 0, kand: 0, je: {}, abgelehnt: {}, min: 0, zl: 0, maxDur: 0, fair: 0, fairN: 0, proRennen: [] };
    for (const [ti, t] of T.entries()) {
      const x = rennen(t.v, { stufe, gegner: g, fahrer: f, seed: 7, rseed: 101 + ti * 31 });   // Zufall der Regie je Strecke anders
      const S = x.regie.stats();
      A.rennen++; A.momente += S.momente; A.kand += S.kandidaten; A.min += x.echtT / 60; A.zl += x.zlT; A.maxDur = Math.max(A.maxDur, x.maxDur);
      A.proRennen.push(S.momente);
      for (const [art, b] of Object.entries(S.je)) { const q = A.je[art] || (A.je[art] = { kand: 0, ok: 0 }); q.kand += b.kand; q.ok += b.ok; }
      for (const e of x.regie.log) if (!e.ok) A.abgelehnt[e.grund] = (A.abgelehnt[e.grund] || 0) + 1;
      // Fairness: dieselbe Fahrt ohne Regie → gleiche Rennzeit
      if (A.fairN < 3) { const y = rennen(t.v, { fahrer: f, gegner: g, seed: 7 }); A.fairN++; if (x.zeit != null && y.zeit != null && Math.abs(x.zeit - y.zeit) < 1e-9) A.fair++; }
    }
    const pr = A.proRennen.slice().sort((a, b) => a - b);
    console.log(`${stufe.padEnd(6)} Gegner ${g} ${f.padEnd(6)}: ${A.rennen} Rennen, Momente ${(A.momente / A.rennen).toFixed(2)}/Rennen (Median ${pr[pr.length >> 1]}, max ${pr[pr.length - 1]}), ${(A.momente / A.min).toFixed(2)}/min, Zeitlupe ${(100 * A.zl / (A.min * 60)).toFixed(1)} % der Fahrzeit, längster ${A.maxDur.toFixed(2)} s, Kandidaten ${(A.kand / A.rennen).toFixed(1)}/Rennen, fair ${A.fair}/${A.fairN}`);
    console.log('   je Art: ' + Object.entries(A.je).map(([k, b]) => `${k} ${b.ok}/${b.kand}`).join(' · ') + '   abgelehnt: ' + Object.entries(A.abgelehnt).map(([k, n]) => `${k} ${n}`).join(' · '));
  }
  const j = arg('json', null);
  if (j) fs.writeFileSync(j, JSON.stringify(res, null, 1));
}
