// Automatische Qualitätsstufen nach gemessener Bildrate (dynamische Auflösung, Schatten, MSAA-Ersatz).
// Stufen = Grafik „Einfach / Standard / Kino“ (0/1/2) = Presets des Kino-Looks (kinolook.js).
// n30: Standard ist der Qualitäts-Autopilot aus dem Grafik-Kern (kern/autopilot.js: Arbeitszeit statt Bildabstand, GPU-Zeit
// wenn vorhanden, auch wieder aufwärts). ?autopilot=0 = alte Automatik (sample() unten, unverändert).
import { GrafikAutopilot, GpuZeit } from './kern/autopilot.js';

export class Quality {
  // opts.autopilot: neuer Weg (main.js: an, außer ?autopilot=0)
  constructor(renderer, forced, opts = {}) {
    this.r = renderer;
    this.forced = forced;
    this.useAP = !!opts.autopilot; this.ap = null; this.gpu = null; this.carShadowOff = false;
    // n30: enge Schattenkamera fürs Auto (±3,6 m statt ±7 m, Tiefe ±12 m) → 1024 reicht auch auf Kino (gleiche Texel-
    // dichte wie bisher 2048, Standard doppelt so scharf). ?schattenkam=0 = bisher (±7 m, Kino 2048)
    this.tightShadow = opts.tightShadow !== false;
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
  carShadowSize() { return this.carShadowOff ? 0 : (this.tightShadow ? [0, 1024, 1024] : [0, 1024, 2048])[this.tier]; }
  // Schattenkamera um das Auto (Lichtraum; die Sonne steht 60 m vor dem Ziel = Auto). Nur das Auto wirft Echtzeit-Schatten
  // (die Welt steckt in der gebackenen Karte), daher reicht die Silhouette des Autos im Lichtraum: halbe Diagonale ~2,6 m.
  // bias: Tiefe ist im Orthografischen linear → gleicher Versatz in Metern wie bisher (0,0004 × 139 m ≈ 5,6 cm).
  // TODO n30-Heavy: Schattenakne/Peter-Pan am Auto im Bild prüfen (Menü, Looping, Sonne flach im Thema Winter/Abend)
  shadowBox() { return this.tightShadow ? { r: 3.6, near: 48, far: 72, bias: -0.0004 * 139 / 24 } : { r: 7, near: 1, far: 140, bias: -0.0004 }; }
  // Stufe auf Szene anwenden (Echtzeit-Schatten nur fürs Auto; Stufe 0 ohne)
  apply(sun, renderer) {
    const sz = this.carShadowSize();
    sun.castShadow = sz > 0;
    const B = this.shadowBox(), sc = sun.shadow.camera;
    if (sc.right !== B.r || sc.far !== B.far) {
      sc.left = -B.r; sc.right = B.r; sc.top = B.r; sc.bottom = -B.r; sc.near = B.near; sc.far = B.far;
      sc.updateProjectionMatrix();
      sun.shadow.bias = B.bias;
    }
    if (sz && sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  }
  // ---------- n30: Qualitäts-Autopilot ----------
  // o.skala = Start-Renderskala (Kurzmessung bzw. gespeichert), o.gl = WebGL2-Kontext (GPU-Zeit), o.onAenderung(e)
  // Feste Nutzerwahl (Einfach/Standard/Kino): Autopilot pausiert; zurück auf „Automatisch“ → setzt auf der Stufe neu auf
  startAutopilot(o = {}) {
    if (!this.useAP) return null;
    const [lo, hi, st] = this.scaleRangeOf(this.tier);
    const P = () => this.post;
    this.ap = new GrafikAutopilot({
      skala: { min: lo, max: hi, start: Math.max(lo, Math.min(hi, o.skala ?? st)), setzen: (s) => this.setScale(s) },
      onAenderung: o.onAenderung,
      // Ruckeln bei aktiver Bewegungsunschärfe: zuerst die Unschärfe opfern (für diese Sitzung), wie bisher
      vorRunter: () => { const p = P(); if (p && p.active && !p.autoOff) { p.autoOff = true; return true; } return false; },
    });
    // Abschalt-Reihenfolge nach der Renderskala: Gras/Büsche/Wolkenschatten → Auto-Echtzeitschatten (Kontaktschatten
    // bleibt) → Grafikstufe. Kosten = geschätzter Anteil an der Bildzeit (TODO n30-Heavy: mit perf_gate nachmessen)
    this.ap.register('deko', 0.08, (s) => { this.decoLite = s === 0; });
    // weitere abschaltbare Dinge des Spiels (z. B. Lack-Spiegelung): o.extra = [[name, kosten, setzer], …], nach der Deko
    for (const [n, k, f] of o.extra || []) this.ap.register(n, k, f);
    this.ap.register('autoschatten', 0.06, (s) => { this.carShadowOff = s === 0; this.changed(); });
    this.ap.register('stufe', 0.3, (s, r) => {
      this.tier = s; this.scale = 1;
      if (this.kino) this.kino.setLevel(s);   // sofort, damit die neue Renderskala nicht vom Preset-Start überschrieben wird
      this.changed();
      const [a, b, c] = this.scaleRangeOf(s);
      return { skala: [a, b, r < 0 ? c : a] };   // runter: Start der Stufe; rauf: vorsichtig am Minimum
    }, { stufen: 2, start: this.tier, raufBeiSkalaMax: true });
    if (o.gl) this.gpu = new GpuZeit(o.gl);
    return this.ap;
  }
  // Renderskalen-Bereich [min, max, start] je Stufe: Kino-Look-Preset, sonst Bildschirm-Auflösung 0,6–1
  scaleRangeOf(t) {
    const K = this.kino;
    if (K && K.scaleRangeOf && t > 0 && K.supported !== false) { const [s, lo, hi] = K.scaleRangeOf(t); return [lo, hi, s]; }
    return [0.6, 1, 1];
  }
  setScale(s) {
    if (this.kinoOn()) { this.kino.renderScale = s; if (this.scale !== 1) { this.scale = 1; this.changed(); } }
    else { this.scale = s; this.changed(); }
  }
  changed() { if (this._onChange) this._onChange(); }
  sampleAP(dt, onChange, cpuMs) {
    this._onChange = onChange;
    if (this.forced) {
      // Nutzerwahl gilt voll: Deko und Auto-Schatten der Stufe wieder an
      if (!this._apPause) {
        this._apPause = true; this.decoLite = false; this.carShadowOff = false; this.scale = 1;
        // auch vom Spiel angemeldete Dinge (z. B. Lack-Spiegelung) wieder voll an
        for (const d of this.ap.dinge) if (d.name !== 'stufe' && d.stufe < d.stufen) { d.stufe = d.stufen; d.setzer(d.stufen, +1); }
        this.changed();
      }
      return;
    }
    if (this._apPause) {
      this._apPause = false;
      const ap = this.ap;
      for (const d of ap.dinge) ap.festsetzen(d.name, d.name === 'stufe' ? this.tier : d.stufen);
      ap.stapel.length = 0; ap.modell = { fest: 0, pix: null }; ap.ref = null;
      const [lo, hi, st] = this.scaleRangeOf(this.tier);
      ap.setSkalaBereich(lo, hi, st);
      ap.schonen(1.5);
    }
    if (dt <= 0 || dt > 0.5) return;
    // Bewegungsunschärfe-Regel wie bisher (1,5-s-Fenster): kostet sie > 8 % gegenüber dem Bezug ohne Unschärfe → aus
    this.acc += dt; this.n++;
    const P = this.post;
    if (P && P.active) this.nBlur = (this.nBlur || 0) + 1;
    if (this.acc >= 1.5) {
      this.fps = this.n / this.acc;
      const allBlur = P && this.nBlur >= this.n * 0.9, noBlur = !this.nBlur;
      this.acc = 0; this.n = 0; this.nBlur = 0;
      if (noBlur) this.fpsRef = this.fpsRef ? this.fpsRef + (this.fps - this.fpsRef) * 0.5 : this.fps;
      if (allBlur && !P.autoOff && this.fpsRef && this.fps < 58 && this.fps < this.fpsRef * 0.92) { P.autoOff = true; this.ap.schonen(1); return; }
    }
    this.ap.bild(dt, cpuMs, this.gpu ? this.gpu.ms : null);
  }

  sample(dt, onChange, cpuMs = null) {
    if (this.ap) return this.sampleAP(dt, onChange, cpuMs);
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
