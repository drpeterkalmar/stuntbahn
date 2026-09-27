// Ton: alles einmal vorgerendert (OfflineAudioContext) → zur Laufzeit nur Puffer abspielen.
// Motor (V12, 4 Drehzahl-Loops, überblendet + Tonhöhe), Reifenquietschen, Fahrtwind, Crash,
// Aufsetzen, Countdown-/Checkpoint-Töne. Abschaltbar; Handy-Freischaltung auf pointerup/touchend/click.

const SR = 44100;

function noise(n, seed = 1) {
  let s = seed >>> 0 || 1;
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; a[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
  return a;
}

// Motor: Obertöne der Kurbelwellendrehzahl (halbe Ordnungen), Zündordnung 6 (V12) betont,
// plus zündungssynchrones Rauschen ("Rauheit"). Länge = ganze Zahl von Zyklen → nahtloser Loop.
function engineLoop(rpm, load) {
  const fRev = rpm / 60;
  const fHalf = fRev / 2;
  const cycles = Math.max(6, Math.round(fHalf * 0.6));
  const dur = cycles / fHalf;
  const n = Math.round(dur * SR);
  const out = new Float32Array(n);
  const nz = noise(n, rpm | 0);
  const orders = [];
  for (let h = 1; h <= 30; h++) {
    const o = h * 0.5;
    let a = 0.02 / (1 + 0.15 * Math.abs(o - 6));
    if (o === 6) a = 0.55; else if (o === 3) a = 0.28; else if (o === 12) a = 0.22; else if (o === 9) a = 0.12; else if (o === 1.5) a = 0.1; else if (o === 18) a = 0.07;
    if (o * fRev > 7000) a *= 0.2;
    a *= load > 0.5 ? 1 : (o > 8 ? 0.45 : 0.9);
    orders.push([o, a, (h * 2.399) % (2 * Math.PI)]);
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let v = 0;
    for (const [o, a, ph] of orders) v += a * Math.sin(2 * Math.PI * o * fRev * t + ph);
    const fire = 0.5 + 0.5 * Math.sin(2 * Math.PI * 6 * fRev * t);
    v += nz[i] * (0.05 + 0.1 * load) * fire * fire;
    out[i] = v;
  }
  // sanfte Sättigung + Pegel
  let peak = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.tanh(out[i] * 1.3); peak = Math.max(peak, Math.abs(out[i])); }
  for (let i = 0; i < n; i++) out[i] *= 0.8 / peak;
  return out;
}

async function renderOffline(dur, build) {
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  build(ctx);
  return ctx.startRendering();
}

function bufFrom(arr) {
  const ctx = new OfflineAudioContext(1, arr.length, SR);
  const b = ctx.createBuffer(1, arr.length, SR);
  b.copyToChannel(arr, 0);
  return b;
}

async function makeBank() {
  const bank = {};
  bank.engine = [1400, 2800, 4600, 6800].map((r) => ({ rpm: r, buf: bufFrom(engineLoop(r, 1)) }));
  // Reifen: bandbegrenztes Rauschen mit tonalem Kern
  bank.tire = await renderOffline(2.0, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR * 2, SR); nb.copyToChannel(noise(SR * 2, 7), 0); n.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 7;
    const g = ctx.createGain(); g.gain.value = 2.2;
    const o = ctx.createOscillator(); o.frequency.value = 1180; const og = ctx.createGain(); og.gain.value = 0.08;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 13; const lg = ctx.createGain(); lg.gain.value = 40; lfo.connect(lg).connect(o.frequency);
    n.connect(bp).connect(g).connect(ctx.destination); o.connect(og).connect(ctx.destination);
    n.start(); o.start(); lfo.start();
  });
  bank.wind = await renderOffline(2.0, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR * 2, SR); nb.copyToChannel(noise(SR * 2, 11), 0); n.buffer = nb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = ctx.createGain(); g.gain.value = 0.6;
    n.connect(lp).connect(g).connect(ctx.destination); n.start();
  });
  bank.crash = await renderOffline(1.6, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR * 2, SR); nb.copyToChannel(noise(SR * 2, 3), 0); n.buffer = nb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(5000, 0); lp.frequency.exponentialRampToValueAtTime(300, 1.2);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.5, 0.01); g.gain.exponentialRampToValueAtTime(0.001, 1.5);
    n.connect(lp).connect(g).connect(ctx.destination); n.start();
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, 0); o.frequency.exponentialRampToValueAtTime(35, 0.4);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.5, 0); og.gain.exponentialRampToValueAtTime(0.001, 0.5);
    o.connect(og).connect(ctx.destination); o.start(); o.stop(0.6);
    for (const [f, t0] of [[1830, 0.05], [2710, 0.12], [1240, 0.3], [3300, 0.45]]) {
      const m = ctx.createOscillator(); m.type = 'triangle'; m.frequency.value = f;
      const mg = ctx.createGain(); mg.gain.setValueAtTime(0.0001, t0); mg.gain.exponentialRampToValueAtTime(0.18, t0 + 0.005); mg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      m.connect(mg).connect(ctx.destination); m.start(t0); m.stop(t0 + 0.4);
    }
  });
  bank.thump = await renderOffline(0.4, (ctx) => {
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(70, 0); o.frequency.exponentialRampToValueAtTime(40, 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.62, 0); g.gain.exponentialRampToValueAtTime(0.001, 0.35);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(0.4);
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR / 2, SR); nb.copyToChannel(noise(SR / 2, 5), 0); n.buffer = nb;
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 900; const ng = ctx.createGain(); ng.gain.setValueAtTime(0.35, 0); ng.gain.exponentialRampToValueAtTime(0.001, 0.2);
    n.connect(lp).connect(ng).connect(ctx.destination); n.start();
  });
  const beep = (f, d, type = 'square') => renderOffline(d + 0.05, (ctx) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.25, 0.01); g.gain.setValueAtTime(0.25, d - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, d);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000;
    o.connect(lp).connect(g).connect(ctx.destination); o.start(); o.stop(d + 0.02);
  });
  bank.beep = await beep(660, 0.18);
  bank.go = await beep(1320, 0.45);
  bank.cp = await renderOffline(0.5, (ctx) => {
    for (const [f, t0] of [[880, 0], [1320, 0.09]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.32);
    }
  });
  bank.finish = await renderOffline(1.4, (ctx) => {
    [523, 659, 784, 1047].forEach((f, k) => {
      const t0 = k * 0.14, o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (k === 3 ? 1.1 : 0.3));
      o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 1.2);
    });
  });
  return bank;
}

export class Sound {
  constructor(store) {
    this.store = store;
    this.ctx = null; this.bank = null; this.running = false; this.nodes = null;
    const unlock = () => this.unlock();
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* optional */ }
  }
  get enabled() { return !!this.store.settings.sound; }
  unlock() {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
      this.master.connect(comp).connect(this.ctx.destination);
      makeBank().then((b) => { this.bank = b; if (this.wantRunning) this.start(); }).catch((e) => console.warn('Ton', e));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // stiller Puffer in der Geste (iOS)
    try { const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, 22050); s.connect(this.ctx.destination); s.start(); } catch { /* egal */ }
  }
  loop(buf, gain) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); s.start();
    return { s, g };
  }
  start() {
    this.wantRunning = true;
    if (!this.enabled || !this.ctx || !this.bank || this.running) return;
    this.running = true;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; lp.Q.value = 0.5;
    lp.connect(this.master);
    const eng = this.bank.engine.map((e) => { const l = this.loop(e.buf, 0); l.g.connect(lp); return { ...l, rpm: e.rpm }; });
    const tire = this.loop(this.bank.tire, 0); tire.g.connect(this.master);
    const wind = this.loop(this.bank.wind, 0); wind.g.connect(this.master);
    this.nodes = { eng, tire, wind, lp };
  }
  stop() {
    this.wantRunning = false;
    if (!this.running || !this.nodes) return;
    const t = this.ctx.currentTime;
    const all = [...this.nodes.eng, this.nodes.tire, this.nodes.wind];
    for (const n of all) { n.g.gain.setTargetAtTime(0, t, 0.05); n.s.stop(t + 0.3); }
    this.running = false; this.nodes = null;
  }
  shot(buf, gain = 1) {
    if (!this.enabled || !this.ctx || !this.bank || !buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(this.master); s.start();
  }
  event(e) {
    if (!this.bank) return;
    if (e.type === 'count') this.shot(this.bank.beep, 0.7);
    else if (e.type === 'go') this.shot(this.bank.go, 0.8);
    else if (e.type === 'checkpoint') this.shot(this.bank.cp, 0.8);
    else if (e.type === 'crash') this.shot(this.bank.crash, 1);
    else if (e.type === 'finish') this.shot(this.bank.finish, 0.9);
    else if (e.type === 'land') this.shot(this.bank.thump, Math.min(1, e.v / 8));
  }
  update(car, dt, state) {
    if (!this.running || !this.nodes) return;
    const t = this.ctx.currentTime, N = this.nodes;
    const rpm = Math.max(900, car.rpm), thr = car.input.throttle;
    // Überblendung zwischen benachbarten Loops
    const E = N.eng;
    let k = 0; while (k < E.length - 2 && rpm > E[k + 1].rpm) k++;
    const a = Math.max(0, Math.min(1, (rpm - E[k].rpm) / (E[k + 1].rpm - E[k].rpm)));
    const vol = state === 'wreck' ? 0 : (0.22 + 0.2 * thr);
    E.forEach((e, i) => {
      const w = i === k ? 1 - a : i === k + 1 ? a : 0;
      e.g.gain.setTargetAtTime(w * vol, t, 0.04);
      e.s.playbackRate.setTargetAtTime(rpm / e.rpm, t, 0.03);
    });
    N.lp.frequency.setTargetAtTime(900 + 3200 * (0.3 + 0.7 * thr) * Math.min(1, rpm / 6000), t, 0.05);
    let slip = 0;
    for (const w of car.wheels) if (w.contact) slip = Math.max(slip, Math.abs(w.slip));
    const sp = car.speed();
    const tireV = Math.max(0, Math.min(1, (slip - 0.12) * 3)) * Math.min(1, sp / 8) * 0.35;
    N.tire.g.gain.setTargetAtTime(tireV, t, 0.05);
    N.wind.g.gain.setTargetAtTime(Math.min(0.35, sp * sp / 9000), t, 0.1);
    // Aufsetzer nach Sprüngen
    if (this._air && car.onGround >= 2 && this._airT > 0.35) this.event({ type: 'land', v: Math.min(12, this._vy || 5) });
    this._air = car.onGround === 0;
    this._airT = this._air ? (this._airT || 0) + dt : 0;
    if (this._air) this._vy = -car.v.y;
  }
}
