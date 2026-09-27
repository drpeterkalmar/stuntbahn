// Eingabe: Tastatur, Gamepad, Touch (Tasten-Zonen bzw. Bildschirmhälften, optional Neigen).
// Liefert Rohwerte steer (−1..1), throttle/brake (0..1) + Knöpfe (rewind, pause, cam, Ideallinie).

export class Input {
  constructor() {
    this.keys = new Set();
    this.touch = { steer: 0, throttle: 0, brake: 0, active: false };
    this.tilt = { enabled: false, value: 0, base: null };
    this.pad = { steer: 0, throttle: 0, brake: 0, active: false };
    this.out = { steer: 0, throttle: 0, brake: 0, source: 'none' };
    this.pressed = new Set();   // einmalige Tastendrücke
    this.steerSmooth = 0;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    }, { passive: false });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }
  consume(code) { const h = this.pressed.has(code); this.pressed.delete(code); return h; }
  enableTilt(on) {
    this.tilt.enabled = on;
    if (!on || this._tiltBound) return;
    this._tiltBound = true;
    addEventListener('deviceorientation', (e) => {
      if (!this.tilt.enabled || e.beta == null) return;
      // Querformat: Neigen um die lange Achse ~ beta bzw. gamma je nach Ausrichtung
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let v = Math.abs(ang) === 90 ? e.beta * Math.sign(ang) : e.gamma;
      if (this.tilt.base == null) this.tilt.base = 0;
      this.tilt.value = Math.max(-1, Math.min(1, (v - this.tilt.base) / 22));
    });
  }
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && [...pads].find((x) => x && x.connected);
    if (!p) { this.pad.active = false; return; }
    const ax = p.axes[0] || 0;
    const dz = Math.abs(ax) < 0.12 ? 0 : (ax - Math.sign(ax) * 0.12) / 0.88;
    const rt = p.buttons[7] ? p.buttons[7].value : 0, lt = p.buttons[6] ? p.buttons[6].value : 0;
    const a = p.buttons[0] && p.buttons[0].pressed ? 1 : 0, b = p.buttons[2] && p.buttons[2].pressed ? 1 : 0;
    this.pad.steer = dz;
    this.pad.throttle = Math.max(rt, a);
    this.pad.brake = Math.max(lt, b);
    this.pad.active = Math.abs(dz) > 0 || this.pad.throttle > 0 || this.pad.brake > 0;
    const was = this._padBtn || {};
    const now = { y: p.buttons[3]?.pressed, x: p.buttons[1]?.pressed, start: p.buttons[9]?.pressed, lb: p.buttons[4]?.pressed, back: p.buttons[8]?.pressed };
    if (now.y && !was.y) this.pressed.add('KeyR');
    if (now.start && !was.start) this.pressed.add('Escape');
    if (now.lb && !was.lb) this.pressed.add('KeyC');
    if (now.back && !was.back) this.pressed.add('KeyL');
    this._padBtn = now;
  }
  update(dt) {
    this.pollPad();
    const k = this.keys;
    let steer = 0, thr = 0, brk = 0, src = 'none';
    const kl = k.has('ArrowLeft') || k.has('KeyA'), kr = k.has('ArrowRight') || k.has('KeyD');
    const ku = k.has('ArrowUp') || k.has('KeyW'), kd = k.has('ArrowDown') || k.has('KeyS') || k.has('Space');
    if (kl || kr || ku || kd) {
      src = 'keys';
      const target = (kr ? 1 : 0) - (kl ? 1 : 0);
      // digitale Lenkung weich rampen
      const rate = target === 0 ? 6 : (Math.sign(target) !== Math.sign(this.steerSmooth) ? 8 : 3.2);
      this.steerSmooth += Math.max(-rate * dt, Math.min(rate * dt, target - this.steerSmooth));
      steer = this.steerSmooth; thr = ku ? 1 : 0; brk = kd ? 1 : 0;
    } else {
      this.steerSmooth *= Math.max(0, 1 - dt * 8);
    }
    if (this.pad.active) { steer = this.pad.steer; thr = this.pad.throttle; brk = this.pad.brake; src = 'pad'; }
    if (this.touch.active) {
      steer = this.tilt.enabled ? this.tilt.value : this.touch.steer;
      thr = this.touch.throttle; brk = this.touch.brake; src = 'touch';
    } else if (this.tilt.enabled && this.tilt.value) {
      steer = this.tilt.value; src = src === 'none' ? 'tilt' : src;
    }
    this.out.steer = steer; this.out.throttle = thr; this.out.brake = brk; this.out.source = src;
    return this.out;
  }
}
