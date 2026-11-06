// Arcade-Drift (n45, Peter 04.11.2026: „ich denke eher an so arcade drifting dass in der kurve einfach früher das heck ausbricht aber
// so steuerbar ist wie als ob ich nicht driften würde“). KEIN Simulations-Drift: die Bahn des Autos (Physik, Lenkung, Kollision,
// Rundenzeit) bleibt genau wie ohne Drift. Zusätzlich dreht die Karosserie in der Kurve sichtbar quer – ein Schwimmwinkel als
// Darstellungs-Versatz um die Hochachse (Drehpunkt pivot m vor der Wagenmitte, das Heck schwenkt nach außen), der mit Kurven-
// schärfe und Tempo wächst (Querbeschleunigung aus Gierrate × Tempo, Stützstellen A), ab v0 … v1 m/s einblendet, mit tauAuf s
// aufbaut und mit tauAb s zurückgeht. Ein schon vorhandener echter Schwimmwinkel (Gegner-Drift n43) zählt mit: gezeigt wird
// höchstens der Soll-Winkel, nicht beides addiert. Gesperrt (weich auf 0 mit tauSperre): Looping, Röhre, Korkenzieher, Schanzen-
// Anfahrt/-Lippe/Luft, Steilkurven, Wellen, Stunt-Bausteine (arcadeSperre in game/race.js), Räder in der Luft, Crash, rückwärts.
// Reine Logik ohne Grafik (Node + Browser); Darstellung: main.js (Spieler), gfx/gegnervis.js (Gegner), Qualm/Spuren/Ton aus
// car.arcadeSlip (gfx/fx.js, audio/sound.js). ?drift=n43 = Stand 0.19.3 (lockeres Heck n43, kein Arcade-Drift), ?drift=alt = 0.17.0,
// ?arcadedrift=0…2 = Stärke (A/B). Messung: tools/n45_drift_mess.mjs, Test tests/node/test_n45.mjs.
const urlQ = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
const driftUrl = urlQ ? urlQ.get('drift') : globalThis.process && globalThis.process.env ? globalThis.process.env.STUNT_DRIFT || null : null;
const kUrl = urlQ && urlQ.has('arcadedrift') ? Math.max(0, Math.min(2, +urlQ.get('arcadedrift') || 0)) : null;
export const ARCADE_DRIFT = {
  an: driftUrl !== 'alt' && driftUrl !== 'n43' && kUrl !== 0,
  k: kUrl ?? 1,
  // lockeres Heck n43 (physics/car.js HECK) auf Mittel/Original: stillgelegt, außer ?drift=n43 oder ausdrücklich ?heck=…
  heckN43: driftUrl === 'n43' || !!(urlQ && urlQ.has('heck')),
  // Querbeschleunigung (m/s²) → Winkel (Grad): ab ~2,5 m/s² (zügige Kurve) sichtbar, normales Kurvenfahren 15–30°, eng+schnell bis 40°
  A: [[2.5, 0], [5, 14], [12, 28], [20, 40]],
  v0: 11, v1: 15, max: 42, tauAuf: 0.2, tauAb: 0.3, tauSperre: 0.15, pivot: 0.8,
  // Gegner je Stärke (Locker wild, Profi kontrolliert, aber sichtbar)
  gegner: { locker: 1.15, ebenbuertig: 1, profi: 0.85 },
};
const RAD = Math.PI / 180;

// Soll-Winkel (Grad, ohne Vorzeichen) aus Querbeschleunigung a (m/s²) und Tempo v (m/s)
export function arcadeSoll(a, v, k = 1) {
  const S = ARCADE_DRIFT.A;
  let b = 0;
  if (a >= S[S.length - 1][0]) b = S[S.length - 1][1];
  else for (let i = 1; i < S.length; i++) if (a < S[i][0]) { const [a0, b0] = S[i - 1], [a1, b1] = S[i]; b = a <= a0 ? (i === 1 ? 0 : b0) : b0 + (b1 - b0) * (a - a0) / (a1 - a0); break; }
  const q = Math.max(0, Math.min(1, (v - ARCADE_DRIFT.v0) / (ARCADE_DRIFT.v1 - ARCADE_DRIFT.v0)));
  return Math.min(ARCADE_DRIFT.max, b * q * q * (3 - 2 * q) * k * ARCADE_DRIFT.k);
}

// Zustand je Auto. step() nach jedem Physikschritt; beta = Darstellungs-Versatz (rad, + = Nase nach links / Heck nach rechts um die
// Hochachse des Autos), gesamt = sichtbarer Schwimmwinkel (rad, echter + Versatz). Setzt car.arcadeSlip (tan des sichtbaren
// Winkels, für Qualm/Spuren/Quietschen) und car.arcade (dieses Objekt).
export class ArcadeDrift {
  constructor(k = 1) { this.k = k; this.beta = 0; this.gesamt = 0; this.yr = 0; this.lf = null; this.soll = 0; }
  reset(car) { this.beta = 0; this.gesamt = 0; this.yr = 0; this.lf = null; if (car) car.arcadeSlip = 0; }
  step(dt, car, gesperrt = false) {
    const F = car.frame, f = F.f, u = F.u;
    // Gierrate aus der Drehung der Nase (gilt auch für Gegner auf der Schiene, die per place() gesetzt werden)
    let yr = 0;
    if (this.lf && dt > 0) {
      const cx = this.lf.y * f.z - this.lf.z * f.y, cy = this.lf.z * f.x - this.lf.x * f.z, cz = this.lf.x * f.y - this.lf.y * f.x;
      yr = Math.asin(Math.max(-1, Math.min(1, cx * u.x + cy * u.y + cz * u.z))) / dt;
      if (Math.abs(yr) > 6) yr = 0;   // Reset/Sprung
    }
    this.lf = this.lf || { x: 0, y: 0, z: 0 }; this.lf.x = f.x; this.lf.y = f.y; this.lf.z = f.z;
    this.yr += (yr - this.yr) * Math.min(1, dt / 0.08);
    const vf = car.v.x * f.x + car.v.y * f.y + car.v.z * f.z, vr = car.v.x * F.r.x + car.v.y * F.r.y + car.v.z * F.r.z;
    // echter Schwimmwinkel (+ = Nase links der Fahrtrichtung, wie beta)
    const echt = vf > 3 ? Math.atan2(vr, vf) : 0;
    const sperre = gesperrt || !ARCADE_DRIFT.an || car.crash || car.onGround < 3 || car.surfaceKind || vf < 3;
    let ziel = 0;
    if (!sperre) {
      const sg = Math.sign(this.yr), b = arcadeSoll(Math.abs(this.yr) * vf, vf, this.k) * RAD;
      // echter Winkel in dieselbe Richtung zählt mit (Gegner-Drift): nur der Rest wird gezeigt
      ziel = sg * Math.max(0, b - Math.max(0, echt * sg));
    }
    this.soll = ziel;
    const tau = sperre ? ARCADE_DRIFT.tauSperre : Math.abs(ziel) > Math.abs(this.beta) && Math.sign(ziel) === Math.sign(this.beta || ziel) ? ARCADE_DRIFT.tauAuf : ARCADE_DRIFT.tauAb;
    this.beta += (ziel - this.beta) * Math.min(1, dt / tau);
    if (Math.abs(this.beta) < 1e-4 && !ziel) this.beta = 0;
    this.gesamt = echt + this.beta;
    car.arcadeSlip = Math.abs(this.beta) > 0.02 ? Math.tan(Math.min(1.2, Math.abs(this.gesamt))) : 0;
    car.arcade = this;
    return this.beta;
  }
}

// Lage für die Darstellung: q (Physik) um die Hochachse um beta gedreht, Drehpunkt pivot m vor der Mitte (Heck schwenkt aus).
// pose = { pos, q } (wird überschrieben), frame = Achsen des Autos { r, u, f }. Liefert pose.
export function arcadePose(pose, frame, beta) {
  if (!beta) return pose;
  const h = beta / 2, s = Math.sin(h), c = Math.cos(h), q = pose.q;
  // q · (Drehung um lokales y): (w, x, y, z) · (c, 0, s, 0)
  const qx = q.x * c - q.z * s, qy = q.y * c + q.w * s, qz = q.z * c + q.x * s, qw = q.w * c - q.y * s;
  const a = ARCADE_DRIFT.pivot, sb = Math.sin(beta), cb = Math.cos(beta), F = frame;
  // Mitte wandert so, dass der Punkt pivot m vor der Mitte stehen bleibt: + r · a·sin β + f · a·(1 − cos β)
  const dx = F.r.x * a * sb + F.f.x * a * (1 - cb), dy = F.r.y * a * sb + F.f.y * a * (1 - cb), dz = F.r.z * a * sb + F.f.z * a * (1 - cb);
  return { ...pose, pos: { x: pose.pos.x + dx, y: pose.pos.y + dy, z: pose.pos.z + dz }, q: { x: qx, y: qy, z: qz, w: qw }, lenkVersatz: beta };
}

// Ort eines Punkts p (Welt) am quer gedrehten Auto (für Gummispuren der Hinterräder): um den Drehpunkt um die Hochachse gedreht
export function arcadePunkt(car, beta, p, out) {
  const F = car.frame, a = ARCADE_DRIFT.pivot;
  const px = car.pos.x + F.f.x * a, py = car.pos.y + F.f.y * a, pz = car.pos.z + F.f.z * a;
  const dx = p.x - px, dy = p.y - py, dz = p.z - pz;
  // Komponenten in r/f (Hochachse bleibt)
  const lr = dx * F.r.x + dy * F.r.y + dz * F.r.z, lf = dx * F.f.x + dy * F.f.y + dz * F.f.z, lu = dx * F.u.x + dy * F.u.y + dz * F.u.z;
  // + beta dreht die Nase nach links: f → f·cos β − r·sin β, r → r·cos β + f·sin β
  const cb = Math.cos(beta), sb = Math.sin(beta);
  const nr = lr * cb - lf * sb, nf = lr * sb + lf * cb;
  out.x = px + F.r.x * nr + F.f.x * nf + F.u.x * lu; out.y = py + F.r.y * nr + F.f.y * nf + F.u.y * lu; out.z = pz + F.r.z * nr + F.f.z * nf + F.u.z * lu;
  return out;
}
