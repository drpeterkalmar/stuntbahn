// Kulissen n32 (Peter 08.10.2026: „mehr und schönere Kulissen und Zuschauer“) – Planung, rein rechnend (Node-testbar),
// aufgerufen aus planDeco (track/deco.js) NACH planKulisse und VOR der Vegetation (Bäume/Büsche weichen aus).
// Eigener Zufall (nicht der von planDeco): alles bis n31 Geplante bleibt Stück für Stück gleich; ?kulisse=alt schaltet
// diese Planung ganz ab (Planung exakt wie bis n31, Test: tests/node/test_kulissen2.mjs gegen Prüfsummen von main).
// Neu:
//  - out.fans: einzelne Zuschauer (3D-Figuren in der Nähe, gfx: Karten in der Ferne) aus den Zuschauergruppen, dazu mehr
//    Zuschauer an Stunts, Sitzende beim Picknick, Stadt: Leute auf Dachterrassen. Haltung, Größe, Farbe, Fahne, Blitz.
//  - out.catchFences: Fangzäune (3,8 m) zwischen Fahrbahn und Zuschauern an Stunts/Kurven-Tribünen.
//  - out.banden: durchgehende Bandenreihen (Werbung) an Stunts und Start/Ziel.
//  - Start/Ziel: out.startGrid (Startaufstellung, Farbe auf der Fahrbahn), out.ampel (am Portal) bzw. inst.ampel (Mast),
//    out.boxenmauer (gegenüber der Haupttribüne), inst.leitturm (Rennleitungsturm), inst.leinwand (Großbildleinwand).
//  - Event-Gelände je Thema (out.events + inst zelt/foodtruck/schirm/parkauto/riesenrad/huepfburg/strandbar/apres,
//    Wege als out.strips kind 'weg').
//  - inst.picnic: Picknick-Gruppen an ansteigenden Hängen mit Blick auf die Strecke; inst.pyro: Feuerwerks-/Rauch-
//    Abschuss an Stunts; out.konfetti: Ort der Konfetti-Kanonen im Ziel; Tribünen bekommen eine Bauform (st.form).
// Regeln wie n20: Abstand zu JEDEM Punkt der Fahrlinie (MIN_CLEAR), nie in Sprunglücken/Schluchten/Gruben/Wasser,
// nahe der Fahrbahn auf Fahrbahnhöhe, keine Kollision (nur Optik).
import { rng } from '../core/util.js';
import { THEMES } from './themes.js';
import { makeGapFree, hindSpots } from './kulisse.js';

// ?kulisse=alt → Planung wie bis n31 (A/B)
export const KULISSE2_URL = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search).get('kulisse') !== 'alt' : true;

// Mindestabstände (m von der Fahrbahnkante) der neuen Arten – deco.js nimmt sie in MIN_CLEAR auf
export const MIN_CLEAR2 = {
  fan: 8.5, bande: 5, catchfence: 8, boxmauer: 4.5, ampel: 3, leitturm: 18, leinwand: 22, pyro: 7.5,
  zelt: 26, foodtruck: 26, schirm: 26, parkauto: 30, riesenrad: 60, huepfburg: 30, strandbar: 30, apres: 30, picnic: 22,
};
// Event-Gelände je Thema: Sonderbauten (abwechselnd je Strecke), Zelte, Foodtrucks, Sonnenschirme, Parkplatz
export const EVENT = {
  land: { special: ['riesenrad', 'huepfburg'], tents: 3, trucks: 2, schirme: 3, cars: 16 },
  herbst: { special: ['riesenrad', 'huepfburg'], tents: 3, trucks: 2, schirme: 2, cars: 14 },
  wueste: { special: [], tents: 4, trucks: 2, schirme: 4, cars: 12 },
  alpen: { special: ['apres'], tents: 2, trucks: 2, schirme: 2, cars: 14 },
  winter: { special: ['apres'], tents: 2, trucks: 1, schirme: 0, cars: 12 },
  kueste: { special: ['strandbar'], tents: 2, trucks: 2, schirme: 5, cars: 12 },
  stadt: { special: [], tents: 3, trucks: 3, schirme: 3, cars: 20, roof: 6 },
};
// Tribünen-Bauformen je Thema (gfx zeichnet): 0 klassisch (Betonstufen, Flachdach), 1 Stahl mit Fachwerk-Dach und
// Trägern, 2 offene Alu-Tribüne ohne Dach (Bleacher)
export const STAND_FORMS = { land: [0, 1, 2], herbst: [0, 2], wueste: [1, 2], alpen: [0, 2], winter: [0, 1], kueste: [1, 2], stadt: [0, 1] };
// Zuschauer: Haltung 0 stehen, 1 Arme hoch, 2 klatschen/Handy, 3 Fahne schwenken, 4 sitzen; Höchstzahl je Grafikstufe
export const FAN_POSES = 5;
export const FAN_MAX = [160, 480, 900];

export function planKulisse2(c) {
  const { track, L, n, occ, ok, side, faceRoad, flat, at, ground, out, I, tier, o } = c;
  const themeId = THEMES[o.themeId] ? o.themeId : 'land';
  const seed = o.seed || track.layout?.seed || 1;
  const R = rng(((seed >>> 0) * 2654435761 + 0x3232) >>> 0);   // eigener Zufall (Planung bis n31 bleibt unberührt)
  const MC = { ...(c.MIN_CLEAR || {}), ...MIN_CLEAR2 };
  const gapFree = makeGapFree(track, L, n);
  const lvl = (x, z, i, tol) => Math.abs(ground(x, z) - L.py[i]) < tol;
  const S = c.samples;
  const si = track.start ? track.start.idx : 0;
  // nächster Linienpunkt (für Gruppen ohne gespeicherten Index) und Abstand zur Mittellinie mit Seite
  const nearest = (x, z) => { let b = Infinity, bi = 0; for (let i = 0; i < n; i++) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } } return bi; };
  const offOf = (x, z, i) => (x - L.px[i]) * L.bx[i] + (z - L.pz[i]) * L.bz[i];   // vorzeichenbehaftet (Seite)
  const local = (cx, cz, rot) => { const cs = Math.cos(rot), sn = Math.sin(rot); return (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]; };
  const stuntOf = new Map();   // Stunt-Art → Indizes
  for (const j of track.jumps || []) (stuntOf.get('sprung') || stuntOf.set('sprung', []).get('sprung')).push(at(j.landIdx, 25));
  for (let i = 1; i < n; i++) if (L.loop[i] && !L.loop[i - 1]) { let e = i; while (e < n - 1 && L.loop[e + 1]) e++; (stuntOf.get('looping') || stuntOf.set('looping', []).get('looping')).push((i + e) >> 1); i = e; }
  for (let i = 1; i < n; i++) if (L.tube && L.tube[i] && !L.tube[i - 1]) { (stuntOf.get('roehre') || stuntOf.set('roehre', []).get('roehre')).push(i); while (i < n - 1 && L.tube[i + 1]) i++; }
  for (const h of hindSpots(track)) (stuntOf.get(h.kind) || stuntOf.set(h.kind, []).get(h.kind)).push(h.i);   // n33
  const spots = [...stuntOf.entries()].flatMap(([k, a]) => a.map((i) => ({ i, kind: k })));
  // Regel aus planDeco (am Ende angewandt): bis 40 m neben der Fahrbahn nur auf Höhe des nächsten ebenerdigen Linienpunkts
  // (±2,5 m). Hier vorab, damit Zuschauer/Zäune nur zu Gruppen und Tribünen gehören, die stehen bleiben.
  const lvOK = (() => {
    const C = 24, cells = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
    for (let i = 0; i < n; i++) if (Math.abs(L.py[i] - ground(L.px[i], L.pz[i])) < 1.5) { const k = key(Math.floor(L.px[i] / C), Math.floor(L.pz[i] / C)); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i); }
    return (x, z, tol = 2.5) => {
      const ci = Math.floor(x / C), cj = Math.floor(z / C); let b = 1600, bi = -1;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) for (const i of cells.get(key(ci + di, cj + dj)) || []) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } }
      return bi < 0 || Math.abs(ground(x, z) - L.py[bi]) <= tol;
    };
  })();
  out.fans = []; out.catchFences = []; out.banden = []; out.startGrid = []; out.boxenmauer = []; out.events = []; out.konfetti = null; out.ampel = null;
  const fan = (x, z, rot, pose, st, extra = {}) => {
    if (extra.roof == null && extra.pic == null && !lvOK(x, z)) return;
    out.fans.push({ x, z, rot, s: +(0.9 + R() * 0.2).toFixed(3), pose, col: R.int(16), ph: +R().toFixed(3), st: st || null, flag: pose === 3 ? 1 : 0, blitz: st && st !== 'kurve' && R() < 0.25 ? 1 : 0, ...extra });
  };
  const pose = () => { const r = R(); return r < 0.12 ? 3 : r < 0.4 ? 1 : r < 0.58 ? 2 : 0; };

  // ---- 1) Tribünen: Bauform je Thema ----
  const forms = STAND_FORMS[themeId] || [0];
  for (const st of I('stand')) st.form = forms[R.int(forms.length)];

  // ---- 1b) Pyro an Stunts (Fontänen/Rauch beim Sprung/Looping), vor Zuschauern und Zäunen ----
  for (const sp of spots) for (const sg of [1, -1]) for (const off of [-20, -12, 12, 20]) {
    if (I('pyro').length >= ([4, 10, 16][tier] ?? 16)) break;
    const i = at(sp.i, off), [x, z] = side(i, sg, L.hw[i] + 8.2);
    if (ok(x, z, MC.pyro, 0.4) && occ.free(x, z, 0.5) && gapFree(x, z) && lvl(x, z, i, 1.5) && lvOK(x, z, 1.5)) { I('pyro').push({ x, z, rot: faceRoad(i, sg), s: 1, v: R.int(2), stunt: sp.kind }); occ.add(x, z, 0.6); }
  }

  // ---- 2) Zuschauer einzeln aus den Gruppen (Karte 3,4 m breit, Blick zur Straße = lokal +z) ----
  const crowds = I('crowd').filter((cr) => lvOK(cr.x, cr.z)), stands = I('stand').filter((st) => lvOK(st.x, st.z));
  crowds.forEach((cr, g) => {
    const P = local(cr.x, cr.z, cr.rot), rows = tier === 0 ? 1 : 2, per = tier === 0 ? 3 : 5;
    for (let r = 0; r < rows; r++) for (let k = 0; k < per - r; k++) {
      const [x, z] = P((k - (per - r - 1) / 2) * (3.2 / per) + (R() - 0.5) * 0.25, -r * 0.85 + (R() - 0.5) * 0.2);
      if (!ok(x, z, MC.fan, 0.3) || !gapFree(x, z)) continue;
      fan(x, z, cr.rot + (R() - 0.5) * 0.5, pose(), cr.stunt, { grp: g });
    }
  });
  // mehr Zuschauer an Stunts: Reihen hinter der Zuschauerlinie (Fahrbahnhöhe, frei, nicht in der Sprunglücke)
  const extraMax = [30, 110, 220][tier] ?? 220;
  let extra = 0;
  for (const sp of spots) for (const sg of [1, -1]) for (let k = -5; k <= 5 && extra < extraMax; k++) {
    const i = at(sp.i, k * 3.4), [x, z] = side(i, sg, L.hw[i] + 13.4);
    if (!ok(x, z, MC.fan, 0.5, 0.35) || !occ.free(x, z, 0.6) || !gapFree(x, z) || !lvl(x, z, i, 1.2)) continue;
    const rot = faceRoad(i, sg), P = local(x, z, rot);
    for (let q = 0; q < 3; q++) { const [fx, fz] = P((q - 1) * 1.05 + (R() - 0.5) * 0.3, (R() - 0.5) * 0.5); if (ok(fx, fz, MC.fan, 0.3)) { fan(fx, fz, rot + (R() - 0.5) * 0.5, pose(), sp.kind); extra++; } }
    occ.add(x, z, 1.8);
  }

  // ---- 3) Fangzäune: zwischen Fahrbahn und Stunt-Zuschauern/-Tribünen (Abschnitte in Strecken-Metern je Seite) ----
  const want = { 1: [], '-1': [] };   // [s0, s1, Abstand hinter der Fahrbahnkante]
  for (const cr of crowds) {
    if (!cr.stunt) continue;
    const i = nearest(cr.x, cr.z), d = offOf(cr.x, cr.z, i), sg = d >= 0 ? 1 : -1, ex = Math.abs(d) - L.hw[i] - 1.6;
    if (ex >= MC.catchfence + 0.2) want[sg].push([L.s[i] - 4, L.s[i] + 4, ex]);
  }
  for (const st of stands) {
    if (!st.stunt) continue;
    const d = offOf(st.x, st.z, st.i), sg = d >= 0 ? 1 : -1, ex = Math.abs(d) - L.hw[st.i] - 1.4;
    if (ex >= MC.catchfence + 0.2) want[sg].push([L.s[st.i] - 11, L.s[st.i] + 11, ex]);
  }
  const FS = S(1.5);
  for (const sg of [1, -1]) {
    const W = want[sg];
    if (!W.length) continue;
    let run = null;
    const flush = () => { if (run && run.length >= 3) { out.catchFences.push({ pts: run, h: 3.8 }); for (const p of run) occ.add(p.x, p.z, 0.4); } run = null; };
    for (const i of FS) {
      // überlappende Gruppen: der Zaun muss vor der vordersten stehen (kleinster Abstand)
      let ex = Infinity; for (const [a, b, e] of W) if (L.s[i] >= a && L.s[i] <= b) ex = Math.min(ex, e);
      if (ex === Infinity) { flush(); continue; }
      const [x, z] = side(i, sg, L.hw[i] + ex);
      if (!ok(x, z, MC.catchfence, 0.2) || !gapFree(x, z) || !lvl(x, z, i, 1.6) || !lvOK(x, z, 1.6)) { flush(); continue; }
      (run || (run = [])).push({ x, z, i, sg });
    }
    flush();
  }

  // ---- 4) Start/Ziel: Seite der Haupttribüne, Startaufstellung, Ampel, Boxenmauer, Rennleitung, Leinwand, Konfetti ----
  let mainSg = 1;
  for (const st of stands) if (Math.abs(L.s[st.i ?? nearest(st.x, st.z)] - L.s[si]) < 90) { const i = st.i ?? nearest(st.x, st.z); mainSg = offOf(st.x, st.z, i) >= 0 ? 1 : -1; break; }
  const lenL = L.s[n - 1] || 1;
  for (let k = 0; k < 6; k++) {
    const want = 10 + k * 8, i = at(si, -want);
    let back = L.s[si] - L.s[i]; if (back < 0 && L.closed) back += lenL;   // Rundkurs: über den Anfang hinweg
    if (!flat[i] || L.hw[i] < 3.5 || Math.abs(back - want) > 3) break;   // offene Strecke: kein Platz hinter dem Start
    const off = (k % 2 ? 1 : -1) * L.hw[i] * 0.42;
    out.startGrid.push({ x: L.px[i] + L.bx[i] * off, z: L.pz[i] + L.bz[i] * off, y: L.py[i], rot: Math.atan2(L.tx[i], L.tz[i]), i, pos: k + 1, back: +back.toFixed(2) });
  }
  if (out.portal) out.ampel = { on: 'portal', x: out.portal.x, z: out.portal.z, y: out.portal.y, tx: out.portal.tx, tz: out.portal.tz };
  else {
    const i = at(si, 6);
    for (const sg of [-mainSg, mainSg]) {
      const [x, z] = side(i, sg, L.hw[i] + 3.4);
      if (flat[i] && ok(x, z, MC.ampel, 0.4) && occ.free(x, z, 0.6) && lvl(x, z, i, 0.8) && lvOK(x, z, 0.8)) { I('ampel').push({ x, z, rot: faceRoad(i, sg), s: 1, v: 0, arm: 3.2 }); occ.add(x, z, 0.8); break; }
    }
  }
  {
    let run = null;
    const flush = () => { if (run && run.length >= 8) { out.boxenmauer.push(run); for (const p of run) occ.add(p.x, p.z, 0.6); } run = null; };
    for (const i of S(2)) {
      const ds = L.s[i] - L.s[si];
      if (ds < -90 || ds > 50) { flush(); continue; }
      const [x, z] = side(i, -mainSg, L.hw[i] + 4.8);
      if (!flat[i] || !ok(x, z, MC.boxmauer, 0.3) || !occ.free(x, z, 0.5) || !lvl(x, z, i, 0.8) || !lvOK(x, z, 0.8)) { flush(); continue; }
      (run || (run = [])).push({ x, z, i, sg: -mainSg, rot: faceRoad(i, -mainSg) });
    }
    flush();
  }
  const placeBig = (kind, cands, rad) => {
    for (const [off, sg, d] of cands) {
      const i = at(si, off), [x, z] = side(i, sg, L.hw[i] + d);
      if (ok(x, z, MC[kind], rad, 0.15) && occ.free(x, z, rad + 1) && gapFree(x, z) && lvl(x, z, i, 3)) { I(kind).push({ x, z, rot: faceRoad(i, sg), s: 1, v: 0, i }); occ.add(x, z, rad + 1); return true; }
    }
    return false;
  };
  // n32 Heavy: mehr Ausweich-Plätze (vorher fehlte der Turm auf ~1/3 der Strecken, z. B. 25-2-g in allen Landschaften)
  const more = (base, offs, ds) => [...base, ...offs.flatMap((o) => ds.flatMap((d) => [[o, -mainSg, d], [o, mainSg, d + 8]]))];
  placeBig('leitturm', more([[-30, -mainSg, 26], [-50, -mainSg, 30], [-30, mainSg, 40], [20, -mainSg, 28]], [-15, -40, -65, 35, 55], [24, 32, 42]), 4);
  placeBig('leinwand', more([[25, -mainSg, 34], [50, -mainSg, 36], [70, mainSg, 46], [-70, -mainSg, 36]], [10, 35, 85, -45, -95], [30, 40, 52]), 6.5);
  out.konfetti = { x: L.px[si], z: L.pz[si], y: L.py[si], tx: L.tx[si], tz: L.tz[si], hw: L.hw[si] };

  // ---- 5) Banden: an Stunts (±40 m) und an Start/Ziel (−70 … +50 m), beidseitig, 2-m-Segmente ----
  const bands = [[L.s[si] - 70, L.s[si] + 50]];
  for (const sp of spots) bands.push([L.s[sp.i] - 40, L.s[sp.i] + 40]);
  for (const sg of [1, -1]) {
    let run = null;
    const flush = () => { if (run && run.length >= 4) { out.banden.push({ pts: run, v: R.int(8) }); for (const p of run) occ.add(p.x, p.z, 0.7); } run = null; };
    for (const i of S(2)) {
      if (!bands.some(([a, b]) => L.s[i] >= a && L.s[i] <= b)) { flush(); continue; }
      const [x, z] = side(i, sg, L.hw[i] + 5.4);
      if (!ok(x, z, MC.bande, 0.3) || !occ.free(x, z, 0.6) || !gapFree(x, z) || !lvl(x, z, i, 1.0) || !lvOK(x, z, 1.0)) { flush(); continue; }
      (run || (run = [])).push({ x, z, i, sg, rot: faceRoad(i, sg) });
    }
    flush();
  }

  // ---- 6) Event-Gelände: Zelte, Foodtrucks, Schirme, Parkplatz, Sonderbau des Themas; Weg zur Strecke ----
  const EV = EVENT[themeId] || EVENT.land;
  const nEv = tier === 0 ? 1 : 2;
  const evNear = [si, ...(spots.length ? [spots[0].i] : [])];
  for (let e = 0; e < nEv && e < evNear.length + 1; e++) {
    const base = evNear[Math.min(e, evNear.length - 1)];
    for (let t = 0; t < 160; t++) {
      const i = at(base, R.range(-150, 150)), sg = R() < 0.5 ? 1 : -1, d = L.hw[i] + R.range(55, 130);
      const [cx, cz] = side(i, sg, d);
      if (!ok(cx, cz, MC.zelt, 18, 0.12) || !occ.free(cx, cz, 20) || !gapFree(cx, cz) || Math.abs(ground(cx, cz) - L.py[i]) > 8) continue;
      const rot = faceRoad(i, sg), P = local(cx, cz, rot), ev = { x: cx, z: cz, rot, i, sg, theme: themeId, items: 0 };
      const KINDS = ['zelt', 'foodtruck', 'schirm', 'parkauto', ...EV.special], len0 = KINDS.map((k) => I(k).length);
      const put = (kind, lx, lz, rad, v = 0, dr = 0, extra = {}) => {
        const [x, z] = P(lx, lz);
        if (!ok(x, z, MC[kind], rad, 0.2) || !occ.free(x, z, rad) || !gapFree(x, z)) return false;
        I(kind).push({ x, z, rot: rot + dr, s: 1, v, ev: out.events.length, ...extra }); occ.add(x, z, rad); ev.items++; return true;
      };
      for (let k = 0; k < EV.tents; k++) put('zelt', (k - (EV.tents - 1) / 2) * 7.5, 7, 3.2, R.int(4));
      for (let k = 0; k < EV.trucks; k++) put('foodtruck', (k - (EV.trucks - 1) / 2) * 9, -1.5, 3, R.int(4), (R() - 0.5) * 0.2);
      for (let k = 0; k < EV.schirme; k++) put('schirm', (k - (EV.schirme - 1) / 2) * 5 + 2.5, 2.8, 1.6, R.int(4));
      const sp0 = EV.special.length ? EV.special[(seed + e) % EV.special.length] : null;
      if (sp0) put(sp0, e % 2 ? -24 : 24, -4, sp0 === 'riesenrad' ? 9 : 6, R.int(3));
      // Parkplatz dahinter: Reihen à 2,7 m, Gänge 6 m
      const rows = Math.ceil(EV.cars / 8);
      for (let r = 0, cnt = 0; r < rows; r++) for (let k = 0; k < 8 && cnt < EV.cars; k++, cnt++) put('parkauto', (k - 3.5) * 2.7, -11 - r * 6, 1.5, R.int(12), (r % 2 ? Math.PI : 0) + Math.PI / 2 + (R() - 0.5) * 0.12);
      // zu wenig Platz → zurücknehmen (die Fläche bleibt belegt) und anderen Ort suchen
      if (ev.items < 3) { KINDS.forEach((k, q) => { I(k).length = len0[q]; }); continue; }
      // Weg: vom Gelände zur Strecke (Erdweg 2,4 m), endet hinter der Zuschauerlinie
      const pts = [];
      for (let dd = d - 9; dd > L.hw[i] + 14; dd -= 3) {
        const [x, z] = side(i, sg, dd);
        if (!ok(x, z, MC.fan, 0.5, 0.35)) break;
        pts.push({ x0: x - L.tx[i] * 1.2, z0: z - L.tz[i] * 1.2, x1: x + L.tx[i] * 1.2, z1: z + L.tz[i] * 1.2, y: ground(x, z), s: dd });
      }
      if (pts.length > 2) out.strips.push({ kind: 'weg', pts });
      out.events.push(ev);
      break;
    }
  }
  // Stadt: Leute auf Dachterrassen der Wohnblöcke nahe der Strecke
  if (EV.roof && I('block').length) {
    const bl = I('block').map((b) => ({ b, d: (() => { const i = nearest(b.x, b.z); return Math.hypot(b.x - L.px[i], b.z - L.pz[i]); })() })).sort((a, b) => a.d - b.d).slice(0, EV.roof);
    for (const { b } of bl) {
      const P = local(b.x, b.z, b.rot), k = 4 + R.int(5);
      for (let q = 0; q < k; q++) { const [x, z] = P(R.range(-b.w / 3, b.w / 3), R.range(-b.d / 3, b.d / 3)); fan(x, z, b.rot + R.range(-1, 1), R() < 0.5 ? 2 : 0, null, { roof: +b.h.toFixed(2), bx: b.x, bz: b.z, bw: b.w, bd: b.d }); }
    }
  }

  // ---- 7) Picknick an ansteigenden Hängen mit Blick auf die Strecke (Decke, Klappstühle, Sitzende; manchmal ein Auto) ----
  const nPic = [2, 6, 10][tier] ?? 10;
  const picBase = spots.length ? spots.map((s) => s.i) : [si];
  for (let t = 0, k = 0; k < nPic && t < 400; t++) {
    const i = at(picBase[t % picBase.length], R.range(-120, 120)), sg = R() < 0.5 ? 1 : -1, d = L.hw[i] + R.range(28, 85);
    const [x, z] = side(i, sg, d), g = ground(x, z), rise = g - L.py[i];
    const sl = Math.max(Math.abs(ground(x + 2, z) - ground(x - 2, z)), Math.abs(ground(x, z + 2) - ground(x, z - 2))) / 4;
    if (rise < 1.5 || rise > 14 || sl < 0.05 || !ok(x, z, MC.picnic, 2.5, 0.45) || !occ.free(x, z, 3) || !gapFree(x, z)) continue;
    const rot = faceRoad(i, sg), P = local(x, z, rot), m = 2 + R.int(4);
    I('picnic').push({ x, z, rot, s: 1, v: R.int(4), n: m, i, rise: +rise.toFixed(2) }); occ.add(x, z, 3);
    for (let q = 0; q < m; q++) { const a = (q / m) * Math.PI * 1.2 - 0.6, [fx, fz] = P(Math.sin(a) * 1.4, Math.cos(a) * 1.0 - 0.6); fan(fx, fz, rot + (R() - 0.5) * 0.6, 4, null, { pic: I('picnic').length - 1 }); }
    if (R() < 0.3) { const [ax, az] = P(R() < 0.5 ? -5 : 5, -3); if (ok(ax, az, MC.parkauto, 1.5, 0.4) && occ.free(ax, az, 1.6)) { I('parkauto').push({ x: ax, z: az, rot: rot + Math.PI / 2, s: 1, v: R.int(12), pic: 1 }); occ.add(ax, az, 1.6); } }
    k++;
  }

  // ---- Fangzaun nie hinter Zuschauern (eng benachbarte Streckenteile): betroffene Pfosten entfernen, Rest aufteilen ----
  if (out.catchFences.length && out.fans.length) {
    const fc = [];
    for (const cf of out.catchFences) {
      let run = [];
      const flush = () => { if (run.length >= 3) fc.push({ ...cf, pts: run }); run = []; };
      for (const p of cf.pts) {
        const dp = Math.abs(offOf(p.x, p.z, p.i));
        const behind = out.fans.some((f) => f.roof == null && f.pic == null && Math.abs(f.x - p.x) < 2.5 && Math.abs(f.z - p.z) < 2.5 && Math.hypot(f.x - p.x, f.z - p.z) <= 2.5 && Math.abs(offOf(f.x, f.z, p.i)) < dp + 0.3);
        if (behind) flush(); else run.push(p);
      }
      flush();
    }
    out.catchFences = fc;
  }
  // ---- Obergrenze Zuschauer je Stufe (gleichmäßig ausdünnen, Picknick/Dach bleiben) ----
  const cap = FAN_MAX[tier] ?? 900;
  if (out.fans.length > cap) {
    const keepAll = out.fans.filter((f) => f.pic != null || f.roof != null), rest = out.fans.filter((f) => f.pic == null && f.roof == null);
    const k = Math.max(0, cap - keepAll.length) / rest.length; let acc = 0;
    out.fans = keepAll.concat(rest.filter(() => { acc += k; if (acc >= 1) { acc -= 1; return true; } return false; }));
  }
}
