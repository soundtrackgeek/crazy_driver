import { defaultParams, type VehicleParams } from '../physics/VehicleParams';

export interface CarSpec {
  id: string;
  name: string;
  model: string; // Blender asset prefix: <model>_body / <model>_wheel
  blurb: string;
  /** 1..5 bars shown in the menu. */
  stats: { speed: number; accel: number; grip: number; offroad: number };
  params: Partial<VehicleParams>;
}

/**
 * The three cars. Geometry fields (axles, track, wheel radius) must match the
 * Blender models in blender/cars/.
 */
export const CARS: CarSpec[] = [
  {
    id: 'rally',
    name: 'RALLY HATCH',
    model: 'car_rally',
    blurb: 'Four-wheel drive all-rounder. King of the gravel.',
    stats: { speed: 3, accel: 4, grip: 4, offroad: 5 },
    params: { frontDrive: 0.4, looseGrip: 1.18 },
  },
  {
    id: 'muscle',
    name: 'MUSCLE COUPE',
    model: 'car_muscle',
    blurb: 'Huge torque, rear drive, loves to slide. Fastest in a straight line.',
    stats: { speed: 5, accel: 4, grip: 2, offroad: 2 },
    params: {
      mass: 1450,
      halfTrack: 0.82,
      frontAxle: 1.42,
      rearAxle: -1.38,
      wheelRadius: 0.35,
      maxTorque: 560,
      redline: 6400,
      shiftUp: 6000,
      shiftDown: 2900,
      gears: [2.9, 1.95, 1.42, 1.1, 0.88, 0.72],
      finalDrive: 3.3,
      frontDrive: 0,
      drag: 0.44,
      downforce: 0.6,
      frontGrip: 1.34,
      rearGrip: 1.22,
      handbrakeGrip: 0.4,
      looseGrip: 0.88,
      maxSteer: 0.55,
      yawDamping: 1.1,
    },
  },
  {
    id: 'gt',
    name: 'WEDGE GT',
    model: 'car_gt',
    blurb: 'Mid-engine supercar. Razor sharp on tarmac, nervous on dirt.',
    stats: { speed: 5, accel: 5, grip: 5, offroad: 1 },
    params: {
      mass: 1180,
      inertiaScale: 0.7,
      halfTrack: 0.86,
      frontAxle: 1.35,
      rearAxle: -1.3,
      wheelRadius: 0.33,
      maxTorque: 500,
      redline: 7800,
      shiftUp: 7400,
      shiftDown: 3600,
      frontDrive: 0.1,
      drag: 0.38,
      downforce: 1.6,
      frontGrip: 1.48,
      rearGrip: 1.42,
      looseGrip: 0.8,
      maxSteer: 0.58,
      steerSpeed: 6,
      yawDamping: 1.8,
    },
  },
];

export function carParams(spec: CarSpec): VehicleParams {
  return { ...defaultParams(), ...spec.params };
}

export const carById = (id: string) => CARS.find((c) => c.id === id) ?? CARS[0];
