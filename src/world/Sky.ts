import * as THREE from 'three';
import { makeNoise2D } from './Noise';
import type { Theme } from './Themes';

/**
 * Camera-centred backdrop: gradient sky dome, two rings of low-poly mountains,
 * an 8-sided sun and flat clouds. Nothing here is fogged; it is coloured to
 * melt into the horizon instead, like the painted backdrops of 90s racers.
 * `radius` must be inside the camera's far plane.
 */
export class Sky {
  readonly group = new THREE.Group();

  constructor(theme: Theme, seed = 3, radius = 560) {
    const DOME = radius;
    const k = radius / 560; // sizes below were tuned for a 560 m dome
    this.group.name = 'sky';
    const noise = makeNoise2D(seed);
    const horizon = new THREE.Color(theme.sky.horizon);
    const top = new THREE.Color(theme.sky.top);
    const basic = (opts: THREE.MeshBasicMaterialParameters = {}) =>
      new THREE.MeshBasicMaterial({ fog: false, depthWrite: false, ...opts });

    // Dome with a vertex-colour gradient (horizon → zenith).
    const dome = new THREE.SphereGeometry(DOME, 24, 12);
    const pos = dome.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.max(0, pos.getY(i) / DOME);
      c.copy(horizon).lerp(top, Math.pow(t, 0.6)).toArray(colors, i * 3);
    }
    dome.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const domeMesh = new THREE.Mesh(dome, basic({ vertexColors: true, side: THREE.BackSide }));
    domeMesh.renderOrder = -4;
    this.group.add(domeMesh);

    // Sun.
    const sunDir = new THREE.Vector3(...theme.sun.dir).normalize();
    const sun = new THREE.Mesh(new THREE.CircleGeometry(26 * k, 8), basic({ color: theme.sun.disc }));
    sun.position.copy(sunDir).multiplyScalar(DOME * 0.95);
    sun.lookAt(0, 0, 0);
    sun.renderOrder = -3;
    this.group.add(sun);

    // Clouds: flat 6-sided blobs scattered around the sky.
    const cloudMat = basic({ color: theme.clouds, transparent: true, opacity: 0.9 });
    for (let n = 0; n < 14; n++) {
      const a = (n / 14) * Math.PI * 2 + noise(n, 0.5) * 0.6;
      const elev = 0.12 + (noise(n, 3.3) + 1) * 0.12;
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(30 * k, 6), cloudMat);
      cloud.position.set(Math.sin(a), elev, Math.cos(a)).normalize().multiplyScalar(DOME * 0.9);
      cloud.lookAt(0, 0, 0);
      cloud.scale.set(2 + (noise(n, 7.1) + 1), 0.45, 1);
      cloud.renderOrder = -3;
      this.group.add(cloud);
    }

    // Mountain rings (far, hazier and taller; near, darker and lower).
    const far = new THREE.Color(theme.mountains.far).lerp(horizon, 0.25);
    const near = new THREE.Color(theme.mountains.near).lerp(horizon, 0.15);
    const caps = theme.mountains.caps !== undefined ? new THREE.Color(theme.mountains.caps) : null;
    this.group.add(this.ring(noise, DOME * 0.92, 9, 95 * k, far, caps, horizon, seed * 7 + 1, -2));
    this.group.add(this.ring(noise, DOME * 0.86, 14, 38 * k, near, null, horizon, seed * 13 + 5, -1));
  }

  /**
   * A ring of mountains around the horizon. The skyline is the maximum of a few
   * individual peaks of random width and height (so they overlap like a real
   * range), plus a little ridge noise. Slopes facing one way are lit, the
   * others shaded; snow covers everything above a jagged snowline.
   */
  private ring(
    noise: (x: number, y: number) => number,
    radius: number,
    count: number,
    maxH: number,
    color: THREE.Color,
    caps: THREE.Color | null,
    horizon: THREE.Color,
    seed: number,
    order: number,
  ) {
    let s = seed;
    const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const peaks = Array.from({ length: count }, () => ({
      at: rnd() * Math.PI * 2,
      width: 0.1 + rnd() * 0.42, // radians from peak to foot
      height: maxH * (0.35 + rnd() * 0.65),
      sharp: 1 + rnd() * 0.8,
    }));
    const skyline = (a: number) => {
      let h = maxH * 0.08 * (1 + noise(a * 2 + seed, 1.5)); // low foothills everywhere
      for (const p of peaks) {
        let d = Math.abs(a - p.at);
        d = Math.min(d, Math.PI * 2 - d);
        if (d < p.width) h = Math.max(h, p.height * Math.pow(1 - d / p.width, p.sharp));
      }
      return h + maxH * 0.05 * noise(a * 25 + seed, 7.7); // ridge roughness
    };

    const segs = 240;
    const base = -120;
    const snowLine = maxH * 0.62;
    const pos: number[] = [];
    const col: number[] = [];
    const pt = (a: number, h: number): [number, number, number] => [Math.sin(a) * radius, h, Math.cos(a) * radius];
    const push = (v: [number, number, number], c: THREE.Color) => {
      pos.push(...v);
      col.push(c.r, c.g, c.b);
    };
    const quad = (a0: number, a1: number, lo0: number, lo1: number, hi0: number, hi1: number, cLo: THREE.Color, cHi: THREE.Color) => {
      const p = [pt(a0, lo0), pt(a1, lo1), pt(a1, hi1), pt(a0, hi0)];
      for (const [v, c] of [[p[0], cLo], [p[1], cLo], [p[2], cHi], [p[0], cLo], [p[2], cHi], [p[3], cHi]] as const) push(v, c);
    };

    const faceColor = new THREE.Color();
    for (let k = 0; k < segs; k++) {
      const a0 = (k / segs) * Math.PI * 2;
      const a1 = ((k + 1) / segs) * Math.PI * 2;
      const h0 = skyline(a0);
      const h1 = skyline(a1);
      // Lit when the slope rises to the right, shaded when it falls; steeper = stronger.
      const slope = (h1 - h0) / ((a1 - a0) * radius);
      faceColor.copy(color).multiplyScalar(THREE.MathUtils.clamp(0.92 + slope * 0.5, 0.62, 1.12));
      const fadeBase = faceColor.clone().lerp(horizon, 0.85);

      if (caps) {
        // Snowline wobbles so caps have ragged edges.
        const sl0 = snowLine + maxH * 0.08 * noise(a0 * 9, 3.1);
        const sl1 = snowLine + maxH * 0.08 * noise(a1 * 9, 3.1);
        const m0 = Math.min(h0, sl0);
        const m1 = Math.min(h1, sl1);
        quad(a0, a1, base, base, m0, m1, fadeBase, faceColor);
        if (h0 > sl0 || h1 > sl1) {
          const snow = caps.clone().multiplyScalar(THREE.MathUtils.clamp(0.95 + slope * 0.3, 0.8, 1.05));
          quad(a0, a1, m0, m1, Math.max(h0, m0), Math.max(h1, m1), snow, snow);
        }
      } else {
        quad(a0, a1, base, base, h0, h1, fadeBase, faceColor);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = order;
    return mesh;
  }

  /** Keep the backdrop centred on the camera so it is always at "infinity". */
  update(camera: THREE.Camera) {
    this.group.position.copy(camera.position);
  }
}
