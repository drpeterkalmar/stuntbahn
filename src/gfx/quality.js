// Automatische Qualitätsstufen nach gemessener Bildrate (dynamische Auflösung, Schatten, MSAA-Ersatz).
// Stufen = Grafik „Einfach / Standard / Kino“ (0/1/2) = Presets des Kino-Looks (kinolook.js).
export class Quality {
  constructor(renderer, forced) {
    this.r = renderer;
    this.forced = forced;
    // Start immer mit Kino (Peter 02.10.2026, auch am Handy); ruckelt es, senkt die Automatik zuerst die Renderskala, dann Deko, dann die Stufe
    this.tier = forced ? +forced : 2;   // 0 niedrig, 1 mittel, 2 hoch
    this.fps = 60; this.acc = 0; this.n = 0; this.cool = 3;
    this.scale = 1;
  }
  pixelRatio() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cap = [1.0, 1.5, 2.0][this.tier];
    return Math.max(0.6, Math.min(dpr, cap) * this.scale);
  }
  // Kino-Look (n17) aktiv? Dann regelt die Renderskala im Render-Target die Auflösung (Bildschirm bleibt scharf)
  kinoOn() { return !!(this.kino && this.kino.pipeline && this.kino.stages.scale); }
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
    // Kino-Look: zuerst die Renderskala (dynamische Auflösung, das Hochskalieren mit Nachschärfen fängt es auf)
    const K = this.kinoOn() ? this.kino : null;
    if (K && (this.fps < 52 || this.fps > 58.5) && K.adapt(this.fps)) { this.cool = this.fps < 52 ? 2.5 : 3; return; }
    // danach: Gras/Blumen/Büsche und Wolkenschatten aus (billigster sichtbarer Verzicht), erst dann Auflösung/Stufe
    if (this.fps < 55 && this.tier > 0 && !this.decoLite) { this.decoLite = true; this.cool = 4; onChange && onChange(); return; }
    if (K) {
      // Renderskala am Minimum und immer noch zu langsam → eine Stufe tiefer (Kino → Standard → Einfach)
      if (this.fps < 45 && this.tier > 0 && K.renderScale <= K.scaleRange[1] + 1e-3) { this.tier--; this.scale = 1; changed = true; }
    } else if (this.fps < 40 && this.scale > 0.62) { this.scale = Math.max(0.6, this.scale - 0.12); changed = true; }
    else if (this.fps < 45 && this.tier > 0 && this.scale <= 0.62) { this.tier--; this.scale = 1; changed = true; }
    else if (this.fps > 58 && this.scale < 1) { this.scale = Math.min(1, this.scale + 0.06); changed = true; }
    if (changed) { this.cool = 4; onChange && onChange(); }
  }
}
