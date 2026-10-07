// Effekte: Bremsspuren (Ringpuffer-Band), Rauch/Staub/Funken als instanzierte Partikel.
import * as THREE from 'three';
import { DEKO } from './deko.js';

// Rauch-/Staubwolke (n17): weicher Rand + Wolken-Rauschen (statt glatter Scheibe), Alpha in der Textur, kein Bild nötig
function smokeTexture() {
  const N = 64, data = new Uint8Array(N * N * 4);
  let seed = 77; const R = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const oct = [[4, 0.5], [8, 0.3], [16, 0.2]].map(([g, a]) => { const v = new Float32Array(g * g); for (let i = 0; i < v.length; i++) v[i] = R(); return { g, a, v }; });
  const sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let n = 0;
    for (const { g, a, v } of oct) {
      const fx = x / N * g, fy = y / N * g, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = sm(fx - x0), ty = sm(fy - y0);
      const V = (i, j) => v[((j % g + g) % g) * g + ((i % g + g) % g)];
      n += a * ((V(x0, y0) * (1 - tx) + V(x0 + 1, y0) * tx) * (1 - ty) + (V(x0, y0 + 1) * (1 - tx) + V(x0 + 1, y0 + 1) * tx) * ty);
    }
    const r = Math.hypot(x + 0.5 - N / 2, y + 0.5 - N / 2) / (N / 2);
    const a = Math.max(0, 1 - r) ** 1.4 * (0.45 + 0.9 * n);
    const k = (y * N + x) * 4; data[k] = data[k + 1] = data[k + 2] = Math.round(225 + 30 * n); data[k + 3] = Math.round(255 * Math.min(1, a));
  }
  const t = new THREE.DataTexture(data, N, N); t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
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
    // Deko (n28): weiche Ränder (Gummi-Abrieb statt Klebeband) und Verblassen nach ~20–35 s (Alter je Ecke, Uhr im Shader)
    this.now = 0;
    if (DEKO) {
      this.aT = new Float32Array(max * 4); this.aE = new Float32Array(max * 4);
      for (let i = 0; i < max; i++) this.aE.set([0, 1, 0, 1], i * 4);
      g.setAttribute('aT', new THREE.BufferAttribute(this.aT, 1).setUsage(THREE.DynamicDrawUsage));
      g.setAttribute('aE', new THREE.BufferAttribute(this.aE, 1));
    }
    this.uNow = { value: 0 };
    const m = DEKO ? new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, uniforms: { uNow: this.uNow },
      vertexShader: 'attribute float alpha, aT, aE; uniform float uNow; varying float vA, vE; void main(){ vA = alpha * ( 1.0 - smoothstep( 20.0, 35.0, uNow - aT ) ); vE = aE; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA, vE; void main(){ float e = smoothstep( 0.0, 0.32, min( vE, 1.0 - vE ) ); gl_FragColor = vec4(0.025,0.022,0.02, vA * 0.6 * ( 0.35 + 0.65 * e )); }',
    }) : new THREE.ShaderMaterial({
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
      if (this.aT) this.aT[i * 4 + v] = this.now;
    }
    if (this.aT) this.mesh.geometry.attributes.aT.needsUpdate = true;
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
        void main(){ vUv = uv; vC = iColor;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vA = iAlpha * smoothstep(0.6, 2.2, -mv.z);   // nah an der Kamera ausblenden (keine bildfüllenden Flächen)
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying float vA; varying vec3 vC; varying vec2 vUv;
        void main(){ vec4 t = texture2D(map, vUv); if (t.a * vA < 0.01) discard; gl_FragColor = vec4(vC * t.rgb, t.a * vA);
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.mesh = new THREE.InstancedMesh(g, mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'particles';
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.c = new THREE.Color(); this.t = new THREE.Vector3();
    this.qr = new THREE.Quaternion(); this.zAx = new THREE.Vector3(0, 0, 1);
    this.next = 0; this.alive = 0;
  }
  spawn(pos, vel, size, grow, life, color, alpha = 0.6) {
    const P = this.p[this.next]; this.next = (this.next + 1) % this.max;
    P.x = pos.x; P.y = pos.y; P.z = pos.z; P.vx = vel.x; P.vy = vel.y; P.vz = vel.z;
    P.size = size; P.grow = grow; P.life = life; P.max = life; P.col = color; P.a = alpha;
    P.rot = Math.random() * 6.283; P.spin = (Math.random() - 0.5) * 1.2;
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
      P.rot += P.spin * dt;
      this.qr.setFromAxisAngle(this.zAx, P.rot).premultiply(this.q);
      this.m4.compose(this.t.set(P.x, P.y, P.z), this.qr, this.s);
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

// Funken (n17): kurze, glühende Striche entlang der Flugrichtung (Bewegungsspur), fallen mit Schwerkraft, prallen ab.
// Ein Mesh mit 4 Ecken je Funke, Ecken jedes Bild auf der CPU zur Kamera gedreht; additiv und heller als Weiß
// (toneMapped: false) → der Bloom des Kino-Looks lässt sie glühen. 1 Draw-Call.
export class Sparks {
  constructor(scene, max = 160) {
    this.max = max; this.p = []; for (let i = 0; i < max; i++) this.p.push({ life: 0 });
    this.pos = new Float32Array(max * 4 * 3); this.col = new Float32Array(max * 4 * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) { const a = i * 4; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; this.mesh.name = 'sparks';
    scene.add(this.mesh);
    this.next = 0; this.alive = 0;
    this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.d = new THREE.Vector3(); this.v = new THREE.Vector3(); this.sd = new THREE.Vector3();
  }
  spawn(x, y, z, vx, vy, vz, life, floor = y - 0.05) {
    const P = this.p[this.next]; this.next = (this.next + 1) % this.max;
    Object.assign(P, { x, y, z, vx, vy, vz, life, max: life, y0: floor });
  }
  update(dt, camera) {
    let alive = 0; const cp = camera.position;
    for (let k = 0; k < this.max; k++) {
      const P = this.p[k], o = k * 12, oc = k * 16;
      if (P.life <= 0) { this.col.fill(0, oc, oc + 16); continue; }
      alive++;
      P.life -= dt;
      P.vy -= 9.81 * dt; P.vx *= 1 - dt * 0.8; P.vz *= 1 - dt * 0.8;
      P.x += P.vx * dt; P.y += P.vy * dt; P.z += P.vz * dt;
      if (P.y < P.y0 && P.vy < 0) { P.y = P.y0; P.vy *= -0.35; P.vx *= 0.6; P.vz *= 0.6; }   // vom Boden abprallen
      const t = Math.max(0, P.life / P.max);
      this.a.set(P.x, P.y, P.z);
      this.b.set(P.x - P.vx * 0.035, P.y - P.vy * 0.035, P.z - P.vz * 0.035);
      this.d.subVectors(this.a, this.b); this.v.subVectors(this.a, cp);
      this.sd.crossVectors(this.d, this.v).normalize().multiplyScalar(0.012 + 0.01 * t);
      const q = [this.a.x + this.sd.x, this.a.y + this.sd.y, this.a.z + this.sd.z, this.a.x - this.sd.x, this.a.y - this.sd.y, this.a.z - this.sd.z,
        this.b.x + this.sd.x, this.b.y + this.sd.y, this.b.z + this.sd.z, this.b.x - this.sd.x, this.b.y - this.sd.y, this.b.z - this.sd.z];
      this.pos.set(q, o);
      // weißgelb → orange → rot beim Abkühlen; Kopf hell, Schweif dunkel
      const hot = t * t, r = 4.5 * (0.5 + 0.5 * t), gC = 3.4 * hot + 0.8 * t, bC = 1.8 * hot * hot;
      for (let v = 0; v < 4; v++) { const tail = v >= 2 ? 0.25 : 1; this.col.set([r * tail, gC * tail, bC * tail, t], oc + v * 4); }
    }
    this.alive = alive; this.mesh.visible = alive > 0;
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
}

// Effekte am Fahrzeug steuern: Spuren, Reifenqualm, Staub auf Gras, Wrack-Rauch, Funken bei Aufprall
export class CarFX {
  constructor(scene) {
    this.skids = new SkidMarks(scene);
    this.parts = new Particles(scene);
    this.sparks = new Sparks(scene);
    this.rich = true;   // Kino-Look: mehr Rauch/Staub, Funken (Grafik „Einfach“: wie bisher)
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
      if (emit && onRoad && s > 0.5 && sp > 8) {
        // Reifenrauch: Kino dichter, größer, steigt und treibt hinter dem Auto her
        // n25: quer rutschend (Drift, Rutschwinkel > ~25°) dichter und größer
        const big = Math.max(0, Math.min(1, (slip - 0.45) / 0.35));
        if (this.rich) this.parts.spawn(this.p.setY(this.p.y + 0.4), this.v.set(car.v.x * 0.18 + (Math.random() - 0.5), 0.5 + Math.random() * 0.6, car.v.z * 0.18 + (Math.random() - 0.5)), 0.8 + 0.4 * big, 4.2 + 2.2 * big, 1.7 + 0.5 * big, 0xc4c4c2, 0.3 + 0.15 * Math.min(1, s - 0.5) + 0.2 * big);
        else this.parts.spawn(this.p, this.v.set(0, 0.6, 0), 0.6, 2.6, 1.2, 0xd8d8d8, 0.35);
      }
      if (emit && !onRoad && sp > 5 && k >= 2) {
        if (this.rich) this.parts.spawn(this.p.setY(this.p.y + 0.35), this.v.set(car.v.x * 0.2 + (Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 0.8, car.v.z * 0.2 + (Math.random() - 0.5) * 1.5), 0.7, 3.6 + Math.min(3, sp * 0.05), 1.6, Math.random() < 0.5 ? 0xa88a5e : 0x8f7a58, 0.42);
        else this.parts.spawn(this.p, this.v.set(car.v.x * 0.1, 0.8, car.v.z * 0.1), 0.5, 2.2, 1.0, 0xb89a6a, 0.4);
      }
      // Wiese bremst (n21, über 30 km/h): Grasbüschel und Erde spritzen an allen Rädern hoch
      if (emit && !onRoad && sp > 8.5) this.parts.spawn(this.p, this.v.set(car.v.x * 0.25 + (Math.random() - 0.5) * 2, 1.6 + Math.random() * 1.5, car.v.z * 0.25 + (Math.random() - 0.5) * 2), 0.25, 0.9, 0.6, Math.random() < 0.6 ? 0x5e7d2a : 0x6b5236, 0.9);
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
    if (this.rich) {
      // Funken: Karosserie schleift über Asphalt/Beton/Metall (nicht auf Wiese) bzw. harter Aufschlag (Landung, Wand)
      const SP = car.scrapeP, onGrass = car.wheels.every((w) => !w.contact || w.mat === 8);
      const scr = car.scrape || 0, imp = car.lastImpact || 0;
      if (SP && !onGrass && (scr > 2.5 || imp > 3) && (scr > 2.5 ? Math.random() < Math.min(1, scr / 8) : true)) {
        const n = imp > 3 ? Math.min(18, 4 + Math.round(imp * 1.6)) : 1 + Math.round(Math.random() * Math.min(3, scr / 6));
        for (let i = 0; i < n; i++) {
          const sv = 0.55 + Math.random() * 0.4;
          this.sparks.spawn(SP[0], SP[1] + 0.03, SP[2], car.v.x * sv + (Math.random() - 0.5) * 4, Math.abs(car.v.y) * 0.2 + 0.8 + Math.random() * 2.5, car.v.z * sv + (Math.random() - 0.5) * 4, 0.25 + Math.random() * 0.45);
        }
      }
      // Landung auf Wiese: Staub- und Erdwolke
      if (imp > 4 && onGrass) for (let i = 0; i < 5; i++) this.parts.spawn(this.p.set(car.pos.x, car.pos.y - 0.4, car.pos.z), this.v.set(car.v.x * 0.15 + (Math.random() - 0.5) * 4, 0.6 + Math.random(), car.v.z * 0.15 + (Math.random() - 0.5) * 4), 1.0, 4.0, 1.4, 0x9a8460, 0.45);
    } else if (car.lastImpact > 6) {
      for (let i = 0; i < 6; i++) this.parts.spawn(this.p.set(car.pos.x, car.pos.y, car.pos.z), this.v.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.18, 0.1, 0.35, 0xffc060, 1);
    }
    car.lastImpact = 0;
  }
  // Replay/Kino-Replay (n25): Reifenqualm an den Hinterrädern aus dem aufgezeichneten Schwimmwinkel (beta rad, wie im Rennen
  // ab ~19° Rutschen der Hinterräder), dt = vergangene Aufzeichnungszeit; pose = Replay-Lage, sp = Tempo m/s
  replayStep(dt, pose, beta, sp) {
    if (dt <= 0 || pose.air) return;
    this.acc += dt;
    if (this.acc < 0.035) return;
    this.acc = 0;
    const s = Math.max(0, Math.min(1, (Math.tan(Math.min(1.3, Math.abs(beta))) - 0.18) * 3));
    if (s <= 0.5 || Math.abs(sp) < 8) return;
    const F = pose.frame;
    for (const sx of [-0.88, 0.88]) {
      this.p.set(pose.pos.x + F.r.x * sx - F.f.x * 1.36 - F.u.x * 0.4, pose.pos.y + F.r.y * sx - F.f.y * 1.36 - F.u.y * 0.4 + 0.4, pose.pos.z + F.r.z * sx - F.f.z * 1.36 - F.u.z * 0.4);
      const vx = F.f.x * sp, vz = F.f.z * sp;
      const big = Math.max(0, Math.min(1, (Math.tan(Math.min(1.3, Math.abs(beta))) - 0.45) / 0.35));
      if (this.rich) this.parts.spawn(this.p, this.v.set(vx * 0.18 + (Math.random() - 0.5), 0.5 + Math.random() * 0.6, vz * 0.18 + (Math.random() - 0.5)), 0.8 + 0.4 * big, 4.2 + 2.2 * big, 1.7 + 0.5 * big, 0xc4c4c2, 0.3 + 0.15 * Math.min(1, s - 0.5) + 0.2 * big);
      else this.parts.spawn(this.p, this.v.set(0, 0.6, 0), 0.6, 2.6, 1.2, 0xd8d8d8, 0.35);
    }
  }
  // Replay/Kino-Replay (n27): Landung nach einer Luftphase – Staubwolke an den Rädern, Funken vom Unterboden; k = Stärke
  // (Flugzeit), slow = 1/Zeitlupe (mehr und größer, damit es in der Zeitlupe nach etwas aussieht)
  replayLand(pose, k, slow = 1) {
    const F = pose.frame, n = Math.round((3 + 6 * k) * Math.min(2.5, slow));
    for (let i = 0; i < n; i++) {
      const sx = (Math.random() - 0.5) * 2, sz = (Math.random() - 0.5) * 3.2;
      this.p.set(pose.pos.x + F.r.x * sx + F.f.x * sz, pose.pos.y - 0.4, pose.pos.z + F.r.z * sx + F.f.z * sz);
      this.parts.spawn(this.p, this.v.set((Math.random() - 0.5) * 5, 0.6 + Math.random() * 1.6, (Math.random() - 0.5) * 5), 0.8 + 0.4 * k, 3.5 + 2 * k, 1.4 + 0.6 * k, Math.random() < 0.5 ? 0xb9ad98 : 0x9c8f7a, 0.4);
    }
    if (this.rich) for (let i = 0; i < Math.round(8 * k * Math.min(2.5, slow)); i++) {
      this.sparks.spawn(pose.pos.x, pose.pos.y - 0.45, pose.pos.z, F.f.x * 8 + (Math.random() - 0.5) * 6, 0.8 + Math.random() * 2.5, F.f.z * 8 + (Math.random() - 0.5) * 6, 0.3 + Math.random() * 0.5, pose.pos.y - 0.55);
    }
  }
  // Zielshow (n27): Schweif-Funken aus dem Heck in den ersten Sekunden hinter der Ziellinie (Rennen und Replay/Film;
  // dt = vergangene Spielzeit, pose = Lage, sp = Tempo m/s, k = Stärke 1 → 0). Fallen auf die Fahrbahn und springen ab.
  trail(dt, pose, sp, k) {
    this.trailAcc = (this.trailAcc || 0) + dt * (this.rich ? 70 : 28) * Math.max(0, k);
    const F = pose.frame;
    if (!F || !F.r) return;
    while (this.trailAcc >= 1) {
      this.trailAcc -= 1;
      const sx = (Math.random() - 0.5) * 1.5, h = 0.25 + Math.random() * 0.25;
      const x = pose.pos.x + F.r.x * sx - F.f.x * 2.25 + F.u.x * (h - 0.3), y = pose.pos.y + F.r.y * sx - F.f.y * 2.25 + F.u.y * (h - 0.3), z = pose.pos.z + F.r.z * sx - F.f.z * 2.25 + F.u.z * (h - 0.3);
      const s = Math.abs(sp) * (0.35 + 0.25 * Math.random());
      this.sparks.spawn(x, y, z, F.f.x * s + (Math.random() - 0.5) * 5, 1.2 + Math.random() * 3.2, F.f.z * s + (Math.random() - 0.5) * 5, 0.35 + Math.random() * 0.5, pose.pos.y - 0.5);
    }
  }
  // pro Frame: Partikel bewegen
  update(dt, camera) {
    this.skids.now += dt; this.skids.uNow.value = this.skids.now;
    this.parts.update(dt, camera);
    this.sparks.update(dt, camera);
  }
}
