/** Abstract control state shared by every input source (keyboard, gamepad, touch). */
export interface Controls {
  steer: number; // -1 (left) .. 1 (right)
  throttle: number; // 0..1
  brake: number; // 0..1
  handbrake: boolean;
  reset: boolean;
}

const emptyControls = (): Controls => ({ steer: 0, throttle: 0, brake: 0, handbrake: false, reset: false });

interface TouchZone {
  kind: 'steer' | 'gas' | 'brake';
  startX: number;
  x: number;
}

/**
 * Merges keyboard, gamepad and touch into one Controls object.
 * One instance per player keeps split-screen possible later.
 */
export class Input {
  readonly controls: Controls = emptyControls();
  private keys = new Set<string>();
  private touches = new Map<number, TouchZone>();

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerup', this.onPointerUp);
    el.addEventListener('pointercancel', this.onPointerUp);
  }

  /** Touch layout: left half = drag to steer, right half top = gas, bottom = brake. */
  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    const kind = e.clientX < w / 2 ? 'steer' : e.clientY < h * 0.6 ? 'gas' : 'brake';
    this.touches.set(e.pointerId, { kind, startX: e.clientX, x: e.clientX });
  };

  private onPointerMove = (e: PointerEvent) => {
    const t = this.touches.get(e.pointerId);
    if (t) t.x = e.clientX;
  };

  private onPointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
  };

  poll() {
    const k = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const c = emptyControls();

    // Keyboard
    c.steer = (k('ArrowRight', 'KeyD') ? 1 : 0) - (k('ArrowLeft', 'KeyA') ? 1 : 0);
    c.throttle = k('ArrowUp', 'KeyW') ? 1 : 0;
    c.brake = k('ArrowDown', 'KeyS') ? 1 : 0;
    c.handbrake = k('Space');
    c.reset = k('KeyR');

    // Gamepad (standard mapping: RT gas, LT brake, X handbrake, Y reset)
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) c.steer = ax;
      c.throttle = Math.max(c.throttle, pad.buttons[7]?.value ?? 0, pad.buttons[0]?.pressed ? 1 : 0);
      c.brake = Math.max(c.brake, pad.buttons[6]?.value ?? 0);
      c.handbrake ||= !!pad.buttons[2]?.pressed;
      c.reset ||= !!pad.buttons[3]?.pressed;
    }

    // Touch
    const steerRange = this.el.clientWidth * 0.12;
    for (const t of this.touches.values()) {
      if (t.kind === 'steer') c.steer = Math.max(-1, Math.min(1, (t.x - t.startX) / steerRange));
      if (t.kind === 'gas') c.throttle = 1;
      if (t.kind === 'brake') c.brake = 1;
    }

    Object.assign(this.controls, c);
    return this.controls;
  }
}
