import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Vehicle } from '../src/physics/Vehicle';
import { FlatGround } from '../src/physics/Ground';
import type { Controls } from '../src/engine/Input';

const DT = 1 / 120;
const ctl = (c: Partial<Controls> = {}): Controls => ({ steer: 0, throttle: 0, brake: 0, handbrake: false, reset: false, ...c });
const run = (v: Vehicle, seconds: number, c: Controls) => {
  for (let i = 0; i < seconds / DT; i++) v.step(DT, c);
};
const up = (v: Vehicle) => new THREE.Vector3(0, 1, 0).applyQuaternion(v.quat).y;

describe('Vehicle', () => {
  it('settles at rest on flat ground', () => {
    const v = new Vehicle(new FlatGround());
    run(v, 4, ctl());
    expect(v.vel.length()).toBeLessThan(0.05);
    expect(v.grounded).toBe(4);
    expect(up(v)).toBeGreaterThan(0.999);
    for (const w of v.wheels) {
      expect(w.compression).toBeGreaterThan(0.03);
      expect(w.compression).toBeLessThan(0.3);
    }
  });

  it('accelerates in a straight line past 100 km/h within 10 s', () => {
    const v = new Vehicle(new FlatGround());
    run(v, 10, ctl({ throttle: 1 }));
    expect(v.speed * 3.6).toBeGreaterThan(100);
    expect(Math.abs(v.pos.x)).toBeLessThan(1);
    expect(v.gear).toBeGreaterThan(2);
    expect(up(v)).toBeGreaterThan(0.98);
  });

  it('steers right towards -X', () => {
    const v = new Vehicle(new FlatGround());
    run(v, 3, ctl({ throttle: 1, steer: 1 }));
    expect(v.pos.x).toBeLessThan(-2);
    expect(up(v)).toBeGreaterThan(0.95);
  });

  it('brakes to a stop', () => {
    const v = new Vehicle(new FlatGround());
    run(v, 5, ctl({ throttle: 1 }));
    const start = v.speed;
    let t = 0;
    while (v.speed > 0.5 && t < 10) {
      v.step(DT, ctl({ brake: 1 }));
      t += DT;
    }
    expect(start).toBeGreaterThan(20);
    expect(t).toBeLessThan(4);
  });

  it('reverses slowly when holding brake from standstill', () => {
    const v = new Vehicle(new FlatGround());
    run(v, 8, ctl({ brake: 1 }));
    expect(v.gear).toBe(-1);
    expect(v.speed).toBeLessThan(-3);
    expect(v.speed).toBeGreaterThan(-9.5);
  });

  it('handbrake turn makes the rear slide', () => {
    const v = new Vehicle(new FlatGround());
    run(v, 4, ctl({ throttle: 1 }));
    let maxSlip = 0;
    for (let i = 0; i < 60; i++) {
      v.step(DT, ctl({ steer: 1, handbrake: true }));
      maxSlip = Math.max(maxSlip, v.slip);
    }
    expect(maxSlip).toBeGreaterThan(0.05);
  });

  it('recovers when flipped upside down', () => {
    const v = new Vehicle(new FlatGround());
    v.quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    v.pos.y = 1;
    run(v, 4, ctl());
    expect(up(v)).toBeGreaterThan(0.99);
  });
});

describe('Vehicle on the test ground', () => {
  it('lands the ramp jump at full throttle upright', async () => {
    const { TestGround } = await import('../src/physics/Ground');
    const v = new Vehicle(new TestGround());
    let airborne = false;
    for (let i = 0; i < 12 / DT; i++) {
      v.step(DT, ctl({ throttle: 1 }));
      if (v.grounded === 0 && v.pos.z > 100) airborne = true;
    }
    expect(airborne).toBe(true);
    expect(v.pos.z).toBeGreaterThan(200);
    expect(up(v)).toBeGreaterThan(0.95);
  });
});
