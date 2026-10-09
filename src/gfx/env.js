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
    uniforms: { sky: { value: tex }, cutV: { value: skyInfo.cutV }, horizon: { value: hz }, exposure: { value: 1.0 }, wSky: { value: new THREE.Vector2(1, 0) },
      // n32 Tageszeit: Nacht (Sterne, Mond: x Stärke, yzw Mond-Richtung), Abendrot (x Stärke, yzw Sonne), Tönung, alter Sonnenfleck
      wNight: { value: new THREE.Vector4(0, 0, 1, 0) }, wGlow: { value: new THREE.Vector4(0, 0, 1, 0) }, wTint: { value: new THREE.Vector3(1, 1, 1) }, wOld: { value: new THREE.Vector4(0, 0, 1, 0) },
      ...(cl ? cloudUniforms(opts.sunDir) : {}) },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform sampler2D sky; uniform float cutV; uniform vec3 horizon; uniform float exposure; uniform vec2 wSky; varying vec3 vDir;
      uniform vec4 wNight, wGlow, wOld; uniform vec3 wTint;
      float sH( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
      ${cl ? CLOUD_GLSL.pars : ''}
      void main(){
        vec3 d = normalize(vDir);
        float u = atan(d.z, d.x) / 6.2831853 + 0.5;
        float v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159265;
        vec3 c;
        if (v < cutV - 0.002) c = texture2D(sky, vec2(u, 1.0 - v / cutV)).rgb;
        else c = horizon;
        ${cl ? CLOUD_GLSL.main : ''}
        // n32 Wetter: x = Helligkeit, y = Entsättigung (1, 0 = klar, Bild unverändert)
        // n32 Tageszeit: Sonnenfleck des Himmelsbilds dämpfen (Abend/Nacht steht die Sonne woanders)
        if ( wOld.x > 0.0 ) c = mix( c, c * 0.35, smoothstep( 0.985, 0.9995, dot( d, wOld.yzw ) ) * wOld.x );
        c = mix( vec3( dot( c, vec3( 0.3, 0.59, 0.11 ) ) ), c, 1.0 - wSky.y ) * wSky.x * wTint;
        if ( wGlow.x > 0.0 ) {   // Abendrot: warmer Schein zur tiefen Sonne, am Horizont breit, Sonnenscheibe
          float sd = max( dot( d, wGlow.yzw ), 0.0 ), hzn = 1.0 - smoothstep( 0.0, 0.45, abs( d.y - 0.03 ) );
          c += wGlow.x * ( vec3( 1.0, 0.45, 0.16 ) * pow( sd, 6.0 ) * ( 0.35 + 0.9 * hzn ) + vec3( 1.0, 0.62, 0.3 ) * hzn * 0.12 + vec3( 2.4, 1.6, 0.8 ) * smoothstep( 0.99965, 0.99988, sd ) );
        }
        if ( wNight.x > 0.0 ) {   // Nacht: Sterne (Raster auf der Kugel, funkeln leicht), Mond mit Hof, Horizont-Schimmer
          vec3 sp = d * 220.0, id = floor( sp ), f = fract( sp ) - 0.5;
          float h = sH( id ), star = step( 0.985, h ) * smoothstep( 0.32, 0.0, length( f ) ) * smoothstep( 0.02, 0.25, d.y );
          float m = dot( d, wNight.yzw );
          c += wNight.x * ( vec3( 0.85, 0.9, 1.0 ) * star * ( 0.6 + 2.4 * fract( h * 91.7 ) )
            + vec3( 1.5, 1.55, 1.65 ) * smoothstep( 0.99978, 0.99988, m ) + vec3( 0.06, 0.08, 0.12 ) * pow( max( m, 0.0 ), 60.0 )
            + vec3( 0.012, 0.018, 0.035 ) * ( 1.0 - smoothstep( 0.0, 0.35, d.y ) ) );
        }
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

// n30 HDR-Diät: Umgebungs-HDRs als 512×256 (tools/hdr_diaet.mjs, Sonne schon gekappt, −6 MB), Halbfloat statt Float
// (halber Speicher, schnellere PMREM-Erzeugung beim Themenwechsel). ?hdr=1k = die bisherigen 1024×512-Dateien mit Float.
export const HDR_KLEIN = typeof location === 'undefined' || new URLSearchParams(location.search).get('hdr') !== '1k';
export function envUrl(url) {
  if (!HDR_KLEIN) return url;
  return url.replace(/\/env\.hdr$/, '/env_512.hdr').replace(/\/sky_1k\.hdr$/, '/sky_512.hdr');
}
export async function makeEnvironment(renderer, url = 'assets/hdr/sky_1k.hdr') {
  const loader = new HDRLoader();
  loader.setDataType(HDR_KLEIN ? THREE.HalfFloatType : THREE.FloatType);
  const hdr = await loader.loadAsync(envUrl(url));
  // Sonnenscheibe kappen: Sonnenlicht kommt von der DirectionalLight (mit Schatten),
  // sonst steckt fast die ganze Sonne im unbeschattbaren Umgebungslicht. (Die kleinen Dateien sind schon gekappt – die
  // Schleife ändert dann nichts, bleibt aber für ?hdr=1k und andere Himmel.)
  const d = hdr.image.data, ch = d.length / (hdr.image.width * hdr.image.height);
  if (d instanceof Uint16Array) {
    const H = THREE.DataUtils;
    for (let i = 0; i < d.length; i += ch) {
      const r = H.fromHalfFloat(d[i]), g = H.fromHalfFloat(d[i + 1]), b = H.fromHalfFloat(d[i + 2]);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (l > 4) { const k = 4 / l; d[i] = H.toHalfFloat(r * k); d[i + 1] = H.toHalfFloat(g * k); d[i + 2] = H.toHalfFloat(b * k); }
    }
  } else {
    for (let i = 0; i < d.length; i += ch) {
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l > 4) { const k = 4 / l; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; }
    }
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
