// Automatische Qualitätsstufen nach gemessener Bildrate (dynamische Auflösung, Schatten, MSAA-Ersatz).
export class Quality {
  constructor(renderer, forced) {
    this.r = renderer;
    this.forced = forced;
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.tier = forced ? +forced : (mobile ? 1 : 2);   // 0 niedrig, 1 mittel, 2 hoch
    this.fps = 60; this.acc = 0; this.n = 0; this.cool = 3;
    this.scale = 1;
  }
  pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cap = [1.0, 1.5, 2.0][this.tier];
    return Math.max(0.6, Math.min(dpr, cap) * this.scale);
  }
  staticShadowSize() { return [1024, 2048, 4096][this.tier]; }
  carShadowSize() { return [0, 1024, 2048][this.tier]; }
  // Stufe auf Szene anwenden (Echtzeit-Schatten nur fürs Auto; Stufe 0 ohne)
  apply(sun, renderer) {
    const sz = this.carShadowSize();
    sun.castShadow = sz > 0;
    if (sz && sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  }
  sample(dt, onChange) {
    if (dt <= 0 || dt > 0.5) return;
    this.acc += dt; this.n++;
    const P = this.post;
    if (P && P.active) this.nBlur = (this.nBlur || 0) + 1;
    if (this.acc < 1.5) return;
    this.fps = this.n / this.acc;
    const allBlur = P && this.nBlur >= this.n * 0.9, noBlur = !this.nBlur;
    this.acc = 0; this.n = 0; this.nBlur = 0;
    // Bezug: Bildrate ohne Unschärfe (Menü, Start, langsame Stellen); geglättet
    if (noBlur) this.fpsRef = this.fpsRef ? this.fpsRef + (this.fps - this.fpsRef) * 0.5 : this.fps;
    if (this.forced) return;
    // Bewegungsunschärfe darf die Bildrate nicht spürbar senken: > 8 % unter dem Bezug (und unter 58) → aus
    if (allBlur && !P.autoOff && this.fpsRef && this.fps < 58 && this.fps < this.fpsRef * 0.92) { P.autoOff = true; this.cool = 3; return; }
    this.cool -= 1.5;
    if (this.cool > 0) return;
    let changed = false;
    // Ruckeln bei aktiver Bewegungsunschärfe: zuerst die Unschärfe opfern (für diese Sitzung), erst dann Auflösung/Stufe
    if (this.fps < 45 && this.post && this.post.active && !this.post.autoOff) { this.post.autoOff = true; this.cool = 4; return; }
    if (this.fps < 40 && this.scale > 0.62) { this.scale = Math.max(0.6, this.scale - 0.12); changed = true; }
    else if (this.fps < 45 && this.tier > 0 && this.scale <= 0.62) { this.tier--; this.scale = 1; changed = true; }
    else if (this.fps > 58 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.06); changed = true; }
    if (changed) { this.cool = 4; onChange && onChange(); }
  }
}
