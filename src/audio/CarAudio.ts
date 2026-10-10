import type { Controls } from '../engine/Input';
import type { Vehicle } from '../physics/Vehicle';
import type { AudioEngine } from './AudioEngine';
import type { Sfx } from './Sfx';
import { engineWave } from './Synth';

const LOOP_RPM = 3000; // rpm at which the engine loops play at rate 1
const FIRING_HZ = (LOOP_RPM / 60) * 2; // 4-cylinder, 4-stroke: 2 firings per revolution

/**
 * All continuous sounds of one car, driven by its physics state every frame:
 * engine (on/off-load layers), tyre squeal, loose-surface crunch, road roar
 * and wind. Also detects gear shifts, wall hits and landings for one-shots.
 */
export class CarAudio {
  private onLoad: GainNode;
  private offLoad: GainNode;
  private engineFilter: BiquadFilterNode;
  private engineSources: AudioBufferSourceNode[] = [];
  private squeal: GainNode;
  private squealOsc: OscillatorNode;
  private crunch: GainNode;
  private crunchFilter: BiquadFilterNode;
  private roar: GainNode;
  private wind: GainNode;

  private out: GainNode;
  private sources: AudioScheduledSourceNode[] = [];
  private rpm = 900;
  private lastGear = 1;
  private airTime = 0;

  constructor(
    private audio: AudioEngine,
    private sfx: Sfx,
  ) {
    const ctx = audio.ctx;
    this.out = ctx.createGain();
    this.out.connect(audio.sfx);
    const out = this.out;
    const noise = () => {
      const src = audio.noiseSource();
      this.sources.push(src);
      return src;
    };
    const loop = (brightness: number, seed: number) => {
      const data = engineWave(ctx.sampleRate, { firingHz: FIRING_HZ, cycles: 48, brightness, roughness: 0.25, seed });
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.copyToChannel(data, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.start();
      this.engineSources.push(src);
      this.sources.push(src);
      return src;
    };

    // Engine: two layers → shared low-pass → mild saturation → out.
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(1.6);
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.55;
    this.onLoad = ctx.createGain();
    this.offLoad = ctx.createGain();
    loop(0.9, 3).connect(this.onLoad).connect(this.engineFilter);
    loop(0.15, 11).connect(this.offLoad).connect(this.engineFilter);
    this.engineFilter.connect(shaper).connect(engineGain).connect(out);

    // Tyre squeal: wobbling triangle + narrow band of noise.
    this.squeal = ctx.createGain();
    this.squeal.gain.value = 0;
    this.squealOsc = ctx.createOscillator();
    this.squealOsc.type = 'triangle';
    this.squealOsc.frequency.value = 820;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 35;
    lfo.connect(lfoGain).connect(this.squealOsc.frequency);
    lfo.start();
    this.squealOsc.start();
    this.sources.push(lfo, this.squealOsc);
    const squealNoise = ctx.createBiquadFilter();
    squealNoise.type = 'bandpass';
    squealNoise.frequency.value = 1300;
    squealNoise.Q.value = 6;
    const oscLevel = ctx.createGain();
    oscLevel.gain.value = 0.35;
    this.squealOsc.connect(oscLevel).connect(this.squeal);
    noise().connect(squealNoise).connect(this.squeal);
    this.squeal.connect(out);

    // Gravel / grass crunch: low-passed noise.
    this.crunchFilter = ctx.createBiquadFilter();
    this.crunchFilter.type = 'lowpass';
    this.crunch = ctx.createGain();
    this.crunch.gain.value = 0;
    noise().connect(this.crunchFilter).connect(this.crunch).connect(out);

    // Tyre roar on asphalt and wind at speed.
    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.value = 260;
    this.roar = ctx.createGain();
    this.roar.gain.value = 0;
    noise().connect(roarFilter).connect(this.roar).connect(out);
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 600;
    windFilter.Q.value = 0.4;
    this.wind = ctx.createGain();
    this.wind.gain.value = 0;
    noise().connect(windFilter).connect(this.wind).connect(out);
  }

  /** Silence: used while paused. */
  mute(muted: boolean) {
    this.out.gain.setTargetAtTime(muted ? 0 : 1, this.audio.ctx.currentTime, 0.05);
  }

  dispose() {
    for (const src of this.sources) src.stop();
    this.out.disconnect();
  }

  /** `wallHit` = strongest wall impact (m/s) across the physics steps of this frame. */
  update(v: Vehicle, c: Controls, dt: number, wallHit: number) {
    const t = this.audio.ctx.currentTime;
    const p = v.params;
    const speed = Math.abs(v.speed);

    // Free-revving when nearly stopped (or in the air) so the throttle is audible on the grid.
    const freeRev = speed < 3 || v.grounded === 0;
    const target = freeRev && c.throttle > 0 ? Math.max(v.rpm, p.idleRpm + c.throttle * (p.redline * 0.85 - p.idleRpm)) : v.rpm;
    const rate = target > this.rpm ? 6 : 4;
    this.rpm += (target - this.rpm) * Math.min(1, dt * rate);
    // Rev limiter stutter.
    const limiter = this.rpm > p.redline * 0.97 && Math.floor(t * 30) % 2 === 0 ? 0.6 : 1;

    const playback = Math.max(0.2, this.rpm / LOOP_RPM);
    for (const src of this.engineSources) src.playbackRate.setTargetAtTime(playback, t, 0.02);
    const throttle = v.gear < 0 ? c.brake : c.throttle;
    this.onLoad.gain.setTargetAtTime((0.15 + 0.85 * throttle) * limiter, t, 0.04);
    this.offLoad.gain.setTargetAtTime(1 - throttle * 0.75, t, 0.04);
    this.engineFilter.frequency.setTargetAtTime(500 + this.rpm * 0.5 + throttle * 2200, t, 0.04);

    // Surfaces under the wheels.
    let slip = 0;
    let loose = 0;
    let asphalt = 0;
    for (const w of v.wheels) {
      if (!w.contact) continue;
      slip = Math.max(slip, w.slip);
      if (w.surface === 'asphalt') asphalt++;
      else loose++;
    }
    const grounded = v.grounded > 0 ? 1 : 0;
    const squeal = asphalt > 0 && speed > 3 ? Math.min(1, Math.max(0, slip - 0.05) * 2.5) : 0;
    this.squeal.gain.setTargetAtTime(squeal * 0.3, t, 0.05);
    this.squealOsc.frequency.setTargetAtTime(760 + slip * 200, t, 0.1);
    const crunch = loose > 0 ? Math.min(1, speed / 25) * 0.35 + slip * 0.35 : 0;
    this.crunch.gain.setTargetAtTime(crunch * grounded, t, 0.05);
    this.crunchFilter.frequency.setTargetAtTime(v.wheels.some((w) => w.surface === 'gravel') ? 1400 : 500, t, 0.1);
    this.roar.gain.setTargetAtTime(asphalt > 0 ? Math.min(0.25, speed / 200) : 0, t, 0.1);
    this.wind.gain.setTargetAtTime(Math.min(0.3, (speed / 70) ** 2 * 0.3), t, 0.1);

    // One-shots.
    if (v.gear !== this.lastGear) {
      if (v.gear > 0 && this.lastGear > 0) this.sfx.shift();
      this.lastGear = v.gear;
    }
    if (wallHit > 2) this.sfx.impact(wallHit);
    if (v.grounded === 0) this.airTime += dt;
    else {
      if (this.airTime > 0.35) this.sfx.landing(Math.min(1, this.airTime / 1.2));
      this.airTime = 0;
    }
  }
}

function saturationCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}
