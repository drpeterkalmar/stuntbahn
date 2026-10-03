// Gelände-Strecken (n22, Peter 30.09.2026: „Mit 3D-Bahnen meinte ich nicht nur kilometerlange schlingernde Autobahnen,
// sondern 3D-Gelände wie bei Trackmania“). Die Strecke liegt IN einer Landschaft aus Hügeln, Tälern, Kuppen, Senken und
// Hängen; das Gelände ist das Streckenelement. Drei Schritte, alles deterministisch aus Seed + Layout:
//  1) Landschaft L(x, z): Hügel und Täler (fbm), Hügelketten (Kämme), Plateaus (Terrassen), Bergkranz außen.
//     Höhenunterschied über das Streckenfeld je Stufe GEL[diff].relief (34 / 52 / 72 m).
//  2) Höhenverlauf der Fahrbahn u(s) (planElevation): der Landschaft unter der Linie folgend, geglättet (bi-Laplace-
//     Ausgleich, CG-Löser) und fahrbar gemacht – Steigung ≤ GEL.grade, Kuppen-Radius ≥ GEL.Rc, Senken ≥ GEL.Rs. Stunts
//     (Looping, Schanze, Röhre …) liegen auf einem waagrechten Sockel (ein Wert je Stück), Klippen behalten ihren Sprung.
//     Dazu gewollte Formen: Kuppe mit Luftphase (Gauß-Buckel), Serpentine (Rampe über die Kehren). Wo die Fahrbahn
//     tief unter der Landschaft läge, wird ein Tunnel daraus, wo sie hoch darüber läge, eine Brücke mit Pfeilern.
//     build.js baut die Strecke danach ein zweites Mal, jedes Stück um seinen Höhenverlauf D(f) angehoben.
//  3) Gelände (buildGelTerrain): Landschaft, an die Fahrbahn angeglichen – im Streifen neben der Straße genau auf
//     Fahrbahnhöhe (seitlich geneigt wie die Fahrbahn), dahinter Böschungen (Damm 1:1,4, Einschnitt 1:1,1) bis zur
//     Landschaft; dazu Formen der Gelände-Elemente (Hügel über dem Tunnel, Schlucht unter dem Sprung, Plateau-Kante am
//     Drop, Hang an der Querfahrt, Mulde an der Steilkurve, Tal um die Halfpipe). Physik und Grafik nutzen dasselbe
//     5-m-Höhenraster (im Tunnel liegt das Physik-Gelände unter der Fahrbahn, die Grafik zeigt den Hügel).
import { TILE, GRID, WORLD_SCALE, WORLD_HALF, ROAD_HW, ROAD_WIDEN, tileX, tileZ } from './defs.js';
import { makeNoise2, smoothstep, smootherstep, clamp } from '../core/util.js';
import { adaptiveGrid, gridExt } from './terrgrid.js';

const WS = WORLD_SCALE, T = TILE;

// Je Stufe: Höhenunterschied der Landschaft über das Streckenfeld (m), Plateau-Stufen (m, 0 = aus), Glättung der
// Landschaft entlang der Linie (σ, m), größte Steigung, kleinster Kuppen-/Senken-Radius (m), Kuppe mit Luftphase
// (Höhe, Breite σ), Serpentine (Höhe je Kehre, m), Brücke ab so viel m über der Landschaft, Tunnel ab so viel Deckung
export const GEL = {
  1: { relief: 60, terrace: 0, sigma: 55, grade: 0.13, Rc: 320, Rs: 150, kuppe: { h: 6, sig: 28 }, serp: 6, bridge: 10, tunnel: 12 },
  2: { relief: 90, terrace: 14, sigma: 48, grade: 0.18, Rc: 260, Rs: 130, kuppe: { h: 7.5, sig: 28 }, serp: 7, bridge: 10, tunnel: 12 },
  3: { relief: 120, terrace: 16, sigma: 42, grade: 0.23, Rc: 210, Rs: 115, kuppe: { h: 9, sig: 28 }, serp: 8, bridge: 10, tunnel: 12 },
};
// Gelände an der Fahrbahn: Abstand unter der Fahrbahn (m), Streifen neben der Mittellinie, in dem das Gelände genau der
// Fahrbahn folgt (normal / Stunt-Sockel / Steilkurve / Halfpipe; mindestens Fahrbahn + Bankett + eine Rasterzelle, damit
// das 5-m-Raster nie durch die Fahrbahn sticht), Böschungen (Einschnitt kUp, Damm kLo, Klippe kCliff je m), Tunnel
// (halbe Breite, Deckung über dem Scheitel), Schlucht (Tiefe, halbe Länge quer), Brücke (Luft unter dem Deck)
// Grafik-Raster: fein bis GEL_FINE Felder um die Strecke; grobe Blöcke dürfen bis 2,5 Felder um die Strecke GEL_ERR[0] m,
// weiter draußen GEL_ERR[1] m vom exakten Gelände abweichen (flache Strecken: 1,5 Felder / 0,5 m überall)
const envNum = (k, d) => +((globalThis.process && process.env[k]) || d);
export const GEL_FINE = envNum('GEL_FINE', 1.2), GEL_ERR = [envNum('GEL_ERR0', 1.5), envNum('GEL_ERR1', 5.0)];
export const ENV = {
  // delta: Gelände so weit unter der Fahrbahn (n23: breitere Fahrbahn 0,2 m – am Außenrand der Steilkurven lag das 5-m-Raster
  // sonst bis 2 cm unter der Prüfgrenze; mit ?breit=alt wie bis n22 0,15 m, bitgleich)
  delta: ROAD_WIDEN > 1 ? 0.2 : 0.15, w0: ROAD_HW + 8, w0Rigid: 20, w0Bank: 22, kUp: 0.9, kLo: 0.7, kCliff: 4,
  tunnelHW: ROAD_HW + 1.6, tunnelH: 7.2, cover: 11, gorgeDepth: 22, gorgeLen: 110, bridgeGap: 3.5, reach: 140,
};
// Halfpipe (pieces_gel.js): flache Fahrbahn ±hf, Viertelröhren Radius R bis zum Winkel A, Übergang über ramp m
export const HALFPIPE = { hf: ROAD_HW + 0.4, R: 9, A: 62 * Math.PI / 180, ramp: 30 };
// Stücke mit festem Sockel (ein Höhenwert je Stück): Stunts und Bauwerke, deren Form an der Waagrechten hängt
export const RIGID = new Set(['start', 'loop', 'jump', 'tube', 'tr_corklr', 'waves', 'bumps', 'bank', 'wall', 'chicane', 'crest', 'cliff', 'cliff2',
  'halfpipe', 'tr_bankC', 'spiral', 'tr_corkud', 'slope2', 'slope3', 'slope4', 'rampUp', 'rampDown', 'bridge']);
// Sockel-Stücke, unter denen das Gelände auf Sockelhöhe bleibt (Schanzen/Looping stehen darauf), statt der Fahrbahn
// zu folgen (Steilkurve, Klippe, Halfpipe folgen ihrer Fahrbahn)
const ON_BASE = new Set(['start', 'loop', 'jump', 'tube', 'tr_corklr', 'waves', 'bumps', 'chicane', 'crest']);

// ---------- 1) Landschaft ----------
export function makeLandscape(seed, diff) {
  const G = GEL[diff] || GEL[2];
  const s = seed >>> 0;
  const nA = makeNoise2((s * 11 + 101) >>> 0), nB = makeNoise2((s * 13 + 202) >>> 0), nC = makeNoise2((s * 17 + 303) >>> 0);
  // u, v in Metern / Maßstab (Formen wachsen mit der Welt wie beim flachen Gelände)
  const raw = (u, v) => {
    const hills = nA.fbm(u / 300 + 7.3, v / 300 - 2.1, 4);
    const r = nB.fbm(u / 230 - 4.4, v / 230 + 9.9, 3);
    const ridge = Math.max(0, 1 - Math.abs(r) * 2.4);
    return hills + 0.32 * ridge * ridge + 0.05 * nC.fbm(u / 70, v / 70, 2);
  };
  // Normierung: Höhenunterschied über das Streckenfeld = relief
  let lo = 1e9, hi = -1e9;
  for (let j = 0; j <= 24; j++) for (let i = 0; i <= 24; i++) {
    const v = raw((-WORLD_HALF + i * 2 * WORLD_HALF / 24) / WS, (-WORLD_HALF + j * 2 * WORLD_HALF / 24) / WS);
    lo = Math.min(lo, v); hi = Math.max(hi, v);
  }
  const k = G.relief / Math.max(1e-6, hi - lo), P = G.terrace;
  // Plateaus: Terrassen-Stufen mit steileren Hängen dazwischen, zur Hälfte beigemischt
  const terr = (h) => { if (!P) return h; const q = h / P, f = Math.floor(q); return 0.55 * P * (f + smoothstep(0.25, 0.75, q - f)) + 0.45 * h; };
  const h = (x, z) => {
    const u = x / WS, v = z / WS, rr = Math.hypot(u, v);
    // Bergkranz außen wie beim flachen Gelände (Höhe über der Landschaft)
    return terr((raw(u, v) - lo) * k) + WS * 70 * smoothstep(420, 950, rr) * (0.7 + 0.3 * nB.fbm(u / 300, v / 300, 2));
  };
  return { h, relief: G.relief };
}

// ---------- 2) Höhenverlauf der Fahrbahn ----------
// L1: Linie des ersten (flachen) Baus mit .piece/.s/.px/.py/.pz; line1: deren Punkte mit f; info1: pieceInfo.
// Liefert plan: { pieces: [{ rigid, c } | { fs, us, turnR, m }], flags je Stück, zones (Kuppen), u (gleichmäßig) }
export function planElevation(layout, L, line1, info1, land, diff) {
  const G = GEL[diff] || GEL[2], P = layout.pieces, NP = P.length, n = L.n, total = L.total;
  const M = Math.max(64, Math.round(total / 1.5)), ds = total / M;   // 1,5 m: Sockel-Ein-/Ausfahrten (Steilkurve hebt sich auf wenigen Metern) genau
  const X = new Float64Array(M), Z = new Float64Array(M), B = new Float64Array(M), pk = new Int32Array(M);
  for (let j = 0, a = 0; j < M; j++) {
    const s = j * ds;
    while (a < n - 2 && L.s[a + 1] < s) a++;
    const d = L.s[a + 1] - L.s[a], t = d > 1e-9 ? clamp((s - L.s[a]) / d, 0, 1) : 0;
    X[j] = L.px[a] + (L.px[a + 1] - L.px[a]) * t; Z[j] = L.pz[a] + (L.pz[a + 1] - L.pz[a]) * t;
    // Höhe im ersten Bau: an Stückgrenzen nicht über einen Ebenensprung (Klippe) hinweg mitteln
    B[j] = L.piece[a] === L.piece[a + 1] ? L.py[a] + (L.py[a + 1] - L.py[a]) * t : t < 0.5 ? L.py[a] : L.py[a + 1];
    pk[j] = L.piece[t < 0.5 ? a : a + 1];
  }
  // Sockel-Gruppen: zusammenhängende Läufe von Sockel-Stücken (auch über den Start hinweg) teilen einen Wert
  // Anlauf-Gerade vor Schanze/Looping/Korkenzieher/Drop gehört zum Sockel (waagrechter Anlauf, sonst fehlt Tempo)
  const RUN = new Set(['jump', 'loop', 'tr_corklr', 'halfpipe']), STR = new Set(['straight', 'checkpoint']);
  const rig = P.map((pc, k) => RIGID.has(pc.type) || (STR.has(pc.type) && !pc.g && pc.tilt0 == null && RUN.has((P[(k + 1) % NP] || {}).type)));
  const gid = new Int32Array(NP).fill(-1);
  let ng = 0;
  const k0 = Math.max(0, rig.findIndex((v) => !v));
  for (let q = 0; q < NP; q++) { const k = (k0 + q) % NP, pv = (k - 1 + NP) % NP; if (rig[k]) gid[k] = rig[pv] && gid[pv] >= 0 ? gid[pv] : ng++; }
  const grp = new Int32Array(M), bR = new Float64Array(M);
  for (let j = 0; j < M; j++) { grp[j] = gid[pk[j]]; bR[j] = grp[j] >= 0 ? B[j] : 0; }
  // Ziel: Landschaft unter der Linie, entlang der Linie geglättet (Gauß σ, geschlossen)
  const raw = new Float64Array(M);
  for (let j = 0; j < M; j++) raw[j] = land.h(X[j], Z[j]);
  const t0 = gauss(raw, G.sigma / ds);
  const W = new Float64Array(M).fill(1), lamJ = new Float64Array(M).fill(1), mu = new Float64Array(M), exempt = new Uint8Array(M);
  const jOf = (s) => ((Math.round(s / ds) % M) + M) % M;
  const sMid = (k) => { const pi = info1[k]; return L.s[Math.round((pi.lineStart + pi.lineEnd) / 2)]; };
  const tgt = Float64Array.from(t0);
  // Serpentinen: gleichmäßige Rampe über die Kehren (Höhe GEL.serp je Kehre), mittig um die Landschaftshöhe
  const at = (c) => P.findIndex((pc) => c && pc.i === c[0] && pc.j === c[1]);
  for (const sp of (layout.gel && layout.gel.serp) || []) {
    const p0 = at(sp.c0), p1 = at(sp.c1);
    if (p0 < 0 || p1 <= p0) continue;
    const j0 = Math.round(L.s[info1[p0].lineStart] / ds), j1 = Math.round(L.s[info1[p1].lineEnd] / ds);
    if (j1 <= j0 + 4) continue;
    let mean = 0; for (let j = j0; j <= j1; j++) mean += t0[j % M]; mean /= j1 - j0 + 1;
    const dh = sp.dir * sp.turns * G.serp;
    for (let j = j0; j <= j1; j++) { const q = (j - j0) / (j1 - j0); tgt[j % M] = mean + dh * (q - 0.5); W[j % M] = 4; }
  }
  // Gruppen: Ein-/Ausfahrt (Stück, Bogenlänge, Höhe im ersten Bau)
  const groups = [];
  for (let k = 0; k < NP; k++) {
    if (gid[k] < 0) continue;
    const g = gid[k];
    if (!groups[g]) groups[g] = { k0: k, k1: k };
    else groups[g].k1 = k;
  }
  for (const gr of groups) {
    // Lauf über das Ende der Liste hinweg (Start ist Sockel): Anfang = erstes Stück nach einem freien
    let a = gr.k0; while (rig[(a - 1 + NP) % NP] && gid[(a - 1 + NP) % NP] === gid[a] && (a - 1 + NP) % NP !== gr.k1) a = (a - 1 + NP) % NP;
    let e = a; while (rig[(e + 1) % NP] && gid[(e + 1) % NP] === gid[a] && (e + 1) % NP !== a) e = (e + 1) % NP;
    gr.a = a; gr.e = e;
    gr.sIn = L.s[info1[a].lineStart]; gr.bIn = L.py[info1[a].lineStart];
    gr.sOut = L.s[info1[e].lineEnd]; gr.bOut = L.py[info1[e].lineEnd];
  }
  // Drop/Klippe (Sockel mit Höhensprung): davor ein Plateau – das Ziel steigt auf den letzten DROP_R m vor der Kante um
  // den Sprung an (sonst müsste die Fahrbahn direkt davor steil hinauf)
  const DROP_R = 260;
  for (const gr of groups) {
    const dB = gr.bIn - gr.bOut;
    if (Math.abs(dB) < 1) continue;
    for (let q = 1; q * ds < DROP_R; q++) { const jj = jOf(gr.sIn - q * ds); if (grp[jj] < 0) tgt[jj] += dB * smootherstep(1 - q * ds / DROP_R); }
  }
  // Kuppen mit Luftphase: Gauß-Buckel auf dem Ziel, hohes Gewicht, von der Radien-Grenze ausgenommen
  const zones = [];
  P.forEach((pc, k) => {
    if (pc.g !== 'kuppe' || !info1[k]) return;
    const sc = sMid(k), h = G.kuppe.h, sg = G.kuppe.sig;
    for (let j = Math.round((sc - 3 * sg) / ds); j <= Math.round((sc + 3 * sg) / ds); j++) {
      const jj = ((j % M) + M) % M, xq = (j * ds - sc) / sg;
      tgt[jj] += h * Math.exp(-0.5 * xq * xq);
      if (Math.abs(xq) < 1.9) { W[jj] = 60; exempt[jj] = 1; }
    }
    zones.push({ s0: sc - 1.9 * sg, s1: sc + 1.9 * sg, k });
  });
  // Steigung des Ziels begrenzen: Mitte aus oberer und unterer Steigungs-Hülle (beide höchstens GEL.grade steil) –
  // wo die Landschaft zu steil ist, schneidet die Fahrbahn ein bzw. liegt auf einem Damm (vorher: Relief global flacher)
  {
    const gs = G.grade * 0.9 * ds, Up = Float64Array.from(tgt), Lo = Float64Array.from(tgt);
    for (let pass = 0; pass < 3; pass++) {
      for (let j = 1; j <= M; j++) { const a = (j - 1) % M, b = j % M; Up[b] = Math.min(Up[b], Up[a] + gs); Lo[b] = Math.max(Lo[b], Lo[a] - gs); }
      for (let j = M - 1; j >= 0; j--) { const a = (j + 1) % M; Up[j] = Math.min(Up[j], Up[a] + gs); Lo[j] = Math.max(Lo[j], Lo[a] - gs); }
    }
    for (let j = 0; j < M; j++) tgt[j] = (Up[j] + Lo[j]) / 2;
  }
  // Lösen; zu steil → Ziel-Relief flacher, zu enge Radien → dort steifer (örtlich mehr Glättung)
  const lam = 26 ** 4;
  let mean = 0; for (let j = 0; j < M; j++) mean += tgt[j]; mean /= M;
  let scale = 1, u = null, gPrev = 1e9, gmax = 0, bad = 0, gAt = 0;
  for (let round = 0; round < 20; round++) {
    const tt = new Float64Array(M);
    for (let j = 0; j < M; j++) tt[j] = mean + (tgt[j] - mean) * scale;
    u = solveBand(M, ds, grp, bR, W, tt, lam, lamJ, mu);
    gmax = 0; bad = 0;

    for (let j = 0; j < M; j++) {
      const a = (j - 1 + M) % M, b = (j + 1) % M;
      if (grp[j] >= 0 && grp[a] === grp[j] && grp[b] === grp[j]) continue;
      if (grp[j] < 0 && grp[a] < 0 && grp[b] < 0) { const gg = Math.abs(u[b] - u[a]) / (2 * ds); if (gg > gmax) { gmax = gg; gAt = j; } }
      const kap = (u[a] - 2 * u[j] + u[b]) / (ds * ds);
      // Kuppe mit Luftphase: Radius gewollt kleiner – aber nicht spitzer als der Gauß-Buckel selbst (¾ σ²/h)
      const rc = exempt[j] ? 0.5 * G.kuppe.sig ** 2 / G.kuppe.h : G.Rc;
      if (kap < -1 / rc || kap > 1 / G.Rs) { bad++; for (let q = -10; q <= 10; q++) { const jj = (j + q + M) % M; lamJ[jj] = Math.min(300, lamJ[jj] * 2.2); } }
    }
    if (globalThis.process && process.env.GELDBG) console.log('runde', round, 'gmax', gmax.toFixed(3), 'bei', gAt, P[pk[gAt]].type, 'grp-nah', grp[(gAt + 3) % M], grp[(gAt - 3 + M) % M], 'ex', exempt[gAt], 'u', u[gAt].toFixed(1), 'tgt', tgt[gAt].toFixed(1), 'bad', bad);
    // trotzdem zu steil (Glättung schießt über): das ganze Relief etwas flacher, solange es hilft
    if (bad && round < 8) continue;   // erst die Radien (örtlich steifer), dann ggf. die Steigung
    if (gmax > G.grade * 1.04 && scale > 0.35 && gmax < gPrev * 0.98) { gPrev = gmax; scale *= Math.max(0.6, G.grade / gmax * 0.97); continue; }
    gPrev = Math.min(gPrev, gmax);
    if (!bad) break;
  }
  if (globalThis.process && process.env.GELJ) { const j0 = Math.round(+process.env.GELJ / ds); for (let j = j0 - 12; j <= j0 + 12; j += 3) console.log(j, P[pk[j]].type, 'grp', grp[j], 'ex', exempt[j], 'W', W[j], 'mu', mu[j].toFixed(0), 'lam', lamJ[j].toFixed(1), 'u', u[j].toFixed(2), 'tgt', tgt[j].toFixed(2), 't0', t0[j].toFixed(2)); }
  const uAt = (s) => { const q = ((s / ds) % M + M) % M, j = Math.floor(q), t = q - j; return u[j] * (1 - t) + u[(j + 1) % M] * t; };
  // Sockelhöhe je Gruppe: Mittel von u − bR (die Strafe hält es dort konstant)
  const cg = new Float64Array(ng), cn = new Float64Array(ng);
  for (let j = 0; j < M; j++) if (grp[j] >= 0) { cg[grp[j]] += u[j] - bR[j]; cn[grp[j]]++; }
  for (let g = 0; g < ng; g++) cg[g] /= cn[g] || 1;
  // Höhe an der Fuge vor Stück k: Sockel gewinnt (dessen Ein-/Ausfahrt), sonst der Verlauf
  const startIdx = (k) => { const pi = info1[k]; return line1[pi.lineStart].f > 0.01 && pi.lineStart > 0 ? pi.lineStart - 1 : pi.lineStart; };
  const jointH = (k) => {
    const pv = (k - 1 + NP) % NP;
    if (gid[k] >= 0) return cg[gid[k]] + L.py[startIdx(k)];
    if (gid[pv] >= 0) return cg[gid[pv]] + L.py[info1[pv].lineEnd];
    return uAt(L.s[startIdx(k)]);
  };
  // Ergebnis je Stück: Sockel c bzw. Tabelle D(f) über die Punkte des ersten Baus (mit Fuge bei f = 0), an den Enden
  // genau auf die Nachbarn gezogen (Sockel/Klippen-Ein- und -Ausfahrt) – keine Stufe zwischen zwei Stücken
  const pieces = P.map((pc, k) => {
    if (gid[k] >= 0) return { rigid: 1, c: cg[gid[k]] };
    const pi = info1[k], fs = [], us = [], py = [];
    const i0 = startIdx(k);
    for (let i = i0; i <= pi.lineEnd; i++) {
      const f = i < pi.lineStart ? 0 : line1[i].f;
      if (fs.length && f <= fs[fs.length - 1] + 1e-6) continue;
      fs.push(f); us.push(uAt(L.s[i])); py.push(i < pi.lineStart ? L.py[pi.lineStart] : L.py[i]);
    }
    const nn = fs.length, len = fs[nn - 1] - fs[0] || 1;
    const d0 = jointH(k) - us[0], d1 = jointH((k + 1) % NP) - us[nn - 1];
    const bl = Math.min(25, len / 2);
    if (globalThis.process && process.env.GELD01 && (Math.abs(d0) > 0.2 || Math.abs(d1) > 0.2)) console.log('fuge', k, pc.type, 'd0', d0.toFixed(2), 'd1', d1.toFixed(2), P[(k + 1) % NP].type);
    for (let q = 0; q < nn; q++) us[q] += d0 * (1 - smootherstep((fs[q] - fs[0]) / bl)) + d1 * (1 - smootherstep((fs[nn - 1] - fs[q]) / bl)) - py[q];
    const o = { fs: Float64Array.from(fs), us: Float64Array.from(us) };
    if (pc.type === 'turnS' || pc.type === 'turnL') { o.turnR = pc.type === 'turnS' ? T / 2 : 1.5 * T; o.m = pc.m || 1; }
    return o;
  });
  // Brücken (Fahrbahn hoch über der Landschaft) und Tunnel (tief darunter), je ganzes Stück
  const inKuppe = (k) => zones.some((z) => { const pi = info1[k]; return L.s[pi.lineEnd] > z.s0 - 20 && L.s[pi.lineStart] < z.s1 + 20; });
  const fill = new Float64Array(NP).fill(-1e9), cut = new Float64Array(NP).fill(1e9);
  for (let k = 0; k < NP; k++) {
    const pi = info1[k];
    for (let i = pi.lineStart; i <= pi.lineEnd; i += 2) {
      const lh = land.h(L.px[i], L.pz[i]), uu = uAt(L.s[i]);
      fill[k] = Math.max(fill[k], uu - lh); cut[k] = Math.min(cut[k], lh - uu);
    }
  }
  const BR = new Set(['straight', 'checkpoint', 'turnL']);   // enge Kurven nicht (Kehre: Ideallinie schneidet in die Brüstung)
  P.forEach((pc, k) => {
    if (gid[k] >= 0 || inKuppe(k) || pc.tilt0 != null) return;
    // nicht direkt vor/nach einem Stunt (nach der Landung braucht das Auto Platz ohne Brüstung)
    const nb = (q) => gid[(k + q + NP) % NP] >= 0 && P[(k + q + NP) % NP].type !== 'start';
    if (BR.has(pc.type) && fill[k] > G.bridge && !pc.g && !nb(-1) && !nb(1)) pieces[k].bridge = 1;
  });
  // Tunnel: Läufe gerader Stücke (ohne Checkpoint), mindestens 2 Felder, durchgehend tief genug – oder vom Generator
  // gewollt (pc.g = 'tunnel', dann hebt das Gelände einen Hügel darüber)
  const nearStunt = (k) => [-1, 1].some((q) => { const j = (k + q + NP) % NP; return gid[j] >= 0 && P[j].type !== 'start'; });
  const tun = P.map((pc, k) => pc.type === 'straight' && gid[k] < 0 && !inKuppe(k) && !pieces[k].bridge && pc.tilt0 == null && (pc.g === 'tunnel' || (cut[k] > G.tunnel && !nearStunt(k))));
  // höchstens 2 Tunnel je Strecke: der gewollte zuerst, dann die tiefsten Einschnitte (sonst wird jede Kuppe zum Tunnel)
  const truns = [];
  for (let k = 0; k < NP;) {
    if (!tun[k]) { k++; continue; }
    let e = k; while (e + 1 < NP && tun[e + 1]) e++;
    if (e > k) { let sc = 1e9; for (let q = k; q <= e; q++) sc = Math.min(sc, P[q].g === 'tunnel' ? 1e6 : cut[q]); truns.push({ k, e, sc }); }
    k = e + 1;
  }
  truns.sort((a, b) => b.sc - a.sc);
  for (const { k, e } of truns.slice(0, 2)) for (let q = k; q <= e; q++) { pieces[q].tunnel = 1; if (q === k) pieces[q].portalIn = 1; if (q === e) pieces[q].portalOut = 1; if (P[q].g === 'tunnel') pieces[q].hill = 1; }
  return { pieces, zones, M, ds, u, uAt, scale, gmax, bad };
}

// Gauß-Glättung einer geschlossenen Folge (σ in Abtastschritten)
function gauss(a, sig) {
  const M = a.length, R = Math.min(M >> 1, Math.ceil(3 * sig)), w = [];
  let ws = 0;
  for (let q = -R; q <= R; q++) { const v = Math.exp(-0.5 * (q / sig) ** 2); w.push(v); ws += v; }
  const out = new Float64Array(M);
  for (let j = 0; j < M; j++) { let s = 0; for (let q = -R; q <= R; q++) s += a[((j + q) % M + M) % M] * w[q + R]; out[j] = s / ws; }
  return out;
}

// Höhenverlauf lösen (geschlossene Linie, gleichmäßige Abtastung ds): u = Fahrbahnhöhe je Punkt,
//   min Σ W (u − bR − t)² + λ/ds⁴ Σ λj (Δ²u)² + Σ μj (Δu/ds)² + P Σ_Gruppe (Δ(u − bR))²
// bR = Höhe im ersten Bau auf Sockel-Stücken (sonst 0); innerhalb einer Gruppe hält die Strafe P (u − bR) konstant
// (= Sockelhöhe c), Krümmung zählt dort nicht (Looping, Schanze haben ihre Form). Fünfband-Matrix + zyklische Ecken:
// vorkonditioniertes CG mit der Band-LDLᵀ-Zerlegung (ohne Ecken) als Vorkonditionierer – wenige Schritte, exakt.
// (Bis zur ersten Fassung: matrixfreies CG mit Jacobi, konvergierte bei steifen Stellen nicht → Knicke an Sockeln.)
function solveBand(M, ds, grp, bR, W, t, lam, lamJ, mu) {
  const kap = lam / ds ** 4, Pn = 1e10;
  const inG = (j) => grp[j] >= 0;
  const same = (a, b) => grp[a] >= 0 && grp[a] === grp[b];
  // Gewicht der Krümmung je Mittelpunkt j (0, wenn j−1, j, j+1 in derselben Gruppe)
  const lk = new Float64Array(M), gp = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    const a = (j - 1 + M) % M, b = (j + 1) % M;
    lk[j] = same(a, j) && same(j, b) ? 0 : kap * lamJ[j];
    gp[j] = same(j, b) ? Pn : 0;   // Paar (j, j+1)
  }
  // Matrix als Band (a0 Diagonale, a1 (j, j+1), a2 (j, j+2)), zyklisch: Indizes modulo M
  const a0 = new Float64Array(M), a1 = new Float64Array(M), a2 = new Float64Array(M), corner = [];
  for (let j = 0; j < M; j++) {
    a0[j] += W[j];
    // Krümmung am Punkt j: Vektor (1, −2, 1) auf (j−1, j, j+1)
    const q = [(j - 1 + M) % M, j, (j + 1) % M], w = [1, -2, 1], L = lk[j];
    if (L) for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) addA(q[x], q[y], L * w[x] * w[y]);
    if (gp[j]) { const b = (j + 1) % M; addA(j, j, gp[j]); addA(b, b, gp[j]); addA(j, b, -gp[j]); addA(b, j, -gp[j]); }
    // örtliche Steigungs-Bremse (Paar j, j+1): zieht zu steile Stellen flacher (Einschnitt/Damm statt Steilhang)
    if (mu[j] && !gp[j]) { const b = (j + 1) % M, v = mu[j] / (ds * ds); addA(j, j, v); addA(b, b, v); addA(j, b, -v); addA(b, j, -v); }
  }
  function addA(r, c, v) {
    // nur oberes Dreieck speichern (symmetrisch); zyklische Ecken getrennt
    let d = c - r;
    if (d < -2 || d > 2) { corner.push([r, c, v]); return; }
    if (d < 0) return;   // unteres Dreieck: über (c, r) erfasst
    if (d === 0) a0[r] += v; else if (d === 1) a1[r] += v; else a2[r] += v;
  }
  // rechte Seite
  const rhs = new Float64Array(M);
  for (let j = 0; j < M; j++) rhs[j] += W[j] * (t[j] + bR[j]);
  for (let j = 0; j < M; j++) if (gp[j]) { const b = (j + 1) % M, dd = bR[b] - bR[j]; rhs[b] += gp[j] * dd; rhs[j] -= gp[j] * dd; }
  // Band-LDLᵀ (ohne Ecken)
  const d = new Float64Array(M), l1 = new Float64Array(M), l2 = new Float64Array(M);
  for (let j = 0; j < M; j++) {
    l2[j] = j >= 2 ? a2[j - 2] / d[j - 2] : 0;
    l1[j] = j >= 1 ? (a1[j - 1] - (j >= 2 ? l2[j] * d[j - 2] * l1[j - 1] : 0)) / d[j - 1] : 0;
    d[j] = a0[j] - l1[j] * l1[j] * (j >= 1 ? d[j - 1] : 0) - l2[j] * l2[j] * (j >= 2 ? d[j - 2] : 0);
  }
  const prec = (r, z) => {
    for (let j = 0; j < M; j++) z[j] = r[j] - (j >= 1 ? l1[j] * z[j - 1] : 0) - (j >= 2 ? l2[j] * z[j - 2] : 0);
    for (let j = 0; j < M; j++) z[j] /= d[j];
    for (let j = M - 1; j >= 0; j--) z[j] -= (j + 1 < M ? l1[j + 1] * z[j + 1] : 0) + (j + 2 < M ? l2[j + 2] * z[j + 2] : 0);
  };
  const A = (x, out) => {
    for (let j = 0; j < M; j++) {
      let v = a0[j] * x[j];
      if (j + 1 < M) v += a1[j] * x[j + 1]; if (j + 2 < M) v += a2[j] * x[j + 2];
      if (j >= 1) v += a1[j - 1] * x[j - 1]; if (j >= 2) v += a2[j - 2] * x[j - 2];
      out[j] = v;
    }
    for (const [r, c, v] of corner) out[r] += v * x[c];
  };
  const x = new Float64Array(M), r = Float64Array.from(rhs), z = new Float64Array(M), p = new Float64Array(M), Ap = new Float64Array(M);
  prec(r, z); p.set(z);
  let rz = 0; for (let j = 0; j < M; j++) rz += r[j] * z[j];
  let r0 = 0; for (let j = 0; j < M; j++) r0 += rhs[j] * rhs[j];
  for (let it = 0; it < 200; it++) {
    A(p, Ap);
    let pAp = 0; for (let j = 0; j < M; j++) pAp += p[j] * Ap[j];
    if (!(pAp > 0)) break;
    const al = rz / pAp;
    let rn = 0;
    for (let j = 0; j < M; j++) { x[j] += al * p[j]; r[j] -= al * Ap[j]; rn += r[j] * r[j]; }
    if (rn < 1e-22 * r0) break;
    prec(r, z);
    let rz2 = 0; for (let j = 0; j < M; j++) rz2 += r[j] * z[j];
    const be = rz2 / rz; rz = rz2;
    for (let j = 0; j < M; j++) p[j] = z[j] + be * p[j];
  }
  return x;
}

// ---------- 3) Gelände ----------
// ctx: { line (L), layout, plan, land, shapes, occupied, pieces (pieceInfo) }
export function buildGelTerrain(ctx) {
  const { line: L, layout, plan, land, shapes, occupied } = ctx;
  const t00 = globalThis.performance ? performance.now() : 0;
  const P = layout.pieces, n = L.n;
  const ext = gridExt(WORLD_HALF + 60 * WS, 5), step = 5, nx = Math.round(2 * ext / step) + 1;
  const NN = nx * nx;
  const lo = new Float32Array(NN).fill(-1e9), hi = new Float32Array(NN).fill(1e9);
  const hiRoad = new Float32Array(NN).fill(1e9);   // n23: Obergrenze nur aus Fahrbahn-Streifen (gewinnt auch gegen must)
  const R = new Float32Array(NN).fill(-1e9), C = new Float32Array(NN).fill(1e9);
  const carve = new Float32Array(NN).fill(1e9);   // Physik im Tunnel: unter der Fahrbahn
  const must = new Float32Array(NN).fill(-1e9);   // Mindesthöhe über dem Tunnelgewölbe (gewinnt gegen Böschungen)
  // Klasse je Linienpunkt: 0 Straße, 1 Luft, 2 Tunnel, 3 Brücke, 4 aus (Looping-Spur)
  const cls = new Uint8Array(n), w0 = new Float32Array(n), ub = new Float32Array(n), sl = new Float32Array(n);
  const kindOf = new Array(n);
  const del = ENV.delta;
  for (let i = 0; i < n; i++) {
    const k = L.piece[i], pc = P[k], pl = plan.pieces[k] || {}, type = pc ? pc.type : 'straight';
    cls[i] = L.air[i] ? 1 : L.loop[i] ? 4 : pl.tunnel ? 2 : pl.bridge ? 3 : 0;
    kindOf[i] = type === 'bank' ? 'bank' : type === 'halfpipe' ? 'hp' : pc && pc.tilt0 != null ? 'tilt' : RIGID.has(type) ? 'rigid' : 'road';
    w0[i] = kindOf[i] === 'bank' ? ENV.w0Bank : kindOf[i] === 'hp' || kindOf[i] === 'rigid' ? ENV.w0Rigid : ENV.w0;
    // Bezugshöhe: Fahrbahn (Mittellinie) – auf Stunt-Sockeln die Sockelhöhe (Schanze, Looping stehen darauf)
    ub[i] = pl.rigid && ON_BASE.has(type) ? pl.c : L.py[i];
    // seitliche Neigung der Fahrbahn (m je m nach rechts)
    const bh = Math.hypot(L.bx[i], L.bz[i]) || 1;
    sl[i] = L.by[i] / bh;
  }
  // Querschnitt neben der Fahrbahn: Höhe bei Querabstand l (rechts +) relativ zur Bezugshöhe
  // Drop (Klippe): Seite je Punkt – 1 = Plateau vor der Kante, 2 = Landehang/Auslauf danach
  const dropSide = new Uint8Array(n);
  for (let k = 0; k < P.length; k++) {
    if (P[k].type !== 'cliff' && P[k].type !== 'cliff2') continue;
    const pi = ctx.pieces[k];
    let seenAir = false;
    for (let i = pi.lineStart; i <= pi.lineEnd; i++) { if (L.air[i]) seenAir = true; else dropSide[i] = seenAir ? 2 : 1; }
  }
  // Halfpipe: Öffnungswinkel je Punkt wie im Stück (über die Bogenlänge im Stück)
  const hpA = new Float32Array(n);
  for (let i = 0; i < n; i++) if (kindOf[i] === 'hp') {
    const pi = ctx.pieces[L.piece[i]], s0 = L.s[pi.lineStart], s1 = L.s[pi.lineEnd], f = (L.s[i] - s0) / Math.max(1, s1 - s0) * 3 * T;
    hpA[i] = HALFPIPE.A * smootherstep(f / HALFPIPE.ramp) * smootherstep((3 * T - f) / HALFPIPE.ramp);
  }
  const side = (i, l) => {
    const kd = kindOf[i], a = Math.abs(l), s = sl[i];
    if (kd === 'hp') {
      // unter den (hohlen) Viertelröhren bleibt das Gelände auf Bodenhöhe – im 5-m-Raster läge die Sehne sonst über der
      // Rundung (Gras durch die Wand, Räder auf Gras); erst eine Rasterzelle hinter der Kante auf Kantenhöhe
      const e = a - HALFPIPE.hf, Rq = HALFPIPE.R, ex = Rq * Math.sin(hpA[i]);
      if (e <= ex + 6) return 0;
      return Rq - Math.sqrt(Rq * Rq - ex * ex);
    }
    if (kd === 'bank') {   // außen (hoch) der Fahrbahnneigung weiter folgen (Mulde), innen waagrecht
      if (Math.sign(l) === Math.sign(s)) return Math.min(s * l, Math.abs(s) * 16);
      return s * Math.sign(l) * Math.min(a, ROAD_HW + 1);
    }
    return s * l;
  };
  const gx0 = -ext;
  const kUp = ENV.kUp, kLo = ENV.kLo;
  const tilts = [];
  // Abschnitte stempeln – ausgedünnt auf ~3 m (Klassen- und Artwechsel bleiben exakt)
  const STAMP = 3;
  const use = [0];
  for (let i = 1; i < n; i++) {
    const last = use[use.length - 1];
    if (i === n - 1 || cls[i] !== cls[i - 1] || (i + 1 < n && cls[i + 1] !== cls[i]) || kindOf[i] !== kindOf[last] || L.piece[i] !== L.piece[last] || L.s[i] - L.s[last] >= STAMP) use.push(i);
  }
  const segC = (q) => { const i = use[q], j = use[q + 1]; return cls[i] === 1 || cls[j] === 1 ? 1 : cls[i] === 4 || cls[j] === 4 ? 4 : cls[i]; };
  const nSeg = use.length - 1;
  // Läufe gleicher Klasse: Klasse davor/danach und Restlänge bis zum Laufende je Abschnitt (Überstand über das Laufende
  // hinaus – nicht nur über das Abschnittsende – entscheidet über steile Kante an der Lücke / Hügel über dem Tunnel)
  const sc = new Uint8Array(nSeg), sLen = new Float64Array(nSeg);
  for (let q = 0; q < nSeg; q++) { sc[q] = segC(q); sLen[q] = Math.hypot(L.px[use[q + 1]] - L.px[use[q]], L.pz[use[q + 1]] - L.pz[use[q]]); }
  const segTx = new Float64Array(nSeg), segTz = new Float64Array(nSeg);
  for (let q = 0; q < nSeg; q++) { const a = use[q], b = use[q + 1], l = Math.hypot(L.px[b] - L.px[a], L.pz[b] - L.pz[a]) || 1; segTx[q] = (L.px[b] - L.px[a]) / l; segTz[q] = (L.pz[b] - L.pz[a]) / l; }
  const runNext = new Uint8Array(nSeg), runPrev = new Uint8Array(nSeg), dEnd = new Float64Array(nSeg), dStart = new Float64Array(nSeg);
  for (let q = nSeg - 1; q >= 0; q--) { const same = q < nSeg - 1 && sc[q + 1] === sc[q]; runNext[q] = q === nSeg - 1 ? sc[q] : same ? runNext[q + 1] : sc[q + 1]; dEnd[q] = same ? dEnd[q + 1] + sLen[q + 1] : 0; }
  for (let q = 0; q < nSeg; q++) { const same = q > 0 && sc[q - 1] === sc[q]; runPrev[q] = q === 0 ? sc[q] : same ? runPrev[q - 1] : sc[q - 1]; dStart[q] = same ? dStart[q - 1] + sLen[q - 1] : 0; }
  for (let q = 0; q < nSeg; q++) {
    const i = use[q], j = use[q + 1];
    const ax = L.px[i], az = L.pz[i], bx = L.px[j], bz = L.pz[j];
    let tx = bx - ax, tz = bz - az;
    const len = Math.hypot(tx, tz);
    if (len < 1e-4) continue;
    tx /= len; tz /= len;
    const nxv = -tz, nzv = tx;   // rechts
    const c = segC(q);
    if (c === 4) continue;
    // Lauf-Enden: Klasse des Abschnitts davor/danach
    const prevC = q > 0 ? segC(q - 1) : c, nextC = q < nSeg - 1 ? segC(q + 1) : c;
    const kd = kindOf[i], ww = Math.max(w0[i], w0[j]);
    const k = L.piece[i], pc = P[k], pl = plan.pieces[k] || {};
    // Formen der Elemente
    const isGorge = c === 1 && pc && pc.type === 'jump' && pc.g === 'gorge';
    const isDropAir = c === 1 && pc && (pc.type === 'cliff' || pc.type === 'cliff2');
    const isPlateau = c === 0 && dropSide[i] === 1, isLand = c === 0 && dropSide[i] === 2;
    const isTilt = kd === 'tilt' && Math.abs(sl[i]) > 0.02;
    // Reichweite: so weit, wie eine Böschung bis zur Landschaft reicht (Landschaft neben dem Abschnitt abgetastet)
    let reach;
    if (c === 1) reach = isGorge ? ENV.gorgeLen + 40 : isDropAir ? 75 : 30;
    else {
      const mx = (ax + bx) / 2, mz = (az + bz) / 2, um = (ub[i] + ub[j]) / 2;
      let dmax = Math.abs(land.h(mx, mz) - um);
      for (const o of [-80, -35, 35, 80]) dmax = Math.max(dmax, Math.abs(land.h(mx + nxv * o, mz + nzv * o) - um));
      reach = Math.min(ENV.reach, ww + 8 + dmax / kLo);
      if (c === 2) reach = Math.max(reach, 85);
      if (isTilt || isPlateau || isLand) reach = Math.max(reach, 90);
      if (kd === 'hp') reach = Math.max(reach, 70);
    }
    const x0 = Math.min(ax, bx) - reach, x1 = Math.max(ax, bx) + reach, z0 = Math.min(az, bz) - reach, z1 = Math.max(az, bz) + reach;
    const i0 = Math.max(0, Math.ceil((x0 - gx0) / step)), i1 = Math.min(nx - 1, Math.floor((x1 - gx0) / step));
    const j0 = Math.max(0, Math.ceil((z0 - gx0) / step)), j1 = Math.min(nx - 1, Math.floor((z1 - gx0) / step));
    for (let gj = j0; gj <= j1; gj++) {
      const pz = gx0 + gj * step;
      for (let gi = i0; gi <= i1; gi++) {
        const px = gx0 + gi * step;
        const dx = px - ax, dz = pz - az;
        let t = (dx * tx + dz * tz) / len;
        const l = dx * nxv + dz * nzv;
        let o = 0;   // Überstand über das Abschnittsende hinaus (m)
        if (t < 0) { o = -t * len; t = 0; } else if (t > 1) { o = (t - 1) * len; t = 1; }
        const beyondStart = o > 0 && t === 0, beyondEnd = o > 0 && t === 1;
        // über ein inneres Abschnittsende hinaus zählt nur der Keil außen an einer Kurve – was der Nachbar-Abschnitt
        // abdeckt, gehört ihm (sonst drückt am Hang die ein paar Meter weiter unten liegende Fahrbahn das Gelände neben
        // der Straße hinunter: Räder über der Kante ohne Boden)
        if (beyondEnd && q < nSeg - 1 && sc[q + 1] === c && (px - L.px[use[q + 1]]) * segTx[q + 1] + (pz - L.pz[use[q + 1]]) * segTz[q + 1] >= 0) continue;
        if (beyondStart && q > 0 && sc[q - 1] === c && (px - L.px[use[q]]) * segTx[q - 1] + (pz - L.pz[use[q]]) * segTz[q - 1] <= 0) continue;
        // über das Laufende hinaus (Lippe, Landung, Portal): Überstand ab dem Laufende
        const oEnd = beyondEnd ? o - dEnd[q] : -1, oStart = beyondStart ? o - dStart[q] : -1;
        const d = Math.hypot(l, o);
        if (d > reach) continue;
        const g = gj * nx + gi;
        const u0 = ub[i] + (ub[j] - ub[i]) * t;
        const ii = t < 0.5 ? i : j;
        if (c === 1) {
          // Schlucht: Wände außerhalb des Lücken-Streifens steil ansteigend (~63°), statt senkrecht (Kasten)
          if (isGorge && o > 0) {
            const base = (pl.c ?? u0) - ENV.gorgeDepth * (1 - smoothstep(ENV.gorgeLen - 80, ENV.gorgeLen, Math.abs(l))) + 2 * o;
            if (base < C[g]) C[g] = base;
            continue;
          }
          // Luft (Sprunglücke): Gelände bleibt unter der Flugbahn, darf beliebig tief fallen
          if (o > 0) continue;
          const lim = u0 - 2.5 + Math.max(0, Math.abs(l) - (ROAD_HW + 4)) * kUp;
          if (lim < hi[g]) hi[g] = lim;
          if (isGorge) {
            // Schlucht quer zur Fahrtrichtung: Sohle ENV.gorgeDepth unter dem Sockel, Enden laufen aus
            const base = (pl.c ?? u0) - ENV.gorgeDepth * (1 - smoothstep(ENV.gorgeLen - 80, ENV.gorgeLen, Math.abs(l)));
            if (base < C[g]) C[g] = base;
          } else if (isDropAir) {
            // Plateau-Kante quer zur Fahrt: unten auf Höhe des Auslaufs, seitlich weit, am Ende auslaufend
            const base = (pl.c ?? u0) - del + 0.6 * Math.max(0, Math.abs(l) - 55);
            if (base < C[g]) C[g] = base;
          }
          continue;
        }
        // Fahrbahn: Streifen genau auf Fahrbahnhöhe, dahinter Böschungen
        const al = Math.abs(l);
        const surfAt = (q) => u0 + side(ii, q) - (kd === 'bank' || kd === 'tilt' ? del + 0.25 : del);   // Steilkurve, Hang-Querfahrt: verwunden → mehr Luft
        let sLo, sHi;
        const cliffEdge = (oEnd > 0 && runNext[q] === 1) || (oStart > 0 && runPrev[q] === 1);
        if (d <= ww) { sLo = sHi = surfAt(l); }
        else {
          const edge = surfAt(Math.sign(l || 1) * Math.min(al, ww));
          const dd = d - ww;
          sLo = edge - kLo * dd; sHi = edge + kUp * dd;
        }
        // über eine Sprunglücke hinaus (Lippe, Landung): steile Kante statt Böschung
        if ((oEnd > 0 && runNext[q] === 1) || (oStart > 0 && runPrev[q] === 1)) sLo = surfAt(Math.sign(l || 1) * Math.min(al, ww)) - ENV.kCliff * Math.max(oEnd, oStart) - kLo * Math.max(0, al - ww);
        if (c === 3) {
          // Brücke: Gelände unter dem Deck mit Luft, keine Untergrenze
          const lim = (al < ROAD_HW + 3 && o === 0 ? u0 - ENV.bridgeGap : u0 - ENV.bridgeGap + kUp * Math.max(0, Math.hypot(Math.max(0, al - ROAD_HW - 3), o)));
          if (lim < hi[g]) hi[g] = lim;
          continue;
        }
        // Tunnel: keine Obergrenze (Hügel darüber); Zufahrt: hinter dem Portal ebenso keine
        const noHi = c === 2 || (oEnd > 0 && runNext[q] === 2) || (oStart > 0 && runPrev[q] === 2);
        if (!noHi && sHi < hi[g]) hi[g] = sHi;
        if (!noHi && c === 0 && d <= ROAD_HW + 5 && sHi < hiRoad[g]) hiRoad[g] = sHi;
        if (sLo > lo[g]) lo[g] = sLo;
        if (c === 2) {
          // Hügel über dem Tunnel (Deckung ENV.cover, seitlich und hinter den Portalen auslaufend) + Physik unter der Fahrbahn
          const fall = 1 - smoothstep(18, 85, al);
          const portal = o > 0 ? 1 - smoothstep(0, 28, o) : 1;
          const cov = (pl.hill ? ENV.cover + 4 : ENV.cover) * fall * portal;
          if (u0 + cov > R[g]) R[g] = u0 + cov;
          if (o === 0 && al < ENV.tunnelHW + 7.5) { const cv = u0 - 0.3; if (cv < carve[g]) carve[g] = cv; }
          if (o === 0) { const mv = u0 + ENV.tunnelH + 2.2 - Math.max(0, al - ENV.tunnelHW - 2) * 0.9; if (mv > must[g]) must[g] = mv; }
        } else if (isTilt) {
          // Hang-Querfahrt: Hang setzt sich seitlich fort (bergauf heben, bergab senken)
          const hs = surfAt(l) + del, f2 = 1 - smoothstep(55, 90, al);
          if (sl[ii] * l > 0) { const v = u0 + (hs - u0) * f2; if (v > R[g]) R[g] = v; }
          else { const v = u0 + (hs - u0) * f2; if (v < C[g]) C[g] = v; }
        } else if (kd === 'hp') {
          // Tal um die Halfpipe: Gelände steigt hinter dem Rand weiter an
          const v = ub[ii] + side(ii, ww) + Math.min(14, 0.5 * Math.max(0, d - ww)) * (1 - smoothstep(45, 70, d));
          if (v > R[g]) R[g] = v;
        } else if (isLand && d > ww) {
          // neben dem Landehang liegt das Gelände unten (Auslauf-Höhe): der Hang steht als Rampe vor der Klippe
          const v = (pl.c ?? u0) - del + 0.6 * Math.max(0, d - 55);
          if (v < C[g]) C[g] = v;
        } else if (isPlateau && !(oEnd > 0 && runNext[q] === 1)) {
          // Plateau vor dem Drop: breite Hochfläche auf Fahrbahnhöhe, endet an der Kante (nicht über die Lücke hinaus)
          const v = u0 - del - 1.2 * Math.max(0, d - 55);
          if (v > R[g]) R[g] = v;
        }
      }
    }
  }
  const tA = globalThis.performance ? performance.now() : 0;
  // Landschaft + Formen, eingeklemmt zwischen Unter-/Obergrenze (Obergrenze gewinnt: nie Gelände über einer Fahrbahn)
  const Hvis = new Float32Array(NN), Hph = new Float32Array(NN);
  const shapeFn = makeShapes(shapes);
  for (let gj = 0; gj < nx; gj++) for (let gi = 0; gi < nx; gi++) {
    const g = gj * nx + gi, px = gx0 + gi * step, pz = gx0 + gj * step;
    let h = land.h(px, pz);
    if (R[g] > h) h = R[g];
    if (C[g] < h) h = C[g];
    if (lo[g] > h) h = lo[g];
    if (hi[g] < h) h = hi[g];
    // Tunnel-Deckung (must) nie über eine andere Fahrbahn (n23: mit der breiteren Fahrbahn reichte sie in S-Kurven neben
    // dem Portal über den Rand der Nachbar-Fahrbahn)
    if (must[g] > h) h = Math.min(must[g], hiRoad[g]);
    h = shapeFn(px, pz, h);
    Hvis[g] = h;
    Hph[g] = Math.min(h, carve[g]);
  }
  const tB = globalThis.performance ? performance.now() : 0;
  // Abstand zur Strecke in Feldern (für Bäume, AO, feines Raster) wie beim flachen Gelände
  const distTiles = makeDistTiles(occupied);
  const fineBlock = (x0, z0, x1, z1) => Math.min(distTiles(x0, z0), distTiles(x1, z0), distTiles(x0, z1), distTiles(x1, z1), distTiles((x0 + x1) / 2, (z0 + z1) / 2)) < GEL_FINE;
  const node = (x, z) => { const gi = Math.round((x - gx0) / step), gj = Math.round((z - gx0) / step); return Hvis[gj * nx + gi]; };
  // grobe Blöcke dürfen hier GEL_COARSE m abweichen (hügelige Landschaft: bei 0,5 m wären fast alle Blöcke fein,
  // +170 % Gelände-Dreiecke); nahe der Strecke bleibt alles fein (Physik nutzt ohnehin das volle Raster)
  const { nb, H: Hgrid, Hv, fine } = adaptiveGrid(ext, step, node, fineBlock, (x, z) => (distTiles(x, z) < 2.5 ? GEL_ERR[0] : GEL_ERR[1]));
  const bil = (A) => (x, z) => {
    const fx = (x + ext) / step, fz = (z + ext) / step;
    if (fx < 0 || fz < 0 || fx >= nx - 1 || fz >= nx - 1) return land.h(x, z);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = A[j * nx + i], b = A[j * nx + i + 1], c = A[(j + 1) * nx + i], dd = A[(j + 1) * nx + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + dd * u) * v;
  };
  const height = bil(Hph);
  // Wasser: Gruben/Teiche der Stücke (relativ zu ihrem Sockel) und Flüsse in Schluchten
  const waters = [];
  for (const s of shapes) {
    const dy = s.dy || 0;
    if (s.type === 'pit' && s.water !== false) waters.push({ E: s.E, F: s.F, R: s.R, f0: s.f0 - 1, f1: s.f1 + 1, r0: -s.hw - 1, r1: s.hw + 1, y: dy - 2.6 });
    else if (s.type === 'pond') waters.push({ E: s.E, F: s.F, R: s.R, f0: s.c[0] - s.rx, f1: s.c[0] + s.rx, r0: -s.rz, r1: s.rz, y: dy - 1.4 });
    else if (s.type === 'gorge') waters.push({ E: s.E, F: s.F, R: s.R, f0: s.f0 - 12, f1: s.f1 + 12, r0: -ENV.gorgeLen, r1: ENV.gorgeLen, y: s.dy - ENV.gorgeDepth + 1.6, river: 1 });
  }
  const wet = (x, z) => {
    for (const w of waters) {
      const dx = x - w.E[0], dz = z - w.E[2], f = dx * w.F[0] + dz * w.F[2], r = dx * w.R[0] + dz * w.R[2];
      if (f > w.f0 - 4 && f < w.f1 + 4 && r > w.r0 - 4 && r < w.r1 + 4 && height(x, z) < w.y + 0.5) return true;
    }
    return false;
  };
  void Hgrid;
  if (globalThis.process && process.env.GELDBG) console.log('terrain: stempeln', (tA - t00).toFixed(0), 'mischen', (tB - tA).toFixed(0), 'raster', (performance.now() - tB).toFixed(0));
  return { ext, step, nx, H: Hph, Hv, height, heightFn: land.h, distTiles, waters, fine, nb, wet, gel: true, Hvis };
}

// Formen der Stücke (Grube unter der Lücke, Hügel unter Wellen/Kuppe, Teich) relativ zum Sockel des Stücks (s.dy)
function makeShapes(shapes) {
  const list = shapes.filter((s) => s.type === 'pit' || s.type === 'mound' || s.type === 'pond');
  if (!list.length) return (x, z, h) => h;
  return (x, z, h) => {
    for (const s of list) {
      const dx = x - s.E[0], dz = z - s.E[2];
      const f = dx * s.F[0] + dz * s.F[2], r = dx * s.R[0] + dz * s.R[2], dy = s.dy || 0;
      if (s.type === 'pit') {
        const df = Math.max(s.f0 - f, f - s.f1, 0), dr = Math.max(Math.abs(r) - s.hw, 0);
        if (Math.max(df, dr) < s.slope) {
          const inner = Math.max(s.f0 + s.slope - f, f - (s.f1 - s.slope), Math.abs(r) - (s.hw - s.slope));
          const t = inner <= 0 ? 1 : 1 - clamp(inner / s.slope, 0, 1);
          h = Math.min(h, dy - s.depth * smoothstep(0, 1, t));
        }
      } else if (s.type === 'mound') {
        if (f >= s.f0 - 12 && f <= s.f1 + 12) {
          const ff = clamp((f - s.f0) / (s.f1 - s.f0), 0, 1) * (s.arr.length - 1), k = Math.floor(ff), t = ff - k;
          const top = dy + (s.arr[k] * (1 - t) + s.arr[Math.min(k + 1, s.arr.length - 1)] * t) - 0.12;
          const v = top - (Math.max(Math.abs(r) - s.hw, 0) + Math.max(s.f0 - f, f - s.f1, 0)) / 2.2;
          if (v > h) h = v;
        }
      } else if (s.type === 'pond') {
        const e = Math.hypot((f - s.c[0]) / s.rx, r / s.rz);
        if (e < 1) h = Math.min(h, dy - s.depth * smoothstep(1, 0.55, e));
      }
    }
    return h;
  };
}

// Abstand jeder Stelle zur Strecke in Feldern (8er-Nachbarschaft, bilinear), außerhalb des Rasters wachsend
export function makeDistTiles(occupied) {
  const D = new Float32Array(GRID * GRID).fill(99), q = [];
  for (let k = 0; k < GRID * GRID; k++) if (occupied[k]) { D[k] = 0; q.push(k); }
  for (let h = 0; h < q.length; h++) {
    const k = q[h], i = k % GRID, j = (k / GRID) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= GRID || nj >= GRID) continue;
      const nk = nj * GRID + ni, nd = D[k] + (di && dj ? 1.414 : 1);
      if (nd < D[nk]) { D[nk] = nd; q.push(nk); }
    }
  }
  return (x, z) => {
    const fi = (x - tileX(0)) / TILE, fj = (z - tileZ(0)) / TILE;
    const i0 = Math.floor(fi), j0 = Math.floor(fj), tx = fi - i0, tz = fj - j0;
    const g = (i, j) => (i < 0 || j < 0 || i >= GRID || j >= GRID) ? 99 : D[j * GRID + i];
    const out = Math.max(Math.abs(x) - WORLD_HALF, Math.abs(z) - WORLD_HALF, 0) / TILE;
    const v = Math.min(99, (g(i0, j0) * (1 - tx) + g(i0 + 1, j0) * tx) * (1 - tz) + (g(i0, j0 + 1) * (1 - tx) + g(i0 + 1, j0 + 1) * tx) * tz);
    return Math.min(v, 30) + out;
  };
}

export { smootherstep };
