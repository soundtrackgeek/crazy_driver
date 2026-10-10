/**
 * Fixed-timestep game loop: simulation runs at a constant rate (stable physics),
 * rendering runs once per animation frame with an interpolation factor.
 */
export class Loop {
  private acc = 0;
  private last = 0;
  private running = false;

  constructor(
    private update: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
    readonly step = 1 / 120,
  ) {}

  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
  }

  private frame = (now: number) => {
    if (!this.running) return;
    // Clamp to avoid a "spiral of death" after tab switches.
    const frameDt = Math.min((now - this.last) / 1000, 0.25);
    this.last = now;
    this.acc += frameDt;
    while (this.acc >= this.step) {
      this.update(this.step);
      this.acc -= this.step;
    }
    this.render(this.acc / this.step, frameDt);
    requestAnimationFrame(this.frame);
  };
}
