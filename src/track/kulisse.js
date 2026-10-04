// Kulissen (n20): Planung von Streckenrand und Themen-Bauten – rein rechnend (Node-testbar), aufgerufen aus planDeco
// (track/deco.js) mit dessen Prüfungen (Abstand zu JEDEM Punkt der Fahrlinie, kein Wasser, nicht steil, belegt).
// Zusätzliche Regeln (Brief n20, Nachtrag Gelände):
//  - nie in Sprunglücken (Korridor Absprung … Landung, n21-Hindernisse bleiben), nie in Schluchten, Gruben oder Teichen;
//  - nahe der Fahrbahn nur auf gleicher Höhe wie die Fahrbahn (nicht auf Böschungen/Dämmen, nicht auf Hängen);
//  - keine Kollision, nichts auf der Ideallinie: alles hält MIN_CLEAR zur Fahrbahnkante (Test: tests/node/test_kulissen.mjs).
// Ergebnis: weitere Arten in out.inst (stand, crowd, flag, cam, portal, turbine, tower, block, crane, light), dazu
// out.portal (Start/Ziel), out.sky (Ballons, Zeppelin), out.sea (Boote), out.hwy (Hochstraße der Stadt).
import { WORLD_SCALE, WORLD_HALF } from './defs.js';
import { THEMES, farLift, seaDir, SEA_Y } from './themes.js';

const WS = WORLD_SCALE;

export function planKulisse(c) {
  const { track, L, T, n, R, H, occ, ok, side, faceRoad, flat, kap, at, ground, out, I, tier, o, KS, curveRuns } = c;
  const themeId = o.themeId && THEMES[o.themeId] ? o.themeId : 'land';
  const TH = THEMES[themeId];
  const seed = o.seed || track.layout?.seed || 1;
  // ---- Sperrzonen: Sprunglücken, Gruben, Schluchten, Teiche ----
  const rects = [];
  for (const s of track.shapes || []) {
    if (s.type === 'pit') rects.push({ s, f0: s.f0 - 10, f1: s.f1 + 10, rr: (s.hw || 10) + 20 });
    else if (s.type === 'gorge') rects.push({ s, f0: s.f0 - 20, f1: s.f1 + 20, rr: 130 * WS / 2 });
    else if (s.type === 'pond') rects.push({ s, f0: s.f0 - 10, f1: s.f1 + 10, rr: (s.rz || 30) + 15 });
  }
  const gapPts = [];
  for (const j of track.jumps || []) for (let i = Math.max(0, j.lipIdx - 6); i <= Math.min(n - 1, j.landIdx + 6); i += 2) gapPts.push(i);
  const gapFree = (x, z) => {
    for (const { s, f0, f1, rr } of rects) {
      const dx = x - s.E[0], dz = z - s.E[2], f = dx * s.F[0] + dz * s.F[2], r = dx * s.R[0] + dz * s.R[2];
      if (f > f0 && f < f1 && Math.abs(r) < rr) return false;
    }
    for (const i of gapPts) if (Math.hypot(x - L.px[i], z - L.pz[i]) < L.hw[i] + 30) return false;
    return true;
  };
  // Standort: Mindestabstand + frei + keine Sperrzone + (nahe der Strecke) auf Fahrbahnhöhe
  const MC = c.MIN_CLEAR || {};
  const okK = (x, z, clear, rad, maxSlope = 0.3, i = null, tol = 2.5) => ok(x, z, clear, rad, maxSlope) && occ.free(x, z, rad) && gapFree(x, z)
    && (i == null || Math.abs(ground(x, z) - L.py[i]) < tol);
  const take = (k, it, rad) => { I(k).push(it); occ.add(it.x, it.z, rad); return it; };

  // ---- 1) Stunts: Sprünge (Landezone), Loopings, Korkenzieher/Röhre – dort mehr Zuschauer, Tribüne, Fahnen, Kamerakran ----
  const spots = [];
  for (const j of track.jumps || []) spots.push({ i: at(j.landIdx, 25), kind: 'sprung' });
  for (let i = 1; i < n; i++) if (L.loop[i] && !L.loop[i - 1]) { let e = i; while (e < n - 1 && L.loop[e + 1]) e++; spots.push({ i: (i + e) >> 1, kind: 'looping' }); i = e; }
  for (let i = 1; i < n; i++) if (L.tube && L.tube[i] && !L.tube[i - 1]) { spots.push({ i, kind: 'roehre' }); while (i < n - 1 && L.tube[i + 1]) i++; }
  // Tribünen an den beiden schärfsten Kurven (hinter Kiesbett und Reifenstapeln)
  const sharp = (curveRuns || []).filter((cr) => cr.tyreD).sort((a, b) => Math.max(...b.idx.map((i) => kap[i])) - Math.max(...a.idx.map((i) => kap[i]))).slice(0, 2);
  for (const cr of sharp) spots.push({ i: cr.idx[cr.idx.length >> 1], kind: 'kurve', sg: cr.sg, d: cr.tyreD + 16 });
  const maxSpots = tier === 0 ? 4 : 8;
  let nStand = 0, nCam = 0;
  const si0 = track.start ? track.start.idx : 0;
  spots.unshift({ i: at(si0, -14), kind: 'start' });
  // Tribüne (18 m lang, 12 m tief, Ursprung = Vorderkante zur Strecke): Vorderkante und Ecken auf Fahrbahnhöhe, dahinter
  // eben oder ansteigend (Tribüne in den Hang gebaut, Einschnitt) – nie über abfallendem Gelände (Damm, Schlucht)
  const standAt = (i, sg, d) => {
    const [fx, fz] = side(i, sg, d), [cx, cz] = side(i, sg, d + 6), [bx, bz] = side(i, sg, d + 12);
    if (!ok(cx, cz, MC.stand ?? 8.5, 6, 0.9) || !occ.free(cx, cz, 10) || !gapFree(cx, cz) || !gapFree(fx, fz)) return null;
    const y0 = L.py[i];
    for (const [x, z] of [[fx, fz], side(at(i, -9), sg, d + 1), side(at(i, 9), sg, d + 1)]) if (Math.abs(ground(x, z) - y0) > 1.5 || !ok(x, z, MC.stand ?? 8.5, 0.4, 0.6)) return null;
    for (const [x, z] of [[cx, cz], [bx, bz], side(at(i, -9), sg, d + 11), side(at(i, 9), sg, d + 11)]) { const g = ground(x, z); if (g < y0 - 0.6 || g > y0 + 10) return null; }
    return { x: fx, z: fz, rot: faceRoad(i, sg), s: 1, v: 1, i, cx, cz };
  };
  for (const sp of spots.slice(0, maxSpots + 1)) {
    let st = null;
    for (const sg of sp.sg ? [sp.sg] : (R() < 0.5 ? [1, -1] : [-1, 1])) {
      for (const off of [0, -22, 22, -44, 44]) {
        const i = at(sp.i, off);
        for (const d of sp.d ? [sp.d, sp.d + 6] : [L.hw[i] + 9, L.hw[i] + 13, L.hw[i] + 18]) { st = standAt(i, sg, d); if (st) break; }
        if (st) break;
      }
      if (st) {
        st.stunt = sp.kind; I('stand').push(st); occ.add(st.cx, st.cz, 10.5); nStand++;
        // Fahnen links und rechts der Tribüne
        for (const fo of [-12, 12]) {
          const fi = at(st.i, fo), [fx, fz] = side(fi, sg, L.hw[fi] + 7.5);
          if (okK(fx, fz, MC.flag ?? 6, 0.6, 0.35, fi)) take('flag', { x: fx, z: fz, rot: faceRoad(fi, sg), s: 1, v: R.int(8) }, 0.8);
        }
        break;
      }
    }
    // Zuschauergruppen (stehend) am Zaun gegenüber bzw. neben der Tribüne
    for (const sg of [1, -1]) {
      for (let k = -3; k <= 3; k++) {
        const i = at(sp.i, k * 4);
        const d = sp.kind === 'kurve' ? (sp.d || L.hw[i] + 30) - 6 : L.hw[i] + 10.8;
        const [x, z] = side(i, sg, d);
        if (!okK(x, z, MC.crowd ?? 9, 1.6, 0.35, i, 1.2)) continue;
        take('crowd', { x, z, rot: faceRoad(i, sg), s: 1, v: R.int(4), stunt: sp.kind }, 1.7);
      }
    }
    // Kamerakran am Stunt (Arm zur Strecke)
    if (nCam < (tier === 0 ? 2 : 4)) {
      camSearch: for (const off of [-18, -32, 18, 32]) for (const sg of [-1, 1]) {
        const i = at(sp.i, off), [x, z] = side(i, sg, L.hw[i] + 13.5);
        if (okK(x, z, MC.cam ?? 10, 2.5, 0.3, i, 1.5)) { take('cam', { x, z, rot: faceRoad(i, sg), s: 1, v: 0 }, 3); nCam++; break camSearch; }
      }
    }
  }

  // ---- 2) Start/Ziel-Portal (Fachwerk-Bogen mit Anzeigetafel) + Fahnen an der Start-Geraden + Kamerakran ----
  const si = track.start ? track.start.idx : 0;
  if (flat[si] && Math.abs(ground(L.px[si], L.pz[si]) - L.py[si]) < 1.0) {
    const legs = [-1, 1].map((sg) => side(si, sg, L.hw[si] + 3.6));
    if (legs.every(([x, z]) => ok(x, z, MC.portal ?? 3, 0.4, 0.35))) {
      out.portal = { x: L.px[si], z: L.pz[si], y: L.py[si], tx: L.tx[si], tz: L.tz[si], bx: L.bx[si], bz: L.bz[si], hw: L.hw[si] + 3.6 };
      for (const [x, z] of legs) take('portal', { x, z, rot: 0, s: 1, v: 0 }, 1.2);
    }
  }
  for (const sg of [1, -1]) for (let k = -6; k <= 6; k++) {
    if (k === 0) continue;
    const i = at(si, k * 11), [x, z] = side(i, sg, L.hw[i] + 7.2 + (k % 2) * 0.8);
    if (flat[i] && okK(x, z, MC.flag ?? 6, 0.6, 0.3, i)) take('flag', { x, z, rot: faceRoad(i, sg), s: 1, v: (k + 8 + (sg > 0 ? 3 : 0)) % 8 }, 0.8);
  }
  for (const sg of [1, -1]) {
    const i = at(si, 35), [x, z] = side(i, sg, L.hw[i] + 12);
    if (flat[i] && okK(x, z, MC.cam ?? 10, 2.5, 0.2, i, 1.5)) { take('cam', { x, z, rot: faceRoad(i, sg), s: 1, v: 1 }, 3); break; }
  }
  // Fahnen an Kurven-Ausgängen (Werbung), einzeln
  for (const cr of (curveRuns || []).slice(0, tier === 0 ? 4 : 10)) {
    const i = cr.idx[cr.idx.length - 1], [x, z] = side(i, -cr.sg, L.hw[i] + 7.5);
    if (okK(x, z, MC.flag ?? 6, 0.6, 0.3, i)) take('flag', { x, z, rot: faceRoad(i, cr.sg), s: 1, v: R.int(8) }, 0.8);
  }

  // ---- 3) Himmel: Heißluftballons, Zeppelin; Windräder in der Ferne ----
  const SK = TH.sky || {};
  out.sky = { balloons: [], zeppelin: null };
  const nb = tier === 0 ? Math.min(3, SK.balloons || 0) : SK.balloons || 0;
  for (let k = 0; k < nb; k++) {
    const a = R() * Math.PI * 2, r = R.range(250, 900) * WS / 2 * 1.3;
    out.sky.balloons.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, y: R.range(110, 340), v: k % 4, ph: R() * 100, s: R.range(0.9, 1.15) });
  }
  if (SK.zeppelin) out.sky.zeppelin = { r: WORLD_HALF + 180 * WS / 2, y: 260, ph: R() * Math.PI * 2, dir: R() < 0.5 ? 1 : -1 };
  const nt = tier === 0 ? Math.ceil((SK.turbines || 0) / 2) : SK.turbines || 0;
  for (let g = 0, t = 0; I('turbine').length < nt && t < 300; t++) {
    const a = R() * Math.PI * 2, r = R.range(WORLD_HALF + 260, WORLD_HALF + 900);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // Reihe von 2–3 Windrädern quer zur Blickrichtung
    const cnt = Math.min(nt - I('turbine').length, 2 + R.int(2)), tx = -Math.sin(a), tz = Math.cos(a);
    for (let q = 0; q < cnt; q++) {
      const px = x + tx * q * 230, pz = z + tz * q * 230;
      if (ok(px, pz, MC.turbine ?? 160, 12, 0.35) && occ.free(px, pz, 40)) take('turbine', { x: px, z: pz, rot: a + Math.PI, s: R.range(0.9, 1.1), v: 0, ph: R() * 6.28 }, 40);
    }
    g++;
  }

  // ---- 4) Bauten der Themen ----
  const ext = T.ext;
  if (themeId === 'stadt') {
    // Hochhäuser auf dem Häuserblock-Raster (92 m wie das Muster im Boden-Shader), außerhalb des Streckenrasters
    const nTow = [90, 160, 230][tier] ?? 230;
    const dn = R() * Math.PI * 2;   // Richtung der Innenstadt (dort höher)
    for (let t = 0; I('tower').length < nTow && t < nTow * 12; t++) {
      const cx = Math.floor(R.range(-2400, 2400) / 92), cz = Math.floor(R.range(-2400, 2400) / 92);
      const x = (cx + 0.5) * 92, z = (cz + 0.5) * 92, rb = Math.max(Math.abs(x), Math.abs(z));
      if (rb < ext + 40 || Math.hypot(x, z) > 2600) continue;
      if (!ok(x, z, MC.tower ?? 120, 30, 2) || !occ.free(x, z, 30)) continue;
      const down = 0.5 + 0.5 * Math.cos(Math.atan2(z, x) - dn), far = Math.min(1, (Math.hypot(x, z) - ext) / 1400);
      const h = 26 + Math.pow(R(), 1.4) * (70 + 210 * down) * (0.65 + 0.35 * far);
      take('tower', { x, z, rot: 0, s: 1, v: R.int(4), w: R.range(24, 44), d: R.range(24, 44), h }, 34);
    }
    // Wohnblöcke im Streckenraster (flache Stellen, weit genug von der Fahrbahn)
    for (let t = 0, k = 0; k < (tier === 0 ? 10 : 28) && t < 1400; t++) {
      const x = R.range(-WORLD_HALF - 80, WORLD_HALF + 80), z = R.range(-WORLD_HALF - 80, WORLD_HALF + 80);
      if (!ok(x, z, MC.block ?? 70, 16, 0.3) || !occ.free(x, z, 18) || !gapFree(x, z)) continue;
      take('block', { x, z, rot: Math.round(R() * 4) * Math.PI / 2, s: 1, v: R.int(4), w: R.range(18, 30), d: R.range(12, 18), h: R.range(12, 30) * (R() < 0.3 ? 2.2 : 1) }, 18); k++;
    }
    // Baukräne neben Hochhäusern
    const tw = I('tower');
    for (let k = 0; k < (tier === 0 ? 3 : 7) && tw.length; k++) {
      const b = tw[R.int(tw.length)], x = b.x + 40, z = b.z + 10;
      if (ok(x, z, MC.crane ?? 90, 4, 3) && occ.free(x, z, 4)) take('crane', { x, z, rot: R() * Math.PI * 2, s: 1, v: 0, h: Math.min(110, b.h + 25) }, 5);
    }
    // Hochstraße: zwei Bögen um das Streckenfeld (nur Optik, weit draußen)
    out.hwy = [];
    for (let k = 0; k < 2; k++) {
      const a0 = R() * Math.PI * 2, span = R.range(0.7, 1.2), rr = R.range(ext + 260, ext + 520), pts = [];
      for (let q = 0; q <= 40; q++) {
        const a = a0 + span * q / 40, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        if (!ok(x, z, MC.hwy ?? 160, 10, 3) || !occ.free(x, z, 10)) { if (pts.length > 6) out.hwy.push({ pts: pts.slice(), y: 13 }); pts.length = 0; continue; }
        pts.push([x, z]);
      }
      if (pts.length > 6) out.hwy.push({ pts, y: 13 });
      for (const h of out.hwy) for (const [x, z] of h.pts) occ.add(x, z, 9);
    }
  }
  if (themeId === 'kueste') {
    // Leuchtturm an der Küste (letzter Landpunkt Richtung Meer), Segelboote draußen
    const lift = farLift('kueste', seed, ext), [sx, sz] = seaDir(seed);
    const hl = (x, z) => (lift ? lift(x, z, T.heightFn(x, z)) : T.heightFn(x, z));
    let coast = null;
    for (let r = WORLD_HALF; r < 2600; r += 10) { const x = sx * r, z = sz * r; if (hl(x, z) < SEA_Y + 1.5) { coast = r; break; } }
    out.sea = { boats: [], coast };
    if (coast) {
      const r = coast - 30, x = sx * r, z = sz * r;
      if (ok(x, z, MC.light ?? 200, 6, 2)) take('light', { x, z, rot: Math.atan2(sx, sz), s: 1, v: 0 }, 10);
      for (let k = 0; k < (tier === 0 ? 4 : 8); k++) {
        const a = Math.atan2(sz, sx) + R.range(-0.9, 0.9), rr = coast + R.range(250, 1500);
        const bx = Math.cos(a) * rr, bz = Math.sin(a) * rr;
        if (hl(bx, bz) < SEA_Y - 3) out.sea.boats.push({ x: bx, z: bz, rot: R() * Math.PI * 2, v: k % 3, ph: R() * 50, s: R.range(0.8, 1.3) });
      }
    }
  }
}
