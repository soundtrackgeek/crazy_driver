import type { Track } from '../track/Track';

/** Small 2D canvas map of the track outline with car dots. */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private background: HTMLCanvasElement;
  private scale = 1;
  private ox = 0;
  private oz = 0;

  constructor(
    track: Track,
    size = 160,
  ) {
    this.canvas.width = this.canvas.height = size;
    this.canvas.className = 'minimap';
    this.ctx = this.canvas.getContext('2d')!;

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.pos.x);
      maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z);
      maxZ = Math.max(maxZ, s.pos.z);
    }
    const pad = 10;
    this.scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    // Mirror X so the map matches the chase view (right = -X in world space).
    this.ox = size / 2 + ((maxX + minX) / 2) * this.scale;
    this.oz = size / 2 + ((maxZ + minZ) / 2) * this.scale;

    this.background = document.createElement('canvas');
    this.background.width = this.background.height = size;
    const bg = this.background.getContext('2d')!;
    bg.lineJoin = 'round';
    const path = () => {
      bg.beginPath();
      track.samples.forEach((s, i) => {
        const [x, y] = this.project(s.pos.x, s.pos.z);
        if (i === 0) bg.moveTo(x, y);
        else bg.lineTo(x, y);
      });
      bg.closePath();
    };
    path();
    bg.strokeStyle = 'rgba(0,0,0,0.6)';
    bg.lineWidth = 6;
    bg.stroke();
    path();
    bg.strokeStyle = '#e8e8e8';
    bg.lineWidth = 3;
    bg.stroke();
    const [sx, sy] = this.project(track.samples[0].pos.x, track.samples[0].pos.z);
    bg.fillStyle = '#ff3030';
    bg.fillRect(sx - 3, sy - 3, 6, 6);
  }

  /** World XZ → canvas pixels, north (+Z) up. */
  project(x: number, z: number): [number, number] {
    return [this.ox - x * this.scale, this.oz - z * this.scale];
  }

  draw(cars: { x: number; z: number; color: string }[]) {
    const c = this.ctx;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.background, 0, 0);
    for (const car of cars) {
      const [x, y] = this.project(car.x, car.z);
      c.fillStyle = '#000';
      c.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7);
      c.fillStyle = car.color;
      c.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
    }
  }
}
