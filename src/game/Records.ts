import * as THREE from 'three';
import type { TrackData } from '../track/TrackData';

/** Stable key for a track layout (editing the points gives a new key, so old ghosts don't mismatch). */
export function trackKey(data: TrackData) {
  const s = JSON.stringify(data.controlPoints);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${data.name}#${h.toString(36)}`;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: records just aren't kept
  }
}

export interface TrackRecord {
  bestLap?: number;
  bestRace?: number;
}

export const Records = {
  get(key: string): TrackRecord {
    return read<Record<string, TrackRecord>>('crazy-driver.records')?.[key] ?? {};
  },
  /** Store improvements; returns which records were beaten. */
  submit(key: string, lap: number | null, race: number | null) {
    const all = read<Record<string, TrackRecord>>('crazy-driver.records') ?? {};
    const r = all[key] ?? {};
    const beaten = { lap: false, race: false };
    if (lap !== null && (r.bestLap === undefined || lap < r.bestLap)) {
      r.bestLap = lap;
      beaten.lap = true;
    }
    if (race !== null && (r.bestRace === undefined || race < r.bestRace)) {
      r.bestRace = race;
      beaten.race = true;
    }
    all[key] = r;
    write('crazy-driver.records', all);
    return beaten;
  },
};

// --- Ghosts -------------------------------------------------------------------

const GHOST_HZ = 20;
const FRAME = 8; // t, x, y, z, qx, qy, qz, qw

export interface GhostData {
  lapTime: number;
  frames: number[];
}

export const GhostStore = {
  load: (key: string) => read<GhostData>(`crazy-driver.ghost.${key}`),
  save: (key: string, ghost: GhostData) => write(`crazy-driver.ghost.${key}`, ghost),
};

/** Records the player's car at 20 Hz during a lap. */
export class GhostRecorder {
  private frames: number[] = [];
  private next = 0;

  reset() {
    this.frames = [];
    this.next = 0;
  }

  record(t: number, pos: THREE.Vector3, q: THREE.Quaternion) {
    if (t < this.next - 1e-6) return;
    // Advance from the previous target (not from t) so rounding can't make the rate drift.
    this.next = Math.max(this.next + 1 / GHOST_HZ, t);
    const r = (v: number) => Math.round(v * 100) / 100;
    const rq = (v: number) => Math.round(v * 1000) / 1000;
    this.frames.push(r(t), r(pos.x), r(pos.y), r(pos.z), rq(q.x), rq(q.y), rq(q.z), rq(q.w));
  }

  finish(lapTime: number): GhostData {
    return { lapTime, frames: this.frames.slice() };
  }
}

const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

/** Places an object along a recorded ghost lap at a given lap time. */
export class GhostPlayer {
  constructor(
    private data: GhostData,
    readonly object: THREE.Object3D,
  ) {}

  update(t: number) {
    const f = this.data.frames;
    const count = f.length / FRAME;
    if (count < 2 || t > this.data.lapTime) {
      this.object.visible = false;
      return;
    }
    this.object.visible = true;
    // Frames are evenly spaced, so index directly and correct by one if needed.
    let i = Math.min(count - 2, Math.max(0, Math.floor(t * GHOST_HZ)));
    while (i > 0 && f[i * FRAME] > t) i--;
    while (i < count - 2 && f[(i + 1) * FRAME] < t) i++;
    const a = i * FRAME;
    const b = a + FRAME;
    const u = THREE.MathUtils.clamp((t - f[a]) / Math.max(1e-3, f[b] - f[a]), 0, 1);
    this.object.position.set(
      f[a + 1] + (f[b + 1] - f[a + 1]) * u,
      f[a + 2] + (f[b + 2] - f[a + 2]) * u,
      f[a + 3] + (f[b + 3] - f[a + 3]) * u,
    );
    _q1.set(f[a + 4], f[a + 5], f[a + 6], f[a + 7]);
    _q2.set(f[b + 4], f[b + 5], f[b + 6], f[b + 7]);
    this.object.quaternion.slerpQuaternions(_q1, _q2, u);
  }
}
