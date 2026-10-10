import { SHOULDER, Track } from './Track';
import { TrackGround } from './TrackGround';

export interface TrackIssue {
  level: 'error' | 'warning';
  message: string;
  at: [number, number, number];
}

const MIN_RADIUS = 15; // metres
const MAX_GRADE = 0.18; // 18 %
const DEDUPE = 40; // don't report the same kind of issue twice within this distance

/**
 * Checks a built track for problems the game can't handle well:
 * overlapping sections (crossings and bridges aren't supported), very tight
 * corners and very steep slopes.
 */
export function validateTrack(track: Track): TrackIssue[] {
  const issues: TrackIssue[] = [];
  const samples = track.samples;
  const n = samples.length;
  const add = (level: TrackIssue['level'], message: string, x: number, y: number, z: number) => {
    const near = issues.some((i) => i.message.split(' (')[0] === message.split(' (')[0] && Math.hypot(i.at[0] - x, i.at[2] - z) < DEDUPE);
    if (!near) issues.push({ level, message, at: [x, y, z] });
  };

  // Overlap: any two samples far apart along the track but whose walls intersect.
  const maxWall = Math.max(...samples.map((s) => TrackGround.wallOffset(s.width)));
  const skip = Math.ceil((maxWall * 2 + SHOULDER * 4) / track.spacing) + 4;
  for (let i = 0; i < n; i++) {
    const a = samples[i];
    const wa = TrackGround.wallOffset(a.width);
    for (let j = i + skip; j < n; j++) {
      if (n - (j - i) < skip) continue; // close to i around the loop seam
      const b = samples[j];
      const limit = wa + TrackGround.wallOffset(b.width);
      const dx = a.pos.x - b.pos.x;
      const dz = a.pos.z - b.pos.z;
      if (dx * dx + dz * dz < limit * limit) {
        add('error', 'Track sections overlap (crossings are not supported)', (a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2, (a.pos.z + b.pos.z) / 2);
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const r = 1 / Math.max(Math.abs(s.curvature), 1e-6);
    if (r < MIN_RADIUS) add('warning', `Very tight corner (radius ${r.toFixed(0)} m)`, s.pos.x, s.pos.y, s.pos.z);
    // Grade over ~20 m.
    const k = Math.max(1, Math.round(20 / track.spacing));
    const ahead = track.sample(i + k);
    const grade = Math.abs(ahead.pos.y - s.pos.y) / (k * track.spacing);
    if (grade > MAX_GRADE) add('warning', `Very steep (${(grade * 100).toFixed(0)} %)`, s.pos.x, s.pos.y, s.pos.z);
  }
  return issues;
}
