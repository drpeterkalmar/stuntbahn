// Himmel (HDRI von Poly Haven, CC0), Bildbasiertes Licht, Sonne, Nebel, statische Schattenkarte.
import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { shadowUniforms } from './materials.js';
import { WORLD_SCALE } from '../track/defs.js';
import { cloudUniforms, CLOUD_GLSL } from './deko.js';

export async function loadSkyInfo(url = 'assets/sky/sky.json') {
  const r = await fetch(url);
  return r.json();
}
export function loadSkyTexture(url = 'assets/sky/sky.jpg') {
  return new THREE.TextureLoader().loadAsync(url).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.generateMipmaps = false;           // sonst Naht am u-Übergang (Ableitungssprung)
    tex.minFilter = THREE.LinearFilter;
    return tex;
  });
}

// Sonnenrichtung aus Equirect-Koordinaten, three.js-Konvention (equirectUv): u = atan(z,x)/2π + 0.5
export function sunDirFromUV(u, v) {
  const phi = (u - 0.5) * 2 * Math.PI;
  const theta = v * Math.PI;
  const y = Math.cos(theta), r = Math.sin(theta);
  return new THREE.Vector3(r * Math.cos(phi), y, r * Math.sin(phi)).normalize();
}

// Himmelskugel; Thema-Wechsel (n20): uniforms sky/cutV/horizon neu setzen (gfx/themes.js)
// Deko (n28, opts.clouds): Wolken (gfx/deko.js) und Himmel erst NACH der undurchsichtigen Welt zeichnen – dann rechnet der
// Himmel nur die Pixel, die frei bleiben (Tiefe 1,0 = ganz hinten), statt den ganzen Bildschirm zu übermalen.
export function makeSky(skyInfo, tex = null, opts = {}) {
  if (!tex) { tex = new THREE.Texture(); }
  const hz = new THREE.Color().setRGB(...skyInfo.horizon, THREE.SRGBColorSpace);
  const cl = !!opts.clouds;
  const mat = new THREE.ShaderMaterial({
    uniforms: { sky: { value: tex }, cutV: { value: skyInfo.cutV }, horizon: { value: hz }, exposure: { value: 1.0 }, ...(cl ? cloudUniforms(opts.sunDir) : {}) },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D sky; uniform float cutV; uniform vec3 horizon; uniform float exposure; varying vec3 vDir;
      ${cl ? CLOUD_GLSL.pars : ''}
      void main(){
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) / 6.2831853 + 0.5;
        float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
        vec3 c;
        if (v < cutV - 0.002) c = texture2D(sky, vec2(u, 1.0 - v / cutV)).rgb;
        else c = horizon;
        ${cl ? CLOUD_GLSL.main : ''}
        gl_FragColor = vec4(c * exposure, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = cl ? 1e6 : -1;
  m.name = 'sky';
  return m;
}

export async function makeEnvironment(renderer, url = 'assets/hdr/sky_1k.hdr') {
  const loader = new HDRLoader();
  loader.setDataType(THREE.FloatType);
  const hdr = await loader.loadAsync(url);
  // Sonnenscheibe kappen: Sonnenlicht kommt von der DirectionalLight (mit Schatten),
  // sonst steckt fast die ganze Sonne im unbeschattbaren Umgebungslicht.
  const d = hdr.image.data, ch = d.length / (hdr.image.width * hdr.image.height);
  for (let i = 0; i < d.length; i += ch) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (l > 4) { const k = 4 / l; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
  }
  hdr.needsUpdate = true;
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(hdr).texture;
  hdr.dispose(); pm.dispose();
  return env;
}

// Einmal gerenderte Tiefenkarte aus Sonnenrichtung über alle statischen Objekte (Layer 1)
export function bakeStaticShadow(renderer, scene, sunDir, bounds, size = 2048) {
  const cx = (bounds.minX + bounds.maxX) / 2, cz = (bounds.minZ + bounds.maxZ) / 2;
  // Rand und Abstand aus dem Radius (große Welt: Importe bis ~880 m Radius – fest 700/1400 schnitt dort ab)
  const rad = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 30 * WORLD_SCALE;
  const dist = Math.max(700, rad + bounds.maxY + 100);
  const cam = new THREE.OrthographicCamera(-rad, rad, rad, -rad, 1, 2 * dist);
  const center = new THREE.Vector3(cx, bounds.maxY * 0.3, cz);
  cam.position.copy(center).addScaledVector(sunDir, dist);
  cam.up.set(0, 1, 0);
  cam.lookAt(center);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  cam.layers.set(1);
  const dt = new THREE.DepthTexture(size, size);
  dt.type = THREE.UnsignedIntType;
  dt.compareFunction = THREE.LessEqualCompare;
  dt.minFilter = dt.magFilter = THREE.LinearFilter;
  const rt = new THREE.WebGLRenderTarget(size, size, { depthTexture: dt, depthBuffer: true, colorSpace: THREE.NoColorSpace });
  const prevBg = scene.background, prevFog = scene.fog;
  scene.background = null; scene.fog = null;
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.background = prevBg; scene.fog = prevFog;
  const bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  shadowUniforms.sbShadowMat.value.copy(bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  if (shadowUniforms.sbShadowMap.value && shadowUniforms._rt) shadowUniforms._rt.dispose();
  shadowUniforms._rt = rt;
  shadowUniforms.sbShadowMap.value = dt;
  shadowUniforms.sbTexel.value = 1 / size;
  // Versatz 1,26 m (bisher 0,0009 × 1400 m), wächst mit dem Texel (Maßstab): sonst Streifen auf flachen Flächen
  shadowUniforms.sbBias.value = 1.26 * WORLD_SCALE / (2 * dist);
  shadowUniforms.sbShadowOn.value = 1;
  return rt;
}
