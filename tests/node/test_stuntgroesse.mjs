// n26 Stunt-Maßstab (Peter 03.10.2026: „Und die Stunteinlagen ebenfalls vergrößern, passend zu den Strecken“):
// A Maße: Bauwerke im Standard-Maßstab sichtbar größer (Looping ≥ 1,5× hoch, Spuren ohne Engpass gegen die Fahrbahn,
//   Röhre, Rolle, Schanze, Wellen, Steilwand, Halfpipe, Schlucht, Bodenwellen, Kuppe); Maßstab 1 = Maße bis n25
// B Fenster erreichbar: Zufallsstrecken (flach/3D/Gelände, alle Stufen) – Prüffahrt ohne Entschärfen, kein Punkt unter dem
//   Mindesttempo (Profil), Mittel mit „perfektem“ Fahrer ohne Festfahren/Zu-kurz an Stunts
// C Überlappung: kein Bauwerk im Lichtraum einer anderen Fahrbahn, keine Deko auf Bauteilen, kein Gelände über der
//   Stunt-Fahrbahn, nicht weiter aus dem Feld als bis n25 (tools/stunt_check.mjs)
// D Importe (.TRK, Sammlung) behalten Maßstab 1; Looping-Einfahrt: geradeaus mittig hinein trägt die Spur das Auto hinauf
// E Bestzeiten: Zufallsstrecken einmalig neu (Importe bleiben), ?stunt=1 wertet nicht; Mittel: kein „Bremsen!“ im Looping
// F ?stunt=1 (STUNT_STUNT=1) baut 99 Strecken samt Tempo-Profil Byte für Byte wie n25 (tests/node/data/stunt_hash_n25.json)
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), get length() { return mem.size; }, key: (i) => [...mem.keys()][i] };
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../..');
const { STUNT_SCALE, STUNT_SCALE_DEFAULT, ROAD_HW, TILE } = await import('../../src/track/defs.js');
const { loopGeom, tubeGeom, JUMP, jumpWindow } = await import('../../src/track/pieces.js');
const { waveGeom, WALL, cliffDesign } = await import('../../src/track/pieces_3d.js');
const { corkGeom } = await import('../../src/track/pieces_trk.js');
const { HALFPIPE, ENV } = await import('../../src/track/gelaende.js');
const { generate, galleryLayout } = await import('../../src/track/generator.js');
const { verifySync, prepare } = await import('../../src/track/verify.js');
const { Race, MEDIUM_N24 } = await import('../../src/game/race.js');
const { Store, abMode } = await import('../../src/game/store.js');
const { checkTrack } = await import('../../tools/stunt_check.mjs');
const { runBot } = await import('../../tools/mittel_probe.mjs');
const { parseTrk } = await import('../../src/track/trk.js');
const { trkToLayout } = await import('../../src/track/trkimport.js');
const { tracksOf } = await import('../../src/game/sammlung.js');
const { buildTrack } = await import('../../src/track/build.js');
const { chain } = await import('./common.mjs');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const f1 = (x) => x.toFixed(1).replace('.', ',');
const DT = 1 / 120;
if (STUNT_SCALE !== STUNT_SCALE_DEFAULT) { console.log(`Stunt-Maßstab ${STUNT_SCALE} (nicht Standard) – Test läuft nur im Standard`); process.exit(0); }

console.log('--- A: Maße ---');
{
  const L1 = loopGeom(1), L = loopGeom(), T1 = tubeGeom(1), T = tubeGeom(), C1 = corkGeom(1), C = corkGeom(STUNT_SCALE);
  check(STUNT_SCALE >= 1.4 && STUNT_SCALE <= 1.8, `Stunt-Maßstab ${STUNT_SCALE} (Richtwert 1,4–1,8)`);
  check(Math.abs(L1.S - 56) < 1e-9 && Math.abs(L1.hw - 2.25) < 1e-9 && Math.abs(L1.shift - 2.95) < 1e-9 && Math.abs(L1.H - 14.5) < 0.01 && T1.b === 2.2 && T1.R === 3.5 && C1.R === 3.6 && C1.hw === 2.3,
    `Maßstab 1 = bis n25: Looping 56 m Bogen, ${f1(L1.H)} m hoch, Spur ±2,25, Versatz 2,95; Röhre 2,2/3,5; Rolle R 3,6 / ±2,3`);
  check(L.H / L1.H >= 1.5 && L.H / L1.H <= 1.7, `Looping ${f1(L1.H)} → ${f1(L.H)} m hoch (×${(L.H / L1.H).toFixed(2)}, Ziel 1,5–1,7)`);
  check(2 * (L.shift + L.hw) >= 2 * ROAD_HW && 2 * L.hw >= 7, `Looping-Spuren ${f1(2 * L.hw)} m breit, beide zusammen ${f1(2 * (L.shift + L.hw))} m ≥ Fahrbahn ${f1(2 * ROAD_HW)} m (bis n25 ${f1(2 * (L1.shift + L1.hw))} m): kein Engpass`);
  check(2 * (T.b + T.R) >= 2 * ROAD_HW && 2 * T.R >= 11, `Röhre innen ${f1(2 * (T.b + T.R))} m breit, ${f1(2 * T.R)} m hoch (bis n25 ${f1(2 * (T1.b + T1.R))} / ${f1(2 * T1.R)})`);
  check(2 * C.hw >= 7 && C.R / C1.R >= 1.5, `Korkenzieher: Spur ${f1(2 * C.hw)} m, Rolle ${f1(2 * C.R)} m hoch, ${f1(C.len)} m lang (bis n25 ${f1(2 * C1.hw)} / ${f1(2 * C1.R)} / ${f1(C1.len)})`);
  const w = jumpWindow();
  check(JUMP.lipH >= 2 && JUMP.landH >= 3.9 && w.apex + JUMP.lipH >= 7 && w.air >= 2.5 && JUMP.span === 120, `Schanze: Lippe ${f1(JUMP.lipH)} m (${JUMP.lipDeg}°), Landerampe ${f1(JUMP.landH)} m, Scheitel über Grund ${f1(w.apex + JUMP.lipH)} m, Flug ${w.air.toFixed(2)} s, Element 3 Felder`);
  const W = waveGeom(), W1 = waveGeom(1);
  check(W.h >= 1.2 * W1.h && W.len >= 1.2 * W1.len && W.n * W.len <= 3 * TILE - 12, `Wellen ${W.n} × ${f1(W.len)} m, ${f1(W.h)} m hoch (bis n25 ${W1.n} × ${f1(W1.len)} m, ${f1(W1.h)} m)`);
  check(WALL.hw >= 1.25 * (ROAD_HW + 0.4) && HALFPIPE.R >= 11.5 && ENV.gorgeDepth >= 28, `Steilwand ${f1(2 * WALL.hw)} m breit, Halfpipe-Radius ${f1(HALFPIPE.R)} m, Schlucht ${f1(ENV.gorgeDepth)} m tief`);
  check(cliffDesign(6).cells === 3 && cliffDesign(12).cells === 4, 'Klippe: Feldzahl 3/4 wie bisher (alte 3D-Codes behalten ihr Layout)');
}

console.log('--- B: Fenster erreichbar ---');
{
  let n = 0, fixes = 0, notOk = [], infeasible = 0, stuck = 0, runs = 0;
  const why = {};
  for (const s of [4711, 42, 777, 20261005]) for (const d of [1, 2, 3]) for (const o of [{}, { d3: true }, { gel: true }]) {
    const v = verifySync(generate(s, d, o), 0);
    n++; fixes += v.fixes; if (!v.ok) notOk.push(`${s}-${d}${o.d3 ? '-3d' : o.gel ? '-g' : ''}`);
    if (!v.env) continue;
    infeasible += v.env.prof.infeasible.length;
    if (d === 3 || o.gel) {
      runs++;
      const r = runBot(v, MEDIUM_N24, 'perfekt', 7);
      for (const [k, c] of Object.entries(r.why)) { why[k] = (why[k] || 0) + c; if (/Festgefahren|Zu kurz/.test(k)) stuck += c; }
    }
  }
  check(notOk.length === 0 && fixes === 0, `Prüffahrt (Autopilot, ohne Entschärfen) auf ${n} Zufallsstrecken: ${n - notOk.length} im Ziel ${notOk.join(' ')}`);
  check(infeasible === 0, `Tempo-Profil: ${infeasible} Punkte, an denen der Anlauf das Mindesttempo nicht erreicht`);
  check(stuck === 0, `Mittel (n24-Antrieb), perfekter Fahrer auf ${runs} Strecken: kein Festfahren/Zu kurz (Gründe ${JSON.stringify(why)})`);
}

console.log('--- C: Überlappung ---');
{
  let fahr = 0, deko = 0, gel = 0, over = {}, nT = 0;
  const cases = [];
  for (const s of [4711, 1038, 8920, 20261005]) for (const d of [1, 2, 3]) for (const o of [{}, { d3: true }, { gel: true }]) cases.push(generate(s, d, o));
  cases.push(galleryLayout());
  for (const lay of cases) {
    const r = checkTrack(lay); nT++;
    fahr += r.fahrbahn.length; deko += r.deko.length; gel += r.gelaende.length;
    for (const [k, v] of Object.entries(r.feld)) over[k] = Math.max(over[k] || 0, v);
  }
  const OLD = { jump: 11, cliff: 0.8, cliff2: 0.8, spiral: 0.8 };   // bis n25 schon so (Hindernisse in der Lücke, Kanten)
  const worse = Object.entries(over).filter(([k, v]) => v > (OLD[k] ?? 0) + 0.05);
  check(fahr === 0, `${nT} Strecken: kein Bauwerk im Lichtraum einer anderen Fahrbahn (${fahr})`);
  check(deko === 0 && gel === 0, `keine Deko/Bäume auf Bauteilen (${deko}), kein Gelände über einer Stunt-Fahrbahn (${gel})`);
  check(worse.length === 0, `nicht weiter aus dem Feld als bis n25: ${Object.entries(over).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}`);
}

console.log('--- D: Importe, Looping-Einfahrt ---');
{
  const jf = path.join(ROOT, 'assets/sammlung.json'), bf = path.join(ROOT, 'assets/sammlung.bin');
  const TT = tracksOf(JSON.parse(fs.readFileSync(jf, 'utf8'))), bin = new Uint8Array(fs.readFileSync(bf));
  let k = 0; while (k < TT.length) { const lay = trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), TT[k].id)).layout; if (lay.pieces.some((p) => p.type === 'tr_loop')) break; k++; }
  const lay = trkToLayout(parseTrk(bin.subarray(k * 1802, (k + 1) * 1802), TT[k].id)).layout, t = buildTrack(lay);
  // Looping-Spur ±2,25 m, Korkenzieher-Rolle ±2,3 m wie bis n25
  let hwLoop = 0; for (let i = 0; i < t.line.n; i++) if (t.line.loop[i]) hwLoop = Math.max(hwLoop, t.line.hw[i]);
  check(lay.stuntScale === 1 && t.stuntScale === 1 && hwLoop <= 2.3 + 1e-6, `Sammlung (${TT[k].id}) und .TRK behalten die Bauwerke bis n25 (Maßstab ${t.stuntScale}, Spur im Bauwerk höchstens ±${hwLoop.toFixed(2)} m)`);
  // Lücke zwischen Auf- und Abfahrt-Spur am Boden so schmal wie bis n25 (2 × 0,7 m): mit Versatz × Maßstab rollte ein
  // geradeaus fahrendes Auto (Mittel, Hände weg) zwischen den Spuren unter dem Looping durch → „Abkürzung“ (test_assists)
  const LP = loopGeom(), L1 = loopGeom(1);
  check(Math.abs((LP.shift - LP.hw) - (L1.shift - L1.hw)) < 1e-9, `Spurlücke am Boden ${f1(2 * (LP.shift - LP.hw))} m wie bis n25 (${f1(2 * (L1.shift - L1.hw))} m)`);
}

console.log('--- E: Bestzeiten, Hinweise ---');
{
  mem.clear();
  mem.set('stuntbahn.v1', JSON.stringify({ settings: {}, reset: 21, medReset: 24, best: { '4711-3|original+reset@x': { time: 50 }, '4711-3-g|medium+reset@x': { time: 60 }, 'sam-012|original+reset@x': { time: 70 }, 'trk-abc|medium+reset@x': { time: 80 }, 'demo-rundkurs|original+reset@x': { time: 90 } }, ghostIndex: ['4711-3|original+reset@x', 'sam-012|original+reset@x'] }));
  mem.set('stuntbahn.ghost.4711-3|original+reset@x', 'AAAA'); mem.set('stuntbahn.ghost.sam-012|original+reset@x', 'BBBB');
  let S = new Store();
  check(Object.keys(S.best).sort().join(',') === 'demo-rundkurs|original+reset@x,sam-012|original+reset@x,trk-abc|medium+reset@x' && !mem.has('stuntbahn.ghost.4711-3|original+reset@x') && mem.has('stuntbahn.ghost.sam-012|original+reset@x') && S.stuntNote === 2 && S.ghostIndex.join() === 'sam-012|original+reset@x',
    `Zufallsstrecken: Bestzeiten + Geister einmalig gelöscht (${S.stuntNote}), Sammlung/.TRK/Beispiel bleiben; Hinweis im Menü`);
  S.best['4711-3|original+reset@x'] = { time: 49 }; S.save();
  S = new Store();
  check(S.best['4711-3|original+reset@x'] && !S.stuntNote, 'zweites Laden löscht nichts mehr');
  check(abMode('?stunt=1') && abMode('?stunt=1.3') && !abMode('?stunt=' + STUNT_SCALE_DEFAULT) && !abMode('?seed=4711'), '?stunt=1 (Bauwerke wie bis n25) und andere Maßstäbe werten nicht, der Standard wertet');
  // Mittel: im großen Looping kein „Bremsen!“, die Spurhilfe bleibt angezeigt
  const c = chain(3, 15, 0, ['start', 'straight', 'straight', 'straight', 'loop', 'straight', 'straight', 'straight']);
  const env = prepare({ pieces: c.pieces, seed: 1, closed: false }), L = env.track.line;
  let a = 0; while (!L.loop[a]) a++;
  const r = new Race(env, { assist: 'medium', countdown: 0.01 });
  for (let q = 0; q < 3; q++) r.step(DT, { steer: 0, throttle: 0, brake: 0 });
  let j = a; while (L.s[a] - L.s[j] < 20 && j > 0) j--;
  r.place(j, env.prof.vt[j] * 1.15, true);
  let inLoopBrake = 0, lane = 0;
  // (Hinweis-Rechnung am Autopilot-Zeiger vor dem Schritt: beide im Looping zählen, nicht der Übergangs-Schritt)
  for (let t2 = 0; t2 < 5; t2 += DT) { const c2 = r.ap.control(r.car), i0 = r.ap.tr.idx; r.step(DT, { steer: c2.steer, throttle: 1, brake: 0 }); r.events.length = 0; const i = r.tracker.idx; if (L.loop[i] && L.loop[i0] && r.hud) { if (/Bremsen/.test(r.hud.text)) inLoopBrake++; if (/Spurhilfe/.test(r.hud.text)) lane++; } }
  check(inLoopBrake === 0 && lane > 0, `Mittel, 15 % über Plan in den Looping: im Looping kein „Bremsen!“ (${inLoopBrake}), „Looping – Spurhilfe“ angezeigt (${lane} Schritte)`);
}

console.log('--- F: ?stunt=1 wie n25 ---');
{
  const out = path.join(ROOT, 'tests/out/stunt_hash_st1.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/stunt_bitgleich.mjs'), '--out=' + out], { encoding: 'utf8', env: { ...process.env, STUNT_STUNT: '1' } });
  const c = spawnSync(process.execPath, [path.join(ROOT, 'tools/stunt_bitgleich.mjs'), `--cmp=${path.join(HERE, 'data/stunt_hash_n25.json')},${out}`], { encoding: 'utf8' });
  check(r.status === 0 && c.status === 0, `STUNT_STUNT=1: ${(c.stdout || '').trim().split('\n').pop()} (Fahrlinie, Geometrie, Kollision, Gelände, Bäume, Sprünge, Tempo-Profil)`);
}

console.log(fails ? `FEHLER: ${fails}` : 'Stunt-Größe n26: alle Prüfungen grün');
process.exit(fails ? 1 : 0);
