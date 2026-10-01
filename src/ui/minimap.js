// Vorschau-Minikarte einer .TRK-Strecke (30×30 Felder): Gelände, Deko-Straßen, Fahrweg, Start.
import { DIRS, GRID, TILE } from '../track/defs.js';
import { pieceCells, PIECES } from '../track/pieces.js';

const TERR = (c) => (c === 1 ? '#2f6f9a' : c >= 2 && c <= 5 ? '#4f7f6a' : c === 6 ? '#8a9a4a' : c >= 7 ? '#6e8a3e' : '#3d6a2c');

export function drawMinimap(cv, trk, layout) {
  const g = cv.getContext('2d');
  const W = cv.width, S = W / 30;
  g.fillStyle = '#3d6a2c'; g.fillRect(0, 0, W, W);
  for (let j = 0; j < 30; j++) for (let i = 0; i < 30; i++) {
    const t = trk.terr[j * 30 + i];
    if (!t) continue;
    g.fillStyle = TERR(t);
    g.fillRect(i * S, j * S, S + 0.5, S + 0.5);
  }
  // Szenerie als Punkte
  for (const sc of layout.scenery || []) {
    g.fillStyle = ['pine', 'palm', 'cactus'].includes(sc.kind) ? '#1d3d16' : '#b8b0a0';
    g.fillRect((sc.i + 0.3) * S, (sc.j + 0.3) * S, S * 0.4, S * 0.4);
  }
  const seg = (pc) => {
    if (PIECES[pc.type].gap) return null;
    const [dx, dy] = DIRS[pc.d];
    const a = [(pc.i + 0.5 - dx * 0.5) * S, (pc.j + 0.5 - dy * 0.5) * S];
    const nx = pieceCells(pc.type, pc.i, pc.j, pc.d, pc.m || 1).next;
    const [ex, ey] = DIRS[nx[2]];
    const b = [(nx[0] + 0.5 - ex * 0.5) * S, (nx[1] + 0.5 - ey * 0.5) * S];
    let c = null;
    if (nx[2] !== pc.d) c = dx ? [b[0], a[1]] : [a[0], b[1]];   // Kurve: Kontrollpunkt im Eck
    return { a, b, c };
  };
  const stroke = (list, color, w) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pc of list) {
      const s = seg(pc);
      if (!s) continue;
      g.beginPath(); g.moveTo(s.a[0], s.a[1]);
      if (s.c) g.quadraticCurveTo(s.c[0], s.c[1], s.b[0], s.b[1]); else g.lineTo(s.b[0], s.b[1]);
      g.stroke();
    }
  };
  stroke(layout.decor || [], 'rgba(200,200,200,0.55)', Math.max(1, S * 0.3));
  const hi = (layout.pieces || []).filter((p) => p.lvl > 0.5 || p.h1 > 0.5);
  stroke(layout.pieces || [], '#f4f1ea', Math.max(1.5, S * 0.45));
  stroke(hi, '#ffc23d', Math.max(1.5, S * 0.45));
  stroke((layout.pieces || []).filter((p) => ['loop', 'corklr', 'corkud', 'pipe', 'pobst', 'pipeT'].includes(p.kind)), '#ff6a2a', Math.max(2, S * 0.55));
  // Sprünge gestrichelt
  g.setLineDash([S * 0.5, S * 0.4]);
  g.strokeStyle = '#8fd0ff'; g.lineWidth = Math.max(1, S * 0.3);
  for (const pc of layout.pieces || []) {
    if (!PIECES[pc.type].gap) continue;
    const [dx, dy] = DIRS[pc.d], k = PIECES[pc.type].gap;
    g.beginPath(); g.moveTo((pc.i + 0.5 - dx * 0.5) * S, (pc.j + 0.5 - dy * 0.5) * S);
    g.lineTo((pc.i + 0.5 + dx * (k - 0.5)) * S, (pc.j + 0.5 + dy * (k - 0.5)) * S); g.stroke();
  }
  g.setLineDash([]);
  const st = (layout.pieces || [])[0];
  if (st) {
    g.fillStyle = '#e8291c';
    g.beginPath(); g.arc((st.i + 0.5) * S, (st.j + 0.5) * S, Math.max(2.5, S * 0.6), 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
  }
}

// Übersichtskarte einer generierten Strecke (n19, Menü): Ebenen unterscheidbar – höher = heller, mit Schatten, der
// mit der Höhe weiter versetzt ist. Stücke nach Höhe sortiert gezeichnet: an Kreuzungen liegt die obere Fahrbahn
// (samt Schatten) über der unteren. Spiralen/Wendeln als Kreis, Klippensprünge mit gestrichelter Flugstrecke.
const LVL_COL = ['#5f676e', '#98a1a9', '#c3cad0', '#e6eaed', '#ffffff'];
export function drawLayoutMap(cv, layout, track) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const P = layout.pieces || [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const pc of P) for (const [ci, cj] of pieceCells(pc.type, pc.i, pc.j, pc.d, pc.m || 1).cells) { x0 = Math.min(x0, ci); y0 = Math.min(y0, cj); x1 = Math.max(x1, ci); y1 = Math.max(y1, cj); }
  const span = Math.max(x1 - x0 + 1, y1 - y0 + 1) + 1.2, S = Math.min(W, H) / span;
  const ox = (W - (x1 - x0 + 1) * S) / 2 - x0 * S, oy = (H - (y1 - y0 + 1) * S) / 2 - y0 * S;
  const X = (i) => ox + i * S, Y = (j) => oy + j * S;
  g.clearRect(0, 0, W, H);
  if (track && track.gel) return drawGelMap(g, W, H, S, ox, oy, P, track);
  g.fillStyle = '#2f5a26'; g.beginPath(); g.roundRect ? g.roundRect(0, 0, W, H, S * 0.8) : g.rect(0, 0, W, H); g.fill();
  const edge = (i, j, d, back) => { const [dx, dy] = DIRS[d]; const k = back ? -0.5 : 0.5; return [X(i + 0.5 + dx * k), Y(j + 0.5 + dy * k)]; };
  const pathOf = (pc) => {
    const r = pieceCells(pc.type, pc.i, pc.j, pc.d, pc.m || 1), nx = r.next;
    const a = edge(pc.i, pc.j, pc.d, true), b = edge(nx[0] - DIRS[nx[2]][0], nx[1] - DIRS[nx[2]][1], nx[2], false);
    const turn = nx[2] !== pc.d;
    const [dx, dy] = DIRS[pc.d];
    const c = turn ? (dx ? [b[0], a[1]] : [a[0], b[1]]) : null;
    const circle = pc.type === 'spiral' || pc.type === 'tr_corkud';
    const R = DIRS[(pc.d + 1) % 4], m = pc.m || 1;
    const cc = circle ? [X(pc.i + 0.5 + dx * 0.5 + R[0] * m * 0.5), Y(pc.j + 0.5 + dy * 0.5 + R[1] * m * 0.5)] : null;
    return { a, b, c, cc, gap: /^cliff/.test(pc.type) };
  };
  const draw = (pc, pth, color, w, shadow) => {
    g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    const o = shadow || [0, 0];
    g.beginPath(); g.moveTo(pth.a[0] + o[0], pth.a[1] + o[1]);
    if (pth.c) g.quadraticCurveTo(pth.c[0] + o[0], pth.c[1] + o[1], pth.b[0] + o[0], pth.b[1] + o[1]);
    else if (pth.gap && !shadow) {
      // Anlauf, gestrichelte Flugstrecke, Landung
      const q = (t) => [pth.a[0] + (pth.b[0] - pth.a[0]) * t, pth.a[1] + (pth.b[1] - pth.a[1]) * t];
      g.lineTo(...q(0.3)); g.stroke(); g.setLineDash([w * 0.6, w * 0.8]); g.beginPath(); g.moveTo(...q(0.3)); g.lineTo(...q(0.55)); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.moveTo(...q(0.55)); g.lineTo(pth.b[0], pth.b[1]);
    } else g.lineTo(pth.b[0] + o[0], pth.b[1] + o[1]);
    g.stroke();
    if (pth.cc) { g.beginPath(); g.arc(pth.cc[0] + o[0], pth.cc[1] + o[1], S * 0.5, 0, Math.PI * 2); g.stroke(); }
  };
  const lvOf = (pc) => Math.max(pc.lvl || 0, pc.h1 ?? pc.lvl ?? 0);
  const order = P.map((pc, k) => [pc, k]).sort((p, q) => lvOf(p[0]) - lvOf(q[0]) || p[1] - q[1]);
  const w = Math.max(2, S * 0.42);
  for (const [pc] of order) {
    if (!PIECES[pc.type]) continue;
    const lv = lvOf(pc), pth = pathOf(pc);
    if (lv > 0) draw(pc, pth, 'rgba(0,0,0,0.45)', w * 1.1, [S * 0.18 * lv, S * 0.26 * lv]);
    draw(pc, pth, '#1c1e20', w + 2, null);
    const avg = ((pc.lvl || 0) + (pc.h1 ?? pc.lvl ?? 0)) / 2;
    draw(pc, pth, LVL_COL[Math.min(LVL_COL.length - 1, Math.round(avg))], w, null);
    if (PIECES[pc.type].stunt && !/^(slope|spiral|tr_corkud)/.test(pc.type)) draw(pc, pth, 'rgba(255,120,40,0.85)', w * 0.35, null);
  }
  const st = P.find((p) => p.type === 'start') || P[0];
  if (st) {
    g.fillStyle = '#e8291c'; g.beginPath(); g.arc(X(st.i + 0.5), Y(st.j + 0.5), Math.max(3, S * 0.45), 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
  }
}

// Streckenkarte einer Gelände-Strecke (n22): Höhenschattierung des Geländes (Licht von Nordwesten, tiefer = grüner,
// höher = heller/brauner, Fels an steilen Hängen grau, Wasser blau) und die Fahrbahn nach Höhe eingefärbt (hell = hoch);
// Tunnel gestrichelt, Brücken mit Schatten, Sprünge als Lücke, Start rot
function drawGelMap(g, W, H, S, ox, oy, P, track) {
  const T = track.terrain, L = track.line;
  // Raster-Pixel → Welt: Feld i (Kante) bei x = (i − GRID/2)·TILE
  const wx = (px) => ((px - ox) / S - GRID / 2) * TILE, wz = (py) => ((py - oy) / S - GRID / 2) * TILE;
  const sx = (x) => ox + (x / TILE + GRID / 2) * S, sy = (z) => oy + (z / TILE + GRID / 2) * S;
  let hmin = 1e9, hmax = -1e9;
  for (let i = 0; i < L.n; i += 4) { hmin = Math.min(hmin, L.py[i]); hmax = Math.max(hmax, L.py[i]); }
  hmin -= 15; hmax += 25;
  const img = g.createImageData(W, H), D = img.data, e = TILE / S;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = wx(px + 0.5), z = wz(py + 0.5), h = T.height(x, z);
    const gx = (T.height(x + e, z) - T.height(x - e, z)) / (2 * e), gz = (T.height(x, z + e) - T.height(x, z - e)) / (2 * e);
    const sh = Math.max(0.35, Math.min(1.35, 0.95 + (gx + gz) * 0.9));   // Licht von Nordwesten (−x, −z)
    const t = Math.max(0, Math.min(1, (h - hmin) / (hmax - hmin))), steep = Math.min(1, Math.max(0, (Math.hypot(gx, gz) - 0.55) / 0.5));
    let r = 52 + 88 * t, gg = 92 + 50 * t, b = 40 + 30 * t;
    r += (128 - r) * steep; gg += (124 - gg) * steep; b += (118 - b) * steep;
    if (T.wet && T.wet(x, z)) { r = 40; gg = 92; b = 130; }
    const k = (py * W + px) * 4;
    D[k] = Math.min(255, r * sh); D[k + 1] = Math.min(255, gg * sh); D[k + 2] = Math.min(255, b * sh); D[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const pl = track.gel.plan.pieces;
  const seg = (i0, i1, col, w, dash, off) => {
    g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash(dash || []);
    g.beginPath();
    for (let i = i0; i <= i1; i++) { const X = sx(L.px[i]) + (off || 0), Y = sy(L.pz[i]) + (off || 0); if (i === i0) g.moveTo(X, Y); else g.lineTo(X, Y); }
    g.stroke(); g.setLineDash([]);
  };
  const w = Math.max(2.2, S * 0.36);
  // Läufe gleicher Art (Luft, Tunnel, Brücke, normal) zeichnen
  const kind = (i) => (L.air[i] ? 'air' : (pl[L.piece[i]] || {}).tunnel ? 'tun' : (pl[L.piece[i]] || {}).bridge ? 'br' : 'n');
  for (let i = 0; i < L.n - 1;) {
    let e = i; const k = kind(i);
    while (e + 1 < L.n && kind(e + 1) === k && e - i < 6) e++;
    const hh = Math.max(0, Math.min(1, (L.py[i] - hmin) / (hmax - hmin)));
    const c = Math.round(110 + 145 * hh), col = `rgb(${c},${c},${Math.round(c * 0.97)})`;
    const j = Math.min(L.n - 1, e + 1);
    if (k === 'air') seg(i, j, 'rgba(160,215,255,0.95)', w * 0.45, [w * 0.6, w * 0.7]);
    else if (k === 'tun') { seg(i, j, '#1c1e20', w + 2); seg(i, j, 'rgba(255,200,90,0.9)', w * 0.55, [w * 0.8, w * 0.6]); }
    else {
      if (k === 'br') seg(i, j, 'rgba(0,0,0,0.45)', w * 1.1, null, S * 0.25);
      seg(i, j, '#1c1e20', w + 2); seg(i, j, col, w);
    }
    i = e + 1;
  }
  const st = P.find((p) => p.type === 'start') || P[0];
  if (st) {
    const i0 = track.start ? track.start.idx : 0;
    g.fillStyle = '#e8291c'; g.beginPath(); g.arc(sx(L.px[i0]), sy(L.pz[i0]), Math.max(3, S * 0.45), 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.stroke();
  }
}
