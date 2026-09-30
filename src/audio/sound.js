// Ton: alles einmal vorgerendert bzw. dekodiert → zur Laufzeit nur Puffer abspielen. Abschaltbar; Handy-Freischaltung
// auf pointerup/touchend/click.
// Seit n16 (30.09.2026) aufnahmebasiert (assets/snd/sfx.m4a, CC0-Aufnahmen, Bau: tools/build_sounds.py):
//   Motor aus Drehzahl-Loops eines Prüfstandslaufs, getrennt nach Last und Schiebebetrieb, überblendet und in der
//   Tonhöhe nachgeführt; Gangwechsel mit Zündunterbrechung, Zwischengas beim Runterschalten, Fehlzündungen im
//   Schiebebetrieb, Drehzahlbegrenzer, Nitro-Schicht; im Cockpit Innenraum-Klang (Tiefpass).
//   Crash nach Schwere geschichtet (Wumms, Blech, Trümmer, Glas nur schwer), Schleifen an Wand/Leitplanke solange
//   Kontakt besteht, Landungen nach Fallhöhe, Reifenquietschen aus Aufnahmen; Zufall in Auswahl, Tonhöhe, Einsatz.
// Bis n15 (und mit ?snd=alt oder wenn das Laden scheitert) der Synthesizer unten: V12 aus 4 Drehzahl-Loops,
// Reifen, Fahrtwind, Crash, Aufsetzen. Countdown-/Checkpoint-Töne, Wind, Nitro, Hüpfer bleiben synthetisch.

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
  // Fahrbahn-Reset (Totalschaden aus): kurzes „Wusch“ – Rauschen mit fallendem Bandpass, 0,4 s
  bank.whoosh = await renderOffline(0.45, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR / 2, SR); nb.copyToChannel(noise(SR / 2, 13), 0); n.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(3200, 0); bp.frequency.exponentialRampToValueAtTime(420, 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, 0.06); g.gain.exponentialRampToValueAtTime(0.001, 0.42);
    n.connect(bp).connect(g).connect(ctx.destination); n.start();
  });
  // Nitro (Extras): Zünden = scharfes Zischen mit Knall, danach Schleife aus Fauchen (hochpass-Rauschen) und
  // tiefem Grollen, Lautstärke folgt der Nitro-Stärke
  bank.nitroGo = await renderOffline(0.9, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR, SR); nb.copyToChannel(noise(SR, 17), 0); n.buffer = nb;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.setValueAtTime(600, 0); hp.frequency.exponentialRampToValueAtTime(2600, 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.9, 0.02); g.gain.exponentialRampToValueAtTime(0.25, 0.3); g.gain.exponentialRampToValueAtTime(0.001, 0.85);
    n.connect(hp).connect(g).connect(ctx.destination); n.start();
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(55, 0); o.frequency.exponentialRampToValueAtTime(110, 0.4);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 400;
    const og = ctx.createGain(); og.gain.setValueAtTime(0.5, 0); og.gain.exponentialRampToValueAtTime(0.001, 0.6);
    o.connect(lp).connect(og).connect(ctx.destination); o.start(); o.stop(0.7);
  });
  bank.nitroLoop = await renderOffline(2.0, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR * 2, SR); nb.copyToChannel(noise(SR * 2, 19), 0); n.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.value = 0.55;
    n.connect(bp).connect(g).connect(ctx.destination); n.start();
    const n2 = ctx.createBufferSource(); const nb2 = ctx.createBuffer(1, SR * 2, SR); nb2.copyToChannel(noise(SR * 2, 23), 0); n2.buffer = nb2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g2 = ctx.createGain(); g2.gain.value = 2.2;
    n2.connect(lp).connect(g2).connect(ctx.destination); n2.start();
  });
  // Hüpfer: pneumatisches „Pfump“ – kurzer tiefer Stoß mit fallender Tonhöhe und Luftzischen
  bank.hop = await renderOffline(0.5, (ctx) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(180, 0); o.frequency.exponentialRampToValueAtTime(60, 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.7, 0.01); g.gain.exponentialRampToValueAtTime(0.001, 0.3);
    o.connect(g).connect(ctx.destination); o.start(); o.stop(0.35);
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR / 2, SR); nb.copyToChannel(noise(SR / 2, 29), 0); n.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(900, 0); bp.frequency.exponentialRampToValueAtTime(3000, 0.3); bp.Q.value = 1.2;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, 0); ng.gain.exponentialRampToValueAtTime(0.35, 0.02); ng.gain.exponentialRampToValueAtTime(0.001, 0.4);
    n.connect(bp).connect(ng).connect(ctx.destination); n.start();
  });
  const beep = (f, d, type = 'square') => renderOffline(d + 0.05, (ctx) => {
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.25, 0.01); g.gain.setValueAtTime(0.25, d - 0.03); g.gain.exponentialRampToValueAtTime(0.0001, d);
    const lp = ctx.createBiquadFilter(); lp.frequency.value = 3000;
    o.connect(lp).connect(g).connect(ctx.destination); o.start(); o.stop(d + 0.02);
  });
  bank.beep = await beep(660, 0.18);
  bank.go = await beep(1320, 0.45);
  bank.brake = await beep(440, 0.1, 'sawtooth');   // Mittel: Brems-Hinweis (n14), kurz und tief
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


// ---------- Aufnahmen (n16) ----------
const urlQ = globalThis.location && globalThis.location.search ? new URLSearchParams(globalThis.location.search) : null;
export const SND_ALT = !!urlQ && urlQ.get('snd') === 'alt';
const REC_URL = typeof import.meta !== 'undefined' ? new URL('../../assets/snd/', import.meta.url).href : 'assets/snd/';
// Pegel (abgeglichen mit tests/sound_levels.py und tests/ton_probe.py: Motor und Crash so laut wie bis n15)
export const MIX = { eng: 1.2, off: 0.5, tire: 0.42, scrape: 0.5, crash: 0.95, land: 0.8, pop: 0.42, nitro: 0.4, lpOut: 3800, lpOff: 2200, lpCockpit: 1300 };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Tondatei laden und dekodieren (ohne Geste möglich: OfflineAudioContext), Klänge ausschneiden; Loops bekommen am
// Anfang eine Überblendung mit dem Stück hinter ihrem Ende (nahtlos, auch nach AAC). Der Decoder-Vorlauf wird an der
// Marke (Impuls bei 0,05 s) gemessen.
export async function loadRec(base = REC_URL) {
  const [map, ab] = await Promise.all([fetch(base + 'sfx.json').then((r) => r.json()), fetch(base + 'sfx.m4a').then((r) => { if (!r.ok) throw new Error('sfx.m4a ' + r.status); return r.arrayBuffer(); })]);
  const oc = new OfflineAudioContext(1, 1, map.sr);
  const dec = await new Promise((ok, bad) => { const p = oc.decodeAudioData(ab, ok, bad); if (p && p.catch) p.catch(bad); });
  const d = dec.getChannelData(0), sr = dec.sampleRate, k = sr / map.sr;
  let pk = 0, pi = 0;
  for (let i = 0; i < Math.min(d.length, Math.round(map.marker * 3 * k)); i++) if (Math.abs(d[i]) > pk) { pk = Math.abs(d[i]); pi = i; }
  const off = pi - Math.round(map.marker * k);
  const cut = (name) => {
    const it = map.items[name], n = Math.round(it.n * k), x = Math.round(it.x * k), o = Math.round(it.o * k) + off;
    const b = oc.createBuffer(1, n, sr), out = b.getChannelData(0);
    out.set(d.subarray(o, o + n));
    const lin = /^(on|off|idle)/.test(name);   // Motor: korreliert → linear; Rauschen: gleiche Leistung
    for (let j = 0; j < x; j++) { const a = j / x; out[j] = lin ? d[o + j] * a + d[o + n + j] * (1 - a) : d[o + j] * Math.sin(a * Math.PI / 2) + d[o + n + j] * Math.cos(a * Math.PI / 2); }
    return b;
  };
  const eng = (names) => names.map((nm) => ({ name: nm, buf: cut(nm), rpm: map.items[nm].rpm })).sort((a, b) => a.rpm - b.rpm);
  return {
    on: eng(['idle', 'on1', 'on2', 'on3', 'on4', 'on5', 'on6']), off: eng(['idle', 'off1', 'off2', 'off3']), redline: map.redline,
    tire: [cut('tireA'), cut('tireB')], scrape: cut('scrape'), crunch: [cut('crunchA'), cut('crunchB')], thud: cut('thud'), hood: cut('hood'),
    land: [cut('landA'), cut('landB'), cut('landC')], debris: cut('debris'), glass: cut('glass'), pop: [cut('popA'), cut('popB')], offset: off,
  };
}
// Nitro-Schicht zu den Aufnahmen: dunkleres Fauchen (Bandpass 800 Hz statt 2,2 kHz, am Handy kein Zischeln) + Grollen
function nitroRec() {
  return renderOffline(2.0, (ctx) => {
    const n = ctx.createBufferSource(); const nb = ctx.createBuffer(1, SR * 2, SR); nb.copyToChannel(noise(SR * 2, 31), 0); n.buffer = nb;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0.9;
    n.connect(bp).connect(g).connect(ctx.destination); n.start();
    const n2 = ctx.createBufferSource(); const nb2 = ctx.createBuffer(1, SR * 2, SR); nb2.copyToChannel(noise(SR * 2, 37), 0); n2.buffer = nb2;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g2 = ctx.createGain(); g2.gain.value = 2.0;
    n2.connect(lp).connect(g2).connect(ctx.destination); n2.start();
  });
}
// Gewichte zweier benachbarter Loops (log. Drehzahl, gleiche Leistung)
function engMix(set, rpm) {
  if (rpm <= set[0].rpm) return [[set[0], 1]];
  const L = set[set.length - 1];
  if (rpm >= L.rpm) return [[L, 1]];
  let k = 0; while (rpm >= set[k + 1].rpm) k++;
  const a = Math.log(rpm / set[k].rpm) / Math.log(set[k + 1].rpm / set[k].rpm);
  return [[set[k], Math.cos(a * Math.PI / 2)], [set[k + 1], Math.sin(a * Math.PI / 2)]];
}

export class Sound {
  constructor(store) {
    this.store = store;
    this.ctx = null; this.bank = null; this.running = false; this.nodes = null;
    const unlock = () => this.unlock();
    for (const ev of ['pointerup', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* optional */ }
    // Aufnahmen schon beim Laden der Seite holen und dekodieren (braucht keine Geste) – beim Start liegt alles bereit
    this.recP = SND_ALT || typeof OfflineAudioContext === 'undefined' ? Promise.resolve(null) : loadRec().catch((e) => { console.warn('Ton-Aufnahmen nicht geladen, Synthesizer', e); return null; });
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
      Promise.all([makeBank(), this.recP, this.recP.then((r) => (r ? nitroRec() : null))])
        .then(([b, r, nl]) => { if (r) { b.rec = r; b.nitroLoop = nl; } this.bank = b; if (this.wantRunning) this.start(); })
        .catch((e) => console.warn('Ton', e));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    // stiller Puffer in der Geste (iOS)
    try { const s = this.ctx.createBufferSource(); s.buffer = this.ctx.createBuffer(1, 1, 22050); s.connect(this.ctx.destination); s.start(); } catch { /* egal */ }
  }
  loop(buf, gain, dest, offset = 0) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); if (dest) g.connect(dest); s.start(this.ctx.currentTime, offset);
    return { s, g };
  }
  start() {
    this.wantRunning = true;
    if (!this.enabled || !this.ctx || !this.bank || this.running) return;
    this.running = true;
    if (this.bank.rec) return this.startRec();
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; lp.Q.value = 0.5;
    lp.connect(this.master);
    const eng = this.bank.engine.map((e) => { const l = this.loop(e.buf, 0); l.g.connect(lp); return { ...l, rpm: e.rpm }; });
    const tire = this.loop(this.bank.tire, 0); tire.g.connect(this.master);
    const wind = this.loop(this.bank.wind, 0); wind.g.connect(this.master);
    const nitro = this.loop(this.bank.nitroLoop, 0); nitro.g.connect(this.master);
    this.nodes = { eng, tire, wind, lp, nitro };
  }
  // Aufnahmen: Motor-Bus (Begrenzer moduliert seine Lautstärke) → Tiefpass (außen hell, Cockpit dumpf) → Master.
  // Motor-Stimmen entstehen nur bei Bedarf (höchstens 2 Last + 2 Schiebe-Loops gleichzeitig hörbar).
  startRec() {
    const c = this.ctx, t = c.currentTime;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = MIX.lpOut; lp.Q.value = -3.01; lp.connect(this.master);
    const eng = c.createGain(); eng.gain.value = 0; eng.connect(lp);
    const on = c.createGain(); on.gain.value = 0; on.connect(eng);
    const off = c.createGain(); off.gain.value = 0; off.connect(eng);
    const limG = c.createGain(); limG.gain.value = 0; limG.connect(eng.gain);
    const wind = this.loop(this.bank.wind, 0, this.master);
    const tireBus = c.createGain(); tireBus.connect(this.master);
    // Stimmen, die oft stumm sind (Nitro, Reifen, Schleifen, Begrenzer-Takt), laufen nur bei Bedarf (CPU)
    this.nodes = { rec: true, lp, eng, on, off, lim: null, limG, wind, nitro: null, tireBus, voices: new Map(), tire: null, scrape: null };
    this.load = 0; this.scr = 0; this.popN = 0; this.popT = 0; this.cutT = 0; this.blipT = 0; this._gear = undefined; this._thr = 0;
  }
  stop() {
    this.wantRunning = false;
    if (!this.running || !this.nodes) return;
    const t = this.ctx.currentTime, N = this.nodes;
    const all = N.rec ? [N.wind, N.nitro, ...N.voices.values(), N.tire, N.scrape].filter(Boolean) : [...N.eng, N.tire, N.wind, N.nitro];
    for (const n of all) { n.g.gain.setTargetAtTime(0, t, 0.05); n.s.stop(t + 0.3); }
    if (N.rec && N.lim) N.lim.stop(t + 0.3);
    this.running = false; this.nodes = null;
  }
  shot(buf, gain = 1, rate = 1, delay = 0, dest = null) {
    if (!this.enabled || !this.ctx || !this.bank || !buf) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g).connect(dest || this.master); s.start(this.ctx.currentTime + delay);
  }
  event(e) {
    if (!this.bank) return;
    const R = this.bank.rec;
    if (e.type === 'count') this.shot(this.bank.beep, 0.7);
    else if (e.type === 'go') this.shot(this.bank.go, 0.8);
    else if (e.type === 'checkpoint') this.shot(this.bank.cp, 0.8);
    else if (e.type === 'crash' && R) { this.crashRec(e); if (e.penalty) this.shot(this.bank.whoosh, 0.6, 1, 0.12); }
    else if (e.type === 'crash' && e.penalty) { this.shot(this.bank.thump, 0.9); this.shot(this.bank.whoosh, 0.9); }
    else if (e.type === 'crash') this.shot(this.bank.crash, 1);
    else if (e.type === 'finish') this.shot(this.bank.finish, 0.9);
    else if (e.type === 'land' && R) this.landRec(e.v);
    else if (e.type === 'land') this.shot(this.bank.thump, Math.min(1, e.v / 8));
    else if (e.type === 'nitro') this.shot(this.bank.nitroGo, R ? 0.6 : 0.9);
    else if (e.type === 'hop') this.shot(this.bank.hop, 0.9);
    else if (e.type === 'refill') this.shot(this.bank.cp, 0.5);
    else if (e.type === 'brakehint' && this.bank.brake) this.shot(this.bank.brake, 0.55);
  }
  // Crash nach Schwere s (0 … 1, aus Aufprall-Tempo bzw. Fahrtempo): Wumms + Blech immer, Knirschen ab mittel,
  // rieselnde Trümmer ab mittel-schwer (verzögert), Glas nur schwer; Auswahl, Tonhöhe, Einsatz zufällig
  crashRec(e) {
    const R = this.bank.rec, G = MIX.crash;
    const s = Math.max(0.12, clamp01(Math.max(e.imp || 0, (e.v || 0) * 0.45) / 26));
    this.lastCrashS = s;
    this.shot(R.thud, G * (0.45 + 0.5 * s), rnd(0.85, 1.1));
    this.shot(R.hood, G * (0.75 - 0.35 * s), rnd(0.9, 1.15));
    if (s > 0.25) this.shot(pick(R.crunch), G * (0.35 + 0.6 * s), rnd(0.9, 1.1), rnd(0, 0.03));
    if (s > 0.45) this.shot(R.debris, G * (0.3 + 0.5 * (s - 0.45) / 0.55), rnd(0.9, 1.1), rnd(0.08, 0.2));
    if (s > 0.75) this.shot(R.glass, G * (0.3 + 0.35 * (s - 0.75) / 0.25), rnd(0.92, 1.1), rnd(0.02, 0.06));
  }
  // Landung nach Fallhöhe (Aufsetz-Tempo v m/s): Stoß, ab 8 m/s Blech dazu, ab 12 m/s Knirschen
  landRec(v) {
    const R = this.bank.rec, G = MIX.land;
    this.shot(pick(R.land), G * (0.25 + 0.75 * clamp01(v / 10)), rnd(0.88, 1.1));
    if (v > 8) this.shot(R.hood, G * 0.55 * clamp01((v - 8) / 6), rnd(0.85, 1.0), 0.01);
    if (v > 12) this.shot(pick(R.crunch), G * 0.3, rnd(1.0, 1.15), 0.02);
  }
  pop(gain) { const N = this.nodes; this.shot(pick(this.bank.rec.pop), MIX.pop * gain, rnd(0.85, 1.2), 0, N && N.lp); }
  update(car, dt, state, opt = {}) {
    if (!this.running || !this.nodes) return;
    if (this.nodes.rec) this.updateRec(car, dt, state, opt); else this.updateSynth(car, dt, state);
    // Aufsetzer nach Sprüngen
    if (this._air && car.onGround >= 2 && this._airT > 0.35) this.event({ type: 'land', v: Math.min(16, this._vy || 5) });
    this._air = car.onGround === 0;
    this._airT = this._air ? (this._airT || 0) + dt : 0;
    if (this._air) this._vy = -car.v.y;
  }
  updateRec(car, dt, state, opt) {
    const c = this.ctx, t = c.currentTime, N = this.nodes, R = this.bank.rec, red = R.redline;
    const run = state === 'running';
    const thr = car.input.throttle;
    let rpm = Math.max(900, car.rpm);
    // Gangwechsel: hoch → Zündunterbrechung (~85 ms, manchmal ein Knall), runter → Zwischengas
    if (this._gear !== undefined && car.gear !== this._gear && run) {
      if (car.gear > this._gear) { this.cutT = 0.085; if (rpm > 5000 && Math.random() < 0.45) this.pop(rnd(0.5, 0.9)); } else this.blipT = 0.2;
    }
    this._gear = car.gear;
    this.cutT -= dt; this.blipT -= dt;
    if (this.blipT > 0) rpm += 1100 * this.blipT / 0.2;
    const want = this.cutT > 0 ? 0 : this.blipT > 0 ? 1 : thr;
    this.load += (want - this.load) * Math.min(1, dt / 0.05);
    const L = this.load;
    const vol = state === 'wreck' || state === 'reset' ? 0 : MIX.eng * (1 + 0.25 * (car.boost || 0));
    N.eng.gain.setTargetAtTime(this.cutT > 0 ? vol * 0.3 : vol, t, 0.015);
    N.on.gain.setTargetAtTime(0.12 + 0.88 * L, t, 0.03);
    N.off.gain.setTargetAtTime(MIX.off * (1 - L), t, 0.03);
    // Begrenzer: an der Höchstdrehzahl mit Vollgas setzt die Zündung im 17-Hz-Takt aus
    const limOn = car.rpm > red * 0.97 && thr > 0.8 && run;
    if (limOn && !N.lim) { N.lim = c.createOscillator(); N.lim.type = 'square'; N.lim.frequency.value = 17; N.lim.connect(N.limG); N.lim.start(t); N.limIdle = 0; }
    N.limG.gain.setTargetAtTime(limOn ? vol * 0.45 : 0, t, 0.02);
    if (N.lim && !limOn && (N.limIdle += dt) > 0.3) { N.lim.stop(t + 0.05); N.lim = null; }
    // außen: unter Last heller, im Schiebebetrieb dunkler (das Rauschen des Turbos bleibt am Handy leise); Cockpit dumpf
    N.lp.frequency.setTargetAtTime(opt.cockpit ? MIX.lpCockpit : MIX.lpOff + (MIX.lpOut - MIX.lpOff) * L, t, 0.05);
    // Motor-Stimmen: je Schicht die zwei Loops um die Drehzahl, Tonhöhe = Drehzahl / Loop-Drehzahl
    const need = new Map();
    // (Schiebe-Schicht nur, wenn sie hörbar ist: unter Volllast entfällt sie – meist nur 2 Stimmen)
    for (const [set, bus] of [[R.on, N.on], [R.off, N.off]]) if (bus === N.on || L < 0.97) for (const [e, w] of engMix(set, rpm)) need.set(e.name + (bus === N.on ? '+' : '-'), { e, w, bus });
    for (const [key, v] of N.voices) {
      const nd = need.get(key);
      if (nd) { v.g.gain.setTargetAtTime(nd.w, t, 0.03); v.s.playbackRate.setTargetAtTime(Math.max(0.6, Math.min(1.8, rpm / nd.e.rpm)), t, 0.02); v.idle = 0; need.delete(key); }
      else { v.g.gain.setTargetAtTime(0, t, 0.03); v.idle += dt; if (v.idle > 0.15) { v.s.stop(t + 0.05); N.voices.delete(key); } }
    }
    for (const [key, nd] of need) {
      const v = this.loop(nd.e.buf, 0, nd.bus, Math.random() * nd.e.buf.duration); v.idle = 0;
      v.s.playbackRate.value = Math.max(0.6, Math.min(1.8, rpm / nd.e.rpm)); v.g.gain.setTargetAtTime(nd.w, t, 0.02);
      N.voices.set(key, v);
    }
    // Fehlzündungen im Schiebebetrieb: nach schnellem Gaswegnehmen bei hoher Drehzahl 2–4 Knalle, danach selten
    if (run && this._thr > 0.6 && thr < 0.15 && rpm > 4500) { this.popN = 2 + Math.floor(Math.random() * 3); this.popT = rnd(0.04, 0.12); }
    this._thr = thr;
    if (this.popN > 0) { this.popT -= dt; if (this.popT <= 0) { this.pop(rnd(0.45, 1)); this.popN--; this.popT = rnd(0.06, 0.22); } }
    else if (run && L < 0.1 && rpm > 5000 && Math.random() < dt * 0.4) this.pop(rnd(0.3, 0.6));
    // Nitro-Schicht
    const nb = run ? car.boost || 0 : 0;
    if (nb > 0.01 && !N.nitro) N.nitro = this.loop(this.bank.nitroLoop, 0, N.lp, Math.random());
    if (N.nitro) {
      N.nitro.g.gain.setTargetAtTime(MIX.nitro * nb * (0.4 + 0.6 * thr), t, 0.06);
      N.nitro.s.playbackRate.setTargetAtTime(0.9 + 0.25 * nb, t, 0.1);
      N.nitro.idle = nb > 0.01 ? 0 : (N.nitro.idle || 0) + dt;
      if (N.nitro.idle > 0.5) { N.nitro.s.stop(t + 0.1); N.nitro = null; }
    }
    // Reifen: Quietschen (Aufnahme, bei jedem neuen Rutschen zufällig eine von zwei), Tonhöhe mit dem Schlupf
    let slip = 0;
    for (const w of car.wheels) if (w.contact) slip = Math.max(slip, Math.abs(w.slip));
    const sp = car.speed(), cock = opt.cockpit ? 0.6 : 1;
    const tireV = run || state === 'finished' ? clamp01((slip - 0.12) * 3) * Math.min(1, sp / 8) : 0;
    if (tireV > 0.01 && !N.tire) { N.tire = this.loop(pick(R.tire), 0, N.tireBus, Math.random() * 1.5); }
    if (N.tire) {
      N.tire.g.gain.setTargetAtTime(MIX.tire * tireV * cock, t, 0.05);
      N.tire.s.playbackRate.setTargetAtTime(0.9 + 0.25 * clamp01((slip - 0.12) * 2), t, 0.08);
      N.tire.idle = tireV > 0.01 ? 0 : (N.tire.idle || 0) + dt;
      if (N.tire.idle > 0.6) { N.tire.s.stop(t + 0.1); N.tire = null; }
    }
    // Schleifen an Wand/Leitplanke/Boden, solange die Karosserie gleitet (Gleit-Tempo car.scrape)
    this.scr = Math.max(run ? car.scrape || 0 : 0, this.scr * Math.exp(-dt / 0.06));
    const scV = clamp01((this.scr - 1.5) / 12);
    if (scV > 0.01 && !N.scrape) N.scrape = this.loop(R.scrape, 0, this.master, Math.random() * 2);
    if (N.scrape) {
      N.scrape.g.gain.setTargetAtTime(MIX.scrape * scV, t, 0.03);
      N.scrape.s.playbackRate.setTargetAtTime(0.8 + 0.4 * clamp01(this.scr / 30), t, 0.05);
      N.scrape.idle = scV > 0.01 ? 0 : (N.scrape.idle || 0) + dt;
      if (N.scrape.idle > 0.5) { N.scrape.s.stop(t + 0.1); N.scrape = null; }
    }
    // Fahrtwind wie bisher (bis ~200 km/h sp²/9000, darüber lauter und heller), im Cockpit leiser
    const hi = clamp01((sp - 56) / 100);
    N.wind.g.gain.setTargetAtTime((Math.min(0.35, sp * sp / 9000) + 0.25 * hi) * (opt.cockpit ? 0.5 : 1), t, 0.1);
    N.wind.s.playbackRate.setTargetAtTime(1 + 0.45 * hi, t, 0.1);
  }
  updateSynth(car, dt, state) {
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
    // Nitro: Fauchen/Grollen mit der Nitro-Stärke, Motor dabei heller
    const nb = state === 'running' ? car.boost || 0 : 0;
    N.nitro.g.gain.setTargetAtTime(0.5 * nb * (0.4 + 0.6 * thr), t, 0.06);
    N.nitro.s.playbackRate.setTargetAtTime(0.9 + 0.25 * nb, t, 0.1);
    let slip = 0;
    for (const w of car.wheels) if (w.contact) slip = Math.max(slip, Math.abs(w.slip));
    const sp = car.speed();
    const tireV = Math.max(0, Math.min(1, (slip - 0.12) * 3)) * Math.min(1, sp / 8) * 0.35;
    N.tire.g.gain.setTargetAtTime(tireV, t, 0.05);
    // Fahrtwind: bis ~200 km/h wie bisher (sp²/9000, höchstens 0,35), darüber lauter und heller bis Vmax
    // (~580 km/h: 0,6, Tonhöhe ×1,45) – seit dem Tempo-Umbau 27.09.2026
    const hi = Math.max(0, Math.min(1, (sp - 56) / 100));
    N.wind.g.gain.setTargetAtTime(Math.min(0.35, sp * sp / 9000) + 0.25 * hi, t, 0.1);
    N.wind.s.playbackRate.setTargetAtTime(1 + 0.45 * hi, t, 0.1);
  }
}
