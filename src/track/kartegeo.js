// n39 Minikarte: Geometrie der GANZEN Strecke als Band – einmal je Strecke aus der Fahrlinie gebaut, reine Rechnung
// (Node-Test tests/node/test_minikarte.mjs). Die Grafik (gfx/minikarte.js) legt daraus Puffer an und baut danach nie wieder.
//
// Je Linienpunkt bleibt die echte Lage (Höhe, Looping kopfüber, Spirale, Brücke über/unter). Das Band liegt in der
// Fahrbahnebene (quer = Binormale B der Linie), seine Breite setzt der Shader je nach Zoom (mindestens ~2 px). Ausgedünnt
// wird nach Abstand, Richtungsänderung und Höhe – in Loopings und engen Kurven bleiben alle nötigen Punkte.
// Art je Punkt: 0 Straße, 1 Looping/Korkenzieher (orange), 2 Röhre/Tunnel (gestrichelt, halbtransparent),
// 3 Luft (Sprung: Lücke, nur ein dünner gepunkteter Bogen).
import { tunnelLaeufe } from './tunnel.js';

export const KARTE_GEO = {
  schritt: 6,        // m: höchster Abstand zweier Kartenpunkte auf gerader Strecke
  winkel: 0.14,      // rad: Richtungsänderung, ab der ein Punkt bleibt (Kurven, Loopings)
  hoehe: 1.2,        // m: Höhenänderung, ab der ein Punkt bleibt (Rampen, Kuppen)
  luecke: 25,        // m: weiter auseinander = Band unterbrochen (offene Strecke, Sprung in .TRK-Lücke)
};

export const ART = { STRASSE: 0, STUNT: 1, ROEHRE: 2, LUFT: 3 };

// Art je Linienpunkt
export function karteArten(track) {
  const L = track.line, n = L.n, art = new Uint8Array(n);
  const P = track.pieces || [], gp = track.gel && track.gel.plan && track.gel.plan.pieces;
  let tl = [];
  try { tl = tunnelLaeufe(track); } catch { tl = []; }
  for (const r of tl) for (let i = Math.max(0, r.i0); i <= Math.min(n - 1, r.i1); i++) art[i] = ART.ROEHRE;
  for (let i = 0; i < n; i++) {
    const k = L.piece[i], pc = P[k], typ = pc ? String(pc.type || '') : '';
    if (L.air[i]) art[i] = ART.LUFT;
    else if (L.tube[i] || /tunnel|pipe|tube/i.test(typ) || (gp && gp[k] && gp[k].tunnel)) art[i] = ART.ROEHRE;
    else if (L.loop[i] && art[i] !== ART.ROEHRE) art[i] = ART.STUNT;
  }
  return art;
}

// Karten-Geometrie: Punkte (ausgedünnt), Band als Dreiecksstreifen (2 Ecken je Punkt), Kennzahlen.
// Rückgabe: { pos (Mitte, 3 je Ecke), side (B × ±1), info (s, h01, art, ±1), index, m (Punkte), idx (Linienindex je Punkt),
//   hmin, hmax, cx, cz, R (Radius in der Ebene um cx/cz), total, closed, segs (zusammenhängende Läufe), maxGap, loops }
export function karteGeo(track, opt = {}) {
  const G = { ...KARTE_GEO, ...opt };
  const L = track.line, n = L.n;
  const art = karteArten(track);
  // ----- ausdünnen -----
  const keep = [];
  let last = -1, lt = null;
  const tan = (i) => [L.tx[i], L.ty[i], L.tz[i]];
  for (let i = 0; i < n; i++) {
    if (last < 0 || i === n - 1) { keep.push(i); last = i; lt = tan(i); continue; }
    const dS = L.s[i] - L.s[last];
    const t = tan(i), dot = Math.max(-1, Math.min(1, t[0] * lt[0] + t[1] * lt[1] + t[2] * lt[2]));
    const artWechsel = art[i] !== art[i - 1] || (i + 1 < n && art[i + 1] !== art[i]);
    const sprung = Math.hypot(L.px[i] - L.px[i - 1], L.py[i] - L.py[i - 1], L.pz[i] - L.pz[i - 1]) > G.luecke;
    if (dS >= G.schritt || Math.acos(dot) >= G.winkel || Math.abs(L.py[i] - L.py[last]) >= G.hoehe || artWechsel || sprung) {
      if (sprung && keep[keep.length - 1] !== i - 1) keep.push(i - 1);
      keep.push(i); last = i; lt = t;
    }
  }
  const m = keep.length;
  // ----- Kennzahlen: Höhe, Mittelpunkt, Radius -----
  let hmin = 1e9, hmax = -1e9, x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (const i of keep) {
    hmin = Math.min(hmin, L.py[i]); hmax = Math.max(hmax, L.py[i]);
    x0 = Math.min(x0, L.px[i]); x1 = Math.max(x1, L.px[i]); z0 = Math.min(z0, L.pz[i]); z1 = Math.max(z1, L.pz[i]);
  }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  let R = 0;
  for (const i of keep) R = Math.max(R, Math.hypot(L.px[i] - cx, L.pz[i] - cz));
  const hs = Math.max(1, hmax - hmin);
  // ----- Band: je Punkt zwei Ecken (links/rechts), Dreiecke zwischen Nachbarn desselben Laufs -----
  const pos = new Float32Array(m * 6), side = new Float32Array(m * 6), info = new Float32Array(m * 8);
  for (let q = 0; q < m; q++) {
    const i = keep[q];
    for (let e = 0; e < 2; e++) {
      const v = q * 2 + e, sg = e ? 1 : -1;
      pos[v * 3] = L.px[i]; pos[v * 3 + 1] = L.py[i]; pos[v * 3 + 2] = L.pz[i];
      side[v * 3] = L.bx[i] * sg; side[v * 3 + 1] = L.by[i] * sg; side[v * 3 + 2] = L.bz[i] * sg;
      info[v * 4] = L.s[i]; info[v * 4 + 1] = (L.py[i] - hmin) / hs; info[v * 4 + 2] = art[i]; info[v * 4 + 3] = sg;
    }
  }
  const tri = [];
  const segs = [];
  let seg0 = 0, maxGap = 0;
  for (let q = 1; q < m; q++) {
    const a = keep[q - 1], b = keep[q];
    const d = Math.hypot(L.px[b] - L.px[a], L.py[b] - L.py[a], L.pz[b] - L.pz[a]);
    if (d > G.luecke) { segs.push([seg0, q - 1]); seg0 = q; continue; }
    maxGap = Math.max(maxGap, d);
    const A = (q - 1) * 2, B = q * 2;
    tri.push(A, A + 1, B, A + 1, B + 1, B);
  }
  segs.push([seg0, m - 1]);
  const index = m * 2 > 65535 ? new Uint32Array(tri) : new Uint16Array(tri);
  // ----- Loopings: Läufe mit Art „Stunt“ aus der Linie (für den Test „geschlossen“) -----
  const loops = [];
  for (let i = 0; i < n;) {
    if (!L.loop[i]) { i++; continue; }
    let e = i; while (e + 1 < n && L.loop[e + 1]) e++;
    let top = -1e9, upMin = 1, kGap = 0;
    for (let k = i; k <= e; k++) { top = Math.max(top, L.py[k]); upMin = Math.min(upMin, L.ny[k]); }
    // größter Abstand zweier Kartenpunkte im Looping (zeigt Löcher im Band)
    let pq = -1;
    for (let q = 0; q < m; q++) {
      const k = keep[q];
      if (k < i || k > e) continue;
      if (pq >= 0) kGap = Math.max(kGap, Math.hypot(L.px[k] - L.px[pq], L.py[k] - L.py[pq], L.pz[k] - L.pz[pq]));
      pq = k;
    }
    loops.push({ i0: i, i1: e, hoch: top - Math.min(L.py[i], L.py[e]), kopf: upMin, dy: Math.abs(L.py[e] - L.py[i]),
      dxz: Math.hypot(L.px[e] - L.px[i], L.pz[e] - L.pz[i]), luecke: kGap });
    i = e + 1;
  }
  return { pos, side, info, index, m, idx: Int32Array.from(keep), hmin, hmax, cx, cz, R, total: L.total, closed: L.closed, segs, maxGap, loops, art };
}
