// Grafik-Kern, Baustein 4 (n30): Oktaeder-Impostor-BÄCKER – läuft im Browser (tools/build_impostor.html, gesteuert von
// tools/build_impostor.py über Playwright, GPU). Backt ein three.js-Objekt aus N×N Richtungen der oberen Halbkugel
// (Halb-Oktaeder, src/gfx/kern/oktaeder.js – dieselben Formeln wie die Laufzeit kern/impostor.js) in zwei Atlanten:
//   farbe:    Grundfarbe (Albedo, unbeleuchtet) + Deckkraft, sRGB
//   normalen: Normale im Objektraum (xyz · 0,5 + 0,5), linear; Rückseiten gedreht (doppelseitiges Laub)
// Das Objekt wird vorher normiert: Fuß auf y = 0, Stamm-Achse x = z = 0, Höhe 1 → zur Laufzeit Maßstab = Höhe in Metern.
// Rückgabe: { farbe: dataURL, normalen: dataURL, meta: { N, zelle, radius, mitte, hoehe: 1 } }
import * as THREE from 'three';
import { rahmenRichtung, rahmenBasis } from '../src/gfx/kern/oktaeder.js';

// Objekt normieren (Kopie): Fuß y = 0, Achse durch (0, 0), Höhe 1
export function normiere(obj) {
  const o = obj.clone(true);
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o, true);
  const h = box.max.y - box.min.y || 1;
  const g = new THREE.Group();
  o.position.sub(new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y, (box.min.z + box.max.z) / 2));
  const k = 1 / h;
  const wrap = new THREE.Group(); wrap.add(o); wrap.scale.setScalar(k);
  g.add(wrap);
  g.updateMatrixWorld(true);
  return g;
}

// Hüllkugel um die Achse: Mitte (0, cy, 0), Radius = größter Abstand eines Eckpunkts
export function huelle(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj, true);
  const cy = (box.min.y + box.max.y) / 2, c = new THREE.Vector3(0, cy, 0), v = new THREE.Vector3();
  let r = 0;
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const p = m.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld); r = Math.max(r, v.distanceTo(c)); }
  });
  return { mitte: cy, radius: r * 1.02 };
}

// Ersatz-Materialien je Durchgang (Original-Textur + Alpha übernehmen)
function farbMaterial(m) {
  return new THREE.MeshBasicMaterial({ map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(1, 1, 1), alphaMap: m.alphaMap || null,
    alphaTest: Math.max(0.35, m.alphaTest || 0), transparent: false, side: THREE.DoubleSide, vertexColors: !!m.vertexColors });
}
const NOR_VS = `varying vec3 vN; varying vec2 vUv;
  void main() { vUv = uv; vN = mat3( modelMatrix ) * normal; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const NOR_FS = `uniform sampler2D map; uniform float useMap, alphaTest; varying vec3 vN; varying vec2 vUv;
  void main() {
    float a = useMap > 0.5 ? texture2D( map, vUv ).a : 1.0;
    if ( a < alphaTest ) discard;
    vec3 n = normalize( vN ) * ( gl_FrontFacing ? 1.0 : -1.0 );
    gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 );
  }`;
function normalMaterial(m) {
  return new THREE.ShaderMaterial({ vertexShader: NOR_VS, fragmentShader: NOR_FS, side: THREE.DoubleSide,
    uniforms: { map: { value: m.map || null }, useMap: { value: m.map ? 1 : 0 }, alphaTest: { value: Math.max(0.35, m.alphaTest || 0) } } });
}

// Backen. renderer: WebGLRenderer auf einer Leinwand (alpha, preserveDrawingBuffer, premultipliedAlpha: false).
export function backe(renderer, objekt, o = {}) {
  const N = o.N || 8, zelle = o.zelle || 128, A = N * zelle;
  const obj = normiere(objekt);
  const { mitte, radius } = huelle(obj);
  const C = new THREE.Vector3(0, mitte, 0);
  const scene = new THREE.Scene(); scene.add(obj);
  const orig = new Map();
  obj.traverse((m) => { if (m.isMesh) orig.set(m, m.material); });
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.001, radius * 4);
  renderer.setPixelRatio(1);
  renderer.setSize(A, A, false);
  renderer.setScissorTest(true);
  renderer.toneMapping = THREE.NoToneMapping;
  const out = {};
  for (const pass of ['farbe', 'normalen']) {
    obj.traverse((m) => {
      if (!m.isMesh) return;
      const mats = [].concat(orig.get(m));
      const neu = mats.map((x) => (pass === 'farbe' ? farbMaterial(x) : normalMaterial(x)));
      m.material = Array.isArray(orig.get(m)) ? neu : neu[0];
    });
    renderer.outputColorSpace = pass === 'farbe' ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
    renderer.setScissor(0, 0, A, A); renderer.setViewport(0, 0, A, A);
    renderer.setClearColor(0x000000, 0); renderer.clear();
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const n = rahmenRichtung(i, j, N), { u } = rahmenBasis(n[0], n[1], n[2]);
      cam.position.set(C.x + n[0] * radius * 2, C.y + n[1] * radius * 2, C.z + n[2] * radius * 2);
      cam.up.set(u[0], u[1], u[2]);
      cam.lookAt(C);
      cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      // Zelle (i, j): WebGL-Ursprung unten links = Textur-UV (i/N, j/N) bei flipY (Bild wird oben-links gespeichert)
      renderer.setViewport(i * zelle, j * zelle, zelle, zelle); renderer.setScissor(i * zelle, j * zelle, zelle, zelle);
      renderer.render(scene, cam);
    }
    out[pass] = renderer.domElement.toDataURL('image/png');
  }
  obj.traverse((m) => { if (m.isMesh) m.material = orig.get(m); });
  renderer.setScissorTest(false);
  return { farbe: out.farbe, normalen: out.normalen, meta: { N, zelle, radius: +radius.toFixed(5), mitte: +mitte.toFixed(5), hoehe: 1 } };
}
