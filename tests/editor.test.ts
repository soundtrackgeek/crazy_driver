import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EditorState, defaultTrack, MIN_POINTS } from '../src/editor/EditorState';
import { Track } from '../src/track/Track';
import { parseTrack } from '../src/track/TrackData';
import { validateTrack } from '../src/track/Validate';

describe('EditorState', () => {
  it('undoes and redoes a drag gesture as one step', () => {
    const s = new EditorState(defaultTrack());
    const before = JSON.stringify(s.data);
    s.begin();
    for (let k = 1; k <= 5; k++) {
      s.setPosition(1, k, 0, 120);
      s.live();
    }
    s.end();
    expect(s.points[1].p[0]).toBe(5);
    s.undo();
    expect(JSON.stringify(s.data)).toBe(before);
    s.redo();
    expect(s.points[1].p[0]).toBe(5);
  });

  it('does not record undo for a gesture that changed nothing', () => {
    const s = new EditorState(defaultTrack());
    s.begin();
    s.end();
    expect(s.canUndo).toBe(false);
  });

  it('inserts into the nearest segment with interpolated height', () => {
    const s = new EditorState(defaultTrack());
    const n = s.points.length;
    const i = s.insertAt(-1, 60); // halfway along the first straight (0,0,0)→(0,0,120)
    expect(i).toBe(1);
    expect(s.points).toHaveLength(n + 1);
    expect(s.points[1].p).toEqual([-1, 0, 60]);
    expect(s.selected).toBe(1);
  });

  it('refuses to delete below the minimum point count', () => {
    const s = new EditorState({ ...defaultTrack(), controlPoints: defaultTrack().controlPoints.slice(0, MIN_POINTS) });
    expect(s.deletePoint(0)).toBe(false);
    expect(s.points).toHaveLength(MIN_POINTS);
  });

  it('new edits clear the redo stack', () => {
    const s = new EditorState(defaultTrack());
    s.updateTrack({ laps: 5 });
    s.undo();
    expect(s.canRedo).toBe(true);
    s.updateTrack({ laps: 2 });
    expect(s.canRedo).toBe(false);
  });
});

describe('validateTrack', () => {
  it('finds no problems on the test circuit or the default track', () => {
    const circuit = new Track(parseTrack(JSON.parse(readFileSync('public/assets/tracks/test-circuit.track.json', 'utf8'))));
    expect(validateTrack(circuit).filter((i) => i.level === 'error')).toEqual([]);
    expect(validateTrack(new Track(defaultTrack()))).toEqual([]);
  });

  it('reports a figure-of-eight crossing', () => {
    const eight = {
      ...defaultTrack(),
      controlPoints: [
        { p: [0, 0, 0] as [number, number, number] },
        { p: [100, 0, 100] as [number, number, number] },
        { p: [200, 0, 0] as [number, number, number] },
        { p: [100, 0, -100] as [number, number, number] },
        { p: [0, 0, 0.5] as [number, number, number] },
        { p: [-100, 0, 100] as [number, number, number] },
        { p: [-200, 0, 0] as [number, number, number] },
        { p: [-100, 0, -100] as [number, number, number] },
      ],
    };
    const issues = validateTrack(new Track(eight));
    expect(issues.some((i) => i.level === 'error' && i.message.startsWith('Track sections overlap'))).toBe(true);
  });

  it('warns about steep slopes', () => {
    const steep = { ...defaultTrack() };
    steep.controlPoints = steep.controlPoints.map((c, i) => ({ ...c, p: [c.p[0], i === 2 ? 40 : 0, c.p[2]] as [number, number, number] }));
    expect(validateTrack(new Track(steep)).some((i) => i.message.startsWith('Very steep'))).toBe(true);
  });
});
