// Wetter (n32): ohne Browser geprüft.
//  1) Auswahl: ?wetter= > Einstellung > passend; Passend deterministisch, Häufigkeiten je Thema, nie Schnee in Wüste/Küste,
//     feste Wahl gilt überall; Einstellung „wetter“ im Speicher (Standard 'auto').
//  2) Nur Kosmetik: Bau der Strecke hängt nicht am Wetter (gleiche Hashes für alle Wetter, Fahrbahn/Kollision/Gelände/
//     Bäume), ?wetter= ist kein A/B-Zusatz (wertet), Bestzeit-Schlüssel ohne Wetter.
//  3) Aussehen: „Klar“ = neutral; Regen/Schnee → Grafik-Werte im Rahmen; Wechsel Regen → Klar stellt Licht, Nebel, Himmel,
//     Wolken, Kino-Look und Flächen-Uniforms EXAKT auf die Werte des Themas zurück (Attrappe des Themen-Kontexts).
//  4) Teilchen: Regenstreifen (kind 4) und Schnee je Stufe, Grenzen (AIR_MAX), Einfach wenige; „Klar“ = Luft des Themas wie bis n31.
//  5) Shader-Anschlüsse: Anker der Ersetzungen existieren in three.js r186, Schnee-Patch fügt Code ein, Wetter-Zweige hängen an
//     Uniforms (0 = übersprungen), Klammern ausgeglichen.
//  6) Regengeräusch: nahtloser Loop, endlich, begrenzt.
import './three_haken.mjs';
import crypto from 'crypto';
const THREE = await import('three');
const W = await import('../../src/track/wetter.js');
const { generate } = await import('../../src/track/generator.js');
const { buildTrack } = await import('../../src/track/build.js');
const { THEME_IDS } = await import('../../src/track/themes.js');
const { abMode, modeKey } = await import('../../src/game/store.js');

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL ' + m); } };

// ---------- 1) Auswahl ----------
ok(W.parseWetter('Regen') === 'regen' && W.parseWetter('snow') === 'schnee' && W.parseWetter('passend') === 'auto' && W.parseWetter('x') === null && W.parseWetter(null) === null, 'parseWetter');
const lay = (seed, diff = 2, gel = true) => ({ meta: { seed, diff, gel, key: `${seed}-${diff}${gel ? '-g' : ''}` } });
ok(W.wetterFor(lay(5), 'wueste', 'auto', 'schnee') === 'schnee', 'URL hat Vorrang (auch Schnee in der Wüste, wenn ausdrücklich gewählt)');
ok(W.wetterFor(lay(5), 'land', 'regen', null) === 'regen', 'Einstellung fest');
ok(W.wetterFor(lay(5), 'land', 'regen', 'klar') === 'klar', 'URL vor Einstellung');
ok(W.wetterFor(lay(5), 'land', 'regen', 'auto') === 'regen', '?wetter=auto lässt die Einstellung gelten');
ok(W.wetterFor(lay(5), 'land', 'auto', 'quatsch') === W.wetterAuto(lay(5), 'land'), 'ungültige URL → passend');
const N = 6000, freq = {};
for (const th of THEME_IDS) {
  const f = freq[th] = { klar: 0, regen: 0, schnee: 0 };
  for (let s = 1; s <= N; s++) f[W.wetterAuto(lay(s * 7 + 3, 1 + (s % 3), s % 2 === 0), th)]++;
  const C = W.WETTER_CHANCE[th];
  for (const w of ['regen', 'schnee']) ok(Math.abs(f[w] / N - (C[w] || 0)) < 0.025, `${th}: Anteil ${w} ${(f[w] / N).toFixed(3)} ≈ ${C[w] || 0}`);
  ok(f.klar / N > 0.35, `${th}: meist klar oder (Winter) Schnee`);
  if (th === 'wueste' || th === 'kueste' || th === 'land' || th === 'stadt') ok(f.schnee === 0, `${th}: Passend würfelt nie Schnee`);
}
ok(freq.winter.regen === 0 && freq.winter.schnee > freq.winter.klar, 'Winter: kein Regen, meist Schnee');
ok(W.wetterAuto(lay(4711), 'alpen') === W.wetterAuto(lay(4711), 'alpen'), 'Passend deterministisch');
// .TRK/Sammlung ohne Seed: aus dem Schlüssel
ok(['klar', 'regen', 'schnee'].includes(W.wetterAuto({ meta: { key: 'trk-abc' } }, 'land')), 'Strecke ohne Seed (Schlüssel)');
// Einstellung im Speicher, Standard 'auto'
{
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: (i) => [...mem.keys()][i], get length() { return mem.size; } };
  const { Store } = await import('../../src/game/store.js');
  const st = new Store();
  ok(st.settings.wetter === 'auto', 'Einstellung Wetter: Standard „Passend“');
  st.settings.wetter = 'schnee'; st.save();
  ok(new Store().settings.wetter === 'schnee', 'Einstellung Wetter bleibt gespeichert (gilt beim nächsten Start)');
}

// ---------- 2) Nur Kosmetik ----------
for (const q of ['?wetter=regen', '?wetter=schnee', '?wetter=klar', '?wetter=auto']) ok(abMode(q) === false, `${q} ist kein A/B-Zusatz (wertet)`);
ok(!/wetter|regen|schnee/.test(modeKey('medium', false, true)), 'Bestzeit-Schlüssel ohne Wetter');
function hashTrack(t) {
  const H = crypto.createHash('sha1'), L = t.line;
  for (const k of ['px', 'py', 'pz', 'tx', 'ty', 'tz', 'bx', 'by', 'bz', 'hw', 'air', 'loop']) H.update(Buffer.from(L[k].buffer));
  for (const b of t.batches) { H.update(Buffer.from(b.pos.buffer)); H.update(Buffer.from(b.idx.buffer)); }
  H.update(Buffer.from(t.col.pos.buffer)); H.update(Buffer.from(t.terrain.H.buffer)); H.update(JSON.stringify(t.trees));
  return H.digest('hex');
}
// Der Bau bekommt kein Wetter: auch wenn Einstellung/URL gesetzt sind, ist jede Strecke byte-gleich (Wetter liegt nur in der Grafik)
for (const [s, d, o] of [[4711, 2, { gel: true }], [25, 3, {}], [1038, 1, { d3: true }]]) {
  const h0 = hashTrack(buildTrack(generate(s, d, o)));
  for (const w of W.WETTER_IDS) { globalThis.location = { search: '?wetter=' + w }; ok(hashTrack(buildTrack(generate(s, d, o))) === h0, `${s}-${d}: Bau mit ?wetter=${w} byte-gleich`); }
  delete globalThis.location;
}

// ---------- 3) Aussehen ----------
const K = W.wetterLook('klar', 'land', 2);
ok(K.fog === 1 && K.sun === 1 && K.env === 1 && K.wet === 0 && K.snow === 0 && K.spray === 0 && K.glass === 0 && K.rain === 0 && K.air === null && K.clouds === null, '„Klar“ = neutral');
for (const w of ['regen', 'schnee']) for (const th of THEME_IDS) for (const tier of [0, 1, 2]) {
  const L = W.wetterLook(w, th, tier);
  const in01 = ['skyDark', 'skyDesat', 'hazeK', 'wet', 'puddles', 'snow', 'slush', 'spray', 'steam', 'glass', 'rain', 'tracks'].every((k) => L[k] >= 0 && L[k] <= 1);
  ok(in01 && L.fog > 0.2 && L.fog <= 1 && L.sun > 0.2 && L.sun <= 1 && L.env > 0.5 && L.env <= 1, `${w}/${th}/${tier}: Werte im Rahmen`);
  if (tier === 0) ok(L.puddles === 0 && L.spray === 0 && L.glass === 0, `${w}/${th}: Einfach ohne Spiegelung/Gischt/Scheibe`);
  ok(L.air && (L.air.kind === 4) === (w === 'regen'), `${w}/${th}/${tier}: Teilchen-Art`);
}
ok(W.wetterLook('regen', 'land', 2).wet === 1 && W.wetterLook('regen', 'land', 2).rain > 0, 'Regen: nass + Geräusch');
ok(W.wetterLook('schnee', 'alpen', 2).snow === 1 && W.wetterLook('schnee', 'alpen', 2).slush === 1 && W.wetterLook('schnee', 'alpen', 2).rain === 0, 'Schnee: Decke + Matsch, kein Regengeräusch');

// Attrappe des Themen-Kontexts → Regen, Schnee, zurück auf Klar: alles exakt wie vorher
{
  const { merkeBasis, wendeWetterAn, wetterUniforms, WETTER_GRADES, meldeWetterGrades } = await import('../../src/gfx/wetter.js');
  const { cloudUniforms } = await import('../../src/gfx/deko.js');
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xbdc1cc, 260, 1500); scene.environmentIntensity = 1.8;
  const U = { horizon: { value: new THREE.Color(0.7, 0.75, 0.8) }, wSky: { value: new THREE.Vector2(1, 0) }, ...cloudUniforms(new THREE.Vector3(0.3, 0.7, 0.3)) };
  U.cK.value = 0.47; U.cSoft.value = 0.13; U.cDark.value.setRGB(0.4, 0.45, 0.5);
  const sky = { material: { uniforms: U } }, sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  const kino = { grade: 'alpen', hazeCol: new THREE.Color(0.72, 0.8, 0.9), sunCol: new THREE.Color(1, 0.95, 0.9), aerial: { density: 0.0003, falloff: 0.012, base: 0, max: 0.34 } };
  const themeUniforms = { tTreeSnow: { value: 0 } };
  const c = { scene, sky, sun, kino, themeUniforms };
  const snap = () => JSON.stringify({ f: [scene.fog.near, scene.fog.far, scene.fog.color.toArray()], s: [sun.intensity, sun.color.toArray()], e: scene.environmentIntensity, h: U.horizon.value.toArray(), w: U.wSky.value.toArray(),
    c: [U.cK.value, U.cSoft.value, U.cSc.value, U.cSp.value, U.cDark.value.toArray()], k: [kino.grade, kino.hazeCol.toArray(), kino.sunCol.toArray(), kino.aerial], u: Object.values(wetterUniforms).map((x) => x.value), t: themeUniforms.tTreeSnow.value });
  const B = merkeBasis(c), s0 = snap();
  const GR = {}; meldeWetterGrades(GR);
  ok(GR.wetter_regen === WETTER_GRADES.regen && GR.wetter_schnee === WETTER_GRADES.schnee, 'Farbkorrekturen angemeldet');
  wendeWetterAn(c, B, 'regen', 'alpen', 2);
  ok(scene.fog.far < B.fogFar && sun.intensity < B.sunI && U.wSky.value.x < 1 && U.cK.value > 0.8 && wetterUniforms.wWet.value === 1 && wetterUniforms.wPud.value > 0 && kino.grade === 'wetter_regen', 'Regen: Nebel dichter, Licht flacher, Himmel dunkler, Wolkendecke, nass');
  wendeWetterAn(c, B, 'schnee', 'alpen', 2);
  ok(wetterUniforms.wSnow.value === 1 && themeUniforms.tTreeSnow.value === 1 && wetterUniforms.wWet.value < 1 && kino.grade === 'wetter_schnee', 'Schnee: Decke, Bäume verschneit');
  wendeWetterAn(c, B, 'klar', 'alpen', 2, { treeSnow: 0 });
  ok(snap() === s0, 'zurück auf Klar: alle Werte exakt wie das Thema');
  // Thema ohne eigene Wolken (Land/Winter, cK = 0): Regen bringt eine Decke, Klar nimmt sie wieder weg
  U.cK.value = 0; const B2 = merkeBasis(c), s2 = snap();
  wendeWetterAn(c, B2, 'regen', 'land', 1); ok(U.cK.value > 0.8 && U.cSc.value > 0, 'Land: Regenwolken trotz Himmelsbild ohne Zusatzwolken');
  wendeWetterAn(c, B2, 'klar', 'land', 1); ok(snap() === s2, 'Land: zurück auf Klar exakt');
}

// ---------- 4) Teilchen ----------
{
  globalThis.matchMedia = () => ({ matches: false });
  const { AirMotes, AIR } = await import('../../src/gfx/deko.js');
  const sc = new THREE.Scene(), a = new AirMotes(sc), n = () => a.mesh.geometry.instanceCount;
  a.set('land', 2, null); ok(n() === AIR.land.n && a.u.uKind.value === AIR.land.kind, 'klar/Land wie bis n31 (Pollen 220)');
  a.set('winter', 1, null); ok(n() === Math.round(AIR.winter.n * 0.7) && a.u.uKind.value === 0, 'klar/Winter wie bis n31');
  a.set('land', 0, null); ok(n() === 0, 'klar/Einfach: keine Luft-Teilchen (wie bis n31)');
  a.set('land', 2, null, 'regen'); ok(a.u.uKind.value === 4 && n() === W.WETTER_AIR.regen.n && a.mat.blending === THREE.NormalBlending, 'Regen/Kino: Streifen, volle Menge');
  a.set('land', 0, null, 'regen'); ok(n() > 0 && n() < 400, `Regen/Einfach: wenige (${n()})`);
  a.set('land', 1, null, 'regen', true); ok(n() === Math.round(W.wetterTeilchen('regen', 1) * 0.5), 'Regen/„Deko sparsam“: halbiert');
  a.set('kueste', 2, null, 'schnee'); ok(a.u.uKind.value === 0 && n() === W.WETTER_AIR.schnee.n, 'Schnee/Kino');
  a.set('kueste', 2, null, 'klar'); ok(a.u.uKind.value === AIR.kueste.kind && n() === AIR.kueste.n && a.wetter === null, 'zurück auf klar: Luft des Themas');
  for (const w of ['regen', 'schnee']) for (const t of [0, 1, 2]) ok(W.wetterTeilchen(w, t) <= 1600, `${w}/${t}: ≤ AIR_MAX`);
  const vs = a.mat.vertexShader;
  ok(/uKind > 3\.5/.test(vs) && /uCamVel/.test(vs) && /uStreak/.test(vs) && /return;/.test(vs), 'Regenstreifen im Vertex-Shader (Kamera-Bewegung, Belichtungszeit)');
}

// ---------- 5) Shader-Anschlüsse ----------
{
  const SL = THREE.ShaderLib;
  for (const [lib, anchors] of [['physical', ['#include <map_fragment>', '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>', '#include <emissivemap_fragment>', '#include <common>']], ['lambert', ['#include <emissivemap_fragment>', '#include <common>']], ['phong', ['#include <emissivemap_fragment>']]])
    for (const a of anchors) ok(SL[lib].fragmentShader.includes(a), `three r${THREE.REVISION} ${lib}: Anker ${a}`);
  ok(THREE.ShaderChunk.normal_fragment_begin.includes('nonPerturbedNormal'), 'nonPerturbedNormal vorhanden (Pfützen-Normale)');
  const G = await import('../../src/gfx/wetter.js');
  const bal = (s) => [...s].filter((c) => c === '{').length === [...s].filter((c) => c === '}').length && [...s].filter((c) => c === '(').length === [...s].filter((c) => c === ')').length;
  for (const k of ['ROAD_WET_GLSL', 'ROAD_PUDDLE_NORMAL_GLSL', 'GRASS_WEATHER_GLSL', 'GRASS_ROUGH_GLSL']) {
    ok(bal(G[k]), `${k}: Klammern ausgeglichen`);
    ok(/if \( (wWet|wSnow|sbPud)/.test(G[k].trim().replace(/^\/\/.*\n/gm, '')), `${k}: hängt an einem Wetter-Uniform (klar = übersprungen)`);
  }
  const m = new THREE.MeshStandardMaterial(); G.patchSnowCover(m, 0.8);
  const sh = { uniforms: {}, vertexShader: SL.physical.vertexShader, fragmentShader: SL.physical.fragmentShader };
  m.onBeforeCompile(sh);
  ok(sh.uniforms.wSnow === G.wetterUniforms.wSnow && sh.fragmentShader.includes('uniform float wSnow;') && sh.fragmentShader.includes('wsC = smoothstep( 0.55, 0.85, wsN.y ) * wSnow * 0.80') && sh.fragmentShader.includes('roughnessFactor = mix'), 'Schnee auf Dächern: Patch eingesetzt');
  ok(m.customProgramCacheKey().endsWith('|wsnow'), 'Schnee-Patch: eigener Programm-Schlüssel');
  const ml = new THREE.MeshLambertMaterial(); G.patchSnowCover(ml); const sl = { uniforms: {}, vertexShader: '', fragmentShader: SL.lambert.fragmentShader }; ml.onBeforeCompile(sl);
  ok(sl.fragmentShader.includes('wsC') && !sl.fragmentShader.includes('roughnessFactor = mix'), 'Schnee-Patch Lambert ohne Rauheit');
  ok(G.patchSnowCover(new THREE.MeshBasicMaterial()).onBeforeCompile.toString().length < 400, 'Basic-Material bleibt ungepatcht');
  const ms = new THREE.MeshStandardMaterial(); G.patchSnowCover(ms); G.patchSnowCover(ms); ok(ms.customProgramCacheKey().endsWith('|wsnow') && !ms.customProgramCacheKey().includes('|wsnow|wsnow'), 'doppelt gepatcht wird ignoriert');
  // Anschluss in materials.js/env.js (Quelltext): Uniforms und Stücke eingehängt
  const fs = await import('fs');
  const mat = fs.readFileSync(new URL('../../src/gfx/materials.js', import.meta.url), 'utf8'), env = fs.readFileSync(new URL('../../src/gfx/env.js', import.meta.url), 'utf8');
  ok(/Object\.assign\(sh\.uniforms, wetterUniforms\)[^\n]*\n[\s\S]*ROAD_WET_GLSL/.test(mat) && mat.includes('${GRASS_WEATHER_GLSL}') && mat.includes('${GRASS_ROUGH_GLSL}') && mat.includes('ROAD_PUDDLE_NORMAL_GLSL'), 'materials.js: Fahrbahn/Gelände angeschlossen');
  ok(env.includes('wSky: { value: new THREE.Vector2(1, 0) }') && env.includes('* wSky.x'), 'env.js: Himmel abdunkeln/entsättigen (1, 0 = unverändert)');
}

// ---------- 6) Regengeräusch ----------
{
  const { rainLoop } = await import('../../src/audio/sound.js');
  const a = rainLoop(44100 * 3.25 | 0, 41);
  let fin = true, pk = 0, rms = 0, dmax = 0;
  for (let i = 0; i < a.length; i++) { if (!Number.isFinite(a[i])) fin = false; pk = Math.max(pk, Math.abs(a[i])); rms += a[i] * a[i]; if (i) dmax = Math.max(dmax, Math.abs(a[i] - a[i - 1])); }
  rms = Math.sqrt(rms / a.length);
  ok(fin && pk <= 0.951 && rms > 0.01 && rms < 0.3, `Regen-Loop: endlich, Spitze ${pk.toFixed(2)}, RMS ${rms.toFixed(3)}`);
  ok(Math.abs(a[0] - a[a.length - 1]) <= dmax * 1.01, 'Regen-Loop: Naht ohne Sprung (≤ größter Schritt im Loop)');
  ok(Math.abs(a.length - 44100 * 3) < 2, 'Regen-Loop: 3 s nach der Überblendung');
}

console.log(`${bad ? 'FEHLER' : 'ok'}: ${checks - bad}/${checks} Prüfungen (Wetter: Auswahl, nur Kosmetik, Aussehen, Teilchen, Shader, Ton)`);
process.exit(bad ? 1 : 0);
