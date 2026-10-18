// n34 KI-Gegner in Node messen: 60 Sammlungs-Strecken (gleichmäßig aus 250) × Stärken. Je Strecke zuerst die Autopilot-
// Prüffahrt (Bestzeit-Niveau, verify.js), dann je Stärke ein Rennen ohne Spieler (GegnerFeld, volle Physik oder Schiene).
// Kennzahlen: alle im Ziel, Zeit / Autopilot-Zeit je Stärke, Reihenfolge Locker > Ebenbürtig > Profi (Mittel der Gegner),
// Profi ≈ Autopilot ± 5 %, Crashs (davon „Zusammenstoß“), Stöße, Rechenzeit je Auto und Rennsekunde.
// Leicht-Spur: höchstens ~2 min CPU je Aufruf → in Häppchen (--von/--bis), Ergebnis je Häppchen als JSON, --summe fasst zusammen.
// Aufruf:
//   node tools/gegner_mess.mjs --von=0 --bis=20 [--anzahl=1] [--schiene=nie|immer] [--fehler=0] [--json=tests/out/n34/mess_0.json]
//   node tools/gegner_mess.mjs --vergleich [--von --bis]   (Schiene ↔ Physik ohne Fehler, Ebenbürtig, 1 Gegner)
//   node tools/gegner_mess.mjs --summe=tests/out/n34/mess_*.json
import fs from 'fs'; import path from 'path'; import url from 'url';
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : process.argv.includes(`--${k}`) ? true : d; };
const imp = (p) => import(url.pathToFileURL(path.join(ROOT, p)).href);
const { verifySync } = await imp('src/track/verify.js');
const { parseTrk, TRK_BYTES } = await imp('src/track/trk.js');
const { trkToLayout } = await imp('src/track/trkimport.js');
const { tracksOf } = await imp('src/game/sammlung.js');
const { GegnerFeld, STAERKEN } = await imp('src/ai/gegner.js');

const DT = 1 / 120;
const STAERKE_LISTE = String(arg('staerken', 'locker,ebenbuertig,profi')).split(',');

// 60 Sammlungs-Strecken gleichmäßig verteilt (wie tools/mittel_probe.mjs)
export function sammlung60() {
  const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
  const T = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
  const B = TRK_BYTES || 1802, out = [];
  for (let q = 0; q < 60; q++) {
    const k = Math.floor((q + 0.5) * T.length / 60), t = T[k];
    out.push({ q, id: t.id, name: t.name, lay: () => { const L = trkToLayout(parseTrk(bin.subarray(k * B, (k + 1) * B), t.id)).layout; L.meta.key = t.id; return L; } });
  }
  return out;
}

// Ein Rennen ohne Spieler bis alle im Ziel (oder Zeitlimit)
export function rennen(env, apTime, opt) {
  const F = new GegnerFeld(env, { anzahl: 1, startplatz: 'hinten', assist: String(arg('assist', 'medium')), physik: String(arg('physik', 'stufe')), seed: 3, ...opt });
  const lim = apTime * 2.5 + 40;
  let t = 0;
  const c0 = process.cpuUsage();
  while (t < lim && !F.fahrer.every((g) => g.fertig)) { F.step(DT); t += DT; }
  const cpu = process.cpuUsage(c0);
  const crashGrund = {};
  for (const e of F.events) if (e.type === 'gegnerCrash') crashGrund[e.reason] = (crashGrund[e.reason] || 0) + 1;
  // Stöße (Ereignisse > 1,5 m/s) in Looping/Röhre/Korkenzieher/Schanze (Linienpunkt am Kontakt: nächster Gegner)
  let stossStunt = 0, stossAlle = 0;
  for (const e of F.events) {
    if (e.type !== 'stoss') continue;
    stossAlle++;
    let best = null, bd = 1e9;
    for (const g of F.fahrer) { const d = Math.hypot(g.car.pos.x - e.p[0], g.car.pos.z - e.p[2]); if (d < bd) { bd = d; best = g; } }
    if (best && F.M.muss[best.idx()]) stossStunt++;
  }
  return {
    t, stoesse: F.stoesse, crashGrund, stossAlle, stossStunt, msJeAutoSek: (cpu.user + cpu.system) / 1000 / Math.max(1, F.fahrer.length) / Math.max(1, t),
    g: F.fahrer.map((g) => ({ id: g.id, name: g.info.name, ch: g.info.charakter, fertig: g.fertig, zeit: g.zeit, crashes: g.crashes, strafen: g.strafen, fehler: g.fehler.length, nan: !Number.isFinite(g.car.pos.x + g.car.pos.y + g.car.pos.z) })),
  };
}

const mittel = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

// Hauptteil nur bei direktem Aufruf (sammlung60/rennen sind auch für tools/gegner_fehler.mjs da)
function main() {
  if (arg('summe')) {
    const pat = String(arg('summe'));
    const dir = path.dirname(pat), re = new RegExp('^' + path.basename(pat).replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
    const rows = fs.readdirSync(dir).filter((f) => re.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).rows);
    zusammenfassen(rows);
    process.exit(0);
  }

  const list = sammlung60().slice(+arg('von', 0), +arg('bis', 60));
  const rows = [];
  const vergleich = !!arg('vergleich');
  for (const tr of list) {
    const t0 = Date.now();
    let v;
    try { v = verifySync(tr.lay(), 0); } catch (e) { console.log(`${tr.id} Bau-Fehler ${e.message}`); continue; }
    if (!v.ok) { console.log(`${tr.id.padEnd(8)} Autopilot ohne Ziel (${v.reason}) – übersprungen`); rows.push({ id: tr.id, apOk: false }); continue; }
    const row = { id: tr.id, name: tr.name, ap: v.apTime, len: v.env.track.line.total, closed: v.env.track.line.closed, st: {} };
    if (vergleich) {
      const a = rennen(v.env, v.apTime, { staerke: 'ebenbuertig', schiene: 'nie', fehler: false });
      const b = rennen(v.env, v.apTime, { staerke: 'ebenbuertig', schiene: 'immer', fehler: false });
      row.physik = a.g[0].zeit; row.schiene = b.g[0].zeit; row.msPhysik = a.msJeAutoSek; row.msSchiene = b.msJeAutoSek;
      console.log(`${tr.id.padEnd(8)} AP ${v.apTime.toFixed(1).padStart(6)}  Physik ${a.g[0].zeit?.toFixed(1)}  Schiene ${b.g[0].zeit?.toFixed(1)}  (${((b.g[0].zeit / a.g[0].zeit - 1) * 100).toFixed(1)} %)  ${a.msJeAutoSek.toFixed(2)} / ${b.msJeAutoSek.toFixed(3)} ms je Auto-Sekunde`);
    } else {
      for (const st of STAERKE_LISTE) {
        const r = rennen(v.env, v.apTime, { staerke: st, anzahl: +arg('anzahl', 1), schiene: arg('schiene', 'nie'), fehler: arg('fehler', '1') !== '0' });
        row.st[st] = r;
      }
      const z = (st) => mittel(row.st[st].g.filter((g) => g.fertig).map((g) => g.zeit));
      console.log(`${tr.id.padEnd(8)} AP ${v.apTime.toFixed(1).padStart(6)}  ` + STAERKE_LISTE.map((st) => `${st.slice(0, 5)} ${z(st).toFixed(1).padStart(6)} (${((z(st) / v.apTime - 1) * 100).toFixed(1).padStart(5)} %, ${row.st[st].g.filter((g) => g.fertig).length}/${row.st[st].g.length}, Crash ${row.st[st].g.reduce((a, g) => a + g.crashes, 0)})`).join('  ') + `  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    }
    rows.push(row);
  }
  if (arg('json')) { fs.mkdirSync(path.dirname(String(arg('json'))), { recursive: true }); fs.writeFileSync(String(arg('json')), JSON.stringify({ args: process.argv.slice(2), rows }, null, 0)); }
  if (vergleich) {
    const ok = rows.filter((r) => r.physik && r.schiene);
    const d = ok.map((r) => r.schiene / r.physik - 1);
    console.log(`Schiene ↔ Physik: ${ok.length} Strecken, Mittel ${(mittel(d) * 100).toFixed(2)} %, min ${(Math.min(...d) * 100).toFixed(1)} %, max ${(Math.max(...d) * 100).toFixed(1)} %; Rechenzeit Physik ${mittel(ok.map((r) => r.msPhysik)).toFixed(2)} ms, Schiene ${mittel(ok.map((r) => r.msSchiene)).toFixed(3)} ms je Auto-Sekunde`);
  } else zusammenfassen(rows);

}
if (import.meta.url === url.pathToFileURL(process.argv[1]).href) main();
function zusammenfassen(rows) {
  const ok = rows.filter((r) => r.apOk !== false && r.st);
  const S = STAERKE_LISTE.filter((st) => ok.some((r) => r.st[st]));
  let alle = 0, ziel = 0, reihe = 0, nan = 0;
  const quote = {}, crashes = {}, gruende = {};
  for (const st of S) { quote[st] = []; crashes[st] = 0; }
  for (const r of ok) {
    const m = {};
    for (const st of S) {
      const R = r.st[st]; if (!R) continue;
      for (const g of R.g) { alle++; if (g.fertig) ziel++; if (g.nan) nan++; crashes[st] += g.crashes; }
      for (const [k, n] of Object.entries(R.crashGrund || {})) gruende[k] = (gruende[k] || 0) + n;
      const fz = R.g.filter((g) => g.fertig).map((g) => g.zeit);
      m[st] = mittel(fz); quote[st].push(m[st] / r.ap);
    }
    if (S.length >= 2 && S.every((st, k) => k === 0 || m[S[k - 1]] > m[st])) reihe++;
    else if (S.length < 2) reihe = -1;
  }
  console.log(`\n${ok.length} Strecken (Autopilot im Ziel), ${rows.length - ok.length} übersprungen. Gegner im Ziel: ${ziel}/${alle}, NaN: ${nan}`);
  for (const st of S) {
    const q = quote[st].slice().sort((a, b) => a - b);
    console.log(`  ${(STAERKEN[st] ? STAERKEN[st].name : st).padEnd(11)} Zeit/Autopilot: Mittel ${(mittel(q) * 100 - 100).toFixed(1)} %, Median ${((q[Math.floor(q.length / 2)] || 0) * 100 - 100).toFixed(1)} %, 10–90 % ${((q[Math.floor(q.length * 0.1)] || 0) * 100 - 100).toFixed(1)} … ${((q[Math.floor(q.length * 0.9)] || 0) * 100 - 100).toFixed(1)} %; Crashs ${crashes[st]}`);
  }
  if (S.includes('profi')) { const q = quote.profi; console.log(`  Profi innerhalb ± 5 % des Autopiloten: ${q.filter((x) => Math.abs(x - 1) <= 0.05).length}/${q.length}`); }
  console.log(`  ${reihe >= 0 ? `Reihenfolge ${S.join(' > ')} (langsamer → schneller) auf ${reihe}/${ok.length} Strecken; ` : ''}Crash-Gründe ${JSON.stringify(gruende)}`);
  let sa = 0, ss = 0; for (const r of ok) for (const st of S) if (r.st[st]) { sa += r.st[st].stossAlle || 0; ss += r.st[st].stossStunt || 0; }
  console.log(`  Stöße > 1,5 m/s: ${sa}, davon in Looping/Röhre/Korkenzieher/Schanze ${ss}`);
}
