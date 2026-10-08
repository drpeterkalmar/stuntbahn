// Grafik-Kern, Baustein 4 (n30): Halb-Oktaeder-Abbildung für Impostors – reine Rechnung, gemeinsam für den Bäcker
// (tools/build_impostor.mjs, im Browser) und die Laufzeit (kern/impostor.js, GLSL-Kopie unten). Node-Test:
// tests/node/test_oktaeder.mjs.
//
// Idee („Octahedral Impostors“): Ansichten eines Objekts aus N×N Richtungen der oberen Halbkugel in einen Atlas backen.
// Die Richtung ↔ Atlas-Zelle über das Halb-Oktaeder (gleichmäßiger als Längen/Breiten-Raster, keine Pol-Häufung). Zur
// Laufzeit: Blickrichtung → Gitterpunkt → die 3 nächsten Ansichten mischen (Dreieck im Gitter) → plastisch, mit Licht
// aus der Normalen-Ansicht, ein Draw-Call je Baumart.
// Konvention: y = oben, Richtung zeigt VOM Objekt ZUR Kamera.

// Halb-Oktaeder: Richtung (y ≥ 0) → [u, v] in [0,1]²
export function hemiOktKodieren(x, y, z) {
  const s = Math.abs(x) + Math.abs(Math.max(0, y)) + Math.abs(z) || 1;
  const px = x / s, pz = z / s;
  return [(px + pz) * 0.5 + 0.5, (px - pz) * 0.5 + 0.5];
}
// [u, v] → Einheitsrichtung (y ≥ 0)
export function hemiOktDekodieren(u, v) {
  const a = u * 2 - 1, b = v * 2 - 1;
  const x = (a + b) * 0.5, z = (a - b) * 0.5, y = 1 - Math.abs(x) - Math.abs(z);
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, Math.max(0, y) / l, z / l];
}
// Richtung der Ansicht (i, j) im N×N-Gitter (Gitterpunkte auf den Zellmitten-Koordinaten i/(N−1))
export function rahmenRichtung(i, j, N) { return hemiOktDekodieren(i / (N - 1), j / (N - 1)); }

// Bildebene einer Ansicht: rechts r und oben u (orthonormal zu n). Oben = Welt-oben, auf die Ebene projiziert; von genau
// oben (|n.y| ≈ 1) stattdessen −z (sonst unbestimmt). Bäcker-Kamera: position = c + n·d, up = u, lookAt(c).
export function rahmenBasis(nx, ny, nz) {
  let ux = -nx * ny, uy = 1 - ny * ny, uz = -nz * ny;   // (0,1,0) − n·(n·oben)
  let l = Math.hypot(ux, uy, uz);
  if (l < 1e-4) { ux = 0; uy = 0; uz = -1; const d = -nz; ux -= nx * d; uy -= ny * d; uz -= nz * d; l = Math.hypot(ux, uy, uz) || 1; }
  ux /= l; uy /= l; uz /= l;
  // r = u × n (Kamera: x = y × z, z = n zeigt zur Kamera hin)
  const rx = uy * nz - uz * ny, ry = uz * nx - ux * nz, rz = ux * ny - uy * nx;
  return { r: [rx, ry, rz], u: [ux, uy, uz] };
}

// Die 3 Ansichten zu einer Blickrichtung mit Gewichten (Summe 1): [[i, j, w], …]
export function waehleRahmen(x, y, z, N) {
  const [u, v] = hemiOktKodieren(x, y, z);
  const gx = Math.min(N - 1 - 1e-6, Math.max(0, u * (N - 1))), gy = Math.min(N - 1 - 1e-6, Math.max(0, v * (N - 1)));
  const i0 = Math.floor(gx), j0 = Math.floor(gy), fx = gx - i0, fy = gy - j0;
  if (fx + fy < 1) return [[i0, j0, 1 - fx - fy], [i0 + 1, j0, fx], [i0, j0 + 1, fy]];
  return [[i0 + 1, j0 + 1, fx + fy - 1], [i0, j0 + 1, 1 - fx], [i0 + 1, j0, 1 - fy]];
}

// Punkt q (Objektraum, relativ zur Mitte) auf die Bildebene der Ansicht n projizieren → Atlas-UV in der Zelle [0,1]²
// (halbe Kantenlänge der Ansicht = radius)
export function rahmenUv(qx, qy, qz, n, radius) {
  const { r, u } = rahmenBasis(n[0], n[1], n[2]);
  return [(qx * r[0] + qy * r[1] + qz * r[2]) / (2 * radius) + 0.5, (qx * u[0] + qy * u[1] + qz * u[2]) / (2 * radius) + 0.5];
}

// Dasselbe in GLSL (Vertex-Shader der Laufzeit). Muss exakt zu den JS-Funktionen passen (Test vergleicht Formeln).
export const OKT_GLSL = `
vec2 oktKod( vec3 d ) {
  d.y = max( d.y, 0.0 );
  vec3 p = d / max( abs( d.x ) + d.y + abs( d.z ), 1e-5 );
  return vec2( p.x + p.z, p.x - p.z ) * 0.5 + 0.5;
}
vec3 oktDek( vec2 uv ) {
  vec2 ab = uv * 2.0 - 1.0;
  vec3 d = vec3( ( ab.x + ab.y ) * 0.5, 0.0, ( ab.x - ab.y ) * 0.5 );
  d.y = max( 0.0, 1.0 - abs( d.x ) - abs( d.z ) );
  return normalize( d );
}
void oktBasis( vec3 n, out vec3 r, out vec3 u ) {
  u = vec3( 0.0, 1.0, 0.0 ) - n * n.y;
  if ( dot( u, u ) < 1e-8 ) u = vec3( 0.0, 0.0, -1.0 ) - n * ( -n.z );
  u = normalize( u );
  r = cross( u, n );
}
`;
