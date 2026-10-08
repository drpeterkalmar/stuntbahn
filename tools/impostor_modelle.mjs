// n30: Modelle für den Impostor-Bäcker (tools/build_impostor.html). Laub- und Themenbäume aus den Poly-Haven-Modellen (CC0,
// assets_src/, dieselben wie die Karten-Atlanten tools/make_impostors.py / make_theme_atlas.py); Tannen gibt es nur als
// Zweig-Texturen (Poly Haven fir_tree_01, CC0) → hier eine 3D-Tanne aus Zweig-Vierecken um einen Stamm (wie die Karte
// tools/make_tree_card.py, nur räumlich), damit die Ansichten von allen Seiten stimmen.
// Namen = Zellen-Namen der Karten-Atlanten (kulisse.js ersetzt genau diese Karten); palme* bleiben Karten (kein Modell).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const S = '../assets_src/';
export const ARTEN = {
  tanne0: { typ: 'tanne', variante: 0 },
  tanne1: { typ: 'tanne', variante: 1 },
  laub1: { gltf: S + 'deco/tree_small_02/tree_small_02_1k.gltf' },
  laub2: { gltf: S + 'deco/island_tree_01/island_tree_01_1k.gltf' },
  koecher1: { gltf: S + 'themes/models/quiver_tree_01/quiver_tree_01_1k.gltf' },
  koecher2: { gltf: S + 'themes/models/quiver_tree_02/quiver_tree_02_1k.gltf' },
  insel: { gltf: S + 'themes/models/island_tree_02/island_tree_02_1k.gltf' },
  jacaranda: { gltf: S + 'themes/models/jacaranda_tree/jacaranda_tree_1k.gltf' },
  insel3: { gltf: S + 'themes/models/island_tree_03/island_tree_03_1k.gltf' },
};

function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const bild = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });

// Zweig-Atlas mit Alpha (Diffus-JPG + Alpha-PNG zusammensetzen)
async function zweigTextur() {
  const [d, a] = await Promise.all([bild(S + 'fir_tree_01_twig_diff_1k.jpg'), bild(S + 'fir_tree_01_twig_alpha_1k.png')]);
  const c = document.createElement('canvas'); c.width = d.width; c.height = d.height;
  const g = c.getContext('2d'); g.drawImage(d, 0, 0);
  const D = g.getImageData(0, 0, c.width, c.height);
  const c2 = document.createElement('canvas'); c2.width = a.width; c2.height = a.height;
  const g2 = c2.getContext('2d'); g2.drawImage(a, 0, 0, c.width, c.height);
  const Al = g2.getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < D.data.length; i += 4) D.data[i + 3] = Al[i];
  g.putImageData(D, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = true;
  return { t, w: c.width, h: c.height };
}

// 3D-Tanne: 13 m hoch (wie treeGeometry in gfx/world.js), Quirle aus Zweig-Vierecken (je Ast ein schräg hängendes und ein
// senkrechtes Viereck → von der Seite wie von oben dicht), weiche „Kugel“-Normalen (vom Stamm weg + nach oben) wie die Karten
export async function tanne(variante = 0) {
  const R = mulberry32(17 + variante * 101);
  const { t: zt, w: ZW, h: ZH } = await zweigTextur();
  const rinde = await new THREE.TextureLoader().loadAsync(S + 'fir_tree_01_bark_diff_1k.jpg'); rinde.colorSpace = THREE.SRGBColorSpace;
  // Zweig-Ausschnitte (Pixel im 1k-Atlas, wie make_tree_card.py)
  const boxes = [[190, 50, 430, 320], [320, 410, 660, 785], [650, 460, 915, 790], [670, 50, 950, 375]];
  const H = 13, R0 = 3.3 + variante * 0.25, y0 = 1.1 + variante * 0.3;
  const pos = [], nrm = [], uv = [], idx = [];
  const quad = (p0, p1, p2, p3, box, mittelY) => {
    const b = pos.length / 3;
    const [x0, y0b, x1, y1] = box;
    const us = [[x0 / ZW, 1 - y1 / ZH], [x1 / ZW, 1 - y1 / ZH], [x1 / ZW, 1 - y0b / ZH], [x0 / ZW, 1 - y0b / ZH]];
    [p0, p1, p2, p3].forEach((p, k) => {
      pos.push(p.x, p.y, p.z); uv.push(us[k][0], us[k][1]);
      const n = new THREE.Vector3(p.x, (p.y - mittelY) * 0.5 + 1.2, p.z).normalize(); nrm.push(n.x, n.y, n.z);
    });
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  const quirle = 30;
  for (let q = 0; q < quirle; q++) {
    const f = q / (quirle - 1), y = y0 + (H - y0 - 0.4) * f;
    const r = Math.max(0.25, R0 * Math.pow(1 - f, 0.95) * (0.9 + 0.2 * R()));
    const aeste = Math.max(4, Math.round(9 - 4 * f + R() * 2));
    for (let k = 0; k < aeste; k++) {
      const a = (k / aeste) * Math.PI * 2 + R() * 0.6 + q * 0.37;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), side = new THREE.Vector3(-dir.z, 0, dir.x);
      const L = r * (0.85 + 0.3 * R()), w = Math.max(0.35, L * 0.55), droop = 0.35 + 0.35 * R() - 0.2 * f;
      const base = new THREE.Vector3(0, y, 0).addScaledVector(dir, 0.1);
      const tip = base.clone().addScaledVector(dir, L); tip.y -= L * Math.sin(droop);
      const box = boxes[Math.floor(R() * boxes.length)];
      // schräg hängend (breit quer)
      quad(base.clone().addScaledVector(side, -w / 2), tip.clone().addScaledVector(side, -w / 2), tip.clone().addScaledVector(side, w / 2), base.clone().addScaledVector(side, w / 2), box, y);
      // senkrecht (Fläche entlang des Asts)
      const up = new THREE.Vector3(0, w * 0.45, 0);
      quad(base.clone().sub(up), tip.clone().sub(up), tip.clone().add(up), base.clone().add(up), boxes[Math.floor(R() * boxes.length)], y);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: zt, alphaTest: 0.45, side: THREE.DoubleSide })));
  const stamm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.32, H * 0.92, 8), new THREE.MeshStandardMaterial({ map: rinde, color: 0x8a8a8a }));
  stamm.position.y = H * 0.46;
  grp.add(stamm);
  return grp;
}

export async function lade(name) {
  const a = ARTEN[name];
  if (!a) throw new Error('unbekannte Art ' + name);
  if (a.typ === 'tanne') return tanne(a.variante);
  const g = await new GLTFLoader().loadAsync(a.gltf);
  const root = g.scene;
  if (a.pick) root.traverse((o) => { if (o.isMesh) o.visible = o.name === a.pick || o.name.startsWith(a.pick + '_'); });
  root.traverse((o) => { if (o.isMesh && o.material) { const m = o.material; m.side = THREE.DoubleSide; if (m.alphaMap || m.transparent || m.alphaTest > 0) { m.alphaTest = 0.5; m.transparent = false; } } });
  // unsichtbare Teile entfernen (Hülle/Normierung sonst falsch)
  const weg = []; root.traverse((o) => { if (o.isMesh && !o.visible) weg.push(o); }); weg.forEach((o) => o.parent.remove(o));
  return root;
}
