import * as THREE from 'three';
import { RetroRenderer } from './engine/RetroRenderer';
import { Loop } from './engine/Loop';
import { Input } from './engine/Input';
import { createTestScene } from './game/TestScene';
import { ChaseCamera } from './game/ChaseCamera';
import { CarView } from './game/CarView';
import { Vehicle } from './physics/Vehicle';
import { TestGround } from './physics/Ground';

const isTouch = matchMedia('(pointer: coarse)').matches;
const heights = [200, 270, 400]; // chunky / normal / sharp
let hIdx = isTouch ? 0 : 1;

const retro = new RetroRenderer(heights[hIdx]);
const ground = new TestGround();
const scene = createTestScene(ground);
const vehicle = new Vehicle(ground);
vehicle.reset(new THREE.Vector3(0, 0, 0), 0);
const carView = new CarView(vehicle);
scene.add(carView.root);
const chase = new ChaseCamera();
const input = new Input(retro.renderer.domElement);
const hud = document.getElementById('hud')!;

const resize = () => retro.resize(chase.camera);
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => {
  if (e.code === 'F2') {
    e.preventDefault();
    hIdx = (hIdx + 1) % heights.length;
    retro.setLowHeight(heights[hIdx]);
    resize();
  }
});

if (import.meta.env.DEV) {
  void import('./engine/DebugPanel').then((m) => m.createDebugPanel(vehicle));
  (window as unknown as { vehicle: Vehicle }).vehicle = vehicle; // console access for tuning
}

let fps = 60;
new Loop(
  (dt) => vehicle.step(dt, input.poll()),
  (alpha, frameDt) => {
    carView.sync(alpha);
    chase.update(carView.root, vehicle.speed, frameDt);
    retro.render(scene, chase.camera);

    fps = fps * 0.95 + (1 / Math.max(frameDt, 1e-4)) * 0.05;
    const { w, h } = retro.internalSize;
    const gear = vehicle.gear < 0 ? 'R' : String(vehicle.gear);
    const rpmBar = '#'.repeat(Math.round((vehicle.rpm / vehicle.params.redline) * 20)).padEnd(20, '.');
    const surface = vehicle.wheels.find((wh) => wh.contact)?.surface ?? 'air';
    hud.textContent =
      `CRAZY DRIVER  M1\n` +
      `${String(Math.round(Math.abs(vehicle.speed) * 3.6)).padStart(3)} km/h  gear ${gear}\n` +
      `[${rpmBar}] ${Math.round(vehicle.rpm)} rpm\n` +
      `slip ${(vehicle.slip * 100).toFixed(0).padStart(3)}%  ${surface}\n` +
      `${w}x${h}  ${fps.toFixed(0)} fps   F1 tune  F2 res  R reset`;
  },
).start();
