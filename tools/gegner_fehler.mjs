// n34 Fehler-Modell der KI-Gegner messen (Sammlungs-Strecken, Locker, 1 Gegner): je Strecke ein Rennen mit und eins ohne Fehler-
// Plan (sonst gleich) in voller Physik → Zeitverlust je Fehler (ohne Strafzeit), Anteil „Patzer → Crash“; dazu dasselbe auf der
// Schiene (alle Fehler pauschal, SCHIENE.*) → passt die Schiene zur Physik? Grundlage für SCHIENE.pCrash/verlust*.
// Aufruf: node tools/gegner_fehler.mjs [--von=0 --bis=20] [--staerke=locker]   (~100 s je 20 Strecken)
import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { verifySync } = await imp('src/track/verify.js');
const { GegnerFeld, SCHIENE } = await imp('src/ai/gegner.js');
const { PENALTY } = await imp('src/game/race.js');
const { sammlung60 } = await imp('tools/gegner_mess.mjs');

const ST = arg('staerke', 'locker');
const lauf = (env, apT, q, fehler, schiene) => {
  const F = new GegnerFeld(env, { anzahl: 1, staerke: ST, seed: 11 + q, startplatz: 'hinten', schiene, fehler });
  const g = F.fahrer[0];
  let t = 0, last = null; const crashBei = [];
  while (t < apT * 3 && !g.fertig) {
    const c0 = g.crashes; F.step(1 / 120); t += 1 / 120;
    if (g.aktiv) last = g.aktiv;
    if (g.crashes > c0) crashBei.push(g.aktiv ? g.aktiv.art : last && g.fortschritt() - last.bis < 60 ? last.art : '-');
  }
  return { zeit: g.zeit, netto: g.zeit - g.strafen, crashes: g.crashes, crashBei, plan: g.fehler };
};
let pat = 0, patCrash = 0, spaet = 0, spaetCrash = 0, verlustP = 0, verlustS = 0, nP = 0, nS = 0, dSch = [];
for (const tr of sammlung60().slice(+arg('von', 0), +arg('bis', 20))) {
  const v = verifySync(tr.lay(), 0); if (!v.ok) continue;
  const mit = lauf(v.env, v.apTime, tr.q, true, 'nie'), ohne = lauf(v.env, v.apTime, tr.q, false, 'nie');
  const n = mit.plan.filter((e) => e.art === 'patzer').length, ns = mit.plan.filter((e) => e.art === 'spaet').length;
  pat += n; spaet += ns;
  patCrash += mit.crashBei.filter((x) => x === 'patzer').length; spaetCrash += mit.crashBei.filter((x) => x === 'spaet').length;
  const d = mit.netto - ohne.netto;
  // Verlust je Fehler-Art grob trennen: Strecken nur mit einer Art
  if (n && !ns) { verlustP += d; nP += n; } else if (ns && !n) { verlustS += d; nS += ns; }
  const sch = lauf(v.env, v.apTime, tr.q, true, 'immer');
  dSch.push(sch.zeit / mit.zeit - 1);
  console.log(`${tr.id.padEnd(8)} Patzer ${n} Verbremser ${ns}  Physik ${mit.zeit.toFixed(1)} (ohne Fehler ${ohne.zeit.toFixed(1)}, Crashs ${mit.crashes})  Schiene ${sch.zeit.toFixed(1)} (${((sch.zeit / mit.zeit - 1) * 100).toFixed(1)} %)`);
}
const m = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
console.log(`\nPatzer: ${pat}, davon Crash ${patCrash} (${(100 * patCrash / Math.max(1, pat)).toFixed(0)} %; Schiene pCrash ${SCHIENE.pCrash}), Zeitverlust je Patzer ohne Strafzeit ~${(verlustP / Math.max(1, nP)).toFixed(1)} s (aus ${nP}; Schiene erwartet ${(SCHIENE.pCrash * SCHIENE.verlustCrash + (1 - SCHIENE.pCrash) * SCHIENE.verlustPatzer).toFixed(1)} s)`);
console.log(`Verbremser: ${spaet}, davon Crash ${spaetCrash}, Zeitverlust je Verbremser ~${(verlustS / Math.max(1, nS)).toFixed(1)} s (aus ${nS}; Schiene ${SCHIENE.verlustSpaet} s); Strafzeit je Crash ${PENALTY} s`);
console.log(`Schiene ↔ Physik mit Fehlern: Mittel ${(m(dSch) * 100).toFixed(1)} %, min ${(Math.min(...dSch) * 100).toFixed(1)} %, max ${(Math.max(...dSch) * 100).toFixed(1)} %`);
