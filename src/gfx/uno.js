// n47 Look nach Vorbild „Uno com escada“ (github.com/viktorkav/uno-com-escada, Fable-Fassung) – nur die Bildsprache
// (Screenshots) dient als Vorlage, der Code hier ist eigener (kein übernommener Code/Shader, daher kein PolyForm-Vermerk nötig). Dokumentarisch-realistischer Clubkurs an einem schönen Nachmittag:
// harte Sonne ~40°, kühle Himmels-Füllung, klares Blau mit sonnenbeschienenen Cumulus (Himmel aus Code statt Bild),
// dichter grüner Mischwald, gedämpfte Curbs, neutrales Grading mit angehobenen Schwarzwerten, keine Vignette.
// Standard an; ?look=alt = Look von 0.20.0 (ohne diese Änderungen). Nur Optik – Bahn, Physik und Zeiten unverändert.
import * as THREE from 'three';

const P = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const LOOK = P.get('look');
export const UNO = LOOK !== 'alt' && LOOK !== 'n22';

// Farbkorrektur (kinolook.js GRADES.uno): neutral bis leicht entsättigt, Schwarz angehoben, sanfte S-Kurve, Lichter nicht
// abgeschnitten; Schatten leicht kühl (Himmels-Füllung), Lichter kaum warm
export const UNO_GRADE = { wb: [1.02, 1.0, 0.97], lift: [0.012, 0.014, 0.018], gamma: [1.0, 1.0, 1.0], gain: [0.985, 0.99, 0.995], shadow: [-0.008, 0.0, 0.014], high: [0.008, 0.004, -0.006], split: 0.8, sat: 0.92, vib: 0.06, contrast: 0.26, green: 0.2 };

// Laubbaum-Töne für den Mischwald (statt Herbstfarben, kulisse.js): Sommergrün von Gelbgrün bis Oliv, dunkle Eiche
export const UNO_LAUB = [[1.35, 1.85, 0.55], [1.15, 1.65, 0.5], [1.55, 1.95, 0.6], [1.0, 1.45, 0.5], [1.35, 1.7, 0.65]];

// Land-Thema (track/themes.js) auf den Clubkurs-Nachmittag stellen: satteres Gras statt Steppe, Mischwald, Licht
export function unoThemen(THEMES) {
  if (!UNO) return;
  const L = THEMES.land;
  if (!L) return;
  const C = (r, g, b) => new THREE.Color(r, g, b);
  L.ground = { ...L.ground, g0: C(0.03, 0.075, 0.018), g1: C(0.16, 0.3, 0.06), dry: C(0.24, 0.27, 0.1), dryK: 0.3, tint: C(0.85, 0.95, 0.38), tintK: 0.3, fields: 0, forest: C(0.02, 0.045, 0.016), forestK: 1.2 };
  L.light = { ...L.light, sunI: 3.7, envI: 0.85, fog: [1.9, 2.1], grade: 'uno', haze: [0.58, 0.68, 0.8] };
  L.trees = { ...L.trees, autumn: 0.55, gruen: 1 };
  L.sky = { ...L.sky, balloons: 0, zeppelin: 0, turbines: 0 };
}

// Sonne: Richtung des Themas (Azimut) behalten, Höhe auf ~32° (später Nachmittag, lange Schatten), warm-weiß; Himmel aus Code
const SUN_EL = 32 * Math.PI / 180;
export function unoLicht(c, themeId, themeUniforms = null) {
  if (!UNO) return;
  const { sun, sky, scene } = c;
  if (sky.material.uniforms.wUno) sky.material.uniforms.wUno.value.x = 0;
  if (themeId !== 'land') return;   // andere Landschaften: Sonne passt zum Himmelsbild, bleibt
  const d = sun.userData.dir, hz = Math.hypot(d.x, d.z) || 1;
  d.set(d.x / hz * Math.cos(SUN_EL), Math.sin(SUN_EL), d.z / hz * Math.cos(SUN_EL)).normalize();
  sun.position.copy(sun.target.position).addScaledVector(d, 60);
  sun.color.setRGB(1.0, 0.95, 0.86);
  const U = sky.material.uniforms;
  if (c.kino) { Object.assign(c.kino.aerial, { density: 0.00022, max: 0.24 }); c.kino.sunCol.setRGB(0.92, 0.88, 0.8); }   // leichter, bläulicher Dunst
  if (U.cK) U.cK.value = 0;   // Deko-Schleierwolken (deko.js) aus: die Cumulus kommen aus unoSky
  if (themeUniforms) { themeUniforms.tFlowers.value = 0; themeUniforms.tMeadow.value = 0; }   // gemähter Rasen statt Blumenwiese
  if (U.wUno) {
    U.wUno.value.set(1, d.x, d.y, d.z);
    // n47: Wolken-Rauschen kostete je Bildpunkt (+82 % Bildzeit im Handy-Profil) → einmal je Landschaft in eine
    // Würfeltextur backen (512², Halbfloat), der Himmel liest dann nur noch eine Textur
    if (c.renderer) { U.uCube.value = backeHimmel(c.renderer, d); U.wUno.value.x = 2; }
    const h = new THREE.Color().setRGB(0.66, 0.75, 0.87, THREE.SRGBColorSpace);
    U.horizon.value.copy(h);
    if (scene.fog) scene.fog.color.copy(h);
  }
}

let bake = null;
function backeHimmel(renderer, d) {
  if (!bake) {
    const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter });
    const mat = new THREE.ShaderMaterial({
      uniforms: { wUno: { value: new THREE.Vector4() } }, side: THREE.BackSide, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vDir; ${UNO_SKY_GLSL.pars} void main(){ gl_FragColor = vec4( unoSky( normalize( vDir ) ), 1.0 ); }`,
    });
    const sc = new THREE.Scene(); sc.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat));
    bake = { rt, mat, sc, cam: new THREE.CubeCamera(0.1, 100, rt) };
  }
  bake.mat.uniforms.wUno.value.set(1, d.x, d.y, d.z);
  const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  bake.cam.update(renderer, bake.sc);
  renderer.toneMapping = tm;
  return bake.rt.texture;
}

// Himmel aus Code (eigene GLSL, Bildsprache wie im Vorbild): Rayleigh-artiger Verlauf (tiefes Blau oben, blasser Dunst am
// Horizont), Sonnenhof, Cumulus aus fbm-Rauschen auf einer Wolkenebene mit sonnenbeschienenen Rändern und grauem Bauch
export const UNO_SKY_GLSL = {
  pars: `uniform vec4 wUno; uniform samplerCube uCube;
    float uH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
    float uN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
      return mix( mix( uH( i ), uH( i + vec2( 1, 0 ) ), f.x ), mix( uH( i + vec2( 0, 1 ) ), uH( i + vec2( 1, 1 ) ), f.x ), f.y ); }
    float uF( vec2 p ) { float a = 0.5, s = 0.0; for ( int i = 0; i < 5; i++ ) { s += a * uN( p ); p = p * 2.03 + vec2( 17.1, 9.3 ); a *= 0.5; } return s; }
    vec3 unoSky( vec3 d ) {
      vec3 S = wUno.yzw; float y = max( d.y, 0.0 ), mu = max( dot( d, S ), 0.0 );
      vec3 zen = vec3( 0.1, 0.24, 0.55 ), hor = vec3( 0.62, 0.68, 0.76 );
      vec3 c = mix( hor, zen, pow( y, 0.4 ) );
      c += vec3( 1.0, 0.92, 0.75 ) * ( 0.18 * pow( mu, 8.0 ) + 0.5 * pow( mu, 200.0 ) );
      if ( d.y > 0.01 ) {
        // Cumulus: niedrige Frequenz, verbogene Koordinaten (Quellformen), scharfer Rand, flacher dunkler Bauch
        vec2 q = d.xz / ( d.y + 0.1 ) * 0.75;
        vec2 w = vec2( uF( q * 0.7 + 1.3 ), uF( q * 0.7 + 7.9 ) ) - 0.5;
        float n = uF( q + w * 1.4 + vec2( 3.0, 1.0 ) ), det = uF( q * 3.1 + w * 2.0 + 21.0 );
        float dens = n + 0.22 * det - 0.06 * smoothstep( 0.2, 0.8, y );
        float cov = smoothstep( 0.56, 0.6, dens );
        // Beleuchtung: Abstand zur Wolkenkante in Sonnenrichtung (dichter dahinter = Schatten)
        vec2 sd = normalize( S.xz + 1e-4 ) * 0.12;
        float sh = uF( q + sd + w * 1.4 + vec2( 3.0, 1.0 ) ) + 0.22 * det;
        float lit = clamp( 0.65 - 3.2 * ( sh - dens ) - 1.4 * ( dens - 0.58 ), 0.0, 1.0 );
        vec3 cl = mix( vec3( 0.36, 0.41, 0.5 ), vec3( 1.12, 1.08, 1.02 ), lit );
        cl += vec3( 1.0, 0.94, 0.82 ) * pow( mu, 5.0 ) * ( 1.0 - smoothstep( 0.55, 0.7, dens ) ) * 0.8;
        float fade = smoothstep( 0.01, 0.12, d.y );
        c = mix( c, mix( hor * 1.03, cl, fade ), cov * ( 0.4 + 0.6 * fade ) );
      }
      return c;
    }`,
  main: `if ( wUno.x > 1.5 ) c = textureCube( uCube, vec3( -d.x, d.y, d.z ) ).rgb; else if ( wUno.x > 0.5 ) c = unoSky( d );`,
};
