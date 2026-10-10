import type { ControlPoint, TrackData } from '../track/TrackData';

export type ChangeKind = 'live' | 'commit';

const MAX_UNDO = 100;
export const MIN_POINTS = 4;

/** A small default circuit for "New track". */
export function defaultTrack(): TrackData {
  return {
    version: 1,
    name: 'New Track',
    theme: 'grassland',
    closed: true,
    laps: 3,
    controlPoints: [
      { p: [0, 0, 0], width: 14 },
      { p: [0, 0, 120] },
      { p: [-60, 3, 190] },
      { p: [-150, 6, 160] },
      { p: [-180, 4, 60] },
      { p: [-150, 0, -40] },
      { p: [-60, 0, -70] },
    ],
    checkpoints: [0.25, 0.5, 0.75],
    scenery: { seed: 1234, density: 0.7 },
    terrain: { seed: 7 },
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Editor model: the track being edited, the selection and snapshot-based
 * undo/redo. Discrete edits go through `change()`; gestures like dragging call
 * `begin()`, then mutate + `live()` repeatedly, then `end()`.
 */
export class EditorState {
  data: TrackData;
  selected: number | null = null;
  onChange: ((kind: ChangeKind) => void) | null = null;
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private pending: string | null = null;

  constructor(data: TrackData) {
    this.data = clone(data);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  get points() {
    return this.data.controlPoints;
  }

  private snapshot() {
    return JSON.stringify({ data: this.data, selected: this.selected });
  }

  private restore(snap: string) {
    const s = JSON.parse(snap) as { data: TrackData; selected: number | null };
    this.data = s.data;
    this.selected = s.selected;
  }

  begin() {
    this.pending = this.snapshot();
  }

  live() {
    this.onChange?.('live');
  }

  /** Finish a gesture; records undo only if something actually changed. */
  end() {
    if (this.pending === null) return;
    const before = this.pending;
    this.pending = null;
    if (before === this.snapshot()) return;
    this.undoStack.push(before);
    if (this.undoStack.length > MAX_UNDO) this.undoStack.shift();
    this.redoStack = [];
    this.onChange?.('commit');
  }

  change(fn: () => void) {
    this.begin();
    fn();
    this.end();
  }

  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return;
    this.redoStack.push(this.snapshot());
    this.restore(snap);
    this.onChange?.('commit');
  }

  redo() {
    const snap = this.redoStack.pop();
    if (!snap) return;
    this.undoStack.push(this.snapshot());
    this.restore(snap);
    this.onChange?.('commit');
  }

  /** Replace the whole track (load / new). Undoable. */
  replace(data: TrackData) {
    this.change(() => {
      this.data = clone(data);
      this.selected = null;
    });
  }

  select(i: number | null) {
    this.selected = i;
    this.onChange?.('live');
  }

  setPosition(i: number, x: number, y: number, z: number) {
    this.points[i].p = [round(x), round(y), round(z)];
  }

  updatePoint(i: number, props: Partial<Omit<ControlPoint, 'p'>>) {
    this.change(() => Object.assign(this.points[i], props));
  }

  updateTrack(props: Partial<TrackData>) {
    this.change(() => Object.assign(this.data, props));
  }

  /** Insert a point into the nearest segment of the control polygon. Returns its index. */
  insertAt(x: number, z: number, y?: number) {
    const pts = this.points;
    let best = 0;
    let bestD = Infinity;
    let bestT = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, , az] = pts[i].p;
      const [bx, , bz] = pts[(i + 1) % pts.length].p;
      const dx = bx - ax;
      const dz = bz - az;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
      const d = (ax + dx * t - x) ** 2 + (az + dz * t - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
        bestT = t;
      }
    }
    const a = pts[best];
    const b = pts[(best + 1) % pts.length];
    const lerp = (u: number | undefined, v: number | undefined, fallback: number) => (u ?? fallback) + ((v ?? fallback) - (u ?? fallback)) * bestT;
    const point: ControlPoint = {
      p: [round(x), round(y ?? lerp(a.p[1], b.p[1], 0)), round(z)],
    };
    if (a.width !== undefined || b.width !== undefined) point.width = round(lerp(a.width, b.width, 12));
    if (a.bank || b.bank) point.bank = round(lerp(a.bank, b.bank, 0));
    if (a.surface && a.surface !== 'asphalt') point.surface = a.surface;
    const index = best + 1;
    this.change(() => {
      pts.splice(index, 0, point);
      this.selected = index;
    });
    return index;
  }

  /** Delete a point (tracks need at least MIN_POINTS). */
  deletePoint(i: number) {
    if (this.points.length <= MIN_POINTS) return false;
    this.change(() => {
      this.points.splice(i, 1);
      this.selected = null;
    });
    return true;
  }
}

const round = (v: number) => Math.round(v * 10) / 10;
