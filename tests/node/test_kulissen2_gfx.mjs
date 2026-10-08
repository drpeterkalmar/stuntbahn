// Kulissen n32 – Zeichnen ohne Browser geprüft (three aus lib/, Canvas als Attrappe): buildKulisse2 baut für echte Planungen
// ohne Fehler, Draw-Calls/Dreiecke im Budget, 3D-Zuschauer nur ab Standard (Einfach: Karten wie bis n31), Gruppen-Karten
// blenden nah aus (crowdNear), ?kulisse=alt baut nichts; Tribünen-Bauformen; Shader-Einbau der Figuren (Anker in r186,
// Haltung/Jubel/Blitz eingesetzt); Startampel-Logik; Lichter je Lampe nummeriert.
import './three_haken.mjs';
const THREE = await import('three');
// Canvas-Attrappe (canvasTex zeichnet Werbung/Leinwand)
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
globalThis.matchMedia = () => ({ matches: false });
const { buildKulisse2, standGeometry, fanGeometry, fanMaterial, ampelAus, kulisse2Uniforms, FAN_FADE } = await import('../../src/gfx/kulisse2.js');
const { crowdNear } = await import('../../src/gfx/deco.js');
const { generate } = await import('../../src/track/generator.js');
const { prepare } = await import('../../src/track/verify.js');
const { planDeco } = await import('../../src/track/deco.js');
const { THEMES } = await import('../../src/track/themes.js');
const { MAT } = await import('../../src/track/defs.js');

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.log('FAIL ' + m); } };
const M = { [MAT.PAINT]: new THREE.MeshStandardMaterial({ vertexColors: true }) };

// Figur
const fg = fanGeometry(), fTris = fg.index.count / 3, fVerts = fg.getAttribute('position').count;
ok(fTris <= 140 && fVerts <= 260, `Figur: ${fTris} Dreiecke (≤ 140), ${fVerts} Ecken (≤ 260)`);
for (const a of ['aPart', 'aCls', 'normal', 'color']) ok(fg.getAttribute(a) && fg.getAttribute(a).count === fg.getAttribute('position').count, `Figur: Attribut ${a}`);
fg.computeBoundingBox(); ok(fg.boundingBox.max.y > 1.7 && fg.boundingBox.max.y < 2.3 && fg.boundingBox.min.y >= 0, 'Figur: ~1,8 m groß, Fuß auf 0');
{
  const m = fanMaterial(), sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  for (const a of ['#include <beginnormal_vertex>', '#include <begin_vertex>', '#include <color_vertex>', '#include <common>']) ok(sh.vertexShader.includes(a), `r186 Anker ${a}`);
  m.onBeforeCompile(sh);
  ok(sh.vertexShader.includes('fanJoint( fJo, fJm, fJl, fJk )') && (sh.vertexShader.match(/fanJoint\(/g) || []).length === 2 && sh.vertexShader.includes('objectNormal = fJm * objectNormal') && sh.vertexShader.includes('vColor = cc'), 'Figur-Shader: Haltung, Normale, Farbe eingesetzt');
  ok(sh.fragmentShader.includes('totalEmissiveRadiance += vec3( 9.0, 9.0, 8.5 ) * vFlash'), 'Figur-Shader: Kamerablitz');
  ok(sh.uniforms.uFanFade && sh.uniforms.uCheer && sh.uniforms.uTime, 'Figur-Shader: Uniforms');
  const bal = (s) => [...s].filter((c) => c === '{').length === [...s].filter((c) => c === '}').length;
  ok(bal(sh.vertexShader) && bal(sh.fragmentShader), 'Figur-Shader: Klammern ausgeglichen');
}
for (const f of [1, 2]) { const g = standGeometry(f); g.computeBoundingBox(); ok(g.index.count / 3 < 4000 && g.boundingBox.max.x <= 9.6 && g.boundingBox.max.z < 1.6, `Tribüne Bauform ${f}: ${g.index.count / 3} Dreiecke, Maße`); }

// Ampel
ok(JSON.stringify(ampelAus('countdown', 1e9, 0)) === '[0,0]', 'Ampel: Menü-Vorschau aus');
ok(ampelAus('countdown', 2.95, 0)[0] === 1 && ampelAus('countdown', 0.05, 0)[0] === 5, 'Ampel: 1 … 5 rote Lichter im Countdown');
ok(ampelAus('running', 0, 0.5)[1] === 1 && ampelAus('running', 0, 2)[1] === 0, 'Ampel: kurz grün nach dem Start');

// Bauen für echte Strecken
for (const [s, d, o] of [[4711, 2, { gel: true }], [25, 2, { gel: true }], [4711, 3, { d3: true }], [1038, 1, {}]]) {
  const env = prepare(generate(s, d, o)), T = env.track.terrain, gy = (x, z) => T.height(x, z);
  for (const th of ['land', 'stadt', 'kueste', 'winter']) for (const tier of [0, 1, 2]) {
    const tag = `${s}-${d}/${th}/${tier}`;
    const plan = planDeco(env.track, { ideal: env.ideal, prof: env.prof, tier, seed: 7, veg: THEMES[th].veg, themeId: th });
    const meshes = [];
    let st;
    try { st = buildKulisse2(plan, { M, gy, add: (m) => meshes.push(m), tier }); } catch (e) { ok(false, `${tag}: Fehler ${e.message}`); continue; }
    ok(st.calls === meshes.length && st.calls <= 9, `${tag}: ${st.calls} Draw-Calls (≤ 9)`);
    ok(st.tris < [60e3, 120e3, 180e3][tier], `${tag}: ${Math.round(st.tris)} Dreiecke`);
    const fan = meshes.find((m) => m.name === 'kulisse2-zuschauer');
    if (tier === 0) ok(!fan && crowdNear.value.y === 0, `${tag}: Einfach ohne 3D-Figuren, Karten wie bis n31`);
    else {
      ok(fan && fan.count === plan.fans.length && st.fans === plan.fans.length, `${tag}: alle ${plan.fans.length} Zuschauer gezeichnet`);
      ok(crowdNear.value.y > crowdNear.value.x && crowdNear.value.x > 0 && crowdNear.value.y <= FAN_FADE[tier][1], `${tag}: Gruppen-Karten nah aus`);
      const iA = fan.geometry.getAttribute('iA');
      ok(iA && iA.count === plan.fans.length && iA.isInstancedBufferAttribute, `${tag}: Instanz-Daten`);
      const e = fan.instanceMatrix.array; let fin = true; for (const v of e) if (!Number.isFinite(v)) { fin = false; break; } ok(fin, `${tag}: Lage endlich`);
    }
    for (const n of ['kulisse2-bauten']) ok(meshes.some((m) => m.name === n), `${tag}: ${n} vorhanden`);
    ok(!plan.catchFences.length || meshes.some((m) => m.name === 'kulisse2-fangzaun'), `${tag}: Fangzaun gezeichnet`);
    ok(!plan.banden.length || meshes.some((m) => m.name === 'kulisse2-banden'), `${tag}: Banden-Werbung gezeichnet`);
    ok(!plan.startGrid.length || meshes.some((m) => m.name === 'kulisse2-startaufstellung'), `${tag}: Startaufstellung gezeichnet`);
    ok(!(plan.portal || (plan.inst.ampel || []).length) || meshes.some((m) => m.name === 'kulisse2-ampel'), `${tag}: Startampel gezeichnet`);
    const amp = meshes.find((m) => m.name === 'kulisse2-ampel');
    if (amp) { const a = amp.geometry.getAttribute('aI').array, ids = new Set([...a].filter((v) => v >= 0)); ok(ids.size === 5 && amp.material.uniforms.uAmpel === kulisse2Uniforms.uAmpel, `${tag}: Ampel 5 Lichter am Uniform`); }
    for (const m of meshes) { const p = m.geometry.getAttribute('position').array; let fin = true; for (let i = 0; i < p.length; i += 7) if (!Number.isFinite(p[i])) { fin = false; break; } ok(fin, `${tag}: ${m.name} Geometrie endlich`); }
  }
  const alt = planDeco(env.track, { ideal: env.ideal, prof: env.prof, tier: 2, seed: 7, veg: THEMES.land.veg, themeId: 'land', kulisse2: false });
  const meshes = []; const st = buildKulisse2(alt, { M, gy, add: (m) => meshes.push(m), tier: 2 });
  ok(st.calls === 0 && meshes.length === 0 && crowdNear.value.y === 0, `${s}-${d}: ?kulisse=alt baut nichts, Karten wie bis n31`);
}
console.log(`${bad ? 'FEHLER' : 'ok'}: ${checks - bad}/${checks} Prüfungen (Kulissen n32 zeichnen)`);
process.exit(bad ? 1 : 0);
