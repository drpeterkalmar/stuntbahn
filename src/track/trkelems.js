// Elementtabelle für den .TRK-Import: jeder Byte-Code → Art, Belag, Ausrichtung, Händigkeit.
// Die Codes stammen aus der Formatdoku (wiki.stunts.hu/wiki/Track_file); Struktur und Abbildung auf
// unsere Bausteine sind eigene Arbeit. Alles als Daten: Tabelle CODES + Grundformen KINDS.
//
// Ausrichtung (dir) je Art – immer eine Himmelsrichtung E/N/W/S:
//  – gerade Elemente: Fahrtrichtung (beidseitig befahrbare nutzen nur E oder N)
//  – Rampen, Korkenzieher auf/ab: Richtung, in der es bergauf geht
//  – Übergänge (Start/Ziel, Röhren-/Autobahn-Anfang): Richtung beim Hineinfahren
//  – Steilstraße und ihre Übergänge: Richtung, in die die Überhöhung ansteigt (hohe Seite)
//  – Kurven: Quadrant des Bogens um seinen Mittelpunkt (E = Bogen nordöstlich → verbindet W und S,
//    N → S und E, W → N und E, S → W und N)
//  – Abzweige: Richtung der Geraden, wenn man von der gemeinsamen Seite einfährt
//  – Szenerie: Blickrichtung der Vorderseite
// Händigkeit (chir): R = im Uhrzeigersinn (Abzweig-Kurve rechts, Schikane erst nach rechts,
// Korkenzieher beim Hochfahren rechtsherum, Steilstraßen-Übergang mit hoher Seite links beim Einfahren).

export const E = 0, S = 1, W = 2, N = 3;          // wie DIRS in defs.js (Raster-y zeigt nach Süden)
const DIR = { E, S, W, N };
const P = 'paved', D = 'dirt', I = 'icy';

// [Code, Art, Belag, Ausrichtung, Händigkeit]
const TABLE = [
  // Start/Ziel (Fahrtrichtung)
  [0x01, 'sf', P, 'N'], [0xB3, 'sf', P, 'S'], [0xB4, 'sf', P, 'E'], [0xB5, 'sf', P, 'W'],
  [0x86, 'sf', D, 'N'], [0x87, 'sf', D, 'S'], [0x88, 'sf', D, 'E'], [0x89, 'sf', D, 'W'],
  [0x93, 'sf', I, 'N'], [0x94, 'sf', I, 'S'], [0x95, 'sf', I, 'E'], [0x96, 'sf', I, 'W'],
  // Straßen
  [0x04, 'road', P, 'N'], [0x05, 'road', P, 'E'], [0x0E, 'road', D, 'N'], [0x0F, 'road', D, 'E'],
  [0x18, 'road', I, 'N'], [0x19, 'road', I, 'E'],
  [0x4A, 'cross', P, 'E'], [0x7D, 'cross', D, 'E'], [0x8A, 'cross', I, 'E'],
  // Hochstraße
  [0x22, 'elev', P, 'N'], [0x23, 'elev', P, 'E'],
  [0x63, 'solid', P, 'N'], [0x64, 'solid', P, 'E'],
  [0x65, 'spanroad', P, 'N'], [0x66, 'spanroad', P, 'E'],
  [0x67, 'span', P, 'N'], [0x68, 'span', P, 'E'],
  [0x24, 'elramp', P, 'E'], [0x25, 'elramp', P, 'W'], [0x26, 'elramp', P, 'N'], [0x27, 'elramp', P, 'S'],
  [0x38, 'bramp', P, 'E'], [0x39, 'bramp', P, 'W'], [0x3A, 'bramp', P, 'N'], [0x3B, 'bramp', P, 'S'],
  [0x5F, 'sramp', P, 'E'], [0x60, 'sramp', P, 'W'], [0x61, 'sramp', P, 'N'], [0x62, 'sramp', P, 'S'],
  [0x69, 'elcorner', P, 'N'], [0x6A, 'elcorner', P, 'E'], [0x6B, 'elcorner', P, 'W'], [0x6C, 'elcorner', P, 'S'],
  // Stunts
  [0x40, 'loop', P, 'N'], [0x41, 'loop', P, 'E'],
  [0x55, 'corklr', P, 'N'], [0x56, 'corklr', P, 'E'],
  [0x75, 'corkud', P, 'N', 'R'], [0x76, 'corkud', P, 'W', 'R'], [0x77, 'corkud', P, 'S', 'R'], [0x78, 'corkud', P, 'E', 'R'],
  [0x79, 'corkud', P, 'N', 'L'], [0x7A, 'corkud', P, 'W', 'L'], [0x7B, 'corkud', P, 'S', 'L'], [0x7C, 'corkud', P, 'E', 'L'],
  [0x42, 'tunnel', P, 'N'], [0x43, 'tunnel', P, 'E'],
  [0x73, 'slalom', P, 'N'], [0x74, 'slalom', P, 'E'],
  [0x44, 'pipe', P, 'N'], [0x45, 'pipe', P, 'E'],
  [0x53, 'pobst', P, 'N'], [0x54, 'pobst', P, 'E'],
  [0x46, 'pipeT', P, 'N'], [0x47, 'pipeT', P, 'S'], [0x48, 'pipeT', P, 'W'], [0x49, 'pipeT', P, 'E'],
  [0x6D, 'hwy', P, 'N'], [0x6E, 'hwy', P, 'E'],
  [0x6F, 'hwyT', P, 'N'], [0x70, 'hwyT', P, 'E'], [0x71, 'hwyT', P, 'S'], [0x72, 'hwyT', P, 'W'],
  // Überhöhung (Steilstraße, Übergänge, Steilkurve)
  [0x30, 'bankR', P, 'W'], [0x31, 'bankR', P, 'E'], [0x32, 'bankR', P, 'N'], [0x33, 'bankR', P, 'S'],
  [0x28, 'bankT', P, 'W', 'R'], [0x29, 'bankT', P, 'N', 'R'], [0x2A, 'bankT', P, 'E', 'R'], [0x2B, 'bankT', P, 'S', 'R'],
  [0x2C, 'bankT', P, 'E', 'L'], [0x2D, 'bankT', P, 'S', 'L'], [0x2E, 'bankT', P, 'W', 'L'], [0x2F, 'bankT', P, 'N', 'L'],
  [0x34, 'bankC', P, 'N'], [0x35, 'bankC', P, 'E'], [0x36, 'bankC', P, 'W'], [0x37, 'bankC', P, 'S'],
  // Kurven (Quadrant des Bogens)
  [0x06, 'sharp', P, 'N'], [0x07, 'sharp', P, 'E'], [0x08, 'sharp', P, 'W'], [0x09, 'sharp', P, 'S'],
  [0x10, 'sharp', D, 'N'], [0x11, 'sharp', D, 'E'], [0x12, 'sharp', D, 'W'], [0x13, 'sharp', D, 'S'],
  [0x1A, 'sharp', I, 'N'], [0x1B, 'sharp', I, 'E'], [0x1C, 'sharp', I, 'W'], [0x1D, 'sharp', I, 'S'],
  [0x0A, 'large', P, 'N'], [0x0B, 'large', P, 'E'], [0x0C, 'large', P, 'W'], [0x0D, 'large', P, 'S'],
  [0x14, 'large', D, 'N'], [0x15, 'large', D, 'E'], [0x16, 'large', D, 'W'], [0x17, 'large', D, 'S'],
  [0x1E, 'large', I, 'N'], [0x1F, 'large', I, 'E'], [0x20, 'large', I, 'W'], [0x21, 'large', I, 'S'],
  // Schikanen
  [0x3C, 'chicane', P, 'N', 'R'], [0x3D, 'chicane', P, 'E', 'L'], [0x3E, 'chicane', P, 'N', 'L'], [0x3F, 'chicane', P, 'E', 'R'],
  // Abzweige (Richtung der Geraden bei Einfahrt von der gemeinsamen Seite)
  [0x4B, 'ssplit', P, 'N', 'L'], [0x4C, 'ssplit', P, 'W', 'L'], [0x4D, 'ssplit', P, 'S', 'L'], [0x4E, 'ssplit', P, 'E', 'L'],
  [0x4F, 'ssplit', P, 'N', 'R'], [0x50, 'ssplit', P, 'W', 'R'], [0x51, 'ssplit', P, 'S', 'R'], [0x52, 'ssplit', P, 'E', 'R'],
  [0x7E, 'ssplit', D, 'N', 'L'], [0x7F, 'ssplit', D, 'W', 'L'], [0x80, 'ssplit', D, 'S', 'L'], [0x81, 'ssplit', D, 'E', 'L'],
  [0x82, 'ssplit', D, 'N', 'R'], [0x83, 'ssplit', D, 'W', 'R'], [0x84, 'ssplit', D, 'S', 'R'], [0x85, 'ssplit', D, 'E', 'R'],
  [0x8B, 'ssplit', I, 'N', 'L'], [0x8C, 'ssplit', I, 'W', 'L'], [0x8D, 'ssplit', I, 'S', 'L'], [0x8E, 'ssplit', I, 'E', 'L'],
  [0x8F, 'ssplit', I, 'N', 'R'], [0x90, 'ssplit', I, 'W', 'R'], [0x91, 'ssplit', I, 'S', 'R'], [0x92, 'ssplit', I, 'E', 'R'],
  [0x57, 'lsplit', P, 'N', 'L'], [0x58, 'lsplit', P, 'W', 'L'], [0x59, 'lsplit', P, 'S', 'L'], [0x5A, 'lsplit', P, 'E', 'L'],
  [0x5B, 'lsplit', P, 'N', 'R'], [0x5C, 'lsplit', P, 'W', 'R'], [0x5D, 'lsplit', P, 'S', 'R'], [0x5E, 'lsplit', P, 'E', 'R'],
  // Szenerie (Blickrichtung der Vorderseite)
  [0x02, 'ghost', P, 'N'], [0x03, 'ghostop', P, 'N'],
  [0x97, 'palm', P, 'E'], [0x98, 'cactus', P, 'E'], [0x99, 'pine', P, 'E'], [0x9A, 'tennis', P, 'E'],
  [0x9B, 'gas', P, 'S'], [0x9C, 'gas', P, 'N'], [0x9D, 'gas', P, 'E'], [0x9E, 'gas', P, 'W'],
  [0x9F, 'barn', P, 'S'], [0xA0, 'barn', P, 'N'], [0xA1, 'barn', P, 'E'], [0xA2, 'barn', P, 'W'],
  [0xA3, 'office', P, 'S'], [0xA4, 'office', P, 'N'], [0xA5, 'office', P, 'E'], [0xA6, 'office', P, 'W'],
  [0xA7, 'windmill', P, 'S'], [0xA8, 'windmill', P, 'N'], [0xA9, 'windmill', P, 'E'], [0xAA, 'windmill', P, 'W'],
  [0xAB, 'ship', P, 'W'], [0xAC, 'ship', P, 'E'], [0xAD, 'ship', P, 'S'], [0xAE, 'ship', P, 'N'],
  [0xAF, 'diner', P, 'S'], [0xB0, 'diner', P, 'N'], [0xB1, 'diner', P, 'E'], [0xB2, 'diner', P, 'W'],
  // Füllfelder mehrteiliger Elemente (Lage im 2×2-Block)
  [0xFD, 'filler', P, 'E'], [0xFE, 'filler', P, 'E'], [0xFF, 'filler', P, 'E'],
];

// Grundformen in Normallage (Ausrichtung E, Händigkeit R), Raster x = Ost, y = Süd, Anker = NW-Feld.
// Wege (routes): Einfahrtsfeld `at`, Fahrtrichtung `d`, Baustein `t`, Spiegelung `m` (1 = rechts),
// Höhe relativ zum Gelände bei Einfahrt/Ausfahrt (h0/h1 in Ebenen), Spur `lane` (je Spur ein Befahren).
const R1 = (at, d, t, o = {}) => ({ at, d, t, m: 1, h0: 0, h1: 0, lane: 'a', ...o });
const lin = (t, o = {}) => ({ size: [1, 1], routes: [R1([0, 0], E, t, o), R1([0, 0], W, t, { ...o, rev: 1 })] });
const ramp = (sup) => ({ size: [1, 1], sup, routes: [R1([0, 0], E, 'tr_road', { h1: 1, sup }), R1([0, 0], W, 'tr_road', { h0: 1, sup, rev: 1 })] });
const corner = (t, o = {}) => ({ size: [2, 2], routes: [R1([0, 0], E, t, o), R1([1, 1], N, t, { ...o, m: -1, rev: 1 })] });

export const KINDS = {
  sf: { size: [1, 1], routes: [R1([0, 0], E, 'tr_sf'), R1([0, 0], W, 'tr_sf', { rev: 1 })] },
  road: lin('tr_road'),
  tunnel: lin('tr_road', { deco: 'tunnel' }),
  slalom: lin('tr_road', { deco: 'slalom' }),
  pipe: lin('tr_pipe'),
  pobst: lin('tr_pipe', { obst: 1 }),
  hwy: lin('tr_hwy'),
  elev: lin('tr_road', { h0: 1, h1: 1, sup: 'pillars' }),
  solid: lin('tr_road', { h0: 1, h1: 1, sup: 'solid' }),
  span: lin('tr_road', { h0: 1, h1: 1, sup: 'span' }),
  pipeT: { size: [1, 1], routes: [R1([0, 0], E, 'tr_pipeT', { into: 1 }), R1([0, 0], W, 'tr_pipeT', { into: 0, rev: 1 })] },
  hwyT: { size: [1, 1], routes: [R1([0, 0], E, 'tr_hwyT', { into: 1 }), R1([0, 0], W, 'tr_hwyT', { into: 0, rev: 1 })] },
  elramp: ramp('pillars'),
  bramp: ramp('truss'),
  sramp: ramp('solid'),
  cross: { size: [1, 1], routes: [R1([0, 0], E, 'tr_road', { cross: 1 }), R1([0, 0], W, 'tr_road', { cross: 1, rev: 1 }), R1([0, 0], S, 'tr_road', { cross: 1, lane: 'b' }), R1([0, 0], N, 'tr_road', { cross: 1, lane: 'b', rev: 1 })] },
  spanroad: { size: [1, 1], routes: [R1([0, 0], E, 'tr_road', { h0: 1, h1: 1, sup: 'span', over: 1 }), R1([0, 0], W, 'tr_road', { h0: 1, h1: 1, sup: 'span', over: 1, rev: 1 }), R1([0, 0], S, 'tr_road', { lane: 'b', under: 1 }), R1([0, 0], N, 'tr_road', { lane: 'b', under: 1, rev: 1 })] },
  loop: { size: [2, 1], routes: [R1([0, 0], E, 'tr_loop'), R1([1, 0], W, 'tr_loop', { rev: 1 })] },
  corklr: { size: [2, 1], routes: [R1([0, 0], E, 'tr_corklr'), R1([1, 0], W, 'tr_corklr', { rev: 1 })] },
  // Wendel: Gerade in der Nordreihe, Kreis südlich (rechts beim Hochfahren nach Osten)
  corkud: { size: [2, 2], routes: [R1([0, 0], E, 'tr_corkud', { h1: 1 }), R1([1, 0], W, 'tr_corkud', { m: -1, h0: 1, rev: 1 })] },
  // Steilstraße: Straße Nord–Süd, hohe Seite Ost
  bankR: { size: [1, 1], routes: [R1([0, 0], N, 'tr_bank', { side: 1, b0: 1, b1: 1 }), R1([0, 0], S, 'tr_bank', { side: -1, b0: 1, b1: 1, rev: 1 })] },
  // Übergang: Straße Nord–Süd, hohe Seite Ost, überhöhtes Ende im Süden
  bankT: { size: [1, 1], routes: [R1([0, 0], S, 'tr_bank', { side: -1, b0: 0, b1: 1 }), R1([0, 0], N, 'tr_bank', { side: 1, b0: 1, b1: 0, rev: 1 })] },
  // Kurven in Normallage verbinden W und S (Bogen um die SW-Ecke)
  sharp: { size: [1, 1], routes: [R1([0, 0], E, 'tr_sharp'), R1([0, 0], N, 'tr_sharp', { m: -1, rev: 1 })] },
  large: corner('tr_large'),
  bankC: corner('tr_bankC'),
  elcorner: corner('tr_large', { h0: 1, h1: 1, sup: 'pillars' }),
  // Schikane: Einfahrt NW nach Osten, Ausfahrt SE (Versatz nach rechts); rückwärts ebenfalls rechts-links
  chicane: { size: [2, 2], routes: [R1([0, 0], E, 'tr_chicane'), R1([1, 1], W, 'tr_chicane', { rev: 1 })] },
  // Abzweig klein: Gerade W→E, Kurve W→S (rechts)
  ssplit: { size: [1, 1], routes: [R1([0, 0], E, 'tr_road'), R1([0, 0], W, 'tr_road', { rev: 1 }), R1([0, 0], E, 'tr_sharp', { lane: 'b' }), R1([0, 0], N, 'tr_sharp', { lane: 'b', m: -1, rev: 1 })] },
  // Abzweig groß: Gerade in der Nordreihe W→E, große Kurve NW→SE (rechts)
  lsplit: { size: [2, 2], routes: [R1([0, 0], E, 'tr_road2'), R1([1, 0], W, 'tr_road2', { rev: 1 }), R1([0, 0], E, 'tr_large', { lane: 'b' }), R1([1, 1], N, 'tr_large', { lane: 'b', m: -1, rev: 1 })] },
  // Szenerie und Sonstiges (keine Wege)
  ghost: { size: [1, 1], scenery: 1 }, ghostop: { size: [1, 1], scenery: 1 },
  palm: { size: [1, 1], scenery: 1 }, cactus: { size: [1, 1], scenery: 1 }, pine: { size: [1, 1], scenery: 1 },
  tennis: { size: [1, 1], scenery: 1 }, gas: { size: [1, 1], scenery: 1 }, barn: { size: [1, 1], scenery: 1 },
  office: { size: [1, 1], scenery: 1 }, windmill: { size: [1, 1], scenery: 1 }, ship: { size: [1, 1], scenery: 1 },
  diner: { size: [1, 1], scenery: 1 },
  filler: { size: [1, 1], filler: 1 },
};
// Größen: 2×1 = Looping, Korkenzieher l/r; 2×2 = große Kurven, Steilkurve, Hochstraßen-Kurve, Schikane,
// großer Abzweig, Korkenzieher auf/ab; alles andere 1×1 (empirisch an 3600 Archiv-Strecken bestätigt).

// Deutsche Namen (Liste der importierten Elemente, Fehlermeldungen)
export const KIND_NAMES = {
  sf: 'Start/Ziel', road: 'Straße', cross: 'Kreuzung', tunnel: 'Tunnel', slalom: 'Slalom', pipe: 'Röhre',
  pobst: 'Röhre mit Hindernis', pipeT: 'Röhren-Einfahrt', hwy: 'Autobahn', hwyT: 'Autobahn-Anfang', elev: 'Hochstraße',
  solid: 'Hochstraße (Damm)', span: 'Brückenfeld', spanroad: 'Überführung', elramp: 'Hochstraßen-Rampe', bramp: 'Brückenrampe',
  sramp: 'Dammrampe', elcorner: 'Hochstraßen-Kurve', loop: 'Looping', corklr: 'Korkenzieher (Rolle)',
  corkud: 'Korkenzieher (Wendel)', bankR: 'Steilstraße', bankT: 'Steilstraßen-Übergang', bankC: 'Steilkurve',
  sharp: 'Kurve eng', large: 'Kurve weit', chicane: 'Schikane', ssplit: 'Abzweig', lsplit: 'Abzweig groß',
  ghost: 'Geisterauto', ghostop: 'Gegner-Auto', palm: 'Palme', cactus: 'Kaktus', pine: 'Tanne', tennis: 'Tennisplatz',
  gas: 'Tankstelle', barn: 'Scheune', office: 'Bürohaus', windmill: 'Windmühle', ship: 'Schiff', diner: 'Imbiss', filler: 'Füllfeld',
};

// Gelände: Höhen der Feldecken [NW, NE, SW, SE] in Ebenen; Wasser-Ecken (true = im Wasser)
export const TERRAIN = [
  { name: 'Ebene', c: [0, 0, 0, 0] },
  { name: 'Wasser', c: [0, 0, 0, 0], water: [1, 1, 1, 1] },
  { name: 'Ufer SW', c: [0, 0, 0, 0], water: [0, 0, 1, 0] },
  { name: 'Ufer SE', c: [0, 0, 0, 0], water: [0, 0, 0, 1] },
  { name: 'Ufer NE', c: [0, 0, 0, 0], water: [0, 1, 0, 0] },
  { name: 'Ufer NW', c: [0, 0, 0, 0], water: [1, 0, 0, 0] },
  { name: 'Hügel', c: [1, 1, 1, 1] },
  { name: 'Hang nach N', c: [1, 1, 0, 0] },
  { name: 'Hang nach W', c: [1, 0, 1, 0] },
  { name: 'Hang nach S', c: [0, 0, 1, 1] },
  { name: 'Hang nach E', c: [0, 1, 0, 1] },
  { name: 'Kuppe NW', c: [1, 0, 0, 0] },
  { name: 'Kuppe SW', c: [0, 0, 1, 0] },
  { name: 'Kuppe SE', c: [0, 0, 0, 1] },
  { name: 'Kuppe NE', c: [0, 1, 0, 0] },
  { name: 'Mulde SE', c: [1, 1, 1, 0] },
  { name: 'Mulde NE', c: [1, 0, 1, 1] },
  { name: 'Mulde NW', c: [0, 1, 1, 1] },
  { name: 'Mulde SW', c: [1, 1, 0, 1] },
];

// ---------- Tabelle aufbereiten ----------
export const CODES = new Map();
for (const [code, kind, surf, dir, chir] of TABLE) {
  if (CODES.has(code)) throw new Error('Code doppelt: ' + code);
  if (!KINDS[kind]) throw new Error('Unbekannte Art ' + kind);
  CODES.set(code, { code, kind, surf, dir: DIR[dir], rot: [0, 3, 2, 1][DIR[dir]], chir: chir === 'L' ? -1 : 1 });
}
export const TRACK_CODES = [...CODES.values()].filter((e) => KINDS[e.kind].routes).map((e) => e.code);
export const SCENERY_CODES = [...CODES.values()].filter((e) => KINDS[e.kind].scenery && e.kind !== 'ghost' && e.kind !== 'ghostop').map((e) => e.code);

// Punkt/Richtung aus der Normallage transformieren: erst spiegeln (Händigkeit L), dann gegen den
// Uhrzeigersinn drehen (rot Vierteldrehungen: E → N → W → S).
function tCell(x, y, rot, chir) {
  if (chir < 0) y = -y;
  for (let k = 0; k < rot; k++) { const t = x; x = y; y = -t; }
  return [x, y];
}
function tDir(d, rot, chir) {
  if (chir < 0) d = (4 - d) % 4;
  return (d + 3 * rot) % 4;
}

// Element an Rasterposition (i, j) (= NW-Anker) → belegte Felder + Wege in Weltlage
export function placeElement(code, i, j) {
  const e = CODES.get(code);
  if (!e) return null;
  const K = KINDS[e.kind];
  const [sx, sy] = K.size;
  const raw = [];
  for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) raw.push(tCell(x, y, e.rot, e.chir));
  const mx = Math.min(...raw.map((c) => c[0])), my = Math.min(...raw.map((c) => c[1]));
  const cells = raw.map(([x, y]) => [i + x - mx, j + y - my]);
  const routes = (K.routes || []).map((r, k) => {
    const [x, y] = tCell(r.at[0], r.at[1], e.rot, e.chir);
    const out = { ...r, k, i: i + x - mx, j: j + y - my, d: tDir(r.d, e.rot, e.chir), m: r.m * e.chir, surf: e.surf };
    if (r.side) out.side = r.side * e.chir;
    delete out.at;
    return out;
  });
  return { code, kind: e.kind, surf: e.surf, rot: e.rot, chir: e.chir, facing: tDir(E, e.rot, e.chir), cells, routes, i, j };
}
