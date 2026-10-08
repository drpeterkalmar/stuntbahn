// Grafik-Kern (n30): dynamische Spiegelung im Klarlack des Hauptobjekts (Auto) – kleine Würfel-Umgebung, je Bild EINE Seite
// reihum gerendert. Damit spiegelt sich die Strecke im Lack (der wichtigste „Forza“-Eindruck in der Verfolgerkamera), statt
// nur der Himmel. Das Grund-Umgebungslicht (Himmel-HDR, vorgefiltert) bleibt; nur die Klarlack-Schicht liest den Würfel.
// Kein Vorfiltern (PMREM): der Würfel bekommt Mipmaps (eine Seite → gl.generateMipmap, billig) und der Klarlack liest die
// Mip-Stufe nach seiner Rauigkeit. Erste Fassung mit PMREM nach jeder Runde kostete am Handy-Profil jedes 6. Bild eine
// Spitze von ~25 Durchgängen (p95 +30–50 %, n30-Messung) – so bleibt es bei einer Würfelseite je Bild.
// An/aus schaltet nur ein Uniform (keine neue Shader-Übersetzung, kein Hänger).
//
// Anschluss:
//   const rx = new DynReflex(renderer, scene, { size: 128, far: 150, layer: 2 });
//   for (const m of autoMaterialien) rx.attach(m);   // nur Materialien mit Klarlack (MeshPhysicalMaterial, clearcoat > 0)
//   optional { layer: 2 }: nur Objekte mit obj.layers.enable(2) kommen in die Spiegelung (jede Seite kostet Draw-Calls)
//   je Bild vor dem Zeichnen: rx.update(autoRoot, { hide: [autoRoot], hoehe: 0.9, vor, nach });
//   aus/an: rx.setEnabled(false)
//   Wichtig: erst updaten, wenn die Schattenkarten existieren (sonst bindet three.js eine leere Textur an den
//   Schatten-Sampler → GL_INVALID_OPERATION „Mismatch between texture format and sampler type“) – siehe o.skip
import * as THREE from 'three';

export class DynReflex {
  constructor(renderer, scene, o = {}) {
    this.r = renderer; this.scene = scene;
    this.size = o.size || 128;
    this.rt = new THREE.WebGLCubeRenderTarget(this.size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.cam = new THREE.CubeCamera(o.near ?? 0.3, o.far ?? 150, this.rt);
    // o.layer: nur Objekte auf dieser Ebene spiegeln (Himmel, Strecke, Gelände, Kulisse, Bäume) – Gras, Teilchen, Kleinkram
    // kosten Draw-Calls und sieht man im Lack nicht
    if (o.layer != null) for (const c of this.cam.children) c.layers.set(o.layer);
    // Kosten-Regler: takt = nur jedes takt-te Bild eine Seite (1 = jedes Bild)
    this.takt = Math.max(1, o.takt || 1); this.zaehler = 0;
    this.face = 0; this.runden = 0; this.enabled = true; this.mats = new Set();
    this.bereit = false;   // erst nach der ersten vollen Runde einblenden (sonst schwarze Seiten)
    // gemeinsame Uniforms aller angehängten Materialien: K = Anteil der Würfel-Spiegelung (0 = aus), Mip = höchste Stufe
    this.U = { sbDynCube: { value: this.rt.texture }, sbDynK: { value: 0 }, sbDynMip: { value: Math.log2(this.size) } };
    this.stats = { seiten: 0, calls: 0 };
  }
  attach(mat) {
    if (this.mats.has(mat)) return;
    this.mats.add(mat);
    const U = this.U, prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev(sh, r);
      Object.assign(sh.uniforms, U);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform samplerCube sbDynCube; uniform float sbDynK, sbDynMip;')
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
        #if defined( RE_IndirectSpecular ) && defined( USE_CLEARCOAT )
        if ( sbDynK > 0.0 ) {
          vec3 sbR = normalize( inverseTransformDirection( reflect( - geometryViewDir, geometryClearcoatNormal ), viewMatrix ) );
          vec3 sbDyn = textureLod( sbDynCube, sbR, sbDynMip * clamp( pow( material.clearcoatRoughness, 0.7 ), 0.0, 1.0 ) ).rgb;
          #ifdef USE_ENVMAP
            sbDyn *= envMapIntensity;
          #endif
          clearcoatRadiance = mix( clearcoatRadiance, sbDyn, sbDynK );
        }
        #endif`);
    };
    const pk = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : () => '';
    mat.customProgramCacheKey = () => pk() + '|dynrefl';
    mat.needsUpdate = true;
  }
  setEnabled(on) {
    this.enabled = on;
    this.U.sbDynK.value = on && this.bereit ? 1 : 0;
  }
  // Eine Würfelseite um `ziel` (Object3D, z. B. Auto) rendern. o.hide: Objekte, die nicht in die eigene Spiegelung gehören.
  // o.skip = true: diese Runde nichts tun (Auto nicht sichtbar, weit weg, Cockpit) – kostet dann nichts.
  // o.vor/o.nach: um das Zeichnen der Seite (z. B. Himmel heller, weil ein 8-bit-Himmelsbild die HDR-Umgebung ersetzt)
  update(ziel, o = {}) {
    if (!this.enabled || o.skip) return false;
    if (this.bereit && (this.zaehler++ % this.takt) !== 0) return false;
    const r = this.r, cam = this.cam;
    if (cam.coordinateSystem !== r.coordinateSystem) { cam.coordinateSystem = r.coordinateSystem; cam.updateCoordinateSystem(); }   // wie CubeCamera.update
    ziel.getWorldPosition(cam.position);
    cam.position.y += o.hoehe ?? 0.9;
    cam.updateMatrixWorld(true);
    const hidden = [];
    for (const h of o.hide || []) if (h.visible) { h.visible = false; hidden.push(h); }
    const prevRT = r.getRenderTarget(), prevAF = r.getActiveCubeFace(), prevML = r.getActiveMipmapLevel();
    const prevSh = r.shadowMap.autoUpdate, prevXr = r.xr.enabled;
    r.shadowMap.autoUpdate = false;   // Schattenkarte vom letzten Bild weiterverwenden (das Auto ist hier ohnehin aus)
    r.xr.enabled = false;
    const c = cam.children[this.face];
    if (o.vor) o.vor();
    r.setRenderTarget(this.rt, this.face);
    const c0 = r.info.render.calls;
    r.render(this.scene, c);   // three.js erzeugt danach die Mipmaps des Würfels (generateMipmaps)
    this.stats.calls = r.info.render.calls - c0;   // Draw-Calls dieser Seite (bei info.autoReset = false)
    if (o.nach) o.nach();
    r.setRenderTarget(prevRT, prevAF, prevML);
    r.shadowMap.autoUpdate = prevSh; r.xr.enabled = prevXr;
    for (const h of hidden) h.visible = true;
    this.stats.seiten++;
    this.face = (this.face + 1) % 6;
    if (this.face === 0) {
      this.runden++;
      if (!this.bereit) { this.bereit = true; this.setEnabled(this.enabled); }
    }
    return true;
  }
  dispose() { this.setEnabled(false); this.rt.dispose(); }
}
