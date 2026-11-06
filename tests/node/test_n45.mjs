// n45 (Peter 04.11.2026): wartende Gegner geben Gas, wenn du aufholst (ANZUG) · Rempler ohne Sofort-Strafe (HAERTE) · Arcade-Drift.
// Volle Messung: tools/n45_mess.mjs (288 Rennen), Bericht N45_BERICHT.md. Aufruf: node tests/node/test_n45.mjs
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { ANZUG, AUFHOL } from '../../src/ai/gegner.js';
import { HAERTE, HAERTE_ALT, REMPEL_ALT } from '../../src/physics/autoauto.js';
import { lauf } from '../../tools/n45_mess.mjs';
import { ARCADE_DRIFT, arcadeSoll, arcadePose, ArcadeDrift } from '../../src/core/arcadedrift.js';
import { fahrt, gegnerFahrt } from '../../tools/n45_drift_mess.mjs';
import { Race } from '../../src/game/race.js';

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };

// ---------- 1. Aufhol-Anzug ----------
ok(ANZUG.an && ANZUG.tau < 1 && AUFHOL.physVor === 0.2, `Anzug an, Anstieg τ ${ANZUG.tau} s (< 1 s), Gummiband sonst wie 0.19.3`);
{
  const sum = { neu: { auf: 0, langsam: 0, nV: 0, in100: 0, n: 0, strafe: 0 }, alt: { auf: 0, langsam: 0, nV: 0, in100: 0, n: 0, strafe: 0 } };
  for (const [s, d] of [[11, 2], [4711, 3], [77, 2]]) {
    const v = verifySync(generate(s, d));
    for (const an of [true, false]) {
      ANZUG.an = an;
      const r = lauf(v, { assist: 'medium', staerke: 'ebenbuertig', sp: '0.5', anzahl: 5 });
      const S = sum[an ? 'neu' : 'alt'];
      S.auf += r.auf; S.langsam += r.langsam * r.nVor; S.nV += r.nVor; S.in100 += r.in100; S.n++; S.strafe += r.strafeKontakt;
    }
  }
  ANZUG.an = true;
  const N = sum.neu, A = sum.alt;
  ok(N.auf <= A.auf * 0.6, `Anzug: Auffahr-Kontakte des Spielers (× 0,5, 5 × Ebenbürtig, 3 Strecken) ${A.auf} → ${N.auf} (≤ −40 %)`);
  ok(N.langsam / N.nV < A.langsam / A.nV, `Anzug: Gegner vorn seltener > 15 % langsamer (${(A.langsam / A.nV * 100).toFixed(0)} → ${(N.langsam / N.nV * 100).toFixed(0)} %)`);
  // (volle Probe tools/gummiband_probe.mjs: 94/97/84/90 % statt 94/98/84/93 % – hier 3 Strecken, eine mit Stunt-Rücksetzern)
  ok(N.in100 / N.n >= 0.8, `Gegner bleiben in der Nähe: ≤ 100 m ${(A.in100 / A.n * 100).toFixed(0)} → ${(N.in100 / N.n * 100).toFixed(0)} % der Zeit`);
}

// ---------- 2. Rempel-Schwelle ----------
ok(!REMPEL_ALT && HAERTE.mittel.crash === 30 && HAERTE.hart.crash === 19, `Rempel-Schwelle Mittel ${HAERTE.mittel.crash} m/s, Original ${HAERTE.hart.crash} m/s (0.19.3: ${HAERTE_ALT.mittel.crash} / ${HAERTE_ALT.hart.crash})`);
ok(HAERTE.weich.crash === Infinity && HAERTE_ALT.weich === HAERTE.weich, 'Leicht weich wie bisher (nie Crash)');
{
  const v = verifySync(generate(4711, 3));
  const r = lauf(v, { assist: 'original', staerke: 'locker', sp: '1', anzahl: 5 });
  ok(r.ziel && r.strafeKontakt <= 3, `Original, 5 × Locker, Spieler × 1,0: ${r.kontakte} Kontakte, ${r.strafeKontakt} Strafen daraus (≤ 3)`);
}

// ---------- 3. Arcade-Drift ----------
ok(ARCADE_DRIFT.an && !ARCADE_DRIFT.heckN43, 'Arcade-Drift Standard an, lockeres Heck n43 auf Mittel/Original still');
{
  const a = [3, 5, 8, 12, 20, 30].map((x) => arcadeSoll(x, 30));
  ok(a.every((x, i) => !i || x >= a[i - 1]) && arcadeSoll(1.5, 30) === 0 && arcadeSoll(10, 8) === 0 && a[5] <= ARCADE_DRIFT.max, `Soll-Winkel wächst mit der Kurve (${a.map((x) => x.toFixed(0)).join('/')}°), 0 auf der Geraden und unter 40 km/h`);
  // Drehpunkt bleibt stehen, Lage nur um die Hochachse gedreht
  const fr = { r: { x: 1, y: 0, z: 0 }, u: { x: 0, y: 1, z: 0 }, f: { x: 0, y: 0, z: -1 } };
  const P = arcadePose({ pos: { x: 0, y: 0, z: 0 }, q: { x: 0, y: 0, z: 0, w: 1 } }, fr, 0.4);
  const piv = ARCADE_DRIFT.pivot, ang = 2 * Math.atan2(P.q.y, P.q.w);
  // Nase (lokal −z) nach Drehung um +y zeigt nach links (−x); Drehpunkt (0,0,−pivot) bleibt
  const nx = -Math.sin(ang) * piv + P.pos.x, nz = -Math.cos(ang) * piv + P.pos.z;
  ok(Math.abs(ang - 0.4) < 1e-6 && Math.abs(nx) < 1e-6 && Math.abs(nz + piv) < 1e-6 && P.q.x === 0 && P.q.z === 0, `Darstellung: um die Hochachse gedreht, Drehpunkt ${piv} m vor der Mitte bleibt stehen`);
}
{
  // Nur Darstellung: Rundenzeit und Lage bitgleich mit Stärke 0 (k = 0)
  const v = verifySync(generate(11, 2));
  const run = () => { const r = new Race(v.env, { assist: 'original', countdown: 0.5, fahrstil: 'sauber', seed: 1 }); let t = 0; while (t < 150 && r.state !== 'finished') { r.step(1 / 120, { steer: r.ap.out.steer, throttle: r.ap.out.throttle, brake: r.ap.out.brake }); r.events.length = 0; t += 1 / 120; } return [r.finalTime, r.car.pos.x, r.car.pos.z].join(','); };
  const a = run(); ARCADE_DRIFT.k = 0; const b = run(); ARCADE_DRIFT.k = 1;
  ok(a === b, `Arcade-Drift ändert die Physik nicht (Original, Zeit und Lage gleich mit/ohne: ${a.split(',')[0]})`);
}
{
  const { driftTracks } = await import('../../tools/drift_mess.mjs');
  const list = (await driftTracks()).filter((_, i) => i % 7 === 0).slice(0, 6);
  for (const st of ['medium', 'original']) {
    let c = 0, c12 = 0, ta = 0, tn = 0, cra = 0, crn = 0, gc = 0, gc15 = 0, gsq = 0;
    for (const [, mk] of list) {
      const v = verifySync(mk()); if (!v.env) continue;
      const A = fahrt(v.env, st, 'glatt', false), N = fahrt(v.env, st, 'glatt', true), H = fahrt(v.env, st, 'mensch', true), Ha = fahrt(v.env, st, 'mensch', false);
      c += N.curve + H.curve; c12 += N.c12 + H.c12; if (A.ok && N.ok) { ta += A.time; tn += N.time; } cra += A.crashes + Ha.crashes; crn += N.crashes + H.crashes;
      if (st === 'medium') { const G = gegnerFahrt(v.env, 'profi'); gc += G.curve; gc15 += G.c15; gsq = Math.max(gsq, G.sperreQuer); }
    }
    ARCADE_DRIFT.an = true;
    ok(c12 / c >= 0.4, `${st}: glatt + Handy-Fahrer ${(c12 / c * 100).toFixed(0)} % der Kurvenzeit sichtbar quer (> 12°, Ziel ≥ 40 %)`);
    ok(Math.abs(tn / ta - 1) <= 0.02, `${st}: Rundenzeit Sauber-Fahrer ${((tn / ta - 1) * 100).toFixed(2)} % zu 0.19.3 (Bestzeiten ±2 %)`);
    // (Rauschen: ohne das lockere Heck n43 fährt das Auto minimal anders – volle Messung tools/n45_drift_mess.mjs über 42 Strecken)
    ok(crn <= cra * 1.1 + 1, `${st}: Crashs nicht mehr als 0.19.3 (${cra} → ${crn}, ±10 %)`);
    if (st === 'medium') ok(gsq < 1, `Gegner nie lange quer im Sperrbereich (höchstens ${gsq.toFixed(2)} s je Rennen)`);
    if (st === 'medium') ok(gc15 / gc >= 0.4, `Gegner Profi: ${(gc15 / gc * 100).toFixed(0)} % der Kurvenzeit > 15° (Ziel ≥ 40 %)`);
  }
}

console.log(bad ? `n45: ${bad} FEHLER` : 'n45: alles OK');
process.exit(bad ? 1 : 0);
