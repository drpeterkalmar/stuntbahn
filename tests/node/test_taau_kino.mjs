// TAAU im Kino-Look (n31): Anschluss ohne Browser geprüft – three.js aus lib/ (three_haken.mjs), Renderer als Attrappe, die
// jeden Zeichenaufruf mitschreibt. Prüft: Standard aus (Kino wie bisher mit MSAA 4), ?taa=1 → Renderskala 0,7/0,6/1, MSAA 0,
// Projektion nur im Szenen-Durchlauf verschoben (danach wieder exakt wie vorher), genau EIN zusätzlicher Vollbild-Durchgang
// (Resolve, HalfFloat, Bildschirmgröße), Endbild mit TAA statt FXAA, Jitter wechselt je Bild, Schnitt setzt die History neu,
// Autopilot-Rückfall → FXAA-Art ohne Resolve, ohne HalfFloat-Ziel → bisheriger Weg, Einfach ohne Pipeline, Körper (Auto/Geist),
// Anschluss an quality.js (Renderskalen-Bereich).
import './three_haken.mjs';
const THREE = await import('three');
const { KinoLook, PRESETS } = await import('../../src/gfx/kinolook.js');
const { jitterFolge, jitterAnzahl } = await import('../../src/gfx/kern/taau_mathe.js');
const { Quality } = await import('../../src/gfx/quality.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
globalThis.window = globalThis.window || { devicePixelRatio: 2 };

const W = 1000, H = 500;
function attrappe({ halbFloat = true } = {}) {
  const r = {
    log: [], ziel: null, autoClear: true,
    capabilities: { isWebGL2: true },
    extensions: { has: (n) => halbFloat && (n === 'EXT_color_buffer_float') },
    getDrawingBufferSize(v) { return v.set(W, H); },
    setRenderTarget(t) { this.ziel = t; },
    render(scene, cam) {
      const m = scene.children.length === 1 && scene.children[0].isMesh ? scene.children[0].material : null;
      this.log.push({ ziel: this.ziel, szene: scene, kam: cam, proj: cam.projectionMatrix.elements.slice(), defines: m && m.defines ? { ...m.defines } : null, mat: m });
    },
  };
  return r;
}
const kamera = () => { const c = new THREE.PerspectiveCamera(62, W / H, 0.25, 4000); c.position.set(0, 2, 5); c.updateMatrixWorld(); return c; };
const welt = new THREE.Scene(); welt.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()), new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
const auto = new THREE.Object3D(), geist = new THREE.Object3D();
const box = new THREE.Box3(new THREE.Vector3(-1, 0, -2.2), new THREE.Vector3(1, 1.4, 2.2));
const bild = (k, r, cam, o = {}) => { r.log.length = 0; k.render(welt, cam, { dt: 1 / 60, run: false, speed: 0, car: auto, ghost: geist, ...o }); return r.log.slice(); };
const szenenAufruf = (log) => log.find((e) => e.szene === welt);
const resolveAufruf = (k, log) => log.find((e) => k.taau && e.szene === k.taau.szene);
const endbild = (log) => log.find((e) => e.ziel === null && e.defines);

// ---------- 1. Standard: aus, Kino wie bisher ----------
{
  const r = attrappe(), k = new KinoLook(r, { level: 2 }), cam = kamera();
  k.setCarBox(box);
  const log = bild(k, r, cam);
  ok(k.taaModus() === 'aus' && k.msaa() === 4 && k.scaleRange.join() === PRESETS[2].scale.join() && !k.taau, `ohne ?taa: Modus aus, Kino MSAA ${k.msaa()}, Renderskala ${k.scaleRange.join('/')}, TAAU nicht angelegt`);
  ok(!endbild(log).defines.TAA && szenenAufruf(log).ziel.samples === 4, 'Endbild ohne TAA, Szene mit MSAA 4 (unverändert)');
}

// ---------- 2. ?taa=1 auf Kino ----------
{
  const r = attrappe(), k = new KinoLook(r, { level: 2, stages: '+taa', taa: { gewicht: '0.93', muster: null } }), cam = kamera();
  k.setCarBox(box);
  const p0 = cam.projectionMatrix.elements.slice();
  ok(k.taaModus() === 'taa' && k.msaa() === 0 && k.scaleRange.join() === '0.7,0.6,1' && k.renderScale === 0.7, `?taa=1: Modus taa, MSAA ${k.msaa()}, Renderskala ${k.scaleRange.join('/')} (Start ${k.renderScale})`);
  ok(k.taau.o.gewicht === 0.93, `?taaw=0.93 kommt an (${k.taau.o.gewicht})`);
  const log = bild(k, r, cam);
  const sz = szenenAufruf(log), rs = resolveAufruf(k, log), eb = endbild(log);
  const sw = Math.round(W * 0.7), sh = Math.round(H * 0.7);
  ok(sz && sz.ziel.width === sw && sz.ziel.height === sh && sz.ziel.samples === 0, `Szene in ${sz.ziel.width}×${sz.ziel.height} ohne MSAA`);
  const j = jitterFolge(jitterAnzahl(0.7))[0];
  const dx = sz.proj[8] - p0[8], dy = sz.proj[9] - p0[9];
  ok(Math.abs(dx - (-2 * j[0] / sw)) < 1e-9 && Math.abs(dy - (-2 * j[1] / sh)) < 1e-9, `Szene mit Halton-Versatz gezeichnet (${(dx * sw / -2).toFixed(3)}, ${(dy * sh / -2).toFixed(3)}) px = Folge[0]`);
  const einheit = cam.projectionMatrixInverse.clone().multiply(cam.projectionMatrix).elements.every((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) < 1e-6);
  ok(cam.projectionMatrix.elements.every((v, i) => v === p0[i]) && einheit,
    'nach dem Bild ist die Projektion wieder exakt die alte (Sonne/Flare/Cockpit sehen keinen Versatz)');
  const fl = log.filter((e) => e.ziel && e.ziel.width === W && e.ziel.height === H && e.szene !== welt);
  ok(rs && rs.ziel.width === W && rs.ziel.height === H && rs.ziel.texture.type === THREE.HalfFloatType && fl.length === 1,
    `genau EIN zusätzlicher Vollbild-Durchgang (Resolve in ${rs.ziel.width}×${rs.ziel.height}, HalfFloat)`);
  ok(rs && rs.kam !== cam && rs.kam.isOrthographicCamera, 'Resolve mit eigener Vollbild-Kamera');
  ok(eb && eb.defines.TAA === 1 && !eb.defines.AA && eb.defines.SHARP === 1 && k.u.tTaa.value === rs.ziel.texture, 'Endbild liest die History (TAA), keine FXAA-Art, CAS bleibt');
  ok(Math.abs(k.u.uSharp.value - PRESETS[2].taaSharpen) < 1e-9 && k.u.uJitUv.value.x === j[0] / sw, `Nachschärfen ${k.u.uSharp.value} (taaSharpen), Jitter für Dunst/DoF übergeben`);
  ok(k.taau.u.uHistOk.value === 0, 'erstes Bild: keine History (nur aktuelle Rekonstruktion)');
  // zweites Bild: anderer Versatz, History gilt, Ping-Pong
  const log2 = bild(k, r, cam), sz2 = szenenAufruf(log2), rs2 = resolveAufruf(k, log2);
  const j2 = jitterFolge(jitterAnzahl(0.7))[1];
  ok(Math.abs((sz2.proj[8] - p0[8]) - (-2 * j2[0] / sw)) < 1e-9 && k.taau.u.uHistOk.value === 1 && rs2.ziel !== rs.ziel && k.taau.u.tHist.value === rs.ziel.texture,
    'zweites Bild: nächster Versatz, History gültig, liest das Vorbild (Ping-Pong)');
  // Körper
  ok(k.taau.k[0].art === 1 && k.taau.k[1].art === 2 && k.taau.u.uKMin.value[0].y === box.min.y + 0.1, 'Auto als fester Körper (Box ab 10 cm über den Reifen – Abnahme: Fahrbahn unter dem Heck lag sonst in der Box), Geist als durchsichtiger');
  geist.visible = false; bild(k, r, cam); ok(k.taau.k[1].art === 0, 'unsichtbarer Geist → kein Körper'); geist.visible = true;
  // Auto bewegt sich: Delta-Matrix = vorige Welt · aktuelle Inverse
  auto.position.set(0, 0, -1.5); auto.updateMatrixWorld(); bild(k, r, cam);
  const d = k.taau.u.uKDelta.value[0].elements;
  ok(Math.abs(d[14] - 1.5) < 1e-9, `Auto fährt 1,5 m: Körper-Reprojektion verschiebt um ${d[14]} m zurück`);
  // Schnitt
  const vor = k.taau.stats.resets;
  bild(k, r, cam, { cut: true });
  ok(k.taau.stats.resets === vor + 1 && k.taau.u.uHistOk.value === 0, 'Kameraschnitt verwirft die History');
  bild(k, r, cam);
  cam.position.x += 40; cam.updateMatrixWorld(); bild(k, r, cam);
  ok(k.taau.u.uHistOk.value === 0, 'Kamerasprung (40 m) verwirft die History ohne cut-Flag');
  // Renderskala ändert sich (Autopilot): History bleibt, Zielgröße gleich
  bild(k, r, cam); k.renderScale = 0.64; const log3 = bild(k, r, cam);
  ok(k.taau.u.uHistOk.value === 1 && szenenAufruf(log3).ziel.width === Math.round(W * 0.64) && resolveAufruf(k, log3).ziel.width === W, 'Renderskala 0,7 → 0,64: History bleibt gültig (Ziel unverändert)');
  // Rückfall
  k.taaRueckfall = true;
  const log4 = bild(k, r, cam), eb4 = endbild(log4);
  ok(k.taaModus() === 'fxaa' && !resolveAufruf(k, log4) && eb4.defines.AA === 1 && !eb4.defines.TAA && szenenAufruf(log4).ziel.samples === 0 && szenenAufruf(log4).proj[8] === p0[8],
    'Autopilot-Rückfall: FXAA-Art, kein Resolve, kein Versatz, MSAA bleibt 0');
  k.taaRueckfall = false; bild(k, r, cam);
  ok(k.taaModus() === 'taa' && k.taau.u.uHistOk.value === 0, 'wieder an: History beginnt neu');
  k.renderScale = 0.55; ok(k.taaModus() === 'fxaa', 'Renderskala unter 0,6 → FXAA-Art'); k.renderScale = 0.7;
  // Einfach
  k.setLevel(0); const log5 = bild(k, r, cam);
  ok(k.taaModus() === 'aus' && log5.length === 1 && log5[0].ziel === null && log5[0].proj[8] === p0[8], 'Einfach: direkt gezeichnet, kein TAA');
  k.setLevel(1);
  ok(k.scaleRange.join() === PRESETS[1].taaScale.join() && k.taaModus() === 'taa', `Standard mit TAA: Renderskala ${k.scaleRange.join('/')}`);
  const d0 = k.describe();
  ok(d0.taa && d0.taa.modus === 'taa' && d0.taa.technik === true && d0.taa.phasen >= 8, `describe() meldet TAA (${JSON.stringify({ modus: d0.taa.modus, phasen: d0.taa.phasen, groesse: d0.taa.groesse })})`);
  k.dispose(); ok(k.taau === null, 'dispose räumt die History weg');
}

// ---------- 3. ohne HalfFloat-Ziel: bisheriger Weg ----------
{
  const r = attrappe({ halbFloat: false }), k = new KinoLook(r, { level: 2, stages: '+taa' }), cam = kamera();
  k.setCarBox(box);
  const log = bild(k, r, cam);
  ok(k.taaModus() === 'aus' && k.msaa() === 4 && k.scaleRange.join() === PRESETS[2].scale.join() && !resolveAufruf(k, log), 'kein HalfFloat-Ziel: bisheriger Kino-Weg (MSAA 4, Renderskala 1/0,7/1)');
}

// ---------- 4. ?taa=1 und ?kl=-taa: spätere Angabe gewinnt; ?taa=0 ----------
{
  const k = new KinoLook(attrappe(), { level: 2, stages: '+taa,-taa' });
  ok(k.taaModus() === 'aus', '?taa=1&kl=-taa → aus (kl gewinnt)');
}

// ---------- 4b. ?taaskala= (Start-Renderskala für A/B), geklemmt auf den TAAU-Bereich ----------
{
  const a = new KinoLook(attrappe(), { level: 2, stages: '+taa', taa: { skala: '0.65' } }), b = new KinoLook(attrappe(), { level: 1, stages: '+taa', taa: { skala: '0.3' } });
  const c = new KinoLook(attrappe(), { level: 2, stages: '+taa', taa: { skala: null } });
  ok(a.renderScale === 0.65 && a.scaleRange.join() === '0.65,0.6,1' && b.renderScale === 0.6 && c.renderScale === 0.7, `?taaskala=0.65 → Start ${a.renderScale}; 0,3 → auf ${b.renderScale} geklemmt; ohne → ${c.renderScale}`);
}

// ---------- 5. quality.js: Renderskalen-Bereich und Autopilot-Stufe ----------
{
  const r = attrappe(), k = new KinoLook(r, { level: 2, stages: '+taa' });
  const q = new Quality(r, null, { autopilot: true });
  q.kino = k; q.post = k;
  ok(q.scaleRangeOf(2).join() === '0.6,1,0.7' && q.scaleRangeOf(1).join() === '0.6,0.85,0.7', `Autopilot-Bereich mit TAA: Kino ${q.scaleRangeOf(2).join('/')}, Standard ${q.scaleRangeOf(1).join('/')}`);
  const ap = q.startAutopilot({ skala: 0.7, extra: [['taa', 0.05, (s) => { k.taaRueckfall = s === 0; }]] });
  ok(ap.ding('taa') && k.renderScale === 0.7, 'Stufe „taa“ angemeldet, Startskala 0,7 im Kino-Look');
  // zu langsam: erst Renderskala bis 0,6, dann Deko, dann TAA → FXAA-Art
  let schritte = [];
  ap.onAenderung = (e) => schritte.push(e.was);
  for (let i = 0; i < 400 && !k.taaRueckfall; i++) q.sample(1 / 30, () => {}, 30);
  ok(k.taaRueckfall && k.renderScale === 0.6 && schritte.indexOf('taa') > schritte.lastIndexOf('skala'), `bei Dauerlast: ${schritte.join(' → ')} → Rückfall FXAA-Art bei Renderskala ${k.renderScale}`);
  ok(k.taaModus() === 'fxaa', 'Kino-Look meldet danach FXAA-Art');
}

// ---------- 6. Shader-Quelltext (Ersatz für den Compiler-Lauf im Browser): Klammern, #if/#endif, Uniforms vorhanden ----------
// n31 Abnahme: negativer Mip-Bias in den three.js-Bausteinen (Konstante TAA_MIP, idempotent)
{
  const { mipBiasEinbauen } = await import('../../src/gfx/kern/taau.js');
  const C = THREE.ShaderChunk;
  const b = mipBiasEinbauen(C, Math.log2(0.65));
  mipBiasEinbauen(C, Math.log2(0.65));
  const n = (C.common.match(/#define TAA_MIP/g) || []).length;
  ok(Math.abs(b - Math.log2(0.65)) < 1e-9 && n === 1 && C.common.includes('#define TAA_MIP -0.621') && C.map_fragment.includes('texture2D( map, vMapUv, TAA_MIP )')
    && C.normal_fragment_maps.includes('texture2D( normalMap, vNormalMapUv, TAA_MIP )') && !C.displacementmap_vertex.includes('TAA_MIP'),
    `Mip-Bias: TAA_MIP ${b.toFixed(3)} einmal in common, map/normalMap mit Bias, Vertex-Bausteine unberührt`);
  ok(mipBiasEinbauen(C, 0) === 0 && C.common.includes('#define TAA_MIP 0.000') && (C.common.match(/#define TAA_MIP/g) || []).length === 1 && mipBiasEinbauen(C, -5) === -2, 'Mip-Bias: 0 ohne TAA, begrenzt auf −2');
}

{
  const fs = await import('node:fs');
  const pruefe = (datei, uObj) => {
    const txt = fs.readFileSync(new URL(datei, import.meta.url), 'utf8');
    const strings = [...txt.matchAll(/`([^`]*)`/g)].map((m) => m[1]).filter((t) => /uniform|void main/.test(t));
    const fehl = [], unbal = [];
    for (const t of strings) {
      const roh = t.replace(/\$\{[^}]*\}/g, '');
      const z = (c) => roh.split(c).length - 1;
      if (z('(') !== z(')') || z('{') !== z('}') || z('[') !== z(']')) unbal.push(roh.slice(0, 50).replace(/\s+/g, ' '));
      if (/void main/.test(roh) && (roh.match(/#if/g) || []).length !== (roh.match(/#endif/g) || []).length) unbal.push('#if/#endif ' + roh.slice(0, 40));
      for (const m of roh.matchAll(/uniform\s+\w+\s+([^;]+);/g)) for (const n of m[1].split(',').map((x) => x.trim().replace(/\[.*\]/, '').trim())) if (!(n in uObj)) fehl.push(n);
    }
    ok(!unbal.length && !fehl.length, `${datei.split('/').pop()}: ${strings.length} Shader-Teile, Klammern/#if ausgeglichen${unbal.length ? ' FEHLT: ' + unbal.join(' | ') : ''}, alle Uniforms angelegt${fehl.length ? ' FEHLT: ' + fehl.join(', ') : ''}`);
  };
  const k = new KinoLook(attrappe(), { level: 2, stages: '+taa' });
  pruefe('../../src/gfx/kinolook.js', k.u);
  pruefe('../../src/gfx/kern/taau.js', k.taau.u);
}

console.log(bad ? `${bad} Fehler` : 'TAAU-Anschluss im Kino-Look grün');
process.exit(bad ? 1 : 0);
