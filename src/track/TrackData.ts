import type { Surface } from '../physics/Ground';

/** One editable point on the track centre line. */
export interface ControlPoint {
  p: [number, number, number]; // x, y (height), z in metres
  width?: number; // road width, default 12
  bank?: number; // degrees, positive = right side lower
  surface?: Surface; // default asphalt
}

/** Serialized track (`*.track.json`). Only `controlPoints` drives the road geometry. */
export interface TrackData {
  version: 1;
  name: string;
  theme: string;
  closed: boolean;
  laps: number;
  controlPoints: ControlPoint[];
  /** Checkpoint positions as fractions of the lap (0..1). Default: 4 evenly spaced. */
  checkpoints?: number[];
  scenery?: { seed: number; density: number };
  /** Procedural landscape around the track. Amplitude defaults to the theme's. */
  terrain?: { seed: number; amplitude?: number };
}

export const DEFAULT_WIDTH = 12;

/** Minimal runtime validation for files loaded from disk or the editor. */
export function parseTrack(json: unknown): TrackData {
  const t = json as Partial<TrackData>;
  if (!t || typeof t !== 'object') throw new Error('Track: not an object');
  if (t.version !== 1) throw new Error(`Track: unsupported version ${String(t.version)}`);
  if (!Array.isArray(t.controlPoints) || t.controlPoints.length < 4) {
    throw new Error('Track: needs at least 4 control points');
  }
  for (const [i, cp] of t.controlPoints.entries()) {
    if (!Array.isArray(cp.p) || cp.p.length !== 3 || cp.p.some((v) => typeof v !== 'number' || !isFinite(v))) {
      throw new Error(`Track: control point ${i} has an invalid position`);
    }
  }
  return {
    version: 1,
    name: t.name ?? 'Untitled',
    theme: t.theme ?? 'grassland',
    closed: t.closed ?? true,
    laps: t.laps ?? 3,
    controlPoints: t.controlPoints,
    checkpoints: t.checkpoints,
    scenery: t.scenery,
    terrain: t.terrain,
  };
}
