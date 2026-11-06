// n45 (Peter 04.11.2026: „die npc gegner die auf mich warten [sollen] etwas beschleunigen wenn ich zu ihnen aufhole sonst gibt es
// ständig auffahrunfälle von mir … die strafe für aufpraller nicht so schnell“). Misst je Rennen (Spieler = Bot mit Autopilot-
// Lenkung, Tempo × s bzw. Crash-Spieler wie tools/gummiband_probe.mjs; blind = fährt auf, wie ein Mensch mit Vollgas):
//  - Auffahr-Kontakte des Spielers (Spieler-Front trifft Gegner-Heck, Stoß > 1,5 m/s; Kontakte binnen 1 s = einer)
//  - Strafen des Spielers aus Auto-Auto-Kontakt (Crash „Zusammenstoß“ oder ein anderer Crash ≤ 1 s nach einem Kontakt)
//  - Gegner-Crashs „Zusammenstoß“, alle Spieler-Crashs
//  - Gummiband: nächster Gegner ≤ 100 m (Anteil), max; „zu langsam vor dir“: Anteil der Zeit, in der ein Gegner 5 … 60 m vor dem
//    Spieler mehr als 15 % langsamer fährt als der Spieler (außer in Stunt-Nähe)
// Aufruf: node tools/n45_mess.mjs [--assist=medium,original] [--anzahl=3,5] [--strecken=11-2,…] [--staerken=…] [--spieler=1,0.7,0.5,crash]
//         [--aufhol=alt|neu] [--rempel=alt|neu] [--sieht=0|1] [--json=datei]
import fs from 'fs'; import path from 'path'; import url from 'url';
const R = url.pathToFileURL(path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..') + '/').href;
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
// Regler wie im Browser (?aufhol=alt, ?rempel=alt) – vor dem Import setzen
const qs = new URLSearchParams();
if (arg('aufhol')) qs.set('aufhol', arg('aufhol'));
if (arg('rempel')) qs.set('rempel', arg('rempel'));
for (const kv of String(arg('q', '')).split('&').filter(Boolean)) { const [k, x] = kv.split('='); qs.set(k, x ?? ''); }
globalThis.location = { search: '?' + qs.toString() };
const { generate } = await import(R + 'src/track/generator.js');
const { verifySync } = await import(R + 'src/track/verify.js');
const { Race } = await import(R + 'src/game/race.js');
const { GegnerFeld, ANZUG } = await import(R + 'src/ai/gegner.js');
// Abstimmen: --anzug=k:0.95,nah:100
for (const kv of String(arg('anzug', '')).split(',').filter(Boolean)) { const [k, x] = kv.split(':'); ANZUG[k] = +x; }
const DT = 1 / 120;
const STRECKEN = arg('strecken', '11-2,4711-3,77-2,5-1,2024-3,303-2').split(',').map((x) => x.split('-').map(Number));
const STAERKEN = arg('staerken', 'locker,ebenbuertig,profi').split(',');
const SPIELER = arg('spieler', '1,0.7,0.5,crash').split(',');
const ASSIST = arg('assist', 'medium,original').split(',');
const ANZAHL = arg('anzahl', '3,5').split(',').map(Number);
const SIEHT = arg('sieht', '0') === '1';

export function lauf(v, { assist, staerke, sp, anzahl, seed = 3 }) {
  const crashSp = sp === 'crash', sc = crashSp ? 0.7 : +sp;
  const race = new Race(v.env, { assist, countdown: 1, fahrstil: 'sauber', seed });
  race.ap.speedScale = sc;
  const F = new GegnerFeld(v.env, { anzahl, staerke, seed, assist, startplatz: 'mitte', aufholhilfe: true });
  F.spielerAufstellen(race);
  let t = 0, tc = 0, lastKontakt = -1e9, lastAuf = -1e9, lastStossSp = -1e9;
  const o = { auf: 0, aufRoh: 0, kontakte: 0, strafeKontakt: 0, crashSp: 0, crashGZus: 0, crashG: 0, gr: {}, grSp: {}, near: [], langsam: 0, nVor: 0, aufVmax: 0 };
  const M = F.M;
  while (t < v.apTime * 5 && race.state !== 'finished') {
    const inp = { steer: race.ap.out.steer, throttle: race.ap.out.throttle, brake: race.ap.out.brake };
    race.step(DT, inp);
    for (const e of race.events) if (e.type === 'crash' && e.penalty) {
      o.crashSp++;
      if (e.reason === 'Zusammenstoß' || t - lastStossSp < 1.0) { o.strafeKontakt++; o.grSp[e.reason] = (o.grSp[e.reason] || 0) + 1; }
    }
    race.events.length = 0;
    F.step(DT, race); t += DT;
    if (SIEHT) { const A = F.ausweichen(race, DT); race.ap.avoid = A.versatz; race.ap.vCap = A.vCap; }
    if (crashSp && race.state === 'running' && (tc += DT) > 25) { tc = 0; race.car.setCrash('Test'); }
    for (const e of F.events) {
      if (e.type === 'gegnerCrash') { o.crashG++; o.gr[e.reason] = (o.gr[e.reason] || 0) + 1; if (e.reason === 'Zusammenstoß') o.crashGZus++; }
      if (e.type === 'stoss' && e.spieler) {
        lastStossSp = t;
        if (t - lastKontakt > 1) o.kontakte++;
        lastKontakt = t;
        if (e.hinten === 'spieler') { o.aufRoh++; if (t - lastAuf > 1) o.auf++; lastAuf = t; o.aufVmax = Math.max(o.aufVmax, e.v); }
      }
    }
    F.events.length = 0;
    if (t > 5 && race.state === 'running' && Math.round(t * 120) % 12 === 0) {
      const p = race.tracker.progress(), vs = race.car.fwdSpeed();
      const ds = F.fahrer.filter((g) => !g.fertig).map((g) => g.fortschritt() - p);
      if (ds.length && Math.round(t * 120) % 60 === 0) o.near.push(Math.min(...ds.map(Math.abs)));
      // Gegner 5 … 60 m vor dem Spieler, außerhalb Stunt-Nähe (dort gilt das Profil), Spieler schneller als 10 m/s
      const i = race.ap.tr.idx;
      if (vs > 10 && !M.nahe[i] && !M.kein[i]) {
        for (const g of F.fahrer) {
          const d = g.fortschritt() - p;
          if (g.fertig || g.zustand !== 'fahrt' || d < 5 || d > 60 || M.nahe[g.idx()]) continue;
          o.nVor++;
          // Profil verlangt es (Kurve/Bremszone): nicht zählen, wenn auch das Profil dort < 85 % des Spieler-Tempos ist
          const vP = g.P.vt[g.idx()];
          if (g.tempo() < vs * 0.85 && vP > vs * 0.85) o.langsam++;
        }
      }
    }
  }
  const ziel = race.state === 'finished';
  return {
    ziel, zeit: ziel ? race.finalTime : null, ap: v.apTime, auf: o.auf, aufRoh: o.aufRoh, aufVmax: o.aufVmax, kontakte: o.kontakte, strafeKontakt: o.strafeKontakt,
    crashSp: o.crashSp, crashG: o.crashG, crashGZus: o.crashGZus, gr: o.gr, grSp: o.grSp,
    in100: o.near.filter((x) => x <= 100).length / Math.max(1, o.near.length), max: o.near.length ? Math.max(...o.near) : 0,
    langsam: o.langsam / Math.max(1, o.nVor), nVor: o.nVor, stoesse: F.stoesse,
  };
}

export function zusammenfassen(rows) {
  const out = {};
  const by = (key) => { const m = {}; for (const r of rows) (m[key(r)] ||= []).push(r); return m; };
  const sum = (L, f) => L.reduce((a, r) => a + f(r), 0);
  for (const [k, L] of Object.entries(by((r) => `${r.assist} ${r.anzahl}er Spieler ${r.sp}`))) {
    out[k] = { n: L.length, auf: sum(L, (r) => r.auf), kontakte: sum(L, (r) => r.kontakte), strafeKontakt: sum(L, (r) => r.strafeKontakt), crashSp: sum(L, (r) => r.crashSp), crashGZus: sum(L, (r) => r.crashGZus), crashG: sum(L, (r) => r.crashG), in100: sum(L, (r) => r.in100) / L.length, in100min: Math.min(...L.map((r) => r.in100)), max: Math.max(...L.map((r) => r.max)), langsam: sum(L, (r) => r.langsam * r.nVor) / Math.max(1, sum(L, (r) => r.nVor)), ziel: L.filter((r) => r.ziel).length };
  }
  const all = { n: rows.length, auf: sum(rows, (r) => r.auf), kontakte: sum(rows, (r) => r.kontakte), strafeKontakt: sum(rows, (r) => r.strafeKontakt), crashSp: sum(rows, (r) => r.crashSp), crashGZus: sum(rows, (r) => r.crashGZus), crashG: sum(rows, (r) => r.crashG), langsam: sum(rows, (r) => r.langsam * r.nVor) / Math.max(1, sum(rows, (r) => r.nVor)), ziel: rows.filter((r) => r.ziel).length };
  return { gruppen: out, alle: all };
}

if (import.meta.url === url.pathToFileURL(process.argv[1]).href) {
  const rows = [];
  const t0 = Date.now();
  for (const [s, d] of STRECKEN) {
    const v = verifySync(generate(s, d));
    if (!v.ok) { console.log(`S${s}/${d} ohne Ziel – übersprungen`); continue; }
    for (const assist of ASSIST) for (const anzahl of ANZAHL) for (const staerke of STAERKEN) for (const sp of SPIELER) {
      const r = lauf(v, { assist, staerke, sp, anzahl });
      rows.push({ strecke: `${s}-${d}`, assist, anzahl, staerke, sp, ...r });
      if (arg('laut', '0') === '1') console.log(`S${s}/${d} ${assist} ${anzahl} ${staerke} ${sp}: auf ${r.auf} (roh ${r.aufRoh}, max ${r.aufVmax.toFixed(1)} m/s) Kontakte ${r.kontakte} Strafe/Kontakt ${r.strafeKontakt} Crashs ${r.crashSp} G-Zus ${r.crashGZus} ≤100 ${(r.in100 * 100).toFixed(0)} % langsam ${(r.langsam * 100).toFixed(0)} %`);
    }
  }
  const Z = zusammenfassen(rows);
  for (const [k, g] of Object.entries(Z.gruppen)) console.log(`${k.padEnd(28)} n ${g.n} | Auffahren ${g.auf} | Kontakte ${g.kontakte} | Strafe aus Kontakt ${g.strafeKontakt} | Spieler-Crashs ${g.crashSp} | Gegner Zusammenstoß ${g.crashGZus} (Crashs ${g.crashG}) | ≤100 m ${(g.in100 * 100).toFixed(0)} % (min ${(g.in100min * 100).toFixed(0)} %) max ${g.max.toFixed(0)} m | Gegner vorn >15 % langsamer ${(g.langsam * 100).toFixed(1)} % | Ziel ${g.ziel}/${g.n}`);
  const a = Z.alle;
  const gsum = (k) => rows.reduce((m, r) => { for (const x in r[k]) m[x] = (m[x] || 0) + r[k][x]; return m; }, {});
  console.log('Spieler-Strafen aus Kontakt nach Grund:', JSON.stringify(gsum('grSp')), '· Gegner-Crashs nach Grund:', JSON.stringify(gsum('gr')));
  console.log(`ALLE n ${a.n} | Auffahren ${a.auf} | Kontakte ${a.kontakte} | Strafe aus Kontakt ${a.strafeKontakt} | Spieler-Crashs ${a.crashSp} | Gegner Zusammenstoß ${a.crashGZus} (Crashs ${a.crashG}) | langsam vorn ${(a.langsam * 100).toFixed(1)} % | Ziel ${a.ziel}/${a.n} | ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ argv: process.argv.slice(2), rows, Z }));
}
