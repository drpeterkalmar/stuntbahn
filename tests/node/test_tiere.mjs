// Tier-Zuschauer (n40) ohne Browser: Figur (Maße, großer Kopf, Fuß auf 0, jede Art mit eigenen Teilen, keine verdrehten
// Dreiecke, Budget Ecken/Dreiecke), Mischung je Strecke (keine zwei gleichen nebeneinander, alle Arten, deterministisch),
// Atlas-Plan, Einstellung/Regler, Shader-Einbau (Anker, Haltung mit Tier-Gelenken, Maske, Farben, Klammern), Bauen in echten
// Kulissen (gleiche Draw-Calls wie Menschen, Art in iA.y), Menschen unverändert (Haltungs-Shader Zeichen für Zeichen).
// Aufruf: node tests/node/test_tiere.mjs
import './three_haken.mjs';
const THREE = await import('three');
const calls = { ellipse: 0 };
const ctx2d = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : k === 'ellipse' ? () => { calls.ellipse++; } : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} }) };
globalThis.matchMedia = () => ({ matches: false });
const T = await import('../../src/gfx/tierform.js');
const { tierGeometry, tierMaterial, tierAtlas, drawTier } = await import('../../src/gfx/tiere.js');
const K2 = await import('../../src/gfx/kulisse2.js');
const { generate } = await import('../../src/track/generator.js');
const { prepare } = await import('../../src/track/verify.js');
const { planDeco } = await import('../../src/track/deco.js');
const { THEMES } = await import('../../src/track/themes.js');
const { MAT } = await import('../../src/track/defs.js');

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? 'OK  ' : 'FAIL'} ${msg}`); if (!ok) fails++; };
const fmt = (x, d = 2) => x.toFixed(d).replace('.', ',');

console.log('--- Figur ---');
const F = T.tierForm(), nv = F.P.length / 3, nt = F.I.length / 3;
check(nv <= 660 && nt <= 900, `Figur: ${nv} Ecken (≤ 660), ${nt} Dreiecke gesamt (Menschen: 260 / ~120)`);
{
  const G = T.tierForm(true), gv = G.P.length / 3;
  let gt = 0; for (let q = 0; q < G.I.length; q += 3) if (G.M[G.I[q]] & 1 && G.M[G.I[q + 1]] & 1 && G.M[G.I[q + 2]] & 1) gt++;
  check(gv <= 0.86 * nv && new Set(G.A).size === new Set(F.A).size && new Set(G.C).size === new Set(F.C).size, `grob (Grafik Standard): ${gv} Ecken, Bärchen ${gt} Dreiecke – gleiche Teile und Farbklassen`);
}
check([F.N.length, F.A.length * 3, F.C.length * 3, F.M.length * 3].every((x) => x === F.P.length) && F.I.every((i) => i >= 0 && i < nv), 'Attribute vollständig, Indizes gültig');
{
  let bad = 0;
  for (let i = 0; i < nv; i++) if (Math.abs(Math.hypot(F.N[i * 3], F.N[i * 3 + 1], F.N[i * 3 + 2]) - 1) > 1e-4) bad++;
  check(!bad, 'Normalen haben Länge 1');
  // Dreiecke zeigen nach außen: Flächennormale (Umlaufsinn) in Richtung der Ecken-Normalen
  let inv = 0;
  for (let q = 0; q < F.I.length; q += 3) {
    const [a, b, c] = [F.I[q], F.I[q + 1], F.I[q + 2]], p = (i) => [F.P[i * 3], F.P[i * 3 + 1], F.P[i * 3 + 2]];
    const A = p(a), Bv = p(b), C = p(c), e1 = Bv.map((x, k) => x - A[k]), e2 = C.map((x, k) => x - A[k]);
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const vn = [0, 1, 2].map((k) => F.N[a * 3 + k] + F.N[b * 3 + k] + F.N[c * 3 + k]);
    if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] < 0) inv++;
  }
  check(!inv, `keine verdrehten Dreiecke (${inv})`);
}
// je Art: sichtbare Teile (Maske), Maße
for (const [k, art] of T.TIERE.entries()) {
  const bit = 1 << k, vis = (i) => F.M[i] & bit;
  let tris = 0; for (let q = 0; q < F.I.length; q += 3) if (vis(F.I[q]) && vis(F.I[q + 1]) && vis(F.I[q + 2])) tris++;
  let y0 = 1e9, y1 = -1e9, own = 0, headW = 0, bodyW = 0;
  for (let i = 0; i < nv; i++) {
    if (!vis(i) || F.A[i] >= 5) continue;
    const x = F.P[i * 3], y = F.P[i * 3 + 1];
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    if (F.M[i] === bit) own++;
    if (F.A[i] === 0 && y > 0.8 && y < 1.15) headW = Math.max(headW, Math.abs(x));
    if (F.A[i] === 0 && y > 0.25 && y < 0.7) bodyW = Math.max(bodyW, Math.abs(x));
  }
  check(tris <= 520 && Math.abs(y0) < 1e-6 && y1 > 1.2 && y1 < 1.75 && own > 0 && headW > bodyW, `${T.TIER_NAMEN[art]}: ${tris} Dreiecke, ${fmt(y1)} m hoch, Fuß auf 0, eigene Teile ${own} Ecken, Kopf ${fmt(headW * 2)} m breiter als Bauch ${fmt(bodyW * 2)} m`);
}
{
  const cls = new Set(F.C);
  check([T.KL.weiss, T.KL.dunkel, T.KL.glanz, T.KL.rosa, T.KL.pfote].every((c) => cls.has(c)), 'Augen (weiß, Pupille, Glanz), Bäckchen, Pfoten vorhanden');
  // Fahne (nur Haltung 3, Arm hochgerissen ~146°): nach der Drehung um das Schultergelenk liegt das Tuch über dem Kopf
  const J = T.TIER_J.armR.split(',').map(Number), a = 2.55;
  let ok = true;
  for (let i = 0; i < nv; i++) if (F.A[i] === 6) { const y = F.P[i * 3 + 1] - J[1], z = F.P[i * 3 + 2]; const y2 = Math.cos(a) * y + Math.sin(a) * z; if (J[1] + y2 < 1.3) ok = false; }
  check(ok, 'Fahne beim Schwenken über dem Kopf');
}

console.log('--- Mischung ---');
{
  let worst = 0, allArts = true, det = true, n = 0;
  for (const [s, d, o] of [[4711, 2, { gel: true }], [25, 2, { gel: true }], [4711, 3, { d3: true }], [1038, 1, {}]]) {
    const env = prepare(generate(s, d, o));
    const plan = planDeco(env.track, { ideal: env.ideal, prof: env.prof, tier: 2, seed: 7, veg: THEMES.land.veg, themeId: 'land' });
    const fans = plan.fans || [];
    const a = T.tierMischung(fans, 99), b = T.tierMischung(fans, 99);
    if (a.some((x, i) => x !== b[i])) det = false;
    const seen = new Set(a); if (fans.length > 30 && seen.size < T.TIERE.length) allArts = false;
    // je Zuschauer: die zwei nächsten Nachbarn (bis 1,25 m) sind andere Tiere
    let same = 0;
    for (let i = 0; i < fans.length; i++) {
      const nb = [];
      for (let j = 0; j < fans.length; j++) if (j !== i) { const d2 = (fans[i].x - fans[j].x) ** 2 + (fans[i].z - fans[j].z) ** 2; if (d2 < 1.25 * 1.25) nb.push([d2, j]); }
      nb.sort((p, q) => p[0] - q[0]);
      for (const [, j] of nb.slice(0, 2)) if (a[i] === a[j]) same++;
    }
    worst = Math.max(worst, same); n += fans.length;
  }
  check(worst === 0, `keine zwei gleichen Tiere nebeneinander (je die 2 nächsten bis 1,25 m) – ${n} Zuschauer auf 4 Strecken`);
  check(allArts, 'alle 6 Arten kommen vor');
  check(det, 'gleiche Strecke → gleiche Tiere');
  check(T.tierCol(5, 15) === 95 && T.tierCol(0, 3) === 3, 'iA.y = Art · 16 + Farbe');
}
{
  const rows = T.tierAtlasPlan();
  let ok = rows.length === 4;
  for (const r of rows) for (let k = 1; k < r.ps.length; k++) if (r.ps[k].art === r.ps[k - 1].art || (k > 1 && r.ps[k].art === r.ps[k - 2].art)) ok = false;
  check(ok && rows[0].ps.length === 60 && rows[2].ps.length === 44, 'Atlas: 2 Reihen sitzend (60), 2 stehend (44), Nachbarn verschieden');
  calls.ellipse = 0; tierAtlas();
  check(calls.ellipse > 4000, `Atlas gezeichnet (${calls.ellipse} Formen)`);
}

console.log('--- Einstellung ---');
check(T.zuschauerModus('', {}) === 'tiere' && T.zuschauerModus('', { zuschauer: 'mensch' }) === 'mensch' && T.zuschauerModus('?zuschauer=mensch', { zuschauer: 'tiere' }) === 'mensch' && T.zuschauerModus('?zuschauer=tiere', { zuschauer: 'mensch' }) === 'tiere', 'Standard Tiere, Option „Menschen“, ?zuschauer= hat Vorrang');
check(T.ZUSCHAUER.tiere === false, 'ohne main.js (Node) Menschen wie bisher');

console.log('--- Shader ---');
{
  const g = tierGeometry();
  check(['aPart', 'aCls', 'aMask', 'normal', 'color'].every((a) => g.getAttribute(a) && g.getAttribute(a).count === g.getAttribute('position').count), 'Geometrie: Attribute aPart, aCls, aMask, normal, color');
  const m = tierMaterial(), sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(sh);
  const V = sh.vertexShader, Fr = sh.fragmentShader;
  check((V.match(/fanJoint\(/g) || []).length === 2 && V.includes('objectNormal = fJm * objectNormal') && V.includes(`o = vec3( ${T.TIER_J.armR} )`) && V.includes(`lift = sit ? ${T.TIER_J.sitLift}`), 'Haltung/Jubel mit Tier-Gelenken eingesetzt');
  check(V.includes('attribute float aMask') && V.includes('exp2( tArt )') && V.includes('vColor.rgb = pow( cc'), 'Maske je Art und Farbe eingesetzt');
  check((V.match(/vec3\[6\]\(/g) || []).length === 6 && !/NaN|undefined/.test(V), 'Farbtabellen je Art (6 × 6), keine leeren Werte');
  check(Fr.includes('varying float vGlanz') && Fr.includes('vec3( 0.8 ) * vGlanz') && V.includes('varying float vGlanz'), 'Glanzpunkt-Leuchten');
  const bal = (s, a, b) => [...s].filter((c) => c === a).length === [...s].filter((c) => c === b).length;
  check(bal(V, '{', '}') && bal(V, '(', ')') && bal(V, '[', ']') && bal(Fr, '{', '}') && bal(Fr, '(', ')'), 'Klammern ausgeglichen');
  check(sh.uniforms.uFanFade && sh.uniforms.uCheer && sh.uniforms.uTime && m.customProgramCacheKey().includes('tier3d') && !m.customProgramCacheKey().includes('fan3d'), 'Uniforms, eigener Programm-Schlüssel');
  // keine Gleitkomma-Zahlen ohne Punkt in den eingesetzten Tabellen (GLSL: vec3( 1 ) wäre int → Fehler im Konstruktor nicht, aber 0.8 + int schon)
  const ins = V.slice(V.indexOf('float tA ='), V.indexOf('vColor.rgb = pow( cc'));
  check(!/[^\w.]\d+[^\w.\d]/.test(ins.replace(/\[\d+\]|int\( tA \)|vec3\[6\]/g, '')), 'Farbtabellen: nur Gleitkomma-Zahlen');
}

console.log('--- Bauen ---');
{
  const M = { [MAT.PAINT]: new THREE.MeshStandardMaterial({ vertexColors: true }) };
  for (const [s, d, o] of [[4711, 2, { gel: true }], [4711, 3, { d3: true }]]) {
    const env = prepare(generate(s, d, o)), TT = env.track.terrain, gy = (x, z) => TT.height(x, z);
    const plan = planDeco(env.track, { ideal: env.ideal, prof: env.prof, tier: 2, seed: 7, veg: THEMES.land.veg, themeId: 'land' });
    T.ZUSCHAUER.tiere = false;
    const mm = [], sm = K2.buildKulisse2(plan, { M, gy, add: (m) => mm.push(m), tier: 2 });
    T.ZUSCHAUER.tiere = true;
    const mt = [], st = K2.buildKulisse2(plan, { M, gy, add: (m) => mt.push(m), tier: 2 });
    T.ZUSCHAUER.tiere = false;
    const fan = mt.find((m) => m.name === 'kulisse2-zuschauer'), iA = fan && fan.geometry.getAttribute('iA');
    let artsOk = !!iA;
    if (iA) for (let i = 0; i < iA.count; i++) { const y = iA.getY(i); if (!(y >= 0 && y < 16 * T.TIERE.length)) artsOk = false; }
    check(st.calls === sm.calls && fan && fan.material === tierMaterial() && fan.geometry.getAttribute('aMask') && artsOk, `${s}-${d}: Tiere ${st.calls} Draw-Calls wie Menschen, ${st.fans} Figuren, Art in iA.y; Dreiecke ${Math.round(st.tris)} (Menschen ${Math.round(sm.tris)})`);
  }
}
{
  // Menschen unverändert: Haltungs-Shader aus dem Generator = alter Text
  const v = K2.fanPoseGlsl(K2.FAN_J);
  check(v.includes('o = vec3( 0.26, 1.45, 0.0 )') && v.includes('lift = sit ? -0.8 : cheer * abs( sin( t * ( 6.0 + iA.z * 3.0 ) + ph ) ) * 0.24;') && v.includes('o = vec3( 0.0, 0.88, 0.0 ); m = fRotX( -1.5 )'), 'Menschen: Haltungs-Shader wie bis n39');
}

console.log(fails ? `\n${fails} FEHLER` : '\nalle OK');
process.exit(fails ? 1 : 0);
