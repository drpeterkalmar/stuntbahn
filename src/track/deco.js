// Optik (28.09.2026): Deko-Planung für die detailliertere Umgebung – rein rechnend (Node-testbar), ohne Grafik.
// Für generierte UND importierte Strecken: aus Linie, Gelände und Szenerie werden Randstreifen, Kiesbetten, Reifenstapel,
// Leitplanken mit Werbebannern, Zäune, Tribünen/Zuschauer, Streckenposten, Bremstafeln, Flutlichtmasten, Gras/Blumen,
// Büsche, Laubbäume, Felsen und entfernte Bauernhöfe geplant.
// Regeln (Peter: „Deko mit Abstand zur Strecke“, nicht auf Fahrbahnen, Rampen, Hochstraßen oder im Wasser):
//  - Abstand wird waagrecht zu JEDEM Punkt der Fahrlinie gemessen (auch Hochstraßen, Rampen, Loopings, Sprünge) →
//    nie unter einer Brücke, nie auf einer anderen Fahrbahn. Mindestabstände je Art (MIN_CLEAR).
//  - Kein Wasser (Gelände unter −0,3 m: Gruben, Teiche, .TRK-Wasser), keine .TRK-Szenerie-Felder, keine steilen Hänge.
//  - Nichts davon hat Kollision: Das Fahren wird nie behindert (Rennlinie, Abkürz-Regel und Physik bleiben unverändert).
// Ergebnis in Weltkoordinaten x/z (Höhe setzt die Grafik auf die gezeichnete Geländefläche).
import { TILE, WORLD_SCALE, WORLD_HALF, tileX, tileZ } from './defs.js';
import { rng, makeNoise2 } from '../core/util.js';
import { planKulisse } from './kulisse.js';
import { HALFPIPE } from './gelaende.js';

const WS = WORLD_SCALE;
// Mindestabstand (m) von der Fahrbahnkante (Linienpunkt − halbe Breite) je Art
export const MIN_CLEAR = {
  shoulder: -0.05, gravel: 2.5, tyre: 6, rail: 7, fence: 8, banner: 7, stand: 8.5, crowd: 9, hut: 9, board: 3.5, mast: 14,
  grass: 2.6, flower: 3, bush: 7, laub: 16, rock: 8, farm: 120,
  // Kulissen (n20): Fahnen, Kamerakräne, Portal-Stützen, Windräder, Bauten der Themen (Hochhäuser, Wohnblöcke, Kräne,
  // Leuchtturm), Hochstraßen-Pfeiler der Stadt
  flag: 6, cam: 10, portal: 3, turbine: 160, tower: 120, block: 70, crane: 90, light: 200, hwy: 160,
};
// Dichte je Qualitätsstufe (Vegetation); Streckenrand-Objekte sind auf allen Stufen gleich
const DENS = [0.3, 0.55, 1];

// Räumliches Gitter der Fahrlinie: waagrechter Abstand zur nächsten Fahrbahnkante
// n26: Bauwerke, die über die Fahrbahn hinaus breit sind – Halfpipe (Viertelröhren bis hf + R·sin A, Kante 1,2 m): deren
// Punkte zählen um so viel breiter (sonst standen Banden, Schilder und Büsche auf der größeren Halfpipe-Wand)
function extraWidth(track) {
  const L = track.line, P = track.pieces || [];
  if (!P.some((p) => p.type === 'halfpipe')) return null;
  const ext = new Float32Array(L.n);
  const w = HALFPIPE.hf + HALFPIPE.R * Math.sin(HALFPIPE.A) + 1.3;
  for (const pc of P) if (pc.type === 'halfpipe') for (let i = pc.lineStart; i <= pc.lineEnd; i++) ext[i] = Math.max(0, w - L.hw[i]);
  return ext;
}
function lineHash(L, ext = null) {
  const C = 24, cells = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  for (let i = 0; i < L.n; i++) {
    const k = key(Math.floor(L.px[i] / C), Math.floor(L.pz[i] / C));
    let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i);
  }
  // Abstand zur Kante; sucht nur bis „reach“ Meter (größer → gilt als frei)
  const dist = (x, z, reach = 40) => {
    const r = Math.ceil((reach + 12) / C), ci = Math.floor(x / C), cj = Math.floor(z / C);
    let best = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const a = cells.get(key(ci + di, cj + dj)); if (!a) continue;
      for (const i of a) { const d = Math.hypot(x - L.px[i], z - L.pz[i]) - L.hw[i] - (ext ? ext[i] : 0); if (d < best) best = d; }
    }
    return best;
  };
  return { dist };
}

// Belegte Kreise (bereits gesetzte Deko), damit nichts ineinander steht
function occHash() {
  const C = 16, cells = new Map();
  const key = (i, j) => i * 73856093 ^ j * 19349663;
  return {
    add(x, z, r) { const k = key(Math.floor(x / C), Math.floor(z / C)); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push([x, z, r]); },
    free(x, z, r) {
      const ci = Math.floor(x / C), cj = Math.floor(z / C), rr = Math.ceil((r + 30) / C);
      for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
        const a = cells.get(key(ci + di, cj + dj)); if (!a) continue;
        for (const [ox, oz, or] of a) if (Math.hypot(x - ox, z - oz) < r + or) return false;
      }
      return true;
    },
  };
}

export function planDeco(track, o = {}) {
  const L = track.line, T = track.terrain, n = L.n;
  const tier = o.tier ?? 2, dens = DENS[tier] ?? 1;
  // Kulissen (n20): Mengen je Landschafts-Thema (track/themes.js veg: Faktoren, Land = 1)
  const VK = o.veg || {}, vk = (k) => (VK[k] ?? 1);
  const R = rng((o.seed || track.layout?.seed || 1) * 7919 + 11);
  const noise = makeNoise2((o.seed || 1) * 31 + 5);
  const H = lineHash(L, extraWidth(track)), occ = occHash();
  const ground = (x, z) => T.height(x, z);
  // .TRK-Szenerie-Felder (Häuser, Tankstelle …) freihalten
  const sceneryTiles = new Set((track.layout?.scenery || []).filter((s) => s.kind !== 'pine').map((s) => s.i + ',' + s.j));
  const onScenery = (x, z) => {
    if (!sceneryTiles.size) return false;
    const i = Math.round((x - tileX(0)) / TILE), j = Math.round((z - tileZ(0)) / TILE);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!sceneryTiles.has((i + di) + ',' + (j + dj))) continue;
      if (Math.abs(x - tileX(i + di)) < TILE * 0.62 && Math.abs(z - tileZ(j + dj)) < TILE * 0.62) return true;
    }
    return false;
  };
  const slope = (x, z, r) => Math.max(Math.abs(ground(x + r, z) - ground(x - r, z)), Math.abs(ground(x, z + r) - ground(x, z - r))) / (2 * r);
  // Grundprüfung für einen Standort: Abstand zur Fahrbahn, kein Wasser, keine Szenerie, nicht zu steil
  const ok = (x, z, clear, rad = 1, maxSlope = 0.45) => {
    if (H.dist(x, z, clear + rad + 2) < clear + rad) return false;
    if (T.wet ? T.wet(x, z) : ground(x, z) < -0.3) return false;   // Gelände-Strecken (n22): Wasser per Wasserflächen
    if (onScenery(x, z)) return false;
    if (rad > 0.5 && slope(x, z, Math.max(1, rad)) > maxSlope) return false;
    return true;
  };

  // ----- Linie auswerten: ebenerdig? Krümmung (mit Seite der Kurveninnenseite) -----
  const flat = new Uint8Array(n), kap = new Float32Array(n), inSide = new Int8Array(n);
  const jumpZone = new Uint8Array(n);
  for (const j of track.jumps || []) for (let i = 0; i < n; i++) if (L.s[i] > L.s[j.lipIdx] - 70 && L.s[i] < L.s[j.landIdx] + 40) jumpZone[i] = 1;
  const at = (i, ds) => {   // Index ds Meter weiter (Rundkurs)
    let j = i, acc = 0;
    const step = ds > 0 ? 1 : -1;
    for (let k = 0; k < n && acc < Math.abs(ds); k++) {
      const q = j + step;
      const nj = q < 0 ? (L.closed ? n - 2 : 0) : q >= n ? (L.closed ? 1 : n - 1) : q;
      if (nj === j) break;
      acc += Math.hypot(L.px[nj] - L.px[j], L.pz[nj] - L.pz[j]);
      j = nj;
    }
    return j;
  };
  for (let i = 0; i < n; i++) {
    const g = ground(L.px[i], L.pz[i]);
    flat[i] = !L.loop[i] && !L.tube[i] && !L.air[i] && !jumpZone[i] && Math.abs(L.py[i] - g) < 0.9 && Math.abs(L.by[i]) < 0.12 ? 1 : 0;
  }
  const W = 12;
  for (let i = 0; i < n; i++) {
    const a = at(i, -W), b = at(i, W);
    const ta = Math.atan2(L.tz[a], L.tx[a]), tb = Math.atan2(L.tz[b], L.tx[b]);
    let d = tb - ta; d = Math.atan2(Math.sin(d), Math.cos(d));
    const len = Math.max(1, Math.abs(L.s[b] - L.s[a]));
    kap[i] = Math.abs(d) / len;
    // Innenseite: Richtung, in die sich die Tangente dreht (Tangentenänderung · Querrichtung B)
    const dTx = L.tx[b] - L.tx[a], dTz = L.tz[b] - L.tz[a];
    inSide[i] = (dTx * L.bx[i] + dTz * L.bz[i]) >= 0 ? 1 : -1;
  }
  // Stützpunkte im Abstand ~step Meter (Rundkurs: letzter Punkt = erster, auslassen)
  const samples = (step) => { const out = []; let last = -1e9; for (let i = 0; i < n - (L.closed ? 1 : 0); i++) if (L.s[i] - last >= step) { out.push(i); last = L.s[i]; } return out; };
  const side = (i, sg, d) => [L.px[i] + L.bx[i] * sg * d, L.pz[i] + L.bz[i] * sg * d];
  // Blickrichtung zur Fahrbahn (lokal +z der Objekte zeigt zur Straße)
  const faceRoad = (i, sg) => Math.atan2(-L.bx[i] * sg, -L.bz[i] * sg);

  const out = { strips: [], marks: [], rails: [], fences: [], inst: {} };
  const I = (k) => out.inst[k] || (out.inst[k] = []);

  // ----- 1) Randstreifen (Übergang Straße → Gras) auf beiden Seiten -----
  const S2 = samples(2.5);
  // Randstreifen: in Kurven alle 2,5 m, auf Geraden alle 7,5 m (lange .TRK-Strecken: weniger Dreiecke)
  const SS = []; { let last = -1e9; for (const i of S2) if (L.s[i] - last >= (kap[i] < 1 / (400 * Math.sqrt(WS)) ? 7.5 : 2.5)) { SS.push(i); last = L.s[i]; } }
  for (const sg of [-1, 1]) {
    let run = null;
    for (const i of SS) {
      const good = flat[i];
      if (!good) { if (run && run.pts.length > 2) out.strips.push(run); run = null; continue; }
      if (!run) run = { kind: 'shoulder', pts: [] };
      // Breite bis 2,4 m; an Kreuzungen/Abzweigen/eng benachbarten Fahrbahnen schmaler (Außenkante ≥ 0,9 m frei)
      const hw = L.hw[i];
      let w = 2.4;
      while (w > 0.6) { const [x, z] = side(i, sg, hw + w); if (H.dist(x, z, 4) >= 0.9) break; w -= 0.3; }
      if (w <= 0.6) { if (run && run.pts.length > 2) out.strips.push(run); run = null; continue; }
      const a = side(i, sg, hw - 0.05), b = side(i, sg, hw + w);
      run.pts.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], y: L.py[i], s: L.s[i] });
    }
    if (run && run.pts.length > 2) out.strips.push(run);
  }

  // ----- 2) Kiesbetten + Reifenstapel an der Außenseite von Kurven -----
  const KG = 1 / (95 * Math.sqrt(WS));   // ab diesem Kurvenmaß (1/m) gibt es ein Kiesbett
  const curveRuns = [];
  {
    let cur = null;
    for (const i of S2) {
      const c = flat[i] && kap[i] > KG;
      if (c && cur && cur.sg === -inSide[i]) cur.idx.push(i);
      else { if (cur && cur.idx.length > 3) curveRuns.push(cur); cur = c ? { sg: -inSide[i], idx: [i] } : null; }
    }
    if (cur && cur.idx.length > 3) curveRuns.push(cur);
  }
  for (const cr of curveRuns) {
    // Auslauf: Kiesbett reicht 25 m über den Kurvenausgang hinaus (dort fliegt man ab)
    const last = cr.idx[cr.idx.length - 1];
    for (let k = 1; k <= 10; k++) { const j = at(last, k * 2.5); if (!flat[j]) break; cr.idx.push(j); }
    const run = { kind: 'gravel', pts: [] };
    const tyreAt = [];
    for (const i of cr.idx) {
      const hw = L.hw[i], inner = hw + 2.4;
      let w = 0;
      for (let d = 1; d <= 13; d++) {
        const [x, z] = side(i, cr.sg, inner + d);
        if (H.dist(x, z, 8) < MIN_CLEAR.gravel || ground(x, z) < -0.3 || onScenery(x, z) || Math.abs(ground(x, z) - L.py[i]) > 1.5) break;
        w = d;
      }
      if (w < 4) { if (run.pts.length > 2) out.strips.push({ ...run, pts: run.pts.slice() }); run.pts.length = 0; continue; }
      const a = side(i, cr.sg, inner - 0.3), b = side(i, cr.sg, inner + w);
      run.pts.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], y: L.py[i], s: L.s[i], w });
      const [mx, mz] = side(i, cr.sg, inner + w / 2);
      occ.add(mx, mz, w / 2 + 0.5);
      if (w >= 9 && kap[i] > KG * 1.15) tyreAt.push([i, inner + w + 1.4]);
    }
    if (run.pts.length > 2) out.strips.push(run);
    // Reifenstapel-Mauer: Abschnitte à 2,1 m (3 Stapel), nur wo das Kiesbett voll breit ist
    let lastS = -1e9;
    for (const [i, d] of tyreAt) {
      if (L.s[i] - lastS < 2.1) continue;
      const [x, z] = side(i, cr.sg, d);
      if (!ok(x, z, MIN_CLEAR.tyre, 1.1)) continue;
      I('tyre').push({ x, z, rot: faceRoad(i, cr.sg), s: 1, v: (I('tyre').length % 2) });
      occ.add(x, z, 1.2);
      lastS = L.s[i];
    }
    cr.tyreD = tyreAt.length ? tyreAt[0][1] : null;
  }

  // ----- 3) Leitplanken (mit Werbebannern) an Geraden, beidseitig -----
  const KS = 1 / (220 * Math.sqrt(WS));
  const S4 = samples(4);
  const railD = (i) => L.hw[i] + 11;
  for (const sg of [-1, 1]) {
    let run = null;
    const flush = () => { if (run && run.length >= 9) out.rails.push(run); run = null; };
    for (const i of S4) {
      const d = railD(i), [x, z] = side(i, sg, d);
      const good = flat[i] && kap[i] < KS && ok(x, z, MIN_CLEAR.rail, 0.3) && occ.free(x, z, 0.4) && (!T.gel || Math.abs(ground(x, z) - L.py[i]) < 1.2);
      if (!good) { flush(); continue; }
      if (!run) run = [];
      run.push({ x, z, i, sg, rot: faceRoad(i, sg) });
    }
    flush();
  }
  // Obergrenze Leitplanken-Stützpunkte je Stufe (lange .TRK-Strecken): gleichmäßig ganze Abschnitte auslassen
  { const cap = [450, 900, 1400][tier] ?? 1400; let tot = 0; for (const r of out.rails) tot += r.length;
    if (tot > cap) { const keep = cap / tot; let acc = 0; out.rails = out.rails.filter((r) => { acc += keep; if (acc >= 1) { acc -= 1; return true; } return false; }); } }
  // Banner: auf jeder zweiten Leitplanken-Strecke Gruppen von 4–7 Bannern (fiktive Marken), Varianten reihum
  let bv = R.int(8);
  out.rails.forEach((run, ri) => {
    for (const p of run) occ.add(p.x, p.z, 0.6);
    if (ri % 2 === 1 && run.length < 14) return;
    const per = 2;   // Banner je zwei Stützpunkte (8 m Leitplanke → 6 m Banner)
    const start = R.int(Math.max(1, run.length - 12)), cnt = Math.min(run.length - start - 1, per * (4 + R.int(4)));
    for (let k = start; k < start + cnt; k += per) {
      const a = run[k], b = run[Math.min(run.length - 1, k + per)];
      const x = (a.x + b.x) / 2, z = (a.z + b.z) / 2, i = a.i;
      // 0,35 m vor der Leitplanke (zur Straße hin)
      I('banner').push({ x: x - L.bx[i] * a.sg * 0.35, z: z - L.bz[i] * a.sg * 0.35, rot: a.rot, s: 1, v: (bv++) % 8, len: Math.hypot(b.x - a.x, b.z - a.z) * 0.92 });
    }
  });

  // ----- 4) Tribüne am Start (längste ebene Gerade um Start/Ziel), Zuschauer an Kurven -----
  const startI = track.start ? track.start.idx : 0;
  for (const sg of [1, -1]) {
    if (I('stand').length) break;
    const d = L.hw[startI] + 24;
    // 3 Tribünen-Blöcke à 18 m entlang der Geraden vor/hinter der Startlinie
    const blocks = [];
    for (const off of [-26, -6, 14]) {
      const i = at(startI, off);
      if (!flat[i] || kap[i] > KS * 2) continue;
      const [x, z] = side(i, sg, d);
      if (ok(x, z, MIN_CLEAR.stand, 9, 0.12) && occ.free(x, z, 9)) blocks.push({ x, z, rot: faceRoad(i, sg), s: 1, v: 0, i });
    }
    if (blocks.length >= 2) for (const b of blocks) { I('stand').push(b); occ.add(b.x, b.z, 9.5); }
  }
  // Zuschauergruppen (Karten) hinter den Reifenstapeln der schärfsten Kurven, davor ein Zaun
  const sharp = curveRuns.filter((c) => c.tyreD).sort((a, b) => Math.max(...b.idx.map((i) => kap[i])) - Math.max(...a.idx.map((i) => kap[i])));
  for (const cr of sharp.slice(0, 4)) {
    const mid = cr.idx[cr.idx.length >> 1];
    const fence = [];
    for (let k = -3; k <= 3; k++) {
      const i = at(mid, k * 3.2);
      const [x, z] = side(i, cr.sg, cr.tyreD + 7);
      if (!ok(x, z, MIN_CLEAR.crowd, 1.5) || !occ.free(x, z, 1.4)) continue;
      I('crowd').push({ x, z, rot: faceRoad(i, cr.sg), s: 1, v: R.int(4) });
      const [fx, fz] = side(i, cr.sg, cr.tyreD + 4.5);
      fence.push({ x: fx, z: fz, i, sg: cr.sg });
    }
    for (const c of I('crowd')) occ.add(c.x, c.z, 1.6);
    if (fence.length >= 3) out.fences.push(fence);
  }
  // Zaun vor der Tribüne
  if (I('stand').length) {
    const f = [];
    for (const b of I('stand')) for (let k = -3; k <= 3; k++) {
      const i = at(b.i, k * 3);
      const sg = (b.x - L.px[b.i]) * L.bx[b.i] + (b.z - L.pz[b.i]) * L.bz[b.i] > 0 ? 1 : -1;
      const [x, z] = side(i, sg, L.hw[i] + 13);
      if (ok(x, z, MIN_CLEAR.fence, 0.2)) f.push({ x, z, i, sg });
    }
    if (f.length >= 3) out.fences.push(f);
  }

  // ----- 5) Streckenposten, Bremstafeln, Flutlichtmasten -----
  {
    let lastHut = -1e9, lastMast = -1e9, hs = 1, ms = -1;
    for (const i of S4) {
      if (!flat[i]) continue;
      if (L.s[i] - lastHut > 320 * Math.sqrt(WS)) {
        const [x, z] = side(i, hs, L.hw[i] + 15);
        if (ok(x, z, MIN_CLEAR.hut, 2, 0.25) && occ.free(x, z, 2.2)) { I('hut').push({ x, z, rot: faceRoad(i, hs), s: 1, v: 0 }); occ.add(x, z, 2.2); lastHut = L.s[i]; hs = -hs; }
      }
      if (kap[i] < KS && L.s[i] - lastMast > 200 * Math.sqrt(WS)) {
        const [x, z] = side(i, ms, L.hw[i] + 26);
        if (ok(x, z, MIN_CLEAR.mast, 1.2, 0.3) && occ.free(x, z, 1.5)) { I('mast').push({ x, z, rot: faceRoad(i, ms), s: 1, v: 0 }); occ.add(x, z, 1.5); lastMast = L.s[i]; ms = -ms; }
      }
    }
  }
  // Bremstafeln 150/100/50 m vor Kurven mit Kiesbett (Außenseite = Seite der Kurvenaußenseite)
  for (const cr of curveRuns) {
    const c0 = cr.idx[0];
    [150, 100, 50].forEach((m, v) => {
      const i = at(c0, -m);
      if (!flat[i] || kap[i] > KG) return;
      const [x, z] = side(i, cr.sg, L.hw[i] + 5);
      if (!ok(x, z, MIN_CLEAR.board, 0.5) || !occ.free(x, z, 0.6)) return;
      // Tafel schaut dem anfahrenden Auto entgegen (−Fahrtrichtung)
      I('board').push({ x, z, rot: Math.atan2(-L.tx[i], -L.tz[i]), s: 1, v });
      occ.add(x, z, 0.8);
    });
  }

  // ----- 6) Reifenspuren (Gummiabrieb) auf der Ideallinie: Bremszonen und Scheitel -----
  if (o.ideal && o.prof) {
    const V = o.prof.vf || o.prof.vt, Id = o.ideal;
    let run = null;
    const flush = () => { if (run && run.length > 4) out.marks.push(run); run = null; };
    for (const i of samples(1.5)) {
      const j = at(i, 12);
      const brake = V[i] - V[j] > 1.2, apex = kap[i] > KG * 1.1;
      if (!flat[i] || !(brake || apex)) { flush(); continue; }
      if (!run) run = [];
      run.push({ x: Id.px[i], z: Id.pz[i], y: Id.py[i], bx: L.bx[i], bz: L.bz[i], s: L.s[i], a: Math.min(1, (brake ? 0.7 : 0) + (apex ? 0.6 : 0)) });
    }
    flush();
    const cap = [900, 1800, 3000][tier] ?? 3000; let tot = 0; for (const r of out.marks) tot += r.length;
    if (tot > cap) { const keep = cap / tot; let acc = 0; out.marks = out.marks.filter(() => { acc += keep; if (acc >= 1) { acc -= 1; return true; } return false; }); }
  }

  // ----- 6b) Kulissen (n20, vor der Vegetation: Bäume und Felsen weichen ihnen aus): Streckenrand (Tribünen an Stunts, Portal, Fahnen, Kamerakräne), Himmel, Bauten der Themen -----
  planKulisse({ track, L, T, n, R, H, occ, ok, side, faceRoad, flat, kap, at, samples, ground, out, I, tier, o, KS, KG, curveRuns, MIN_CLEAR });
  // ----- 7) Vegetation nahe der Strecke: Gras, Blumen, Büsche -----
  const flatIdx = []; for (let i = 0; i < n; i++) if (flat[i]) flatIdx.push(i);
  const nearPt = (dmin, dexp, dmax) => {
    const i = flatIdx[R.int(flatIdx.length)], sg = R() < 0.5 ? -1 : 1;
    const d = Math.min(dmax, dmin - Math.log(1 - R() * 0.999) * dexp);
    const [x, z] = side(i, sg, L.hw[i] + d);
    return [x + R.range(-2, 2), z + R.range(-2, 2)];
  };
  if (flatIdx.length) {
    const len = L.s[n - 1] || 1000;
    // Mengen wachsen mit der Streckenlänge, sind aber gedeckelt (lange .TRK-Strecken: dünner statt mehr Instanzen)
    const nG = Math.round(Math.min(len * 2.2, 7000) * dens * vk('grass')), nF = Math.round(Math.min(len * 0.45, 1500) * dens * vk('flower')), nB = Math.round(Math.min(len * 0.1, 420) * dens * vk('bush'));
    for (let k = 0, t = 0; k < nG && t < nG * 3; t++) {
      const [x, z] = nearPt(2.6, 9, 60);
      if (!ok(x, z, MIN_CLEAR.grass, 0.2) || !occ.free(x, z, 0.1)) continue;
      I('grass').push({ x, z, rot: R() * Math.PI, s: R.range(2.4, 4.4), v: R.int(2) }); k++;
    }
    for (let k = 0, t = 0; k < nF && t < nF * 3; t++) {
      const [x, z] = nearPt(3, 12, 60);
      if (!ok(x, z, MIN_CLEAR.flower, 0.2) || !occ.free(x, z, 0.1)) continue;
      // Blumen in kleinen Gruppen
      const g = 1 + R.int(4), v = R.int(4);
      for (let q = 0; q < g; q++) {
        const fx = x + R.range(-1.2, 1.2), fz = z + R.range(-1.2, 1.2);
        if (ok(fx, fz, MIN_CLEAR.flower, 0.2)) I('flower').push({ x: fx, z: fz, rot: R() * Math.PI, s: R.range(2.2, 3.6), v });
      }
      k += g;
    }
    for (let k = 0, t = 0; k < nB && t < nB * 4; t++) {
      const [x, z] = nearPt(9, 25, 110);
      if (!ok(x, z, MIN_CLEAR.bush, 1.2) || !occ.free(x, z, 1.4)) continue;
      const g = 1 + R.int(3), v = R.int(2);
      for (let q = 0; q < g; q++) {
        const bx = x + R.range(-2.5, 2.5), bz = z + R.range(-2.5, 2.5);
        if (!ok(bx, bz, MIN_CLEAR.bush, 1.2)) continue;
        I('bush').push({ x: bx, z: bz, rot: R() * Math.PI, s: R.range(0.8, 1.5), v }); occ.add(bx, bz, 1.2);
      }
      k += g;
    }
  }

  // ----- 8) Laubbäume (Haine nahe der Strecke + Wäldchen auf Hügeln) und Felsen -----
  {
    const nGrove = Math.round(26 * WS * dens * vk('laub')), nFar = Math.round(900 * WS * WS * dens * vk('laub'));
    const tree = (x, z, s) => {
      if (!ok(x, z, MIN_CLEAR.laub, 2.5, 0.5) || !occ.free(x, z, 2.5)) return false;
      I('laub').push({ x, z, rot: R() * Math.PI, s, v: R.int(2) }); occ.add(x, z, 2.6); return true;
    };
    for (let g = 0; g < nGrove && flatIdx.length; g++) {
      const [cx, cz] = nearPt(26, 40, 220);
      const cnt = 4 + R.int(9);
      for (let q = 0; q < cnt; q++) tree(cx + R.range(-18, 18), cz + R.range(-18, 18), R.range(0.85, 1.3));
    }
    // Wäldchen: dort, wo das Rauschen „Wald“ sagt, bevorzugt auf Hügeln (Gelände über 4 m)
    for (let t = 0, k = 0; k < nFar && t < nFar * 6; t++) {
      const x = R.range(-1050, 1050) * WS, z = R.range(-1050, 1050) * WS;
      const f = noise.fbm(x / (170 * WS), z / (170 * WS), 3);
      const hill = Math.min(1, Math.max(0, ground(x, z) / (6 * WS)));
      if (f + 0.35 * hill < 0.28) continue;
      if (tree(x, z, R.range(0.9, 1.35))) k++;
    }
    const nRock = tier === 0 ? 0 : Math.round(30 * WS * dens * vk('rock'));   // Stufe 0: keine Felsen (Dreiecke)
    for (let g = 0, t = 0; g < nRock && t < nRock * 6; t++) {
      const far = R() < 0.55;
      const [x, z] = far ? [R.range(-800, 800) * WS, R.range(-800, 800) * WS] : flatIdx.length ? nearPt(14, 40, 200) : [0, 0];
      if (!ok(x, z, MIN_CLEAR.rock, 1.8, 0.6) || !occ.free(x, z, 1.8)) continue;
      const cnt = 1 + R.int(3), v0 = R.int(3);
      for (let q = 0; q < cnt; q++) {
        const rx = x + R.range(-3, 3), rz = z + R.range(-3, 3);
        if (!ok(rx, rz, MIN_CLEAR.rock, 1.5, 0.6)) continue;
        I('rock').push({ x: rx, z: rz, rot: R() * Math.PI * 2, s: R.range(0.35, 1.1) * (q ? 0.6 : 1), v: (v0 + q) % 3 }); occ.add(rx, rz, 1.6);
      }
      g++;
    }
  }

  // ----- 9) Bauernhöfe in der Ferne (zwischen Streckenraster und Bergkranz) -----
  {
    const nFarm = VK.farm === 'none' ? 0 : tier === 0 ? 4 : 8;
    for (let t = 0; I('farm').length < nFarm && t < 400; t++) {
      const a = R() * Math.PI * 2, r = R.range(WORLD_HALF + 110 * WS, WORLD_HALF + 260 * WS);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!ok(x, z, MIN_CLEAR.farm, 22, 0.12) || !occ.free(x, z, 60)) continue;
      I('farm').push({ x, z, rot: R() * Math.PI * 2, s: 1, v: R.int(3) }); occ.add(x, z, 60);
    }
  }
  // Kulissen (n20, Brief: „nie auf Hängen/Böschungen direkt an der Fahrbahn“): Streckenrand-Objekte bis 40 m neben der
  // Fahrbahn stehen auf deren Höhe (±2,5 m zum nächsten ebenerdigen Linienpunkt), sonst entfallen sie
  {
    const C = 24, cells = new Map(), key = (i, j) => i * 73856093 ^ j * 19349663;
    for (let i = 0; i < n; i++) if (Math.abs(L.py[i] - ground(L.px[i], L.pz[i])) < 1.5) { const k = key(Math.floor(L.px[i] / C), Math.floor(L.pz[i] / C)); let a = cells.get(k); if (!a) cells.set(k, a = []); a.push(i); }
    const nearLevel = (x, z) => {
      const ci = Math.floor(x / C), cj = Math.floor(z / C); let b = 1600, bi = -1;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) for (const i of cells.get(key(ci + di, cj + dj)) || []) { const d = (L.px[i] - x) ** 2 + (L.pz[i] - z) ** 2; if (d < b) { b = d; bi = i; } }
      return bi;
    };
    for (const k of ['stand', 'crowd', 'flag', 'cam', 'hut', 'board']) {
      if (!out.inst[k]) continue;
      out.inst[k] = out.inst[k].filter((it) => { const i = nearLevel(it.x, it.z); return i < 0 || Math.abs(ground(it.x, it.z) - L.py[i]) <= 2.5; });
    }
  }
  // Obergrenzen je Art (sehr lange .TRK-Strecken): gleichmäßig ausdünnen
  const CAP = { tyre: tier === 0 ? 110 : tier === 1 ? 320 : 600, banner: 260, board: 60, hut: 30, mast: 30, crowd: 90, flag: 160, cam: 12 };
  for (const [k, c] of Object.entries(CAP)) {
    const a = out.inst[k];
    if (a && a.length > c) out.inst[k] = a.filter((_, i) => Math.floor(i * c / a.length) !== Math.floor((i - 1) * c / a.length));
  }
  return out;
}

// Für Tests: waagrechter Abstand zur Fahrbahnkante
export function roadClearance(track) { return lineHash(track.line, extraWidth(track)).dist; }
