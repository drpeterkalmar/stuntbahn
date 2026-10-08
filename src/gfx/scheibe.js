// Wetter (n32): Regentropfen und Schlieren auf der Scheibe (Cockpit) bzw. der Linse (Stoßstangen-Kamera). Ein Vollbild-
// Durchlauf über dem fertigen Bild (vor dem Cockpit-Overlay), Tropfen rein prozedural im Shader (keine Textur, 0 KB):
// zwei Lagen Zellen, je Zelle höchstens ein Tropfen, der entsteht, wächst und verdunstet; bei Tempo drückt der Fahrtwind
// die Tropfen nach oben und zieht sie zu Schlieren. Brechung angedeutet: oben dunkel, unten hell (Himmel steht im Tropfen
// kopf), dunkler Rand. Kostet einen Draw-Call, nur bei Regen und nur in diesen beiden Kameras (main.js drawFrame).
// TODO n32-Heavy: Größe, Dichte, Deckkraft und Tempo-Verhalten am Bild abstimmen (Startwerte unten), auch hochkant.
import * as THREE from 'three';

export const SCHEIBE = { dichte: 0.62, groesse: 1, deck: 1, wind: 0.6 };

const FS = `uniform float uT, uK, uV, uAspect, uLens, uDicht; varying vec2 vUv;
  float h21( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
  // Tropfenfeld: x = Deckung, yz = Lage im Tropfen (−1 … 1, für Brechung/Rand)
  vec3 drops( vec2 uv, float t, float sc, float seed ) {
    vec2 g = uv * vec2( uAspect, 1.0 ) * sc;
    g.y -= t * ( 0.03 + uV * ${SCHEIBE.wind.toFixed(2)} ) * sc * 0.1;   // Fahrtwind schiebt nach oben
    vec2 id = floor( g ), f = fract( g ) - 0.5;
    float n = h21( id + seed );
    float life = fract( t * ( 0.12 + 0.18 * n ) + n * 7.0 );
    vec2 c = ( vec2( h21( id + seed + 3.1 ), h21( id + seed + 7.7 ) ) - 0.5 ) * 0.6;
    float r = ( 0.09 + 0.13 * h21( id + seed + 1.3 ) ) * ${SCHEIBE.groesse.toFixed(2)} * smoothstep( 0.0, 0.08, life ) * ( 1.0 - smoothstep( 0.75, 1.0, life ) );
    vec2 q = f - c;
    q.y *= 1.0 / ( 1.0 + uV * 2.2 );                  // Schliere: bei Tempo in Windrichtung lang gezogen
    q.x *= 1.0 + uV * 0.4;
    float d = length( q );
    float on = step( 1.0 - uDicht, n );
    float m = ( 1.0 - smoothstep( r * 0.7, r, d ) ) * on;
    return vec3( m, q / max( r, 1e-3 ) );
  }
  void main() {
    vec2 uv = vUv;
    if ( uLens > 0.5 ) uv = ( uv - 0.5 ) * 0.6 + 0.5;   // Linse: wenige große Tropfen
    vec3 a = drops( uv, uT, 9.0, 0.0 ), b = drops( uv + 0.37, uT * 1.3, 17.0, 11.0 );
    float m = max( a.x, b.x * 0.8 );
    vec2 nq = a.x >= b.x ? a.yz : b.yz;
    float shade = clamp( 0.5 - 0.5 * nq.y, 0.0, 1.0 );
    float rim = smoothstep( 0.55, 1.0, length( nq ) );
    vec3 col = mix( vec3( 0.05, 0.06, 0.07 ), vec3( 0.86, 0.89, 0.93 ), shade ) * ( 1.0 - 0.55 * rim );
    float al = m * uK * ${SCHEIBE.deck.toFixed(2)} * ( 0.16 + 0.24 * shade + 0.2 * rim );
    // feiner Wasserfilm bei Tempo (leichter Schleier oben)
    al = max( al, uK * uV * 0.05 * smoothstep( 0.4, 1.0, vUv.y ) );
    if ( al < 0.003 ) discard;
    gl_FragColor = vec4( col, al );
  }`;

export class Scheibe {
  constructor() {
    this.u = { uT: { value: 0 }, uK: { value: 0 }, uV: { value: 0 }, uAspect: { value: 1 }, uLens: { value: 0 }, uDicht: { value: SCHEIBE.dichte } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: FS,
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.t = 0; this.k = 0;
  }
  // o = { k (Stärke 0 … 1), speed (m/s), dt, lens (Stoßstange), covered (Tunnel: keine neuen Tropfen → ausblenden) }
  render(renderer, o = {}) {
    const dt = Math.min(0.1, o.dt || 0);
    this.t += dt;
    this.k += ((o.covered ? 0 : o.k || 0) - this.k) * Math.min(1, dt * 1.5);
    if (this.k < 0.01) return;
    const sz = renderer.getSize(this.size || (this.size = new THREE.Vector2()));
    const U = this.u;
    U.uT.value = this.t; U.uK.value = this.k; U.uV.value = Math.min(1, Math.max(0, (o.speed || 0) / 50));
    U.uAspect.value = sz.x / Math.max(1, sz.y); U.uLens.value = o.lens ? 1 : 0;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
  }
}
