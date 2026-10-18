// Interpolations-Puffer für fremde Körper (n35 Netz-Schicht, spielunabhängig): Zustände kommen mit Sitzungszeit t
// (Abtastzeit beim Absender) an, gezeigt wird die Lage zur Zeit „jetzt − Verzug“. Dazwischen kubisch (Hermite mit den
// mitgesendeten Geschwindigkeiten – glatter als linear, Kurven werden nicht abgeschnitten), Drehung per Slerp.
// Lücke (Paket fehlt/spät): bis PUFFER.extra ms mit Tempo und Drehrate weiterrechnen, danach stehen bleiben.
// Kommt danach wieder ein Paket, springt das Auto nicht: der Unterschied wird als Fehler über PUFFER.blend s
// ausgeblendet. Sprungzähler (Feld `sprung`, z. B. Reset nach Crash) → keine Interpolation über den Sprung.
// Verzug passt sich an: 90-%-Wert der Ankunftsverspätung + Sendeabstand + Reserve, mindestens PUFFER.min ms;
// Änderungen laufen über zwei Glättungsstufen (je PUFFER.tau ms) und höchstens ± PUFFER.anpassung (Zeit dehnt sich
// höchstens um 5 %) – so ändert sich das Tempo der gezeigten Zeit nie sprunghaft und nichts ruckt.
// Vorausrechnen (abtasten(jetzt, voraus)): Lage zusätzlich um voraus × Verzug mit Tempo und Drehrate nach vorn – das
// fremde Auto steht dann fast dort, wo es auf seinem Gerät wirklich ist (Messung tools/online_mess.mjs: 3–5 m hinter echt
// → 0,2–0,4 m), bleibt stetig (Tempo aus Hermite ist stetig), schießt aber bei Vollbremsung/Crash kurz über.
// Datensatz: { px, py, pz, q: {x,y,z,w}, vx, vy, vz, …weitere Felder } (siehe paket.js). Weitere Zahlenfelder in
// opt.lin werden linear gemischt, alle anderen vom näheren Satz übernommen. Muster: game/ghost.js (15-Hz-Geist).
// Node-Test: tests/node/test_netz.mjs (glatt/genau bei 0/50/150 ms, Schwankung, 5 % Verlust).

export const PUFFER = { min: 100, max: 450, extra: 250, reserve: 25, anpassung: 0.05, tau: 800, blend: 0.2, sprung: 8, n: 40, latN: 40, vGlatt: 0.04 };

export class FremdPuffer {
  constructor(opt = {}) {
    this.lin = opt.lin || [];
    this.sprungFeld = opt.sprung || 'sprung';
    this.min = opt.min ?? PUFFER.min;
    this.s = [];                      // [{ t, d }] nach t sortiert
    this.lat = [];                    // Ankunftsverspätung (ms)
    this.verzug = this.min; this.verzug1 = this.min;
    this.letztT = null; this.letztJetzt = null;
    this.fp = [0, 0, 0]; this.fq = [0, 0, 0, 1];   // Fehler (wird ausgeblendet)
    this.out = { px: 0, py: 0, pz: 0, q: { x: 0, y: 0, z: 0, w: 1 }, vx: 0, vy: 0, vz: 0 };
    this.art = 'leer';                // 'leer' | 'interp' | 'extra' | 'halt'
    this.intervall = 50;
  }
  get leer() { return this.s.length === 0; }
  neuestes() { return this.s.length ? this.s[this.s.length - 1] : null; }

  // Zustand d zur Sitzungszeit t, angekommen bei Sitzungszeit ankunft
  rein(t, d, ankunft = t) {
    const S = this.s;
    if (S.length && t <= S[S.length - 1].t) {
      // verspätet/doppelt: einsortieren, wenn noch nicht vorhanden und nicht zu alt
      if (S.some((e) => e.t === t) || t < S[0].t) return false;
    }
    let alt = null;
    if (this.letztT != null && S.length) alt = this._roh(this.letztT, {});
    const e = { t, d: kopie(d) };
    let i = S.length; while (i > 0 && S[i - 1].t > t) i--;
    S.splice(i, 0, e);
    if (S.length > PUFFER.n) S.shift();
    // Verspätung und Sendeabstand messen
    this.lat.push(ankunft - t); if (this.lat.length > PUFFER.latN) this.lat.shift();
    if (S.length >= 3) {
      const ds = []; for (let k = 1; k < S.length; k++) ds.push(S[k].t - S[k - 1].t);
      ds.sort((a, b) => a - b); this.intervall = ds[ds.length >> 1];
    }
    // Fehler aus der Korrektur übernehmen (nur wenn kein Sprung)
    if (alt) {
      const neu = this._roh(this.letztT, {});
      if (neu.sprung !== alt.sprung || Math.hypot(alt.px - neu.px, alt.py - neu.py, alt.pz - neu.pz) > PUFFER.sprung) { this.fp[0] = this.fp[1] = this.fp[2] = 0; this.fq = [0, 0, 0, 1]; }
      else {
        this.fp[0] += alt.px - neu.px; this.fp[1] += alt.py - neu.py; this.fp[2] += alt.pz - neu.pz;
        // fq = alt · neu⁻¹ · fq
        const dq = qmul([alt.q.x, alt.q.y, alt.q.z, alt.q.w], qkonj([neu.q.x, neu.q.y, neu.q.z, neu.q.w]));
        this.fq = qnorm(qmul(dq, this.fq));
      }
    }
    if (this.lat.length === 1) this.verzug = this.verzug1 = this.zielVerzug();
    return true;
  }

  zielVerzug() {
    if (!this.lat.length) return this.min;
    const a = this.lat.slice().sort((x, y) => x - y);
    const p90 = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
    return Math.max(this.min, Math.min(PUFFER.max, p90 + this.intervall + PUFFER.reserve));
  }

  // Lage zur Sitzungszeit jetzt (ms). Liefert this.out (wird wiederverwendet) oder null, solange leer.
  // voraus ∈ [0, 1]: Anteil des Verzugs, um den vorausgerechnet wird (0 = gezeigte Pufferlage)
  abtasten(jetzt, voraus = 0) {
    if (!this.s.length) { this.art = 'leer'; return null; }
    const dt = this.letztJetzt == null ? 0 : Math.max(0, Math.min(200, jetzt - this.letztJetzt));
    this.letztJetzt = jetzt;
    // Verzug nachführen: zwei Tiefpässe hintereinander (Tempo der Zeit stetig), höchstens ± anpassung × dt
    const ziel = this.zielVerzug(), k1 = Math.min(1, dt / PUFFER.tau);
    this.verzug1 += (ziel - this.verzug1) * k1;
    const dv = Math.max(-PUFFER.anpassung * dt, Math.min(PUFFER.anpassung * dt, (this.verzug1 - this.verzug) * k1));
    this.verzug += dv;
    let tr = jetzt - this.verzug;
    if (this.letztT != null && tr < this.letztT) tr = this.letztT;   // nie rückwärts
    this.letztT = tr;
    const o = this._roh(tr, this.out);
    // Fehler ausblenden
    const k = dt > 0 ? Math.exp(-dt / 1000 / PUFFER.blend) : 1;
    this.fp[0] *= k; this.fp[1] *= k; this.fp[2] *= k;
    this.fq = qnorm(qslerp([0, 0, 0, 1], this.fq, k));
    o.px += this.fp[0]; o.py += this.fp[1]; o.pz += this.fp[2];
    let q = qnorm(qmul(this.fq, [o.q.x, o.q.y, o.q.z, o.q.w]));
    if (voraus > 0 && this.art !== 'halt') {
      const d = voraus * Math.min(this.verzug, PUFFER.extra) / 1000;
      // Tempo fürs Vorausrechnen leicht geglättet (PUFFER.vGlatt s): ein verspätetes Paket (kurz extrapoliert, dann wieder
      // interpoliert) ändert das Tempo sonst sprunghaft – × Verzug ein sichtbarer Satz
      const V = this.vp || (this.vp = [o.vx, o.vy, o.vz]), kv = dt > 0 ? 1 - Math.exp(-dt / 1000 / PUFFER.vGlatt) : 1;
      if (Math.hypot(o.vx - V[0], o.vy - V[1], o.vz - V[2]) > 15) { V[0] = o.vx; V[1] = o.vy; V[2] = o.vz; }   // Reset/Crash: sofort
      else { V[0] += (o.vx - V[0]) * kv; V[1] += (o.vy - V[1]) * kv; V[2] += (o.vz - V[2]) * kv; }
      o.px += V[0] * d; o.py += V[1] * d; o.pz += V[2] * d;
      // Drehrate aus der Rohlage 20 ms früher (o.q ist hier noch die Rohlage zu tr); über einen Sprung nicht
      const art = this.art, f = this._roh(tr - 20, this._qv || (this._qv = {}));
      this.art = art;
      if (f.sprung === o.sprung) { const dq = qmul([o.q.x, o.q.y, o.q.z, o.q.w], qkonj([f.q.x, f.q.y, f.q.z, f.q.w])); q = qnorm(qmul(qpow(dq, Math.min(12, d / 0.02)), q)); }
    }
    o.q.x = q[0]; o.q.y = q[1]; o.q.z = q[2]; o.q.w = q[3];
    return o;
  }

  // Lage ohne Fehler-Ausblendung zur Zeit tr
  _roh(tr, o) {
    const S = this.s, n = S.length;
    if (!o.q) o.q = { x: 0, y: 0, z: 0, w: 1 };
    if (n === 1 || tr <= S[0].t) {
      if (n === 1 && tr > S[0].t) return this._extra(S[0], null, tr, o);
      setze(o, S[0].d, this.sprungFeld); this.art = 'interp'; return o;
    }
    if (tr >= S[n - 1].t) return this._extra(S[n - 1], S[n - 2], tr, o);
    let i = n - 2; while (i > 0 && S[i].t > tr) i--;
    const A = S[i], B = S[i + 1], a = A.d, b = B.d;
    const h = (B.t - A.t) / 1000, u = (tr - A.t) / (B.t - A.t);
    if (a[this.sprungFeld] !== b[this.sprungFeld]) return this._extra(A, i > 0 ? S[i - 1] : null, tr, o, true);   // Sprung: bis tB alte Lage weiterrechnen
    // Hermite: p(u) = h00·p0 + h10·h·v0 + h01·p1 + h11·h·v1; Tempo = Ableitung / h
    const u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    const d00 = 6 * u2 - 6 * u, d10 = 3 * u2 - 4 * u + 1, d01 = -6 * u2 + 6 * u, d11 = 3 * u2 - 2 * u;
    for (const [p, v] of [['px', 'vx'], ['py', 'vy'], ['pz', 'vz']]) {
      o[p] = h00 * a[p] + h10 * h * a[v] + h01 * b[p] + h11 * h * b[v];
      o[v] = (d00 * a[p] + d10 * h * a[v] + d01 * b[p] + d11 * h * b[v]) / h;
    }
    const q = qslerp([a.q.x, a.q.y, a.q.z, a.q.w], [b.q.x, b.q.y, b.q.z, b.q.w], u);
    o.q.x = q[0]; o.q.y = q[1]; o.q.z = q[2]; o.q.w = q[3];
    const near = u < 0.5 ? a : b;
    for (const k in near) if (k !== 'q' && !(k in POSE)) o[k] = near[k];
    for (const k of this.lin) o[k] = a[k] + (b[k] - a[k]) * u;
    o.sprung = a[this.sprungFeld];
    this.art = 'interp';
    return o;
  }

  // über das neueste Paket hinaus: Tempo und Drehrate (aus den letzten zwei Paketen) höchstens PUFFER.extra ms
  _extra(E, V, tr, o, vorSprung = false) {
    const d = E.d;
    setze(o, d, this.sprungFeld);
    const ex = Math.min(tr - E.t, PUFFER.extra) / 1000;
    this.art = vorSprung ? 'interp' : tr - E.t > PUFFER.extra ? 'halt' : 'extra';
    if (ex <= 0) return o;
    o.px = d.px + d.vx * ex; o.py = d.py + d.vy * ex; o.pz = d.pz + d.vz * ex;
    if (V && V.d[this.sprungFeld] === d[this.sprungFeld] && E.t > V.t) {
      const q0 = [V.d.q.x, V.d.q.y, V.d.q.z, V.d.q.w], q1 = [d.q.x, d.q.y, d.q.z, d.q.w];
      const k = ex / ((E.t - V.t) / 1000);
      const dq = qmul(q1, qkonj(q0));
      const q = qnorm(qmul(qpow(dq, Math.min(k, 5)), q1));
      o.q.x = q[0]; o.q.y = q[1]; o.q.z = q[2]; o.q.w = q[3];
    }
    return o;
  }
}

const POSE = { px: 1, py: 1, pz: 1, vx: 1, vy: 1, vz: 1, q: 1 };
function kopie(d) { const c = { ...d }; c.q = { ...(d.q || { x: 0, y: 0, z: 0, w: 1 }) }; return c; }
function setze(o, d, sf) { for (const k in d) if (k !== 'q') o[k] = d[k]; o.q.x = d.q.x; o.q.y = d.q.y; o.q.z = d.q.z; o.q.w = d.q.w; o.sprung = d[sf]; return o; }

// Quaternion-Helfer (x, y, z, w), ohne three.js (Node)
export function qmul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
export function qkonj(a) { return [-a[0], -a[1], -a[2], a[3]]; }
export function qnorm(a) { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return [a[0] / l, a[1] / l, a[2] / l, a[3] / l]; }
export function qslerp(a, b, u) {
  let c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (c < 0) { c = -c; bb = [-b[0], -b[1], -b[2], -b[3]]; }
  if (c > 0.9995) return qnorm([a[0] + (bb[0] - a[0]) * u, a[1] + (bb[1] - a[1]) * u, a[2] + (bb[2] - a[2]) * u, a[3] + (bb[3] - a[3]) * u]);
  const th = Math.acos(Math.min(1, c)), s = Math.sin(th), wa = Math.sin((1 - u) * th) / s, wb = Math.sin(u * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb, a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}
// q^k (Drehung um denselben Winkel × k), kürzester Weg
export function qpow(q, k) {
  let [x, y, z, w] = q;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
  if (s < 1e-9) return [0, 0, 0, 1];
  const th = 2 * Math.atan2(s, w) * k;
  const f = Math.sin(th / 2) / s;
  return [x * f, y * f, z * f, Math.cos(th / 2)];
}
// Winkel zwischen zwei Quaternionen (Bogenmaß)
export function qwinkel(a, b) { const c = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, c)); }
