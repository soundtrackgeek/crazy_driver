import * as THREE from 'three';

export type Surface = 'asphalt' | 'gravel' | 'grass';

export interface SurfaceInfo {
  grip: number; // multiplier on tyre grip
  rolling: number; // rolling resistance, N per (m/s) per N of load
}

export const SURFACES: Record<Surface, SurfaceInfo> = {
  asphalt: { grip: 1.0, rolling: 0.004 },
  gravel: { grip: 0.75, rolling: 0.012 },
  grass: { grip: 0.62, rolling: 0.02 },
};

/** Anything the car can drive on. Later the spline track implements this too. */
export interface Ground {
  height(x: number, z: number): number;
  surface(x: number, z: number): Surface;
}

const EPS = 0.25;

/** Surface normal by central differences of the height function. */
export function groundNormal(g: Ground, x: number, z: number, out = new THREE.Vector3()) {
  return out
    .set(g.height(x - EPS, z) - g.height(x + EPS, z), 2 * EPS, g.height(x, z - EPS) - g.height(x, z + EPS))
    .normalize();
}

export class FlatGround implements Ground {
  constructor(private surf: Surface = 'asphalt') {}
  height() {
    return 0;
  }
  surface() {
    return this.surf;
  }
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * M1 test area: an asphalt strip along Z with a jump ramp and a bumpy section,
 * gravel hills to the left (+X), flat grass elsewhere.
 */
export class TestGround implements Ground {
  height(x: number, z: number) {
    let h = 0;
    if (Math.abs(x) < 6) {
      // Kicker ramp: rises 2.5 m over 18 m, then drops off.
      if (z > 100 && z < 118) h = ((z - 100) / 18) * 2.5;
      // Bumpy section.
      if (z > -200 && z < -120) h = 0.12 * Math.sin(z * 1.3) * smooth(-200, -190, z) * smooth(-120, -130, z);
    }
    // Rolling gravel hills.
    const w = smooth(30, 60, x) * smooth(220, 190, x) * smooth(-220, -190, z) * smooth(220, 190, z);
    if (w > 0) h += w * 3.5 * Math.sin(x * 0.07) * Math.cos(z * 0.055);
    return h;
  }

  surface(x: number, z: number): Surface {
    if (Math.abs(x) < 6) return 'asphalt';
    if (x > 40 && x < 210 && Math.abs(z) < 210) return 'gravel';
    return 'grass';
  }
}
