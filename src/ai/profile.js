// Ideallinie + Tempo-Profil entlang der Fahrlinie.
// Grenzen aus der Geometrie: Querhaftung (inkl. Überhöhung), Mindest-Anpressdruck im Looping,
// maximale Last, Sprung-Fenster (ballistisch gelöst). Danach Brems-Rückwärtslauf.
import { jumpWindow, JUMP_T } from '../track/pieces.js';
import { G, flightPath, pathAt } from '../physics/air.js';
import { CAR_DEF, GRIP_ALT, driveAccel, brakeDecel, topSpeed, aeroLoad } from '../physics/car.js';
import { WORLD_SCALE, TILE, ROAD_HW } from '../track/defs.js';

export { jumpWindow }; // Standard-Schanze: Tempo-Fenster in pieces.js (gleiche Luft-Physik wie das Auto)

// Sprung über eine Lücke (Import): Tempo-Fenster ballistisch aus der echten Geometrie.
// Abwurf am letzten Punkt vor der Luftstrecke (Richtung = Linientangente), Landung auf den folgenden
// Linienpunkten; gültig, wenn die Flugbahn nicht vor der Landefläche aufschlägt und der Aufprall
// senkrecht zur Fläche < 9 m/s bleibt. Liefert { vmin, vmax, vbest } oder null.
export function genericJumpWindow(L, lip, land) {
  // Bahn der Radaufstandspunkte (Fahrbahnhöhe an der Lippe)
  const p0x = L.px[lip], p0y = L.py[lip], p0z = L.pz[lip];
  const hl = Math.hypot(L.tx[lip], L.tz[lip]) || 1;
  const dx0 = L.tx[lip] / hl, dz0 = L.tz[lip] / hl, th = Math.atan2(L.ty[lip], hl);
  const pts = [];
  for (let i = land; i < L.n && pts.length < 300; i++) {
    if (L.air[i]) continue;
    const dx = L.px[i] - p0x, dz = L.pz[i] - p0z;
    const x = dx * dx0 + dz * dz0, lat = -dx * dz0 + dz * dx0;
    if (Math.abs(lat) > ROAD_HW + 1.5) break;   // Linie biegt ab: weiter hinten keine Landung (bis 27.09.2026: 6 m)
    pts.push({ x, y: L.py[i], i });
    if (x > 140 * WORLD_SCALE) break;             // Lücken wachsen mit dem Feld (bis 6 Felder)
  }
  if (pts.length < 3) return null;
  const ok = [];
  let fb = null; // Notlösung ohne gültiges Fenster: Landung mit dem schwächsten Aufprall
  const xMax = pts[pts.length - 1].x + 2, drag = CAR_DEF.dragK / CAR_DEF.mass;
  const vHi = 70 * Math.sqrt(WORLD_SCALE);      // längere Lücken im größeren Feld brauchen mehr Tempo
  for (let v = 8; v <= vHi; v += 0.25) {         // bis 27.09.2026: 8–48 m/s, dann 8–70
    // Flugbahn mit derselben Luft-Physik wie das Auto (bis 27.09.2026: Parabel mit voller Schwerkraft)
    const P = flightPath(p0y, th, v, { xMax, yMin: p0y - 60, drag });
    const traj = (x) => pathAt(P, x).y;
    // Vorder- und Hinterachse (2,7 m dahinter) müssen die Landekante sicher überfliegen
    if (traj(pts[0].x) < pts[0].y + 0.35 || traj(pts[0].x - 2.7) < pts[0].y + 0.1) continue;
    let hit = -1;
    for (let k = 1; k < pts.length; k++) if (traj(pts[k].x) <= pts[k].y + 0.05) { hit = k; break; }
    if (hit < 1) continue;
    const a = pts[hit - 1], b = pts[hit];
    const sl = (b.y - a.y) / Math.max(0.05, b.x - a.x);
    const { vx, vy } = pathAt(P, b.x);
    const imp = (vy - sl * vx) / Math.sqrt(1 + sl * sl);
    const along = b.x - pts[0].x;
    if (!fb || imp > fb.imp) fb = { v, imp };
    if (imp < -8 || along < 3) continue;
    ok.push(v);
  }
  // Kein sauberes Fenster (Original-Geometrie passt nicht): trotzdem ein Tempo vorgeben – das Tempo mit dem
  // weichsten Aufprall – statt das Auto frei beschleunigen zu lassen (mit Vmax ~580 km/h flog es sonst weit
  // über die Landung hinaus). Ohne jede Landung: null wie bisher.
  if (!ok.length) return fb ? { vmin: Math.max(8, fb.v - 1), vmax: fb.v + 1, vbest: fb.v, fallback: true } : null;
  // längstes zusammenhängendes Fenster; Ziel im unteren Drittel (sicher erreichbar, kurzer Flug)
  let best = [ok[0]], cur = [ok[0]];
  for (let k = 1; k < ok.length; k++) {
    if (ok[k] - ok[k - 1] < 0.3) cur.push(ok[k]); else cur = [ok[k]];
    if (cur.length > best.length) best = cur.slice();
  }
  const vmin = best[0], vmax = best[best.length - 1];
  return { vmin, vmax, vbest: Math.min(vmax, vmin + Math.max(1.2, 0.3 * (vmax - vmin))) };
}

// Grenzen und Reserven des Tempo-Profils (n14: als Konstanten gesammelt, Analyse/Abstimmung in tools/fahr_analyse.mjs)
//   res      Anteil der Querhaftung, den das Profil in Kurven nutzt (Reserve für den Regler)
//   resPre   dasselbe auf den preLen m vor Looping/Röhre/Korkenzieher/Engstelle (ruhig und mittig einfahren)
//   aero     Anteil des Abtriebs, den das Profil in Kurven einrechnet
//   nmin     kleinster Anpressdruck an Kuppen (g), nmax größte Last (g, Loopings/Senken)
//   brake    Plan-Bremsverzögerung je Reifen-mu (m/s², wächst mit Aero-Last, car.js brakeDecel)
//   vNarrow  Höchsttempo an Engstellen (m/s), rollMax größte Rollrate der Fahrbahn (rad/s, Korkenzieher)
//   crestAero  Abtrieb auch an Kuppen/in Senken einrechnen (er drückt das Auto auf die Fahrbahn), bis n13 nicht
//   brakeCircle  > 0: Bremsplan aus dem Haftungskreis – dieser Anteil der Längshaftung, die die Kurve an der Stelle
//                übrig lässt (Reibung 1,25·mu·Anpressdruck inkl. Abtrieb) + Luftwiderstand; 0 = alter Pauschalwert brake
//   jumpSafe   > 0: Schanzen-Anlauf auf das höchste sicher landende Tempo (Fenster-Obergrenze minus jumpSafe m/s)
//              statt vbest (unteres Drittel des Fensters)
// Bis n13 (Vergleich ?grip=1): res 0,82, vNarrow 15,5, crestAero aus, brakeCircle 0 (Pauschalwert brake), jumpSafe 0.
// n14 (29.09.2026, Messung in FAHRGEFUEHL_BERICHT.md): Kurven 76 % der jetzt höheren Haftung (Bots wie Menschen
// behalten Reserve), Engstellen 30 m/s (Querfehler in der Slalom-Gasse wächst mit dem Tempo nicht), Kuppen mit
// Abtrieb, Bremsplan aus dem Haftungskreis (70 %), Schanze 1,5 m/s unter der Fenster-Obergrenze (Landung bleibt auf der Rampe).
export const PROF = GRIP_ALT
  ? { res: 0.82, resPre: 0.65, preLen: 25, aero: 0.8, nmin: 0.45, nmax: 6.2, brake: 8, vNarrow: 15.5, rollMax: 3.2, crestAero: false, brakeCircle: 0, jumpSafe: 0 }
  : { res: 0.76, resPre: 0.65, preLen: 25, aero: 0.8, nmin: 0.45, nmax: 6.2, brake: 8, vNarrow: 30, rollMax: 3.2, crestAero: true, brakeCircle: 0.7, jumpSafe: 1.5 };

export function computeProfile(L, opts = {}) {
  const n = L.n;
  // Querhaftung = Belag × Reifen (def.mu) × Reserve PROF.res (bis 27.09.2026 Reifen fest 1,0)
  const muBase = opts.mu ?? 1.25 * (opts.def ?? CAR_DEF).mu * PROF.res;
  const muAt = (i) => (L.grip ? L.grip[i] * (opts.def ?? CAR_DEF).mu * PROF.res : muBase);
  const Nmin = opts.nmin ?? PROF.nmin * G;
  const Nmax = opts.nmax ?? PROF.nmax * G;
  const def = opts.def ?? CAR_DEF;
  // Höchsttempo aus der Abstimmung (bis 27.09.2026 fest 68 m/s ≈ 245 km/h; neu ≈ 155 m/s ≈ 560 km/h)
  const vTop = opts.vtop ?? topSpeed(def);
  // Abtrieb hilft in schnellen Kurven (Anteil PROF.aero als Reserve; wirkt nur mit Radkontakt)
  const dAero = PROF.aero * def.downK / def.mass;
  const vmax = new Float32Array(n).fill(vTop);
  const vmin = new Float32Array(n);
  const kA = new Float32Array(n), kC = new Float32Array(n), tw = new Float32Array(n);
  const closed = L.closed;
  const idx = (i) => closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
  // Krümmung über ±~2.5 m Basis
  for (let i = 0; i < n; i++) {
    let a = i, b = i;
    // Fenster nicht über Luftstrecken ziehen (Schanzenlippe/Landung sonst als scharfe Kuppe gewertet)
    while (b < i + 40 && Math.abs(sAt(L, idx(b + 1), i, closed) - L.s[i]) < 2.5 && (closed || b < n - 1) && !L.air[idx(b + 1)]) b++;
    while (a > i - 40 && Math.abs(L.s[i] - sAt(L, idx(a - 1), i, closed)) < 2.5 && (closed || a > 0) && !L.air[idx(a - 1)]) a--;
    if (a === b) continue;
    const ia = idx(a), ib = idx(b);
    const ds = sAt(L, ib, i, closed) - sAt(L, ia, i, closed);
    if (ds < 0.3) continue;
    const kx = (L.tx[ib] - L.tx[ia]) / ds, ky = (L.ty[ib] - L.ty[ia]) / ds, kz = (L.tz[ib] - L.tz[ia]) / ds;
    kA[i] = kx * L.bx[i] + ky * L.by[i] + kz * L.bz[i];
    kC[i] = kx * L.nx[i] + ky * L.ny[i] + kz * L.nz[i];
    // Verwindung (Drehung der Fahrbahn um die Fahrtrichtung, rad/m): Korkenzieher, Steilkurven-Übergänge
    tw[i] = ((L.nx[ib] - L.nx[ia]) * L.bx[i] + (L.ny[ib] - L.ny[ia]) * L.by[i] + (L.nz[ib] - L.nz[ia]) * L.bz[i]) / ds;
  }
  // Anfahrt zu Looping/Röhre/Korkenzieher (25 m davor): Kurven mit mehr Haftungs-Reserve (65 % statt 82 %),
  // damit das Auto nicht am Haftungslimit – und damit seitlich versetzt – in den Stunt fährt. Das alte Auto
  // kam dort wegen der schwachen Beschleunigung ohnehin langsamer an (27.09.2026).
  // Dasselbe vor Engstellen (Slalom, siehe V_NARROW).
  const pre = new Uint8Array(n);
  const narrow = (i) => L.lo && L.hi && L.hi[i] - L.lo[i] < 1 && !L.air[i];
  const stuntAt = (i) => L.loop[i] || L.tube[i] || narrow(i);
  for (let i = 1; i < n; i++) {
    if (stuntAt(i) && !stuntAt(i - 1)) {
      for (let k = i - 1; k >= 0 && L.s[i] - L.s[k] < PROF.preLen && !stuntAt(k); k--) pre[k] = 1;
    }
  }
  // Diagnose (opts.diag, nur Analyse-Werkzeuge): je Stelle die Einzelgrenzen (m/s), damit sich Bremszeit und
  // Zeitverlust einer Ursache zuordnen lassen (tools/fahr_analyse.mjs). Ändert nichts am Profil.
  const D = opts.diag ? { lim: {} } : null;
  const dl = (k) => D.lim[k] || (D.lim[k] = new Float32Array(n).fill(Infinity));
  for (let i = 0; i < n; i++) {
    if (L.air[i]) continue;
    const A = kA[i], C = kC[i], gB = G * L.by[i], gN = G * L.ny[i], mu = muAt(i) * (pre[i] ? PROF.resPre / PROF.res : 1);
    let lo = 0, hi = vTop * vTop;
    const cons = (c, r, k) => { // c*x <= r
      if (Math.abs(c) < 1e-7) { return; }
      if (c > 0) { hi = Math.min(hi, r / c); if (D) dl(k)[i] = Math.min(dl(k)[i], Math.sqrt(Math.max(0, r / c))); } else lo = Math.max(lo, r / c);
    };
    const kc = pre[i] ? 'vorStunt' : 'kurve';
    cons(A - mu * (C + dAero), mu * gN - gB, kc);
    cons(-A - mu * (C + dAero), mu * gN + gB, kc);
    // Anpressdruck (x*C + gN, mit PROF.crestAero samt Abtrieb) zwischen Nmin und Nmax
    const Cn = PROF.crestAero ? C + dAero : C;
    cons(-Cn, gN - Nmin, 'kuppe');           // x*Cn + gN >= Nmin
    cons(Cn, Nmax - gN, 'last');            // x*Cn + gN <= Nmax
    vmax[i] = Math.sqrt(Math.max(0, hi));
    if (D && pre[i]) {
      // Kurvengrenze mit der normalen Reserve: so lässt sich der Anteil der Stunt-Anfahrt getrennt ausweisen
      const m0 = muAt(i);
      for (const [c, r] of [[A - m0 * (C + dAero), m0 * gN - gB], [-A - m0 * (C + dAero), m0 * gN + gB]]) if (c > 1e-7) dl('kurve')[i] = Math.min(dl('kurve')[i], Math.sqrt(Math.max(0, r / c)));
    }
    // Rollrate begrenzen (v·Verwindung ≤ ROLL_MAX): im Korkenzieher hebt das Auto sonst ab. Das alte Auto
    // kam dort nie über ~50 km/h (schwache Beschleunigung) – das neue erreicht das Profil-Tempo wirklich.
    if (Math.abs(tw[i]) > 1e-3) { vmax[i] = Math.min(vmax[i], PROF.rollMax / Math.abs(tw[i])); if (D) dl('rollrate')[i] = PROF.rollMax / Math.abs(tw[i]); }
    vmin[i] = Math.sqrt(Math.max(0, lo));
    if (vmin[i] > vmax[i]) { vmax[i] = vmin[i]; if (D) dl('mindest')[i] = vmin[i]; }
  }
  // Engstellen (Fahrgasse < 1 m breit, z. B. Slalom-Blöcke: das Auto passt nur gerade ausgerichtet durch):
  // höchstens V_NARROW, ab 20 m davor – so kommt das Auto ruhig und mittig an. Mit dem alten Auto ergab sich
  // das von selbst (~65 km/h); das schnellere Auto kam aus einer Schikane mit 0,7 m Versatz an (27.09.2026).
  // Nicht in Loopings/Röhren/Luft und nicht im Sprung-Anlauf (dort gilt das Sprung-Fenster).
  if (L.lo && L.hi) {
    const skip = new Uint8Array(n);
    for (const j of opts.jumps || []) for (let i = j.lipIdx; i >= 0 && L.s[j.lipIdx] - L.s[i] < 30; i--) skip[i] = 1;
    for (let i = 0; i < n; i++) {
      if (L.hi[i] - L.lo[i] >= 1 || L.loop[i] || L.tube[i] || L.air[i] || skip[i]) continue;
      for (let k = i; k >= 0 && L.s[i] - L.s[k] < 20; k--) if (!skip[k]) { vmax[k] = Math.min(vmax[k], PROF.vNarrow); if (D) dl('eng')[k] = PROF.vNarrow; }
    }
  }
  // Sprünge: Tempo an der Lippe festlegen
  const jw = jumpWindow();
  const jumpsIdx = opts.jumps || [];
  const windows = [];
  for (const j of jumpsIdx) {
    const li = j.lipIdx;
    const w = j.gen ? genericJumpWindow(L, li, j.landIdx) : jw;
    windows.push(w);
    if (!w) continue;
    // Anlauf bis zur Lippe: Zieltempo vbest, Mindesttempo vmin
    // Anlauf: Standard-Schanze in Auto-Maßstab (JUMP_T), Import-Rampen über ein ganzes Feld
    const runup = j.gen ? TILE : JUMP_T;
    // Ziel an der Lippe: vbest (unteres Drittel des Fensters) bzw. mit PROF.jumpSafe das höchste Tempo, das noch
    // sicher im Fenster landet (Obergrenze minus Reserve für den Regler); Not-Fenster ohne sauberen Bereich: vbest
    const vAim = PROF.jumpSafe > 0 && !w.fallback ? Math.max(w.vbest, w.vmax - PROF.jumpSafe) - 0.6 : w.vbest;
    w.vaim = vAim + 0.6;
    for (let i = li; i >= 0 && L.s[li] - L.s[i] < runup; i--) { vmax[i] = Math.min(vmax[i], vAim + 0.6); vmin[i] = Math.max(vmin[i], w.vmin + 0.6); if (D) dl('schanze')[i] = vAim + 0.6; }
    for (let i = li + 1; i < n && L.air[i]; i++) { vmax[i] = Math.max(vAim + 0.6, 10); vmin[i] = 0; if (D) dl('luft')[i] = vmax[i]; }
  }
  const aBrake = opts.abrake ?? PROF.brake * def.mu;   // Grundwert wächst mit der Reifenhaftung (alt: mu 1 → 8)
  const { vt, vf, infeasible } = speedPasses(L, vmax, vmin, { kA, kC, def, dAero, aBrake, startIdx: opts.startIdx ?? 0, v0: opts.v0 ?? 0 });
  return { vmax, vmin, vt, vf, kA, kC, jump: jw, windows, infeasible, ...(D ? { diag: { ...D, vTop, aBrake, dAero, def } } : {}) };
}

// Rückwärts- und Vorwärtslauf auf vmax (eine Rechnung für Spiel und Analyse-Werkzeug, tools/fahr_analyse.mjs).
// ctx: { kA, kC, def, dAero, aBrake, startIdx, v0 } → { vt, vf, infeasible }
export function speedPasses(L, vmax, vmin, ctx) {
  const n = L.n, closed = L.closed, { kA, kC, def, dAero, aBrake } = ctx;
  const idx = (i) => closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
  // Bremsplan aus dem Haftungskreis (PROF.brakeCircle, n14): Reibung = Belag·mu·Anpressdruck (Schwerkraft quer zur
  // Fahrbahn + Kuppe/Senke + Abtrieb), davon braucht die Kurve den Querteil |A·v² + g_quer|; der Rest steht zum Bremsen
  // bereit – höchstens so viel, wie die Bremsanlage schafft (def.brake × Aero-Last; unter hoher Last im Looping
  // begrenzt sie, nicht die Reibung) –, davon der Anteil brakeCircle. Dazu Luft- und Rollwiderstand und die
  // Steigung (bergauf hilft, bergab nicht). So bremst der Plan auf der Geraden fast so hart, wie das Auto kann,
  // und beim Einlenken entsprechend weniger (statt pauschal ~63 % der Vollbremsung).
  const planBrake = (i, v) => {
    const x = v * v, muF = (L.grip ? L.grip[i] : 1.25) * def.mu;
    const N = Math.max(0, G * L.ny[i] + x * (kC[i] + dAero));
    const lat = Math.abs(x * kA[i] + G * L.by[i]);
    const lon = Math.min(Math.sqrt(Math.max(0, muF * muF * N * N - lat * lat)), def.brake * aeroLoad(def, v) / def.mass);
    return Math.max(0.5, PROF.brakeCircle * lon + def.dragK * x / def.mass + 0.015 * G + G * L.ty[i]);
  };
  // Rückwärtslauf (Bremsen). Verzögerung wächst mit dem Tempo (Abtrieb + Luftwiderstand, car.js brakeDecel);
  // bis 27.09.2026 fest 8 m/s² (≈ 58 % der gemessenen Vollbremsung, Reserve für den Regler).
  const vt = Float32Array.from(vmax);
  const passes = closed ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let k = n - 2 + (closed ? 1 : 0); k >= 0; k--) {
      const i = idx(k), j = idx(k + 1);
      if (L.air[i]) continue;
      const ds = Math.max(0, sAt(L, j, i, closed) - L.s[i]);
      // Bremsverzögerung je Belag (Eis/Schotter bremsen schlechter; Asphalt = aBrake)
      const ab0 = L.grip ? Math.min(aBrake, aBrake * L.grip[i] / 1.25) : aBrake;
      // am (langsameren) Ende des Schritts → vorsichtig; mit PROF.brakeCircle aus dem Haftungskreis
      const ab = PROF.brakeCircle > 0 ? planBrake(i, vt[j]) : brakeDecel(def, vt[j], ab0);
      const lim = Math.sqrt(vt[j] * vt[j] + 2 * ab * ds);
      if (vt[i] > lim) vt[i] = lim;
    }
  }
  // Vorwärtslauf (erreichbares Tempo, nur Info + Machbarkeit)
  const vf = new Float32Array(n);
  const start = ctx.startIdx ?? 0;
  vf[start] = ctx.v0 ?? 0;
  const infeasible = [];
  const loopsN = closed ? n : n - start;
  for (let k = 0; k < loopsN - 1; k++) {
    const i = idx(start + k), j = idx(start + k + 1);
    const ds = Math.max(0, sAt(L, j, i, closed) - L.s[i]);
    const v = Math.max(vf[i], 1);
    const slope = L.ty[i];
    let a = driveAccel(def, v) - G * slope;
    if (L.air[i]) a = -G * slope * 0.2;
    let v2 = Math.sqrt(Math.max(0, vf[i] * vf[i] + 2 * a * ds));
    v2 = Math.min(v2, vt[j]);
    vf[j] = v2;
    if (vmin[j] > 0 && v2 + 0.5 < vmin[j] && !L.air[j]) infeasible.push(j);
  }
  return { vt, vf, infeasible };
}

// Bogenlänge von j relativ zu i auf geschlossenen Linien (nächste Umrundung)
function sAt(L, j, i, closed) {
  if (!closed) return L.s[j];
  let s = L.s[j];
  const half = L.total / 2;
  while (s - L.s[i] > half) s -= L.total;
  while (L.s[i] - s > half) s += L.total;
  return s;
}

// Pedal-Plan für die farbige Ideallinie (n14, Forza-Farben: grün = Gas, gelb = Gas weg/rollen, rot = bremsen), aus dem
// Tempo-Profil statt der früheren Faustregel („rot, wenn vt in den nächsten 90 m um > 6 m/s fällt“ – das färbte weit
// vor dem Bremspunkt). Je Stelle die Soll-Beschleunigung längs des Plans a = d(v²/2)/ds (über ~4 m) gegen das
// Ausrollen des Autos (Luft- und Rollwiderstand, Hangabtrieb): stärker verzögern als Ausrollen = bremsen (Stärke =
// nötiger Bremsdruck), bis dahin = Gas weg, sonst Gas. Stücke unter minLen m werden dem Nachbarn zugeschlagen.
// Liefert { cls: Uint8Array (0 Gas, 1 Gas weg, 2 bremsen, 3 Luft), brake: Float32Array (0 … 1) }.
export function pedalPlan(L, prof, opts = {}) {
  // Plan-Tempo = was das Auto tatsächlich fährt: Brems-Grenze vt, aber erst, wenn es sie beim Beschleunigen erreicht
  // (prof.vf, Vorwärtslauf ab dem Start) – nach einer Kurve beschleunigt es noch, auch wenn vt schon wieder fällt
  const n = L.n, def = opts.def ?? CAR_DEF, vt = prof.vf && prof.vf.some((x) => x > 0) ? prof.vf : prof.vt, minLen = opts.minLen ?? 3;
  const cls = new Uint8Array(n), brake = new Float32Array(n);
  const nextI = (i) => (i + 1 >= n ? (L.closed ? 1 : n - 1) : i + 1);
  for (let i = 0; i < n; i++) {
    if (L.air[i]) { cls[i] = 3; continue; }
    let j = i, ds = 0;
    for (let c = 0; c < 40 && ds < 4; c++) { const k = nextI(j); if (k === j) break; const d = L.s[k] - L.s[j]; ds += d > 0 ? d : L.s[1] || 0; j = k; }
    if (ds < 0.2 || L.air[j]) { cls[i] = 0; continue; }
    const v = Math.max(1, vt[i]), a = (vt[j] * vt[j] - vt[i] * vt[i]) / (2 * ds);
    const aero = aeroLoad(def, v);
    const coast = -(def.dragK * v * v / def.mass + 0.015 * G * aero) - G * L.ty[i];
    if (a < coast - 0.3) { cls[i] = 2; brake[i] = Math.min(1, (coast - a) * def.mass / (def.brake * aero)); }
    else if (a < -0.3) cls[i] = 1;
    else cls[i] = 0;
  }
  // kurze Stücke (< minLen m) glätten: dem vorigen Stück zuschlagen (kein Flackern durch kleine Profil-Wellen)
  let a0 = 0;
  for (let i = 1; i <= n; i++) {
    if (i < n && cls[i] === cls[a0]) continue;
    const len = L.s[Math.min(n - 1, i - 1)] - L.s[a0];
    if (len < minLen && a0 > 0 && cls[a0] !== 3 && cls[a0 - 1] !== 3) for (let k = a0; k < i; k++) { cls[k] = cls[a0 - 1]; brake[k] = cls[k] === 2 ? brake[a0 - 1] : 0; }
    a0 = i;
  }
  return { cls, brake };
}
