import * as THREE from 'three';
import type { Surface } from '../physics/Ground';
import type { Vehicle, Wheel } from '../physics/Vehicle';
import type { Theme } from '../world/Themes';

const MAX_PARTICLES = 900;
const MAX_SKIDS = 1200; // quads

/** Square, pixel-style particles with per-particle size and alpha. */
const particleMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      attribute float size;
      attribute float alpha;
      attribute vec3 tint;
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        vAlpha = alpha;
        vTint = tint;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(size * 160.0 / -mv.z, 18.0); // pixels at the low internal resolution
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vTint;
      void main() {
        if (vAlpha <= 0.0) discard;
        gl_FragColor = vec4(vTint, vAlpha);
        #include <colorspace_fragment>
      }`,
  });

interface SurfaceFx {
  color: THREE.Color;
  /** Particles per second at full effect. */
  rate: number;
  size: number;
  skid: THREE.Color | null;
  /** Dust is thrown up whenever you drive on it, not only when sliding. */
  rolling: boolean;
}

const _p = new THREE.Vector3();
const _v = new THREE.Vector3();

/**
 * Wheel effects for every car: dust, snow, grass and tyre smoke particles,
 * plus skid marks laid as a ring buffer of flat quads.
 */
export class Effects {
  readonly group = new THREE.Group();
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private size = new Float32Array(MAX_PARTICLES);
  private alpha = new Float32Array(MAX_PARTICLES);
  private tint = new Float32Array(MAX_PARTICLES * 3);
  private next = 0;
  private geo = new THREE.BufferGeometry();
  private skidGeo = new THREE.BufferGeometry();
  private skidPos = new Float32Array(MAX_SKIDS * 6 * 3);
  private skidCol = new Float32Array(MAX_SKIDS * 6 * 4);
  private skidNext = 0;
  private lastMark = new Map<Wheel, { l: THREE.Vector3; r: THREE.Vector3 }>();
  private fx: Record<Surface, SurfaceFx>;
  private emitAcc = new Map<Wheel, number>();

  constructor(theme: Theme) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('tint', new THREE.BufferAttribute(this.tint, 3).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(this.geo, particleMaterial());
    points.frustumCulled = false;
    points.renderOrder = 5;

    this.skidGeo.setAttribute('position', new THREE.BufferAttribute(this.skidPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.skidGeo.setAttribute('color', new THREE.BufferAttribute(this.skidCol, 4).setUsage(THREE.DynamicDrawUsage));
    const skids = new THREE.Mesh(
      this.skidGeo,
      new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    skids.frustumCulled = false;
    this.group.add(skids, points);

    const snowy = theme.name === 'alpine';
    const loose = new THREE.Color(snowy ? 0xf2f6fa : theme.shoulder[0]).lerp(new THREE.Color(theme.fog.color), 0.2);
    this.fx = {
      asphalt: { color: new THREE.Color(0xd8d8dc), rate: 60, size: 0.9, skid: new THREE.Color(0x101012), rolling: false },
      gravel: { color: new THREE.Color(snowy ? 0xf2f6fa : 0xb8a07a), rate: 70, size: 0.8, skid: new THREE.Color(0x5a4a38), rolling: true },
      grass: { color: loose.clone().lerp(new THREE.Color(0x4a7a30), snowy ? 0 : 0.6), rate: 25, size: 0.35, skid: new THREE.Color(0x2f4a20), rolling: false },
    };
  }

  /** Emit for one car's wheels this frame. */
  car(v: Vehicle, dt: number) {
    const speed = Math.abs(v.speed);
    for (const w of v.wheels) {
      if (!w.contact) {
        this.lastMark.delete(w);
        continue;
      }
      const fx = this.fx[w.surface];
      const sliding = w.slip > 0.18 && speed > 3;
      // Rate: slides on everything; loose surfaces also throw dust when just driving fast.
      let amount = sliding ? Math.min(1, w.slip * 1.6) : 0;
      if (fx.rolling && !w.front) amount = Math.max(amount, Math.min(1, speed / 35) * 0.6);
      if (amount > 0.02) {
        const acc = (this.emitAcc.get(w) ?? 0) + fx.rate * amount * dt;
        const n = Math.floor(acc);
        this.emitAcc.set(w, acc - n);
        for (let k = 0; k < n; k++) {
          _v.copy(v.vel).multiplyScalar(-0.15 + Math.random() * 0.25);
          _v.x += (Math.random() - 0.5) * 2.5;
          _v.y += 0.8 + Math.random() * 2;
          _v.z += (Math.random() - 0.5) * 2.5;
          this.emit(w.contactPoint, _v, fx.color, fx.size * (0.7 + Math.random() * 0.6), 0.5 + Math.random() * 0.6);
        }
      }
      if (sliding && fx.skid && (w.slip > 0.3 || w.surface !== 'asphalt')) this.skid(w, v, fx.skid);
      else this.lastMark.delete(w);
    }
  }

  private emit(at: THREE.Vector3, vel: THREE.Vector3, color: THREE.Color, size: number, life: number) {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    this.pos.set([at.x, at.y + 0.15, at.z], i * 3);
    this.vel.set([vel.x, vel.y, vel.z], i * 3);
    this.tint.set([color.r, color.g, color.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  private skid(w: Wheel, v: Vehicle, color: THREE.Color) {
    _p.set(1, 0, 0).applyQuaternion(v.quat).setY(0).normalize().multiplyScalar(0.13);
    const c = w.contactPoint;
    const l = new THREE.Vector3(c.x + _p.x, c.y + 0.03, c.z + _p.z);
    const r = new THREE.Vector3(c.x - _p.x, c.y + 0.03, c.z - _p.z);
    const last = this.lastMark.get(w);
    if (last && last.l.distanceToSquared(l) < 0.04) return; // wait until the wheel has moved 20 cm
    this.lastMark.set(w, { l, r });
    if (!last || last.l.distanceToSquared(l) > 9) return; // first point, or a jump (respawn): start a new strip
    const q = this.skidNext;
    this.skidNext = (this.skidNext + 1) % MAX_SKIDS;
    const verts = [last.l, last.r, r, last.l, r, l];
    verts.forEach((p, k) => {
      this.skidPos.set([p.x, p.y, p.z], (q * 6 + k) * 3);
      this.skidCol.set([color.r, color.g, color.b, 0.55], (q * 6 + k) * 4);
    });
    const posAttr = this.skidGeo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = this.skidGeo.getAttribute('color') as THREE.BufferAttribute;
    posAttr.addUpdateRange(q * 18, 18);
    colAttr.addUpdateRange(q * 24, 24);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      this.vel[k + 1] -= 3 * dt; // light gravity, dust hangs a bit
      const drag = 1 - 1.8 * dt;
      this.vel[k] *= drag;
      this.vel[k + 1] *= drag;
      this.vel[k + 2] *= drag;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = t * 0.8;
      this.size[i] *= 1 + dt * 1.2; // puffs grow as they fade
    }
    for (const name of ['position', 'size', 'alpha', 'tint']) (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.geo.dispose();
    this.skidGeo.dispose();
  }
}
