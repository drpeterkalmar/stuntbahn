// G-Kräfte (n24 Etappe 1, Peter 04.10.2026: „im Cockpit und im Replay bzw. Highlights die G-Kräfte dazuschreiben –
// muss nicht genau sein, aber soll cool aussehen“). Reine Anzeige, rein rechnerisch (kein three.js, in Node getestet:
// tests/node/test_gkraft.mjs).
//
// Quelle ist immer die Aufzeichnung (race.rec, 60 Hz, REC_STRIDE Werte je Bild: 0–2 Position, 3–6 Lage) – live dieselbe
// Rechnung wie im Replay und im Kino-Replay, die Werte passen also überall zusammen. Beschleunigung = zweite Differenz der
// Position (a = (p_i − 2 p_i−1 + p_i−2) · 60²), zerlegt im Auto-Rahmen: längs (Gas/Bremse, + = vorwärts), quer (Kurve/
// Drift, + = rechts), vertikal (Kuppe, Looping, Landung, + = zum Dach). Gezeigt wird die Beschleunigung des Autos ohne
// die Ruhe-Schwerkraft: im Stand 0,0 G, im Flug ~0,7 G nach unten (Flug-Schwerkraft 70 %, SPRUNG_BERICHT.md).
// Glättung: Tiefpass tau s; die Anzeige hält Spitzen hold s und fällt danach mit fall G/s (Landungen bleiben lesbar).
// Show-Faktor: G_show = max · tanh(show · G / max) – kleine Werte etwas größer (Kurve typ. 1–3 G), große weich gedeckelt
// (Looping echt ~6–8 G → ~5–6 G). Landungen: nach mindestens airMin s Flug zählt imp s lang zusätzlich ein schneller
// Tiefpass (tauFast) mit eigener Kurve impMax · tanh(impK · G / impMax) – der Aufsetz-Stoß (echt ~9–12 G, nach 0,2 s
// Glättung nur noch ~4 G) bleibt so als Spitze sichtbar (Schanze ~6–7 G, harte Landung bis ~9 G, nie über impMax).
// Gemessen: tools/gkraft_mess.mjs (GKRAFT_BERICHT.md). Schnitte (Reset, Rückspulen) setzen die Rechnung neu an.
// URL: ?g=echt = ohne Show-Faktor (echte, nur geglättete Werte), ?g=0 = Anzeige aus, ?g=<faktor> = anderer Show-Faktor.
// In Node: STUNT_G=echt|0|<faktor>.
export const GF = { g: 9.81, hz: 60, stride: 16, tau: 0.2, hold: 0.6, fall: 6, show: 1.25, max: 7, tauFast: 0.05, airMin: 0.2, imp: 0.3, impK: 0.85, impMax: 10, jump: 8 };

function gParam() {
  const q = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('g') : null;
  return q ?? (globalThis.process && globalThis.process.env ? globalThis.process.env.STUNT_G : null) ?? null;
}
const PG = gParam();
// Anzeige an/aus und wirksamer Show-Faktor (1 + echt = ohne Deckel)
export const G_ON = PG !== '0';
export const G_REAL = PG === 'echt';
export const G_SHOW = G_REAL ? 1 : PG != null && PG !== '' && Number.isFinite(+PG) && +PG > 0 ? Math.min(3, +PG) : GF.show;

// echte G → angezeigte G (Vorzeichen bleibt)
export function showG(g, k = G_SHOW, real = G_REAL) {
  if (real) return g;
  return GF.max * Math.tanh((k * g) / GF.max);
}
// Landungs-Stoß (schneller Tiefpass) → angezeigte G
export function showImpact(g, real = G_REAL) {
  if (real) return g;
  const k = GF.impK * G_SHOW / GF.show;
  return GF.impMax * Math.tanh((k * g) / GF.impMax);
}

// Fortlaufende Rechnung über eine Aufzeichnung: push(rec, i) für Bild i (in Reihenfolge), reset() an Schnitten.
// Werte nach push: lon/lat/vert (echte G, geglättet), tot (Betrag), show (angezeigter Betrag mit Spitzen-Halten),
// sLon/sLat/sVert (angezeigte Komponenten), peak (größter angezeigter Wert seit resetPeak)
export class GMeter {
  constructor(opt = {}) {
    this.o = { ...GF, ...opt };
    this.peak = 0; this.peakLat = 0;
    this.reset();
  }
  reset() {
    this.n = 0;            // Bilder seit dem letzten Schnitt
    this.lon = this.lat = this.vert = this.tot = 0;
    this.fLon = this.fLat = this.fVert = 0; this.airN = 0; this.impT = 0; this.now = 0;
    this.sLon = this.sLat = this.sVert = this.show = 0;
    this.holdV = 0; this.holdT = 0;
  }
  resetPeak() { this.peak = 0; this.peakLat = 0; }
  push(rec, i) {
    const o = this.o, S = o.stride, dt = 1 / o.hz;
    this.n++;
    if (this.n < 3 || i < 2) return this._decay(dt);
    const a = i * S, b = a - S, c = b - S, k = o.hz * o.hz;
    // Sprung in der Aufzeichnung ohne Schnitt-Marke (Versetzen, Test-Teleport): > jump m je Bild → neu ansetzen
    if (Math.abs(rec[a] - rec[b]) + Math.abs(rec[a + 1] - rec[b + 1]) + Math.abs(rec[a + 2] - rec[b + 2]) > o.jump) { this.reset(); this.n = 1; return this._decay(dt); }
    // Beschleunigung (Welt) aus der zweiten Differenz
    const ax = (rec[a] - 2 * rec[b] + rec[c]) * k, ay = (rec[a + 1] - 2 * rec[b + 1] + rec[c + 1]) * k, az = (rec[a + 2] - 2 * rec[b + 2] + rec[c + 2]) * k;
    // Auto-Rahmen des mittleren Bildes: vorwärts (0,0,−1), rechts (1,0,0), oben (0,1,0) gedreht mit der Lage
    const qx = rec[b + 3], qy = rec[b + 4], qz = rec[b + 5], qw = rec[b + 6];
    const fx = -2 * (qx * qz + qw * qy), fy = -2 * (qy * qz - qw * qx), fz = -(1 - 2 * (qx * qx + qy * qy));
    const rx = 1 - 2 * (qy * qy + qz * qz), ry = 2 * (qx * qy + qw * qz), rz = 2 * (qx * qz - qw * qy);
    const ux = 2 * (qx * qy - qw * qz), uy = 1 - 2 * (qx * qx + qz * qz), uz = 2 * (qy * qz + qw * qx);
    let lon = (ax * fx + ay * fy + az * fz) / o.g, lat = (ax * rx + ay * ry + az * rz) / o.g, vert = (ax * ux + ay * uy + az * uz) / o.g;
    if (!Number.isFinite(lon + lat + vert)) { lon = lat = vert = 0; }
    // Tiefpass (Anzeige) und schneller Tiefpass (Landungs-Stoß)
    const al = 1 - Math.exp(-dt / o.tau), af = 1 - Math.exp(-dt / o.tauFast);
    this.lon += (lon - this.lon) * al; this.lat += (lat - this.lat) * al; this.vert += (vert - this.vert) * al;
    this.fLon += (lon - this.fLon) * af; this.fLat += (lat - this.fLat) * af; this.fVert += (vert - this.fVert) * af;
    this.tot = Math.hypot(this.lon, this.lat, this.vert);
    // Flug = kein Rad eingefedert (Einfederung 10–13); Aufsetzen nach airMin s Flug → imp s Landungs-Fenster
    const air = rec[a + 10] === 0 && rec[a + 11] === 0 && rec[a + 12] === 0 && rec[a + 13] === 0;
    if (air) { this.airN++; this.impT = 0; }
    else { if (this.airN * dt >= o.airMin) this.impT = o.imp; this.airN = 0; }
    return this._show(dt);
  }
  _decay(dt) {
    const al = 1 - Math.exp(-dt / this.o.tau);
    this.lon -= this.lon * al; this.lat -= this.lat * al; this.vert -= this.vert * al;
    this.tot = Math.hypot(this.lon, this.lat, this.vert);
    return this._show(dt);
  }
  _show(dt) {
    const t = this.tot, f = t > 1e-6 ? showG(t) / t : 0;
    let s = showG(t);
    if (this.impT > 0) { this.impT -= dt; s = Math.max(s, showImpact(Math.hypot(this.fLon, this.fLat, this.fVert))); }
    this.now = s;
    this.sLon = this.lon * f; this.sLat = this.lat * f; this.sVert = this.vert * f;
    // Spitze halten, dann mit fall G/s abfallen (nie unter den aktuellen Wert)
    if (s >= this.holdV) { this.holdV = s; this.holdT = this.o.hold; }
    else if (this.holdT > 0) this.holdT -= dt;
    else this.holdV = Math.max(s, this.holdV - this.o.fall * dt);
    this.show = this.holdV;
    if (s > this.peak) this.peak = s;
    if (Math.abs(this.sLat) > this.peakLat) this.peakLat = Math.abs(this.sLat);
    return this;
  }
  // Zustand zum Zeichnen (Kopie)
  state() { return { lon: this.sLon, lat: this.sLat, vert: this.sVert, g: this.show, now: this.now, peak: this.peak, raw: this.tot }; }
}

// ganze Aufzeichnung auf einmal (Replay, Kino-Replay, Highlights): Arrays je Bild
// cuts: Bildnummern, ab denen neu angesetzt wird (erstes Bild nach dem Versetzen)
export function gTrack(rec, cuts = [], opt = {}) {
  const S = opt.stride || GF.stride, F = Math.floor(rec.length / S), cutSet = new Set(cuts);
  const T = { F, lon: new Float32Array(F), lat: new Float32Array(F), vert: new Float32Array(F), g: new Float32Array(F), now: new Float32Array(F), raw: new Float32Array(F), rLat: new Float32Array(F), rVert: new Float32Array(F) };
  const m = new GMeter(opt);
  for (let i = 0; i < F; i++) {
    if (cutSet.has(i)) m.reset();
    m.push(rec, i);
    T.lon[i] = m.sLon; T.lat[i] = m.sLat; T.vert[i] = m.sVert; T.g[i] = m.show; T.now[i] = m.now; T.raw[i] = m.tot; T.rLat[i] = m.lat; T.rVert[i] = m.vert;
  }
  return T;
}
// Spitzenwerte (angezeigt, ohne Halten) in [i0, i1]: Betrag, quer, vertikal
export function gPeak(T, i0, i1) {
  let g = 0, lat = 0, vert = 0, ig = i0;
  for (let i = Math.max(0, i0); i <= Math.min(T.F - 1, i1); i++) {
    if (T.now[i] > g) { g = T.now[i]; ig = i; }
    lat = Math.max(lat, Math.abs(T.lat[i])); vert = Math.max(vert, Math.abs(T.vert[i]));
  }
  return { g, lat, vert, i: ig };
}
// Zahl für Einblendungen: „4,8 G“
export const fmtG = (g) => `${Math.abs(g).toFixed(1).replace('.', ',')} G`;
