import * as THREE from 'three';
import type { Controls } from '../engine/Input';
import type { Vehicle } from '../physics/Vehicle';
import { newLocation, type Track } from '../track/Track';
import { TrackGround } from '../track/TrackGround';
import type { RacingLine } from './RacingLine';

export interface AIPersonality {
  skill: number; // 0.8..1.05, scales cornering speed
  lineOffset: number; // metres, personal deviation from the racing line
  aggression: number; // 0..1, how late it brakes
}

const BRAKE_DECEL = 8; // m/s², assumed deceleration when planning braking
const _target = new THREE.Vector3();

/**
 * Computer driver: follows the racing line with look-ahead steering and plans
 * its speed from the corner-speed profile ahead. `rubberBand` (0.85..1.15)
 * lets the race director slow leaders down and help stragglers.
 */
export class AIDriver {
  rubberBand = 1;
  private loc = newLocation();
  private hint = { index: 0 };
  private stuckTime = 0;
  private reverseTime = 0;
  private readonly baseTorque: number;
  private readonly controls: Controls = { steer: 0, throttle: 0, brake: 0, handbrake: false, reset: false };

  constructor(
    private track: Track,
    private line: RacingLine,
    readonly vehicle: Vehicle,
    readonly personality: AIPersonality,
  ) {
    this.baseTorque = vehicle.params.maxTorque;
  }

  update(dt: number): Controls {
    const v = this.vehicle;
    const c = this.controls;
    const speed = v.speed;
    const l = this.track.locate(v.pos.x, v.pos.z, this.hint, this.loc);
    const dist = l.dist;
    const skill = this.personality.skill * (0.92 + 0.08 * this.rubberBand);
    v.params.maxTorque = this.baseTorque * this.rubberBand;

    // --- Steering: aim at a point on the racing line ahead.
    const look = 7 + Math.abs(speed) * 0.42;
    const s = this.track.sampleAtDist(dist + look);
    const lateral = this.line.offsetAt(dist + look) + this.personality.lineOffset;
    _target.copy(s.pos).addScaledVector(s.right, lateral);
    const desired = Math.atan2(_target.x - v.pos.x, _target.z - v.pos.z);
    let diff = desired - v.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    c.steer = THREE.MathUtils.clamp(-diff * 2.4, -1, 1);

    // --- Speed: the slowest "can still brake in time" speed over the braking horizon.
    const horizon = (speed * speed) / (2 * BRAKE_DECEL) + 25;
    let allowed = 80;
    for (let d = 0; d <= horizon; d += 4) {
      const vmax = this.line.maxSpeedAt(dist + d) * skill;
      const decel = BRAKE_DECEL * (0.85 + 0.3 * this.personality.aggression);
      allowed = Math.min(allowed, Math.sqrt(vmax * vmax + 2 * decel * d));
    }
    // Don't floor it while pointing the wrong way.
    if (Math.abs(diff) > 0.6) allowed = Math.min(allowed, 12);

    c.throttle = THREE.MathUtils.clamp((allowed - speed) / 3, 0, 1);
    c.brake = speed > allowed + 1.5 ? THREE.MathUtils.clamp((speed - allowed) / 4, 0, 1) : 0;
    c.handbrake = false;

    // Traction control: back off when the rear tyres are sliding (powerful rear-drive cars).
    const rearSlip = Math.max(v.wheels[2].slip, v.wheels[3].slip);
    if (rearSlip > 0.12) c.throttle *= Math.max(0.15, 1 - (rearSlip - 0.12) * 3);

    // --- Recovery: nose against a wall → reverse out with opposite lock; still stuck → respawn.
    const offRoad = Math.abs(l.lateral) > TrackGround.wallOffset(l.width) + 2;
    this.stuckTime = Math.abs(speed) < 1.5 || offRoad ? this.stuckTime + dt : 0;
    c.reset = false;
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      c.throttle = 0;
      c.brake = 1; // brake held at a standstill = reverse
      c.steer = -c.steer;
    } else if (this.stuckTime > 0.8 && this.stuckTime < 1 && !offRoad) {
      this.reverseTime = 1.1;
    }
    if (this.stuckTime > 3.5) {
      this.stuckTime = 0;
      this.reverseTime = 0;
      v.respawn();
    }
    return c;
  }
}

/** Varied but fair opponents. */
export function makePersonalities(count: number, seed = 1): AIPersonality[] {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  return Array.from({ length: count }, (_, i) => ({
    skill: 0.86 + (i / Math.max(1, count - 1)) * 0.12 + rnd() * 0.03,
    lineOffset: (rnd() - 0.5) * 2,
    aggression: rnd(),
  }));
}
