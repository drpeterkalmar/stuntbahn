// Gelände-Teile (n22, Gelände-Strecken, gelaende.js): Halfpipe im Tal, Tunnel durch einen Hügel (mit Portalen),
// Geländebrücke über ein Tal (Hochstraßen-Deck mit Pfeilern bis zur Landschaft), natürliche Steilkurve in einer Mulde
// (Querschnitt ohne Betonwand, das Gelände bildet die Außenseite). Gleiche Konventionen wie pieces.js: f vorwärts ab
// Einfahrtskante, r rechts, y hoch. Nur auf Gelände-Strecken (pb.gel, pb.gx = Plan des Stücks) – flache und 3D-Strecken
// bauen wie bisher.
import { TILE, ROAD_HW, MAT } from './defs.js';
import { PIECES, HOOK } from './pieces.js';
import { ENV, HALFPIPE } from './gelaende.js';
import { smootherstep } from '../core/util.js';

const T = TILE, PI = Math.PI, HW = ROAD_HW;
const lin = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

// Tunnel-Querschnitt: senkrechte Wände bis TUN.wall m, darüber ein flaches Gewölbe bis ENV.tunnelH; Bankett neben der
// Fahrbahn. Innenflächen mit Kollision (Kamera und Auto bleiben drin).
export const TUN = { tw: ENV.tunnelHW, wall: 3.4, n: 10 };
function tunnelContour() {
  // von unten rechts gegen den Uhrzeigersinn (Blick in Fahrtrichtung) über das Gewölbe nach unten links
  const { tw, wall, n } = TUN, top = ENV.tunnelH - wall, pts = [[tw, 0], [tw, wall]];
  for (let k = 1; k < n; k++) { const a = PI * k / n; pts.push([tw * Math.cos(a), wall + top * Math.sin(a)]); }
  pts.push([-tw, wall], [-tw, 0]);
  return pts;
}
const CONTOUR = tunnelContour();

export const PROFILES_GEL = {
  tunnel(s) {
    const hw = s.hw, segs = [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [TUN.tw, 0.12], mat: MAT.PAD, col: 1 },
      { a: [-TUN.tw, 0.12], b: [-hw, 0], mat: MAT.PAD, col: 1 },
    ];
    // Wände und Gewölbe (Normale nach innen: Kontur läuft rechts hoch, oben nach links, links hinunter)
    const C = CONTOUR.map((p, k) => (k === 0 || k === CONTOUR.length - 1 ? [p[0], 0.12] : p));
    for (let k = 0; k < C.length - 1; k++) segs.push({ a: C[k], b: C[k + 1], mat: MAT.WALL, col: 1 });
    return segs;
  },
  // Halfpipe: flache Fahrbahn, beidseitig Viertelröhren (Radius HALFPIPE.R) mit dem Öffnungswinkel s.ex (rad; an den
  // Enden des Stücks 0 → weicher Übergang), oben eine schmale Kante
  halfpipe(s) {
    const hf = HALFPIPE.hf, Rq = HALFPIPE.R, A = s.ex || 0, n = 8;
    const segs = [{ a: [-hf, 0], b: [hf, 0], mat: MAT.ROAD, col: 1, road: 1 }];
    const arc = (sg) => {
      const out = [];
      for (let k = 0; k < n; k++) {
        const a0 = A * k / n, a1 = A * (k + 1) / n;
        const p0 = [sg * (hf + Rq * Math.sin(a0)), Rq - Rq * Math.cos(a0)], p1 = [sg * (hf + Rq * Math.sin(a1)), Rq - Rq * Math.cos(a1)];
        const n0 = [-sg * Math.sin(a0), Math.cos(a0)], n1 = [-sg * Math.sin(a1), Math.cos(a1)];
        out.push(sg > 0 ? { a: p0, b: p1, mat: MAT.CONCRETE, col: 1, na: n0, nb: n1 } : { a: p1, b: p0, mat: MAT.CONCRETE, col: 1, na: n1, nb: n0 });
      }
      return out;
    };
    const R0 = arc(1), L0 = arc(-1);
    const eR = R0[n - 1].b, eL = L0[n - 1].a;
    segs.push(...R0, ...L0);
    // Kante oben (waagrecht nach außen) und Rückseite ins Gelände
    // Rückwand bis unter Bodenhöhe (das Gelände liegt hinter der Wand erst eine Rasterzelle weiter auf Kantenhöhe)
    segs.push({ a: eR, b: [eR[0] + 1.2, eR[1]], mat: MAT.CONCRETE, col: 1 }, { a: [eR[0] + 1.2, eR[1]], b: [eR[0] + 1.3, -0.6], mat: MAT.CONCRETE, col: 0 });
    segs.push({ a: [eL[0] - 1.2, eL[1]], b: eL, mat: MAT.CONCRETE, col: 1 }, { a: [eL[0] - 1.3, -0.6], b: [eL[0] - 1.2, eL[1]], mat: MAT.CONCRETE, col: 0 });
    return segs;
  },
  // Steilkurve in der Mulde (für Rechtskurve gebaut, links gespiegelt): statt der Betonwand außen Randstein und Platte,
  // dahinter steigt das Gelände in der Neigung der Fahrbahn weiter an (gelaende.js)
  bankedG(s, o) {
    const hw = s.hw;
    const segs = [
      { a: [-hw, 0], b: [hw, 0], mat: MAT.ROAD, col: 1, road: 1 },
      { a: [hw, 0], b: [hw + 0.5, -0.7], mat: MAT.PAD, col: 0 },
      { a: [-hw - 1.1, 0.05], b: [-hw, 0], mat: MAT.KERB, col: 1, kerb: 1 },
      { a: [-hw - 3.2, 0.02], b: [-hw - 1.1, 0.05], mat: MAT.PAD, col: 1 },
      { a: [-hw - 3.5, -0.7], b: [-hw - 3.2, 0.02], mat: MAT.PAD, col: 0 },
    ];
    if ((o.turn || 1) > 0) return segs;
    return segs.map((q) => ({ ...q, a: [-q.b[0], q.b[1]], b: [-q.a[0], q.a[1]], na: q.nb && [-q.nb[0], q.nb[1]], nb: q.na && [-q.na[0], q.na[1]] }));
  },
};

// Portal an der Tunnel-Einfahrt/-Ausfahrt: Betonwand (Ring zwischen Tunnelöffnung und Rechteck) – hält den Hügel
// dahinter; facing = Richtung der Vorderseite (−1 Einfahrt, +1 Ausfahrt)
function tunnelPortal(pb, f, facing) {
  const Wx = TUN.tw + 9, Yb = -1.2, Yt = ENV.tunnelH + 3.6, cy = TUN.wall;
  const loop = [[TUN.tw, 0], [TUN.tw, cy], ...CONTOUR.slice(2, -2), [-TUN.tw, cy], [-TUN.tw, 0]];
  const proj = (p) => {
    const dx = p[0], dy = p[1] - cy * 0.6;
    let t = 1e9;
    if (dx > 1e-6) t = Math.min(t, Wx / dx); if (dx < -1e-6) t = Math.min(t, -Wx / dx);
    if (dy > 1e-6) t = Math.min(t, (Yt - cy * 0.6) / dy); if (dy < -1e-6) t = Math.min(t, (Yb - cy * 0.6) / dy);
    return [dx * t, cy * 0.6 + dy * t];
  };
  const nrm = [pb.F[0] * facing, 0, pb.F[2] * facing];
  const W = (q) => pb.W(f, q[1], q[0]);
  const tri = (a, b, c) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (cr[0] * nrm[0] + cr[2] * nrm[2] >= 0) pb.tri(a, b, c, MAT.CONCRETE, true); else pb.tri(a, c, b, MAT.CONCRETE, true);
  };
  const edgeOf = (q) => (Math.abs(q[0] - Wx) < 1e-4 ? 'R' : Math.abs(q[0] + Wx) < 1e-4 ? 'L' : Math.abs(q[1] - Yt) < 1e-4 ? 'T' : 'B');
  const CORNER = { RT: [Wx, Yt], TR: [Wx, Yt], LT: [-Wx, Yt], TL: [-Wx, Yt], RB: [Wx, Yb], BR: [Wx, Yb], LB: [-Wx, Yb], BL: [-Wx, Yb] };
  for (let k = 0; k < loop.length - 1; k++) {
    const a = loop[k], c = loop[k + 1];
    const ao = proj(a), co = proj(c);
    tri(W(a), W(c), W(co)); tri(W(a), W(co), W(ao));
    // liegen die beiden Projektionen auf verschiedenen Rechteckseiten, fehlt das Eck dazwischen
    const ea = edgeOf(ao), ec = edgeOf(co);
    if (ea !== ec && CORNER[ea + ec]) tri(W(ao), W(co), W(CORNER[ea + ec]));
  }
  pb.box(f + facing * 0.45, Yt - 0.35, 0, 0.9, 0.7, 2 * Wx + 0.4, MAT.CONCRETE, { collide: true });
  for (const sg of [-1, 1]) pb.box(f + facing * 0.45, (Yt + Yb) / 2, sg * (Wx - 0.3), 0.9, Yt - Yb, 0.6, MAT.CONCRETE, { collide: true });
}

// Gerade auf Gelände-Strecken: Tunnel oder Brücke (sonst false → normale Gerade)
HOOK.gelStraight = (pb) => {
  const gx = pb.gx;
  if (!gx) return false;
  if (gx.tunnel) {
    const s = lin(0, T, Math.round(T / 2)).map((f) => ({ f, y: 0, r: 0 }));
    pb.path(s, { profile: 'tunnel', kind: 'tunnel' });
    if (gx.portalIn) tunnelPortal(pb, 0.4, -1);
    if (gx.portalOut) tunnelPortal(pb, T - 0.4, 1);
    return true;
  }
  if (gx.bridge && HOOK.deckPiers) {
    pb.path(lin(0, T, Math.round(T / 2)).map((f) => ({ f, y: 0, r: 0 })), { profile: 'deck3' });
    HOOK.deckPiers(pb);
    return true;
  }
  return false;
};
// Schluchtsprung: Wasserspiegel in der Schlucht relativ zum Sockel (für die Schiffe)
HOOK.gorgeWater = -ENV.gorgeDepth + 1.6;

// Halfpipe im Tal (3 Felder, Sockel): Öffnungswinkel der Viertelröhren steigt über die ersten 30 m auf HALFPIPE.A
// und fällt am Ende wieder auf 0
function buildHalfpipe(pb) {
  const L = 3 * T, ramp = HALFPIPE.ramp;
  const S = lin(0, L, Math.round(L / 1.5)).map((f) => ({ f, y: 0, r: 0, ex: HALFPIPE.A * smootherstep(f / ramp) * smootherstep((L - f) / ramp) }));
  pb.path(S, { profile: 'halfpipe', kind: 'halfpipe' });
}
PIECES.halfpipe = { name: 'Halfpipe', cells: [[0, 0], [1, 0], [2, 0]], next: [3, 0], turn: 0, dl: 0, stunt: 1, gel: 1, build: buildHalfpipe };
