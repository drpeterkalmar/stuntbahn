// Schadensmodell (n34-Nachtrag, Peter 08.10.2026: „wir brauchen dann ein schadensmodell“) – reine Logik ohne Grafik, für alle
// Autos (Spieler und Gegner), deterministisch, netz-tauglich (kompakter Zustand für n35). Keine Soft-Body-Physik (BeamNG geht
// im Browser nicht): Treffer (Ort, Richtung, Stoß-Tempo) → radiale Dellen mit Rauschen (gedeckelt: nie ins Innere), lose
// Teile (Spiegel, Spoiler, Stoßstangen, Motorhaube) lösen sich ab einer Treffer-Summe je Bereich, Gesamtschaden 0 … 1 für
// Rauch (ab ~70 %), gesprungene Scheibe und – nur auf Original mit „Totalschaden“ und Option „Mit Fahrfolgen“ – Ziehen und
// weniger Spitze ab ~60 %, Wrack bei 100 %. Koordinaten: Auto (x rechts, y oben, z hinten, wie physics/car.js).
// Darstellung: gfx/schadenvis.js (Dellen auf Karosserie/Lack/Glas, Teile, Rauch). Node-Test: tests/node/test_schaden.mjs.
// Bereiche der Teile: tools/schaden_teile.mjs (Goblin in Auto-Koordinaten, Dreiecke je Teil, Querschnitte).

// Optionen „Schaden: Aus / Nur Optik / Mit Fahrfolgen“ (URL ?schaden=aus|optik|fahrt). Vorbau-Standard: aus (erst nach der
// Browser-Abnahme auf „optik“ stellen – TODO n34-Heavy)
export const SCHADEN_MODI = { aus: 'Aus', optik: 'Nur Optik', fahrt: 'Mit Fahrfolgen' };
export const SCHADEN_STD = 'aus';
export function schadenModus(search = globalThis.location ? globalThis.location.search : '', settings = {}) {
  const q = new URLSearchParams(search || '');
  const v = q.get('schaden') || settings.schaden || SCHADEN_STD;
  return SCHADEN_MODI[v] ? v : SCHADEN_STD;
}

// Treffer-Abstimmung (Startwerte, am Bild abzustimmen – TODO n34-Heavy):
//   v0 = Stoß-Tempo (m/s senkrecht), ab dem es Dellen gibt; tief = Dellen-Tiefe je m/s über v0 (m), tiefMax je Delle (m);
//   rad = Radius-Grundwert + radV × (vn − v0) (m), radMax; summeMax = größte Verschiebung eines Punkts über alle Dellen (m);
//   gesamt = Schadens-Zuwachs je Treffer: (vn − v0) / gesamtV (Wand-Crash bei 25 m/s ≈ 0,35); dellenMax = höchstens so
//   viele Dellen (nahe beieinander werden zusammengelegt: neue Tiefe = max, Ort gemittelt)
export const DELLE = { v0: 3, tief: 0.012, tiefMax: 0.16, rad: 0.28, radV: 0.022, radMax: 0.75, summeMax: 0.2, gesamtV: 62, dellenMax: 12, merge: 0.5, rauschen: 0.35 };
// Innenraum: Punkte der Karosserie dürfen durch Dellen nie hierhin gedrückt werden (Fahrgastzelle + Mittelmotor) – Quader in
// Auto-Koordinaten (tools/schaden_teile.mjs: Karosserie x ±1,13, y −0,49 … 0,66, z −2,48 … 2,27; Dach bei 0,62–0,66,
// Scheibe ab z −1,05, Heckdeck y 0,30–0,40). Vorderwagen (Kofferraum) und Heck außerhalb: dort tiefere Dellen möglich
export const INNEN = { min: [-0.72, -0.3, -0.95], max: [0.72, 0.52, 1.5] };
// Teile: Name, Bereich (Quader in Auto-Koordinaten), Schwelle = Summe der Treffer-Stärke (m/s über v0) im Bereich, ab der das
// Teil abfällt (Spiegel schnell, Haube erst bei harten Frontaufprallen); masse (kg, Trümmer-Flug)
// Bereiche aus tools/schaden_teile.mjs (Goblin): Spiegel = dichter Knoten außen vor der Tür (|x| 0,8–1,0, y 0,25–0,35,
// z −0,85 … −0,65); einen aufgesetzten Flügel hat der Goblin nicht – „Spoiler“ ist die Heck-Abrisskante; Haube = Fläche
// y 0,15–0,35 zwischen Stoßstange und Scheibe. Reihenfolge = Vorrang bei Überlapp (Stoßstange vor Haube).
export const TEILE = [
  { name: 'Spiegel links', box: [[-1.08, 0.2, -0.92], [-0.76, 0.42, -0.58]], schwelle: 6, masse: 2 },
  { name: 'Spiegel rechts', box: [[0.76, 0.2, -0.92], [1.08, 0.42, -0.58]], schwelle: 6, masse: 2 },
  { name: 'Spoiler', box: [[-0.95, 0.27, 1.95], [0.95, 0.46, 2.32]], schwelle: 14, masse: 6 },
  { name: 'Stoßstange vorn', box: [[-1.15, -0.32, -2.52], [1.15, 0.15, -2.05]], schwelle: 18, masse: 10 },
  { name: 'Stoßstange hinten', box: [[-1.15, -0.32, 2.0], [1.15, 0.26, 2.32]], schwelle: 18, masse: 10 },
  { name: 'Motorhaube', box: [[-0.85, 0.12, -2.08], [0.85, 0.4, -0.98]], schwelle: 30, masse: 15 },
];
export const TEIL_RAND = 0.25;   // m: Treffer so nah am Bereich zählen noch zum Teil
// Teil, in dessen Bereich der Punkt liegt (−1: Rumpf)
export function teilVon(x, y, z) {
  for (let k = 0; k < TEILE.length; k++) { const [a, b] = TEILE[k].box; if (x >= a[0] && x <= b[0] && y >= a[1] && y <= b[1] && z >= a[2] && z <= b[2]) return k; }
  return -1;
}
// Abstand eines Punkts zum Bereich eines Teils (0 = drin)
function abstandZu(k, x, y, z) {
  const [a, b] = TEILE[k].box;
  const dx = Math.max(a[0] - x, 0, x - b[0]), dy = Math.max(a[1] - y, 0, y - b[1]), dz = Math.max(a[2] - z, 0, z - b[2]);
  return Math.hypot(dx, dy, dz);
}
// Fahrfolgen (nur Modus „fahrt“, Original, Totalschaden an): ab ab Gesamtschaden linear bis 1: Ziehen bis zug rad Lenkung,
// Leistung bis × leistung; bei 1 → Wrack
export const FOLGEN = { ab: 0.6, zug: 0.05, leistung: 0.75 };
// Rauch aus dem Motorraum ab rauch Gesamtschaden, Scheibe springt ab scheibe
export const OPTIK = { rauch: 0.7, scheibe: 0.45 };

export function neuerSchaden() { return { teile: 0, dellen: [], gesamt: 0, bereich: new Float32Array(TEILE.length), seit: 0, n: 0 }; }
export function reparieren(S) { S.teile = 0; S.dellen.length = 0; S.gesamt = 0; S.bereich.fill(0); S.n++; S.seit = 0; return S; }
export function kopie(S) { return { teile: S.teile, dellen: S.dellen.map((d) => ({ ...d, p: d.p.slice(), r: d.r, d: d.d.slice() })), gesamt: S.gesamt, bereich: Float32Array.from(S.bereich), seit: S.seit, n: S.n }; }

// Treffer: p = Ort (Auto-Koordinaten), n = Normale der getroffenen Fläche nach außen am Auto (Richtung, in die der Stoß drückt =
// −n), vn = Stoß-Tempo (m/s, > 0), seed = Rauschen (Treffer-Nummer). Liefert { delle, abgefallen: [Teil-Indizes] }.
export function treffer(S, p, n, vn, seed = 0) {
  const D = DELLE, ueber = vn - D.v0;
  const out = { delle: null, abgefallen: [] };
  if (!(ueber > 0) || !Number.isFinite(p[0] + p[1] + p[2] + n[0] + n[1] + n[2])) return out;
  const nl = Math.hypot(n[0], n[1], n[2]) || 1, nx = n[0] / nl, ny = n[1] / nl, nz = n[2] / nl;
  const tiefe = Math.min(D.tiefMax, D.tief * ueber), rad = Math.min(D.radMax, D.rad + D.radV * ueber);
  // zusammenlegen mit einer nahen Delle (gleiche Richtung)
  let m = null;
  for (const d of S.dellen) if (Math.hypot(d.p[0] - p[0], d.p[1] - p[1], d.p[2] - p[2]) < D.merge * Math.max(d.r, rad) && d.d[0] * nx + d.d[1] * ny + d.d[2] * nz > 0.5) { m = d; break; }
  if (m) {
    const w = tiefe / (tiefe + m.t);
    for (let k = 0; k < 3; k++) m.p[k] += (p[k] - m.p[k]) * w;
    m.t = Math.min(D.tiefMax, Math.max(m.t, tiefe) + 0.3 * Math.min(m.t, tiefe));
    m.r = Math.min(D.radMax, Math.max(m.r, rad));
    out.delle = m;
  } else {
    const d = { p: [p[0], p[1], p[2]], d: [nx, ny, nz], t: tiefe, r: rad, s: ((seed * 2654435761) >>> 24) & 255 };   // 8 bit (packen)
    if (S.dellen.length >= D.dellenMax) {
      // die flachste ersetzen
      let k0 = 0; for (let k = 1; k < S.dellen.length; k++) if (S.dellen[k].t < S.dellen[k0].t) k0 = k;
      if (S.dellen[k0].t < tiefe) S.dellen[k0] = d;
    } else S.dellen.push(d);
    out.delle = d;
  }
  S.gesamt = Math.min(1, S.gesamt + ueber / D.gesamtV);
  S.seit = 0;
  // Teile: Treffer-Stärke im Bereich sammeln (nah am Bereich anteilig), ab Schwelle ab (deterministisch, Reihenfolge fest)
  for (let k = 0; k < TEILE.length; k++) {
    if (S.teile & (1 << k)) continue;
    const a = abstandZu(k, p[0], p[1], p[2]);
    if (a > TEIL_RAND + rad) continue;
    S.bereich[k] += ueber * (a <= 0 ? 1 : Math.max(0, 1 - a / (TEIL_RAND + rad)));
    if (S.bereich[k] >= TEILE[k].schwelle) { S.teile |= 1 << k; out.abgefallen.push(k); }
  }
  return out;
}

// glattes Rauschen je Delle (−1 … 1, Wellenlänge 2π/RAUSCH_F m, Phasen aus dem 8-bit-Seed) und sein Gradient – glatt, damit
// die nachgezogenen Normalen stimmen (zellweises Rauschen machte Stufen: Normalen bis 87° daneben)
const RAUSCH_F = 7;
function rausch(s, x, y, z, g = null) {
  const F = RAUSCH_F, a = F * x + s * 0.73, b = F * y + s * 1.37, c = F * z + s * 2.11;
  const sa = Math.sin(a), sb = Math.sin(b), sc = Math.sin(c);
  if (g) { g[0] = F * Math.cos(a) * sb * sc; g[1] = F * sa * Math.cos(b) * sc; g[2] = F * sa * sb * Math.cos(c); }
  return sa * sb * sc;
}
const _g = [0, 0, 0];
// Profil einer Delle: f(ρ) = (1 − ρ²)² für ρ = Abstand/Radius < 1, sonst 0; f'(ρ) = −4ρ(1 − ρ²)
const prof = (r) => (r >= 1 ? 0 : (1 - r * r) * (1 - r * r));
const profD = (r) => (r >= 1 ? 0 : -4 * r * (1 - r * r));

// Verschiebung eines Karosserie-Punkts (x, y, z) durch alle Dellen, in out[0..2]; gedeckelt (summeMax) und nie in den
// Innenraum (INNEN) hinein. Liefert out.
export function verschiebung(S, x, y, z, out = [0, 0, 0]) {
  let dx = 0, dy = 0, dz = 0;
  for (const d of S.dellen) {
    const rx = x - d.p[0], ry = y - d.p[1], rz = z - d.p[2];
    const dist = Math.hypot(rx, ry, rz);
    if (dist >= d.r) continue;
    const a = d.t * prof(dist / d.r) * (1 + DELLE.rauschen * rausch(d.s, x, y, z));
    dx -= d.d[0] * a; dy -= d.d[1] * a; dz -= d.d[2] * a;
  }
  const l = Math.hypot(dx, dy, dz);
  if (l > DELLE.summeMax) { const k = DELLE.summeMax / l; dx *= k; dy *= k; dz *= k; }
  // nie in den Innenraum: lag der Punkt außerhalb und landet drin → bis zur Grenze zurück (entlang der Verschiebung)
  const drin = (px, py, pz) => px > INNEN.min[0] && px < INNEN.max[0] && py > INNEN.min[1] && py < INNEN.max[1] && pz > INNEN.min[2] && pz < INNEN.max[2];
  if ((dx || dy || dz) && !drin(x, y, z) && drin(x + dx, y + dy, z + dz)) {
    let lo = 0, hi = 1;
    for (let k = 0; k < 16; k++) { const m = (lo + hi) / 2; if (drin(x + dx * m, y + dy * m, z + dz * m)) hi = m; else lo = m; }
    dx *= lo; dy *= lo; dz *= lo;
  }
  out[0] = dx; out[1] = dy; out[2] = dz;
  return out;
}
// Normale nach den Dellen (Normalen nachziehen): n + ∇a tangential, normiert; a = Eindrücktiefe t·f(ρ)·(1 + A·Rauschen) – eine
// Delle neigt die Fläche zur Mitte hin. n = ursprüngliche Normale (Länge 1), Ergebnis in out. (Näherung: Dellen-Richtung ≈ n)
export function normale(S, x, y, z, nx, ny, nz, out = [0, 0, 0]) {
  let gx = 0, gy = 0, gz = 0;
  const A = DELLE.rauschen;
  for (const d of S.dellen) {
    const rx = x - d.p[0], ry = y - d.p[1], rz = z - d.p[2];
    const dist = Math.hypot(rx, ry, rz);
    if (dist >= d.r || dist < 1e-6) continue;
    const ns = rausch(d.s, x, y, z, _g), f = prof(dist / d.r);
    const k = d.t * profD(dist / d.r) / d.r / dist * (1 + A * ns);   // ≤ 0 (zur Mitte)
    gx += k * rx + d.t * f * A * _g[0]; gy += k * ry + d.t * f * A * _g[1]; gz += k * rz + d.t * f * A * _g[2];
  }
  const gn = gx * nx + gy * ny + gz * nz;
  let ox = nx + (gx - gn * nx), oy = ny + (gy - gn * ny), oz = nz + (gz - gn * nz);
  const l = Math.hypot(ox, oy, oz) || 1;
  out[0] = ox / l; out[1] = oy / l; out[2] = oz / l;
  return out;
}

// Fahrfolgen: { zug (rad Lenk-Versatz, Vorzeichen aus der Seite der schwersten Delle), leistung (Faktor), wrack (bool) }
export function fahrFolgen(S) {
  const u = Math.max(0, Math.min(1, (S.gesamt - FOLGEN.ab) / (1 - FOLGEN.ab)));
  if (u <= 0) return { zug: 0, leistung: 1, wrack: false };
  let seite = 0, best = 0;
  for (const d of S.dellen) if (d.t * d.r > best) { best = d.t * d.r; seite = Math.sign(d.p[0]) || 1; }
  return { zug: FOLGEN.zug * u * seite, leistung: 1 - (1 - FOLGEN.leistung) * u, wrack: S.gesamt >= 1 };
}

// Kompakter Zustand fürs Netz (n35) und für den Rückspul-Puffer: 1 Byte Teile, 1 Byte Gesamt, 1 Byte Anzahl, je Delle 8 Byte
// (Ort x/y/z in 2 cm, Richtung als 2 Winkel in 256 Stufen, Tiefe in 1 mm, Radius in 1 cm, Rausch-Seed 1 Byte)
export function packen(S) {
  const n = S.dellen.length, u8 = new Uint8Array(3 + n * 8), i8 = new Int8Array(u8.buffer);
  u8[0] = S.teile & 255; u8[1] = Math.round(S.gesamt * 255); u8[2] = n;
  S.dellen.forEach((d, k) => {
    const o = 3 + k * 8;
    i8[o] = Math.max(-127, Math.min(127, Math.round(d.p[0] / 0.02)));
    i8[o + 1] = Math.max(-127, Math.min(127, Math.round(d.p[1] / 0.02)));
    i8[o + 2] = Math.max(-127, Math.min(127, Math.round(d.p[2] / 0.02)));
    const th = Math.acos(Math.max(-1, Math.min(1, d.d[1]))), ph = Math.atan2(d.d[2], d.d[0]);
    u8[o + 3] = Math.round(th / Math.PI * 255); u8[o + 4] = Math.round((ph + Math.PI) / (2 * Math.PI) * 255) & 255;
    u8[o + 5] = Math.min(255, Math.round(d.t / 0.001)); u8[o + 6] = Math.min(255, Math.round(d.r / 0.01)); u8[o + 7] = d.s & 255;
  });
  return u8;
}
export function entpacken(u8, S = neuerSchaden()) {
  const i8 = new Int8Array(u8.buffer, u8.byteOffset, u8.byteLength);
  S.teile = u8[0]; S.gesamt = u8[1] / 255; S.dellen.length = 0;
  for (let k = 0; k < u8[2]; k++) {
    const o = 3 + k * 8, th = u8[o + 3] / 255 * Math.PI, ph = u8[o + 4] / 255 * 2 * Math.PI - Math.PI;
    S.dellen.push({ p: [i8[o] * 0.02, i8[o + 1] * 0.02, i8[o + 2] * 0.02], d: [Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)], t: u8[o + 5] * 0.001, r: u8[o + 6] * 0.01, s: u8[o + 7] });
  }
  return S;
}

// Welt → Auto-Koordinaten (Lage pos, Quaternion q wie physics/car.js) für Treffer-Orte und Richtungen
export function inAuto(car, wx, wy, wz, punkt = true) {
  const q = car.q, x = punkt ? wx - car.pos.x : wx, y = punkt ? wy - car.pos.y : wy, z = punkt ? wz - car.pos.z : wz;
  // inverse Drehung: q* v q
  const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  return [x + qw * tx + (qy * tz - qz * ty), y + qw * ty + (qz * tx - qx * tz), z + qw * tz + (qx * ty - qy * tx)];
}

// Verlauf für das Rückspulen (Schaden spult mit): gepackte Stände mit Rennzeit; bei(t) = letzter Stand ≤ t
export class SchadenVerlauf {
  constructor() { this.st = [{ t: -1e9, z: packen(neuerSchaden()) }]; }
  merke(t, S) { while (this.st.length > 1 && this.st[this.st.length - 1].t > t) this.st.pop(); this.st.push({ t, z: packen(S) }); if (this.st.length > 400) this.st.splice(1, 1); }
  bei(t, S = neuerSchaden()) { let k = this.st.length - 1; while (k > 0 && this.st[k].t > t) k--; return entpacken(this.st[k].z, S); }
}

// Trümmer (abgefallene Teile): Starrkörper light – Wurf, Drehung, Aufprall auf Boden/Strecke (world.ray), Reibung; nach
// leben s weg. Deterministisch (Anfangs-Zufall aus seed).
export const TRUEMMER = { leben: 6, g: 9.81, stoss: 0.3, reib: 0.55, drehD: 0.6 };
export class Truemmer {
  constructor(teil, pos, v, seed = 1) {
    let h = (seed * 2654435761) >>> 0; const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) / 4294967296) * 2 - 1; };
    this.teil = teil; this.p = [pos[0], pos[1], pos[2]];
    this.v = [v[0] + r() * 2.5, v[1] + 2 + Math.abs(r()) * 3, v[2] + r() * 2.5];
    this.w = [r() * 9, r() * 9, r() * 9];        // rad/s
    this.rot = [0, 0, 0];                        // Euler-Winkel (nur Darstellung)
    this.t = 0; this.liegt = false;
  }
  schritt(dt, world) {
    this.t += dt;
    if (this.liegt) return this.t < TRUEMMER.leben;
    const T = TRUEMMER, p = this.p, v = this.v;
    v[1] -= T.g * dt;
    const nx = p[0] + v[0] * dt, ny = p[1] + v[1] * dt, nz = p[2] + v[2] * dt;
    // Boden: Strahl vom alten zum neuen Ort (plus 0,1 m)
    const dx = nx - p[0], dy = ny - p[1], dz = nz - p[2], L = Math.hypot(dx, dy, dz);
    const hit = world && L > 1e-6 ? world.ray(p[0], p[1], p[2], dx / L, dy / L, dz / L, L + 0.1, true) : null;
    if (hit) {
      const vn = v[0] * hit.nx + v[1] * hit.ny + v[2] * hit.nz;
      p[0] = hit.x + hit.nx * 0.05; p[1] = hit.y + hit.ny * 0.05; p[2] = hit.z + hit.nz * 0.05;
      if (vn < 0) { for (let k = 0; k < 3; k++) v[k] -= (1 + T.stoss) * vn * [hit.nx, hit.ny, hit.nz][k]; for (let k = 0; k < 3; k++) { v[k] *= T.reib; this.w[k] *= T.drehD; } }
      if (Math.hypot(v[0], v[1], v[2]) < 0.6) { this.liegt = true; v[0] = v[1] = v[2] = 0; }
    } else { p[0] = nx; p[1] = ny; p[2] = nz; }
    for (let k = 0; k < 3; k++) this.rot[k] += this.w[k] * dt;
    if (p[1] < -50) return false;
    return this.t < T.leben;
  }
}
