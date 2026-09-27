// Vorschau-Minikarte einer .TRK-Strecke (30×30 Felder): Gelände, Deko-Straßen, Fahrweg, Start.
import { DIRS } from '../track/defs.js';
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
