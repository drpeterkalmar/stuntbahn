// Wetter (n32, Peter 08.10.2026: „Regen- und Schneewetter (fürs Erste nur Kosmetik)“) – rein rechnend (Node-testbar).
// Wetter bestimmt nur, WIE eine Strecke aussieht (Himmel, Licht, Nebel, nasse/verschneite Flächen, Teilchen, Gischt,
// Regengeräusch) – nie Grip, Physik, Autopilot, Strecke oder Bestzeit-Schlüssel. Es wertet nicht extra (kein A/B-Zusatz).
// Auswahl: Einstellung „Wetter“ = 'auto' (Passend) oder fest 'klar' | 'regen' | 'schnee'; URL ?wetter= hat Vorrang.
// Passend: meist klar, gelegentlich Regen/Schnee – deterministisch aus Strecke (Seed/Schlüssel) und Landschafts-Thema;
// Schnee nur in Alpen, Winter und Herbst (Spätherbst), nie in Wüste oder Küste/Tropen.
// „Klar“ = genau das Aussehen bis n31 (auch der leichte Schneefall des Winter-Themas bleibt): Grundlage für A/B.

export const WETTER = {
  klar: { name: 'Klar', icon: '☀️', desc: 'wie bisher: Sonne, Himmel des Themas' },
  regen: { name: 'Regen', icon: '🌧️', desc: 'dunkler Himmel, nasse Fahrbahn, Gischt' },
  schnee: { name: 'Schnee', icon: '🌨️', desc: 'Schneefall, verschneite Landschaft, kühles Licht' },
};
export const WETTER_IDS = Object.keys(WETTER);
// Werte der Einstellung (Menü „🌦️ Wetter“)
export const WETTER_WAHL = ['auto', ...WETTER_IDS];

// Wahrscheinlichkeit je Thema bei „Passend“ (Rest = klar). Schnee nie in Wüste/Küste; Winter meist Schnee (sein Bild
// hat ohnehin Schnee), Herbst selten Schnee (Spätform).
export const WETTER_CHANCE = {
  land: { regen: 0.18 },
  wueste: { regen: 0.05 },
  alpen: { regen: 0.12, schnee: 0.12 },
  kueste: { regen: 0.15 },
  stadt: { regen: 0.2 },
  herbst: { regen: 0.22, schnee: 0.07 },
  winter: { schnee: 0.6 },
};
export const SCHNEE_ERLAUBT = new Set(Object.keys(WETTER_CHANCE).filter((id) => WETTER_CHANCE[id].schnee > 0));

// URL-/Einstellungswert normieren: 'klar' | 'regen' | 'schnee' | 'auto' | null (ungültig/leer)
const ALIAS = { passend: 'auto', auto: 'auto', klar: 'klar', sonne: 'klar', clear: 'klar', regen: 'regen', rain: 'regen', schnee: 'schnee', snow: 'schnee' };
export function parseWetter(v) {
  if (v == null) return null;
  return ALIAS[String(v).trim().toLowerCase()] || null;
}

export function hash32(...a) {
  let h = 0x811c9dc5;
  for (const v of a) { h = Math.imul(h ^ (v >>> 0), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return h >>> 0;
}
export function strHash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }

// Kennzahl der Strecke für den Würfel: Seed (generiert) bzw. Schlüssel (.TRK, Sammlung, Demo)
export function streckenZahl(layout) {
  const m = (layout && layout.meta) || {};
  if (m.key && !(m.seed ?? layout?.seed)) return strHash(String(m.key));
  const seed = m.seed ?? layout?.seed ?? 1, diff = m.diff ?? layout?.diff ?? 2;
  const mode = m.gel || layout?.gel ? 2 : m.d3 || layout?.d3 ? 1 : 0;
  return hash32(seed, diff * 31 + mode);
}

// Passendes Wetter: deterministisch aus Strecke und Thema (unabhängig von allem Zufall des Spiels)
export function wetterAuto(layout, themeId) {
  const C = WETTER_CHANCE[themeId] || WETTER_CHANCE.land;
  const x = hash32(streckenZahl(layout), strHash(themeId || 'land'), 0x5e77e2) / 4294967296;
  const r = C.regen || 0, s = C.schnee || 0;
  return x < s ? 'schnee' : x < s + r ? 'regen' : 'klar';
}
// URL ?wetter= > Einstellung > passend. Eine feste Wahl gilt auch dort, wo „Passend“ nie Schnee würfelt (Wunsch des Spielers).
export function wetterFor(layout, themeId, setting = 'auto', url = null) {
  const u = parseWetter(url);
  if (u && u !== 'auto') return u;
  const s = parseWetter(setting);
  if (s && s !== 'auto') return s;
  return wetterAuto(layout, themeId);
}

// ---------- Aussehen je Wetter (Startwerte; TODO n32-Heavy: am Bild abstimmen) ----------
// Faktoren auf die Werte des Themas (1 = unverändert), Mischanteile 0 … 1.
//  fog: Nebel-Reichweite (near/far × k), sun/env: Sonnen-/Umgebungslicht × k, shadow: Schattenkontrast (Sonne flacher),
//  skyDark/skyDesat: Himmelsbild abdunkeln/entsättigen, clouds: Wolkendecke (k Bedeckung, soft, dark × Schattenfarbe),
//  haze: Dunstfarbe (Nebel/Kino-Look) dorthin mischen (hazeK), sunTint: Sonnenfarbe (kühler/grauer),
//  wet: Nässe der Fahrbahn/Flächen, puddles: Pfützen-Anteil, snow: Schneedecke (Gelände, Bäume, Dächer), slush: Matsch/
//  Schneewälle am Fahrbahnrand, spray: Gischt hinter den Reifen (ab sprayKmh), steam: Atem-/Auspuffdampf, glass: Tropfen
//  auf der Scheibe (Cockpit-/Stoßstangen-Kamera), rain: Lautstärke Regengeräusch, tracks: helle Reifenspuren im Schnee.
const NEUTRAL = Object.freeze({
  id: 'klar', fog: 1, sun: 1, env: 1, shadow: 1, skyDark: 0, skyDesat: 0, clouds: null, haze: null, hazeK: 0, sunTint: null,
  wet: 0, puddles: 0, snow: 0, slush: 0, spray: 0, sprayKmh: 60, steam: 0, glass: 0, rain: 0, tracks: 0, air: null,
});
export const WETTER_LOOK = {
  klar: NEUTRAL,
  regen: {
    ...NEUTRAL, id: 'regen', fog: 0.5, sun: 0.32, env: 0.78, shadow: 0.35, skyDark: 0.5, skyDesat: 0.55,
    clouds: { k: 0.86, soft: 0.42, dark: 0.62 }, haze: [0.6, 0.63, 0.67], hazeK: 0.7, sunTint: [0.86, 0.9, 0.96],
    wet: 1, puddles: 0.8, spray: 1, glass: 1, rain: 1,
  },
  schnee: {
    ...NEUTRAL, id: 'schnee', fog: 0.42, sun: 0.45, env: 0.92, shadow: 0.45, skyDark: 0.18, skyDesat: 0.7,
    clouds: { k: 0.8, soft: 0.5, dark: 0.85 }, haze: [0.8, 0.83, 0.88], hazeK: 0.75, sunTint: [0.88, 0.93, 1.0],
    wet: 0.45, puddles: 0.15, snow: 1, slush: 1, spray: 0.45, steam: 1, glass: 0.35, rain: 0, tracks: 1,
  },
};

// Teilchen in der Luft je Wetter (Format wie AIR in gfx/deko.js; null = die Luft des Themas). kind 4 = Regenstreifen
// (n32, neue Art „Streifen“: senkrecht fallend, in Fall- und Fahrtrichtung gestreckt = Bewegungsunschärfe).
export const WETTER_AIR = {
  regen: { kind: 4, n: 3000, size: 0.026, fall: 9.5, sway: 0.05, wind: 1.1, spin: 0, box: 40, h: 14, c0: [0.8, 0.83, 0.88], c1: [0.95, 0.97, 1.0], a: 0.72 },
  schnee: { kind: 0, n: 1500, size: 0.11, fall: 1.0, sway: 0.6, wind: 0.9, spin: 0, box: 22, h: 12, c0: [0.95, 0.97, 1.0], c1: [1.0, 1.0, 1.0], a: 0.92 },
};
// Anteil der Teilchen je Grafikstufe (Einfach wenig, Standard 60 %, Kino alle) und „Bewegung reduzieren“
export const WETTER_TEILCHEN = [0.12, 0.6, 1];   // n32 Heavy: Einfach 12 % (Regen 360, Schnee 180)
export function wetterTeilchen(w, tier, reduced = false) {
  const A = WETTER_AIR[w];
  if (!A) return 0;
  const k = (WETTER_TEILCHEN[tier] ?? 1) * (reduced ? 0.3 : 1);
  return Math.round(A.n * k);
}
// Spiegelung der nassen Fahrbahn (Pfützen spiegeln Himmel/Lichter über die Umgebungskarte): erst ab Standard;
// Einfach nur dunkler/glänzender. Gischt ab Standard, Scheibentropfen ab Standard.
export const WETTER_STUFE = { spiegel: 1, gischt: 1, scheibe: 1, dampf: 1 };

// Aussehen für Wetter, Thema und Grafikstufe (alle Zahlen fertig für die Grafik; Thema für Sonderfälle)
export function wetterLook(w, themeId = 'land', tier = 2) {
  const L = WETTER_LOOK[w] || NEUTRAL;
  if (L === NEUTRAL) return NEUTRAL;
  const o = { ...L, air: WETTER_AIR[w] || null };
  // Winter hat schon Schnee am Boden (Thema): Schnee-Wetter verstärkt nur Fall, Wolken, Licht
  if (w === 'schnee' && themeId === 'winter') o.fog = 0.55;
  // n32 Heavy (Bild): Themen mit schon dichtem Dunst (Winter, Herbst) liefen bei Regen/Schnee ins Weiße → weniger Nebel dazu
  if (themeId === 'winter') o.fog = Math.max(o.fog, 0.8);
  if (themeId === 'herbst') o.fog = Math.max(o.fog, 0.72);
  // Wüste: Regen kurz und hell (kein Dauergrau), Sand wird nur dunkler
  if (w === 'regen' && themeId === 'wueste') { o.skyDark = 0.25; o.sun = 0.5; o.puddles = 0.3; }
  if (tier < WETTER_STUFE.spiegel) o.puddles = 0;
  if (tier < WETTER_STUFE.gischt) o.spray = 0;
  if (tier < WETTER_STUFE.scheibe) o.glass = 0;
  if (tier < WETTER_STUFE.dampf) o.steam = 0;
  return o;
}
