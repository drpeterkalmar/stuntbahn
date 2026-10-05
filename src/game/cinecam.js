// Kino-Replay (n18): Kameras des Highlight-Films – rein rechnerisch (kein three.js), damit Node die Positionen gegen
// Strecke und Gelände prüfen kann (tests/node/test_kinoreplay.mjs). main.js überträgt das Ergebnis auf die Kamera.
//   drone   Drohne: folgt seitlich von oben, weich, leichte Kreisfahrt um das Auto
//   action  Action-Cam: tief seitlich am Auto montiert (dreht im Looping mit), leichtes Wackeln
//   tele    Stativ mit Tele an der Landestelle (bzw. am Looping, an der Crash-Stelle, hinter der Ziellinie): Zoom + Schwenk
//   heli    Hubschrauber: weit und hoch, Überblick
//   onboard auf dem Dach, Blick nach vorn (kurz)
// Kein Clipping: feste Standorte werden vorab gegen Strecke, Gelände und Wasser geprüft (frei, nicht unter einer Brücke,
// nicht auf der Fahrbahn, Sicht aufs Auto über die ganze Einstellung); bewegte Kameras wählen die freiere Seite und
// werden in jedem Bild per Strahl vom Auto aus herangezogen, wenn ein Bauteil oder der Hang dazwischen liegt.
import { poseAt } from './highlights.js';

export const CINE = {
  drone: { R: 10, H: 4.2, phi0: -0.6, phi1: 0.3, fit: 8, dof: 0.75, follow: 6, look: 8 },
  heli: { R: 40, H: 24, phi0: -0.95, phi1: -0.4, fit: 18, dof: 0.4, follow: 2.2, look: 3 },
  // Action-Cam quer seitlich am hinteren Kotflügel, hochkant weiter hinten (sonst passt das Auto nicht ins schmale Bild)
  action: { side: 1.6, y: -0.3, z: 2.8, zHoch: 6.5, sideHoch: 0.4, yHoch: 0.15, look: 14, inward: 1.2, lookUp: 0.35, fov: 68, shake: 0.012, dof: 0.55 },
  onboard: { y: 0.18, z: 0.35, look: 25, lookUp: 0.4, fov: 66, dof: 0.2 },
  // Bildausschnitt (m um das Auto) von weit (Anfang) auf eng (Höhepunkt); am Looping der ganze Looping im Bild (Blick
  // zwischen Looping-Mitte und Auto), am Ziel etwas weiter
  tele: { dist: [22, 32, 44], h: [1.6, 4, 9], along: [-14, 0, 14], fitWide: 11, fitTight: 5, fit: { loop: [30, 20], finish: [14, 7] }, anchorK: { loop: 0.45 }, pan: 5, dof: 1 },
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
    return {};
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
    } else if (c.kind === 'finish') A = at(c.b);
    else A = at(c.tp);
    if (c.kind !== 'loop') this.horiz(this.pose(c.kind === 'finish' ? c.b : jumpy && m.t1 != null ? m.t1 : c.tp).f, fh, fh);
    const cand = V(), car = V(), rx = -fh[2], rz = fh[0];
    let best = null;
    const dk = c.kind === 'loop' ? Math.sqrt(this.env.track.stuntScale ?? 1) : 1;   // n26: größerer Looping → etwas weiter weg
    for (const side of [1, -1]) for (const d0 of C.dist) for (const al of C.along) for (const h of C.h) {
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
    } else if ((aspect || 1.6) < 1) fov = clamp(fov * 1.25, 30, 100);
    if (this.fovInit || cam === 'action' || cam === 'onboard') { this.fov = fov; this.fovInit = false; } else this.fov += (fov - this.fov) * (1 - Math.exp(-dt * 4));
    O.fov = this.fov;
    O.focus = d;
    return O;
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
