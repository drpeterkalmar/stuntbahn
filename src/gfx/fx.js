// Effekte: Bremsspuren (Ringpuffer-Band), Rauch/Staub/Funken als instanzierte Partikel.
import * as THREE from 'three';

function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SkidMarks {
  constructor(scene, max = 1600) {
    this.max = max; this.n = 0; this.head = 0;
    this.pos = new Float32Array(max * 4 * 3);
    this.alpha = new Float32Array(max * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint32Array(max * 6);
    for (let i = 0; i < max; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA * 0.55); }',
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'skids';
    scene.add(this.mesh);
    this.last = [null, null, null, null];
  }
  clear() { this.alpha.fill(0); this.mesh.geometry.attributes.alpha.needsUpdate = true; this.last = [null, null, null, null]; }
  // pro Rad: Kontaktpunkt, Normale, Fahrtrichtung, Stärke 0..1
  add(k, p, n, side, strength) {
    const L = this.last[k];
    if (strength <= 0.05 || !L) { this.last[k] = strength > 0.05 ? { p: p.clone(), s: side.clone() } : null; return; }
    if (L.p.distanceToSquared(p) < 0.09) return;
    if (L.p.distanceToSquared(p) > 9) { this.last[k] = { p: p.clone(), s: side.clone() }; return; }
    const i = this.head, w = 0.13, lift = 0.03;
    const q = [
      L.p.clone().addScaledVector(L.s, -w), L.p.clone().addScaledVector(L.s, w),
      p.clone().addScaledVector(side, -w), p.clone().addScaledVector(side, w),
    ];
    for (let v = 0; v < 4; v++) {
      q[v].addScaledVector(n, lift);
      this.pos.set([q[v].x, q[v].y, q[v].z], (i * 4 + v) * 3);
      this.alpha[i * 4 + v] = Math.min(1, strength);
    }
    this.head = (this.head + 1) % this.max;
    this.n = Math.min(this.max, this.n + 1);
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    this.last[k] = { p: p.clone(), s: side.clone() };
  }
}

export class Particles {
  constructor(scene, max = 260) {
    this.max = max;
    this.p = []; for (let i = 0; i < max; i++) this.p.push({ life: 0 });
    const g = new THREE.PlaneGeometry(1, 1);
    this.iAlpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.iColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iAlpha', this.iAlpha);
    g.setAttribute('iColor', this.iColor);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: smokeTexture() } },
      vertexShader: `attribute float iAlpha; attribute vec3 iColor; varying float vA; varying vec3 vC; varying vec2 vUv;
        void main(){ vUv = uv; vA = iAlpha; vC = iColor; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; varying vec2 vUv;
        void main(){ vec4 t = texture2D(map, vUv); if (t.a * vA < 0.01) discard; gl_FragColor = vec4(vC, t.a * vA); }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'particles';
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.c = new THREE.Color(); this.t = new THREE.Vector3();
    this.next = 0; this.alive = 0;
  }
  spawn(pos, vel, size, grow, life, color, alpha = 0.6) {
    const P = this.p[this.next]; this.next = (this.next + 1) % this.max;
    P.x = pos.x; P.y = pos.y; P.z = pos.z; P.vx = vel.x; P.vy = vel.y; P.vz = vel.z;
    P.size = size; P.grow = grow; P.life = life; P.max = life; P.col = color; P.a = alpha;
  }
  update(dt, camera) {
    this.q.copy(camera.quaternion);
    let alive = 0;
    for (let k = 0; k < this.max; k++) {
      const P = this.p[k];
      if (P.life <= 0) { this.iAlpha.array[k] = 0; this.s.set(0, 0, 0); this.m4.compose(this.t.set(0, -999, 0), this.q, this.s); this.mesh.setMatrixAt(k, this.m4); continue; }
      alive++;
      P.life -= dt;
      P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt;
      P.vx *= 1 - dt * 1.5; P.vz *= 1 - dt * 1.5; P.vy += dt * 0.6;
      const t = 1 - P.life / P.max, sz = P.size + P.grow * t;
      this.s.set(sz, sz, sz);
      this.m4.compose(this.t.set(P.x, P.y, P.z), this.q, this.s);
      this.mesh.setMatrixAt(k, this.m4);
      this.c.setHex(P.col);
      this.iColor.array[k * 3] = this.c.r; this.iColor.array[k * 3 + 1] = this.c.g; this.iColor.array[k * 3 + 2] = this.c.b;
      this.iAlpha.array[k] = Math.max(0, (1 - t) * P.a);
    }
    this.alive = alive;
    this.mesh.visible = alive > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iAlpha.needsUpdate = true; this.iColor.needsUpdate = true;
  }
}

// Effekte am Fahrzeug steuern: Spuren, Reifenqualm, Staub auf Gras, Wrack-Rauch, Funken bei Aufprall
export class CarFX {
  constructor(scene) {
    this.skids = new SkidMarks(scene);
    this.parts = new Particles(scene);
    this.v = new THREE.Vector3(); this.n = new THREE.Vector3(); this.side = new THREE.Vector3(); this.p = new THREE.Vector3();
    this.acc = 0;
  }
  reset() { this.skids.clear(); }
  // pro Physikschritt: Spuren + Emission
  step(dt, car, state) {
    const sp = car.speed();
    this.acc += dt;
    const emit = this.acc > 0.035; if (emit) this.acc = 0;
    car.wheels.forEach((w, k) => {
      if (!w.contact) { this.skids.add(k, this.p, this.n, this.side, 0); return; }
      this.p.set(w.hx, w.hy, w.hz); this.n.set(w.nx, w.ny, w.nz);
      this.side.set(car.frame.r.x, car.frame.r.y, car.frame.r.z);
      const slip = Math.abs(w.slip);
      const braking = car.input.brake > 0.5 && sp > 6 && !car.input.hold ? 0.5 : 0;
      const onRoad = w.mat !== 8;
      const s = onRoad ? Math.max(0, Math.min(1, (slip - 0.18) * 3)) + braking * 0.6 : 0;
      this.skids.add(k, this.p, this.n, this.side, s * Math.min(1, sp / 6));
      if (emit && onRoad && s > 0.5 && sp > 8) this.parts.spawn(this.p, this.v.set(0, 0.6, 0), 0.6, 2.6, 1.2, 0xd8d8d8, 0.35);
      if (emit && !onRoad && sp > 5 && k >= 2) this.parts.spawn(this.p, this.v.set(car.v.x * 0.1, 0.8, car.v.z * 0.1), 0.5, 2.2, 1.0, 0xb89a6a, 0.4);
    });
    if (state === 'wreck' && emit) {
      this.p.set(car.pos.x, car.pos.y + 0.6, car.pos.z);
      this.parts.spawn(this.p, this.v.set((Math.random() - 0.5), 1.8 + Math.random(), (Math.random() - 0.5)), 1.0, 4.5, 2.4, 0x2a2a2a, 0.7);
      if (Math.random() < 0.3) this.parts.spawn(this.p, this.v.set((Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2), 0.5, 1.0, 0.5, 0xff8a2a, 0.9);
    }
    // Hüpfer: Staubwolke unter den Rädern beim Absprung (erster Schritt nach dem Auslösen)
    if (car.hopUp && car.hopT > 0 && car.hopT <= dt * 1.01) {
      for (const w of car.wheels) {
        this.p.set(w.hx || car.pos.x, (w.hy || car.pos.y - 0.5) + 0.1, w.hz || car.pos.z);
        for (let i = 0; i < 3; i++) this.parts.spawn(this.p, this.v.set((Math.random() - 0.5) * 3 + car.v.x * 0.15, 0.5 + Math.random(), (Math.random() - 0.5) * 3 + car.v.z * 0.15), 0.7, 3.2, 1.1, 0xcfc6b4, 0.45);
      }
    }
    if (car.lastImpact > 6) {
      for (let i = 0; i < 6; i++) this.parts.spawn(this.p.set(car.pos.x, car.pos.y, car.pos.z), this.v.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.18, 0.1, 0.35, 0xffc060, 1);
    }
    car.lastImpact = 0;
  }
  // pro Frame: Partikel bewegen
  update(dt, camera) {
    this.parts.update(dt, camera);
  }
}
