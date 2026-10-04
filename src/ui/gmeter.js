// G-Meter-Anzeige (n24 Etappe 1): rundes Display im Stil der Cockpit-Instrumente (mattschwarz, Silberrand, orange) –
// Punkt im „Reibungskreis“ (quer/längs, Rand = RANGE G) mit kurzer Leuchtspur, Zahl „2,4 G“, Spitzenwert der Runde.
// Ein Canvas (#gmeter), das je nach Lage sitzt: im Cockpit auf dem Armaturenbrett (Instrumentenhutze über der
// Schaltkulisse bzw. zwischen den Rundinstrumenten), im Replay und im Kino-Replay als Einblendung (dort mit km/h).
// Werte kommen fertig aus core/gforce.js (angezeigte G). Zeichnen nur bei Änderung, höchstens ~30× je Sekunde.
import { fmtG } from '../core/gforce.js';

const RANGE = 4;          // G am Kreisrand (Punkt wird dort festgehalten)
const TRAIL = 14;         // Punkte der Leuchtspur

export class GView {
  constructor(el) {
    this.cv = el;
    this.g = el.getContext('2d');
    this.trail = [];
    this.key = '';
    this.box = '';
    this.t = 0;
    this.shown = false;
  }
  // Lage in CSS-Pixeln: Mittelpunkt (x, y), Durchmesser d; withSpeed: Zeile mit km/h unter dem Kreis
  place(x, y, d, withSpeed = false) {
    const k = [x | 0, y | 0, d | 0, withSpeed ? 1 : 0].join('|');
    if (k === this.box) return;
    this.box = k;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1), h = withSpeed ? d * 1.32 : d;
    this.d = d; this.withSpeed = withSpeed;
    this.cv.width = Math.round(d * dpr); this.cv.height = Math.round(h * dpr);
    Object.assign(this.cv.style, { left: (x - d / 2).toFixed(1) + 'px', top: (y - d / 2).toFixed(1) + 'px', width: d + 'px', height: h + 'px' });
    this.dpr = dpr; this.key = '';
  }
  show(on) { if (on !== this.shown) { this.shown = on; this.cv.classList.toggle('show', on); if (!on) this.trail.length = 0; } }
  cut() { this.trail.length = 0; }
  // s = { lon, lat, vert, g, peak }, kmh = angezeigte km/h (oder null); dt = Bildzeit (Spur, Drosselung)
  draw(s, kmh = null, dt = 0.016) {
    if (!this.shown || !this.d) return;
    this.t += dt;
    // Punkt = gespürte Kraft (wie im Rennwagen-G-Meter): Rechtskurve → nach links, Bremsen → nach oben (Gewicht nach vorn)
    const px = Math.max(-1, Math.min(1, -s.lat / RANGE)), py = Math.max(-1, Math.min(1, s.lon / RANGE));
    const m = Math.hypot(px, py), sc = m > 1 ? 1 / m : 1;
    this.trail.push([px * sc, py * sc]);
    if (this.trail.length > TRAIL) this.trail.shift();
    const key = [s.g.toFixed(1), s.peak.toFixed(1), (px * 40) | 0, (py * 40) | 0, kmh == null ? '' : Math.round(kmh)].join('|');
    if (key === this.key && this.t < 0.1) return;
    if (this.t < 1 / 32 && key !== this.key && this.key) return;   // höchstens ~30× je Sekunde
    this.key = key; this.t = 0;
    const g = this.g, D = this.d, r = this.dpr;
    g.setTransform(r, 0, 0, r, 0, 0);
    g.clearRect(0, 0, D, D * 1.4);
    const cx = D / 2, cy = D / 2, R = D / 2 - 1.5;
    // Grund + Silberrand (wie die Zifferblätter in gfx/cockpit.js)
    const bg = g.createRadialGradient(cx, cy - R * 0.25, R * 0.1, cx, cy, R);
    bg.addColorStop(0, '#24272cf2'); bg.addColorStop(0.75, '#141619f2'); bg.addColorStop(1, '#0a0b0df2');
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.lineWidth = Math.max(1.5, D * 0.035); g.strokeStyle = '#8d939b';
    g.beginPath(); g.arc(cx, cy, R - g.lineWidth / 2, 0, Math.PI * 2); g.stroke();
    // Ringe 1 / 2 / 3 G, Fadenkreuz
    const Ri = R * 0.8;
    g.lineWidth = 1; g.strokeStyle = '#ffffff22';
    for (let k = 1; k < RANGE; k++) { g.beginPath(); g.arc(cx, cy, Ri * k / RANGE, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(cx - Ri, cy); g.lineTo(cx + Ri, cy); g.moveTo(cx, cy - Ri); g.lineTo(cx, cy + Ri); g.stroke();
    // Leuchtspur + Punkt
    const P = (q) => [cx + q[0] * Ri, cy + q[1] * Ri];
    for (let i = 0; i < this.trail.length - 1; i++) {
      const [x, y] = P(this.trail[i]), a = (i + 1) / this.trail.length;
      g.fillStyle = `rgba(255,106,42,${(a * 0.35).toFixed(3)})`;
      g.beginPath(); g.arc(x, y, D * 0.035 * (0.5 + a * 0.5), 0, Math.PI * 2); g.fill();
    }
    const [dx, dy] = P(this.trail[this.trail.length - 1]);
    g.shadowColor = '#ff6a2a'; g.shadowBlur = D * 0.1;
    g.fillStyle = '#ff7a2a'; g.beginPath(); g.arc(dx, dy, D * 0.055, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    // Zahl: weiß, ab 4 G orange, ab 6,5 G rot
    const col = s.g >= 6.5 ? '#ff5a3a' : s.g >= 4 ? '#ffb347' : '#f4f5f6';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 ${Math.round(D * 0.27)}px "Helvetica Neue", Arial, sans-serif`;
    g.lineWidth = Math.max(2, D * 0.05); g.strokeStyle = '#000c'; g.lineJoin = 'round';
    const txt = s.g.toFixed(1).replace('.', ',');
    g.strokeText(txt, cx - D * 0.05, cy + R * 0.5); g.fillStyle = col; g.fillText(txt, cx - D * 0.05, cy + R * 0.5);
    const w = g.measureText(txt).width;
    g.font = `800 ${Math.round(D * 0.14)}px "Helvetica Neue", Arial, sans-serif`; g.fillStyle = '#b9bec6';
    g.fillText('G', cx - D * 0.05 + w / 2 + D * 0.08, cy + R * 0.53);
    // Spitzenwert der Runde (klein, oben)
    if (s.peak > 0.05) {
      g.font = `700 ${Math.round(D * 0.115)}px "Helvetica Neue", Arial, sans-serif`; g.fillStyle = '#ff9a5a';
      g.fillText('max ' + s.peak.toFixed(1).replace('.', ','), cx, cy - R * 0.52);
    }
    // km/h darunter (Replay, Kino-Replay)
    if (this.withSpeed && kmh != null) {
      g.font = `900 ${Math.round(D * 0.22)}px "Helvetica Neue", Arial, sans-serif`;
      g.lineWidth = Math.max(2, D * 0.045); g.strokeStyle = '#000b';
      const t2 = String(Math.round(Math.abs(kmh)));
      g.strokeText(t2, cx - D * 0.12, D * 1.17); g.fillStyle = '#f4f5f6'; g.fillText(t2, cx - D * 0.12, D * 1.17);
      const w2 = g.measureText(t2).width;
      g.font = `800 ${Math.round(D * 0.12)}px "Helvetica Neue", Arial, sans-serif`; g.textAlign = 'left';
      g.lineWidth = Math.max(2, D * 0.04); g.strokeText('km/h', cx - D * 0.12 + w2 / 2 + D * 0.04, D * 1.19);
      g.fillStyle = '#e6e9ee'; g.fillText('km/h', cx - D * 0.12 + w2 / 2 + D * 0.04, D * 1.19);
    }
  }
}
export { fmtG };
