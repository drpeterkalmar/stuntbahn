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
  sample(dt, onChange) {
    if (dt <= 0 || dt > 0.5) return;
    this.acc += dt; this.n++;
    if (this.acc < 1.5) return;
    this.fps = this.n / this.acc; this.acc = 0; this.n = 0;
    if (this.forced) return;
    this.cool -= 1.5;
    if (this.cool > 0) return;
    let changed = false;
    if (this.fps < 40 && this.scale > 0.62) { this.scale = Math.max(0.6, this.scale - 0.12); changed = true; }
    else if (this.fps < 45 && this.tier > 0 && this.scale <= 0.62) { this.tier--; this.scale = 1; changed = true; }
    else if (this.fps > 58 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.06); changed = true; }
    if (changed) { this.cool = 4; onChange && onChange(); }
  }
}
