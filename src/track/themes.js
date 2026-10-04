// Kulissen (n20, Peter 29.09.2026: „Mehr Streckenelemente und Kulissen“): Landschafts-Themen – rein rechnend (Node-testbar).
// Jedes Thema bestimmt, WIE eine Strecke aussieht (Himmel, Licht, Nebel, Boden, Pflanzen, Fernkulisse, Bauten am Rand),
// nie, WO gefahren wird: Strecke, Gelände (Physik), Ideallinie und Bestzeit-Schlüssel bleiben unverändert. Die Fernkulisse
// hebt/senkt nur das gezeichnete Gelände weit außerhalb des Physik-Rasters (farLift, ab ext + 30 m).
// Auswahl: Einstellung „Landschaft“ = 'auto' (passend) oder ein Thema; passend = aus dem Seed (generierte Strecken,
// Gelände-Stufe/-Elemente und Streckenart fließen in die Gewichte ein) bzw. aus dem Horizont der .TRK-Datei.
import { WORLD_SCALE, WORLD_HALF } from './defs.js';
import { smoothstep, makeNoise2 } from '../core/util.js';

const WS = WORLD_SCALE;
const C = (r, g, b) => [r, g, b];

// Boden-Palette (Werte wie bisher fest im Gras-Shader = Thema „Land“): g0/g1 = dunkles/helles Grün nach Textur-Helligkeit,
// dry = trockene Flecken (Anteil dryK), tint/tintK = Beimischung der Texturfarbe, fields = Felder mit Hecken in der Ferne,
// forest = Wald am Bergkranz, dirt/rock = Erde/Fels an Böschungen, slope = Neigungsgrenzen (Normalen-y: Erde ab d0…d1,
// Fels ab r0…r1), strata = Schichtbänder im Fels (Canyon), snowH = Schnee über dieser Höhe (m, 1e5 = aus),
// beach = Sandstrand bis zu dieser Höhe (Meer), city = Stadtviertel-Muster in der Ferne, snowAll = ganzer Boden verschneit
const GROUND_LAND = {
  g0: C(0.035, 0.085, 0.02), g1: C(0.2, 0.34, 0.08), dry: C(0.26, 0.27, 0.12), dryK: 0.55, tint: C(0.7, 0.85, 0.5), tintK: 0.25,
  fields: 1, forest: C(0.03, 0.06, 0.022), forestK: 1, dirt0: C(0.055, 0.038, 0.022), dirt1: C(0.11, 0.08, 0.05),
  rock0: C(0.06, 0.055, 0.05), rock1: C(0.16, 0.145, 0.125), slope: [0.93, 0.86, 0.83, 0.72], strata: 0, strataCol: C(0.3, 0.12, 0.06),
  snowH: 1e5, beach: -1e5, city: 0, rockTex: 0, texK: 0,
};

export const THEMES = {
  land: {
    name: 'Land', icon: '🌾', desc: 'Hügel, Felder, Wälder',
    pack: null,
    ground: GROUND_LAND,
    light: { sunI: 3.0, envI: 1.8, fog: [1, 1], grade: 'mittag', haze: null },
    far: 'rim', backdrop: 'huegel',
    trees: { kind: 'fir', keep: 1 },
    veg: { grass: 1, flower: 1, bush: 1, laub: 1, rock: 1, farm: 'hof', tint: null },
    sky: { balloons: 5, zeppelin: 1, turbines: 6 },
  },
  wueste: {
    name: 'Wüste & Canyon', icon: '🏜️', desc: 'roter Fels, Tafelberge, Köcherbäume',
    pack: { sky: 'wueste', ground: 'Ground097', rock: 'Rock029', veg: 'wueste' },
    ground: { ...GROUND_LAND, g0: C(0.33, 0.2, 0.11), g1: C(0.78, 0.55, 0.33), dry: C(0.5, 0.3, 0.16), dryK: 0.5, tint: C(1.0, 0.82, 0.62), tintK: 0.45,
      fields: 0, forest: C(0.3, 0.13, 0.06), forestK: 0.8, dirt0: C(0.36, 0.17, 0.08), dirt1: C(0.55, 0.3, 0.16), rock0: C(0.34, 0.14, 0.07), rock1: C(0.66, 0.34, 0.18),
      slope: [0.97, 0.9, 0.88, 0.78], strata: 1, strataCol: C(0.5, 0.2, 0.09), rockTex: 1, texK: 1 },
    light: { sunI: 3.3, envI: 1.6, fog: [1.25, 1.35], grade: 'wueste', haze: C(0.86, 0.74, 0.62) },
    far: 'mesa', backdrop: 'mesa',
    trees: { kind: 'cards', atlas: 'wueste', cells: [['koecher1', 7, 3], ['koecher2', 6, 2]], keep: 0.22 },
    veg: { grass: 0.45, flower: 0.5, flowerCells: ['sukk1', 'sukk2'], bush: 0.8, bushCells: ['rooibos', 'rooibos2'], laub: 0.25, laubCells: [['koecher1', 7], ['koecher2', 6]],
      rock: 2.2, rockTint: C(1.25, 0.62, 0.36), farm: 'ranch', tint: { grass: C(1.6, 1.25, 0.6) } },
    sky: { balloons: 7, zeppelin: 1, turbines: 0 },
  },
  alpen: {
    name: 'Alpen', icon: '🏔️', desc: 'Berge, Schnee, Tannen, Hütten',
    pack: { sky: 'alpen', ground: 'Grass004', rock: 'Rock051', veg: 'berg' },
    ground: { ...GROUND_LAND, g0: C(0.04, 0.1, 0.025), g1: C(0.22, 0.36, 0.1), dry: C(0.3, 0.3, 0.14), dryK: 0.35, fields: 0, forest: C(0.02, 0.05, 0.025), forestK: 1.3,
      rock0: C(0.09, 0.09, 0.09), rock1: C(0.26, 0.25, 0.24), slope: [0.92, 0.85, 0.8, 0.68], snowH: 300, rockTex: 1, texK: 0.6 },
    light: { sunI: 3.2, envI: 1.8, fog: [1.5, 1.6], grade: 'alpen', haze: C(0.72, 0.8, 0.9) },
    far: 'alpen', backdrop: 'alpen',
    trees: { kind: 'fir', keep: 1.0, extraFirs: 1 },
    veg: { grass: 1, flower: 1.2, bush: 0.6, bushCells: ['jungtanne', 'strauch'], laub: 0.4, rock: 1.8, farm: 'huette' },
    sky: { balloons: 4, zeppelin: 1, turbines: 0 },
  },
  kueste: {
    name: 'Küste & Tropen', icon: '🏝️', desc: 'Meer, Strand, Palmen, Leuchtturm',
    pack: { sky: 'kueste', ground: 'Grass001', veg: 'kueste' },
    ground: { ...GROUND_LAND, g0: C(0.03, 0.09, 0.03), g1: C(0.18, 0.38, 0.1), dry: C(0.42, 0.38, 0.22), dryK: 0.4, fields: 0, forest: C(0.03, 0.08, 0.03), forestK: 1,
      beach: 3.5, texK: 0.5 },
    light: { sunI: 3.2, envI: 1.9, fog: [1.2, 1.4], grade: 'kueste', haze: C(0.74, 0.84, 0.92) },
    far: 'kueste', backdrop: 'meer',
    trees: { kind: 'cards', atlas: 'kueste', cells: [['palme1', 12, 3], ['palme2', 11, 3], ['insel', 9, 1]], keep: 0.55 },
    veg: { grass: 1, flower: 0.6, bush: 1.1, bushCells: ['pachira', 'strauch', 'strauch2'], laub: 0.9, laubCells: [['palme1', 12], ['palme2', 11], ['palme3', 9], ['insel', 9]],
      rock: 0.8, farm: 'strand' },
    sky: { balloons: 3, zeppelin: 1, turbines: 4 },
  },
  stadt: {
    name: 'Stadt', icon: '🏙️', desc: 'Hochhäuser, Kräne, Hochstraßen',
    pack: { sky: 'stadt', ground: 'Grass001', veg: 'stadt' },
    ground: { ...GROUND_LAND, g0: C(0.035, 0.08, 0.03), g1: C(0.17, 0.3, 0.09), fields: 0, forestK: 0, city: 1, texK: 0.4 },
    light: { sunI: 3.4, envI: 1.6, fog: [0.95, 1.1], grade: 'stadt', haze: C(0.85, 0.76, 0.66) },
    far: 'stadt', backdrop: 'skyline',
    trees: { kind: 'cards', atlas: 'stadt', cells: [['jacaranda', 11, 2], ['insel3', 9, 2]], keep: 0.3 },
    veg: { grass: 0.8, flower: 0.6, bush: 0.8, bushCells: ['strauch', 'strauch2'], laub: 0.6, laubCells: [['jacaranda', 11], ['insel3', 9]], rock: 0.3, farm: 'none' },
    sky: { balloons: 2, zeppelin: 1, turbines: 0 },
  },
  herbst: {
    name: 'Herbstwald', icon: '🍂', desc: 'bunte Wälder, Laub, goldenes Licht',
    pack: { sky: 'herbst', ground: 'ScatteredLeaves009' },
    ground: { ...GROUND_LAND, g0: C(0.06, 0.08, 0.02), g1: C(0.3, 0.32, 0.08), dry: C(0.5, 0.28, 0.07), dryK: 0.75, tint: C(1.0, 0.75, 0.45), tintK: 0.35,
      forest: C(0.12, 0.05, 0.015), forestK: 1.2, texK: 0.5 },
    light: { sunI: 3.0, envI: 1.8, fog: [1, 1.1], grade: 'herbst', haze: C(0.88, 0.82, 0.7) },
    far: 'rim', backdrop: 'huegel',
    trees: { kind: 'fir', keep: 1, autumn: 0.6 },
    veg: { grass: 0.8, flower: 0.3, bush: 1.2, laub: 1.5, rock: 1, farm: 'hof', autumn: 1 },
    sky: { balloons: 7, zeppelin: 1, turbines: 5 },
  },
  winter: {
    name: 'Winter', icon: '❄️', desc: 'Schnee, verschneite Tannen, Nebel',
    pack: { sky: 'winter', ground: 'Snow010A', rock: 'Rock058', veg: 'berg' },
    ground: { ...GROUND_LAND, g0: C(0.42, 0.45, 0.5), g1: C(0.74, 0.77, 0.82), dry: C(0.55, 0.57, 0.62), dryK: 0.3, tint: C(0.86, 0.88, 0.92), tintK: 0.5, fields: 0,
      forest: C(0.04, 0.06, 0.05), forestK: 1, dirt0: C(0.3, 0.3, 0.32), dirt1: C(0.5, 0.5, 0.53), rock0: C(0.12, 0.12, 0.13), rock1: C(0.3, 0.3, 0.32), snowH: 1e5, rockTex: 1, texK: 1 },
    light: { sunI: 1.4, envI: 1.7, fog: [0.7, 0.85], grade: 'winter', haze: C(0.82, 0.84, 0.88) },
    far: 'alpen', backdrop: 'alpen',
    trees: { kind: 'fir', keep: 1, snow: 1 },
    veg: { grass: 0, flower: 0, bush: 0.6, bushCells: ['jungtanne', 'strauch'], laub: 0.5, laubCells: [['jungtanne', 10], ['jungtanne', 8]], rock: 1, farm: 'huette', snow: 1 },
    sky: { balloons: 2, zeppelin: 0, turbines: 4 },
  },
};
export const THEME_IDS = Object.keys(THEMES);
// .TRK-Horizont (Stunts: Wüste, Tropen, Alpen, Stadt, Land, Chaos) → Thema; Chaos: Herbst oder Winter je Strecke
const HORIZON_THEME = ['wueste', 'kueste', 'alpen', 'stadt', 'land', null];

function hash32(...a) {
  let h = 0x811c9dc5;
  for (const v of a) { h = Math.imul(h ^ (v >>> 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return h >>> 0;
}
function pickW(h, weights) {
  const tot = Object.values(weights).reduce((s, w) => s + w, 0);
  let x = (h / 4294967296) * tot;
  for (const [k, w] of Object.entries(weights)) { if ((x -= w) < 0) return k; }
  return Object.keys(weights)[0];
}

// Passendes Thema zu einer Strecke (layout: generiert oder .TRK-Import). Deterministisch, unabhängig vom Zufall des Generators;
// hängt nur an Seed, Stufe und Streckenart (schon vor dem Bau bekannt → das Paket lädt, während der Autopilot prüft).
export function themeAuto(layout) {
  const m = (layout && layout.meta) || {};
  if (layout && layout.trk && layout.trk.horizon != null) {
    const t = HORIZON_THEME[layout.trk.horizon];
    return t || (hash32(layout.seed || 1, 77) % 2 ? 'herbst' : 'winter');
  }
  const seed = m.seed ?? layout?.seed ?? 1, diff = m.diff ?? layout?.diff ?? 2;
  const mode = m.gel || layout?.gel ? 2 : m.d3 || layout?.d3 ? 1 : 0;
  let W;
  if (mode === 2) {
    W = diff >= 3 ? { alpen: 3, wueste: 3, winter: 1.5, land: 1, herbst: 1, kueste: 1, stadt: 0.5 }
      : diff === 2 ? { land: 2, alpen: 2, wueste: 2, herbst: 1.5, kueste: 1.5, winter: 1, stadt: 0.5 }
        : { land: 3, herbst: 2, kueste: 2, alpen: 1, winter: 1, wueste: 1, stadt: 0.5 };
  } else if (mode === 1) W = { stadt: 4, kueste: 1.5, land: 1, wueste: 1, herbst: 1, winter: 1, alpen: 0.5 };
  else W = { land: 3, kueste: 2, stadt: 2, herbst: 1.5, wueste: 1.5, winter: 1, alpen: 1 };
  return pickW(hash32(seed, diff * 31 + mode, 0x7e3a), W);
}
// Einstellung ('auto' oder Thema) + URL ?thema= → Thema
export function themeFor(layout, setting = 'auto', url = null) {
  if (url && THEMES[url]) return url;
  if (setting && setting !== 'auto' && THEMES[setting]) return setting;
  return themeAuto(layout);
}

// ---------- Fernkulisse: gezeichnetes Gelände außerhalb des Physik-Rasters ----------
// Liefert f(x, z, h) → neue Höhe (h = Höhe aus heightFn). Innerhalb von ext + 30 m exakt h (Fuge zum Nahraster).
export function farLift(theme, seed, ext) {
  const kind = (THEMES[theme] || THEMES.land).far;
  if (kind === 'rim') return null;
  const n = makeNoise2(((seed >>> 0) * 7 + 911) >>> 0), n2 = makeNoise2(((seed >>> 0) * 13 + 17) >>> 0);
  const w = (x, z, a, b) => smoothstep(a, b, Math.max(Math.abs(x), Math.abs(z)) - ext);
  if (kind === 'alpen') {
    return (x, z, h) => {
      const k = w(x, z, 30, 900 * WS / 2);
      if (k <= 0) return h;
      const u = x / (520 * WS), v = z / (520 * WS);
      const r1 = 1 - Math.abs(n.fbm(u, v, 4)), r2 = 1 - Math.abs(n2.fbm(u * 2.3 + 5, v * 2.3 - 3, 3));
      const ridge = Math.pow(Math.max(0, r1), 2.2) * 0.75 + Math.pow(Math.max(0, r2), 3) * 0.35;
      const grow = 0.45 + 0.55 * smoothstep(0, 1700 * WS / 2, Math.max(Math.abs(x), Math.abs(z)) - ext);
      return h + k * grow * ridge * 330 * WS / 2 * 1.4;
    };
  }
  if (kind === 'mesa') {
    return (x, z, h) => {
      const k = w(x, z, 30, 320 * WS / 2);
      if (k <= 0) return h;
      const v = n.fbm(x / (330 * WS), z / (330 * WS), 3) + 0.25 * n2.fbm(x / (90 * WS), z / (90 * WS), 2);
      // Tafelberge: zwei Stufen mit steilen Flanken (Schichtstufen), dazwischen Ebene
      const s1 = smoothstep(0.08, 0.13, v), s2 = smoothstep(0.32, 0.36, v);
      return h * 0.6 + k * (s1 * 70 + s2 * 55) * WS / 2;
    };
  }
  if (kind === 'kueste') {
    const a0 = ((seed >>> 0) % 360) * Math.PI / 180;
    const cx = Math.cos(a0), cz = Math.sin(a0);
    const rs = Math.SQRT2 * ext + 30;   // Meer erst außerhalb des Kreises um das Physik-Raster (gfx/kulisse.js buildSea)
    return (x, z, h) => {
      const r = Math.hypot(x, z) || 1, k = w(x, z, 30, 260) * smoothstep(rs + 40, rs + 320, r);
      if (k <= 0) return h;
      const s = (x * cx + z * cz) / r;
      // Küstenlinie leicht gewellt; seewärts unter den Meeresspiegel, landseits sanfte Hügel
      const coast = smoothstep(0.1, 0.45, s + 0.12 * n.fbm(x / 700, z / 700, 2));
      return h - k * coast * (h + 10 + 25 * smoothstep(0, 900, Math.max(Math.abs(x), Math.abs(z)) - ext));
    };
  }
  if (kind === 'stadt') {
    return (x, z, h) => {
      const k = w(x, z, 30, 400);
      return k <= 0 ? h : h - k * Math.max(0, h - 3) * 0.92;
    };
  }
  return null;
}
// Meer (Küste): Richtung der See (Einheitsvektor x/z) – Grafik legt dort das Meer an, Leuchtturm an die Küste
export function seaDir(seed) { const a0 = ((seed >>> 0) % 360) * Math.PI / 180; return [Math.cos(a0), Math.sin(a0)]; }
export const SEA_Y = -1.6;
export { WORLD_HALF };
