// KI-Gegner darstellen (n34): je Gegner ein eigenes Auto (gfx/carmesh.js makeCar, eigener Lack) mit LOD-Stufen wie das
// Heldenauto, Echtzeit-Schatten nur nah (SCHATTEN_NAH m), Namensschild (Startnummer + Name, Lackfarbe) als Sprite über dem
// Auto (ausblendbar, Option „Namen-Schilder“). Rennen: Lage aus der Physik (zwischen zwei Physikschritten interpoliert wie
// beim Spieler); Replay: aus der 15-Hz-Aufzeichnung (gleiches Format wie das Geisterauto). Autos werden einmal gebaut und
// zwischen Rennen wiederverwendet (höchstens GEGNER_MAX). Im Browser NICHT geprüft (Vorbau n34).
import * as THREE from 'three';
import { makeCar } from './carmesh.js';
import { GEGNER_MAX } from '../ai/gegner.js';

export const SCHATTEN_NAH = 60;          // m: weiter weg werfen Gegner keinen Echtzeit-Schatten (Kontaktschatten bleibt)
export const SCHILD = { hoch: 1.95, weit: 260, nah: 6, breite: 2.6, min: 1.1, max: 7, k: 0.03 };   // m; Größe wächst mit dem Abstand
const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), v3 = new THREE.Vector3();

// Namensschild: Canvas 256 × 64, Startnummer im Lack-Kreis, Name weiß auf dunklem Grund
function schildTextur(nummer, name, farbe) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(14,17,22,0.72)';
  const r = 14; g.beginPath(); g.moveTo(r, 4); g.arcTo(252, 4, 252, 60, r); g.arcTo(252, 60, 4, 60, r); g.arcTo(4, 60, 4, 4, r); g.arcTo(4, 4, 252, 4, r); g.closePath(); g.fill();
  g.fillStyle = '#' + farbe.toString(16).padStart(6, '0');
  g.beginPath(); g.arc(34, 32, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.55)'; g.strokeText(String(nummer), 34, 33); g.fillText(String(nummer), 34, 33);
  g.textAlign = 'left'; g.font = '600 25px system-ui, sans-serif';
  let t = name; while (g.measureText(t).width > 186 && t.length > 3) t = t.slice(0, -2) + '…';
  g.fillText(t, 64, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  return tex;
}

export class GegnerVis {
  constructor(scene) {
    this.scene = scene; this.autos = []; this.aktiv = 0; this.schilder = true; this.lods = null;
    this.prev = [];   // Lage vor dem letzten Physikschritt je Gegner (Interpolation)
  }
  // Autos bauen/umfärben für die Fahrer des Felds (async beim ersten Mal; danach sofort)
  async bereit(infos, lods = null) {
    if (lods) this.lods = lods;
    while (this.autos.length < Math.min(infos.length, GEGNER_MAX)) {
      const car = await makeCar({ color: 0xffffff, contact: true });
      car.root.visible = false; car.root.name = 'gegner';
      if (this.lods) { car.addLod(this.lods[0], 1); car.addLod(this.lods[1], 2); }
      this.scene.add(car.root);
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: true, toneMapped: false, fog: false });
      const tag = new THREE.Sprite(mat); tag.visible = false; tag.renderOrder = 6; tag.name = 'gegner-schild';
      this.scene.add(tag);
      this.autos.push({ car, tag, schatten: true, key: '' });
    }
    infos.forEach((g, i) => {
      const A = this.autos[i]; if (!A) return;
      A.car.setPaint(g.farbe);
      const key = g.nummer + '|' + g.name + '|' + g.farbe;
      if (A.key !== key) { if (A.tag.material.map) A.tag.material.map.dispose(); A.tag.material.map = schildTextur(g.nummer, g.name, g.farbe); A.tag.material.needsUpdate = true; A.key = key; }
    });
    this.aktiv = Math.min(infos.length, this.autos.length);
    for (let i = this.aktiv; i < this.autos.length; i++) { this.autos[i].car.root.visible = false; this.autos[i].tag.visible = false; }
    this.prev.length = 0;
  }
  // LOD-Modelle nachgeladen (main.js loadCarLods): an schon gebaute Gegner hängen
  addLods(lods) {
    if (this.lods) return;
    this.lods = lods;
    for (const A of this.autos) { A.car.addLod(lods[0], 1); A.car.addLod(lods[1], 2); }
  }
  // vor jedem Physikschritt: Lage merken (für die Interpolation wie beim Spieler, main.js prevPose)
  merke(feld) {
    feld.fahrer.forEach((g, i) => {
      const c = g.car, p = this.prev[i] || (this.prev[i] = { p: [0, 0, 0], q: [0, 0, 0, 1], ok: false });
      p.p[0] = c.pos.x; p.p[1] = c.pos.y; p.p[2] = c.pos.z; p.q[0] = c.q.x; p.q[1] = c.q.y; p.q[2] = c.q.z; p.q[3] = c.q.w; p.ok = true;
    });
  }
  // je Bild im Rennen: a = Anteil des angebrochenen Physikschritts (acc / DT)
  sync(feld, camera, a = 1) {
    for (let i = 0; i < this.aktiv; i++) {
      const g = feld.fahrer[i], A = this.autos[i];
      if (!g) { A.car.root.visible = false; A.tag.visible = false; continue; }
      const c = g.car, P = this.prev[i];
      let pose;
      // nach einem Reset/Wechsel (Sprung > 8 m) nicht interpolieren
      if (P && P.ok && a < 1 && Math.hypot(c.pos.x - P.p[0], c.pos.y - P.p[1], c.pos.z - P.p[2]) < 8) {
        qa.set(P.q[0], P.q[1], P.q[2], P.q[3]); qb.set(c.q.x, c.q.y, c.q.z, c.q.w); qa.slerp(qb, a);
        pose = { pos: { x: P.p[0] + (c.pos.x - P.p[0]) * a, y: P.p[1] + (c.pos.y - P.p[1]) * a, z: P.p[2] + (c.pos.z - P.p[2]) * a }, q: { x: qa.x, y: qa.y, z: qa.z, w: qa.w } };
      } else pose = { pos: c.pos, q: c.q };
      pose.air = c.onGround === 0 && !c.surfaceKind && !c.crash;
      A.car.root.visible = true;
      A.car.sync(c, 1, pose);
      this.nachbereiten(A, camera, g.zustand === 'crash');
    }
  }
  // Replay: Lage aus den Aufzeichnungen (feld.fahrer[i].aufnahme()) zur Rennzeit t (s ab „Los!“)
  syncReplay(aufnahmen, t, camera) {
    for (let i = 0; i < this.aktiv; i++) {
      const A = this.autos[i], D = aufnahmen && aufnahmen[i];
      if (!D || D.frames < 2) { A.car.root.visible = false; A.tag.visible = false; continue; }
      const f = Math.max(0, t) * D.hz, k = Math.min(D.frames - 2, Math.floor(f)), u = Math.min(1, Math.max(0, f - k));
      const d = D.data, o = k * 8, p = o + 8;
      qa.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]).normalize(); qb.set(d[p + 3], d[p + 4], d[p + 5], d[p + 6]).normalize(); qa.slerp(qb, u);
      const sprung = Math.hypot(d[p] - d[o], d[p + 1] - d[o + 1], d[p + 2] - d[o + 2]) > 8;   // Reset zwischen den Bildern
      const w = sprung ? 0 : u;
      A.car.root.position.set(d[o] + (d[p] - d[o]) * w, d[o + 1] + (d[p + 1] - d[o + 1]) * w, d[o + 2] + (d[p + 2] - d[o + 2]) * w);
      A.car.root.quaternion.copy(qa);
      A.car.root.visible = true;
      this.nachbereiten(A, camera, (d[o + 7] & 1) === 1);
    }
  }
  // LOD, Schatten nur nah, Namensschild
  nachbereiten(A, camera, crash) {
    const r = A.car.root;
    A.car.updateLod(camera, { min: 1 });   // Gegner nie mit dem vollen Heldenmodell (Dreiecke): ab Mittel-LOD
    const dist = camera.position.distanceTo(r.position);
    const nah = dist < SCHATTEN_NAH;
    if (nah !== A.schatten) { A.schatten = nah; r.traverse((o) => { if (o.isMesh && !o.userData.fx) o.castShadow = nah; }); }
    const T = A.tag;
    T.visible = this.schilder && !crash && dist > SCHILD.nah && dist < SCHILD.weit && r.visible;
    if (T.visible) {
      // über dem Auto in Welt-Oben (auch im Looping lesbar), Größe wächst mit dem Abstand (bleibt lesbar)
      v3.set(0, SCHILD.hoch, 0);
      T.position.copy(r.position).add(v3);
      const s = Math.max(SCHILD.min, Math.min(SCHILD.max, dist * SCHILD.k)) * SCHILD.breite / 2.6;
      T.scale.set(s * 4, s, 1);
      T.material.opacity = Math.min(1, (SCHILD.weit - dist) / 40);
    }
  }
  hide() { for (const A of this.autos) { A.car.root.visible = false; A.tag.visible = false; } this.aktiv = 0; }
  // für die Schatten-Pässe/Spiegel-Listen in main.js
  roots() { return this.autos.slice(0, this.aktiv).map((A) => A.car.root); }
}
