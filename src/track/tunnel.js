// n33 Tunnel-Einfahrt (Nachtrag Peter 09.10.2026: „Tunneleinfahrt sieht aus wie eine Wand“) – nur Optik, rein rechnend
// (Node-testbar: tests/node/test_tunnel.mjs). Physik, Strecke, Kollision und Bau-Hash bleiben unverändert; alles hier wird
// erst beim Aufbau der Grafik (gfx/world.js, gfx/tunnel.js) aus der fertigen Strecke abgeleitet.
//
// Befund vorher (main be11bcb): Das Gelände ist ein Höhenfeld im 5-m-Raster. Am Portal springt es von der Zufahrt
// (Fahrbahnhöhe) auf den Hügel über dem Gewölbe (+9 … +15 m) – zwischen zwei Rasterpunkten, also als schräge Fläche quer
// durch die Tunnelöffnung (Felsfarbe, weil steil). Von außen war die Öffnung dadurch zu: „Felswand statt Tunnel“. Innen
// leuchtete das Himmelslicht so hell wie draußen.
//
// Hier:
//  1. tunnelLaeufe(track): gerade Tunnel-Läufe (Gelände-Tunnel n22, .TRK-Kastentunnel) mit Achse, Querschnitt, Portalen.
//  2. portalGelaende(…): ersetzt die Rasterzellen um jedes Gelände-Portal durch ein feines Netz (0,5 m), dessen Höhe vor
//     dem Portal unter die Fahrbahn geht (Einschnitt) und hinter der Portalwand über das Gewölbe (Hügel) – die Stufe
//     dazwischen bleibt offen (Schlitz direkt hinter der Portalwand, von oben vom „Kragen“ verdeckt). Die Ränder des
//     feinen Netzes liegen genau auf den Kanten der Nachbarzellen (gleiche Dreiecksteilung) → keine Risse.
//  3. portalFront(…): neue Portal-Stirnwand vor der alten (die bleibt als Kollision stehen): helle Betonwand mit sichtbarer
//     Wandstärke (Laibung, Deckel, Seiten), dunkler Rand an der Öffnung (Vertex-Farbe), gelb-schwarze Warnstreifen an den
//     Leibungen, Kragen über dem Schlitz.
//  4. tunnelAttr(…): je Eckpunkt der Strecken-Batches (Maske, Weg ab Portal, quer, Abstand zur Decke) → Shader dunkelt
//     innen das Himmels-/Umgebungslicht ab, zeichnet Leuchtbänder an die Decke und Lichtpfützen darunter (gfx/tunnel.js).
import { ENV } from './gelaende.js';
import { TUN } from './pieces_gel.js';
import { ROAD_HW } from './defs.js';
import { triLerp, TB } from './terrgrid.js';

// Schalter: ?tunnelalt=1 (main.js) bzw. STUNT_TUNNELALT=1 (Node) = alter Look
export const TUNNEL_LOOK = {
  an: !(globalThis.process && globalThis.process.env && globalThis.process.env.STUNT_TUNNELALT === '1'),
  rampe: 11,        // m hinter dem Portal bis voll dunkel (weicher Verlauf, das Tageslicht fällt ein Stück hinein)
  amb: 0.2,         // Himmels-/Umgebungslicht innen (Anteil von außen)
  lampAbst: 12,     // m zwischen den Leuchten
  lampQuer: 2.6,    // m Leuchtenreihe links/rechts der Mitte
  sub: 8,           // Unterteilung der Rasterzellen am Portal, falls die Achse nicht im Raster liegt (5 m / 8)
};

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Deckenhöhe über der Fahrbahn bei Querlage r (Gelände-Tunnel: senkrechte Wände bis TUN.wall, Gewölbe bis ENV.tunnelH)
function deckeGel(r) {
  const a = Math.min(1, Math.abs(r) / TUN.tw);
  return TUN.wall + (ENV.tunnelH - TUN.wall) * Math.sqrt(Math.max(0, 1 - a * a));
}

// ---------- 1. Tunnel-Läufe ----------
export function tunnelLaeufe(track) {
  if (track._tunnelLaeufe) return track._tunnelLaeufe;
  const L = track.line, P = track.pieces || [], lay = track.layout || {}, out = [];
  const lauf = (k0, k1, art, portalIn, portalOut) => {
    // der erste Linienpunkt eines Stücks liegt einen Schritt hinter seiner Einfahrtskante (der Punkt auf der Kante gehört
    // zum Stück davor) → Lauf ab dem Punkt davor, damit t = 0 die Einfahrtskante ist (f = 0 in pieces_gel.js)
    const i0 = P[k0] && P[k0].lineStart != null ? Math.max(0, P[k0].lineStart - 1) : null, i1 = P[k1] && P[k1].lineEnd;
    if (i0 == null || i1 == null || i1 - i0 < 2) return;
    let dx = L.px[i1] - L.px[i0], dz = L.pz[i1] - L.pz[i0];
    const len = Math.hypot(dx, dz);
    if (len < 8) return;
    dx /= len; dz /= len;
    // nur gerade Läufe (Achse in der Ebene)
    for (let i = i0; i <= i1; i++) if (Math.abs((L.px[i] - L.px[i0]) * -dz + (L.pz[i] - L.pz[i0]) * dx) > 0.35) return;
    const ts = [], ys = [];
    for (let i = i0; i <= i1; i++) { ts.push((L.px[i] - L.px[i0]) * dx + (L.pz[i] - L.pz[i0]) * dz); ys.push(L.py[i]); }
    const gel = art === 'gel';
    out.push({
      art, i0, i1, A: [L.px[i0], L.py[i0], L.pz[i0]], D: [dx, dz], B: [-dz, dx], len, ts, ys,
      tw: gel ? TUN.tw : ROAD_HW + 0.5, H: gel ? ENV.tunnelH : 5.4, wall: gel ? TUN.wall : 5.4,
      // Portalwand (Fläche zur Zufahrt) in Laufrichtung: Gelände bei f = 0,4 bzw. T − 0,4 (pieces_gel.js tunnelPortal)
      faceIn: portalIn ? (gel ? 0.4 : 0) : null, faceOut: portalOut ? (gel ? len - 0.4 : len) : null,
    });
  };
  if (track.gel && track.gel.plan) {
    const pl = track.gel.plan.pieces;
    for (let k = 0; k < pl.length; k++) {
      if (!pl[k] || !pl[k].tunnel || (k > 0 && pl[k - 1] && pl[k - 1].tunnel)) continue;
      let e = k; while (e + 1 < pl.length && pl[e + 1] && pl[e + 1].tunnel) e++;
      lauf(k, e, 'gel', !!pl[k].portalIn, !!pl[e].portalOut);
    }
  } else if (lay.trk && lay.pieces) {
    const tun = (pc) => pc && pc.deco === 'tunnel' && !pc.sub;
    for (let k = 0; k < lay.pieces.length; k++) {
      if (!tun(lay.pieces[k]) || tun(lay.pieces[k - 1])) continue;
      let e = k; while (e + 1 < lay.pieces.length && tun(lay.pieces[e + 1])) e++;
      lauf(k, e, 'trk', lay.pieces[k].pk !== 'tunnel', lay.pieces[e].nk !== 'tunnel');
    }
  }
  Object.defineProperty(track, '_tunnelLaeufe', { value: out, enumerable: false });
  return out;
}

// Fahrbahnhöhe auf der Achse bei t (linear, außerhalb mit der Endsteigung fortgesetzt)
export function hoeheAuf(R, t) {
  const ts = R.ts, ys = R.ys, n = ts.length;
  if (t <= ts[0]) return ys[0] + (ys[1] - ys[0]) / (ts[1] - ts[0] || 1) * (t - ts[0]);
  if (t >= ts[n - 1]) return ys[n - 1] + (ys[n - 1] - ys[n - 2]) / (ts[n - 1] - ts[n - 2] || 1) * (t - ts[n - 1]);
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ts[m] <= t) lo = m; else hi = m; }
  return ys[lo] + (ys[hi] - ys[lo]) * (t - ts[lo]) / (ts[hi] - ts[lo] || 1);
}
// Lage eines Weltpunkts zum Lauf: t entlang der Achse ab Lauf-Anfang, r quer (rechts +), h über der Fahrbahn
export function lageIm(R, x, y, z) {
  const ex = x - R.A[0], ez = z - R.A[2];
  const t = ex * R.D[0] + ez * R.D[1], r = ex * R.B[0] + ez * R.B[1];
  return [t, r, y - hoeheAuf(R, t)];
}
// Dunkel-Maske 0 … 1 bei t (0 vor den Portalen, steigt hinter jedem Portal über TUNNEL_LOOK.rampe m)
export function maskeBei(R, t) {
  const rp = TUNNEL_LOOK.rampe;
  let m = 1;
  if (R.faceIn != null) m *= sstep(R.faceIn, R.faceIn + rp, t);
  else if (t < 0) m = 0;
  if (R.faceOut != null) m *= sstep(R.faceOut, R.faceOut - rp, t);
  else if (t > R.len) m = 0;
  return m;
}
// Maske an einem Weltpunkt (Auto/Kamera): innerhalb des Querschnitts eines Laufs
export function maskeAm(laeufe, x, y, z) {
  let best = 0;
  for (const R of laeufe) {
    const [t, r, h] = lageIm(R, x, y, z);
    if (t < -1 || t > R.len + 1 || Math.abs(r) > R.tw + 0.5 || h < -1.5 || h > R.H + 0.8) continue;
    best = Math.max(best, maskeBei(R, t));
  }
  return best;
}

// ---------- 4. Vertex-Attribut der Strecken-Batches ----------
// je Batch: Float32Array(nv × 4) = (Maske, Weg ab Lauf-Anfang, quer, Höhe minus Decke) oder null (kein Punkt im Tunnel)
export function tunnelAttr(batches, laeufe) {
  const res = [];
  for (const b of batches) {
    const P = b.pos, nv = P.length / 3;
    let a = null;
    for (const R of laeufe) {
      // grob: Hüllquader des Laufs
      const x0 = Math.min(R.A[0], R.A[0] + R.D[0] * R.len) - R.tw - 2, x1 = Math.max(R.A[0], R.A[0] + R.D[0] * R.len) + R.tw + 2;
      const z0 = Math.min(R.A[2], R.A[2] + R.D[1] * R.len) - R.tw - 2, z1 = Math.max(R.A[2], R.A[2] + R.D[1] * R.len) + R.tw + 2;
      for (let v = 0; v < nv; v++) {
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];
        if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        const [t, r, h] = lageIm(R, x, y, z);
        if (t < -0.6 || t > R.len + 0.6 || Math.abs(r) > R.tw + 0.4 || h < -0.8 || h > R.H + 0.6) continue;
        const m = maskeBei(R, t);
        if (!a) a = new Float32Array(nv * 4);
        const dc = h - (R.art === 'gel' ? deckeGel(r) : R.H);
        a[v * 4] = m; a[v * 4 + 1] = t; a[v * 4 + 2] = r; a[v * 4 + 3] = dc;
      }
    }
    res.push(a);
  }
  return res;
}

// ---------- 2. Gelände an den Portalen ----------
// Portale der Gelände-Läufe: Mittelpunkt der Portalwand auf Fahrbahnhöhe, Richtung nach außen (Zufahrt)
// (alle = auch .TRK-Kastentunnel, für die Nacht-Lichter)
export function portale(laeufe, alle = false) {
  const out = [];
  for (const R of laeufe) {
    if (R.art !== 'gel' && !alle) continue;
    if (R.faceIn != null) out.push({ R, t: R.faceIn, s: -1 });
    if (R.faceOut != null) out.push({ R, t: R.faceOut, s: 1 });
  }
  for (const p of out) {
    const { R, t, s } = p;
    p.x = R.A[0] + R.D[0] * t; p.z = R.A[2] + R.D[1] * t; p.y = hoeheAuf(R, t);
    p.ox = R.D[0] * s; p.oz = R.D[1] * s;   // nach außen
    p.Wx = R.art === 'gel' ? R.tw + 9 : R.tw + 2.2;   // halbe Breite der Portalwand (pieces_gel.js tunnelPortal / pieces_trk.js)
    p.Yt = R.art === 'gel' ? R.H + 3.6 : R.H + 1.6;
  }
  return out;
}
// o = Abstand vor der Portalwand (außen +), r quer, Fahrbahnhöhe dort
function portalLage(p, x, z) {
  const ex = x - p.x, ez = z - p.z;
  const o = ex * p.ox + ez * p.oz, r = ex * p.R.B[0] + ez * p.R.B[1];
  return [o, r, hoeheAuf(p.R, p.t + o * p.s)];
}
const O_SCHLITZ = -0.25;   // Stufe Einschnitt → Hügel liegt so weit hinter der Portalwand
// Höhe des feinen Netzes: natürliche Höhe hn → vor der Wand (o ≥ O_SCHLITZ) höchstens Einschnitt, dahinter mindestens
// Deckung über dem Gewölbe
export function portalHoehe(p, o, r, yR, hn) {
  const tw = p.R.tw, ar = Math.abs(r);
  if (o >= O_SCHLITZ) {
    const lim = yR - 0.3 + Math.max(0, ar - (tw + 0.4)) * 1.0;
    const w = (1 - sstep(4, 9, o)) * (1 - sstep(p.Wx, p.Wx + 4, ar));
    return hn > lim ? hn + (lim - hn) * w : hn;
  }
  const lim2 = yR + p.R.H + 2.2 - Math.max(0, ar - tw - 2) * 0.9;
  const w = (1 - sstep(p.Wx - 2, p.Wx + 3, ar)) * sstep(-20, -16.5, o);   // tiefer im Hügel liegt das Gelände über dem Gewölbe (Rand des Netzes = Nachbarzellen)
  return lim2 > hn ? hn + (lim2 - hn) * w : hn;
}
// T = Gelände (ext, step, nx, fine, nb), HH = gezeichnete Höhen. Liefert { skip: Set(Zellindex), pos, uv, idx, n }
export function portalGelaende(T, laeufe, HH) {
  const ps = portale(laeufe), skip = new Set(), pos = [], uv = [], idx = [];
  const { ext, step, nx } = T, S = TUNNEL_LOOK.sub, nb = T.fine ? T.nb : (nx - 1) / TB;
  let n = 0;
  for (const p of ps) {
    // Bereich: 20 m in den Hügel (am Ausgang liegt das Raster-Gelände bis ~12 m tief im Rohr noch zu tief), 11 m davor, quer Wx + 6
    const cs = [];
    for (const [o, r] of [[-20, -p.Wx - 6], [-20, p.Wx + 6], [11, -p.Wx - 6], [11, p.Wx + 6]]) cs.push([p.x + p.ox * o + p.R.B[0] * r, p.z + p.oz * o + p.R.B[1] * r]);
    const xs = cs.map((c) => c[0]), zs = cs.map((c) => c[1]);
    const i0 = Math.floor((Math.min(...xs) + ext) / step), i1 = Math.ceil((Math.max(...xs) + ext) / step);
    const j0 = Math.floor((Math.min(...zs) + ext) / step), j1 = Math.ceil((Math.max(...zs) + ext) / step);
    if (i0 < 0 || j0 < 0 || i1 > nx - 1 || j1 > nx - 1) continue;
    let ok = true;
    for (let j = j0; j < j1 && ok; j++) for (let i = i0; i < i1 && ok; i++) {
      if (skip.has(j * nx + i)) ok = false;
      const bi = Math.floor(i / TB), bj = Math.floor(j / TB);
      if (T.fine && !T.fine[bj * nb + bi]) ok = false;
    }
    if (!ok) continue;
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) skip.add(j * nx + i);
    // Gitterlinien: alle Rasterlinien + ungleichmäßig dichte Zusatzlinien (fein an der Portalwand und an den Rändern der
    // Öffnung, grob im Hügel). Die Tunnelachse liegt auf Gelände-Strecken im Raster (x oder z) – sonst gleichmäßig 1/S.
    const X0 = -ext + i0 * step, X1 = -ext + i1 * step, Z0 = -ext + j0 * step, Z1 = -ext + j1 * step;
    const tw = p.R.tw, ax = Math.abs(p.ox) > 0.999 ? 'x' : Math.abs(p.oz) > 0.999 ? 'z' : null;
    const oL = [O_SCHLITZ - 0.3, O_SCHLITZ + 0.3, 0.5, 0.9, 1.4, 2.2, 3, 4, 5.2, 6.5, 7.8, 9, -0.9, -1.6, -2.5, -3.5, -5, -7, -9, -12, -14.5, -16.5, -18.2];
    const rL = [0, 2.5, 5, tw - 0.6, tw, tw + 0.3, tw + 0.6, tw + 1.2, tw + 2.5, tw + 4, p.Wx - 2, p.Wx - 1, p.Wx, p.Wx + 1, p.Wx + 2, p.Wx + 3, p.Wx + 4, p.Wx + 5.5].flatMap((r) => [r, -r]);
    const linien = (a0, a1, i, extra) => {
      const v = [];
      for (let k = 0; k <= i; k++) v.push(a0 + k * step);
      if (extra) v.push(...extra); else for (let k = 0; k < i * S; k++) v.push(a0 + k * step / S);
      return [...new Set(v.filter((q) => q >= a0 - 1e-6 && q <= a1 + 1e-6).sort((a, b) => a - b).map((q) => Math.round(q * 1000) / 1000))]
        .filter((q, k, A) => k === 0 || q - A[k - 1] > 0.05 || q === a1);
    };
    const exO = (c, d) => oL.map((o) => c + d * o), exR = (c, d) => rL.map((r) => c + d * r);
    const GX = linien(X0, X1, i1 - i0, ax === 'x' ? exO(p.x, p.ox) : ax === 'z' ? exR(p.x, p.R.B[0]) : null);
    const GZ = linien(Z0, Z1, j1 - j0, ax === 'z' ? exO(p.z, p.oz) : ax === 'x' ? exR(p.z, p.R.B[1]) : null);
    const NI = GX.length, NJ = GZ.length, base = n;
    const O = new Float32Array(NI * NJ), Rr = new Float32Array(NI * NJ);
    for (let b = 0; b < NJ; b++) for (let a = 0; a < NI; a++) {
      const x = GX[a], z = GZ[b];
      const fx = (x + ext) / step, fz = (z + ext) / step;
      const ci = Math.min(i1 - 1, Math.floor(fx + 1e-9)), cj = Math.min(j1 - 1, Math.floor(fz + 1e-9));
      const u = Math.min(1, Math.max(0, fx - ci)), v = Math.min(1, Math.max(0, fz - cj)), k = cj * nx + ci;
      const hn = triLerp(HH[k], HH[k + 1], HH[k + nx], HH[k + nx + 1], u, v);
      const [o, r, yR] = portalLage(p, x, z);
      O[b * NI + a] = o; Rr[b * NI + a] = r;
      pos.push(x, portalHoehe(p, o, r, yR, hn), z); uv.push(x, z);
      n++;
    }
    for (let b = 0; b < NJ - 1; b++) for (let a = 0; a < NI - 1; a++) {
      const q = [b * NI + a, b * NI + a + 1, (b + 1) * NI + a, (b + 1) * NI + a + 1];
      const os = q.map((k) => O[k]), rs = q.map((k) => Math.abs(Rr[k]));
      // Schlitz: Stufe Einschnitt → Hügel innerhalb der Tunnelbreite bleibt offen (sonst Wand quer durch die Öffnung)
      if (Math.min(...os) < O_SCHLITZ && Math.max(...os) >= O_SCHLITZ && Math.min(...rs) < tw + 0.6) continue;
      idx.push(base + q[0], base + q[2], base + q[1], base + q[1], base + q[2], base + q[3]);
    }
  }
  return { skip, pos, uv, idx, n, portale: ps };
}

// ---------- 3. Neue Portal-Stirnwand ----------
// Farben (linear): heller Beton, Rand an der Öffnung dunkler, Warnstreifen gelb/schwarz
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const rgb = (h) => [lin(((h >> 16) & 255) / 255), lin(((h >> 8) & 255) / 255), lin((h & 255) / 255)];
export const PORTAL_FARBE = { beton: rgb(0xe6dccb), rand: rgb(0x958d80), gelb: rgb(0xf2b705), schwarz: rgb(0x1c1c1c) };
// Öffnung (Kontur wie pieces_gel.js tunnelContour, ohne die Bodenpunkte): rechts unten → Gewölbe → links unten
function oeffnung(R) {
  const { tw, wall, n } = TUN, top = R.H - wall, pts = [[tw, 0], [tw, wall]];
  for (let k = 1; k < n; k++) { const a = Math.PI * k / n; pts.push([tw * Math.cos(a), wall + top * Math.sin(a)]); }
  pts.push([-tw, wall], [-tw, 0]);
  return pts;
}
// liefert { pos, nrm, uv, col, idx } – ein Mesh für alle Portale (Material: heller Beton mit Vertex-Farben)
export function portalFront(laeufe) {
  const pos = [], nrm = [], uv = [], col = [], idx = [];
  const F = PORTAL_FARBE;
  for (const p of portale(laeufe)) {
    const R = p.R, tw = R.tw, Wx = p.Wx + 0.15, Yb = -1.0, Yt = p.Yt + 0.15;
    const oF = 0.95, oB = 0.38;   // Vorderfläche 0,95 m vor der alten Wand (deren Kästen reichen bis 0,9 m), Laibung bis zum Tunnelrohr
    // Weltpunkt aus (o vor der Wand, r quer, y über der Fahrbahn am Portal)
    const W = (o, r, y) => [p.x + p.ox * o + R.B[0] * r, p.y + y, p.z + p.oz * o + R.B[1] * r];
    const vtx = (P, N, U, C) => { pos.push(...P); nrm.push(...N); uv.push(...U); col.push(...C); return pos.length / 3 - 1; };
    const NO = [p.ox, 0, p.oz];
    // Dreieck mit gewünschter Außenseite N
    const tri = (a, b, c, N) => {
      const A = pos.slice(a * 3, a * 3 + 3), B = pos.slice(b * 3, b * 3 + 3), C = pos.slice(c * 3, c * 3 + 3);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const cr = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (cr[0] * N[0] + cr[1] * N[1] + cr[2] * N[2] >= 0) idx.push(a, b, c); else idx.push(a, c, b);
    };
    const quad = (P4, N, U4, C4) => { const q = P4.map((P, k) => vtx(P, N, U4[k], C4[k])); tri(q[0], q[1], q[2], N); tri(q[0], q[2], q[3], N); };
    // Vorderfläche: Ring zwischen Öffnung, einem Rand 1,1 m weiter außen (dunkel → hell) und dem Rechteck
    const C = oeffnung(R), cy = R.wall * 0.6;
    const mid = C.map(([r, y]) => { const dx = r, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [r + dx / l * 1.1, y + Math.max(0, dy / l) * 1.1]; });
    const rect = C.map(([r, y]) => {
      const dx = r, dy = y - cy; let t = 1e9;
      if (dx > 1e-6) t = Math.min(t, Wx / dx); if (dx < -1e-6) t = Math.min(t, -Wx / dx);
      if (dy > 1e-6) t = Math.min(t, (Yt - cy) / dy); if (dy < -1e-6) t = Math.min(t, (Yb - cy) / dy);
      return [dx * t, cy + dy * t];
    });
    const fu = (r, y) => [r / 3, y / 3];
    for (let k = 0; k < C.length - 1; k++) {
      const a = C[k], b = C[k + 1], ma = mid[k], mb = mid[k + 1], ra = rect[k], rb = rect[k + 1];
      quad([W(oF, a[0], a[1]), W(oF, b[0], b[1]), W(oF, mb[0], mb[1]), W(oF, ma[0], ma[1])], NO, [fu(...a), fu(...b), fu(...mb), fu(...ma)], [F.rand, F.rand, F.beton, F.beton]);
      quad([W(oF, ma[0], ma[1]), W(oF, mb[0], mb[1]), W(oF, rb[0], rb[1]), W(oF, ra[0], ra[1])], NO, [fu(...ma), fu(...mb), fu(...rb), fu(...ra)], [F.beton, F.beton, F.beton, F.beton]);
      // Rechteck-Ecken zwischen zwei Seiten
      const side = (q) => (Math.abs(q[0] - Wx) < 1e-4 ? 'R' : Math.abs(q[0] + Wx) < 1e-4 ? 'L' : Math.abs(q[1] - Yt) < 1e-4 ? 'T' : 'B');
      const sa = side(ra), sb = side(rb);
      if (sa !== sb) {
        const ec = { RT: [Wx, Yt], TR: [Wx, Yt], LT: [-Wx, Yt], TL: [-Wx, Yt], RB: [Wx, Yb], BR: [Wx, Yb], LB: [-Wx, Yb], BL: [-Wx, Yb] }[sa + sb];
        if (ec) { const q = [vtx(W(oF, ma[0], ma[1]), NO, fu(...ma), F.beton), vtx(W(oF, ra[0], ra[1]), NO, fu(...ra), F.beton), vtx(W(oF, ec[0], ec[1]), NO, fu(...ec), F.beton), vtx(W(oF, rb[0], rb[1]), NO, fu(...rb), F.beton)]; tri(q[0], q[1], q[2], NO); tri(q[0], q[2], q[3], NO); }
      }
      // Laibung (Wandstärke an der Bogenkante), Normale zur Öffnungsmitte
      const nx = -(b[1] - a[1]), ny = b[0] - a[0], nl = Math.hypot(nx, ny) || 1;   // Kontur läuft gegen den Uhrzeigersinn → links = innen
      const NL = [R.B[0] * (nx / nl), ny / nl, R.B[1] * (nx / nl)];
      quad([W(oF, a[0], a[1]), W(oF, b[0], b[1]), W(oB, b[0], b[1]), W(oB, a[0], a[1])], NL, [[0, a[1] / 3], [0, b[1] / 3], [(oF - oB) / 3, b[1] / 3], [(oF - oB) / 3, a[1] / 3]], [F.rand, F.rand, F.rand, F.rand]);
    }
    // Deckel und Seiten (Wandstärke nach hinten bis zur alten Wand)
    quad([W(oF, -Wx, Yt), W(oF, Wx, Yt), W(0, Wx, Yt), W(0, -Wx, Yt)], [0, 1, 0], [[-Wx / 3, 0], [Wx / 3, 0], [Wx / 3, oF / 3], [-Wx / 3, oF / 3]], [F.beton, F.beton, F.beton, F.beton]);
    for (const sg of [-1, 1]) quad([W(oF, sg * Wx, Yb), W(oF, sg * Wx, Yt), W(0, sg * Wx, Yt), W(0, sg * Wx, Yb)], [R.B[0] * sg, 0, R.B[1] * sg], [[0, Yb / 3], [0, Yt / 3], [oF / 3, Yt / 3], [oF / 3, Yb / 3]], [F.beton, F.beton, F.beton, F.beton]);
    // Gesims: 0,35 m vorstehende Kante oben (Schattenlinie)
    const g0 = Yt - 0.6, oG = oF + 0.35;
    quad([W(oG, -Wx - 0.2, g0), W(oG, Wx + 0.2, g0), W(oG, Wx + 0.2, Yt + 0.05), W(oG, -Wx - 0.2, Yt + 0.05)], NO, [[-Wx / 3, g0 / 3], [Wx / 3, g0 / 3], [Wx / 3, Yt / 3], [-Wx / 3, Yt / 3]], [F.beton, F.beton, F.beton, F.beton]);
    quad([W(oG, -Wx - 0.2, Yt + 0.05), W(oG, Wx + 0.2, Yt + 0.05), W(oF, Wx + 0.2, Yt + 0.05), W(oF, -Wx - 0.2, Yt + 0.05)], [0, 1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [F.beton, F.beton, F.beton, F.beton]);
    quad([W(oG, -Wx - 0.2, g0), W(oG, Wx + 0.2, g0), W(oF, Wx + 0.2, g0), W(oF, -Wx - 0.2, g0)], [0, -1, 0], [[0, 0], [1, 0], [1, 0.1], [0, 0.1]], [F.rand, F.rand, F.rand, F.rand]);
    for (const sg of [-1, 1]) quad([W(oG, sg * (Wx + 0.2), g0), W(oG, sg * (Wx + 0.2), Yt + 0.05), W(oF, sg * (Wx + 0.2), Yt + 0.05), W(oF, sg * (Wx + 0.2), g0)], [R.B[0] * sg, 0, R.B[1] * sg], [[0, 0], [0, 0.2], [0.1, 0.2], [0.1, 0]], [F.beton, F.beton, F.beton, F.beton]);
    // Warnstreifen an den Leibungen: 0,5 m breit, bis 3,2 m hoch, waagrechte Bänder gelb/schwarz (leicht vor der Fläche)
    const oS = oF + 0.03;
    for (const sg of [-1, 1]) for (let q = 0; q < 8; q++) {
      const y0 = q * 0.4, y1 = y0 + 0.4, c = q % 2 ? F.schwarz : F.gelb, r0 = sg * (tw + 0.05), r1 = sg * (tw + 0.6);
      quad([W(oS, r0, y0), W(oS, r1, y0), W(oS, r1, y1), W(oS, r0, y1)], NO, [[r0 / 3, y0 / 3], [r1 / 3, y0 / 3], [r1 / 3, y1 / 3], [r0 / 3, y1 / 3]], [c, c, c, c]);
    }
    // Kragen: Platte hinter der Wand über dem Schlitz im Gelände (von oben sonst ein Spalt bis ins Tunnelrohr)
    const kY = R.H + 2.25, kT = 0.5, oK = -1.6;
    quad([W(0, -tw - 1.4, kY), W(0, tw + 1.4, kY), W(oK, tw + 1.4, kY), W(oK, -tw - 1.4, kY)], [0, 1, 0], [[-tw / 3, 0], [tw / 3, 0], [tw / 3, 0.5], [-tw / 3, 0.5]], [F.rand, F.rand, F.rand, F.rand]);
    quad([W(oK, -tw - 1.4, kY - kT), W(oK, tw + 1.4, kY - kT), W(oK, tw + 1.4, kY), W(oK, -tw - 1.4, kY)], [-p.ox, 0, -p.oz], [[0, 0], [1, 0], [1, 0.2], [0, 0.2]], [F.rand, F.rand, F.rand, F.rand]);
  }
  return { pos, nrm, uv, col, idx };
}
