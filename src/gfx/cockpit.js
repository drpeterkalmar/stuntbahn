// Cockpit-Ansicht: eigenes Low-Poly-Interieur. goblin.glb hat keins, das man zeigen könnte (offener Boden,
// Räder von innen sichtbar, kein Lenkrad). Das Cockpit hängt fest an der Kamera und wird in einem zweiten
// Durchgang mit gelöschtem Tiefenpuffer gezeichnet → nie Clipping mit Strecke, Wänden oder Röhren.
// Layout in Bildschirm-Pixeln: Rundinstrumente + Schaltkulisse mittig unten zwischen den Touch-Tasten,
// Lenkrad darunter (Nabe unter dem Bildrand), A-Säulen, Dachrahmen und Innenspiegel an den Rändern.
// Seit n15 tief: Das Armaturenbrett beginnt bei ~68 % der Bildhöhe, darüber ist die Fahrbahn frei.
// Skalen werden einmal auf ein Canvas gezeichnet; bewegt werden nur Zeiger, Knauf und Lenkrad (Meshes).
// n27 (Peter 03.10.: „Cockpit detaillierter und schöner“): geformtes Armaturenbrett aus Leder mit Ziernaht, Carbon-Leiste,
// runden Lüftungsdüsen, Instrumenten-Hutze mit Drehzahl-LEDs (Schaltblitze), schlanke gepolsterte A-Säulen und Dachhimmel
// aus Alcantara, Lenkrad mit Carbon-Speichen, Nabe, Tasten, Schaltwippen und Ziernaht, Mittelkonsole mit Schalthebel,
// Glas über den Instrumenten spiegelt die Umgebung, echter Innenspiegel (kleines Rendertarget, ab Grafik Standard),
// Innenraum-Licht reagiert auf Tunnel/Brücken (dunkler, Tunnellichter streifen vorbei), Schatten von Säulen/Dach wandern
// mit der Sonne (ab Standard). Materialien prozedural (gfx/cockpitmat.js, keine Dateien). Gleich viele oder weniger
// Draw-Calls als bis n26 (Teile je Material zusammengefasst).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SPEEDO, TACHO, Needle, GateKnob, gateSlot, speedAngle, rpmAngle, valueAngle } from './gauges.js';
import { cockpitMaterials } from './cockpitmat.js';

const DEG = Math.PI / 180;
const WHEEL_RATIO = 4.2;    // Lenkrad-Umdrehung je Radeinschlag (0,6 rad Einschlag → ~145° am Lenkrad)
const FACE_PX = 512;        // Kantenlänge je Zifferblatt im Canvas (Atlas 2×1)

// ---------- Zifferblätter (Canvas, einmal gezeichnet) ----------
function drawDial(g, ox, kind) {
  const S = FACE_PX, cx = ox + S / 2, cy = S / 2, R = S / 2 - 6;
  const isT = kind === 'tacho', max = isT ? TACHO.max : SPEEDO.max, sweep = isT ? TACHO.sweep : SPEEDO.sweep;
  const at = (v, r) => { const a = valueAngle(v, max, sweep); return [cx + r * Math.sin(a), cy - r * Math.cos(a)]; };
  // Grund: mattschwarz mit leichtem Verlauf, feiner Silberrand
  const bg = g.createRadialGradient(cx, cy - R * 0.25, R * 0.1, cx, cy, R);
  bg.addColorStop(0, '#24272c'); bg.addColorStop(0.75, '#141619'); bg.addColorStop(1, '#0a0b0d');
  g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8d939b'; g.lineWidth = 5; g.beginPath(); g.arc(cx, cy, R - 3, 0, Math.PI * 2); g.stroke();
  // roter Bereich (Drehzahl) als Band am Rand
  const arc = (v0, v1, r, w, col) => {
    const a0 = valueAngle(v0, max, sweep) - Math.PI / 2, a1 = valueAngle(v1, max, sweep) - Math.PI / 2;
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke();
  };
  if (isT) arc(TACHO.red, max, R * 0.86, R * 0.1, '#d42a1c');
  // Striche
  const minor = isT ? 0.25 : SPEEDO.minor, major = isT ? 1 : SPEEDO.major;
  const n = Math.round(max / minor);
  for (let i = 0; i <= n; i++) {
    const v = i * minor, isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6, half = !isMaj && Math.abs((v / major) * 2 - Math.round((v / major) * 2)) < 1e-6;
    const r0 = R * (isMaj ? 0.74 : half ? 0.8 : 0.84), r1 = R * 0.92;
    const [x0, y0] = at(v, r0), [x1, y1] = at(v, r1);
    g.strokeStyle = isT && v >= TACHO.red ? '#ff5a40' : '#eef0f2';
    g.lineWidth = isMaj ? 9 : half ? 5 : 3;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
  // Zahlen
  g.fillStyle = '#f4f5f6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 ${isT ? 64 : 50}px "Helvetica Neue", Arial, sans-serif`;
  for (let v = 0; v <= max + 1e-6; v += major) {
    const [x, y] = at(v, R * (isT ? 0.56 : 0.555));
    g.fillStyle = isT && v >= TACHO.red ? '#ff6a4a' : '#f4f5f6';
    g.fillText(String(v), x, y);
  }
  // Beschriftung unten
  g.fillStyle = '#b9bec6'; g.font = '600 34px "Helvetica Neue", Arial, sans-serif';
  g.fillText(isT ? 'U/min' : 'km/h', cx, cy + R * 0.42);
  g.font = '600 26px "Helvetica Neue", Arial, sans-serif';
  if (isT) g.fillText('×1000', cx, cy + R * 0.6);
  else { g.fillStyle = '#ff6a2a'; g.font = '800 26px "Helvetica Neue", Arial, sans-serif'; g.fillText('STUNTBAHN', cx, cy + R * 0.6); }
}

// Schaltkulisse: gebürstetes Blech mit eingefrästen Gassen, aktueller Gang orange
function drawGate(cv, gear) {
  const g = cv.getContext('2d'), w = cv.width, h = cv.height;
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#5d636b'); grd.addColorStop(0.5, '#8c939c'); grd.addColorStop(1, '#4f555c');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.18;
  for (let y = 0; y < h; y += 2) { g.fillStyle = (y * 7919) % 5 < 2 ? '#fff' : '#000'; g.fillRect(0, y, w, 1); }
  g.globalAlpha = 1;
  g.strokeStyle = '#2a2d31'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  const X = (x) => w / 2 + x * w * 0.33, Y = (y) => h / 2 - y * h * 0.22;
  g.strokeStyle = '#0c0d0f'; g.lineCap = 'round'; g.lineWidth = w * 0.075;
  g.beginPath(); g.moveTo(X(-1), Y(0)); g.lineTo(X(1), Y(0));
  for (const x of [-1, -1 / 3, 1 / 3, 1]) { g.moveTo(X(x), Y(1)); g.lineTo(X(x), x === -1 ? Y(0) : Y(-1)); }
  g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `800 ${Math.round(h * 0.17)}px "Helvetica Neue", Arial, sans-serif`;
  for (const k of ['R', 1, 2, 3, 4, 5, 6]) {
    const s = gateSlot(k);
    g.fillStyle = String(k) === String(gear) ? '#ff7a2a' : '#15171a';
    g.fillText(String(k), X(s.x), s.y > 0 ? h * 0.1 + h * 0.02 : h * 0.9 - h * 0.02);
  }
}

// ---------- Geometrie-Helfer ----------
// Streifen aus zwei Punktreihen (gleich lang) → Dreiecke, Normalen berechnet
function strip(a, b) {
  const pos = [], idx = [];
  for (let i = 0; i < a.length; i++) pos.push(a[i].x, a[i].y, a[i].z, b[i].x, b[i].y, b[i].z);
  for (let i = 0; i < a.length - 1; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
function quad(p0, p1, p2, p3) { return strip([p0, p1], [p3, p2]); }
// Fläche aus mehreren Punktreihen (rows[k] gleich lang) mit Texturkoordinaten in Metern / tile (Leder, Carbon … kacheln)
function sheet(rows, tile = 0.12) {
  const pos = [], uv = [], idx = [], n = rows[0].length;
  const vAcc = new Float32Array(n);
  rows.forEach((row, r) => {
    let u = 0;
    row.forEach((p, i) => {
      if (i) u += p.distanceTo(row[i - 1]);
      if (r) vAcc[i] += p.distanceTo(rows[r - 1][i]);
      pos.push(p.x, p.y, p.z); uv.push(u / tile, vAcc[i] / tile);
    });
  });
  for (let r = 0; r < rows.length - 1; r++) for (let i = 0; i < n - 1; i++) { const a = r * n + i, b = a + n; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// Geometrie für einen Material-Topf vorbereiten: nur position/normal/uv, nicht indiziert (zum Zusammenfassen)
function pot(g, tile = null) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (tile) { const u = g.attributes.uv; for (let i = 0; i < u.count; i++) u.setXY(i, u.getX(i) * tile, u.getY(i) * tile); }
  return g;
}
const merge = (list) => (list.length ? mergeGeometries(list) : null);
// Vertex-Farbe (fürs Zusammenfassen: alle Teile brauchen dieselben Attribute); c2 = Verlauf nach unten
function tint(g, c, c2 = c) {
  const n = g.attributes.position.count, col = new Float32Array(n * 3), P = g.attributes.position;
  g.computeBoundingBox();
  const y0 = g.boundingBox.min.y, y1 = g.boundingBox.max.y;
  for (let i = 0; i < n; i++) {
    const k = y1 > y0 ? (P.getY(i) - y0) / (y1 - y0) : 1;
    for (let j = 0; j < 3; j++) col[i * 3 + j] = c2[j] + (c[j] - c2[j]) * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('uv');
  return g;
}

export class Cockpit {
  constructor(envMap, paint, opt = {}) {
    this.scene = new THREE.Scene();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.5;
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.05, 20);
    this.scene.add(this.cam);
    this.root = new THREE.Group();
    this.cam.add(this.root);
    this.tier = opt.tier ?? 2;
    // Sonnenlicht durch die Frontscheibe (Richtung = Weltsonne, Stärke je nach Einfallswinkel); ab Standard mit Schatten
    // der Säulen, des Dachs und des Lenkrads auf Armaturenbrett und Hutze (Schattenkarte 512², nur jedes 3. Bild neu)
    this.sun = new THREE.DirectionalLight(0xfff1dc, 1.4);
    this.sun.shadow.mapSize.set(512, 512);
    const sc = this.sun.shadow.camera; sc.left = -1.6; sc.right = 1.6; sc.top = 1.6; sc.bottom = -1.6; sc.near = 0.5; sc.far = 8;
    this.sun.shadow.bias = -0.002; this.sun.shadow.normalBias = 0.01; this.sun.shadow.autoUpdate = false;
    this.sun.castShadow = this.tier > 0;
    this.scene.add(this.sun, this.sun.target);
    // Tunnellichter: Punktlicht über der Scheibe, wandert je Lampe von vorn nach hinten (nur im Tunnel/unter Brücken)
    this.tLight = new THREE.PointLight(0xffd9a0, 0, 2.5, 1.6);
    this.cam.add(this.tLight);
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x3a3328, 0.6);
    this.scene.add(this.hemi);
    this.visible = false;
    const T = cockpitMaterials(this.tier);
    const M = this.mats = {
      dash: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.78, metalness: 0, side: THREE.DoubleSide }),
      // Kotflügel: flach angeschaut spiegelt voller Klarlack nur den Himmel (wirkt lila) → matter als außen
      paint: new THREE.MeshPhysicalMaterial({ color: 0xa3120e, metalness: 0.2, roughness: 0.42, clearcoat: 0.35, clearcoatRoughness: 0.2 }),
      leather: T.leather, alcantara: T.alcantara, carbon: T.carbon, alu: T.brushed,
      accent: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0, emissive: 0x140802 }),
      needle: new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }),
      knob: new THREE.MeshStandardMaterial({ color: 0xb01a12, roughness: 0.22, metalness: 0.1, emissive: 0x3a0503 }),
      // Instrumenten-Glas: spiegelt die Umgebung (Himmel, Sonne) – Glanzlicht über den Zifferblättern
      glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0c10, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.03 }),
      mirror: new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.18, metalness: 1 }),
      led: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    if (paint) M.paint.color = paint.color;   // gleiche Farbe wie der Lack (Optionen → Lackfarbe wirkt sofort)
    // Innenspiegel mit echtem Bild (ab Standard): Rückblick in ein kleines Rendertarget, Bild gespiegelt
    this.mirror = { rt: null, cam: new THREE.PerspectiveCamera(24, 3.2, 0.5, 160), n: 0, calls: 0, every: 4 };
    M.mirrorRT = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    // Zifferblätter: Atlas 2×1, scharf dank Mipmaps + Anisotropie
    const cv = document.createElement('canvas');
    cv.width = FACE_PX * 2; cv.height = FACE_PX;
    const g = cv.getContext('2d');
    drawDial(g, 0, 'tacho'); drawDial(g, FACE_PX, 'speedo');
    this.faceTex = new THREE.CanvasTexture(cv);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    M.face = new THREE.MeshStandardMaterial({ map: this.faceTex, emissiveMap: this.faceTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.6, metalness: 0 });
    this.gateCv = document.createElement('canvas');
    this.gateCv.width = 256; this.gateCv.height = 320;
    this.gateGear = null;
    drawGate(this.gateCv, 1);
    this.gateTex = new THREE.CanvasTexture(this.gateCv);
    this.gateTex.colorSpace = THREE.SRGBColorSpace;
    this.gateTex.anisotropy = 4;
    M.gate = new THREE.MeshStandardMaterial({ map: this.gateTex, emissiveMap: this.gateTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.4, metalness: 0.6 });
    this.nS = new Needle(15, 0.85);   // Tacho: ruhig
    this.nT = new Needle(26, 0.42);   // Drehzahl: flink, schwingt leicht nach
    this.knob = new GateKnob(11);
    this.parts = null;
    this.key = '';
    this.cover = 0; this.tPhase = 0; this.shift = { g: null, t: 1, d: 0 }; this.frameN = 0;
  }

  // Layout aus Bildschirmmaßen (CSS-Pixel), vertikalem Sichtfeld und freier Zone zwischen den Touch-Tasten.
  // n15: Das Armaturenbrett beginnt erst bei o.dash (Anteil der Bildhöhe, Standard ~0,68), die Instrumente sitzen
  // darunter. Drei Stufen je nach Platz zwischen den Tasten: „full“ (2 Rundinstrumente + Schaltkulisse),
  // „compact“ (nur die Rundinstrumente, Gang als kleines Schild darunter, s. main.js) und „hud“ (keine
  // Rundinstrumente – Tempo und Gang stehen digital im HUD); das Armaturenbrett bleibt immer tief.
  layout(o) {
    const key = [o.W, o.H, o.vfov.toFixed(2), Math.round(o.zl), Math.round(o.zr), Math.round(o.bottom), o.dash || 0].join('|');
    if (key === this.key) return false;
    this.key = key;
    if (this.parts) { this.root.remove(this.parts); this.parts.traverse((x) => { if (x.geometry) x.geometry.dispose(); }); }
    const { W, H } = o, cx = W / 2, t = Math.tan(o.vfov * DEG / 2);
    const U = Math.min(H, 0.75 * W);                         // Maßstab für Ränder/Wülste (hochkant nicht die Höhe)
    const mpp = (D) => 2 * D * t / H;                       // Meter je Pixel in Tiefe D
    const P = (x, y, D) => new THREE.Vector3((x - cx) * mpp(D), (H / 2 - y) * mpp(D), -D);
    const M = this.mats, grp = new THREE.Group();
    const shadows = this.tier > 0;
    // Material-Töpfe (je Topf ein Draw-Call)
    const leather = [], alc = [], carb = [], alu = [], dark = [], acc = [];
    const add = (list, mat, name, cast = false, recv = true) => { const g = merge(list); if (!g) return null; const m = new THREE.Mesh(g, mat); m.name = name; m.castShadow = cast && shadows; m.receiveShadow = recv && shadows; grp.add(m); return m; };
    // --- Maße in Pixeln ---
    const half = Math.max(40, Math.min(cx - o.zl, o.zr - cx));  // symmetrisch um die Mitte (Fahrer blickt geradeaus)
    const yB = H - o.bottom;                                    // „Unterkante“ (über der Replay-Leiste / den Tasten)
    const mB = Math.min(0.055 * H, 14);                         // Abstand Instrumente – Unterkante
    const yT = (o.dash || 0.68) * H;                            // gewünschte Oberkante des Armaturenbretts
    let mode = 'full', gd = Math.min(0.36 * H, (2 * half) / 2.62, 0.3 * W);
    if (gd < 90) { mode = 'compact'; gd = Math.min(0.36 * H, (2 * half) / 2.2, 0.3 * W); if (gd < 80) mode = 'hud'; }
    // Platz unter der Oberkante (Instrumente + Hutze ≈ 1,14 gd); reicht er nicht, rückt das Brett etwas höher
    gd = Math.min(gd, Math.max((yB - mB - yT) / 1.14, mode === 'full' ? 90 : 80));
    if (mode === 'hud') gd = 0;
    const gap = 0.07 * gd, gw = 0.5 * gd, gh = 0.62 * gd;       // Schaltkulisse
    const off = mode === 'full' ? gw / 2 + gap + gd / 2 : 0.56 * gd;
    const yc = yB - mB - gd / 2;                                // Mitte der Rundinstrumente
    const DG = 0.72, DF = 0.84, DW = 0.46;                      // Tiefen: Instrumente, Armaturenbrett, Lenkrad
    this.mode = mode;
    // n24: Schaltkulisse etwas tiefer und kleiner (bis n23 [cx, yc + 0,12 gd, gw, gh]) – darüber sitzt das G-Meter
    this.gaugePx = { mode, gd, yc, xs: gd ? [cx - off, cx + off] : [], gate: mode === 'full' ? [cx, yc + 0.2 * gd, gw * 0.92, gh * 0.88] : null, gear: mode === 'compact' ? [cx, yc + 0.46 * gd, 0.28 * gd] : null };
    const shade = (k) => [0.085 * k, 0.072 * k, 0.06 * k];   // Anthrazit, leicht warm (Himmelslicht färbt sonst blau)
    // ---------- Armaturenbrett: Leder-Oberseite (zur Scheibe flacher), gerundete Vorderkante, Ziernaht, Carbon-Leiste ----------
    const yD = gd ? Math.min(yT, yc - 0.64 * gd) : yT;          // Oberkante (Mitte)
    this.dashPx = yD;
    const xs = []; for (let i = 0; i <= 32; i++) xs.push(-0.2 * W + (1.4 * W) * i / 32);
    const yDx = (x) => yD + 0.05 * U * Math.pow((x - cx) / (0.7 * W), 2);
    const far = xs.map((x) => P(x, yDx(x) - 0.045 * U, 1.35)), near = xs.map((x) => P(x, yDx(x), DF));
    // Vorderkante als Wulst: drei Reihen rollen nach vorn/unten (Lichtkante + Schatten darunter)
    const lip1 = xs.map((x) => P(x, yDx(x) + 0.008 * U, DF - 0.022)), lip2 = xs.map((x) => P(x, yDx(x) + 0.024 * U, DF - 0.03)), lip3 = xs.map((x) => P(x, yDx(x) + 0.045 * U, DF - 0.024));
    leather.push(pot(sheet([far, near, lip1, lip2, lip3], 0.14)));
    // Stirnwand darunter: obere Hälfte Leder, Carbon-Leiste, unten dunkler Kunststoff (Verlauf ins Dunkle)
    const face1 = xs.map((x) => P(x, yDx(x) + 0.07 * U, DF - 0.035)), cb0 = xs.map((x) => P(x, yDx(x) + 0.085 * U, DF - 0.04)), cb1 = xs.map((x) => P(x, yDx(x) + 0.125 * U, DF - 0.042));
    leather.push(pot(sheet([lip3, face1, cb0], 0.14)));
    carb.push(pot(sheet([cb0, cb1], 0.1)));
    const low = xs.map((x) => P(x, H * 1.25, DF - 0.1));
    dark.push(tint(strip(cb1, low), shade(1.0), shade(0.3)));
    // Ziernaht: kurze orange Stiche knapp hinter der Kante
    const stitch = (row, every = 0.018, len = 0.011, w = 0.0038, dz = 0.003) => {
      let acc = 0;
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1], b = row[i], L = a.distanceTo(b), d = b.clone().sub(a).normalize();
        for (let s = (every - acc % every); s < L; s += every) {
          const c = a.clone().addScaledVector(d, s); c.z += dz;
          const e = d.clone().multiplyScalar(len / 2), n = new THREE.Vector3(0, w / 2, 0);
          acc_push(c, e, n);
        }
        acc += L;
      }
    };
    const stitches = [];
    const acc_push = (c, e, n) => stitches.push(quad(c.clone().sub(e).sub(n), c.clone().add(e).sub(n), c.clone().add(e).add(n), c.clone().sub(e).add(n)));
    stitch(xs.map((x) => P(x, yDx(x) + 0.004 * U, DF - 0.012)));
    stitch(face1.map((p) => p.clone()), 0.018, 0.011, 0.0038, 0.005);
    for (const g of stitches) acc.push(tint(g, [1.7, 0.75, 0.16]));
    // ---------- Instrumenten-Hutze (Leder) mit Lippe, Naht und Drehzahl-LEDs ----------
    this.leds = null;
    if (gd) {
      const rx = off + gd * 0.62, ry = gd * 0.7, D0 = DG - 0.1, D1 = DF + 0.02;
      const front = [], mid = [], back = [];
      for (let i = 0; i <= 28; i++) {
        const a = Math.PI * i / 28;
        // hintere Kante in Bildschirm-Pixeln knapp über der vorderen (tiefer liegend, sonst ragt sie als Kuppel weit ins Bild)
        front.push(P(cx + rx * Math.cos(a), yc + 0.08 * gd - ry * Math.sin(a), D0));
        mid.push(P(cx + rx * 1.01 * Math.cos(a), yc + 0.07 * gd - ry * 1.02 * Math.sin(a), (D0 + D1) / 2));
        back.push(P(cx + rx * 1.02 * Math.cos(a), yc + 0.06 * gd - ry * 1.03 * Math.sin(a), D1));
      }
      leather.push(pot(sheet([back, mid, front], 0.12)));
      // Lippe (dicker Wulst an der Vorderkante, nach unten gerollt)
      const lipA = front.map((p) => new THREE.Vector3(p.x * 0.99, p.y - 0.003, p.z + 0.008)), lipB = front.map((p) => new THREE.Vector3(p.x * 0.975, p.y - 0.012, p.z + 0.01));
      leather.push(pot(sheet([front, lipA, lipB], 0.12)));
      stitch(mid, 0.016, 0.01, 0.0034, 0.004);
      for (const g of stitches.splice(0)) acc.push(tint(g, [1.7, 0.75, 0.16]));
      // Drehzahl-LEDs auf der Lippe (Schaltblitze): 12 Stück, grün → gelb → rot → blau, Farben je Bild (update)
      const n = 12, led = [];
      for (let k = 0; k < n; k++) {
        const a = Math.PI * (0.62 - 0.24 * k / (n - 1)), p = P(cx + rx * 0.975 * Math.cos(a), yc + 0.08 * gd - ry * 0.98 * Math.sin(a) - 0.012 * gd, D0 - 0.012);
        const s = mpp(D0) * gd * 0.035, b = new THREE.BoxGeometry(s * 1.4, s * 0.75, 0.004); b.translate(p.x, p.y, p.z); led.push(tint(b, [0.05, 0.05, 0.05]));
      }
      const lg = mergeGeometries(led);
      this.leds = new THREE.Mesh(lg, M.led); this.leds.name = 'cockpit-leds'; this.leds.userData.n = n; this.leds.userData.per = lg.attributes.position.count / n;
      grp.add(this.leds);
      // runde Lüftungsdüsen links/rechts neben der Hutze (Alu-Ring, dunkler Grund, Lamellen)
      for (const sg of [-1, 1]) {
        const vx = cx + sg * (rx + gd * 0.36), vy = yD + 0.075 * U + gd * 0.12, D = DF - 0.05, r = gd * 0.2 * mpp(D), c = P(vx, vy, D);
        if (vx - gd * 0.24 < 0.02 * W || vx + gd * 0.24 > 0.98 * W) continue;   // nur ganz im Bild (hochkant fehlt der Platz)
        const ring = new THREE.TorusGeometry(r, r * 0.13, 10, 36); ring.translate(c.x, c.y, c.z + 0.004); alu.push(pot(ring, 0.6));
        const disc = new THREE.CircleGeometry(r * 0.95, 28); disc.translate(c.x, c.y, c.z - 0.006); dark.push(tint(disc, shade(0.25)));
        for (let k = -2; k <= 2; k++) { const sl = new THREE.BoxGeometry(r * 1.7 * Math.sqrt(1 - (k / 2.6) ** 2), r * 0.08, r * 0.25); sl.rotateX(-0.35); sl.translate(c.x, c.y + k * r * 0.34, c.z - 0.002); dark.push(tint(sl, shade(0.9))); }
        const hubv = new THREE.CylinderGeometry(r * 0.16, r * 0.16, r * 0.3, 14); hubv.rotateX(Math.PI / 2); hubv.translate(c.x, c.y, c.z + 0.002); alu.push(pot(hubv, 0.4));
      }
    }
    // flache Lüftungsdüsen ganz außen (unter den Säulen), Alu-Rahmen
    for (const sg of [-1, 1]) {
      const vx = cx + sg * 0.43 * W, vy = yDx(vx) + 0.06 * U, D = DF - 0.04, w = 0.07 * W * mpp(D), h2 = 0.03 * U * mpp(D), c = P(vx, vy, D);
      const fr = new THREE.BoxGeometry(w * 1.12, h2 * 1.3, 0.006); fr.translate(c.x, c.y, c.z); alu.push(pot(fr, 0.5));
      const inn = new THREE.BoxGeometry(w, h2, 0.004); inn.translate(c.x, c.y, c.z + 0.002); dark.push(tint(inn, shade(0.2)));
      for (let k = 0; k < 6; k++) { const sl = new THREE.BoxGeometry(w * 0.06, h2 * 0.9, 0.006); sl.translate(c.x - w * 0.42 + k * w * 0.168, c.y, c.z + 0.004); dark.push(tint(sl, shade(1.1))); }
    }
    // Instrumentenrohre (Kunststoff) + gebürstete Alu-Ringe
    const mG = mpp(DG), Rg = gd / 2 * mG;
    this.gauges = [];
    for (let k = 0; k < this.gaugePx.xs.length; k++) {
      const c = P(this.gaugePx.xs[k], yc, DG);
      // Rohr: Ränder über Bildschirm-Pixel definiert → der vordere Rand liegt auch weit unten im Bild
      // (Hochformat, starke Perspektive) immer außerhalb des Zifferblatts, nie davor
      const back = [], front = [];
      for (let i = 0; i <= 40; i++) {
        const a = Math.PI * 2 * i / 40, [x, y] = [this.gaugePx.xs[k], yc];
        back.push(P(x + Math.cos(a) * gd * 0.53, y + Math.sin(a) * gd * 0.53, DG + 0.004));
        front.push(P(x + Math.cos(a) * gd * 0.6, y + Math.sin(a) * gd * 0.6, DG - 0.045));
      }
      dark.push(tint(strip(back, front), shade(0.9), shade(0.45)));
      const ring = new THREE.TorusGeometry(Rg * 1.045, Rg * 0.05, 10, 48);
      ring.translate(c.x, c.y, c.z + 0.008);
      alu.push(pot(ring, 0.5));
      this.gauges.push({ c, R: Rg });
    }
    // ---------- Dachhimmel und A-Säulen (Alcantara, gepolstert und schlank) ----------
    const roofY = 0.075 * H;
    const roofA = [], roofB = [], roofC = [];
    for (let i = 0; i <= 14; i++) {
      const x = -0.1 * W + 1.2 * W * i / 14, sag = 0.02 * H * (1 - Math.pow((x - cx) / (0.6 * W), 2));
      roofA.push(P(x, -0.1 * H, 0.75)); roofB.push(P(x, roofY + sag, 0.75)); roofC.push(P(x, roofY + sag - 0.012 * H, 1.3));
    }
    alc.push(pot(sheet([roofA, roofB], 0.15)));
    dark.push(tint(strip(roofB, roofC), shade(1.6)));
    const yBase = yDx(0) - 0.045 * U;
    // Säule: drei Spalten (Außenkante, gewölbte Mitte näher an der Kamera, Innenkante) → rund schattiert; oben schmaler
    const pillar = (xb0, xb1, xt0, xt1, D) => {
      const rows = [];
      for (let r = 0; r <= 6; r++) {
        const k = r / 6, y = (yBase + 0.06 * U) + (roofY - (yBase + 0.06 * U)) * k;
        const x0 = xb0 + (xt0 - xb0) * k, x1 = xb1 + (xt1 - xb1) * k;
        rows.push([P(x0, y, D), P((x0 + x1) / 2, y, D - 0.035), P(x1, y, D)]);
      }
      const cols = [0, 1, 2].map((c) => rows.map((r) => r[c]));
      alc.push(pot(sheet(cols, 0.15)));
      // Gummi-Dichtung an der Innenkante
      const e0 = cols[2], e1 = e0.map((p) => p.clone().add(new THREE.Vector3(0, 0, -0.1)));
      dark.push(tint(strip(e0, e1), shade(0.6)));
    };
    pillar(-0.03 * W, 0.03 * W, 0.085 * W, 0.135 * W, 0.8);
    pillar(0.97 * W, 1.02 * W, 0.875 * W, 0.905 * W, 1.05);
    // Kotflügel-Buckel in Wagenfarbe (Mittelmotor-Sportwagen: vorne links/rechts über dem Armaturenbrett sichtbar)
    {
      const fen = [];
      for (const [x0, x1] of [[0.03 * W, 0.3 * W], [0.7 * W, 0.975 * W]]) {
        const r0 = [], r1 = [], r2 = [];
        for (let i = 0; i <= 14; i++) {
          const k = i / 14, x = x0 + (x1 - x0) * k, bump = 0.035 * U * Math.pow(Math.sin(Math.PI * k), 0.7);
          r0.push(P(x, yBase + 0.03 * U, 1.7)); r1.push(P(x, yBase - bump, 2.2)); r2.push(P(x, yBase - bump * 0.85, 2.9));
        }
        fen.push(strip(r1, r0), strip(r2, r1));
      }
      const m = new THREE.Mesh(mergeGeometries(fen), M.paint); m.name = 'cockpit-kotfluegel'; grp.add(m);
    }
    // ---------- Innenspiegel: Gehäuse (Leder/Kunststoff), Glas mit Rückblick (ab Standard) ----------
    {
      const mx = cx + 0.16 * W, my = roofY + 0.07 * H, mw = Math.min(0.15 * W, 0.34 * H), mh = mw * 0.32, D = 0.62;
      const s = mpp(D), c = P(mx, my, D);
      const body = new THREE.BoxGeometry(mw * s * 1.06, mh * s * 1.12, 0.03, 2, 2, 1);
      body.translate(c.x, c.y, c.z);
      leather.push(pot(body, 2));
      const stem = new THREE.CylinderGeometry(0.006, 0.008, (my - roofY) * s + 0.03, 8);
      stem.translate(c.x, c.y + ((my - roofY) * s) / 2, c.z - 0.02);
      dark.push(tint(stem, shade(0.8)));
      const glass = new THREE.PlaneGeometry(mw * s * 0.98, mh * s * 0.86);
      const uv = glass.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));   // gespiegelt
      glass.rotateX(-6 * DEG); glass.translate(c.x, c.y, c.z + 0.016);
      this.mirrorMesh = new THREE.Mesh(glass, this.tier > 0 ? M.mirrorRT : M.mirror); this.mirrorMesh.name = 'cockpit-spiegel';
      grp.add(this.mirrorMesh);
      this.mirror.aspect = mw / mh;
    }
    // ---------- Mittelkonsole mit Schalthebel (rechts unten am Bildrand) ----------
    this.lever = null;
    // nur, wenn rechts neben dem Tacho Platz ist (hochkant würde der Hebel die Instrumente verdecken)
    const gR = this.gaugePx.xs.length ? this.gaugePx.xs[this.gaugePx.xs.length - 1] + gd * 0.62 : cx;
    if (gR < 0.78 * W) {
      const D = 0.7, s = mpp(D), base = P(0.87 * W, H * 1.06, D);
      const box = new THREE.BoxGeometry(0.34 * W * s, 0.06, 0.5, 2, 1, 2); box.translate(base.x, base.y - 0.03, base.z + 0.05); leather.push(pot(box, 3));
      const plate = new THREE.BoxGeometry(0.28 * W * s, 0.008, 0.3); plate.translate(base.x, base.y + 0.003, base.z); carb.push(pot(plate, 5));
      const lv = new THREE.Group(); lv.position.set(base.x - 0.02, base.y + 0.006, base.z);
      const sh = new THREE.CylinderGeometry(0.007, 0.01, 0.12, 12); sh.translate(0, 0.06, 0);
      const boot = new THREE.CylinderGeometry(0.018, 0.045, 0.05, 14); boot.translate(0, 0.02, 0);
      const knob = new THREE.SphereGeometry(0.022, 18, 14); knob.scale(1, 1.15, 1); knob.translate(0, 0.13, 0);
      const mA = new THREE.Mesh(merge([pot(sh, 4)]), M.alu), mL = new THREE.Mesh(merge([pot(boot, 3), pot(knob, 3)]), M.leather);
      lv.add(mA, mL); lv.rotation.x = -0.25; lv.rotation.z = 0.12;
      grp.add(lv);
      this.lever = lv;
    }
    if (this.gaugePx.gate) {
      const [gx, gy, w, h] = this.gaugePx.gate, D = DG - 0.02, s2 = mpp(D), c = P(gx, gy, D);
      const frame = new THREE.BoxGeometry(w * s2 * 1.08, h * s2 * 1.06, 0.01); frame.translate(c.x, c.y, c.z - 0.006); alu.push(pot(frame, 0.5));
    }
    add(leather, M.leather, 'cockpit-leder', false, true);
    add(alc, M.alcantara, 'cockpit-alcantara', true, false);
    add(carb, M.carbon, 'cockpit-carbon', false, true);
    add(alu, M.alu, 'cockpit-alu');
    add(dark, M.dash, 'cockpit-kunststoff', true, true);
    add(acc, M.accent, 'cockpit-naht', false, false);
    // Zifferblätter (ein Mesh, Atlas-UVs), Glas, Zeiger
    this.needles = [];
    if (this.gauges.length) {
      const faces = [];
      for (let k = 0; k < 2; k++) {
        const { c, R } = this.gauges[k];
        const f = new THREE.CircleGeometry(R, 48);
        const uv = f.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5 + k * 0.5);
        f.translate(c.x, c.y, c.z);
        faces.push(f);
      }
      grp.add(new THREE.Mesh(mergeGeometries(faces), M.face));
      // Glas leicht gewölbt (Kugelkappe) → die Spiegelung wandert über das Zifferblatt
      const gl = mergeGeometries(this.gauges.map(({ c, R }) => { const g2 = new THREE.SphereGeometry(R * 3.2, 32, 8, 0, Math.PI * 2, 0, Math.asin(1 / 3.2)); g2.rotateX(Math.PI / 2); g2.translate(c.x, c.y, c.z + 0.02 - R * 3.2 * Math.cos(Math.asin(1 / 3.2))); return g2; }));
      const glass = new THREE.Mesh(gl, M.glass);
      glass.renderOrder = 2;
      grp.add(glass);
      this.needles = this.gauges.map(({ c, R }) => {
        const s = new THREE.Shape();
        s.moveTo(-R * 0.03, -R * 0.2); s.lineTo(R * 0.03, -R * 0.2); s.lineTo(R * 0.012, R * 0.86); s.lineTo(0, R * 0.9); s.lineTo(-R * 0.012, R * 0.86); s.closePath();
        // Zeiger + Kappe als ein Mesh (Farben je Ecke, ein Draw-Call je Instrument)
        const ng = tint(new THREE.ShapeGeometry(s), [1.0, 0.3, 0.1]);
        const cap = new THREE.CylinderGeometry(R * 0.085, R * 0.1, 0.01, 20);
        cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.005);
        const pivot = new THREE.Group();
        pivot.position.set(c.x, c.y, c.z + 0.006);
        pivot.add(new THREE.Mesh(mergeGeometries([ng, tint(cap, [0.62, 0.64, 0.68], [0.3, 0.31, 0.33])]), M.needle));
        grp.add(pivot);
        return pivot;
      });
    }
    // Schaltkulisse + Knauf (nur „full“)
    this.gateGeo = null; this.knobMesh = null;
    if (this.gaugePx.gate) {
      const [gx, gy, w, h] = this.gaugePx.gate, D = DG - 0.02, s = mpp(D), c = P(gx, gy, D);
      const plate = new THREE.PlaneGeometry(w * s, h * s);
      plate.translate(c.x, c.y, c.z);
      grp.add(new THREE.Mesh(plate, M.gate));
      // Rahmen: steckt im Alu-Topf (oben vorbereitet, gateFrame)
      this.gateGeo = { c, w: w * s, h: h * s };
      const kb = new THREE.Mesh(new THREE.SphereGeometry(w * s * 0.1, 16, 12), M.knob);
      grp.add(kb);
      this.knobMesh = kb;
    }
    // ---------- Lenkrad: Lederkranz mit Ziernaht und dicken Griffen, Carbon-Speichen, Nabe, Tasten, Schaltwippen ----------
    // Nabe unter dem Bildrand, Kranz umrahmt die Instrumenten (ohne Instrumente: knapp unter der Oberkante des Bretts)
    {
      const hubY = yB + 0.3 * U;
      const rimPx = 0.03 * U, s = mpp(DW);
      const reach = gd ? Math.hypot(off, hubY - yc) + gd / 2 + 0.012 * U : Math.max(0.15 * W, hubY - yD - rimPx + 0.02 * U);
      const R = (reach + rimPx) * s, r = rimPx * s;
      const wheel = new THREE.Group();
      wheel.position.copy(P(cx, hubY, DW));
      const tilt = new THREE.Group();
      tilt.rotation.x = -6 * DEG;   // n15: flacher (bis n14 −14°, der Kranz ragte oben weit ins Bild)
      wheel.add(tilt);
      const spin = new THREE.Group();
      tilt.add(spin);
      const wl = [], wc = [], wa = [];
      // Kranz leicht oval im Querschnitt (vorn flacher), Griffe bei 9 und 3 Uhr dicker
      const rim = new THREE.TorusGeometry(R, r, 14, 120); rim.scale(1, 1, 0.85); wl.push(pot(rim, 1));
      for (const a of [40 * DEG, 140 * DEG]) { const g2 = new THREE.TorusGeometry(R, r * 1.22, 12, 24, 36 * DEG); g2.rotateZ(a - 18 * DEG); wl.push(pot(g2, 1)); }
      // Ziernaht innen und außen am Kranz (orange)
      for (const k of [-1, 1]) { const st = new THREE.TorusGeometry(R + k * r * 0.86, r * 0.09, 4, 120); wa.push(tint(st, [1.5, 0.66, 0.14])); }
      // 12-Uhr-Marke
      const mk = new THREE.TorusGeometry(R, r * 1.08, 10, 8, 7 * DEG); mk.rotateZ(90 * DEG - 3.5 * DEG); wa.push(tint(mk, [0.95, 0.66, 0.0]));
      // Speichen (Carbon, leicht hängend) bei 3, 9 und 6 Uhr
      for (const a of [-12, 192, 270]) {
        const sp = new THREE.BoxGeometry(R * 0.86, r * 1.6, r * 0.8, 3, 1, 1);
        sp.translate(R * 0.5, 0, -r * 0.2); sp.rotateZ(a * DEG); wc.push(pot(sp, 6));
      }
      // Nabe (Leder) mit Prallplatte (Carbon), Logo-Ring (orange)
      const hub = new THREE.CylinderGeometry(R * 0.24, R * 0.27, r * 2.4, 32); hub.rotateX(Math.PI / 2); wl.push(pot(hub, 1));
      const plt = new THREE.CylinderGeometry(R * 0.2, R * 0.2, r * 0.4, 32); plt.rotateX(Math.PI / 2); plt.translate(0, 0, r * 1.3); wc.push(pot(plt, 6));
      const logo = new THREE.TorusGeometry(R * 0.11, R * 0.012, 6, 32); logo.translate(0, 0, r * 1.55); wa.push(tint(logo, [0.35, 0.2, 0.08]));
      // Tasten auf den Speichen (rot, gelb, blau, weiß) und Drehschalter
      const btn = [[0.42, 0.06, [0.85, 0.1, 0.08]], [0.52, 0.06, [0.95, 0.75, 0.1]], [0.42, -0.07, [0.15, 0.4, 0.95]], [-0.42, 0.06, [0.9, 0.9, 0.9]], [-0.52, 0.06, [0.85, 0.1, 0.08]], [-0.42, -0.07, [0.2, 0.75, 0.3]]];
      // (fast schwarz mit Farbhauch: hochkant liegt die Nabe zwischen den Touch-Tasten – nichts soll dort wie ein Bedienknopf wirken)
      for (const [x, y, col] of btn) { const b = new THREE.CylinderGeometry(R * 0.03, R * 0.03, r * 0.45, 14); b.rotateX(Math.PI / 2); b.translate(R * x, R * y, r * 0.35); wa.push(tint(b, col.map((c) => 0.1 + c * 0.08))); }
      for (const sg of [-1, 1]) { const d = new THREE.CylinderGeometry(R * 0.05, R * 0.05, r * 0.6, 16); d.rotateX(Math.PI / 2); d.translate(sg * R * 0.33, -R * 0.2, r * 0.4); wa.push(tint(d, [0.3, 0.31, 0.33])); }
      // Schaltwippen (Carbon) hinter dem Kranz bei 3 und 9 Uhr
      for (const sg of [-1, 1]) { const pd = new THREE.BoxGeometry(R * 0.32, R * 0.12, r * 0.25); pd.translate(sg * R * 0.84, R * 0.12, -r * 1.6); wc.push(pot(pd, 6)); }
      const mW = new THREE.Mesh(merge(wl), M.leather), mC = new THREE.Mesh(merge(wc), M.carbon), mA = new THREE.Mesh(merge(wa), M.accent);
      mW.castShadow = mC.castShadow = shadows;
      spin.add(mW, mC, mA);
      grp.add(wheel);
      this.wheelSpin = spin;
      this.wheelPx = { hubY, R: reach + rimPx };
    }
    this.root.add(grp);
    this.parts = grp;
    return true;
  }

  // Werte setzen + Zeiger bewegen. v: { kmh, rpm, gear ('R' | 1…6), steer (rad Radeinschlag) }
  // e (n27): { cover 0…1 (Tunnel/Brücke über dem Auto), speed m/s, head: { pos, quat } (Kopfnicken, Kamera-Raum) }
  update(dt, v, camera, sunDir, e = {}) {
    const c = this.cam;
    c.position.copy(camera.position); c.quaternion.copy(camera.quaternion);
    if (c.fov !== camera.fov || c.aspect !== camera.aspect) { c.fov = camera.fov; c.aspect = camera.aspect; c.updateProjectionMatrix(); }
    // Kopfnicken (camera.js): die Kamera bewegt sich gegen das Auto – das Cockpit bleibt am Auto (Gegen-Versatz)
    if (e.head) { this._qi = (this._qi || new THREE.Quaternion()).copy(e.head.quat).invert(); this.root.quaternion.copy(this._qi); this.root.position.copy(e.head.pos).applyQuaternion(this._qi).negate(); }
    else { this.root.position.set(0, 0, 0); this.root.quaternion.identity(); }
    c.updateMatrixWorld(true);
    if (!this.parts) return;
    this.frameN++;
    const aS = this.nS.update(dt, speedAngle(v.kmh)), aT = this.nT.update(dt, rpmAngle(v.rpm));
    if (this.needles.length) { this.needles[0].rotation.z = -aT; this.needles[1].rotation.z = -aS; }
    this.wheelSpin.rotation.z = -v.steer * WHEEL_RATIO;
    const k = this.knob.update(dt, v.gear), G = this.gateGeo;
    if (G) this.knobMesh.position.set(G.c.x + k.x * G.w * 0.33, G.c.y + k.y * G.h * 0.22, G.c.z + G.w * 0.06);
    if (String(v.gear) !== String(this.gateGear)) {
      // Schalthebel: kurzer Ruck nach hinten (hoch) bzw. vorn (runter), wie eine sequenzielle Schaltung
      if (this.gateGear != null) this.shift = { t: 0, d: String(v.gear) === 'R' ? 0 : (+v.gear > +this.gateGear ? 1 : -1) };
      this.gateGear = v.gear; if (G) { drawGate(this.gateCv, v.gear); this.gateTex.needsUpdate = true; }
    }
    if (this.lever) { const S = this.shift; S.t = Math.min(1, S.t + dt / 0.35); this.lever.rotation.x = -0.25 + S.d * 0.3 * Math.sin(Math.PI * S.t) * (1 - S.t); }
    // Drehzahl-LEDs: ab 5,6 von 8 ×1000 der Reihe nach, über 7,3 blinken alle (Schaltblitz)
    if (this.leds) {
      const L = this.leds, n = L.userData.n, per = L.userData.per, col = L.geometry.attributes.color, x = (v.rpm / 1000 - 5.6) / (7.3 - 5.6);
      const flash = v.rpm > 7300 && (this.frameN >> 2) % 2 === 0, on = Math.round(Math.max(0, Math.min(1, x)) * n);
      for (let i = 0; i < n; i++) {
        const lit = v.rpm > 7300 ? flash : i < on;
        const cc = i < 4 ? [0.1, 1.6, 0.25] : i < 8 ? [1.6, 1.1, 0.05] : i < 11 ? [1.8, 0.12, 0.05] : [0.3, 0.5, 2.0];
        const r0 = lit ? cc[0] : 0.05, g0 = lit ? cc[1] : 0.05, b0 = lit ? cc[2] : 0.06;
        for (let j = 0; j < per; j++) col.setXYZ(i * per + j, r0, g0, b0);
      }
      col.needsUpdate = true;
    }
    // Licht: Tunnel/Brücke über dem Auto → Innenraum dunkler, Tunnellampen streifen vorbei (alle ~12 m)
    const cov = Math.max(0, Math.min(1, e.cover || 0));
    this.cover += (cov - this.cover) * (1 - Math.exp(-dt * 4));
    const dk = 1 - 0.78 * this.cover;
    this.scene.environmentIntensity = 0.5 * (1 - 0.6 * this.cover);
    this.hemi.intensity = 0.6 * dk;
    if (this.cover > 0.05) {
      this.tPhase = (this.tPhase + Math.abs(e.speed || 0) * dt / 12) % 1;
      const ph = this.tPhase;
      this.tLight.position.set(0.15, 0.45, -1.4 + 2.2 * ph);
      this.tLight.intensity = this.cover * 1.3 * Math.sin(Math.PI * ph) ** 2;
    } else this.tLight.intensity = 0;
    // Sonne: steht sie vor dem Auto, fällt Licht durch die Scheibe aufs Armaturenbrett; Schatten der Säulen wandern mit
    if (sunDir) {
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quaternion);
      const k2 = Math.max(0.2, Math.min(1, 0.45 + f.dot(sunDir) * 0.8));
      this.sun.intensity = 1.6 * k2 * dk;
      this.sun.target.position.copy(c.position).addScaledVector(f, 0.8);
      this.sun.position.copy(this.sun.target.position).addScaledVector(sunDir, 4);
      this.sun.target.updateMatrixWorld();
      // (castShadow bleibt fest – Umschalten würde alle Cockpit-Shader neu übersetzen)
      if (this.sun.castShadow && this.tier > 0 && this.cover < 0.9 && this.frameN % 3 === 0) this.sun.shadow.needsUpdate = true;
    }
  }
  // Innenspiegel (ab Standard): Rückblick der Weltkamera in ein kleines Rendertarget (nur jedes 4. Bild – ~15 Bilder/s
  // reichen im Spiegel –, ohne Schatten-Neuberechnung, Weite 160 m); scene = Weltszene, camera = Weltkamera
  renderMirror(renderer, scene, camera) {
    if (this.tier < 1 || !this.mirrorMesh) return 0;
    const Mr = this.mirror;
    if (!Mr.rt) {
      Mr.rt = new THREE.WebGLRenderTarget(256, 80, { depthBuffer: true, stencilBuffer: false });
      Mr.rt.isXRRenderTarget = true;   // Tonemapping + sRGB im Material (wie der Kino-Look)
      Mr.rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.mats.mirrorRT.map = Mr.rt.texture; this.mats.mirrorRT.needsUpdate = true;
    }
    if (Mr.n++ % Mr.every !== 0) return 0;
    const mc = Mr.cam;
    mc.aspect = Mr.aspect || 3.2; mc.updateProjectionMatrix();
    mc.position.copy(camera.position);
    mc.quaternion.copy(camera.quaternion).multiply(this._flip || (this._flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)));
    mc.position.addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion), 0.12);
    mc.updateMatrixWorld();
    // Kleinkram, den man im kleinen Spiegel nicht sieht, für diesen Durchgang aus (spart Draw-Calls): Gras, Büsche, Laub,
    // Felsen, Banner, Ballons, Windrad-Rotoren, Ideallinie, Spuren, Partikel; Liste je Welt einmal
    if (Mr.scene !== scene || Mr.kids !== scene.children.length) {
      Mr.scene = scene; Mr.kids = scene.children.length; Mr.hide = [];
      scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh || o.isPoints) && /^(deco-(grass|bushes|laub|rocks|marks|signs|boardposts|farms|tyres)|banner|kulisse-(ballons|rotoren|fahnen|boote)|ideal-line|jump-marks|skids|particles|sparks|contact-shadow|pyro)/.test(o.name || '')) Mr.hide.push(o); });
    }
    const vis = Mr.hide.map((o) => o.visible);
    for (const o of Mr.hide) o.visible = false;
    const c0 = renderer.info.render.calls, su = renderer.shadowMap.autoUpdate, rt0 = renderer.getRenderTarget();
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(Mr.rt);
    renderer.render(scene, mc);
    renderer.setRenderTarget(rt0);
    renderer.shadowMap.autoUpdate = su;
    Mr.hide.forEach((o, i) => { o.visible = vis[i]; });
    Mr.calls = renderer.info.render.calls - c0;
    return Mr.calls;
  }
  // Zeiger sofort auf die Werte (Kamerawechsel, Replay-Schnitt)
  snap(v) { this.nS.snap(speedAngle(v.kmh)); this.nT.snap(rpmAngle(v.rpm)); this.knob.init = false; }
  render(renderer) {
    const ac = renderer.autoClear, c0 = renderer.info.render.calls;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    renderer.autoClear = ac;
    this.calls = renderer.info.render.calls - c0;
  }
  // Debug/Tests: Zeigerwinkel in Grad
  readout() { return { speedDeg: this.nS.a / DEG, rpmDeg: this.nT.a / DEG, knob: [this.knob.x, this.knob.y], gear: this.gateGear, px: this.gaugePx, wheel: this.wheelPx, dash: this.dashPx, mode: this.mode, calls: this.calls, mirrorCalls: this.mirror.calls, cover: +this.cover.toFixed(2) }; }
}
