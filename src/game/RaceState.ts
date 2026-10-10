import * as THREE from 'three';
import { Track, newLocation } from '../track/Track';
import { checkpointDistances } from '../track/TrackMesh';

export type RaceEvent = 'start' | 'checkpoint' | 'lap' | 'finish';

/**
 * Lap / checkpoint tracking for one car. Progress comes from projecting the car
 * onto the centre line; a lap only counts if every checkpoint was passed in order.
 */
export class RaceState {
  lap = 0; // 0 = before the first crossing of the start line (rolling start)
  nextCheckpoint = 0;
  time = 0; // total race time
  lapStart = 0;
  lastLap: number | null = null;
  bestLap: number | null = null;
  finished = false;
  wrongWay = false;
  /** Distance along the lap, 0..track.length. */
  dist = 0;
  /** Monotonic progress (laps * length + dist), for ranking cars. */
  progress = 0;

  private readonly checkpoints: number[];
  private hint = { index: 0 };
  private loc = newLocation();
  private wrongWayTimer = 0;

  constructor(
    private track: Track,
    readonly totalLaps = track.data.laps,
  ) {
    this.checkpoints = checkpointDistances(track);
  }

  get lapTime() {
    return this.lap > 0 ? this.time - this.lapStart : 0;
  }

  /** Advance one tick; returns the events that happened. */
  update(dt: number, pos: THREE.Vector3, vel: THREE.Vector3): RaceEvent[] {
    const events: RaceEvent[] = [];
    if (this.finished) return events;
    this.time += dt;

    const L = this.track.length;
    const prev = this.dist;
    const l = this.track.locate(pos.x, pos.z, this.hint, this.loc);
    this.dist = l.dist;

    // Wrong way: driving against the track direction for a moment.
    const along = vel.x * l.tangent.x + vel.z * l.tangent.z;
    this.wrongWayTimer = along < -3 ? this.wrongWayTimer + dt : 0;
    this.wrongWay = this.wrongWayTimer > 1;

    // Crossing the start line forwards = dist wraps from near L to near 0.
    const crossedStart = prev > L - 60 && this.dist < 60;
    const crossedBack = prev < 60 && this.dist > L - 60;

    if (!crossedStart && !crossedBack && this.lap > 0 && this.nextCheckpoint < this.checkpoints.length) {
      const cp = this.checkpoints[this.nextCheckpoint];
      if (prev < cp && this.dist >= cp && this.dist - prev < 60) {
        this.nextCheckpoint++;
        events.push('checkpoint');
      }
    }

    if (crossedStart) {
      if (this.lap === 0) {
        this.lap = 1;
        this.lapStart = this.time;
        events.push('start');
      } else if (this.nextCheckpoint === this.checkpoints.length) {
        const lapTime = this.time - this.lapStart;
        this.lastLap = lapTime;
        this.bestLap = this.bestLap === null ? lapTime : Math.min(this.bestLap, lapTime);
        this.lapStart = this.time;
        this.nextCheckpoint = 0;
        if (this.lap >= this.totalLaps) {
          this.finished = true;
          events.push('finish');
        } else {
          this.lap++;
          events.push('lap');
        }
      }
    }

    this.progress = Math.max(0, this.lap - 1) * L + (this.lap > 0 ? this.dist : this.dist - L);
    return events;
  }
}

export function formatTime(t: number | null) {
  if (t === null) return '--:--.--';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
