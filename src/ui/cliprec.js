// Kino-Replay als Video (n18): nimmt den Highlight-Film auf – Spielbild + Kino-Balken + Einblendung + kleines Logo, mit
// Ton – und gibt ihn zum Teilen (Web Share mit Datei) oder Speichern (Download) zurück.
// Weg: je Bild das WebGL-Bild direkt nach dem Zeichnen in eine 2D-Leinwand kopieren (≤ 1280 px breit), darauf Balken und
// Text, canvas.captureStream(30) + Ton-Stream → MediaRecorder. Safari/iPhone nimmt MP4 (H.264), Chrome/Android WebM oder
// MP4 (je nachdem, was isTypeSupported meldet). Aufnahme nur auf Wunsch (Knopf im Ergebnis) – kostet sonst nichts.
const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];

export function clipMime() {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  for (const m of MIMES) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch { /* alt */ } }
  return null;
}

export class ClipRecorder {
  // src = WebGL-Leinwand, audio = MediaStream oder null
  constructor(src, audio, opt = {}) {
    this.src = src; this.mime = clipMime();
    const sc = Math.min(1, (opt.maxW || 1280) / Math.max(src.width, src.height));
    this.cv = document.createElement('canvas');
    this.cv.width = Math.round(src.width * sc / 2) * 2; this.cv.height = Math.round(src.height * sc / 2) * 2;
    this.g = this.cv.getContext('2d');
    const st = this.cv.captureStream(30);
    if (audio) for (const t of audio.getAudioTracks()) st.addTrack(t);
    this.chunks = [];
    this.rec = new MediaRecorder(st, { mimeType: this.mime, videoBitsPerSecond: opt.bps || 6e6 });
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.chunks.push(e.data); };
    this.rec.start(1000);
    this.t0 = performance.now(); this.frames = 0;
  }
  // je Bild nach dem Zeichnen: bars = Anteil der Höhe je Balken (0 hochkant), cap = { text, a 0…1, center }
  frame(bars, cap) {
    const g = this.g, W = this.cv.width, H = this.cv.height;
    g.drawImage(this.src, 0, 0, W, H);
    const b = Math.round(H * bars);
    if (b > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, W, b); g.fillRect(0, H - b, W, b); }
    const fs = Math.round(Math.min(W, H) * (W > H ? 0.075 : 0.055));
    g.textBaseline = 'alphabetic';
    if (cap && cap.text && cap.a > 0.01) {
      g.save(); g.globalAlpha = Math.min(1, cap.a);
      g.font = `italic 900 ${fs}px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
      g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = fs * 0.25; g.shadowOffsetY = fs * 0.06;
      g.fillStyle = cap.fin ? '#ffd23d' : '#fff';
      const x = cap.center ? (W - g.measureText(cap.text).width) / 2 : W * 0.03;
      g.fillText(cap.text, Math.max(8, x), H - Math.max(b, H * 0.12) - fs * 0.4);
      g.restore();
    }
    // G-Meter (n24) an derselben Stelle wie auf dem Bildschirm
    if (cap && cap.gm && cap.gm.cv.width) { const k = W / innerWidth; g.drawImage(cap.gm.cv, cap.gm.x * k, cap.gm.y * k, cap.gm.w * k, cap.gm.h * k); }
    // Logo oben rechts (auf dem Balken bzw. im Bild)
    g.save(); g.globalAlpha = 0.8; g.font = `italic 900 ${Math.round(fs * 0.42)}px system-ui, sans-serif`; g.fillStyle = '#fff';
    const t = 'STUNTBAHN', tw = g.measureText(t).width;
    g.fillText(t, W - tw - W * 0.025, Math.max(b, fs) * 0.62 + fs * 0.1);
    g.restore();
    this.frames++;
  }
  stop() {
    return new Promise((res) => {
      if (this.rec.state === 'inactive') { res(this.blob()); return; }
      this.rec.onstop = () => res(this.blob());
      try { this.rec.stop(); } catch { res(this.blob()); }
    });
  }
  cancel() { try { this.rec.ondataavailable = null; this.rec.stop(); } catch { /* egal */ } this.chunks = []; }
  blob() { return new Blob(this.chunks, { type: (this.mime || 'video/webm').split(';')[0] }); }
  get ext() { return /mp4/.test(this.mime || '') ? 'mp4' : 'webm'; }
}

// Teilen (Handy: Teilen-Blatt mit der Datei) oder herunterladen (Desktop/ohne Web Share)
export async function shareClip(blob, name) {
  const file = typeof File !== 'undefined' ? new File([blob], name, { type: blob.type }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Stuntbahn – Highlights' }); return 'geteilt'; } catch (e) { if (e && e.name === 'AbortError') return 'abgebrochen'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  return 'gespeichert';
}
