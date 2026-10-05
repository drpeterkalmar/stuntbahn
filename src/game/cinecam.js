// Kino-Replay (n18): Kameras des Highlight-Films – rein rechnerisch (kein three.js), damit Node die Positionen gegen
// Strecke und Gelände prüfen kann (tests/node/test_kinoreplay.mjs). main.js überträgt das Ergebnis auf die Kamera.
//   drone   Drohne: folgt seitlich von oben, weich, leichte Kreisfahrt um das Auto
//   action  Action-Cam: tief seitlich am Auto montiert (dreht im Looping mit), leichtes Wackeln
//   tele    Stativ mit Tele an der Landestelle (bzw. am Looping, an der Crash-Stelle, hinter der Ziellinie): Zoom + Schwenk
//   heli    Hubschrauber: weit und hoch, Überblick
//   onboard auf dem Dach, Blick nach vorn (kurz)
//   fan     Fan-Cam (n27): Handkamera eines Zuschauers am Rand/auf der Tribüne – wackelt, schwenkt mit Verzug, zoomt
//           nach, Schärfe zieht hinterher (kurz unscharf), Köpfe/Hände als Silhouetten im Vordergrund (ui.js)
//   crane   Kran/Dolly (n27): fährt neben der Strecke mit (langsamer als das Auto, es fährt durchs Bild), steigt, Schärfe
//           wandert vom Vordergrund aufs Auto
//   low     Bodenkamera (n27): knapp über der Fahrbahn neben der Spur (≥ 2 m seitlich), das Auto donnert vorbei bzw. fliegt
//           an der Lippe über sie hinweg
//   rear    Heckkamera (n27): über dem Dach, Blick zurück übers Heck (die Straße rast weg, im Sprung die Lippe)
//   Reißschwenk zwischen zwei Einstellungen (shot.whipIn/whipOut): schneller Schwenk mit Bewegungsunschärfe (O.whip);
//   Landungen: Kamera ruckelt kurz (alle Arten außer Zielbogen)
//   arch    Zielbogen (n27): Kamera vor der Ziellinie neben der Fahrbahn, schwenkt vom wegfahrenden Auto hinauf auf den Bogen
//           mit Fontänen und Feuerwerk (live in der Zielshow und im Highlight-Film; Standort nur aus der Strecke → gleich)
// Kein Clipping: feste Standorte werden vorab gegen Strecke, Gelände und Wasser geprüft (frei, nicht unter einer Brücke,
// nicht auf der Fahrbahn, Sicht aufs Auto über die ganze Einstellung); bewegte Kameras wählen die freiere Seite und
// werden in jedem Bild per Strahl vom Auto aus herangezogen, wenn ein Bauteil oder der Hang dazwischen liegt.
import { poseAt, clipSpeed } from './highlights.js';
import { pyroGeo, ZIEL } from './zielshow.js';

export const CINE = {
  drone: { R: 10, H: 4.2, phi0: -0.6, phi1: 0.3, fit: 8, dof: 0.75, follow: 6, look: 8 },
  heli: { R: 40, H: 24, phi0: -0.95, phi1: -0.4, fit: 18, dof: 0.4, follow: 2.2, look: 3 },
  // Action-Cam quer seitlich am hinteren Kotflügel, hochkant weiter hinten (sonst passt das Auto nicht ins schmale Bild)
  action: { side: 1.6, y: -0.3, z: 2.8, zHoch: 6.5, sideHoch: 0.4, yHoch: 0.15, look: 14, inward: 1.2, lookUp: 0.35, fov: 68, shake: 0.012, dof: 0.55 },
  onboard: { y: 0.18, z: 0.35, look: 25, lookUp: 0.4, fov: 66, dof: 0.2 },
  // Bildausschnitt (m um das Auto) von weit (Anfang) auf eng (Höhepunkt); am Looping der ganze Looping im Bild (Blick
  // zwischen Looping-Mitte und Auto), am Ziel etwas weiter
  tele: { dist: [22, 32, 44], h: [1.6, 4, 9], along: [-14, 0, 14], fitWide: 11, fitTight: 5, fit: { loop: [30, 20], finish: [14, 7] }, anchorK: { loop: 0.45 }, pan: 5, dof: 1 },
  // Zielbogen (n27): Standorte hinter der Ziellinie (along m entgegen der Fahrtrichtung), seitlich off m über die Fahrbahn-
  // kante, h m hoch; Blickziel am Ende focus m über der Linie, Bildausschnitt fitCar m (Auto) → fitArch m (Bogen + Feuerwerk),
  // Kran steigt rise m, Schwenk ZIEL.pan s
  fan: { lat: [7, 11, 16, 23], along: [-34, -20, -8, 6, 20, 34], eye: 1.7, stand: 3.2, fit: 8, fitBig: 26, zoomK: 2.6, focusK: 1.8, follow: 4.5, lead: 0.8, shake: 0.03, dof: 0.95, near: 7, dist: 18 },
  crane: { off: [8, 12, 17], back: 14, vK: 0.55, h: [2.5, 9], fit: 9, fitBig: 20, dof: 0.9 },
  low: { side: 2.6, h: 0.36, minLat: 2.0, fov: 72, fovHoch: 92, dof: 0.35 },
  rear: { y: 0.5, z: -0.4, lookY: -1.6, look: 18, fov: 76, dof: 0.2 },
  whip: { ang: 0.9, blur: 0.09 },
  arch: { along: [-16, -22, -30], off: [4, 8, 13], h: [2.5, 5, 8], focus: 16, fitCar: 12, fitArch: 46, rise: 2.5, dof: 0.25, dist: 26 },
  gap: 0.6,          // m Abstand zu Bauteilen (Strahl-Treffer)
  minDist: 2.6,      // m: näher zieht eine bewegte Kamera nicht heran
  ground: 0.9,       // m über Gelände/Wasser mindestens
};

const V = (x = 0, y = 0, z = 0) => [x, y, z];
const set = (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; };
const copy = (o, a) => set(o, a[0], a[1], a[2]);
const sub = (o, a, b) => set(o, a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (o) => { const l = len(o) || 1; o[0] /= l; o[1] /= l; o[2] /= l; return o; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerpTo = (o, a, k) => set(o, o[0] + (a[0] - o[0]) * k, o[1] + (a[1] - o[1]) * k, o[2] + (a[2] - o[2]) * k);
const sstep = (a, b, x) => { const q = clamp((x - a) / (b - a), 0, 1); return q * q * (3 - 2 * q); };

export class CineCam {
  // env = { track, world }, rec = Aufzeichnung, film = buildFilm(…), opt.carTop = Dachhöhe über dem Auto-Ursprung (m)
  constructor(env, rec, film, opt = {}) {
    this.env = env; this.W = env.world; this.L = env.track.line; this.T = env.track.terrain; this.rec = rec; this.film = film;
    this.carTop = opt.carTop ?? 0.75;
    this.out = { pos: V(), look: V(), up: V(0, 1, 0), fov: 50, focus: 10, dof: 0.5, cam: 'drone' };
    this._p = { p: V(), f: V(), u: V() };
    this.base = V(); this.bv = V(); this.lk = V(); this.last = V(); this.fh = V(0, 0, -1); this.free = null; this.fov = 50; this.init = false;
    for (const c of film.clips) for (const s of c.shots) s.setup = this.setup(c, s);
  }

  // ---------- Welt-Abfragen ----------
  // Boden: Gelände oder Wasser (Fluss in der Schlucht, Teiche) – die Kamera bleibt darüber
  floor(x, z) {
    const T = this.T;
    let h = T ? T.height(x, z) : 0;
    if (T && T.waters) for (const w of T.waters) {
      const dx = x - w.E[0], dz = z - w.E[2], f = dx * w.F[0] + dz * w.F[2], r = dx * w.R[0] + dz * w.R[2];
      if (f > w.f0 - 4 && f < w.f1 + 4 && r > w.r0 - 4 && r < w.r1 + 4) h = Math.max(h, w.y + 0.2);
    }
    return h;
  }
  // freier Anteil der Strecke a → b (1 = frei): Strecken-Dreiecke beidseitig + Gelände
  ray(a, b) {
    const d = sub(this._rd || (this._rd = V()), b, a), L = len(d);
    if (L < 1e-3) return 1;
    d[0] /= L; d[1] /= L; d[2] /= L;
    let t = L;
    const h = this.W.rayTrack(a[0], a[1], a[2], d[0], d[1], d[2], L, false);
    if (h) t = Math.min(t, h.t);
    if (this.T) { const g = this.W.rayTerrain(a[0], a[1], a[2], d[0], d[1], d[2], t, this._rt || (this._rt = {})); if (g) t = Math.min(t, g.t); }
    return t / L;
  }
  // Punkt frei? (kein Bauteil im Umkreis r, nichts direkt darüber bis up m, über dem Boden)
  pointFree(p, r = 1.2, up = 30) {
    if (p[1] < this.floor(p[0], p[2]) + CINE.ground * 0.5) return false;
    const W = this.W;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (W.rayTrack(p[0], p[1], p[2], dx, dy, dz, r, false)) return false;
    if (up > 0 && W.rayTrack(p[0], p[1], p[2], 0, 1, 0, up, false)) return false;
    return true;
  }
  // nicht auf/über einer Fahrbahn (Autos fahren durch die Kamera)
  offRoad(p, margin = 2.5) {
    const L = this.L;
    for (let i = 0; i < L.n; i += 2) {
      const dx = p[0] - L.px[i], dz = p[2] - L.pz[i];
      if (dx * dx + dz * dz < (L.hw[i] + margin) ** 2 && Math.abs(p[1] - L.py[i]) < 7) return false;
    }
    return true;
  }
  pose(t) { return poseAt(this.rec, t, this._p); }
  // waagrechte Fahrtrichtung (im Looping senkrecht → letzte brauchbare)
  horiz(f, out, prev) {
    const l = Math.hypot(f[0], f[2]);
    if (l < 0.25) return prev ? copy(out, prev) : set(out, 0, 0, -1);
    return set(out, f[0] / l, 0, f[2] / l);
  }

  // ---------- Vorbereitung je Einstellung ----------
  setup(c, s) {
    const samples = [];
    const fh = V(0, 0, -1);
    for (let t = s.t0; t <= s.t1 + 1e-6; t += 0.15) { const P = this.pose(Math.min(t, s.t1)); samples.push({ t, p: [...P.p], f: [...P.f], u: [...P.u], fh: [...this.horiz(P.f, fh, fh)] }); }
    if (s.cam === 'tele') return this.setupTele(c, s, samples);
    if (s.cam === 'drone' || s.cam === 'heli') return this.setupOrbit(s, samples);
    if (s.cam === 'action') return this.setupAction(samples);
    if (s.cam === 'arch') return this.setupArch();
    let S = {};
    if (s.cam === 'fan') S = this.setupFan(c, s, samples);
    else if (s.cam === 'crane') S = this.setupCrane(c, s, samples);
    else if (s.cam === 'low') S = this.setupLow(c, s, samples);
    // kein brauchbarer Standort (Bodenkamera eingeklemmt, Fan ohne Sicht): Drohne statt dessen
    // (in Bauwerken – Looping, Röhre, Korkenzieher – die Action-Cam am Auto, sonst die Drohne)
    if (S.fallback) {
      s.fellBack = true;
      if (/^(loop|tube|cork|wendel|spiral|waves)$/.test(c.kind)) { s.cam = 'action'; S = this.setupAction(samples); }
      else { s.cam = 'drone'; S = this.setupOrbit(s, samples); }
    }
    S.lands = this.landings(s.t0, s.t1);
    return S;
  }
  // Landungen in der Einstellung (Luftphase ≥ 0,3 s, dann Bodenkontakt): { t, k } – Kamera ruckelt
  landings(t0, t1) {
    const R = this.rec, n = Math.floor(R.length / 16), out = [];
    let air = 0;
    for (let i = Math.max(0, Math.floor((t0 - 3) * 60)); i < Math.min(n, Math.ceil(t1 * 60)); i++) {
      const o = i * 16, a = R[o + 10] === 0 && R[o + 11] === 0 && R[o + 12] === 0 && R[o + 13] === 0;
      if (a) air++; else { if (air >= 18 && i / 60 >= t0 - 0.05) out.push({ t: i / 60, k: Math.min(1, air / 90) }); air = 0; }
    }
    return out;
  }
  // Fan-Cam: Zuschauerplatz (Tribüne/Zuschauer aus dem Deko-Plan im Browser, sonst am Rand) mit Sicht aufs Auto
  setupFan(c, s, samples) {
    const C = CINE.fan, mid = this.pose(Math.max(s.t0, Math.min(s.t1, c.tp))), A = [...mid.p], fh = this.horiz(mid.f, V(), null), rx = -fh[2], rz = fh[0];
    const cands = [];
    const DP = this.env.track.decoPlan;
    if (DP && DP.inst) for (const k of ['crowd', 'stand']) for (const o of DP.inst[k] || []) {
      if (Math.hypot(o.x - A[0], o.z - A[2]) > 60) continue;
      cands.push([o.x, this.floor(o.x, o.z) + (k === 'stand' ? C.stand : C.eye), o.z, 6]);
    }
    for (const side of [1, -1]) for (const lat of C.lat) for (const al of C.along) {
      const x = A[0] + rx * side * lat + fh[0] * al, z = A[2] + rz * side * lat + fh[2] * al;
      cands.push([x, Math.max(this.floor(x, z), A[1] - 1.5) + C.eye, z, 0]);
    }
    const car = V();
    let best = null;
    for (const [x, y, z, bonus] of cands) {
      const p = [x, y, z];
      if (!this.pointFree(p, 0.8, 0) || !this.offRoad(p, 3)) continue;
      let vis = 0, near = 1e9, far = 0;
      for (const q of samples) { set(car, q.p[0], q.p[1] + 0.5, q.p[2]); if (this.ray(p, car) > 0.97) vis++; const d = dist(p, q.p); near = Math.min(near, d); far = Math.max(far, d); }
      if (near < C.near || far > 130) continue;
      const v = vis / samples.length, sc = v * 100 + bonus - Math.abs(near - C.dist * 0.6) * 0.3;
      if (!best || sc > best.score) best = { pos: p, score: sc, vis: v, stand: bonus > 0 };
    }
    // am Looping darf das Gerüst kurz davor sein (die Zuschauer stehen daneben), sonst durchgehend Sicht
    if (!best || best.vis < (c.kind === 'loop' ? 0.6 : 0.78)) return { fallback: true };
    best.big = /^(loop|tube|cork|wendel|spiral|wall|halfpipe)$/.test(c.kind);
    return best;
  }
  // Kran/Dolly: fährt entlang der Linie mit vK des mittleren Auto-Tempos (startet back m hinter dem Auto), seitlich off m
  // über die Fahrbahnkante, steigt von h[0] auf h[1] m. Positionen je Abtastung vorab (deterministisch, gegen Gelände geprüft)
  setupCrane(c, s, samples) {
    const C = CINE.crane, L = this.L, p0 = samples[0].p;
    let i0 = 0, dm = 1e18;
    for (let i = 0; i < L.n; i++) { const d = (L.px[i] - p0[0]) ** 2 + (L.py[i] - p0[1]) ** 2 + (L.pz[i] - p0[2]) ** 2; if (d < dm) { dm = d; i0 = i; } }
    let path = 0; for (let k = 1; k < samples.length; k++) path += dist(samples[k].p, samples[k - 1].p);
    const vd = C.vK * path / Math.max(0.3, s.t1 - s.t0);
    const big = /^(loop|tube|cork|wendel|spiral|wall|halfpipe)$/.test(c.kind), yBase = p0[1];
    const walk = (i, d) => { let j = i, acc = 0; const sg = d < 0 ? -1 : 1; for (let k = 0; k < L.n && acc < Math.abs(d); k++) { const nj = j + sg; if (nj < 0 || nj >= L.n) { if (!L.closed) break; } const jj = (nj + L.n) % L.n; acc += Math.hypot(L.px[jj] - L.px[j], L.pz[jj] - L.pz[j]); j = jj; } return j; };
    const car = V();
    let best = null;
    for (const side of [1, -1]) for (const off of C.off) {
      const pts = [];
      let vis = 0, ok = 0;
      samples.forEach((q, k) => {
        const u = k / Math.max(1, samples.length - 1), j = walk(i0, -C.back + vd * (q.t - s.t0));
        const bl = Math.hypot(L.bx[j], L.bz[j]) || 1, bx = L.bx[j] / bl, bz = L.bz[j] / bl, lat = L.hw[j] + off;
        const x = L.px[j] + bx * side * lat, z = L.pz[j] + bz * side * lat;
        const h = C.h[0] + (C.h[1] - C.h[0]) * u * u * (3 - 2 * u);
        const p = [x, Math.max((big ? yBase : L.py[j]) + h, this.floor(x, z) + CINE.ground + h * 0.4), z];
        pts.push(p);
        if (this.pointFree(p, 0.8, 0) && this.offRoad(p, 2)) ok++;
        set(car, q.p[0], q.p[1] + 0.5, q.p[2]);
        if (this.ray(p, car) > 0.97) vis++;
      });
      const sc = (vis + ok) / (2 * samples.length) - off * 0.004;
      if (!best || sc > best.score) best = { pts, score: sc, vis: vis / samples.length, side, big, dt: 0.15 };
    }
    if (!best || best.vis < 0.85) return { fallback: true };
    return best;
  }
  // Bodenkamera: neben der Spur an der Stelle, an der das Auto bei ta ist (Lippe bzw. 80 % der Einstellung), knapp über
  // der Fahrbahn (Strahl nach unten), mindestens minLat m seitlich von jeder Lage des Autos in der Einstellung
  setupLow(c, s, samples) {
    const C = CINE.low, ta = Math.min(s.t1 - 0.15, s.t0 + 0.8 * (s.t1 - s.t0)), P = this.pose(ta), fh = this.horiz(P.f, V(), null), rx = -fh[2], rz = fh[0];
    let best = null;
    for (const side of [1, -1]) for (const lat of [C.side, C.side + 1.2]) {
      const x = P.p[0] + rx * side * lat, z = P.p[2] + rz * side * lat;
      // Boden: Fahrbahn unter dem Punkt, sonst Gelände/Wasser (an der Lippe: unten in der Lücke – das Auto fliegt darüber)
      const hit = this.W.rayTrack(x, P.p[1] + 1.5, z, 0, -1, 0, 6, false), fl = this.floor(x, z);
      const gy = hit ? Math.max(P.p[1] + 1.5 - hit.t, fl) : fl;
      if (gy > P.p[1] + 1 || gy < P.p[1] - 30) continue;
      const p = [x, gy + C.h, z];
      // frei nach den Seiten und oben (nach unten liegt ja die Fahrbahn)
      if ([[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([dx, dy, dz]) => this.W.rayTrack(p[0], p[1], p[2], dx, dy, dz, 0.45, false)) || this.ray([P.p[0], P.p[1] + 0.3, P.p[2]], p) < 0.99) continue;
      let near = 1e9, vis = 0;
      const car = V();
      for (const q of samples) { near = Math.min(near, Math.hypot(q.p[0] - p[0], q.p[2] - p[2])); set(car, q.p[0], q.p[1] + 0.4, q.p[2]); if (this.ray(p, car) > 0.97) vis++; }
      if (near < C.minLat) continue;
      const sc = vis / samples.length - lat * 0.02;
      if (!best || sc > best.score) best = { pos: p, score: sc, vis: vis / samples.length, side, ta };
    }
    if (!best || best.vis < 0.7) return { fallback: true };
    return best;
  }
  // Zielbogen: Standort nur aus der Strecke (live wie im Film gleich) – frei, neben der Fahrbahn, mit Sicht auf Bogen,
  // Fontänen und die Fahrbahn hinter dem Ziel (dort fährt das Auto aus)
  setupArch() {
    if (this._arch) return this._arch;
    const C = CINE.arch, g = pyroGeo(this.env.track), [px, py, pz] = g.p, [tx, , tz] = g.t, [bx, , bz] = g.b;
    const A = [px, py + C.focus, pz], arch = [px, py + 9, pz];
    const fnt = [-1, 1].map((sd) => [px + bx * sd * (g.hw - 0.6), py + 2.5, pz + bz * sd * (g.hw - 0.6)]);
    const L = this.L, ahead = [];
    for (let j = g.idx, c = 0, d = 0; c < L.n && ahead.length < 4; c++) {
      const k = j + 1 >= L.n ? (L.closed ? 1 : -1) : j + 1;
      if (k < 0) break;
      d += Math.max(0, L.s[k] - L.s[j]); j = k;
      if (d >= [12, 35, 70, 110][ahead.length]) ahead.push([L.px[j], L.py[j] + 0.8, L.pz[j]]);
    }
    // Streckenrand-Objekte (Fahnen, Masten, Tribünen, Kräne, Portal – ohne Kollision, nur aus dem Deko-Plan im Browser):
    // nicht näher als 5 m, und keines zwischen Kamera und Bogen (Abstand zur Sichtlinie in der Ebene < 1,5 m)
    const obs = [], DP = this.env.track.decoPlan;
    if (DP && DP.inst) for (const [k, arr] of Object.entries(DP.inst)) {
      if (!Array.isArray(arr) || !/^(flag|light|stand|cam|portal|tower|crane|block|turbine|crowd)/.test(k)) continue;
      for (const o of arr) if (o && Math.hypot(o.x - px, o.z - pz) < 90) obs.push([o.x, o.z, k === 'stand' || k === 'block' ? 6 : 2]);
    }
    const blocked = (c) => obs.some(([x, z, r]) => {
      if (Math.hypot(x - c[0], z - c[2]) < 3 + r) return true;
      const ax = px - c[0], az = pz - c[2], L2 = ax * ax + az * az, q = Math.max(0, Math.min(1, ((x - c[0]) * ax + (z - c[2]) * az) / L2));
      return q > 0.05 && q < 0.8 && Math.hypot(c[0] + ax * q - x, c[2] + az * q - z) < 1.2 + r * 0.4;
    });
    const cand = V();
    let best = null;
    for (const side of [1, -1]) for (const al of C.along) for (const off of C.off) for (const h of C.h) {
      set(cand, px + tx * al + bx * side * (g.hw + off), 0, pz + tz * al + bz * side * (g.hw + off));
      cand[1] = Math.max(py + h, this.floor(cand[0], cand[2]) + Math.max(CINE.ground, h * 0.6));
      if (!this.pointFree(cand) || !this.offRoad(cand)) continue;
      const bl = blocked(cand) ? 45 : 0;
      const vA = this.ray(cand, A) > 0.98 ? 1 : 0, vB = this.ray(cand, arch) > 0.98 ? 1 : 0;
      const vF = fnt.reduce((n, q) => n + (this.ray(cand, q) > 0.97 ? 0.5 : 0), 0);
      const vC = ahead.length ? ahead.reduce((n, q) => n + (this.ray(cand, q) > 0.97 ? 1 : 0), 0) / ahead.length : 0;
      const d = Math.hypot(cand[0] - px, cand[2] - pz);
      const score = 30 * vA + 25 * vB + 20 * vF + 30 * vC - Math.abs(d - C.dist) * 0.25 - h * 0.2 - bl;
      if (!best || score > best.score) best = { pos: [...cand], score, vis: (vA + vB + vF + vC) / 4, anchor: A, arch: g.p, side };
    }
    // nichts frei: hoch über dem Anfang der Fahrbahn vor dem Ziel
    if (!best) { const p = [px - tx * 40, py + 30, pz - tz * 40]; p[1] = Math.max(p[1], this.floor(p[0], p[2]) + 25); best = { pos: p, score: 0, vis: 0, anchor: A, arch: g.p, side: 1, fallback: true }; }
    return (this._arch = best);
  }
  // Drohne/Hubschrauber: Seite (links/rechts) mit freier Sicht über die ganze Einstellung
  setupOrbit(s, samples) {
    const C = CINE[s.cam], cam = V(), car = V();
    let best = { side: 1, score: -1 };
    for (const side of [1, -1]) for (const hk of [1, 1.5]) {
      let ok = 0;
      samples.forEach((q, k) => {
        this.orbitPos(cam, q.p, q.fh, side, C, k / Math.max(1, samples.length - 1), hk);
        set(car, q.p[0], q.p[1] + 0.8, q.p[2]);
        if (this.ray(car, cam) > 0.98 && cam[1] > this.floor(cam[0], cam[2]) + CINE.ground) ok++;
      });
      const score = ok / samples.length - (hk > 1 ? 0.05 : 0);
      if (score > best.score + 1e-6) best = { side, hk, score };
    }
    return best;
  }
  orbitPos(out, p, fh, side, C, u, hk = 1) {
    const phi = C.phi0 + (C.phi1 - C.phi0) * u, rx = -fh[2], rz = fh[0];   // rechts = fh × oben
    const ox = (rx * Math.cos(phi) + fh[0] * Math.sin(phi)) * C.R * side, oz = (rz * Math.cos(phi) + fh[2] * Math.sin(phi)) * C.R * side;
    return set(out, p[0] + ox, p[1] + C.H * hk, p[2] + oz);
  }
  // Action-Cam: Seite, an der seltener ein Bauteil (Röhre, Wand, Leitplanke) zwischen Auto und Kamera liegt
  setupAction(samples) {
    const C = CINE.action, cam = V();
    let best = { side: 1, score: -1 };
    for (const side of [1, -1]) {
      let ok = 0;
      for (const q of samples) { this.mount(cam, q.p, q.f, q.u, side * C.side, C.y, C.z); if (this.ray(q.p, cam) > 0.999) ok++; }
      if (ok > best.score) best = { side, score: ok };
    }
    best.score /= samples.length;
    return best;
  }
  // Punkt am Auto (lokal: x rechts, y oben, z hinten)
  mount(out, p, f, u, x, y, z) {
    const rx = f[1] * u[2] - f[2] * u[1], ry = f[2] * u[0] - f[0] * u[2], rz = f[0] * u[1] - f[1] * u[0];
    return set(out, p[0] + rx * x + u[0] * y - f[0] * z, p[1] + ry * x + u[1] * y - f[1] * z, p[2] + rz * x + u[2] * y - f[2] * z);
  }
  // Stativ: Standort um den Ankerpunkt (Landestelle, Looping-Mitte, Crash-Stelle, hinter der Ziellinie), frei, mit Sicht
  setupTele(c, s, samples) {
    const C = CINE.tele, m = c.m || {};
    const at = (t) => [...this.pose(t).p];
    let A, fh = V(0, 0, -1);
    const jumpy = /^(jump|gorge|cliff|drop|air|hop|kuppe|hard)$/.test(c.kind);
    if (jumpy && m.t1 != null) A = at(m.t1);
    else if (c.kind === 'loop' && m.t0 != null) {
      A = V(); let n = 0;
      for (let t = m.t0; t <= m.t1; t += 0.05) { const p = this.pose(t).p; A[0] += p[0]; A[1] += p[1]; A[2] += p[2]; n++; }
      A[0] /= n; A[1] /= n; A[2] /= n;
      this.horiz(this.pose(m.t0).f, fh, fh);
    } else if (c.kind === 'finish') A = at(c.fin ?? c.b);
    else A = at(c.tp);
    if (c.kind !== 'loop') this.horiz(this.pose(c.kind === 'finish' ? c.fin ?? c.b : jumpy && m.t1 != null ? m.t1 : c.tp).f, fh, fh);
    const cand = V(), car = V(), rx = -fh[2], rz = fh[0];
    let best = null;
    const dk = c.kind === 'loop' ? Math.sqrt(this.env.track.stuntScale ?? 1) : 1;   // n26: größerer Looping → etwas weiter weg
    for (const side of [1, -1]) for (const d0 of C.dist) for (const al of C.along) for (const h of c.kind === 'loop' ? [...C.h, 14, 20] : C.h) {
      const d = d0 * dk;
      const along = c.kind === 'finish' ? al + 16 : c.kind === 'loop' ? al * 0.4 : al;
      set(cand, A[0] + rx * side * d + fh[0] * along, 0, A[2] + rz * side * d + fh[2] * along);
      cand[1] = Math.max(A[1] + h, this.floor(cand[0], cand[2]) + Math.max(CINE.ground, h * 0.6));
      if (!this.pointFree(cand) || !this.offRoad(cand)) continue;
      let vis = 0, near = 1e9;
      for (const q of samples) {
        set(car, q.p[0], q.p[1] + 0.5, q.p[2]);
        if (this.ray(cand, car) > 0.97) vis++;
        near = Math.min(near, dist(cand, q.p));
      }
      if (near < 6) continue;
      const score = vis / samples.length * 100 - Math.abs(d - 30 * dk) * 0.15 - h * 0.25 + (along > 0 ? 2 : 0);
      if (!best || score > best.score) best = { pos: [...cand], score, vis: vis / samples.length, anchor: A };
    }
    // nichts frei: hoch über dem Anker (Hubschrauber-Standbild)
    if (!best) { const p = [A[0] + rx * 30, Math.max(A[1], this.floor(A[0] + rx * 30, A[2] + rz * 30)) + 25, A[2] + rz * 30]; best = { pos: p, score: 0, vis: 0, anchor: A, fallback: true }; }
    return best;
  }

  // ---------- je Bild ----------
  // t = Aufzeichnungszeit, P = { pos, frame: { f, u } } (Replay-Pose), shot, clip, dt (Echtzeit), aspect, cut
  update(dt, t, P, shot, clip, aspect, cut) {
    const O = this.out, p = [P.pos.x, P.pos.y, P.pos.z], f = [P.frame.f.x, P.frame.f.y, P.frame.f.z], u = [P.frame.u.x, P.frame.u.y, P.frame.u.z];
    const S = shot.setup || {}, cam = shot.cam, uS = clamp((t - shot.t0) / Math.max(0.1, shot.t1 - shot.t0), 0, 1);
    if (cut || !this.init) { copy(this.base, p); set(this.bv, 0, 0, 0); copy(this.last, p); copy(this.lk, p); this.free = null; this.init = true; this.horiz(f, this.fh, null); this.fovInit = true; }
    const vel = sub(this._v || (this._v = V()), p, this.last);
    if (dt > 1e-4) { vel[0] /= dt; vel[1] /= dt; vel[2] /= dt; } else set(vel, 0, 0, 0);
    if (len(vel) * dt > 30) set(vel, 0, 0, 0);
    copy(this.last, p);
    this.horiz(f, this.fh, this.fh);
    O.cam = cam;
    set(O.up, 0, 1, 0);
    let fit = 8, fov = null;
    if (cam === 'drone' || cam === 'heli') {
      const C = CINE[cam];
      // vorausschauend geglättet: Basis läuft mit dem Auto mit und zieht weich nach (keine Verzögerung bei Tempo)
      const k = 1 - Math.exp(-dt * C.follow);
      set(this.base, this.base[0] + vel[0] * dt, this.base[1] + vel[1] * dt, this.base[2] + vel[2] * dt);
      lerpTo(this.base, p, k);
      // hochkant: Drohne etwas weiter weg, Blick aufs Auto statt davor (das schmale Bild schneidet sonst Bug oder Heck ab)
      const hoch = (aspect || 1.6) < 1, Ch = hoch && cam === 'drone' ? { ...C, R: C.R * 1.4, H: C.H * 1.25 } : C, lead = hoch ? 0 : 1.5;
      const want = this.orbitPos(this._w || (this._w = V()), this.base, this.fh, S.side || 1, Ch, uS, S.hk || 1);
      this.place(want, p, dt);
      this.follow(this.lk, vel, dt, [p[0] + this.fh[0] * lead, p[1] + 0.3, p[2] + this.fh[2] * lead], cut ? 1 : 1 - Math.exp(-dt * C.look));
      copy(O.look, this.lk);
      fit = C.fit; O.dof = C.dof;
    } else if (cam === 'action') {
      const C = CINE.action, hoch = (aspect || 1.6) < 1, side = (S.side || 1) * (hoch ? C.sideHoch : C.side);
      const want = this.mount(this._w || (this._w = V()), p, f, u, side, hoch ? C.yHoch : C.y, hoch ? C.zHoch : C.z);
      // Bauteil zwischen Auto und Kamera (Röhre, Wand): heranziehen, aber nicht ins Auto
      const fr = this.ray(p, want);
      if (fr < 1) { const k = Math.max(hoch ? 0.35 : 0.82, fr - CINE.gap / (hoch ? C.zHoch : C.side)); set(want, p[0] + (want[0] - p[0]) * k, p[1] + (want[1] - p[1]) * k, p[2] + (want[2] - p[2]) * k); }
      // Wackeln (fest an der Zeit der Aufzeichnung → gleiches Bild bei gleicher Stelle)
      const a = C.shake * (0.6 + 0.4 * Math.min(1, Math.abs(P.speed || 30) / 60));
      want[0] += a * (Math.sin(t * 71) * 0.6 + Math.sin(t * 113) * 0.4); want[1] += a * Math.sin(t * 89 + 1.3); want[2] += a * Math.sin(t * 97 + 0.7) * 0.5;
      // tief am Auto: nie unter Gelände/Wasser (Rollen im Korkenzieher dicht über dem Boden)
      want[1] = Math.max(want[1], this.floor(want[0], want[2]) + 0.35);
      copy(O.pos, want);
      const look = this.mount(this._l || (this._l = V()), p, f, u, hoch ? 0 : -Math.sign(side) * C.inward, C.lookUp, -C.look);
      copy(O.look, look); copy(O.up, u);
      fov = C.fov; O.dof = C.dof;
    } else if (cam === 'onboard') {
      const C = CINE.onboard;
      this.mount(O.pos, p, f, u, 0, this.carTop + C.y, C.z);
      O.pos[1] = Math.max(O.pos[1], this.floor(O.pos[0], O.pos[2]) + 0.35);
      this.mount(O.look, p, f, u, 0, this.carTop + C.y + C.lookUp, -C.look);
      copy(O.up, u);
      fov = C.fov; O.dof = C.dof;
    } else if (cam === 'fan') {
      // Handkamera: Wackeln (feste Funktionen der Zeit – gleiches Bild bei gleicher Stelle), Schwenk mit Verzug, Zoom und
      // Schärfe ziehen nach
      const C = CINE.fan, h = C.shake;
      copy(O.pos, S.pos || [p[0] + 15, p[1] + 2, p[2]]);
      O.pos[0] += h * (Math.sin(t * 1.7) * 0.6 + Math.sin(t * 7.3 + 1) * 0.25 + Math.sin(t * 13.1) * 0.1);
      O.pos[1] += h * (Math.sin(t * 2.1 + 0.5) * 0.5 + Math.sin(t * 9.7) * 0.2);
      O.pos[2] += h * (Math.sin(t * 1.3 + 2) * 0.5 + Math.sin(t * 6.1) * 0.2);
      const tgt = [p[0], p[1] + 0.5, p[2]];
      this.follow(this.lk, [vel[0] * C.lead, vel[1] * C.lead, vel[2] * C.lead], dt, tgt, cut ? 1 : 1 - Math.exp(-dt * C.follow));
      const dC = Math.max(2, dist(O.pos, p)), wob = 0.012 * dC;
      copy(O.look, this.lk);
      O.look[0] += wob * Math.sin(t * 2.3 + 0.7); O.look[1] += wob * 0.7 * Math.sin(t * 3.1 + 1.9); O.look[2] += wob * Math.sin(t * 1.9);
      // Zoom nachführen (mit Verzug und leichtem „Pumpen“), Schärfe hinterher – kommt das Auto schnell näher, ist es kurz unscharf
      const want = 2 * Math.atan((S.big ? C.fitBig : C.fit) * (1 + 0.08 * Math.sin(t * 1.1)) / 2 / dC) * 180 / Math.PI;
      if (cut || this.fanFov == null) { this.fanFov = want; this.fanFocus = dC; }
      this.fanFov += (want - this.fanFov) * (1 - Math.exp(-dt * C.zoomK));
      this.fanFocus += (dC - this.fanFocus) * (1 - Math.exp(-dt * C.focusK));
      fov = clamp(this.fanFov, 6, 70);
      // hochkant: Ausschnitt über die Bildbreite (das schmale Bild schneidet das Auto sonst ab)
      const a = aspect || 1.6;
      if (a < 1) fov = clamp(2 * Math.atan(Math.tan(fov * Math.PI / 360) * 1.25 / a) * 180 / Math.PI, 10, 100);
      O.dof = C.dof; O.focusOv = this.fanFocus; O.fan = true;
    } else if (cam === 'crane') {
      // Kran: vorab berechnete Bahn (zwischen den Abtastungen linear), Blick aufs Auto, Schärfe wandert vom Vordergrund aufs Auto
      const C = CINE.crane, P2 = S.pts || [[p[0] + 12, p[1] + 4, p[2]]], x = clamp((t - shot.t0) / (S.dt || 0.15), 0, P2.length - 1.001), i = Math.floor(x), a = x - i, q0 = P2[i], q1 = P2[Math.min(P2.length - 1, i + 1)];
      set(O.pos, q0[0] + (q1[0] - q0[0]) * a, q0[1] + (q1[1] - q0[1]) * a, q0[2] + (q1[2] - q0[2]) * a);
      this.follow(this.lk, vel, dt, [p[0], p[1] + 0.6, p[2]], cut ? 1 : 1 - Math.exp(-dt * 5));
      copy(O.look, this.lk);
      fit = S.big ? C.fitBig : C.fit;
      O.dof = C.dof;
      const dC = Math.max(2, dist(O.pos, p));
      O.focusOv = dC * (0.35 + 0.65 * sstep(0, 0.45, uS));
    } else if (cam === 'low') {
      // Bodenkamera: fest, Blick aufs Auto (leicht nach oben), weites Objektiv, Rumpeln, wenn das Auto nah ist
      const C = CINE.low;
      copy(O.pos, S.pos || [p[0] + 3, p[1], p[2]]);
      const dC = Math.max(1, dist(O.pos, p)), rb = Math.min(0.02, 0.06 / dC);
      O.pos[1] += rb * Math.sin(t * 83); O.pos[0] += rb * Math.sin(t * 71 + 1);
      this.follow(this.lk, vel, dt, [p[0], p[1] + 0.3, p[2]], cut ? 1 : 1 - Math.exp(-dt * 9));
      copy(O.look, this.lk);
      fov = (aspect || 1.6) < 1 ? C.fovHoch : C.fov;
      O.dof = C.dof;
    } else if (cam === 'rear') {
      // Heckkamera: über dem Dach, Blick zurück übers Heck die Straße hinunter (im Flug: auf die Lippe)
      const C = CINE.rear;
      const want = this.mount(this._w || (this._w = V()), p, f, u, 0, this.carTop + C.y, C.z);
      const fr = this.ray(p, want);
      if (fr < 1) set(want, p[0] + (want[0] - p[0]) * Math.max(0.5, fr - 0.1), p[1] + (want[1] - p[1]) * Math.max(0.5, fr - 0.1), p[2] + (want[2] - p[2]) * Math.max(0.5, fr - 0.1));
      want[1] = Math.max(want[1], this.floor(want[0], want[2]) + 0.4);
      copy(O.pos, want);
      this.mount(O.look, p, f, u, 0, this.carTop + C.lookY, C.look);
      copy(O.up, u);
      fov = (aspect || 1.6) < 1 ? clamp(C.fov * 1.25, 30, 100) : C.fov;
      O.dof = C.dof;
    } else if (cam === 'arch') {
      // Zielbogen: fester Standort (Kran steigt leicht), Schwenk vom Auto hinauf auf Bogen und Feuerwerk
      const C = CINE.arch, uP = sstep(0, ZIEL.pan, t - shot.t0);
      copy(O.pos, S.pos || [p[0] + 20, p[1] + 5, p[2]]);
      O.pos[1] += C.rise * uS;
      const A = S.anchor || p, car = [p[0], p[1] + 0.6, p[2]];
      const tgt = [car[0] + (A[0] - car[0]) * uP, car[1] + (A[1] - car[1]) * uP, car[2] + (A[2] - car[2]) * uP];
      this.follow(this.lk, uP < 0.98 ? vel : [0, 0, 0], dt, tgt, cut ? 1 : 1 - Math.exp(-dt * 6));
      // leichtes Schweben (Kran), fest an der Zeit
      O.pos[0] += 0.08 * Math.sin(t * 0.9); O.pos[1] += 0.06 * Math.sin(t * 1.3 + 0.4);
      copy(O.look, this.lk);
      const dC = Math.max(4, dist(O.pos, car)), dA = Math.max(8, dist(O.pos, A));
      const fC = 2 * Math.atan(C.fitCar / 2 / dC) * 180 / Math.PI, fA = 2 * Math.atan(C.fitArch / 2 / dA) * 180 / Math.PI;
      fov = clamp(fC + (fA - fC) * uP, 18, 86);
      if ((aspect || 1.6) < 1) fov = clamp(fov * 1.15, 24, 95);
      O.dof = C.dof * (1 - uP);
    } else {
      // Stativ: fester Standort, Schwenk weich hinterher, Zoom von weit (Anfang) auf eng (Höhepunkt)
      const C = CINE.tele;
      copy(O.pos, S.pos || [p[0] + 20, p[1] + 5, p[2]]);
      const ak = (clip && C.anchorK[clip.kind]) || 0, A = S.anchor || p;
      this.follow(this.lk, vel, dt, [p[0] + (A[0] - p[0]) * ak, p[1] + 0.4 + (A[1] - p[1]) * ak, p[2] + (A[2] - p[2]) * ak], cut ? 1 : 1 - Math.exp(-dt * C.pan));
      copy(O.look, this.lk);
      const z = clip ? clamp((t - shot.t0) / Math.max(0.2, clip.tp - shot.t0), 0, 1) : uS;
      const [fw, ft] = (clip && C.fit[clip.kind]) || [C.fitWide, C.fitTight];
      // n26: am Looping wächst der Ausschnitt mit dem Stunt-Maßstab der Strecke (Looping 23 statt 14,5 m hoch)
      const sk = clip && clip.kind === 'loop' ? (this.env.track.stuntScale ?? 1) : 1;
      fit = (fw + (ft - fw) * (z * z * (3 - 2 * z))) * sk;
      O.dof = C.dof;
    }
    const d = Math.max(1, dist(O.pos, p));
    if (fov == null) {
      // Bildausschnitt: fit Meter um das Auto sichtbar – quer über die Höhe, hochkant über die Breite (Hochformat:
      // senkrechtes Sichtfeld so weit, dass das Auto auch seitlich hineinpasst)
      const a = Math.max(0.2, aspect || 1.6);
      fov = 2 * Math.atan(fit / 2 / d) * 180 / Math.PI;
      if (a < 1) fov = Math.max(fov, 2 * Math.atan(fit * 1.15 / 2 / d / a) * 180 / Math.PI);
      fov = clamp(fov, 4, cam === 'heli' ? 70 : 90);
    } else if ((aspect || 1.6) < 1 && cam !== 'arch') fov = clamp(fov * 1.25, 30, 100);
    if (this.fovInit || cam === 'action' || cam === 'onboard') { this.fov = fov; this.fovInit = false; } else this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 4));
    O.fov = this.fov;
    O.focus = O.focusOv != null ? O.focusOv : d;
    O.focusOv = null;
    if (cam !== 'fan') O.fan = false;
    this.effects(dt, t, shot, clip, cut);
    return O;
  }
  // n27: Landungs-Ruckeln und Reißschwenk (nach der eigentlichen Kamera, auf Position/Blick/Unschärfe)
  effects(dt, t, shot, clip, cut) {
    const O = this.out, S = shot.setup || {};
    this.sRT = cut ? 0 : (this.sRT || 0) + dt;
    O.whip = null;
    if (shot.cam === 'arch') return;
    // Landung: abklingendes Ruckeln (Aufzeichnungszeit – in der Zeitlupe länger)
    let sh = 0;
    for (const L of S.lands || []) if (t >= L.t && t < L.t + 1.2) sh += L.k * Math.exp(-(t - L.t) / 0.22);
    if (sh > 0.01) {
      const a = Math.min(0.25, sh * 0.16) * (shot.cam === 'onboard' || shot.cam === 'action' || shot.cam === 'rear' ? 0.6 : 1);
      const ox = a * Math.sin(t * 61), oy = a * Math.sin(t * 47 + 1), oz = a * Math.sin(t * 53 + 2);
      O.pos[0] += ox; O.pos[1] += oy; O.pos[2] += oz; O.look[0] += ox * 0.5; O.look[1] += oy * 0.5; O.look[2] += oz * 0.5;
    }
    // Reißschwenk: am Anfang (whipIn) bzw. Ende (whipOut) einer Einstellung schnell um die Hochachse, mit Unschärfe
    const W = 0.2, sp = clip ? Math.max(0.15, clipSpeed(clip, t)) : 1, toEnd = (shot.t1 - t) / sp;
    let ang = 0;
    if (shot.whipIn && this.sRT < W) { const e = 1 - this.sRT / W; ang = shot.whipIn * CINE.whip.ang * e * e; }
    if (shot.whipOut && toEnd < W) { const e = 1 - Math.max(0, toEnd) / W; ang = -shot.whipOut * CINE.whip.ang * e * e; }
    if (Math.abs(ang) > 1e-3) {
      const dx = O.look[0] - O.pos[0], dz = O.look[2] - O.pos[2], c = Math.cos(ang), sn = Math.sin(ang);
      O.look[0] = O.pos[0] + dx * c - dz * sn; O.look[2] = O.pos[2] + dx * sn + dz * c;
      O.whip = { len: CINE.whip.blur * Math.abs(ang) / CINE.whip.ang, ang: 0 };
    }
  }
  // Zielpunkt vorausschauend nachführen: läuft mit dem Auto mit (kein Hinterherhinken bei Tempo), zieht weich nach
  follow(o, vel, dt, target, k) {
    set(o, o[0] + vel[0] * dt, o[1] + vel[1] * dt, o[2] + vel[2] * dt);
    return lerpTo(o, target, k);
  }
  // bewegte Kamera an want setzen: Strahl vom Auto zur Wunschposition, bei Treffer heranziehen (schnell hinein, langsam
  // wieder hinaus), nie unter Gelände/Wasser
  place(want, p, dt) {
    const O = this.out, o = this._o || (this._o = V());
    set(o, p[0], p[1] + 1.0, p[2]);
    const L = dist(want, o);
    let fr = this.ray(o, want);
    let free = fr >= 1 ? L : Math.max(CINE.minDist, fr * L - CINE.gap);
    if (this.free == null) this.free = free;
    else this.free = free < this.free ? this.free + (free - this.free) * (1 - Math.exp(-dt * 20)) : this.free + (free - this.free) * (1 - Math.exp(-dt * 1.5));
    const k = Math.min(L, this.free) / Math.max(L, 1e-3);
    set(O.pos, o[0] + (want[0] - o[0]) * k, o[1] + (want[1] - o[1]) * k, o[2] + (want[2] - o[2]) * k);
    const g = this.floor(O.pos[0], O.pos[2]) + CINE.ground;
    if (O.pos[1] < g) O.pos[1] = g;
  }
}
