// n45 (Peter 04.11.2026): wartende Gegner geben Gas, wenn du aufholst (ANZUG) · Rempler ohne Sofort-Strafe (HAERTE) · Arcade-Drift.
// Volle Messung: tools/n45_mess.mjs (288 Rennen), Bericht N45_BERICHT.md. Aufruf: node tests/node/test_n45.mjs
import { generate } from '../../src/track/generator.js';
import { verifySync } from '../../src/track/verify.js';
import { ANZUG, AUFHOL } from '../../src/ai/gegner.js';
import { HAERTE, HAERTE_ALT, REMPEL_ALT } from '../../src/physics/autoauto.js';
import { lauf } from '../../tools/n45_mess.mjs';

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

console.log(bad ? `n45: ${bad} FEHLER` : 'n45: alles OK');
process.exit(bad ? 1 : 0);
