// Kameras: Verfolger (folgt Fahrzeug-Oben weich → dreht im Looping mit), Cockpit (Fahrerplatz, dreht mit
// dem Auto), Stoßstange, Streckenkameras (feste Masten an der Strecke, schwenken mit) für Replays.
import * as THREE from 'three';
import { Tracker } from '../ai/autopilot.js';
import { ROAD_HW, WORLD_SCALE } from '../track/defs.js';

const V = () => new THREE.Vector3();
export const CAM_MODES = ['chase', 'cockpit', 'far', 'bumper', 'track'];
export const CAM_NAMES = { chase: 'Verfolger', cockpit: 'Cockpit', far: 'Hubschrauber', bumper: 'Stoßstange', track: 'Streckenkamera' };
// URL-Regler (Browser): ?eye= Augenhöhe, ?hz= Horizont, ?dash= Armaturenbrett (s. u.)
const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const qnum = (k, lo, hi) => { const v = parseFloat(Q.get(k)); return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null; };
// Cockpit: Augenpunkt in Auto-Koordinaten (x rechts, y oben, z hinten): Fahrer links, ~1 m über der Straße
export const EYE = { x: -0.34, y: qnum('eye', 0.1, 1.2) ?? 0.45, z: 0.12 };
// Cockpit-Ausschnitt (n15, Peter 28.09.: „Im Cockpit sieht man die Straße nicht“): Der Horizont liegt per
// Objektiv-Verschiebung (setViewOffset, keine Neigung) im oberen Drittel, das Armaturenbrett beginnt erst bei
// ~70 % der Bildhöhe → dazwischen die Fahrbahn. Anteile der Bildhöhe von oben; ?hz= / ?dash= übersteuern.
export const COCKPIT_VIEW = { hz: qnum('hz', 0.15, 0.5), dash: qnum('dash', 0.4, 0.95) };
export const cockpitHorizon = (aspect) => COCKPIT_VIEW.hz ?? (aspect < 1 ? 0.3 : 0.32);
export const cockpitDash = (aspect) => COCKPIT_VIEW.dash ?? 0.7;
// Objektiv-Verschiebung aus (alle anderen Ansichten, Menü)
export function clearLens(cam) { if (cam.view && cam.view.enabled) cam.clearViewOffset(); }
// Festes Sichtfeld im Cockpit: 75° waagrecht (Querformat); vertikal daraus, begrenzt auf 34–75° (Hochformat)
export function cockpitFov(aspect) {
  const v = 2 * Math.atan(Math.tan(37.5 * Math.PI / 180) / Math.max(0.2, aspect)) * 180 / Math.PI;
  return Math.max(34, Math.min(75, v));
}
// Hochformat (Handy hochkant): Verfolger höher, weiter hinten, größeres vertikales Sichtfeld, Blick weiter
// voraus → Auto im unteren Drittel, mehr Strecke voraus. Anteil p = 0 (quer/Desktop, unverändert) … 1 (≤ 0,5).
// Dazu blickt der Verfolger anteilig (aim) auf einen Punkt der Strecke aimDist + aimSpeed·v Meter voraus: Kurven
// laufen hochkant sonst seitlich aus dem schmalen Bild.
// Abgestimmt mit tests/hochformat_cam.py (Auto im unteren Drittel, Strecke voraus im Bild, Auto nie am Rand).
// aimDist wächst mit dem Weltmaßstab (Kurvenradien = Feld; bis 27.09.2026 40 m)
export const PORTRAIT = { vfov: 88, dist: 2.2, h: 3.6, look: 12, lookUp: -0.5, speedFov: 0.5, aim: 0.5, aimDist: 40 * WORLD_SCALE, aimSpeed: 0.6 };
export function portraitK(aspect) { return Math.max(0, Math.min(1, (1 - aspect) / 0.5)); }
const AIM_MAX = 14 * Math.PI / 180;   // hochkant: größtes Eindrehen in die Kurve
const CP_SUSP = +(Q.get('cpsusp') ?? 1);   // Cockpit: Anteil Federungs-Ausgleich (n14: 0,5)
const LAG_MAX = 3.0; // m: größter Verzug des Verfolgers hinter dem Auto (Tempo-Nachführung)
// Verdeckungs-Strahlen (n19): Versatz um die Wunschposition (seitlich, oben; m, ~Nahebene), Abstand zum Bauteil (m)
const CAM_RAYS = [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.35], [0, -0.35]], CAM_GAP = 0.55;

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'chase';
    this.pos = V(); this.up = new THREE.Vector3(0, 1, 0); this.fwd = new THREE.Vector3(0, 0, -1);
    this.look = V();
    this.init = false;
    this.trackCams = [];
    this.tcIdx = 0;
    this.fov = 62;
    this._t = V(); this._d = V(); this._u = V(); this._h = V();
    this.airT = 0; this.airK = 0; this.baseY = 0;
    this.lastCp = V(); this.hasCp = false;
    this.view = 'chase';     // tatsächlich gezeigte Ansicht (Cockpit → Verfolger beim Wrack)
    // Cockpit: geglättete Lage
    this.cq = new THREE.Quaternion(); this.cInit = false;
    this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._q3 = new THREE.Quaternion(); this._e = new THREE.Euler();
    // Kameraschütteln (Verfolger): Anregung aus dem Federweg der Räder (Bodenwellen), klingt schnell ab
    this.shake = 0; this.shT = 0; this.lastComp = null; this.shakeOn = true;
  }
  // sehr dezent: höchstens ~4 cm, Frequenz 9–14 Hz; dazu ab ~250 km/h ein feines Tempo-Zittern (≤ 1 cm)
  shakeOffset(dt, P, speed) {
    const w = P.wheels;
    let ex = 0;
    if (w && dt > 1e-4) {
      if (!this.lastComp) this.lastComp = w.map((x) => x.comp || 0);
      for (let i = 0; i < w.length; i++) { const c = w[i].comp || 0; ex += Math.abs(c - this.lastComp[i]); this.lastComp[i] = c; }
      ex /= dt;   // m/s Federweg-Geschwindigkeit (Summe der vier Räder)
    }
    // Wiese (n21): leichtes Rumpeln, solange Räder im Gras rollen (stärker, solange die Wiese noch abbremst)
    let gr = 0;
    if (w) for (const x of w) if (x.contact && x.mat === 8) gr += 0.25;
    const want = Math.min(1, Math.max(0, ex - 0.6) / 5 + gr * Math.min(1, speed / 8) * (speed > 9 ? 0.6 : 0.3));
    this.shake = Math.max(this.shake * Math.exp(-dt * 7), want);
    this.shT += dt;
    const hi = Math.max(0, Math.min(1, (speed - 70) / 90));
    const a = this.shakeOn ? 0.04 * this.shake + 0.008 * hi : 0, t = this.shT;
    return [a * (Math.sin(t * 71) * 0.6 + Math.sin(t * 113) * 0.4), a * 0.6 * Math.sin(t * 89 + 1.3)];
  }
  setTrackCams(track) {
    // Masten neben der Strecke an Stunt-Bauwerken (Auto-Maßstab: ab 45 m Abstand) und sonst alle ~120 m
    // (wächst mit dem Weltmaßstab). Schritt nach Bogenlänge (~2 m), der Mast steht 8,5 m neben der Fahrbahnkante.
    // Stunt = Looping/Röhre/Luft/Sprung-Lippe selbst, nicht der Anfang des (im größeren Feld längeren) Stücks
    const L = track.line, out = [], WS = WORLD_SCALE, off = ROAD_HW + 8.5;
    const lip = new Uint8Array(L.n);
    for (const j of track.jumps || []) for (let i = Math.max(0, j.lipIdx - 8); i <= Math.min(L.n - 1, j.lipIdx); i++) lip[i] = 1;
    let lastS = -1e9, lastI = -1e9;
    for (let i = 0; i < L.n; i++) {
      if (L.s[i] - L.s[Math.max(0, lastI)] < 2 && lastI >= 0) continue;
      lastI = i;
      const pc = track.pieces[L.piece[i]];
      const structure = L.loop[i] || L.tube[i] || L.air[i] || lip[i] || (pc && pc.stunt && !/^(jump|loop|tube|tr_loop|tr_corklr|tr_pipe|tr_gap)/.test(pc.type));
      const want = (structure && L.s[i] - lastS > 45) || L.s[i] - lastS > 120 * WS;
      if (!want) continue;
      lastS = L.s[i];
      const side = (out.length % 2) ? 1 : -1;
      const p = new THREE.Vector3(L.px[i] + L.bx[i] * side * off, Math.max(L.py[i], 0) + 5.5, L.pz[i] + L.bz[i] * side * off);
      out.push({ p, s: L.s[i], i });
    }
    this.trackCams = out;
    this.line = L; this.trk = new Tracker(L); this.trkOk = false;
    this.cork = track.pieces.map((pc) => !!pc && /cork/.test(pc.kind || pc.type || ''));
    this.aimK = 0; this.hiK = 1; this.aimDir = new THREE.Vector3(); this.aimInit = false;
  }
  // Hochformat: Richtung (nur Gieren, ⟂ Kamera-Oben) zu einem Punkt der Fahrlinie voraus; Gewicht 0, wenn das
  // Auto weit neben der Strecke, im Looping/in der Röhre/im Korkenzieher, kopfüber oder in der Luft ist.
  // Nebenbei hiK: Anteil der Hochkant-Zusatzhöhe/-distanz – in Looping/Röhre/Korkenzieher weich auf 0 (die
  // höhere Kamera würde dort vom Bauwerk abgefangen und dicht ans Auto rücken)
  aimAhead(dt, cp, speed, pk, air) {
    const L = this.line, tr = this.trk, PT = PORTRAIT;
    let want = 0, hi = 1;
    if (L && pk > 0) {
      tr.update(cp.x, cp.y, cp.z, !this.trkOk);
      this.trkOk = tr.dist < 25;
      const stunt = this.trkOk && (this.up.y < 0.6 || this.stuntAhead(tr.idx, Math.max(18, 0.4 * speed)));
      if (stunt) hi = 0;
      if (this.trkOk && !air && !stunt) {
        const n = L.n, D = PT.aimDist + PT.aimSpeed * speed;
        let i = tr.idx, acc = 0;
        for (let k = 0; k < n && acc < D; k++) {
          const j = i + 1 < n ? i + 1 : (L.closed ? 0 : i);
          if (j === i) break;
          acc += Math.hypot(L.px[j] - L.px[i], L.py[j] - L.py[i], L.pz[j] - L.pz[i]);
          i = j;
        }
        const a = this._a || (this._a = new THREE.Vector3());
        a.set(L.px[i] - cp.x, L.py[i] - cp.y, L.pz[i] - cp.z).addScaledVector(this.up, -a.dot(this.up));
        if (a.lengthSq() > 1) {
          a.normalize();
          if (!this.aimInit) { this.aimDir.copy(a); this.aimInit = true; }
          this.aimDir.lerp(a, 1 - Math.exp(-dt * 4)).normalize();
          want = pk * PT.aim;
        }
      }
    }
    this.aimK += (want - this.aimK) * (1 - Math.exp(-dt * 3));
    this.hiK += (hi - this.hiK) * (1 - Math.exp(-dt * (hi ? 1.5 : 4)));
    return this.aimK;
  }
  // Looping, Röhre oder Korkenzieher/Wendel ab Linienpunkt i0 innerhalb der nächsten m Meter?
  stuntAhead(i0, m) {
    const L = this.line, n = L.n, C = this.cork;
    for (let i = i0, k = 0, acc = 0; k < n && acc <= m; k++) {
      if (L.loop[i] || L.tube[i] || C[L.piece[i]]) return true;
      const j = i + 1 < n ? i + 1 : (L.closed ? 0 : i);
      if (j === i) break;
      acc += Math.hypot(L.px[j] - L.px[i], L.py[j] - L.py[i], L.pz[j] - L.pz[i]);
      i = j;
    }
    return false;
  }
  cycle() {
    const modes = CAM_MODES;
    this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
    this.init = false;
    return this.mode;
  }
  update(dt, P, crashed, world, speed = 0) {
    const cam = this.cam;
    const cp = this._t.set(P.pos.x, P.pos.y, P.pos.z);
    const f = this._d.set(P.frame.f.x, P.frame.f.y, P.frame.f.z);
    const u = this._u.set(P.frame.u.x, P.frame.u.y, P.frame.u.z);
    if (crashed) { u.set(0, 1, 0); }
    if (!this.init) { this.cInit = false; this.fwd.copy(f); this.up.copy(u); this.init = true; this.pos.copy(cp).addScaledVector(f, -6).addScaledVector(u, 2.3); this.baseY = cp.y; this.airK = 0; this.hasCp = false; this.trkOk = false; this.aimK = 0; this.hiK = 1; this.aimInit = false; }
    // Flug (alle Räder frei, nicht in Looping/Röhre): Verfolger zieht nicht mit hoch, sondern bleibt auf
    // Absprunghöhe, etwas weiter hinten und waagrecht → der Sprung wirkt sichtbar hoch. airK blendet weich.
    this.airT = P.air && !crashed ? this.airT + dt : 0;
    const airOn = this.airT > 0.12 ? 1 : 0;
    this.airK += (airOn - this.airK) * (1 - Math.exp(-dt * (airOn ? 3.5 : 2.2)));
    if (this.airK < 0.02 && !airOn) this.baseY = cp.y;       // am Boden: Bezugshöhe = Auto
    else this.baseY = Math.min(cp.y, this.baseY + dt * 0.4); // im Flug: bleibt unten, folgt nur abwärts
    const kf = 1 - Math.exp(-dt * 7);
    const ku = 1 - Math.exp(-dt * 3.2);
    // Im Crash: Richtung von vor dem Unfall halten (Kamera dreht nicht mit dem Wrack), nur Oben → Welt
    if (!crashed) this.fwd.lerp(f, kf).normalize();
    else { this.fwd.y *= 0.9; this.fwd.normalize(); }
    // im Flug: Oben → Welt-Oben (Kamera kippt nicht mit der Nase des Autos)
    if (this.airK > 0.01 && (this.mode === 'chase' || this.mode === 'far')) u.lerp(this._h.set(0, 1, 0), this.airK).normalize();
    this.up.lerp(u, ku).normalize();
    // Tempo-Sichtfeld: bis ~315 km/h wie bisher +14°, darüber (seit Vmax ~580 km/h) sanft bis +20°
    const pk = portraitK(cam.aspect), PT = PORTRAIT;
    let targetFov = 62 + pk * (PT.vfov - 62) + (1 - pk * PT.speedFov) * (Math.min(14, speed * 0.16) + 6 * Math.max(0, Math.min(1, (speed - 70) / 85)));
    if (pk > 0) targetFov = Math.min(targetFov, 62 + pk * (PT.vfov + 8 - 62) + 14 * (1 - pk));   // hochkant höchstens ~96°
    // Nitro: Sichtfeld etwas weiter (quer +8°, hochkant +4°) – nicht im Cockpit (festes Sichtfeld gegen Übelkeit)
    targetFov += (this.boost || 0) * (8 - 4 * pk);
    // Drehen (quer ↔ hoch): Sichtfeld sofort umstellen statt langsam nachzuziehen
    if (this.aspect !== cam.aspect) { if (this.aspect != null && Math.abs(portraitK(this.aspect) - pk) > 0.05) this.fov = targetFov; this.aspect = cam.aspect; }
    // Cockpit beim Wrack: kurz in den Verfolger (wie im Original), danach wieder zurück ins Cockpit
    const view = this.mode === 'cockpit' && crashed ? 'chase' : this.mode;
    if (view !== this.view && view === 'cockpit') this.cInit = false;
    this.view = view;
    if (view !== 'cockpit') clearLens(cam);
    if (view === 'cockpit') {
      this.cockpit(dt, P, cp);
      return;
    }
    const hadCp = this.hasCp;
    this.hasCp = false;
    if (view === 'chase' || this.mode === 'far') {
      this.hasCp = hadCp;
      // Hochkant: Blick in die Kurve (Gewicht w) und Zusatzhöhe/-distanz (Anteil ph, in Loopings/Röhren weg)
      const w = this.aimAhead(dt, cp, speed, pk, this.airK > 0.5 || crashed), ph = pk * this.hiK;
      // Verfolger näher am Auto (Peter 27.09.: vorher 6.8 m / 2.15 m)
      const dist = (this.mode === 'far' ? 11.5 : crashed ? 8 : 5.0) + ph * PT.dist, h = (this.mode === 'far' ? 3.8 : crashed ? 3.0 : 1.75) + ph * PT.h;
      // Flug: Blickrichtung waagrecht, 1,5 m weiter zurück, Höhe bleibt bei der Absprunghöhe (85 %)
      const a = this.airK, back = this._h.copy(this.fwd);
      if (a > 0) { back.y *= 1 - a; back.normalize(); }
      const want = V().copy(cp).addScaledVector(back, -(dist + 1.5 * a)).addScaledVector(this.up, h);
      if (a > 0) want.y -= a * 0.85 * Math.max(0, cp.y - this.baseY);
      // Kamera nicht durch Bauwerke (n19, 3D-Strecken: Decks, Pfeiler, obere Fahrbahn, Spiralen): fünf Strahlen vom
      // Auto zur Wunschposition (Mitte + ±Nahebene seitlich/oben) gegen die Kollisionswelt; die kürzeste freie Länge
      // zieht die Kamera heran – schnell hinein, langsam wieder hinaus (kein Pumpen an Pfeilerreihen). Bis n18 ein
      // Strahl ohne Glättung.
      const occ = world ? this.occlude(dt, cp, want, world) : null;
      if (world) {
        const gy = world.terrain.height(want.x, want.z) + 0.6;
        if (want.y < gy) want.y = gy;
      }
      // Nachführung: Verzug hinter dem Auto ~ Tempo/14 (bei 100 km/h ~2 m, wirkt lebendig). Bei hohem Tempo
      // (Vmax ~580 km/h) wären das > 11 m – daher wird die Kamera vorab um einen Teil der Autobewegung
      // mitgenommen, der Verzug bleibt höchstens LAG_MAX m (bis 27.09.2026: nur das Nachziehen).
      const kp = 1 - Math.exp(-dt * 14);
      if (this.hasCp && !crashed) {
        const vcar = this._h.subVectors(cp, this.lastCp), stepLen = vcar.length();
        const v = stepLen / Math.max(dt, 1e-4), carry = v > 1 ? Math.max(0, 1 - LAG_MAX * 14 / v) : 0;
        if (stepLen < 30) this.pos.addScaledVector(vcar, carry);   // kein Mitnehmen bei Teleport (Reset)
      }
      this.pos.lerp(want, kp);
      // harte Grenze: die tatsächliche Kameraposition (nach Nachführen) liegt nie hinter einem Bauteil
      if (occ) this.clampFree(occ.o, world);
      cam.position.copy(this.pos);
      if (view === 'chase' && !crashed) {
        const [sy, sx] = this.shakeOffset(dt, P, speed);
        cam.position.addScaledVector(this.up, sy).addScaledVector(this._v || (this._v = V()).crossVectors(this.fwd, this.up).normalize(), sx);
      }
      cam.up.copy(this.up);
      // Blickrichtung: Fahrtrichtung, hochkant anteilig in die Kurve voraus gedreht (Neigung bleibt die des Autos)
      const dir = this._h.copy(this.fwd);
      if (w > 0.001) {
        // Gieren um Kamera-Oben: Anteil w des Winkels zum Zielpunkt, höchstens AIM_MAX (Auto bleibt sicher im
        // Bild); liegt der Punkt fast quer/hinter dem Auto (Wendel, Kehre), sanft aus
        const up = this.up, fh = V().copy(this.fwd).addScaledVector(up, -this.fwd.dot(up));
        if (fh.lengthSq() > 1e-4) {
          fh.normalize();
          const th = Math.acos(Math.max(-1, Math.min(1, fh.dot(this.aimDir))));
          const fade = Math.max(0, Math.min(1, (1.9 - th) / 0.5));
          const yaw = Math.min(w * th, AIM_MAX) * fade * Math.sign(V().crossVectors(fh, this.aimDir).dot(up));
          const side = V().crossVectors(up, fh);   // links von fh
          dir.copy(fh).multiplyScalar(Math.cos(yaw)).addScaledVector(side, Math.sin(yaw)).addScaledVector(up, this.fwd.dot(up)).normalize();
        }
      }
      this.look.copy(cp).addScaledVector(dir, 3.5 + ph * PT.look).addScaledVector(this.up, 0.9 + ph * PT.lookUp);
      cam.lookAt(this.look);
      this.lastCp.copy(cp); this.hasCp = true;
    } else if (this.mode === 'bumper') {
      // Echte Stoßstangen-Sicht (n15): knapp vor der Frontschürze, ~42 cm über der Fahrbahn. Bis n14 saß die Kamera
      // 0,2 m hinter der Wagenmitte IN der Karosserie → Dachkante und Scheibenrahmen lagen als zwei Querstriche im
      // Bild. Vor der Nase liegt nichts vom Auto im Blickfeld (auch keine Nitro-Flammen), der Schatten bleibt.
      const B = this.carBox, nose = B ? -B.min.z : 2.3, floor = B ? B.min.y : -0.55;
      this.pos.copy(cp).addScaledVector(f, nose + 0.12).addScaledVector(u, floor + 0.42);
      cam.position.copy(this.pos);
      cam.up.copy(u);
      this.look.copy(this.pos).addScaledVector(f, 10);
      cam.lookAt(this.look);
      targetFov += 6;
    } else if (this.mode === 'track') {
      // nächster Mast vor/neben dem Auto
      let best = null, bd = 1e18;
      for (const c of this.trackCams) { const d = c.p.distanceToSquared(cp); if (d < bd) { bd = d; best = c; } }
      if (best) {
        cam.position.copy(best.p);
        cam.up.set(0, 1, 0);
        cam.lookAt(cp);
        targetFov = Math.max(18, Math.min(55, 900 / Math.max(8, Math.sqrt(bd)))) * (1 + 0.5 * pk);
      }
    }
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 3);
    if (Math.abs(cam.fov - this.fov) > 0.05) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
  // Verdeckung: freie Länge vom Auto (1,2 m über dem Wagen) Richtung Wunschposition want (wird verkürzt). Liefert { o }.
  occlude(dt, cp, want, world) {
    const o = this._oc || (this._oc = V()), d = this._od || (this._od = V()), sd = this._os || (this._os = V()), u2 = this._ou || (this._ou = V()), t = this._ot || (this._ot = V());
    o.copy(cp).addScaledVector(this.up, 1.2);
    d.subVectors(want, o);
    const L = d.length();
    if (L < 1e-3) return { o };
    d.divideScalar(L);
    sd.crossVectors(d, this.up); if (sd.lengthSq() < 1e-6) sd.set(1, 0, 0); sd.normalize();
    u2.crossVectors(sd, d).normalize();
    let free = L;
    for (const [a, b] of CAM_RAYS) {
      t.copy(want).addScaledVector(sd, a).addScaledVector(u2, b).sub(o);
      const len = t.length(); t.divideScalar(len);
      const hit = world.rayTrack(o.x, o.y, o.z, t.x, t.y, t.z, len, false);
      if (hit) free = Math.min(free, hit.t / len * L - CAM_GAP);
    }
    free = Math.max(0.8, free);
    if (this.camFree == null || !this.hasCp) this.camFree = free;
    else this.camFree = free < this.camFree ? this.camFree + (free - this.camFree) * (1 - Math.exp(-dt * 20)) : this.camFree + (free - this.camFree) * (1 - Math.exp(-dt * 1.6));
    this.camFree = Math.min(this.camFree, L);
    this.occK = 1 - this.camFree / L;   // Anteil herangezogen (Tests/Anzeige)
    want.copy(o).addScaledVector(d, Math.min(L, this.camFree));
    return { o };
  }
  clampFree(o, world) {
    const d = this._cd || (this._cd = V()).subVectors(this.pos, o);
    const L = d.length();
    if (L < 0.9) return;
    d.divideScalar(L);
    const hit = world.rayTrack(o.x, o.y, o.z, d.x, d.y, d.z, L + CAM_GAP * 0.5, false);
    if (hit && hit.t < L + CAM_GAP * 0.5) this.pos.copy(o).addScaledVector(d, Math.max(0.8, hit.t - CAM_GAP));
  }
  // Cockpit: Kamera = Fahrerauge, dreht voll mit dem Auto (Looping, Korkenzieher). Gegen Übelkeit am Handy:
  // festes Sichtfeld (kein Tempo-Zoom) und ruhige Lage (n15, „darf nicht mehr wackeln“): kein Nicken/Wanken aus
  // der Federung (voll ausgeglichen), kein Nachfedern des Kopfes mehr; Lage leicht geglättet (~60 ms).
  cockpit(dt, P, cp) {
    const cam = this.cam, q = this._q.set(P.q.x, P.q.y, P.q.z, P.q.w);
    const u = this._u.set(P.frame.u.x, P.frame.u.y, P.frame.u.z);
    // Federung ausgleichen: Nicken/Wanken des Aufbaus gegenüber den Rädern voll heraus (bis n14 zur Hälfte) →
    // die Kamera folgt der Fahrbahn, nicht dem schaukelnden Aufbau
    let pitch = 0, roll = 0, heave = 0;
    const w = P.wheels;
    if (w) {
      // Auf-und-ab des Aufbaus (Einfedern gegenüber dem gleitenden Mittel) ebenfalls ausgleichen
      const cm = (w[0].comp + w[1].comp + w[2].comp + w[3].comp) / 4;
      if (!this.cInit || this.hv == null) this.hv = cm;
      this.hv += (cm - this.hv) * (1 - Math.exp(-dt * 1.5));
      heave = Math.max(-0.08, Math.min(0.08, cm - this.hv));
      const cf = (w[0].comp + w[1].comp) / 2, cr = (w[2].comp + w[3].comp) / 2;
      const cl = (w[0].comp + w[2].comp) / 2, cR = (w[1].comp + w[3].comp) / 2;
      pitch = Math.max(-0.08, Math.min(0.08, Math.atan2(cf - cr, 2.72)));   // > 0: Nase eingefedert
      roll = Math.max(-0.08, Math.min(0.08, Math.atan2(cl - cR, 1.73)));    // > 0: links eingefedert
    }
    this._e.set(CP_SUSP * pitch, 0, -CP_SUSP * roll);
    const target = this._q2.copy(q).multiply(this._q3.setFromEuler(this._e));
    if (!this.cInit) { this.cq.copy(target); this.cInit = true; }
    const a = this.cq.angleTo(target);
    if (a > 0.9) this.cq.copy(target);
    else this.cq.slerp(target, 1 - Math.exp(-dt * 16));
    const eye = this._h.set(EYE.x, EYE.y, EYE.z).applyQuaternion(this.cq);
    this.pos.copy(cp).add(eye).addScaledVector(u, CP_SUSP * heave);
    cam.position.copy(this.pos);
    cam.quaternion.copy(this.cq);
    cam.up.copy(u);
    this.look.copy(this.pos).addScaledVector(this._d.set(0, 0, -1).applyQuaternion(this.cq), 10);
    this.fov = cockpitFov(cam.aspect);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    // Horizont ins obere Drittel: Bildausschnitt nach unten verschieben (Sichtfeld und Senkrechte bleiben)
    const sh = 0.5 - cockpitHorizon(cam.aspect);
    // (setViewOffset setzt aspect = fullWidth / fullHeight → volle Breite = aspect, Höhe 1)
    if (!cam.view || !cam.view.enabled || Math.abs(cam.view.offsetY - sh) > 1e-4 || Math.abs(cam.view.fullWidth - cam.aspect) > 1e-4) cam.setViewOffset(cam.aspect, 1, 0, sh, cam.aspect, 1);
  }
}
