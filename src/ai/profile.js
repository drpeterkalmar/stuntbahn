// Ideallinie + Tempo-Profil entlang der Fahrlinie.
// Grenzen aus der Geometrie: Querhaftung (inkl. Überhöhung), Mindest-Anpressdruck im Looping,
// maximale Last, Sprung-Fenster (ballistisch gelöst). Danach Brems-Rückwärtslauf.
import { JUMP, landY } from '../track/pieces.js';
import { TILE } from '../track/defs.js';

const G = 9.81;

export function jumpWindow() {
  // Tempo-Fenster für die Standard-Schanze (Lippe bei f=T, Landung ab f=2T)
  const th = JUMP.lipDeg * Math.PI / 180, lipY = JUMP.lipH;
  // Flugbahn der Radaufstandspunkte ab der Lippe (x = Abstand hinter der Lippe)
  const traj = (v, x) => lipY + x * Math.tan(th) - G * x * x / (2 * v * v * Math.cos(th) ** 2);
  const landAt = (v) => {
    for (let x = 0.2; x < 90; x += 0.1) {
      const fl = x - TILE;             // Position relativ zur Vorderkante der Landung
      const y = traj(v, x);
      if (fl < 0) { if (y < 0) return { fail: 'kurz' }; continue; }
      if (fl < 0.6 && y < JUMP.landH + 0.55) return { fail: 'Kante' };
      if (y <= landY(fl)) return { fl };
    }
    return { fl: 90 };
  };
  let vmin = 0, vmax = 0, vbest = 0, bestErr = 1e9;
  const target = JUMP.landLen * 0.45;
  for (let v = 12; v <= 40; v += 0.1) {
    const r = landAt(v);
    const ok = !r.fail && r.fl > 1.5 && r.fl < JUMP.landLen + 8;
    if (ok && !vmin) vmin = v;
    if (ok) vmax = v;
    if (ok && Math.abs(r.fl - target) < bestErr) { bestErr = Math.abs(r.fl - target); vbest = v; }
  }
  return { vmin, vmax, vbest };
}

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
    if (Math.abs(lat) > 6) break;               // Linie biegt ab: weiter hinten keine Landung
    pts.push({ x, y: L.py[i], i });
    if (x > 140) break;
  }
  if (pts.length < 3) return null;
  const ok = [];
  for (let v = 8; v <= 48; v += 0.25) {
    const vx = v * Math.cos(th), vy0 = v * Math.sin(th);
    const traj = (x) => p0y + x * Math.tan(th) - G * x * x / (2 * vx * vx);
    // Vorder- und Hinterachse (2,7 m dahinter) müssen die Landekante sicher überfliegen
    if (traj(pts[0].x) < pts[0].y + 0.35 || traj(pts[0].x - 2.7) < pts[0].y + 0.1) continue;
    let hit = -1;
    for (let k = 1; k < pts.length; k++) if (traj(pts[k].x) <= pts[k].y + 0.05) { hit = k; break; }
    if (hit < 1) continue;
    const a = pts[hit - 1], b = pts[hit];
    const sl = (b.y - a.y) / Math.max(0.05, b.x - a.x);
    const t = b.x / vx, vy = vy0 - G * t;
    const imp = (vy - sl * vx) / Math.sqrt(1 + sl * sl);
    const along = b.x - pts[0].x;
    if (imp < -8 || along < 3) continue;
    ok.push(v);
  }
  if (!ok.length) return null;
  // längstes zusammenhängendes Fenster; Ziel im unteren Drittel (sicher erreichbar, kurzer Flug)
  let best = [ok[0]], cur = [ok[0]];
  for (let k = 1; k < ok.length; k++) {
    if (ok[k] - ok[k - 1] < 0.3) cur.push(ok[k]); else cur = [ok[k]];
    if (cur.length > best.length) best = cur.slice();
  }
  const vmin = best[0], vmax = best[best.length - 1];
  return { vmin, vmax, vbest: Math.min(vmax, vmin + Math.max(1.2, 0.3 * (vmax - vmin))) };
}

export function computeProfile(L, opts = {}) {
  const n = L.n;
  const muBase = opts.mu ?? 1.25 * 0.82;
  const muAt = (i) => (L.grip ? L.grip[i] * 0.82 : muBase);
  const Nmin = opts.nmin ?? 0.45 * G;
  const Nmax = opts.nmax ?? 6.2 * G;
  const vTop = opts.vtop ?? 68;
  const vmax = new Float32Array(n).fill(vTop);
  const vmin = new Float32Array(n);
  const kA = new Float32Array(n), kC = new Float32Array(n);
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
  }
  for (let i = 0; i < n; i++) {
    if (L.air[i]) continue;
    const A = kA[i], C = kC[i], gB = G * L.by[i], gN = G * L.ny[i], mu = muAt(i);
    let lo = 0, hi = vTop * vTop;
    const cons = (c, r) => { // c*x <= r
      if (Math.abs(c) < 1e-7) { return; }
      if (c > 0) hi = Math.min(hi, r / c); else lo = Math.max(lo, r / c);
    };
    cons(A - mu * C, mu * gN - gB);
    cons(-A - mu * C, mu * gN + gB);
    cons(-C, gN - Nmin);           // x*C + gN >= Nmin
    cons(C, Nmax - gN);            // x*C + gN <= Nmax
    vmax[i] = Math.sqrt(Math.max(0, hi));
    vmin[i] = Math.sqrt(Math.max(0, lo));
    if (vmin[i] > vmax[i]) vmax[i] = vmin[i];
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
    for (let i = li; i >= 0 && L.s[li] - L.s[i] < TILE; i--) { vmax[i] = Math.min(vmax[i], w.vbest + 0.6); vmin[i] = Math.max(vmin[i], w.vmin + 0.6); }
    for (let i = li + 1; i < n && L.air[i]; i++) { vmax[i] = Math.max(w.vbest, 10); vmin[i] = 0; }
  }
  // Rückwärtslauf (Bremsen)
  const aBrake = opts.abrake ?? 8.0;
  const vt = Float32Array.from(vmax);
  const passes = closed ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let k = n - 2 + (closed ? 1 : 0); k >= 0; k--) {
      const i = idx(k), j = idx(k + 1);
      if (L.air[i]) continue;
      const ds = Math.max(0, sAt(L, j, i, closed) - L.s[i]);
      // Bremsverzögerung je Belag (Eis/Schotter bremsen schlechter; Asphalt = aBrake)
      const ab = L.grip ? Math.min(aBrake, aBrake * L.grip[i] / 1.25) : aBrake;
      const lim = Math.sqrt(vt[j] * vt[j] + 2 * ab * ds);
      if (vt[i] > lim) vt[i] = lim;
    }
  }
  // Vorwärtslauf (erreichbares Tempo, nur Info + Machbarkeit)
  const vf = new Float32Array(n);
  const start = opts.startIdx ?? 0;
  vf[start] = opts.v0 ?? 0;
  let infeasible = [];
  const loopsN = closed ? n : n - start;
  for (let k = 0; k < loopsN - 1; k++) {
    const i = idx(start + k), j = idx(start + k + 1);
    const ds = Math.max(0, sAt(L, j, i, closed) - L.s[i]);
    const v = Math.max(vf[i], 1);
    const slope = L.ty[i];
    let a = Math.min(15500, 240000 / v) / 1300 - 0.43 * v * v / 1300 - G * slope;
    if (L.air[i]) a = -G * slope * 0.2;
    let v2 = Math.sqrt(Math.max(0, vf[i] * vf[i] + 2 * a * ds));
    v2 = Math.min(v2, vt[j]);
    vf[j] = v2;
    if (vmin[j] > 0 && v2 + 0.5 < vmin[j] && !L.air[j]) infeasible.push(j);
  }
  return { vmax, vmin, vt, vf, kA, kC, jump: jw, windows, infeasible };
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
