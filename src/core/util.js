// Kleine Helfer ohne Abhängigkeiten (laufen im Browser und in Node).

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

// Deterministischer Zufall (mulberry32): gleiche Zahl = gleiche Strecke
export function rng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (n) => Math.floor(r() * n);
  r.range = (a0, b0) => a0 + (b0 - a0) * r();
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  return r;
}

export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// "Strecke des Tages": Datum als Seed (JJJJMMTT)
export function daySeed(d = new Date()) {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

// Zeit als 1:23,45
export function fmtTime(t) {
  if (t == null || !isFinite(t)) return '–:––,––';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(2).padStart(5, '0').replace('.', ',');
  return `${m}:${ss}`;
}

// Wertrauschen (2D) für Gelände
export function makeNoise2(seed) {
  const r = rng(seed);
  const P = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const G = new Float32Array(512);
  for (let i = 0; i < 512; i++) G[i] = r() * 2 - 1;
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const v00 = G[P[X + P[Y]]], v10 = G[P[X + 1 + P[Y]]];
    const v01 = G[P[X + P[Y + 1]]], v11 = G[P[X + 1 + P[Y + 1]]];
    const u = fade(xf), v = fade(yf);
    return lerp(lerp(v00, v10, u), lerp(v01, v11, u), v);
  }
  n2.fbm = (x, y, oct = 4) => {
    let a = 0.5, f = 1, s = 0, n = 0;
    for (let o = 0; o < oct; o++) {
      s += a * n2(x * f, y * f);
      n += a; a *= 0.5; f *= 2.03;
    }
    return s / n;
  };
  return n2;
}
