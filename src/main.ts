import { RetroRenderer } from './engine/RetroRenderer';
import { Loop } from './engine/Loop';
import { Input } from './engine/Input';
import { createTestScene } from './game/TestScene';
import { TestCar } from './game/TestCar';
import { ChaseCamera } from './game/ChaseCamera';

const isTouch = matchMedia('(pointer: coarse)').matches;
const heights = [200, 270, 400]; // chunky / normal / sharp
let hIdx = isTouch ? 0 : 1;

const retro = new RetroRenderer(heights[hIdx]);
const scene = createTestScene();
const car = new TestCar();
scene.add(car.mesh);
const chase = new ChaseCamera();
const input = new Input(retro.renderer.domElement);
const hud = document.getElementById('hud')!;

const resize = () => retro.resize(chase.camera);
window.addEventListener('resize', resize);
resize();

window.addEventListener('keydown', (e) => {
  if (e.code === 'F2') {
    hIdx = (hIdx + 1) % heights.length;
    retro.setLowHeight(heights[hIdx]);
    resize();
  }
});

let fps = 60;
new Loop(
  (dt) => car.update(dt, input.poll()),
  (alpha, frameDt) => {
    car.sync(alpha);
    chase.update(car.mesh, car.speed, frameDt);
    retro.render(scene, chase.camera);
    fps = fps * 0.95 + (1 / Math.max(frameDt, 1e-4)) * 0.05;
    const { w, h } = retro.internalSize;
    hud.textContent = `CRAZY DRIVER  M0\n${Math.round(car.speed * 3.6)} km/h\n${w}x${h}  ${fps.toFixed(0)} fps  [F2 res]`;
  },
).start();
