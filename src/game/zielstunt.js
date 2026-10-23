// Zieljubel-Stunt (n40, Peter 20.10.2026: „wenn möglich automatischer nitro und sprung und schraube oder front/backflip im
// ziel“). Nach der Ziellinie zeigt das Auto selbsttätig eine Jubel-Einlage: herunterbremsen auf das Absprung-Tempo →
// kurzer Nitro-Schub mit Flammen → Sprung → in der Luft eine Schraube (Längsachse 360°) oder ein Front-/Backflip
// (Querachse 360°) → saubere Landung, dann Auslaufen wie bisher.
//
// Rein rechnend (kein three.js, in Node prüfbar: tests/node/test_zielstunt.mjs). race.js ruft es im Auslaufen (runout):
//   stuntZeit(v0)                 Ablauf in Spielsekunden ab der Linie (Bremsen, Nitro, Absprung, Landung, Kamera, Aufzeichnung)
//   stuntRaum(track, idx, v0, o)  Platz hinter dem Ziel? (gerade, eben, breit genug, keine Stunts/Hindernisse/Hochstraße/Decke)
//   stuntArt(seed)                Figur aus dem Seed (Strecke + Zielzeit): Schraube links/rechts, Frontflip oder Backflip
//   stuntFlug(st, t)              Lage des Autos im Flug (kinematisch, nicht Physik): Bahn als Bogen über der Sehne
//                                 Absprung → Landepunkt, Drehung als weiche Kurve 0 → 360°; landet exakt in Fahrtlage
// Der Flug ist absichtlich gerechnet statt simuliert: so landet das Auto immer gerade (nie Crash), und Live, Replay und
// Highlight-Film zeigen dasselbe (das Replay spielt die aufgezeichneten Lagen ab). Rennzeit, Bestzeit, Geist und Online-
// Wertung enden weiter an der Linie (finF) – der Stunt liegt nur in der Aufzeichnung danach.
// Regler: ?zieljubel=stunt|dreher|aus (main.js), Option „Zieljubel“ im Menü (Standard Stunt). Race ohne Angabe = 'dreher'
// (Verhalten wie bis n39 – Prüffahrten, Generator und die Node-Tests bleiben bitgleich).
import { clamp, smootherstep, rng, hashStr } from '../core/util.js';
import { ZIEL } from './zielshow.js';

export const ZIELJUBEL = ['stunt', 'dreher', 'aus'];

// TODO n40-Heavy: Flugzeit, Tempo, Drehfenster und Kamera-Zeiten am Bild abstimmen (Startwerte)
export const ZSTUNT = {
  // Absprung-Tempo vJ m/s: an der Linie kräftig herunterbremsen (Ziel in tBrake s, dabei decMin … decMax m/s², höchstens
  // tBmax s); schnellere Zieleinfahrten (> vMaxFin) bekommen keinen Stunt (Dreher/Ausrollen wie bisher)
  vJ: 22, tBrake: 1.2, decMin: 9, decMax: 20, tBmax: 3.0, vMaxFin: 82,
  // Nitro-Schub nitro s vor dem Absprung (Flammen noch flame s in der Luft); Tempo im Flug vAir[0] … vAir[1] m/s
  nitro: 0.5, flame: 0.35, vAir: [15, 28],
  // Flugzeit air s (Scheitel g·air²/8 ≈ 2,8 m), Drehung von rot[0] bis rot[1] der Flugzeit, Landung mit sink m/s Einfedern
  air: 1.5, g: 9.81, rot: [0.1, 0.86], sink: 1.2,
  // Platz: pre m vor dem Absprung frei, nach der Landung Anhalteweg vor dem nächsten Stunt (ZIEL.stopDecel, ZIEL.stopGap) + post m; Fahrbahn höchstens bank Querneigung (|by|), mindestens
  // wMin m breit; Linie unter der Flugbahn höchstens dev m seitlich neben der Sehne Absprung → Landung (und die Wagenmitte
  // dabei mindestens edge m innerhalb der Kante), höchstens devY m darüber (Kuppe; Senken stören nicht, bis dip m);
  // Decke: Strahl bis roof m über Scheitel + halbe Wagenlänge
  pre: 15, post: 5, bank: 0.12, wMin: 9, dev: 2.5, edge: 1.5, devY: 0.8, dip: 4, roof: 2.5,
  // nach der Landung ausrollen (höchstens rollDec m/s²); Kamera: Schnitt auf den Zielbogen cut s nach der Landung, Ende der
  // Zielshow endPan s nach dem Schwenk, Aufzeichnung recPad s darüber hinaus
  rollDec: 7, cut: 0.45, endPan: 1.1, recPad: 0.4,
};

// Karosserie (Kasten um die Wagenmitte, m): halbe Breite hx, unten/oben yLo/yHi, halbe Länge hz – für die Bodenfreiheit im Flug
export const CAR_BOX = { hx: 0.95, yLo: -0.42, yHi: 0.78, hz: 2.3 };

// Ablauf in Spielsekunden ab der Linie für Ziel-Tempo v0 (m/s): { ok, dec, tB, tJ, tL, cut, end, rec, dB, dJ, len, post }
export function stuntZeit(v0) {
  const Z = ZSTUNT;
  v0 = Math.max(0, v0 || 0);
  if (v0 > Z.vMaxFin) return { ok: false, why: 'tempo' };
  const dv = Math.max(0, v0 - Z.vJ);
  const dec = dv > 0 ? clamp(dv / Z.tBrake, Z.decMin, Z.decMax) : 0, tB = dv > 0 ? dv / dec : 0;
  if (tB > Z.tBmax + 1e-9) return { ok: false, why: 'tempo' };
  const tJ = tB + Z.nitro, tL = tJ + Z.air;
  const cut = Math.max(ZIEL.cut, tL + Z.cut), end = Math.max(ZIEL.end, cut + ZIEL.pan + Z.endPan), rec = Math.max(ZIEL.rec, end + Z.recPad);
  // Wege (m): Bremsen, bis zum Absprung (Nitro: höchstens vAir[1]), Flug höchstens
  const dB = dv > 0 ? (v0 + Z.vJ) / 2 * tB : 0, vN = Math.max(v0 > Z.vJ ? Z.vJ : v0, 1);
  const dJ = dB + Math.min(Z.vAir[1], vN + 8) * Z.nitro, len = Z.vAir[1] * Z.air;
  // nach der Landung bis zum Stillstand vor dem nächsten Stunt (wie das Auslaufen: stopGap m davor, stopDecel m/s²)
  const post = Z.vAir[1] * Z.vAir[1] / (2 * ZIEL.stopDecel) + ZIEL.stopGap + Z.post;
  return { ok: true, dec, tB, tJ, tL, cut, end, rec, dB, dJ, len, post };
}

// Test-Regler ?zstunt=schraube|front|back: Figur erzwingen (Fotos/Abnahme je Figur); ohne = Zufall aus dem Seed
export const ZSTUNT_URL = (() => { const v = new URLSearchParams((globalThis.location && globalThis.location.search) || '').get('zstunt'); return ['schraube', 'front', 'back'].includes(v) ? v : null; })();
// Figur aus dem Seed: { art: 'schraube'|'front'|'back', sg: ±1 } (sg: Drehsinn der Schraube; Flips: front −1, back +1)
export function stuntArt(seed, force = ZSTUNT_URL) {
  const r = rng((hashStr(String(seed ?? 'ziel')) ^ 0x2a57) >>> 0);
  const k = force ? ['schraube', 'front', 'back'].indexOf(force) : Math.floor(r() * 3) % 3, side = r() < 0.5 ? -1 : 1;
  return k === 0 ? { art: 'schraube', sg: side } : k === 1 ? { art: 'front', sg: -1 } : { art: 'back', sg: 1 };
}

// ---------- Linie ----------
const nextI = (L, j) => (j + 1 >= L.n ? (L.closed ? 1 : -1) : j + 1);
// Punkt d m voraus ab Linienindex i (über den Anfang hinweg bei Rundkursen): { i, a } (zwischen i und i+1, Anteil a) oder null
export function lineAhead(L, i, d) {
  let j = i, acc = 0;
  for (let c = 0; c < L.n; c++) {
    const k = nextI(L, j);
    if (k < 0) return null;
    const ds = Math.max(0, L.s[k] - L.s[j]);
    if (acc + ds >= d) return { i: j, k, a: ds > 1e-9 ? (d - acc) / ds : 0 };
    acc += ds; j = k;
  }
  return null;
}
// Linienpunkt an { i, k, a }: Ort p, Tangente t, Oben n, Rechts b (je [x, y, z]), halbe Breite hw
export function lineAt(L, P) {
  const { i, k, a } = P, m = (A) => A[i] + (A[k] - A[i]) * a;
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  return {
    p: [m(L.px), m(L.py), m(L.pz)], t: nrm([m(L.tx), m(L.ty), m(L.tz)]), n: nrm([m(L.nx), m(L.ny), m(L.nz)]),
    b: nrm([m(L.bx), m(L.by), m(L.bz)]), hw: L.hw ? m(L.hw) : 7.3,
  };
}

// Platz für den Stunt ab Linienindex idx bei Ziel-Tempo v0. o = { high (Linien-Flags Hochstraße), roof(x, y, z, h) → true
// wenn eine Decke im Weg ist (Welt-Strahl nach oben; ohne = keine Prüfung), lat (Seitenversatz der Wagenmitte, m) }.
// (high: race.js gibt es nicht mit – der Flug ist gerechnet und landet genau auf der Fahrbahn, Hochstraßen stören nicht)
// Liefert { ok, why?, ...stuntZeit } – why: 'tempo' | 'ende' | 'stunt' | 'hindernis' | 'hoch' | 'schraeg' | 'eng' | 'kurve' |
// 'kuppe' | 'decke'
export function stuntRaum(track, idx, v0, o = {}) {
  const Z = ZSTUNT, T = stuntZeit(v0);
  if (!T.ok) return T;
  const L = track.line, lat = o.lat || 0;
  const dF0 = T.dJ - Z.pre, dEnd = T.dJ + T.len + T.post;
  // Schanzen (Anlauf bis Landung), Hindernisse (n33): Linienbereiche
  const zone = (j) => {
    for (const J of track.jumps || []) if (j >= J.lipIdx - 30 && j <= (J.endIdx ?? J.landIdx + 12)) return 'stunt';
    for (const h of track.obstacles || []) if (h.idx0 != null && j >= h.idx0 && j <= (h.idx1 ?? h.idx0)) return 'hindernis';
    return null;
  };
  let j = idx, d = 0;
  for (let c = 0; c < L.n && d <= dEnd; c++) {
    if (L.air[j] || L.loop[j] || (L.tube && L.tube[j])) return { ...T, ok: false, why: 'stunt' };
    const zn = zone(j);
    if (zn) return { ...T, ok: false, why: zn };
    if (o.high && o.high[j]) return { ...T, ok: false, why: 'hoch' };
    if (d >= dF0) {
      if (Math.abs(L.by[j]) > Z.bank) return { ...T, ok: false, why: 'schraeg' };
      if (L.hw[j] * 2 < Z.wMin || Math.abs(lat) > L.hw[j] - 2) return { ...T, ok: false, why: 'eng' };
    }
    const k = nextI(L, j);
    if (k < 0) return { ...T, ok: false, why: 'ende' };
    d += Math.max(0, L.s[k] - L.s[j]); j = k;
  }
  if (d < dEnd) return { ...T, ok: false, why: 'ende' };
  // Flugstrecke Absprung (dJ) → Landung (dJ + len, längster Flug)
  const f = flugFrei(track, idx, T.dJ, T.len, lat, o.roof);
  if (f) return { ...T, ok: false, why: f };
  return { ...T, ok: true };
}

// Flugstrecke ab d0 m voraus (Absprung) über len m frei? Linie nahe der Sehne Absprung → Landung (Kurve/Kuppe), Wagenmitte
// über der Fahrbahn, keine Decke über der Flugbahn. null = frei, sonst 'ende' | 'kurve' | 'kuppe' | 'decke'. race.js prüft
// beim echten Absprung noch einmal mit dem echten Tempo.
export function flugFrei(track, idx, d0, len, lat = 0, roof = null) {
  const Z = ZSTUNT, L = track.line;
  const A = lineAhead(L, idx, d0), B = lineAhead(L, idx, d0 + len);
  if (!A || !B) return 'ende';
  const pa = lineAt(L, A).p, pb = lineAt(L, B).p;
  const cx = pb[0] - pa[0], cz = pb[2] - pa[2], ch = Math.hypot(cx, cz) || 1;
  for (let s = -5; s <= len + 5; s += 2.5) {
    const P = lineAhead(L, idx, Math.max(0, d0 + s));
    if (!P) return 'ende';
    const q = lineAt(L, P), u = clamp(s / len, 0, 1);
    if (s >= 0 && s <= len) {
      const side = Math.abs(((q.p[0] - pa[0]) * cz - (q.p[2] - pa[2]) * cx) / ch);
      if (side > Z.dev || side + Math.abs(lat) > q.hw - Z.edge) return 'kurve';
      const dy = q.p[1] - (pa[1] + (pb[1] - pa[1]) * u);
      if (dy > Z.devY || dy < -Z.dip) return 'kuppe';
    }
    // (vorsichtig: überall Scheitelhöhe + halbe Wagenlänge + roof, Strahl alle 2,5 m)
    if (roof && roof(q.p[0] + q.b[0] * lat, q.p[1] + 0.5, q.p[2] + q.b[2] * lat, Z.g * Z.air * Z.air / 8 + 0.6 + CAR_BOX.hz + Z.roof)) return 'decke';
  }
  return null;
}

// ---------- Quaternionen (x, y, z, w) ----------
export const qmul = (a, b) => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y, y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w, w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
});
export function qslerp(a, b, t) {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w, c = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (c < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; c = -c; }
  let k0 = 1 - t, k1 = t;
  if (c < 0.9995) { const o = Math.acos(c), s = Math.sin(o); k0 = Math.sin((1 - t) * o) / s; k1 = Math.sin(t * o) / s; }
  const x = a.x * k0 + bx * k1, y = a.y * k0 + by * k1, z = a.z * k0 + bz * k1, w = a.w * k0 + bw * k1, l = Math.hypot(x, y, z, w) || 1;
  return { x: x / l, y: y / l, z: z / l, w: w / l };
}
export function qrot(q, v) {
  const [x, y, z] = v, tx = 2 * (q.y * z - q.z * y), ty = 2 * (q.z * x - q.x * z), tz = 2 * (q.x * y - q.y * x);
  return [x + q.w * tx + (q.y * tz - q.z * ty), y + q.w * ty + (q.z * tx - q.x * tz), z + q.w * tz + (q.x * ty - q.y * tx)];
}
// Lage aus Vorwärts fw und Oben up (Auto: vorn = lokal −z, oben = +y, rechts = +x) – wie Car.place
export function qLook(fw, up) {
  let [ux, uy, uz] = up;
  let bx = -fw[0], by = -fw[1], bz = -fw[2];
  let rx = uy * bz - uz * by, ry = uz * bx - ux * bz, rz = ux * by - uy * bx;
  let l = Math.hypot(rx, ry, rz) || 1; rx /= l; ry /= l; rz /= l;
  ux = by * rz - bz * ry; uy = bz * rx - bx * rz; uz = bx * ry - by * rx;
  l = Math.hypot(ux, uy, uz) || 1; ux /= l; uy /= l; uz /= l;
  l = Math.hypot(bx, by, bz) || 1; bx /= l; by /= l; bz /= l;
  const m00 = rx, m01 = ux, m02 = bx, m10 = ry, m11 = uy, m12 = by, m20 = rz, m21 = uz, m22 = bz, tr = m00 + m11 + m22;
  if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return { w: 0.25 / s, x: (m21 - m12) * s, y: (m02 - m20) * s, z: (m10 - m01) * s }; }
  if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); return { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s }; }
  if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); return { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s }; }
  const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
  return { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
}

// ---------- Flug ----------
// Flugplan beim Absprung: Wagenmitte p0 und Lage q0 jetzt, Tempo v (m/s, auf vAir begrenzt), Landepunkt auf der Linie
// (gleicher Seitenversatz lat) als { p (Fahrbahn), t, n } = lineAt(...), h0 = Wagenmitte über der Fahrbahn im Stand,
// art = stuntArt(...). Liefert st für stuntFlug.
export function stuntStart(p0, q0, v, land, h0, art) {
  const Z = ZSTUNT, vA = clamp(v, Z.vAir[0], Z.vAir[1]);
  const p1 = [land.p[0] + land.n[0] * h0, land.p[1] + land.n[1] * h0, land.p[2] + land.n[2] * h0];
  return { p0: [...p0], p1, q0: { ...q0 }, q1: qLook(land.t, land.n), up1: [...land.n], fw1: [...land.t], v: vA, T: Z.air, h0, art: art.art, sg: art.sg };
}
// Lage zur Flugzeit t (0 … st.T): { pos, q, v (m/s, Welt), w (rad/s, Welt), ang (gedreht, rad), u (0 … 1) }
export function stuntFlug(st, t, out = {}) {
  const Z = ZSTUNT, T = st.T, u = clamp(t / T, 0, 1);
  const P = (uu) => {
    // Bogen über der Sehne: Höhe g/2 · t · (T − t) entlang „Oben“ (Mittel aus Welt-Oben und Lande-Oben)
    const h = Z.g / 2 * (uu * T) * (T - uu * T), up = [st.up1[0] * 0.5, 0.5 + st.up1[1] * 0.5, st.up1[2] * 0.5], l = Math.hypot(up[0], up[1], up[2]) || 1;
    return [st.p0[0] + (st.p1[0] - st.p0[0]) * uu + up[0] / l * h, st.p0[1] + (st.p1[1] - st.p0[1]) * uu + up[1] / l * h, st.p0[2] + (st.p1[2] - st.p0[2]) * uu + up[2] / l * h];
  };
  const A = (uu) => 2 * Math.PI * smootherstep((uu - Z.rot[0]) / (Z.rot[1] - Z.rot[0]));
  const pos = P(u);
  // Grundlage: weich von der Absprung- zur Landelage (Gieren/Nicken der Fahrbahn), darauf die Drehung um die Auto-Achse
  const qb = qslerp(st.q0, st.q1, smootherstep(u));
  const ang = A(u) * st.sg, h2 = ang / 2;
  const qa = st.art === 'schraube' ? { x: 0, y: 0, z: Math.sin(h2), w: Math.cos(h2) } : { x: Math.sin(h2), y: 0, z: 0, w: Math.cos(h2) };
  const q = qmul(qb, qa);
  // Tempo und Drehrate aus den Nachbarzeiten (für Car.v/w: Tacho, Fahrtwind, Kamera)
  const e = 1e-3, pa = P(Math.max(0, u - e)), pb = P(Math.min(1, u + e)), du = (Math.min(1, u + e) - Math.max(0, u - e)) * T || 1;
  const wv = (A(Math.min(1, u + e)) - A(Math.max(0, u - e))) / du * st.sg;
  const axL = st.art === 'schraube' ? [0, 0, 1] : [1, 0, 0], ax = qrot(qb, axL);
  out.pos = pos; out.q = q; out.u = u; out.ang = ang;
  out.v = [(pb[0] - pa[0]) / du, (pb[1] - pa[1]) / du, (pb[2] - pa[2]) / du];
  out.w = [ax[0] * wv, ax[1] * wv, ax[2] * wv];
  return out;
}
// Bodenfreiheit im Flug (m): tiefste Ecke der Karosserie über der Sehne Absprung → Landung (für Tests und Prüfungen)
export function stuntFreiheit(st, t) {
  const F = stuntFlug(st, t), u = F.u, B = CAR_BOX;
  const g = [st.p0[0] + (st.p1[0] - st.p0[0]) * u, st.p0[1] + (st.p1[1] - st.p0[1]) * u - st.h0, st.p0[2] + (st.p1[2] - st.p0[2]) * u];
  let mn = Infinity;
  for (const x of [-B.hx, B.hx]) for (const y of [B.yLo, B.yHi]) for (const z of [-B.hz, B.hz]) {
    const c = qrot(F.q, [x, y, z]);
    mn = Math.min(mn, F.pos[1] + c[1] - g[1]);
  }
  return mn;
}
