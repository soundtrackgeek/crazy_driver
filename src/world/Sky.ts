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
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + noise(k, 0.5) * 0.6;
      const elev = 0.12 + (noise(k, 3.3) + 1) * 0.12;
      const cloud = new THREE.Mesh(new THREE.CircleGeometry(30 * k, 6), cloudMat);
      cloud.position.set(Math.sin(a), elev, Math.cos(a)).normalize().multiplyScalar(DOME * 0.9);
      cloud.lookAt(0, 0, 0);
      cloud.scale.set(2 + (noise(k, 7.1) + 1), 0.45, 1);
      cloud.renderOrder = -3;
      this.group.add(cloud);
    }

    // Mountain rings (far, hazier and taller; near, darker and lower).
    const far = new THREE.Color(theme.mountains.far).lerp(horizon, 0.25);
    const near = new THREE.Color(theme.mountains.near).lerp(horizon, 0.15);
    const caps = theme.mountains.caps !== undefined ? new THREE.Color(theme.mountains.caps) : null;
    this.group.add(this.ring(noise, DOME * 0.92, 30 * k, 85 * k, far, caps, horizon, 0, -2));
    this.group.add(this.ring(noise, DOME * 0.86, 12 * k, 40 * k, near, caps, horizon, 50, -1));
  }

  private ring(
    noise: (x: number, y: number) => number,
    radius: number,
    minH: number,
    maxH: number,
    color: THREE.Color,
    caps: THREE.Color | null,
    horizon: THREE.Color,
    offset: number,
    order: number,
  ) {
    const segs = 90;
    const pos: number[] = [];
    const col: number[] = [];
    const peak = (k: number) => {
      const n = noise(k * 0.18 + offset, offset) * 0.7 + noise(k * 0.55 + offset, 9 + offset) * 0.3;
      return minH + (maxH - minH) * Math.max(0, n + 0.45);
    };
    const pt = (k: number, h: number): [number, number, number] => {
      const a = (k / segs) * Math.PI * 2;
      return [Math.sin(a) * radius, h, Math.cos(a) * radius];
    };
    const base = -120;
    const dark = color.clone().multiplyScalar(0.85);
    for (let k = 0; k < segs; k++) {
      const h0 = peak(k);
      const h1 = peak(k + 1);
      const quad: [number, number, number][] = [pt(k, base), pt(k + 1, base), pt(k + 1, h1), pt(k, h0)];
      // Alternate light/shadow faces like faceted rock; snow caps on tall peaks.
      const face = k % 2 ? color : dark;
      const topColor = caps && Math.max(h0, h1) > maxH * 0.72 ? caps : face;
      const tris = [
        [quad[0], quad[1], quad[2]],
        [quad[0], quad[2], quad[3]],
      ];
      for (const t of tris) {
        for (const v of t) {
          pos.push(...v);
          const c = v[1] > maxH * 0.6 ? topColor : v[1] <= base ? horizon : face;
          col.push(c.r, c.g, c.b);
        }
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
