// Rennfeld (n34): Startaufstellung, Rangliste, Abstände und Hochrechnung als reine Logik – ohne Grafik, ohne Physik.
// Gilt für KI-Gegner (ai/gegner.js) und später für Online-Mitspieler (n35): Jedes Auto im Feld ist nur ein Eintrag
// { id, fortschritt (m entlang der Fahrlinie, Runden eingerechnet), fertig, zeit }. Node-Test: tests/node/test_gegner.mjs.
// Fortschritt = Runde × Linienlänge + Bogenlänge des Linienpunkts (Mittellinie track.line; Ideallinie und Mittellinie
// haben dieselben Indizes, ideal.js makeLine). Ziel: Rundkurs bei 1 × Länge + s(Start), offene Strecke am vorletzten Punkt.

// Startaufstellung: 2er-Reihen hinter der Startlinie. reihe = Abstand der Reihen (m), vorn = Abstand der ersten Reihe
// zur Startlinie (der Spieler stand bisher 1 Punkt ≈ 2 m dahinter), seite = Versatz links/rechts (Anteil der halben
// Fahrbahnbreite, höchstens seiteMax m), versetzt = die rechte Spalte steht eine halbe Reihe weiter hinten (wie in der
// Formel 1 – so fährt beim Start niemand dem Nachbarn ins Heck). Reicht die Linie vor dem Start nicht (offene Strecke,
// Start dicht am Anfang), rücken die Reihen bis reiheMin zusammen; wenn auch das nicht reicht, landen die letzten auf
// dem ersten Linienpunkt (kommt in der Sammlung nicht vor – Test).
export const RASTER = { reihe: 9, reiheMin: 6, vorn: 2, seite: 0.42, seiteMax: 3.2, versetzt: true };
// Startplatz des Spielers: 'vorne' (Pole), 'mitte', 'hinten'. 'auto' = je nach Gegner-Stärke (STAERKEN[..].start)
export const STARTPLAETZE = { auto: 'Auto',   // (Hochformat: „Automatisch“ lief in den Nachbarknopf)
  vorne: 'Vorne', mitte: 'Mitte', hinten: 'Hinten' };

export function spielerSlot(n, platz) {
  if (platz === 'vorne') return 0;
  if (platz === 'hinten') return n - 1;
  return Math.floor((n - 1) / 2);   // mitte: bei 6 Autos Platz 3 (Index 2), bei 4 Platz 2, bei 2 Platz 1
}

// Rückwärts entlang der Linie: Index und Rest (m) zum Punkt `back` m vor idx (Rundkurs über den Start hinweg,
// lapDelta −1). Liefert { idx, frac, lapDelta } – frac ∈ [0,1) zwischen idx und idx+1.
export function rueckwaerts(L, idx, back) {
  let j = idx, acc = 0, lapDelta = 0;
  for (let guard = 0; guard < L.n * 2; guard++) {
    let pj = j - 1;
    if (pj < 0) { if (!L.closed) return { idx: 0, frac: 0, lapDelta, kurz: true }; pj = L.n - 2; lapDelta--; j = L.n - 1; }
    const ds = L.s[j] - L.s[pj];
    if (acc + ds >= back) { const f = ds > 1e-6 ? 1 - (back - acc) / ds : 0; return { idx: pj, frac: f, lapDelta }; }
    acc += ds; j = pj;
  }
  return { idx: j, frac: 0, lapDelta };
}

// Plätze im Raster: n Autos (Spieler eingeschlossen). Liefert je Platz { slot, reihe, spalte, idx, frac, lapDelta, lat,
// px,py,pz (Fahrbahnpunkt mit Seitenversatz), tx,ty,tz, nx,ny,nz } – Platz 0 = Pole (vorn links).
export function startRaster(L, startIdx, n, opt = {}) {
  const R = { ...RASTER, ...opt };
  // Platz vor dem Start: wie viel Linie liegt hinter der Startlinie (offene Strecke)
  const vorStart = L.closed ? Infinity : L.s[Math.max(0, startIdx)];
  const reihen = Math.ceil(n / 2);
  const tiefe = (r) => R.vorn + r * R.reihe + (R.versetzt ? R.reihe / 2 : 0);
  let reihe = R.reihe;
  if (tiefe(reihen - 1) > vorStart - 1) reihe = Math.max(R.reiheMin, (vorStart - 1 - R.vorn) / Math.max(1, reihen - 0.5));
  const out = [];
  for (let k = 0; k < n; k++) {
    const r = Math.floor(k / 2), c = k % 2;
    const back = R.vorn + r * reihe + (R.versetzt && c ? reihe / 2 : 0);
    const p = rueckwaerts(L, startIdx, back);
    const i = p.idx, j = Math.min(L.n - 1, i + 1), f = p.frac;
    const lerp = (a) => a[i] + (a[j] - a[i]) * f;
    const hw = L.hw ? Math.min(lerp(L.hw), 20) : ROAD_HW_FALLBACK;
    const lat = (c ? 1 : -1) * Math.min(R.seiteMax, hw * R.seite);
    const bx = lerp(L.bx), by = lerp(L.by), bz = lerp(L.bz);
    out.push({
      slot: k, reihe: r, spalte: c, idx: i, frac: f, lapDelta: p.lapDelta, kurz: !!p.kurz, lat, back,
      px: lerp(L.px) + bx * lat, py: lerp(L.py) + by * lat, pz: lerp(L.pz) + bz * lat,
      tx: lerp(L.tx), ty: lerp(L.ty), tz: lerp(L.tz), nx: lerp(L.nx), ny: lerp(L.ny), nz: lerp(L.nz),
    });
  }
  return out;
}
const ROAD_HW_FALLBACK = 7;

// Fortschritt (m) eines Linienpunkts in Runde lap; Ziel-Fortschritt der Strecke
export function fortschritt(L, idx, lap) { return lap * L.total + L.s[idx]; }
export function zielFortschritt(L, startIdx) { return L.closed ? L.total + L.s[startIdx] : L.s[Math.max(0, L.n - 2)]; }

// Rangliste: Fertige nach Zeit (Strafen eingerechnet), dahinter Fahrende nach Fortschritt; bei Gleichstand die kleinere
// Startnummer zuerst (stabil, deterministisch). Eintrag { id, fortschritt, fertig, zeit, nummer }.
export function rangliste(eintraege) {
  const a = eintraege.slice();
  a.sort((x, y) => {
    if (x.fertig && y.fertig) return x.zeit - y.zeit || x.nummer - y.nummer;
    if (x.fertig) return -1;
    if (y.fertig) return 1;
    return y.fortschritt - x.fortschritt || x.nummer - y.nummer;
  });
  a.forEach((e, k) => { e.platz = k + 1; });
  return a;
}

// Zeitnahme: je Auto die Uhrzeit, zu der es Fortschritts-Marken (alle schritt m) passiert hat. Abstand von B auf den
// Vordermann A = jetzt − Zeit, zu der A an B's jetziger Stelle war (wie die TV-Grafik in der Formel 1). Nach Rückspulen
// (Uhr springt zurück) werden spätere Marken verworfen.
export class Zeitnahme {
  constructor(p0, schritt = 5) { this.p0 = p0; this.schritt = schritt; this.t = new Float32Array(256); this.n = 0; }
  // Fortschritt p (m) zur Zeit uhr (s): alle Marken bis p mit linear interpolierter Zeit füllen
  melde(p, uhr) {
    const k = Math.floor((p - this.p0) / this.schritt);
    if (this.n > 0 && uhr < this.t[this.n - 1] - 1e-6) this.zurueck(uhr);
    if (k < this.n) return;
    if (k >= this.t.length) { const a = new Float32Array(Math.max(k + 1, this.t.length * 2)); a.set(this.t); this.t = a; }
    const tPrev = this.n ? this.t[this.n - 1] : uhr, pPrev = this.n ? this.p0 + (this.n - 1) * this.schritt : p;
    for (let m = this.n; m <= k; m++) {
      const pm = this.p0 + m * this.schritt;
      const u = p > pPrev ? Math.max(0, Math.min(1, (pm - pPrev) / (p - pPrev))) : 1;
      this.t[m] = tPrev + (uhr - tPrev) * u;
    }
    this.n = k + 1;
  }
  zurueck(uhr) { while (this.n > 0 && this.t[this.n - 1] > uhr) this.n--; }
  // Uhrzeit an Fortschritt p (null: noch nicht erreicht)
  zeitBei(p) {
    const f = (p - this.p0) / this.schritt, k = Math.floor(f);
    if (k < 0) return this.n ? this.t[0] : null;
    if (k + 1 >= this.n) return k < this.n ? this.t[k] : null;
    return this.t[k] + (this.t[k + 1] - this.t[k]) * (f - k);
  }
}

// Abstände in einer sortierten Rangliste: vor = Sekunden auf den Vordermann, hinter = Sekunden zum Hintermann.
// zn: Map id → Zeitnahme; uhr = jetzt. Fertige untereinander: Zeitdifferenz. Fahrender hinter Fertigem: Zeit seit
// dessen Zieldurchfahrt bis jetzt, plus hochgerechnet ist zu ungenau – dort Abstand über die Zeitnahme an der Stelle.
export function abstaende(liste, zn, uhr) {
  for (let k = 0; k < liste.length; k++) {
    const b = liste[k];
    b.vor = null; b.hinter = null;
    if (k > 0) {
      const a = liste[k - 1];
      if (a.fertig && b.fertig) b.vor = b.zeit - a.zeit;
      else if (!b.fertig) { const ta = zn.get(a.id)?.zeitBei(b.fortschritt); b.vor = ta == null ? null : Math.max(0, uhr - ta); }
    }
  }
  for (let k = 0; k + 1 < liste.length; k++) liste[k].hinter = liste[k + 1].vor;
  return liste;
}

// Hochrechnung der Restzeit (s) von Linienpunkt i0 (Tempo v0) bis Fortschritt-Ziel: fährt das Tempo-Profil vt (bereits mit
// dem Stärke-Faktor) wie die Schiene (ai/gegner.js): beschleunigt mit aDrive(v), nie schneller als das Profil.
// L = Linie mit s/total/closed, lap = Runde von i0. Nach höchstens maxSchritte Punkten: Rest mit dem Mittel-Tempo.
export function restzeit(L, vt, i0, lap, v0, ziel, aDrive) {
  let t = 0, v = Math.max(0, v0), i = i0, l = lap, p = fortschritt(L, i0, lap);
  for (let guard = 0; guard < L.n * 3 && p < ziel; guard++) {
    let j = i + 1, ds;
    if (j >= L.n) { if (!L.closed) break; j = 1; l++; ds = L.s[1]; } else ds = L.s[j] - L.s[i];
    const vMax = Math.max(1, vt[j]);
    const vNext = Math.min(vMax, Math.sqrt(v * v + 2 * Math.max(0, aDrive(v)) * ds));
    const vm = Math.max(1, (v + vNext) / 2);
    t += ds / vm; v = vNext; i = j; p = fortschritt(L, i, l);
  }
  return t;
}
