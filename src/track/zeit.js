// Tageszeit (n32, Nachtrag Peter 09.10.2026) – rein rechnend (Node-testbar): Auswahl (URL > Einstellung > passend) und
// Aussehens-Werte für Abend und Nacht. Nur Optik: Physik, Strecke und Bestzeit-Schlüssel hängen nicht daran (kein A/B-Zusatz).
// Kombinierbar mit dem Wetter (track/wetter.js): gfx/zeit.js setzt zuerst die Tageszeit auf die Werte des Themas, das
// Wetter rechnet darauf weiter (Nacht + Regen = nasse Fahrbahn spiegelt die Lichter).
import { hash32, strHash, streckenZahl } from './wetter.js';

export const ZEIT = {
  tag: { name: 'Tag', icon: '☀️', desc: 'wie bisher: Sonne und Himmel des Themas' },
  abend: { name: 'Abend', icon: '🌇', desc: 'tiefe, warme Sonne, lange Schatten, Lichter an' },
  nacht: { name: 'Nacht', icon: '🌙', desc: 'Sternenhimmel, Flutlicht, Scheinwerfer, Lichterketten' },
};
export const ZEIT_IDS = Object.keys(ZEIT);
export const ZEIT_WAHL = ['auto', ...ZEIT_IDS];
// „Passend“: meist Tag, gelegentlich Abend oder Nacht (je Strecke fest)
export const ZEIT_CHANCE = { abend: 0.12, nacht: 0.08 };

const ALIAS = { passend: 'auto', auto: 'auto', tag: 'tag', day: 'tag', abend: 'abend', evening: 'abend', dusk: 'abend', nacht: 'nacht', night: 'nacht' };
export function parseZeit(v) {
  if (v == null) return null;
  return ALIAS[String(v).trim().toLowerCase()] || null;
}
export function zeitAuto(layout, themeId) {
  const x = hash32(streckenZahl(layout), strHash(themeId || 'land'), 0x7a1c3) / 4294967296;
  return x < ZEIT_CHANCE.nacht ? 'nacht' : x < ZEIT_CHANCE.nacht + ZEIT_CHANCE.abend ? 'abend' : 'tag';
}
export function zeitFor(layout, themeId, setting = 'auto', url = null) {
  const u = parseZeit(url);
  if (u && u !== 'auto') return u;
  const s = parseZeit(setting);
  if (s && s !== 'auto') return s;
  return zeitAuto(layout, themeId);
}

// ---------- Aussehen ----------
// Faktoren auf die Werte des Themas (1 = unverändert):
//  sunElev: Höhe der Licht-Richtung in Grad (null = Sonne des Themas; Abend: gleiche Himmelsrichtung, tief; Nacht: Mond),
//  sunAz: Drehung der Himmelsrichtung (Grad), sun/env: Licht × k, sunTint: Lichtfarbe, skyDark/skyTint: Himmelsbild,
//  night: Sternenhimmel + Mond (0 … 1), glow: Abendrot am Horizont zur Sonne, fog: Nebel-Reichweite × k, fogCol: Nebelfarbe
//  (Mischung fogK), grade: Farbkorrektur des Kino-Looks, lights: Lichter an (Flutlicht-Pfützen, Leuchtpunkte, Fenster,
//  Scheinwerfer) 0 … 1, flare: Sonnen-Blendung × k, line: Ideallinie heller (× 1 + line), cockpit: Umgebungslicht im Cockpit.
export const ZEIT_LOOK = {
  tag: Object.freeze({ id: 'tag', sunElev: null, sunAz: 0, sun: 1, env: 1, sunTint: null, skyDark: 0, skyTint: null, night: 0, glow: 0, fog: 1, fogCol: null, fogK: 0, grade: null, lights: 0, flare: 1, line: 0, cockpit: 1, headlight: 0 }),
  abend: Object.freeze({ id: 'abend', sunElev: 7, sunAz: 0, sun: 0.8, env: 0.55, sunTint: [1.0, 0.6, 0.32], skyDark: 0.18, skyTint: [1.12, 0.82, 0.62], night: 0, glow: 1, fog: 0.9, fogCol: [0.92, 0.64, 0.46], fogK: 0.55, grade: 'abend', lights: 0.55, flare: 1.2, line: 0.15, cockpit: 0.7, headlight: 0.5 }),
  nacht: Object.freeze({ id: 'nacht', sunElev: 38, sunAz: 140, sun: 0.11, env: 0.07, sunTint: [0.62, 0.74, 1.0], skyDark: 0.95, skyTint: [0.7, 0.8, 1.15], night: 1, glow: 0, fog: 0.85, fogCol: [0.035, 0.045, 0.075], fogK: 0.92, grade: 'nacht', lights: 1, flare: 0, line: 0.6, cockpit: 0.25, headlight: 1 }),
};
// Grafikstufe: Lichterketten/Leuchtpunkte erst ab Standard (Automatik nimmt sie als Erstes weg), Scheinwerfer-Licht immer
export const ZEIT_STUFE = { ketten: 1 };
export function zeitLook(z, tier = 2) {
  const L = ZEIT_LOOK[z] || ZEIT_LOOK.tag;
  return { ...L, ketten: L.lights > 0 && tier >= ZEIT_STUFE.ketten ? 1 : 0 };
}
// Licht-Richtung für Abend/Nacht aus der Sonne des Themas: gleiche Himmelsrichtung (+ sunAz), Höhe sunElev
export function zeitSonne(dir, L) {
  if (!L || L.sunElev == null) return [dir[0], dir[1], dir[2]];
  const az = Math.atan2(dir[2], dir[0]) + (L.sunAz || 0) * Math.PI / 180, el = L.sunElev * Math.PI / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
}
