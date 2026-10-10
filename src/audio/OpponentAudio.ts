import * as THREE from 'three';
import type { Vehicle } from '../physics/Vehicle';
import type { AudioEngine } from './AudioEngine';
import { engineWave } from './Synth';

const LOOP_RPM = 3000;
const SPEED_OF_SOUND = 343;
const _toListener = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/**
 * Cheap positional engine sound for computer cars: one shared loop per car,
 * panned in 3D around the camera with distance falloff and a Doppler shift.
 */
export class OpponentAudio {
  private voices: { src: AudioBufferSourceNode; gain: GainNode; panner: PannerNode; car: Vehicle }[] = [];

  constructor(
    private audio: AudioEngine,
    cars: Vehicle[],
  ) {
    const ctx = audio.ctx;
    const data = engineWave(ctx.sampleRate, { firingHz: (LOOP_RPM / 60) * 2, cycles: 32, brightness: 0.6, roughness: 0.3, seed: 21 });
    const buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buffer.copyToChannel(data, 0);
    for (const car of cars) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.start(0, Math.random() * buffer.duration);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 2400;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const panner = new PannerNode(ctx, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 6, rolloffFactor: 1.4, maxDistance: 400 });
      src.connect(filter).connect(gain).connect(panner).connect(audio.sfx);
      this.voices.push({ src, gain, panner, car });
    }
  }

  update(camera: THREE.Camera) {
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const l = ctx.listener;
    camera.getWorldDirection(_fwd);
    if (l.positionX) {
      l.positionX.setTargetAtTime(camera.position.x, t, 0.02);
      l.positionY.setTargetAtTime(camera.position.y, t, 0.02);
      l.positionZ.setTargetAtTime(camera.position.z, t, 0.02);
      l.forwardX.setTargetAtTime(_fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(_fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(_fwd.z, t, 0.02);
    } else {
      l.setPosition(camera.position.x, camera.position.y, camera.position.z);
      l.setOrientation(_fwd.x, _fwd.y, _fwd.z, 0, 1, 0);
    }
    for (const v of this.voices) {
      const car = v.car;
      v.panner.positionX.setTargetAtTime(car.pos.x, t, 0.02);
      v.panner.positionY.setTargetAtTime(car.pos.y, t, 0.02);
      v.panner.positionZ.setTargetAtTime(car.pos.z, t, 0.02);
      // Doppler: approaching cars sound higher.
      _toListener.subVectors(camera.position, car.pos).normalize();
      const closing = THREE.MathUtils.clamp(car.vel.dot(_toListener), -60, 60);
      const doppler = SPEED_OF_SOUND / (SPEED_OF_SOUND - closing);
      v.src.playbackRate.setTargetAtTime(Math.max(0.25, car.rpm / LOOP_RPM) * doppler, t, 0.05);
      v.gain.gain.setTargetAtTime(0.35, t, 0.1);
    }
  }

  dispose() {
    for (const v of this.voices) {
      v.src.stop();
      v.panner.disconnect();
    }
    this.voices = [];
  }
}
