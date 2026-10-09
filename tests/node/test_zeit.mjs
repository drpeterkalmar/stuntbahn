// Tageszeit (n32 Nachtrag): ohne Browser geprüft.
//  1) Auswahl: ?zeit= > Einstellung > passend; passend deterministisch, meist Tag (Anteile Abend/Nacht), Einstellung „zeit“
//     im Speicher (Standard 'auto'), ?zeit= ist kein A/B-Zusatz (wertet), Bestzeit-Schlüssel ohne Tageszeit.
//  2) Nur Kosmetik: Bau der Strecke hängt nicht an der Tageszeit (gleiche Hashes).
//  3) Aussehen: Tag neutral (Uniforms 0, Basis unverändert, Licht-Richtung = Sonne des Themas); Abend tief und warm, Nacht
//     dunkel mit Lichtern; Wechsel Nacht → Tag stellt Richtung/Licht exakt zurück; Wetter rechnet auf der Nacht-Basis
//     (Nacht + Regen: Dunst bleibt dunkel, Farbkorrektur „nacht“).
//  4) Lichter: Planung auf mehreren Strecken (Leuchtpunkte, Lichterketten an Looping/Röhre/Korkenzieher, Laternen nicht auf
//     der Fahrbahn, Licht-Karte endlich und nicht leer), Shader-Anker in three r186.
import './three_haken.mjs';
import crypto from 'crypto';
const THREE = await import('three');
const Z = await import('../../src/track/zeit.js');
const W = await import('../../src/track/wetter.js');
const GZ = await import('../../src/gfx/zeit.js');
const GW = await import('../../src/gfx/wetter.js');
const { generate, galleryLayout } = await import('../../src/track/generator.js');
const { buildTrack } = await import('../../src/track/build.js');
const { prepare } = await import('../../src/track/verify.js');
const { planDeco } = await import('../../src/track/deco.js');
const { THEME_IDS } = await import('../../src/track/themes.js');
const { abMode, modeKey } = await import('../../src/game/store.js');

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL ' + m); } };

// ---------- 1) Auswahl ----------
ok(Z.parseZeit('Nacht') === 'nacht' && Z.parseZeit('evening') === 'abend' && Z.parseZeit('passend') === 'auto' && Z.parseZeit('x') === null && Z.parseZeit(null) === null, 'parseZeit');
const lay = (seed, diff = 2, gel = true) => ({ meta: { seed, diff, gel, key: `${seed}-${diff}${gel ? '-g' : ''}` } });
ok(Z.zeitFor(lay(5), 'land', 'auto', 'nacht') === 'nacht', 'URL hat Vorrang');
ok(Z.zeitFor(lay(5), 'land', 'abend', null) === 'abend', 'Einstellung fest');
ok(Z.zeitFor(lay(5), 'land', 'abend', 'tag') === 'tag', 'URL vor Einstellung');
ok(Z.zeitFor(lay(5), 'land', 'abend', 'auto') === 'abend', '?zeit=auto lässt die Einstellung gelten');
ok(Z.zeitFor(lay(5), 'land', 'auto', 'quatsch') === Z.zeitAuto(lay(5), 'land'), 'ungültige URL → passend');
const N = 6000, f = { tag: 0, abend: 0, nacht: 0 };
for (let s = 1; s <= N; s++) f[Z.zeitAuto(lay(s * 7 + 3, 1 + (s % 3), s % 2 === 0), THEME_IDS[s % THEME_IDS.length])]++;
ok(Math.abs(f.abend / N - Z.ZEIT_CHANCE.abend) < 0.02 && Math.abs(f.nacht / N - Z.ZEIT_CHANCE.nacht) < 0.02 && f.tag / N > 0.75, `Passend: meist Tag (${JSON.stringify(f)})`);
ok(Z.zeitAuto(lay(4711, 3), 'alpen') === Z.zeitAuto(lay(4711, 3), 'alpen'), 'Passend deterministisch');
// Wetter und Tageszeit würfeln unabhängig (andere Hash-Konstante)
let same = 0; for (let s = 1; s <= 2000; s++) { const l = lay(s); if ((W.wetterAuto(l, 'land') !== 'klar') && (Z.zeitAuto(l, 'land') !== 'tag')) same++; }
ok(same < 2000 * 0.18 * 0.2 * 2.2, `Wetter und Tageszeit unabhängig (${same} beide nicht Standard)`);
ok(!abMode('?zeit=nacht'), '?zeit= ist kein A/B-Zusatz (wertet)');
ok(!/zeit|nacht|abend/.test(modeKey('easy', false, true)), 'Bestzeit-Schlüssel ohne Tageszeit');
{
  const { Store } = await import('../../src/game/store.js');
  globalThis.localStorage = { _d: {}, getItem(k) { return this._d[k] ?? null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
  const s = new Store(); ok(s.settings.zeit === 'auto', 'Einstellung „zeit“ Standard passend');
}

// ---------- 2) Nur Kosmetik ----------
const hash = (t) => { const H = crypto.createHash('sha1'), L = t.line; for (const k of ['px', 'py', 'pz']) H.update(Buffer.from(L[k].buffer)); H.update(Buffer.from(t.col.pos.buffer)); H.update(Buffer.from(t.terrain.H.buffer)); return H.digest('hex'); };
{
  const l = generate(4711, 3, { gel: true }), h0 = hash(buildTrack(l));
  for (const z of Z.ZEIT_IDS) { Z.zeitFor(l, 'land', z); ok(hash(buildTrack(generate(4711, 3, { gel: true }))) === h0, `Bau unabhängig von ${z}`); }
}

// ---------- 3) Aussehen ----------
const tag = Z.zeitLook('tag', 2), abend = Z.zeitLook('abend', 2), nacht = Z.zeitLook('nacht', 2);
ok(tag.lights === 0 && tag.sun === 1 && tag.env === 1 && tag.night === 0 && tag.sunElev === null && tag.flare === 1, 'Tag neutral');
ok(abend.sunElev > 2 && abend.sunElev < 15 && abend.sunTint[2] < abend.sunTint[0] && abend.lights > 0 && abend.grade === 'abend', 'Abend: tief, warm, Lichter an');
ok(nacht.sun < 0.2 && nacht.env < 0.15 && nacht.night === 1 && nacht.lights === 1 && nacht.grade === 'nacht' && nacht.flare === 0 && nacht.line > 0, 'Nacht: dunkel, Sterne, Lichter, keine Blendung, Linie heller');
ok(Z.zeitLook('nacht', 0).ketten === 0 && Z.zeitLook('nacht', 1).ketten === 1, 'Lichterketten erst ab Standard');
const d0 = [0.4, 0.6, 0.7], dA = Z.zeitSonne(d0, abend), dT = Z.zeitSonne(d0, tag);
ok(dT[0] === d0[0] && dT[1] === d0[1] && dT[2] === d0[2], 'Tag: Sonne des Themas');
ok(Math.abs(Math.asin(dA[1]) * 180 / Math.PI - abend.sunElev) < 1e-6 && Math.abs(Math.atan2(dA[2], dA[0]) - Math.atan2(d0[2], d0[0])) < 1e-9, 'Abend: gleiche Himmelsrichtung, tief');
// Attrappe des Themen-Kontexts: Nacht → Tag stellt alles zurück; Nacht + Regen: Dunst dunkel
const mk = () => {
  const sky = { material: { uniforms: { horizon: { value: new THREE.Color(0.7, 0.75, 0.8) }, wSky: { value: new THREE.Vector2(1, 0) }, wNight: { value: new THREE.Vector4() }, wGlow: { value: new THREE.Vector4() }, wTint: { value: new THREE.Vector3(1, 1, 1) }, wOld: { value: new THREE.Vector4() } } } };
  const sun = { intensity: 3, color: new THREE.Color(1, 0.95, 0.9), userData: { dir: new THREE.Vector3(0.4, 0.6, 0.7).normalize() }, position: new THREE.Vector3(), target: { position: new THREE.Vector3() } };
  const scene = { fog: { near: 100, far: 900, color: new THREE.Color(0.7, 0.75, 0.8) }, environmentIntensity: 1.8 };
  const kino = { grade: 'mittag', hazeCol: new THREE.Color(0.6, 0.7, 0.8), sunCol: new THREE.Color(1, 0.95, 0.85), aerial: { density: 0.0003, falloff: 0.012, base: 0, max: 0.34 } };
  return { scene, sky, sun, kino };
};
{
  const c = mk(), B = GW.merkeBasis(c);
  const snap = () => JSON.stringify([c.sun.intensity, c.sun.color, c.sun.userData.dir, c.scene.fog, c.scene.environmentIntensity, c.kino.grade, c.kino.hazeCol, c.sky.material.uniforms.wSky.value, c.sky.material.uniforms.wNight.value, GZ.zeitUniforms.zLichtK.value, GZ.zeitUniforms.zHell.value]);
  GW.wendeWetterAn(c, GZ.wendeZeitAn(c, B, tag), 'klar', 'land', 2); const s0 = snap();
  GW.wendeWetterAn(c, GZ.wendeZeitAn(c, B, nacht), 'regen', 'land', 2);
  ok(c.kino.grade === 'nacht', 'Nacht + Regen: Farbkorrektur „nacht“');
  ok(c.scene.fog.color.r < 0.1 && c.scene.fog.color.g < 0.12, `Nacht + Regen: Nebel dunkel (${c.scene.fog.color.r.toFixed(3)})`);
  ok(c.sun.intensity < 0.4 && c.scene.environmentIntensity < 0.2 && c.sky.material.uniforms.wSky.value.x < 0.1, 'Nacht: Licht und Himmel dunkel');
  ok(c.sun.userData.dir.y > 0.5 && GZ.zeitUniforms.zLichtK.value === 1 && GZ.zeitUniforms.zHell.value < 0.2, 'Nacht: Mond hoch, Lichter an, Unbeleuchtetes dunkel');
  GW.wendeWetterAn(c, GZ.wendeZeitAn(c, B, abend), 'klar', 'land', 2);
  ok(c.sun.userData.dir.y < 0.15 && c.kino.grade === 'abend' && c.sky.material.uniforms.wGlow.value.x === 1, 'Abend: tiefe Sonne, Farbkorrektur, Abendrot');
  GW.wendeWetterAn(c, GZ.wendeZeitAn(c, B, tag), 'klar', 'land', 2);
  ok(snap() === s0, 'Wechsel zurück auf Tag stellt alles exakt her');
}

// ---------- 4) Lichter ----------
const strecken = [galleryLayout(), generate(4711, 3, { gel: true }), generate(25, 2, { gel: true }), generate(1038, 1), generate(17, 3, { d3: true })];
for (const l of strecken) {
  const { track } = prepare(l), L = track.line, n = L.px.length, gy = (x, z) => track.terrain.height(x, z);
  const plan = planDeco(track, { tier: 2, themeId: 'alpen', seed: l.seed || 1 });
  const P = GZ.planNachtLichter(track, plan, gy, 'alpen'), tag2 = l.meta && l.meta.key || 'galerie';
  ok(P.glows.length > 20 && P.pools.length > 5, `${tag2}: Leuchtpunkte ${P.glows.length}, Pfützen ${P.pools.length}`);
  const hatStunt = (track.pieces || []).some((p) => /loop|tube|cork|spiral/.test(p.type));
  ok(!hatStunt || P.ketten.length > 20, `${tag2}: Lichterketten an Stunts (${P.ketten.length})`);
  ok([...P.glows, ...P.ketten].every((g) => isFinite(g.x) && isFinite(g.y) && isFinite(g.z) && g.s > 0), `${tag2}: Leuchtpunkte endlich`);
  // Laternen: nie auf einer Fahrbahn (Abstand zur Mittellinie > halbe Breite + 2 m für alle Linienpunkte gleicher Höhe)
  let nah = 0;
  for (const p of P.laternen) for (let i = 0; i < n; i++) if ((L.px[i] - p.x) ** 2 + (L.pz[i] - p.z) ** 2 < (L.hw[i] + 2) ** 2 && Math.abs(L.py[i] - p.y) < 8) { nah++; break; }
  ok(nah === 0 && P.laternen.length > 3, `${tag2}: ${P.laternen.length} Laternen, keine auf der Fahrbahn (${nah})`);
  const K = GZ.backeLichtKarte(P.pools, track.bounds, 128), d = K.tex.image.data;
  let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k];
  ok(s > 0 && K.xf.every(isFinite), `${tag2}: Licht-Karte gebacken`);
}
// Shader-Anker in three r186
const SC = THREE.ShaderChunk;
ok(SC.meshphysical_frag.includes('#include <lights_fragment_end>') && SC.meshphysical_frag.includes('#include <roughnessmap_fragment>'), 'Anker lights_fragment_end/roughnessmap_fragment');
ok(/vViewPosition/.test(SC.meshphysical_vert) && GZ.ROAD_REFL_GLSL.split('{').length === GZ.ROAD_REFL_GLSL.split('}').length, 'Spiegel-Shader: Klammern ausgeglichen');
ok(GZ.NACHT_APPLY.split('{').length === GZ.NACHT_APPLY.split('}').length && GZ.NACHT_PARS.includes('zLichtK'), 'Nacht-Licht-Shader');

console.log(bad ? `FEHLER: ${checks - bad}/${checks} Prüfungen (Tageszeit)` : `ok: ${checks}/${checks} Prüfungen (Tageszeit: Auswahl, nur Kosmetik, Aussehen, Lichter, Shader)`);
process.exit(bad ? 1 : 0);
