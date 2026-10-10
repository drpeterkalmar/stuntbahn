// KI-Gegner Darstellung/Oberfläche (n34) ohne Browser: gfx/gegnervis.js und ui/ui.js laden (Import-Verknüpfung wie im Spiel,
// three über den Lade-Haken), Gegner-Autos als Attrappen (makeCar braucht das GLB): Interpolation zwischen zwei
// Physikschritten, Replay aus der 15-Hz-Aufzeichnung (Geister-Format, Reset-Sprung ohne Zwischenbild), Schatten nur nah,
// Namensschild (aus, zu nah, zu weit, Crash), HUD „Platz 3/6“ und Zieltabelle (UI-Methoden mit Attrappen-DOM).
import './three_haken.mjs';
const THREE = await import('three');
const { GegnerVis, SCHATTEN_NAH, SCHILD } = await import('../../src/gfx/gegnervis.js');
const { generate } = await import('../../src/track/generator.js');
const { prepare } = await import('../../src/track/verify.js');
const { Race } = await import('../../src/game/race.js');
const { GegnerFeld } = await import('../../src/ai/gegner.js');

let bad = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) bad++; };
const DT = 1 / 120;

// Attrappe eines Autos (Schnittstelle wie gfx/carmesh.js makeCar)
function attrappe() {
  const root = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()); m.castShadow = true; root.add(m);
  return { root, lod: 1, sync(phys, a, pose) { root.position.set(pose.pos.x, pose.pos.y, pose.pos.z); root.quaternion.set(pose.q.x, pose.q.y, pose.q.z, pose.q.w); this.synced = (this.synced || 0) + 1; }, updateLod() { return 1; }, setPaint(c) { this.paint = c; }, mesh: m };
}
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
const vis = new GegnerVis(scene);
for (let i = 0; i < 3; i++) { const tag = new THREE.Sprite(new THREE.SpriteMaterial()); vis.autos.push({ car: attrappe(), tag, schatten: true, key: 'x' }); }
vis.aktiv = 3;

const env = prepare(generate(11, 2));
const race = new Race(env, { assist: 'medium', autopilot: true, countdown: 0.2 });
const F = new GegnerFeld(env, { anzahl: 3, staerke: 'ebenbuertig', seed: 4, assist: 'medium' });
F.spielerAufstellen(race);
for (let t = 0; t < 8; t += DT) { vis.merke(F); race.step(DT, { steer: 0, throttle: 0, brake: 0 }); F.step(DT, race); }
// 1. Interpolation: a = 0 → Lage vor dem Schritt, a = 1 → jetzt
{
  const g = F.fahrer[0];
  camera.position.set(g.car.pos.x, g.car.pos.y + 3, g.car.pos.z + 10);
  vis.sync(F, camera, 0);
  const p0 = vis.autos[0].car.root.position.clone();
  vis.sync(F, camera, 1);
  const p1 = vis.autos[0].car.root.position.clone();
  ok(Math.abs(p0.x - vis.prev[0].p[0]) < 1e-9 && Math.abs(p1.x - g.car.pos.x) < 1e-9 && p0.distanceTo(p1) > 0.05, `Interpolation zwischen Physikschritten (Weg ${p0.distanceTo(p1).toFixed(3)} m)`);
  ok(vis.autos[0].car.root.visible, 'Gegner sichtbar');
}
// 2. Schatten nur nah, Schild an/aus
{
  const A = vis.autos[1], g = F.fahrer[1];
  camera.position.set(g.car.pos.x + SCHATTEN_NAH + 20, g.car.pos.y, g.car.pos.z);
  vis.sync(F, camera, 1);
  ok(!A.car.mesh.castShadow && !A.schatten, `weiter als ${SCHATTEN_NAH} m: kein Echtzeit-Schatten`);
  ok(A.tag.visible && A.tag.position.y > g.car.pos.y + 1.5, 'Namensschild über dem Auto');
  camera.position.set(g.car.pos.x + 10, g.car.pos.y, g.car.pos.z);
  vis.sync(F, camera, 1);
  ok(A.car.mesh.castShadow, 'nah: Schatten wieder an');
  camera.position.set(g.car.pos.x + SCHILD.weit + 10, g.car.pos.y, g.car.pos.z);
  vis.sync(F, camera, 1);
  ok(!A.tag.visible, `Schild aus ab ${SCHILD.weit} m`);
  vis.schilder = false; camera.position.set(g.car.pos.x + 30, g.car.pos.y, g.car.pos.z); vis.sync(F, camera, 1);
  ok(!A.tag.visible, 'Option „Namen-Schilder“ aus: kein Schild');
  vis.schilder = true;
}
// 3. Replay aus der Aufzeichnung
{
  const rec = F.fahrer.map((g) => g.aufnahme());
  const t = 5.5, D = rec[2], f = t * D.hz, k = Math.floor(f), u = f - k;
  vis.syncReplay(rec, t, camera);
  const r = vis.autos[2].car.root.position;
  const ex = D.data[k * 8] + (D.data[(k + 1) * 8] - D.data[k * 8]) * u;
  ok(Math.abs(r.x - ex) < 1e-4, `Replay: Lage aus 15 Hz interpoliert (x ${r.x.toFixed(2)} = ${ex.toFixed(2)})`);
  // Reset-Sprung zwischen zwei Bildern: kein Zwischenbild
  const fake = { hz: 15, frames: 3, data: new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 100, 0, 0, 0, 0, 0, 1, 0, 101, 0, 0, 0, 0, 0, 1, 0]) };
  vis.syncReplay([fake, fake, fake], 0.5 / 15, camera);
  ok(vis.autos[0].car.root.position.x === 0, 'Replay: Reset-Sprung (> 8 m) ohne Zwischenbild');
  vis.syncReplay([{ hz: 15, frames: 0, data: new Float32Array(0) }, fake, fake], 0, camera);
  ok(!vis.autos[0].car.root.visible, 'Replay: leere Aufzeichnung → unsichtbar');
}
vis.hide();
ok(vis.autos.every((A) => !A.car.root.visible && !A.tag.visible) && vis.aktiv === 0, 'hide(): alle aus');

// 4. Oberfläche: ui.js lädt; HUD-Platz und Zieltabelle mit Attrappen-DOM
{
  const el = { innerHTML: '', textContent: '', classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle() {}, contains(c) { return this.s.has(c); } } };
  globalThis.document = { querySelector: () => el, querySelectorAll: () => [], body: { dataset: {} }, createElement: () => ({ getContext: () => null, style: {} }) };
  globalThis.location = { search: '' };
  globalThis.performance = globalThis.performance || { now: () => Date.now() };
  const { UI } = await import('../../src/ui/ui.js').catch((e) => ({ UI: null, err: e }));
  ok(!!UI, 'ui.js geladen (Import-Verknüpfung mit ai/gegner.js und game/rennfeld.js)');
  const proto = UI ? UI.prototype : null;
  if (proto && proto.hudGegner) {
    const fake = Object.create(proto); fake.store = { settings: {} };
    fake.hudGegner(F, race);
    ok(/Platz \d\/4/.test(el.innerHTML), `HUD: ${el.innerHTML.replace(/<[^>]+>/g, ' ').trim()}`);
    const st = F.stand(race);
    const html = fake.gegnerTabelle(st);
    ok((html.match(/<tr/g) || []).length === 4 && /class="me"/.test(html), 'Zieltabelle: 4 Zeilen, Spieler markiert');
    fake.hudGegner(null, race);
    ok(el.innerHTML === '', 'HUD ohne Gegner: leer');
    fake.store.settings = { gegner: 3, gegnerStaerke: 'profi' };
    ok(fake.gegnerLabel() === '3 Gegner · Profi', `Menü-Beschriftung „${fake.gegnerLabel()}“`);
  } else ok(false, 'UI-Klasse ohne hudGegner');
}
console.log(bad ? `Gegner-Darstellung: ${bad} FEHLER` : 'Gegner-Darstellung: alle Prüfungen grün');
process.exit(bad ? 1 : 0);
