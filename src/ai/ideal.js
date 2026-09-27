// Ideallinie: seitliche Versätze zur Basislinie, die die Krümmung minimieren (außen-innen-außen),
// begrenzt durch die befahrbare Breite je Linienpunkt (lo/hi, Sicherheitsabstand schon enthalten).
// Ergebnis ist eine eigene Linie mit gleichem Index-Raster wie die Basislinie (Tempo-Profil und Autopilot
// rechnen darauf). I.apex = Scheitelpunkte (Linie am inneren Rand einer Kurve) – für die Anzeige.
//
// Löser (seit 27.09.2026, vorher lokale bi-Laplace-Relaxation mit 1400 Schritten, die nicht konvergierte
// und am Scheitel nur 8–60 % der inneren Fahrbahnhälfte nutzte): das Minimal-Krümmungs-QP wird exakt
// gelöst (Active-Set + Band-LDLᵀ), grob nach fein – erst auf einem 24-m-Raster, dessen Lösung liefert
// Startwert und Randmenge für 12 → 6 → 3 → 1,5 m. So braucht jede Stufe nur wenige Durchgänge.

const STEP = 1.5;
// Toleranzen: Randverletzung (m) und Kraft, ab der ein Randpunkt frei wird. Auf Geraden liegt die Linie oft
// genau am Rand ohne echte Kraft (entartet) – ohne Schwelle pendeln solche Punkte endlos rein und raus.
const EPS_X = 1e-5, EPS_R = 1e-6;

// Basislinie gleichmäßig im Abstand ~h abtasten: Punkte, Querrichtung, Grenzen
function sampleLevel(L, h) {
  const n = L.n, closed = L.closed, total = L.total;
  const m = Math.max(8, Math.round(total / h));
  const ds = total / m;
  const cnt = closed ? m : m + 1;
  const P = new Float64Array(cnt * 3), B = new Float64Array(cnt * 3), lo = new Float64Array(cnt), hi = new Float64Array(cnt);
  let j = 0;
  for (let k = 0; k < cnt; k++) {
    const s = Math.min(total, k * ds);
    while (j < n - 2 && L.s[j + 1] < s) j++;
    const s0 = L.s[j], s1 = L.s[j + 1];
    const t = s1 > s0 ? Math.max(0, Math.min(1, (s - s0) / (s1 - s0))) : 0;
    const a = j, b = j + 1;
    P[k * 3] = L.px[a] + (L.px[b] - L.px[a]) * t; P[k * 3 + 1] = L.py[a] + (L.py[b] - L.py[a]) * t; P[k * 3 + 2] = L.pz[a] + (L.pz[b] - L.pz[a]) * t;
    const bx = L.bx[a] + (L.bx[b] - L.bx[a]) * t, by = L.by[a] + (L.by[b] - L.by[a]) * t, bz = L.bz[a] + (L.bz[b] - L.bz[a]) * t;
    const bl = Math.hypot(bx, by, bz) || 1;
    B[k * 3] = bx / bl; B[k * 3 + 1] = by / bl; B[k * 3 + 2] = bz / bl;
    // engere Grenze der beiden Nachbarn
    lo[k] = Math.max(L.lo[a], L.lo[b]); hi[k] = Math.min(L.hi[a], L.hi[b]);
    if (L.air[a] || L.air[b]) { lo[k] = hi[k] = 0; }
    if (lo[k] > hi[k]) lo[k] = hi[k] = (lo[k] + hi[k]) / 2;
  }
  // offene Linien: Enden fest auf der Basislinie
  if (!closed) for (const k of [0, 1, cnt - 2, cnt - 1]) lo[k] = hi[k] = 0;
  return { P, B, lo, hi, cnt, ds, closed };
}

// Versatz an Bogenlänge s (Basislinie) aus einer Stufe linear interpolieren
function offAt(lv, o, s) {
  const { cnt, ds, closed } = lv;
  const f = Math.max(0, Math.min(cnt - 1 + (closed ? 1 : 0), s / ds));
  const k0 = Math.floor(f), t = f - k0;
  const i0 = closed ? k0 % cnt : Math.min(cnt - 1, k0), i1 = closed ? (k0 + 1) % cnt : Math.min(cnt - 1, k0 + 1);
  return o[i0] + (o[i1] - o[i0]) * t;
}

// Stunt-Abschnitte, in denen die Linie auf der Bausteinspur bleibt (±KEEP): Loopings, Röhren,
// Korkenzieher (Rolle und Wendel), Schanzen-Anlauf und -Landung. Dort bestimmt der Baustein die Spur
// (Looping-Spur, Röhrenmitte, gerader Absprung) – Kurvenschneiden wäre gefährlich. Dazu der Start (Auto
// steht in der Mitte) und überhöhte Fahrbahn (Steilkurven/-straßen und ihre Übergänge, ±KEEP_BANK): am
// unteren Rand rutscht ein langsameres Auto hinunter, am verwundenen Übergang hebt es am Rand ab.
const KEEP = 0.3, KEEP_START = 0.5, KEEP_BANK = 1.2;
// Zusätzlicher Abstand zum Fahrbahnrand für die Ideallinie (m): Die Baustein-Grenzen lassen 1,3 m zwischen
// Linie und Kante (Rad-Außenkante ~0,4 m vor der Kante). Der Autopilot weicht in Kurven um bis zu ~0,5 m
// von der Linie ab (99. Perzentil, Korpus) – ohne Zuschlag rutschen auf Hochstraßen Räder über die Kante.
const EDGE_EXTRA = 0.5;
const KEEP_TYPES = new Set(['loop', 'tube', 'tr_loop', 'tr_corklr', 'tr_corkud', 'tr_pipe', 'tr_pipeT', 'tr_pobst']);
export function stuntBounds(L, track) {
  const n = L.n, lo = Float32Array.from(L.lo), hi = Float32Array.from(L.hi);
  const lim = new Float32Array(n).fill(Infinity);
  const zone = (s0, s1, w) => { for (let i = 0; i < n; i++) if (L.s[i] >= s0 && L.s[i] <= s1) lim[i] = Math.min(lim[i], w); };
  for (let i = 0; i < n; i++) {
    const pc = track && track.pieces[L.piece[i]];
    if (L.loop[i] || L.tube[i] || (pc && KEEP_TYPES.has(pc.type))) lim[i] = KEEP;
  }
  // überhöht: Querneigung > ~7° irgendwo im Umkreis von 6 m (auch die Übergänge)
  const bank = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (Math.abs(L.by[i]) > 0.12 && !L.loop[i] && !L.tube[i] && !L.air[i]) bank[i] = 1;
  for (let i = 0, j0 = 0, j1 = 0; i < n; i++) {
    while (L.s[j0] < L.s[i] - 6) j0++;
    while (j1 < n - 1 && L.s[j1 + 1] <= L.s[i] + 6) j1++;
    for (let j = j0; j <= j1; j++) if (bank[j]) { lim[i] = Math.min(lim[i], KEEP_BANK); break; }
  }
  if (track) {
    // Anlauf 30 m, Landung bis 30 m hinter der Lücke (das Auto setzt oft erst weit hinten auf der Rampe auf)
    for (const j of track.jumps || []) if (j.lipIdx != null) zone(L.s[j.lipIdx] - 30, L.s[Math.min(n - 1, j.landIdx)] + 30, KEEP);
    if (track.start) { const s0 = L.s[track.start.idx]; zone(s0 - 8, s0 + 8, KEEP_START); if (L.closed) { zone(s0 - 8 + L.total, s0 + 8 + L.total, KEEP_START); zone(s0 - 8 - L.total, s0 + 8 - L.total, KEEP_START); } }
  }
  for (let i = 0; i < n; i++) {
    // Randzuschlag nur, wo genug Breite bleibt (schmale Stellen haben eigene, enge Grenzen)
    if (hi[i] - lo[i] > 2 * EDGE_EXTRA + 1) { lo[i] += EDGE_EXTRA; hi[i] -= EDGE_EXTRA; }
    if (lim[i] === Infinity) continue;
    let a = Math.max(lo[i], -lim[i]), b = Math.min(hi[i], lim[i]);
    if (a > b) a = b = Math.max(lo[i], Math.min(hi[i], 0));
    lo[i] = a; hi[i] = b;
  }
  return { lo, hi };
}

export function computeIdeal(L, opts = {}) {
  const n = L.n;
  // Grenzen: Baustein-Grenzen, in Stunt-Abschnitten auf die Bausteinspur verengt (opts.track)
  const bd = stuntBounds(L, opts.track);
  const Lb = { ...L, lo: bd.lo, hi: bd.hi };
  // Stufen 24 → 12 → 6 → 3 → 1,5 m (gröbste Stufe mit mindestens ~40 Punkten)
  const hs = [];
  for (let h = STEP; h <= 24 + 1e-9 && (h === STEP || L.total / h >= 40); h *= 2) hs.unshift(h);
  let prev = null, o = null;
  const stats = opts.stats ? (opts.stats.levels = []) : null;
  for (const h of hs) {
    const lv = sampleLevel(Lb, h);
    let init = null;
    if (prev) { init = new Float64Array(lv.cnt); for (let k = 0; k < lv.cnt; k++) init[k] = offAt(prev.lv, prev.o, k * lv.ds); }
    const st = stats ? {} : null;
    o = solveMinCurv(lv.P, lv.B, lv.lo, lv.hi, lv.closed, { init, stats: st || undefined });
    if (stats) stats.push({ h, n: lv.cnt, ...st });
    prev = { lv, o };
  }
  // Versätze zurück auf die Original-Samples
  const off = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = offAt(prev.lv, o, L.s[i]);
    v = Math.max(bd.lo[i], Math.min(bd.hi[i], v));
    if (L.air[i]) v = 0;
    off[i] = v;
  }
  const I = makeLine(L, off);
  I.apex = findApexes(L, off, bd);
  return I;
}

// Scheitelpunkte: je Kurve (Basislinie dreht sich, keine Luft/Looping/Röhre) die Stelle, an der die Linie
// der inneren Grenze (bnd, mit Sicherheitsabstand) am nächsten kommt – nur wenn sie sie bis auf 25 cm
// erreicht. Liefert [{ i, side }] mit side = +1 (innen = +B) bzw. −1.
export function findApexes(L, off, bnd = L) {
  const n = L.n, W = 6, out = [];
  const kap = new Float32Array(n);
  for (let i = W; i < n - W; i++) {
    const ds = L.s[i + W] - L.s[i - W] || 1;
    kap[i] = ((L.tx[i + W] - L.tx[i - W]) * L.bx[i] + (L.ty[i + W] - L.ty[i - W]) * L.by[i] + (L.tz[i + W] - L.tz[i - W]) * L.bz[i]) / ds;
  }
  const bad = (i) => L.air[i] || L.loop[i] || L.tube[i];
  let i = 0;
  while (i < n) {
    if (Math.abs(kap[i]) > 1 / 80 && !bad(i)) {
      const sg = Math.sign(kap[i]);
      let j = i, best = -1, bd = 1e9;
      while (j < n && Math.abs(kap[j]) > 1 / 80 && Math.sign(kap[j]) === sg && !bad(j)) {
        const inner = sg > 0 ? bnd.hi[j] : -bnd.lo[j];
        const gap = inner - off[j] * sg;
        if (inner > 0.5 && gap < bd) { bd = gap; best = j; }
        j++;
      }
      if (best >= 0 && bd < 0.25 && L.s[j - 1] - L.s[i] > 5) out.push({ i: best, side: sg });
      i = j;
    } else i++;
  }
  return out;
}

// Neue Linie aus Basislinie + Versätzen (Tangenten/Rahmen/Bogenlänge neu)
export function makeLine(L, off) {
  const n = L.n;
  const I = { ...L };
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'nx', 'ny', 'nz', 'bx', 'by', 'bz', 's']) I[k] = new Float32Array(n);
  I.off = off;
  for (let i = 0; i < n; i++) {
    I.px[i] = L.px[i] + L.bx[i] * off[i]; I.py[i] = L.py[i] + L.by[i] * off[i]; I.pz[i] = L.pz[i] + L.bz[i] * off[i];
  }
  let acc = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) acc += Math.hypot(I.px[i] - I.px[i - 1], I.py[i] - I.py[i - 1], I.pz[i] - I.pz[i - 1]);
    I.s[i] = acc;
  }
  I.total = acc;
  for (let i = 0; i < n; i++) {
    let a = i - 1, b = i + 1;
    if (a < 0) a = L.closed ? n - 2 : 0;
    if (b >= n) b = L.closed ? 1 : n - 1;
    // an Luftstrecken einseitig (Schanzenlippe/Landung behalten ihre echte Neigung)
    if (L.air[a] !== L.air[i]) a = i;
    if (L.air[b] !== L.air[i]) b = i;
    let tx = I.px[b] - I.px[a], ty = I.py[b] - I.py[a], tz = I.pz[b] - I.pz[a];
    let l = Math.hypot(tx, ty, tz);
    if (l < 1e-6) { tx = L.tx[i]; ty = L.ty[i]; tz = L.tz[i]; l = 1; }
    tx /= l; ty /= l; tz /= l;
    // Normale aus Basis, orthogonalisiert
    let nx = L.nx[i], ny = L.ny[i], nz = L.nz[i];
    const d = nx * tx + ny * ty + nz * tz;
    nx -= d * tx; ny -= d * ty; nz -= d * tz;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    I.tx[i] = tx; I.ty[i] = ty; I.tz[i] = tz; I.nx[i] = nx; I.ny[i] = ny; I.nz[i] = nz;
    I.bx[i] = ty * nz - tz * ny; I.by[i] = tz * nx - tx * nz; I.bz[i] = tx * ny - ty * nx;
  }
  // Grenzen relativ zur neuen Linie
  I.lo = new Float32Array(n); I.hi = new Float32Array(n);
  for (let i = 0; i < n; i++) { I.lo[i] = L.lo[i] - off[i]; I.hi[i] = L.hi[i] - off[i]; }
  return I;
}

// ---------------------------------------------------------------------------------------------------
// Minimal-Krümmungs-QP: min Σ_k |Q[k-1] − 2·Q[k] + Q[k+1]|² mit Q[k] = P[k] + B[k]·o[k], lo ≤ o ≤ hi –
// dasselbe Ziel wie die alte Relaxation, nur exakt gelöst. Die Hesse-Matrix ist fünfdiagonal (Rundkurs:
// plus zwei Ecken). Punkte am Rand werden festgehalten, der Rest per Band-LDLᵀ exakt gelöst.
// opts.init = Startversätze (von der gröberen Stufe): Randmenge daraus, dann Primal-Dual-Active-Set.
export function solveMinCurv(P, B, lo, hi, closed, opts = {}) {
  const n = lo.length;
  const d0 = new Float64Array(n), d1 = new Float64Array(n), d2 = new Float64Array(n), g = new Float64Array(n);
  const dot = (p, q) => B[p * 3] * B[q * 3] + B[p * 3 + 1] * B[q * 3 + 1] + B[p * 3 + 2] * B[q * 3 + 2];
  const k0 = closed ? 0 : 1, k1 = closed ? n : n - 1;
  for (let k = k0; k < k1; k++) {
    const a = k === 0 ? n - 1 : k - 1, b = k, c = k === n - 1 ? 0 : k + 1;
    d0[a] += 1; d0[b] += 4; d0[c] += 1;
    d1[a] -= 2 * dot(a, b); d1[b] -= 2 * dot(b, c); d2[a] += dot(a, c);
    for (let q = 0; q < 3; q++) {
      const cv = P[a * 3 + q] - 2 * P[b * 3 + q] + P[c * 3 + q];
      g[a] += B[a * 3 + q] * cv; g[b] -= 2 * B[b * 3 + q] * cv; g[c] += B[c * 3 + q] * cv;
    }
  }
  for (let i = 0; i < n; i++) d0[i] += 1e-9; // winzige Regularisierung (eindeutig lösbar)
  const wrap = (i) => (i < 0 ? i + n : i >= n ? i - n : i);
  const has = (i) => closed || (i >= 0 && i < n);
  // Gradient H·x + g an Punkt i (Kraft auf festgehaltene Punkte)
  const grad = (x, i) => {
    let r = d0[i] * x[i] + g[i];
    if (has(i + 1)) r += d1[i] * x[wrap(i + 1)];
    if (has(i + 2)) r += d2[i] * x[wrap(i + 2)];
    if (has(i - 1)) r += d1[wrap(i - 1)] * x[wrap(i - 1)];
    if (has(i - 2)) r += d2[wrap(i - 2)] * x[wrap(i - 2)];
    return r;
  };
  const state = new Int8Array(n); // 0 frei, −1 am unteren, +1 am oberen Rand, 2 fest (lo = hi)
  for (let i = 0; i < n; i++) if (hi[i] - lo[i] < 1e-6) state[i] = 2;
  const init = opts.init;
  if (init) for (let i = 0; i < n; i++) if (state[i] !== 2) state[i] = init[i] <= lo[i] + 1e-3 ? -1 : init[i] >= hi[i] - 1e-3 ? 1 : 0;
  const x = new Float64Array(n), m0 = new Float64Array(n), m1 = new Float64Array(n), m2 = new Float64Array(n), rhs = new Float64Array(n);
  const val = (i) => state[i] === 1 ? hi[i] : state[i] === 2 ? (lo[i] + hi[i]) / 2 : lo[i];
  const couple = (i, h, v) => { if (has(i)) { const w = wrap(i); if (!state[w]) rhs[w] -= h * v; } };
  const solveFixed = (out) => {
    // Zeilen/Spalten festgehaltener Punkte durch Einheitszeilen ersetzen, Kopplung auf die rechte Seite
    for (let i = 0; i < n; i++) { rhs[i] = -g[i]; m0[i] = d0[i]; m1[i] = d1[i]; m2[i] = d2[i]; }
    for (let j = 0; j < n; j++) {
      if (!state[j]) continue;
      const v = val(j);
      couple(j + 1, d1[j], v); couple(j + 2, d2[j], v);
      if (has(j - 1)) couple(j - 1, d1[wrap(j - 1)], v);
      if (has(j - 2)) couple(j - 2, d2[wrap(j - 2)], v);
    }
    for (let j = 0; j < n; j++) {
      if (!state[j]) continue;
      rhs[j] = val(j); m0[j] = 1; m1[j] = 0; m2[j] = 0;
      if (has(j - 1)) m1[wrap(j - 1)] = 0;
      if (has(j - 2)) m2[wrap(j - 2)] = 0;
    }
    if (closed) solveCyclic(m0, m1, m2, rhs, out, n); else solveBand(ldlBand(m0, m1, m2, n), rhs, out, n);
  };
  // Phase 1: Primal-Dual-Active-Set – aus guter Startmenge meist in 2–5 Durchgängen fertig; von weit weg
  // kann es bei dieser Matrix (keine M-Matrix) zwischen Randmengen pendeln, dann Phase 2.
  const pdasIt = opts.pdas ?? (init ? 8 : 12);
  let it = 0, done = false;
  for (; it < pdasIt && !done; it++) {
    solveFixed(x);
    let changed = 0;
    for (let i = 0; i < n; i++) {
      const st = state[i];
      if (st === 2) continue;
      let ns = st;
      if (st === 0) { if (x[i] < lo[i] - EPS_X) ns = -1; else if (x[i] > hi[i] + EPS_X) ns = 1; }
      else {
        const r = grad(x, i);        // > 0 drückt nach unten, < 0 nach oben
        if ((st === -1 && r < -EPS_R) || (st === 1 && r > EPS_R)) ns = 0;
      }
      if (ns !== st) { state[i] = ns; changed++; }
    }
    if (!changed) done = true;
  }
  // Phase 2 (nur falls nötig): primales Active-Set ab dem zulässigen Punkt – jeder Schritt senkt die
  // Krümmung, daher kein Pendeln. Schritt zum Teil-Optimum oder bis zum ersten Rand (dort festhalten);
  // am Teil-Optimum Punkte freigeben, die nach innen gezogen werden. Zwei benachbarte feste Punkte
  // entkoppeln die Linie (Bandbreite 2) – jeder Abschnitt dazwischen schreitet für sich voran, so bremst
  // eine Kurve nicht alle anderen (sonst Hunderte Schritte auf langen Strecken).
  if (!done) {
    for (let i = 0; i < n; i++) {
      if (state[i] === 2) continue;
      if (x[i] <= lo[i]) state[i] = -1; else if (x[i] >= hi[i]) state[i] = 1;
      if (state[i]) x[i] = val(i);
    }
    const y = new Float64Array(n), blk = new Int32Array(n);
    let aB = new Float64Array(64), pB = new Float64Array(64);
    let strict = false;
    for (let k = 0; k < (opts.maxActive ?? 4000) && !done; k++, it++) {
      solveFixed(y);
      // Abschnitte: Start hinter einem Paar fester Punkte
      let s0 = 0;
      if (closed) { s0 = -1; for (let i = 0; i < n; i++) if (state[i] && state[wrap(i + 1)]) { s0 = wrap(i + 2); break; } if (s0 < 0) s0 = 0; }
      let nb = 0, run = 2;
      for (let q = 0; q < n; q++) {
        const i = closed ? wrap(s0 + q) : q;
        if (state[i]) { run++; blk[i] = -1; continue; }
        if (run >= 2) nb++;
        run = 0; blk[i] = nb - 1;
      }
      if (aB.length < nb) { aB = new Float64Array(nb * 2); pB = new Float64Array(nb * 2); }
      aB.fill(1, 0, nb); pB.fill(0, 0, nb);
      for (let i = 0; i < n; i++) {
        const b = blk[i];
        if (b < 0) continue;
        const p = y[i] - x[i];
        if (Math.abs(p) > pB[b]) pB[b] = Math.abs(p);
        if (p < -1e-12) aB[b] = Math.min(aB[b], (lo[i] - x[i]) / p);
        else if (p > 1e-12) aB[b] = Math.min(aB[b], (hi[i] - x[i]) / p);
      }
      let moving = 0, progress = false;
      for (let i = 0; i < n; i++) {
        const b = blk[i];
        if (b < 0 || pB[b] < 1e-7) continue;
        moving++;
        const al = Math.max(0, aB[b]);
        if (al > 0) progress = true;
        x[i] += al * (y[i] - x[i]);
        if (x[i] <= lo[i] + 1e-9 && y[i] < x[i] - 1e-12) { x[i] = lo[i]; state[i] = -1; }
        else if (x[i] >= hi[i] - 1e-9 && y[i] > x[i] + 1e-12) { x[i] = hi[i]; state[i] = 1; }
      }
      if (moving && !progress) strict = true;
      // Abschnitte mit vollem Schritt (oder schon ruhend) sind am Teil-Optimum: dort gleich Randpunkte
      // freigeben, die nach innen gezogen werden (Nachbarn ±2 müssen alle ruhen). Nach einem Leerschritt
      // vorsichtig: nur der stärkste Kandidat.
      const rest = (b) => pB[b] < 1e-7 || aB[b] >= 1;
      const settled = (i) => { for (let d = -2; d <= 2; d++) { if (!d || !has(i + d)) continue; const b = blk[wrap(i + d)]; if (b >= 0 && !rest(b)) return false; } return true; };
      let freed = 0, worst = -1, wr = 0, open = 0;
      for (let b = 0; b < nb; b++) if (!rest(b)) open++;
      for (let i = 0; i < n; i++) {
        const st = state[i];
        if (st !== 1 && st !== -1) continue;
        if (!settled(i)) continue;
        const r = grad(x, i) * st;         // > 0: wird nach innen gezogen
        if (r > EPS_R) { if (strict) { if (r > wr) { wr = r; worst = i; } } else { state[i] = 0; freed++; } }
      }
      if (strict && worst >= 0) { state[worst] = 0; freed++; strict = false; }
      if (!open && !freed) done = true;
    }
  }
  const o = new Float64Array(n);
  for (let i = 0; i < n; i++) o[i] = Math.max(lo[i], Math.min(hi[i], x[i]));
  if (opts.stats) {
    // KKT-Rest: Kraft auf freie Punkte (soll 0 sein) bzw. nach innen ziehende Kraft auf Randpunkte
    let kkt = 0;
    for (let i = 0; i < n; i++) {
      if (hi[i] - lo[i] < 1e-6) continue;
      const r = grad(o, i);
      if (o[i] <= lo[i] + 1e-6) kkt = Math.max(kkt, -r); else if (o[i] >= hi[i] - 1e-6) kkt = Math.max(kkt, r); else kkt = Math.max(kkt, Math.abs(r));
    }
    opts.stats.kkt = kkt;
  }
  if (opts.stats) { opts.stats.iters = it; opts.stats.pdas = Math.min(it, pdasIt); opts.stats.done = done; opts.stats.active = state.reduce((a, s) => a + (s === 1 || s === -1), 0); }
  return o;
}

// Symmetrische fünfdiagonale Matrix (m0 Diagonale, m1/m2 erste/zweite Nebendiagonale) → LDLᵀ
function ldlBand(m0, m1, m2, n) {
  const d = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a2 = 0, a1 = 0;
    if (i >= 2) a2 = l2[i] = m2[i - 2] / d[i - 2];
    if (i >= 1) {
      let v = m1[i - 1];
      if (i >= 2) v -= a2 * d[i - 2] * l1[i - 1];
      a1 = l1[i] = v / d[i - 1];
    }
    d[i] = m0[i] - a1 * a1 * (i >= 1 ? d[i - 1] : 0) - a2 * a2 * (i >= 2 ? d[i - 2] : 0);
  }
  return { d, l1, l2 };
}
function solveBand(F, b, x, n) {
  const { d, l1, l2 } = F;
  for (let i = 0; i < n; i++) x[i] = b[i] - (i >= 1 ? l1[i] * x[i - 1] : 0) - (i >= 2 ? l2[i] * x[i - 2] : 0);
  for (let i = 0; i < n; i++) x[i] /= d[i];
  for (let i = n - 1; i >= 0; i--) x[i] -= (i + 1 < n ? l1[i + 1] * x[i + 1] : 0) + (i + 2 < n ? l2[i + 2] * x[i + 2] : 0);
}
// Rundkurs: die letzten beiden Punkte als Rand abtrennen (nur sie koppeln über das Ende), Innenteil ist
// rein fünfdiagonal → drei Band-Lösungen + 2×2-Schur-Komplement.
function solveCyclic(m0, m1, m2, b, x, n) {
  const m = n - 2;
  const F = ldlBand(m0, m1, m2, m);
  const c1 = new Float64Array(m), c2 = new Float64Array(m);     // Spalten n−2 und n−1 des Innenteils
  c1[m - 2] += m2[m - 2]; c1[m - 1] += m1[m - 1]; c1[0] += m2[n - 2];
  c2[m - 1] += m2[m - 1]; c2[0] += m1[n - 1]; c2[1] += m2[n - 1];
  const X1 = new Float64Array(m), X2 = new Float64Array(m), y = new Float64Array(m);
  solveBand(F, c1, X1, m); solveBand(F, c2, X2, m); solveBand(F, b, y, m);
  let s11 = m0[n - 2], s12 = m1[n - 2], s22 = m0[n - 1], r1 = b[n - 2], r2 = b[n - 1];
  for (let i = 0; i < m; i++) {
    s11 -= c1[i] * X1[i]; s12 -= c1[i] * X2[i]; s22 -= c2[i] * X2[i];
    r1 -= c1[i] * y[i]; r2 -= c2[i] * y[i];
  }
  const det = s11 * s22 - s12 * s12;
  const xa = (r1 * s22 - r2 * s12) / det, xb = (s11 * r2 - s12 * r1) / det;
  for (let i = 0; i < m; i++) x[i] = y[i] - X1[i] * xa - X2[i] * xb;
  x[n - 2] = xa; x[n - 1] = xb;
}
