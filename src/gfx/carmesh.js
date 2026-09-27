// Heldenauto: "Fictional supercar – V12 Goblin" von Olli Teittinen (ollitei), CC-BY 4.0, Sketchfab.
// Lädt das GLB (Meshopt), backt Transformationen, normiert auf Physik-Maße (vorwärts −Z, oben +Y),
// trennt Räder (Lenk-Pivot + Dreh-Gruppe) und ersetzt den Lack durch Clearcoat-Material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAR_DEF } from '../physics/car.js';
import { patchStaticShadow } from './materials.js';

let gltfPromise = null;

// Meshopt/Quantisierung: Attribute sind normalisierte Int16/Int8 → vor applyMatrix4 in Float32 wandeln,
// sonst werden Werte beim Zurückschreiben auf [−1, 1] geklemmt (Auto wird zum Klotz).
function toFloat(g) {
  for (const name of Object.keys(g.attributes)) {
    const a = g.attributes[name];
    if (!a.isInterleavedBufferAttribute && !a.normalized && a.array instanceof Float32Array) continue;
    const n = a.count, sz = a.itemSize, arr = new Float32Array(n * sz);
    const get = [a.getX, a.getY, a.getZ, a.getW];
    for (let i = 0; i < n; i++) for (let k = 0; k < sz; k++) arr[i * sz + k] = get[k].call(a, i);
    g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  return g;
}
export function loadCarModel() {
  if (!gltfPromise) {
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    gltfPromise = l.loadAsync('assets/car/goblin.glb');
  }
  return gltfPromise;
}

export const PAINTS = [
  { name: 'Rennrot', color: 0xa3120e },
  { name: 'Giftgrün', color: 0x2f8f1a },
  { name: 'Gelb', color: 0xd9a400 },
  { name: 'Blau', color: 0x0f3d9e },
  { name: 'Silber', color: 0x9aa0a6 },
];

export async function makeCar(opts = {}) {
  const gltf = await loadCarModel();
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  const wheelOf = (o) => {
    for (let p = o; p; p = p.parent) {
      const m = /car_(wheel|brake)_(FL|FR|BL|BR)/.exec(p.name || '');
      if (m) return { kind: m[1], pos: m[2] };
    }
    return null;
  };
  // Alle Meshes mit Weltmatrix einsammeln
  const parts = [];
  src.traverse((o) => { if (o.isMesh) parts.push({ mesh: o, w: wheelOf(o) }); });
  const box = new THREE.Box3();
  const wheelBoxes = {};
  for (const p of parts) {
    const g = toFloat(p.mesh.geometry.clone());
    g.applyMatrix4(p.mesh.matrixWorld);
    g.computeBoundingBox();
    p.geo = g;
    box.union(g.boundingBox);
    if (p.w && p.w.kind === 'wheel') {
      const b = wheelBoxes[p.w.pos] || (wheelBoxes[p.w.pos] = new THREE.Box3());
      b.union(g.boundingBox);
    }
  }
  const ctr = (k) => wheelBoxes[k].getCenter(new THREE.Vector3());
  const FL = ctr('FL'), FR = ctr('FR'), BL = ctr('BL'), BR = ctr('BR');
  const front = FL.clone().add(FR).multiplyScalar(0.5), rear = BL.clone().add(BR).multiplyScalar(0.5);
  const fwd = front.clone().sub(rear).normalize();
  const right0 = FR.clone().sub(FL).normalize();
  let up = new THREE.Vector3().crossVectors(right0, fwd).normalize();
  // Basis: Modell -> Auto (x rechts, y oben, z hinten)
  const right = new THREE.Vector3().crossVectors(fwd, up).normalize();
  up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  const back = fwd.clone().negate();
  const basis = new THREE.Matrix4().makeBasis(right, up, back).invert();
  const wbModel = front.distanceTo(rear);
  const wbPhys = -CAR_DEF.wheels[0].z + CAR_DEF.wheels[2].z;
  const scale = wbPhys / wbModel;
  const mid = front.clone().add(rear).multiplyScalar(0.5);
  const toCar = new THREE.Matrix4().makeScale(scale, scale, scale).multiply(basis).multiply(new THREE.Matrix4().makeTranslation(-mid.x, -mid.y, -mid.z));
  // Radradius (Modell, skaliert)
  const wsz = wheelBoxes.FL.getSize(new THREE.Vector3()).multiplyScalar(scale);
  const rVis = Math.max(wsz.x, wsz.y, wsz.z) / 2;
  // Ruhelage: Radmitte in Auto-Koordinaten (Physik)
  const d = CAR_DEF;
  const comp0 = d.mass * 9.81 / 4 / d.k;
  const wheelY0 = d.mountY - (d.rest + d.wheelR - comp0) + rVis;
  // Achsmitte des Modells liegt nach toCar bei y=0 → Karosserie so verschieben, dass Räder auf wheelY0 sitzen
  const bodyShift = new THREE.Matrix4().makeTranslation(0, wheelY0, (d.wheels[0].z + d.wheels[2].z) / 2);
  const M = new THREE.Matrix4().multiplyMatrices(bodyShift, toCar);

  const root = new THREE.Group();
  root.name = 'car';
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshPhysicalMaterial({
    color: opts.color ?? PAINTS[0].color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06,
  });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1211, metalness: 0.1, roughness: 0.04, transparent: true, opacity: 0.78, clearcoat: 1, clearcoatRoughness: 0.02 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92, metalness: 0 });
  const mats = { paint, glass, tire };
  // Karosserie: Spec-Gloss-Erbe → Lackfarbe steckt in der Spekular-Textur. Diese dient als Maske:
  // gesättigt = Lack (Wunschfarbe, metallisch + Klarlack), hell/grau = Chrom, sonst Detailtextur.
  const bodyMats = {};
  const makeBody = (m, rim) => {
    const key = rim ? 'rim' : 'body';
    if (bodyMats[key]) return bodyMats[key];
    const mask = m.specularColorMap || m.specularIntensityMap;
    const bm = new THREE.MeshPhysicalMaterial({ map: m.map, roughnessMap: m.roughnessMap, roughness: 1, metalness: 1, clearcoat: rim ? 0 : 1, clearcoatRoughness: 0.08 });
    const U = { paintCol: { value: paint.color }, maskMap: { value: mask }, rimMode: { value: rim ? 1 : 0 } };
    bm.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 paintCol;\nuniform sampler2D maskMap;\nuniform float rimMode;\nfloat gPaint; float gChrome;')
        .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 sc = texture2D( maskMap, vMapUv ).rgb;
          float mx = max( sc.r, max( sc.g, sc.b ) ), mn = min( sc.r, min( sc.g, sc.b ) );
          float sat = smoothstep( 0.10, 0.28, mx - mn );
          float white = ( 1.0 - sat ) * smoothstep( 0.45, 0.75, mn );
          // Rumpf: Weiß = Lack; Felgen: Weiß = Chrom
          gPaint = rimMode > 0.5 ? sat : max( sat, white );
          gChrome = rimMode > 0.5 ? white : 0.0;
          diffuseColor.rgb = mix( diffuseColor.rgb, paintCol * ( 0.6 + 0.4 * smoothstep( 0.1, 0.7, mx ) ), gPaint );
          diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86 ), gChrome );
        }`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          metalnessFactor = gPaint * 0.5 + gChrome * 0.95;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix( clamp( roughnessFactor, 0.35, 0.9 ), 0.3, gPaint );
          roughnessFactor = mix( roughnessFactor, 0.12, gChrome );`);
    };
    bm.customProgramCacheKey = () => 'carbody' + key;
    bm.name = 'car_' + key;
    bodyMats[key] = bm;
    return bm;
  };
  const fixMat = (m, isWheel) => {
    const n = (m.name || '').toLowerCase();
    if (n.includes('clearcoat')) return paint;
    if (n.includes('glass')) return glass;
    if (n.includes('tire')) { if (m.normalMap) { tire.normalMap = m.normalMap; } return tire; }
    if (n.includes('car_body') && m.map) return makeBody(m, isWheel);
    if (m.isMeshStandardMaterial) { m.envMapIntensity = 1.0; }
    return m;
  };
  const wheels = {};
  for (const k of ['FL', 'FR', 'BL', 'BR']) {
    const pivot = new THREE.Group(), spin = new THREE.Group();
    pivot.add(spin);
    root.add(pivot);
    const c = (k === 'FL' ? FL : k === 'FR' ? FR : k === 'BL' ? BL : BR).clone().applyMatrix4(M);
    pivot.position.copy(c);
    wheels[k] = { pivot, spin, base: c.clone(), brake: new THREE.Group() };
    pivot.add(wheels[k].brake);
  }
  let tris = 0;
  for (const p of parts) {
    const g = p.geo;
    g.applyMatrix4(M);
    const mat = Array.isArray(p.mesh.material) ? p.mesh.material.map((q) => fixMat(q, !!p.w)) : fixMat(p.mesh.material, !!p.w);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    if (p.w) {
      const W = wheels[p.w.pos];
      g.translate(-W.base.x, -W.base.y, -W.base.z);
      (p.w.kind === 'wheel' ? W.spin : W.brake).add(mesh);
    } else body.add(mesh);
  }
  const all = new Set();
  root.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => all.add(m)); });
  all.forEach((m) => { if (!m.userData.sbPatched) { patchStaticShadow(m); m.userData.sbPatched = true; } });
  // Physik-Zuordnung der Räder (Reihenfolge wie CAR_DEF.wheels: FL, FR, BL(RL), BR(RR))
  const order = ['FL', 'FR', 'BL', 'BR'];
  const car = {
    root, body, wheels, mats, rVis, tris,
    setPaint(c) { paint.color.set(c); },
    // aus Physik-Zustand aktualisieren
    sync(phys, alpha = 1, pose = null) {
      const P = pose || phys;
      root.position.set(P.pos.x, P.pos.y, P.pos.z);
      root.quaternion.set(P.q.x, P.q.y, P.q.z, P.q.w);
      order.forEach((k, i) => {
        const w = phys.wheels[i], W = wheels[k];
        const yc = d.mountY - (d.rest + d.wheelR - w.comp) + rVis;
        W.pivot.position.set(W.base.x, Math.min(yc, W.base.y + 0.22), W.base.z);
        W.pivot.rotation.set(0, -w.steer, 0);
        W.spin.rotation.x = -w.spin;
      });
    },
  };
  return car;
}
