// Strategie-Kamera: Zielpunkt auf dem Gelände, Abstand, Drehung. Nah = flacher Blick, fern = steiler.
// Steuerung: WASD/Pfeile oder rechte Maustaste ziehen = verschieben, Mausrad = Zoom,
// Q/E oder mittlere Maustaste ziehen = drehen.
// Touch: ein Finger = verschieben, zwei Finger = zoomen (Spreizen) und drehen.
import * as THREE from 'three';

export interface CameraHost {
  groundY(x: number, z: number): number;
  bounds: { x: number; z: number };
}

export class RtsCamera {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  distance = 2600;
  yaw = 0;            // 0 = Blick nach Norden
  private goal = { x: 0, z: 0, distance: 2600, yaw: 0 };
  private keys = new Set<string>();
  private drag: { button: number; x: number; y: number } | null = null;
  private touches = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; angle: number } | null = null;
  minDistance = 180;
  maxDistance = 16000;

  constructor(dom: HTMLElement, private host: CameraHost) {
    this.camera = new THREE.PerspectiveCamera(40, 1, 5, 80000);
    addEventListener('keydown', (e) => { if (!(e.target instanceof HTMLInputElement)) this.keys.add(e.code); });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.style.touchAction = 'none';
    const pinchState = () => {
      const [a, b] = [...this.touches.values()];
      return { dist: Math.hypot(b.x - a.x, b.y - a.y), angle: Math.atan2(b.y - a.y, b.x - a.x) };
    };
    const endTouch = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      this.touches.delete(e.pointerId);
      this.pinch = this.touches.size === 2 ? pinchState() : null;
    };
    dom.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.pinch = this.touches.size === 2 ? pinchState() : null;
        try { dom.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
        return;
      }
      if (e.button === 1 || e.button === 2) {
        this.drag = { button: e.button, x: e.clientX, y: e.clientY };
        dom.setPointerCapture(e.pointerId);
      }
    });
    dom.addEventListener('pointerup', (e) => { this.drag = null; endTouch(e); });
    dom.addEventListener('pointercancel', (e) => { this.drag = null; endTouch(e); });
    dom.addEventListener('pointermove', (e) => {
      const t = this.touches.get(e.pointerId);
      if (t) {
        const dx = e.clientX - t.x, dy = e.clientY - t.y;
        t.x = e.clientX; t.y = e.clientY;
        if (this.touches.size === 1) {
          const k = (this.goal.distance / dom.clientHeight) * 1.1;
          this.pan(-dx * k, -dy * k);
          this.snap();
        } else if (this.touches.size === 2 && this.pinch) {
          const now = pinchState();
          this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * (this.pinch.dist / Math.max(now.dist, 1)),
            this.minDistance, this.maxDistance);
          let da = now.angle - this.pinch.angle;
          if (da > Math.PI) da -= 2 * Math.PI;
          if (da < -Math.PI) da += 2 * Math.PI;
          this.goal.yaw += da;
          this.pinch = now;
        }
        return;
      }
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
      if (this.drag.button === 2) {
        const k = (this.goal.distance / dom.clientHeight) * 1.1;
        this.pan(-dx * k, -dy * k);
        this.snap();
      } else {
        this.goal.yaw -= dx * 0.005;
      }
    });
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * 0.0022);
      this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * f, this.minDistance, this.maxDistance);
    }, { passive: false });
  }

  /** Kamera sofort (oder weich) auf Weltposition setzen. */
  lookAt(x: number, z: number, instant = false) {
    this.goal.x = x; this.goal.z = z;
    if (instant) this.snap();
  }

  setDistance(d: number) { this.goal.distance = d; }

  private snap() { this.target.x = this.goal.x; this.target.z = this.goal.z; }

  private pan(right: number, forward: number) {
    const s = Math.sin(this.goal.yaw), c = Math.cos(this.goal.yaw);
    this.goal.x += right * c - forward * s;
    this.goal.z += right * s + forward * c;
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, 0, this.host.bounds.x);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, 0, this.host.bounds.z);
  }

  /** Neigung aus dem Zoom: nah 26°, fern 56° über dem Horizont. */
  get pitch() {
    const t = Math.log(this.distance / this.minDistance) / Math.log(this.maxDistance / this.minDistance);
    return THREE.MathUtils.degToRad(26 + 30 * Math.pow(t, 1.1));
  }

  update(dt: number) {
    const speed = this.goal.distance * 0.9 * dt;
    let r = 0, f = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) f -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) f += 1;
    if (r || f) this.pan(r * speed, f * speed);
    if (this.keys.has('KeyQ')) this.goal.yaw += 1.4 * dt;
    if (this.keys.has('KeyE')) this.goal.yaw -= 1.4 * dt;

    const k = 1 - Math.exp(-dt * 10);
    this.target.x += (this.goal.x - this.target.x) * k;
    this.target.z += (this.goal.z - this.target.z) * k;
    this.distance += (this.goal.distance - this.distance) * k;
    this.yaw += (this.goal.yaw - this.yaw) * k;
    const gy = this.host.groundY(this.target.x, this.target.z);
    this.target.y += (gy - this.target.y) * (this.target.y === 0 ? 1 : k);

    const p = this.pitch;
    const horiz = Math.cos(p) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * horiz,
      this.target.y + Math.sin(p) * this.distance,
      this.target.z + Math.cos(this.yaw) * horiz,
    );
    // Nie unter das Gelände
    const under = this.host.groundY(this.camera.position.x, this.camera.position.z) + 40;
    if (this.camera.position.y < under) this.camera.position.y = under;
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(5, this.distance * 0.02);
    this.camera.far = this.distance * 12 + 20000;
    this.camera.updateProjectionMatrix();
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
