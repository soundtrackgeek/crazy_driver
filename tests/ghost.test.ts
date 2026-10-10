import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GhostPlayer, GhostRecorder, trackKey } from '../src/game/Records';
import { defaultTrack } from '../src/editor/EditorState';
import { ordinal } from '../src/ui/Hud';

describe('ghost', () => {
  it('records at 20 Hz and plays back with interpolation', () => {
    const rec = new GhostRecorder();
    const q = new THREE.Quaternion();
    for (let t = 0; t <= 10; t += 1 / 120) rec.record(t, new THREE.Vector3(t * 10, 0, 0), q);
    const data = rec.finish(10);
    expect(data.frames.length / 8).toBeGreaterThan(195);
    expect(data.frames.length / 8).toBeLessThan(205);
    const obj = new THREE.Object3D();
    const player = new GhostPlayer(data, obj);
    player.update(5.025);
    expect(obj.visible).toBe(true);
    expect(obj.position.x).toBeCloseTo(50.25, 0);
    player.update(11);
    expect(obj.visible).toBe(false);
  });

  it('track keys change when the layout changes', () => {
    const a = defaultTrack();
    const b = defaultTrack();
    b.controlPoints[1].p = [1, 0, 120];
    expect(trackKey(a)).toBe(trackKey(defaultTrack()));
    expect(trackKey(a)).not.toBe(trackKey(b));
  });

  it('formats race positions', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1ST', '2ND', '3RD', '4TH', '11TH', '12TH', '13TH', '21ST', '22ND']);
  });
});
