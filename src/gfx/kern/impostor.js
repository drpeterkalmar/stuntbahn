// Grafik-Kern, Baustein 4 (n30): Oktaeder-Impostors zur Laufzeit – ein InstancedMesh je Art (1 Draw-Call), jede Instanz
// ein Viereck, das zur Kamera zeigt; der Shader wählt aus dem gebackenen Atlas (tools/build_impostor.mjs, 8×8 Ansichten
// der oberen Halbkugel) die 3 nächsten Ansichten und mischt sie. Licht kommt aus der gebackenen Normalen-Ansicht (Objekt-
// raum) → three.js-Beleuchtung wie alle anderen Materialien (Sonne, Umgebungslicht, Nebel, gebackener Sonnenschatten).
//
// Anschluss:
//   const bib = new ImpostorBibliothek('assets/tex/imp/impostor.json', renderer);
//   await bib.vorladen(['tanne0', 'tanne1']);                  // fehlt der Atlas → bib.art(name) = null → Karten wie bisher
//   const mesh = impostorMesh(bib.art('tanne0'), [{ x, y, z, rot, s }], 'trees0', { patch: patchStaticShadow });
// Atlas-Daten (impostor.json): { version, arten: { name: { farbe, normalen, N, zelle, radius, mitte, hoehe } } }
//   radius = halbe Kantenlänge einer Ansicht (m), mitte = Höhe der Objektmitte über dem Fuß (m).
import * as THREE from 'three';
import { OKT_GLSL } from './oktaeder.js';

export class ImpostorBibliothek {
  constructor(url, renderer, o = {}) {
    this.url = url; this.r = renderer; this.basis = url.replace(/[^/]*$/, '');
    this.meta = null; this.metaP = null; this.arten = new Map(); this.aus = !!o.aus; this.fehler = null;
  }
  ladeMeta() {
    if (this.aus) return Promise.resolve(null);
    if (!this.metaP) this.metaP = fetch(this.url).then((x) => (x.ok ? x.json() : null)).catch(() => null).then((m) => { this.meta = m; return m; });
    return this.metaP;
  }
  // Atlanten der genannten Arten laden (je Art einmal); unbekannte Arten werden übersprungen
  async vorladen(namen) {
    const m = await this.ladeMeta();
    if (!m || !m.arten) return 0;
    const tl = new THREE.TextureLoader(), aniso = this.r ? Math.min(4, this.r.capabilities.getMaxAnisotropy()) : 1;
    const lade = (f, srgb) => tl.loadAsync(this.basis + f).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = aniso;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
      return t;
    });
    const jobs = [];
    for (const n of namen) {
      const a = m.arten[n];
      if (!a || this.arten.has(n)) continue;
      const p = Promise.all([lade(a.farbe, true), lade(a.normalen, false)])
        .then(([farbe, nor]) => ({ name: n, farbe, nor, ...a }))
        .catch((e) => { this.fehler = String(e && e.message || e); return null; });
      this.arten.set(n, p);
      jobs.push(p.then((x) => { this.arten.set(n, x); }));
    }
    await Promise.all(jobs);
    return jobs.length;
  }
  // geladene Art oder null (noch nicht geladen / kein Atlas)
  art(n) { const a = this.arten.get(n); return a && !(a instanceof Promise) ? a : null; }
}

// Material: MeshStandardMaterial mit eingehängtem Impostor-Teil (damit Licht, Nebel, Tonemapping, Schatten-Patches der
// Welt gleich bleiben). opts: color (Albedo-Faktor), tint/snow (Uniform-Objekte der Themen, optional), patch(mat) z. B.
// patchStaticShadow, einfach = nur die nächste Ansicht (billiger, springt beim Umrunden sichtbar)
const matCache = new WeakMap();
export function impostorMaterial(art, opts = {}) {
  let per = matCache.get(art.farbe);
  if (!per) matCache.set(art.farbe, per = {});
  const key = (opts.key || 'm') + (opts.einfach ? '1' : '3');
  if (per[key]) return per[key];
  const m = new THREE.MeshStandardMaterial({ color: opts.color ?? 0xffffff, roughness: opts.roughness ?? 0.9, metalness: 0, alphaTest: 0.5, alphaToCoverage: true, side: THREE.FrontSide, emissive: opts.emissive ?? 0x000000 });
  const U = {
    impFarbe: { value: art.farbe }, impNor: { value: art.nor }, impN: { value: art.N || 8 },
    impRadius: { value: art.radius }, impMitte: { value: art.mitte }, impRand: { value: 0.5 / (art.zelle || 128) },
    impTint: opts.tint || { value: new THREE.Vector3(1, 1, 1) }, impSchnee: opts.snow || { value: 0 },
  };
  const fn = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
      uniform float impN, impRadius, impMitte;
      varying vec4 vImpA, vImpB, vImpC;   // xy = UV in der Zelle, zw = Zelle (i, j)
      varying vec3 vImpW;                 // Gewichte der 3 Ansichten
      varying vec3 vImpX, vImpY, vImpZ;   // Objekt → Welt (Drehung, für die Normalen)
      ${OKT_GLSL}
      vec4 impUv( vec2 f, vec3 P, vec3 E, vec3 C ) {
        vec3 n = oktDek( f / ( impN - 1.0 ) ), r, u; oktBasis( n, r, u );
        vec3 v = P - E;
        float t = dot( C - E, n ) / ( abs( dot( v, n ) ) > 1e-5 ? dot( v, n ) : 1e-5 );
        vec3 q = E + v * t - C;
        return vec4( vec2( dot( q, r ), dot( q, u ) ) / ( 2.0 * impRadius ) + 0.5, f );
      }`)
      .replace('#include <begin_vertex>', `
      mat4 impM = modelMatrix;
      #ifdef USE_INSTANCING
        impM = impM * instanceMatrix;
      #endif
      vec3 impE = ( inverse( impM ) * vec4( cameraPosition, 1.0 ) ).xyz;   // Kamera im Objektraum
      vec3 impC = vec3( 0.0, impMitte, 0.0 );
      vec3 impD = normalize( impE - impC );
      vec3 impR, impU; oktBasis( impD, impR, impU );
      vec3 transformed = impC + ( impR * position.x + impU * position.y ) * impRadius;
      vec2 impG = clamp( oktKod( impD ) * ( impN - 1.0 ), 0.0, impN - 1.0 - 1e-3 ), impI = floor( impG ), impF = impG - impI;
      vec2 fA, fB, fC;
      if ( impF.x + impF.y < 1.0 ) { fA = impI; fB = impI + vec2( 1.0, 0.0 ); fC = impI + vec2( 0.0, 1.0 ); vImpW = vec3( 1.0 - impF.x - impF.y, impF.x, impF.y ); }
      else { fA = impI + 1.0; fB = impI + vec2( 0.0, 1.0 ); fC = impI + vec2( 1.0, 0.0 ); vImpW = vec3( impF.x + impF.y - 1.0, 1.0 - impF.x, 1.0 - impF.y ); }
      vImpA = impUv( fA, transformed, impE, impC ); vImpB = impUv( fB, transformed, impE, impC ); vImpC = impUv( fC, transformed, impE, impC );
      mat3 impW3 = mat3( impM );
      vImpX = normalize( impW3[ 0 ] ); vImpY = normalize( impW3[ 1 ] ); vImpZ = normalize( impW3[ 2 ] );`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
      uniform sampler2D impFarbe, impNor; uniform float impN, impSchnee, impRand; uniform vec3 impTint;
      varying vec4 vImpA, vImpB, vImpC; varying vec3 vImpW, vImpX, vImpY, vImpZ;
      vec2 impAt( vec4 a ) { return ( a.zw + clamp( a.xy, impRand, 1.0 - impRand ) ) / impN; }   // nicht in die Nachbar-Zelle greifen
      vec3 impNW = vec3( 0.0, 1.0, 0.0 );`)
      .replace('#include <map_fragment>', `{
        ${opts.einfach ? `
        float wm = max( vImpW.x, max( vImpW.y, vImpW.z ) );
        vec4 a = vImpW.x >= wm ? vImpA : vImpW.y >= wm ? vImpB : vImpC;
        vec4 c = texture2D( impFarbe, impAt( a ) ); vec3 nO = texture2D( impNor, impAt( a ) ).xyz * 2.0 - 1.0;` : `
        vec4 c = texture2D( impFarbe, impAt( vImpA ) ) * vImpW.x + texture2D( impFarbe, impAt( vImpB ) ) * vImpW.y + texture2D( impFarbe, impAt( vImpC ) ) * vImpW.z;
        vec3 nO = ( texture2D( impNor, impAt( vImpA ) ).xyz * vImpW.x + texture2D( impNor, impAt( vImpB ) ).xyz * vImpW.y + texture2D( impNor, impAt( vImpC ) ).xyz * vImpW.z ) * 2.0 - 1.0;`}
        impNW = normalize( mat3( vImpX, vImpY, vImpZ ) * nO );
        diffuseColor.rgb *= c.rgb * impTint;
        diffuseColor.a *= c.a;
        // Schnee (Thema Winter): oben liegende Flächen weiß
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.95 ), impSchnee * smoothstep( 0.35, 0.8, impNW.y ) * 0.85 );
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      normal = normalize( ( viewMatrix * vec4( impNW, 0.0 ) ).xyz );`);
  };
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => { if (prev) prev(sh, r); fn(sh, r); };
  m.customProgramCacheKey = () => 'impostor' + (opts.einfach ? '1' : '3');
  if (opts.patch) opts.patch(m);   // z. B. patchStaticShadow (hängt sich hinten an)
  m.name = 'impostor_' + art.name;
  per[key] = m;
  return m;
}

// Instanzen: list [{ x, y, z, rot, s, sy? }] (Fuß des Objekts, Drehung um y, Maßstab). Ein Draw-Call.
export function impostorMesh(art, list, name, opts = {}) {
  const g = new THREE.PlaneGeometry(2, 2);
  // Hüllkugel des Vierecks liegt um die Objektmitte (sonst schneidet das Frustum-Culling hohe Bäume ab)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, art.mitte, 0), art.radius * 1.5);
  g.boundingBox = new THREE.Box3(new THREE.Vector3(-art.radius, art.mitte - art.radius, -art.radius), new THREE.Vector3(art.radius, art.mitte + art.radius, art.radius));
  const mat = opts.material || impostorMaterial(art, opts);
  const im = new THREE.InstancedMesh(g, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((it, k) => {
    q.setFromAxisAngle(up, it.rot || 0);
    s.set(it.s ?? 1, (it.s ?? 1) * (it.sy ?? 1), it.s ?? 1);
    p.set(it.x, it.y, it.z);
    m4.compose(p, q, s);
    im.setMatrixAt(k, m4);
  });
  im.computeBoundingSphere();
  im.name = name;
  im.userData.impostor = art.name;
  return im;
}
