// Grafik-Kern (n30): dynamische Spiegelung am Hauptobjekt (Auto) – kleine Würfel-Umgebung, je Bild EINE Seite reihum
// gerendert, nach jeder vollen Runde (6 Bilder) einmal vorgefiltert (three.js PMREM über needsPMREMUpdate). Damit spiegelt
// sich die Strecke im Lack (der wichtigste „Forza“-Eindruck in der Verfolgerkamera), statt nur der Himmel.
// Kosten je Bild: eine Würfelseite (Szene ohne das Auto, Bildwinkel 90°, Sichtweite `far`), alle 6 Bilder ein PMREM-Lauf.
//
// Anschluss:
//   const rx = new DynReflex(renderer, scene, { size: 128 });   // Größe wie die PMREM-Würfelgröße der Umgebung (512er-Equirect → 128), sonst eigene Shader-Variante
//   for (const m of autoMaterialien) rx.attach(m);            // envMap = Würfel (statt scene.environment)
//   je Bild vor dem Zeichnen: rx.update(autoRoot, { hide: [autoRoot], hoehe: 0.9 });
//   aus/an: rx.setEnabled(false)  → Materialien bekommen wieder ihr altes envMap (null = scene.environment)
import * as THREE from 'three';

export class DynReflex {
  constructor(renderer, scene, o = {}) {
    this.r = renderer; this.scene = scene;
    this.size = o.size || 128;
    this.rt = new THREE.WebGLCubeRenderTarget(this.size, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    this.cam = new THREE.CubeCamera(o.near ?? 0.3, o.far ?? 320, this.rt);
    this.face = 0; this.runden = 0; this.enabled = true; this.mats = new Map();
    this.bereit = false;   // erst nach der ersten vollen Runde an die Materialien hängen (sonst schwarz/halb)
    this.stats = { seiten: 0, pmrem: 0 };
  }
  attach(mat, intensity = null) {
    if (this.mats.has(mat)) return;
    this.mats.set(mat, { envMap: mat.envMap, intensity: mat.envMapIntensity });
    if (intensity != null) this.mats.get(mat).ziel = intensity;
    if (this.bereit && this.enabled) this.anwenden(mat);
  }
  anwenden(mat) {
    const a = this.mats.get(mat);
    mat.envMap = this.rt.texture;
    if (a.ziel != null) mat.envMapIntensity = a.ziel;
    mat.needsUpdate = true;
  }
  setEnabled(on) {
    if (on === this.enabled) return;
    this.enabled = on;
    for (const [m, a] of this.mats) {
      if (on && this.bereit) this.anwenden(m);
      else { m.envMap = a.envMap; m.envMapIntensity = a.intensity; m.needsUpdate = true; }
    }
  }
  // Eine Würfelseite um `ziel` (Object3D, z. B. Auto) rendern. o.hide: Objekte, die nicht in die eigene Spiegelung gehören.
  // o.skip = true: diese Runde nichts tun (Auto nicht sichtbar, weit weg, Cockpit) – kostet dann nichts.
  update(ziel, o = {}) {
    if (!this.enabled || o.skip) return false;
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
    r.setRenderTarget(this.rt, this.face);
    r.render(this.scene, c);
    r.setRenderTarget(prevRT, prevAF, prevML);
    r.shadowMap.autoUpdate = prevSh; r.xr.enabled = prevXr;
    for (const h of hidden) h.visible = true;
    this.stats.seiten++;
    this.face = (this.face + 1) % 6;
    if (this.face === 0) {
      this.runden++;
      this.rt.texture.needsPMREMUpdate = true;   // three.js filtert beim nächsten Gebrauch vor (Rauigkeit → Mip-Stufen)
      this.stats.pmrem++;
      if (!this.bereit) { this.bereit = true; for (const m of this.mats.keys()) this.anwenden(m); }
    }
    return true;
  }
  dispose() { this.setEnabled(false); this.rt.dispose(); }
}
