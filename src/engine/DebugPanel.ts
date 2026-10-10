import type { Vehicle } from '../physics/Vehicle';
import { defaultParams } from '../physics/VehicleParams';

/** Dev-only tuning panel (lil-gui is loaded lazily so it never ships in production). */
export async function createDebugPanel(vehicle: Vehicle) {
  const { default: GUI } = await import('lil-gui');
  const gui = new GUI({ title: 'Tuning (F1)' });
  const p = vehicle.params;
  const add = (folder: InstanceType<typeof GUI>, key: keyof typeof p, min: number, max: number, step?: number) =>
    folder.add(p, key, min, max, step).listen();

  const body = gui.addFolder('Body');
  add(body, 'mass', 600, 2500, 10).onChange(() => vehicle.updateInertia());
  add(body, 'inertiaScale', 0.2, 2, 0.05).onChange(() => vehicle.updateInertia());

  const susp = gui.addFolder('Suspension');
  add(susp, 'restLength', 0.1, 0.8, 0.01);
  add(susp, 'springK', 5000, 80000, 500);
  add(susp, 'damperK', 500, 12000, 100);
  add(susp, 'antiRollK', 0, 40000, 500);
  add(susp, 'forceLift', 0, 0.6, 0.01);

  const eng = gui.addFolder('Engine');
  add(eng, 'maxTorque', 100, 1000, 10);
  add(eng, 'finalDrive', 2, 6, 0.05);
  add(eng, 'frontDrive', 0, 1, 0.05);
  add(eng, 'drag', 0, 1.5, 0.01);
  add(eng, 'downforce', 0, 4, 0.05);
  add(eng, 'brakeForce', 2000, 25000, 100);

  const tyres = gui.addFolder('Tyres & handling');
  add(tyres, 'frontGrip', 0.3, 2.5, 0.05);
  add(tyres, 'rearGrip', 0.3, 2.5, 0.05);
  add(tyres, 'handbrakeGrip', 0.05, 1, 0.05);
  add(tyres, 'lateralStiffness', 1000, 20000, 100);
  add(tyres, 'maxSteer', 0.1, 1, 0.01);
  add(tyres, 'highSpeedSteer', 0.1, 1, 0.01);
  add(tyres, 'steerSpeed', 1, 15, 0.5);
  add(tyres, 'yawDamping', 0, 6, 0.1);
  add(tyres, 'airControl', 0, 8, 0.1);
  add(tyres, 'airStabilize', 0, 12, 0.1);

  gui.add(
    {
      'Reset to defaults': () => {
        Object.assign(p, defaultParams());
        vehicle.updateInertia();
      },
    },
    'Reset to defaults',
  );
  gui.add({ 'Copy JSON': () => navigator.clipboard.writeText(JSON.stringify(p, null, 2)) }, 'Copy JSON');
  gui.close();

  const onKey = (e: KeyboardEvent) => {
    if (e.code === 'F1') {
      e.preventDefault();
      gui.show(gui._hidden);
    }
  };
  window.addEventListener('keydown', onKey);
  return {
    destroy() {
      window.removeEventListener('keydown', onKey);
      gui.destroy();
    },
  };
}
