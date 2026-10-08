// Heldenauto: "Fictional supercar – V12 Goblin" von Olli Teittinen (ollitei), CC-BY 4.0, Sketchfab.
// Lädt das GLB (Meshopt), backt Transformationen, normiert auf Physik-Maße (vorwärts −Z, oben +Y),
// trennt Räder (Lenk-Pivot + Dreh-Gruppe) und ersetzt den Lack durch Clearcoat-Material.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CAR_DEF } from '../physics/car.js';
import { patchStaticShadow } from './materials.js';
import { makeContactShadow } from './kinolook.js';
import { lodFor } from './carlod.js';

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
// Geparkte Autos (Szenerie importierter Strecken): vereinfachtes Modell ohne Texturen, nur bei Bedarf
let lodPromise = null, lastM = null;
export async function parkedCarGeometry() {
  if (!lodPromise) {
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    lodPromise = l.loadAsync('assets/car/goblin_lod.glb');
  }
  const gltf = await lodPromise;
  if (!lastM) await makeCar({});                    // Modell→Auto-Transformation des Heldenautos
  const src = gltf.scene;
  src.updateMatrixWorld(true);
  const out = [];
  src.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || /car_shadow/.test(o.name)) return;
    const g = toFloat(o.geometry.clone()).applyMatrix4(o.matrixWorld).applyMatrix4(lastM);
    const m = new THREE.MeshStandardMaterial({ color: o.material.color, metalness: o.material.metalness, roughness: o.material.roughness });
    patchStaticShadow(m);
    out.push({ g, m });
  });
  return out;
}

// n30: Heldenauto in Mittel- (~15,8 k) und Fern-Stufe (~8,7 k Dreiecke), gebaut mit tools/build_assets.mjs --car-mid aus
// demselben Original (Lizenz unverändert, CC-BY 4.0). Ohne Texturen: jede Stufe nutzt die Materialien des Heldenautos.
// Lädt erst nach dem Start (nicht im Ladebildschirm); ?lod=0 = immer volles Modell.
let lodsPromise = null;
export function loadCarLods() {
  if (!lodsPromise) {
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    lodsPromise = Promise.all([l.loadAsync('assets/car/goblin_mid.glb'), l.loadAsync('assets/car/goblin_far.glb')]);
  }
  return lodsPromise;
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

// Nitro-Flammen (Extras, 28.09.2026): zwei Endrohre neben dem Kennzeichen (Auto-Koordinaten, z = hinten).
// Je Rohr ein Kegel (außen orange, innen heller Kern) + Leuchtscheibe, additiv, ohne Tiefe schreiben; Länge,
// Flackern und Helligkeit folgen der Nitro-Stärke. Kein Licht (keine neuen Shader-Varianten der Welt).
export const EXHAUST = [[-0.25, 0.13, 2.2], [0.25, 0.13, 2.2]];
function flameMaterial(core) {
  return new THREE.ShaderMaterial({
    uniforms: { uT: { value: 0 }, uL: { value: 0 }, uCore: { value: core ? 1 : 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; uniform float uT; uniform float uCore;
      void main() {
        vY = uv.y;
        vec3 p = position;
        float w = 1.0 + (0.2 + 0.25 * vY) * sin(uT * 53.0 + vY * 11.0 + uCore * 2.0) + 0.12 * sin(uT * 91.0 + vY * 27.0);
        p.xy *= w;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vY; varying vec3 vN; varying vec3 vV; uniform float uL; uniform float uCore; uniform float uT;
      void main() {
        float e = pow(abs(dot(normalize(vN), normalize(vV))), 1.3);
        float along = pow(1.0 - vY, 1.1);
        float flick = 0.85 + 0.15 * sin(uT * 70.0 + vY * 30.0);
        vec3 hot = uCore > 0.5 ? vec3(0.75, 0.85, 1.0) : vec3(1.0, 0.72, 0.25);
        vec3 tip = uCore > 0.5 ? vec3(0.35, 0.55, 1.0) : vec3(1.0, 0.25, 0.04);
        vec3 c = mix(tip, hot, along) * (uCore > 0.5 ? 2.2 : 1.6);
        gl_FragColor = vec4(c * e * along * flick * uL, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 1, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(0.3, 'rgba(255,150,60,0.55)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowTex = null;
function makeFlames() {
  const grp = new THREE.Group();
  grp.name = 'nitro';
  grp.visible = false;
  const outer = new THREE.ConeGeometry(0.11, 1, 14, 6, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const inner = new THREE.ConeGeometry(0.055, 1, 10, 4, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const mO = flameMaterial(false), mI = flameMaterial(true);
  if (!glowTex && typeof document !== 'undefined') glowTex = glowTexture();
  const mG = new THREE.SpriteMaterial({ map: glowTex, color: 0xffb070, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
  const parts = [];
  for (const [x, y, z] of EXHAUST) {
    const o = new THREE.Mesh(outer, mO), i = new THREE.Mesh(inner, mI), g = new THREE.Sprite(mG);
    for (const m of [o, i, g]) { m.position.set(x, y, z); m.userData.fx = true; m.renderOrder = 4; m.frustumCulled = false; grp.add(m); }
    g.position.z += 0.08;
    parts.push({ o, i, g });
  }
  let t = 0;
  return {
    grp,
    // level 0 … 1 (Nitro-Stärke), dt: Zeitschritt fürs Flackern
    set(level, dt) {
      grp.visible = level > 0.01;
      if (!grp.visible) return;
      t += dt;
      mO.uniforms.uT.value = mI.uniforms.uT.value = t;
      mO.uniforms.uL.value = mI.uniforms.uL.value = Math.min(1, level * 1.3);
      const fl = 0.9 + 0.1 * Math.sin(t * 61) + 0.06 * Math.sin(t * 137);
      for (const p of parts) {
        const len = (0.35 + 1.1 * level) * fl;
        p.o.scale.set(0.6 + 0.5 * level, 0.6 + 0.5 * level, len);
        p.i.scale.set(0.8, 0.8, len * 0.65);
        const gs = (0.22 + 0.3 * level) * fl;
        p.g.scale.set(gs, gs, gs);
      }
      mG.opacity = Math.min(1, level * 1.2);
    },
  };
}

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
  lastM = M.clone();

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
  // n30: verarbeitete Materialien je Quell-Material (Name + Rad), damit die LOD-Stufen dieselben bekommen
  const matCache = new Map();
  const matKey = (m, isWheel) => `${m.name || ''}|${isWheel ? 1 : 0}`;
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
  const lodMeshes = [[], [], []];
  for (const p of parts) {
    const g = p.geo;
    g.applyMatrix4(M);
    const fm = (q) => { const r = fixMat(q, !!p.w); matCache.set(matKey(q, !!p.w), r); return r; };
    const mat = Array.isArray(p.mesh.material) ? p.mesh.material.map(fm) : fm(p.mesh.material);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.lod = 0; lodMeshes[0].push(mesh);
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
  const flames = makeFlames();
  root.add(flames.grp);
  // Kontaktschatten (n17): weicher dunkler Fleck auf der Aufstandsfläche – erdet das Auto (Echtzeit-Schatten allein wirkt
  // auf Stufe 1 schwebend); blendet im Sprung aus. opts.contact = false (Geist, ?look=alt): keiner.
  const wy0 = Math.min(...Object.values(wheels).map((W) => W.base.y)) - rVis;
  const trackW = Math.abs(FR.clone().applyMatrix4(M).x - FL.clone().applyMatrix4(M).x);
  const wb = Math.abs(wheels.FL.base.z - wheels.BL.base.z);
  const contact = opts.contact === false ? null : makeContactShadow({ width: trackW + 0.55, length: wb + 1.75, y: wy0 + 0.03 });
  if (contact) { contact.position.z = (wheels.FL.base.z + wheels.BL.base.z) / 2; root.add(contact); }
  let contactA = 1;
  const car = {
    root, body, wheels, mats, rVis, tris, flames, contact,
    lod: 0, lodLevels: 1, lodMeshes,
    // n30: LOD-Stufe (1 = Mittel, 2 = Fern) aus einem GLB von tools/build_assets.mjs --car-mid anhängen. Gleiche Knoten-
    // namen → gleiche Rad-Zuordnung und Modell→Auto-Transformation wie das Heldenauto; Materialien über den Namen.
    addLod(gltf, level) {
      const s2 = gltf.scene;
      s2.updateMatrixWorld(true);
      const list = [];
      s2.traverse((o) => { if (o.isMesh && !/car_shadow/.test(o.name)) list.push(o); });
      for (const o of list) {
        const w = wheelOf(o);
        const g = toFloat(o.geometry.clone());
        g.applyMatrix4(o.matrixWorld).applyMatrix4(M);
        const pick = (q) => matCache.get(matKey(q, !!w)) || fixMat(q, !!w);
        const mat = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
        for (const q of Array.isArray(mat) ? mat : [mat]) if (!q.userData.sbPatched) { patchStaticShadow(q); q.userData.sbPatched = true; }
        const mesh = new THREE.Mesh(g, mat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.lod = level; mesh.visible = false;
        if (w) { const W = wheels[w.pos]; g.translate(-W.base.x, -W.base.y, -W.base.z); (w.kind === 'wheel' ? W.spin : W.brake).add(mesh); }
        else body.add(mesh);
        lodMeshes[level].push(mesh);
      }
      this.lodLevels = Math.max(this.lodLevels, level + 1);
      const want = this.lod; this.lod = -1; this.setLod(want);
      return list.length;
    },
    setLod(level) {
      level = Math.max(0, Math.min(this.lodLevels - 1, level));
      if (level === this.lod) return;
      // fehlt eine Zwischenstufe (noch nicht geladen), die nächstfeinere nehmen
      while (level > 0 && !lodMeshes[level].length) level--;
      this.lod = level;
      lodMeshes.forEach((list, i) => { for (const m of list) m.visible = i === level; });
    },
    // je Bild: Stufe aus Entfernung und Bildwinkel; opts.min = gröbste Mindeststufe (Geist: 1), opts.force = feste Stufe
    updateLod(camera, opts = {}) {
      if (this.lodLevels < 2) return this.lod;
      let l;
      if (opts.force != null) l = opts.force;
      else {
        const dx = camera.position.x - root.position.x, dy = camera.position.y - root.position.y, dz = camera.position.z - root.position.z;
        l = Math.max(opts.min || 0, lodFor(Math.hypot(dx, dy, dz), camera.fov || 62, Math.max(0, this.lod)));
      }
      this.setLod(l);
      return this.lod;
    },
    setPaint(c) { paint.color.set(c); },
    setNitro(level, dt = 1 / 60) { flames.set(level, dt); },
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
      if (contact) {
        // Bodenkontakt: Physik (Räder mit Kontakt) bzw. Replay (Einfederung); im Flug rasch aus, nach der Landung weich an
        const ws = phys.wheels, n = ws.reduce((a, w) => a + ((w.contact ?? (w.comp > 0.004)) ? 1 : 0), 0);
        const air = P.air || n === 0;
        contactA += ((air ? 0 : 1) - contactA) * (air ? 0.25 : 0.15);
        let yy = 0; for (const k of order) yy += wheels[k].pivot.position.y; yy = yy / 4 - rVis + 0.03;
        contact.position.y = yy;
        contact.set(contactA);
      }
    },
  };
  return car;
}
