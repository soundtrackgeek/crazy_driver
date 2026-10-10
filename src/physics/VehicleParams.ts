/** All tunables for the arcade vehicle model. Exposed in the dev tuning panel. */
export interface VehicleParams {
  // Body
  mass: number;
  inertiaScale: number; // < 1 makes the car rotate more eagerly (arcade feel)
  halfTrack: number; // half the distance between left and right wheels
  frontAxle: number; // z of front axle relative to centre of mass
  rearAxle: number; // z of rear axle (negative)
  anchorHeight: number; // y of suspension anchor relative to centre of mass

  // Suspension
  restLength: number;
  wheelRadius: number;
  springK: number;
  damperK: number;
  antiRollK: number;
  forceLift: number; // raise tyre force application point → less body roll

  // Engine / drivetrain
  maxTorque: number;
  idleRpm: number;
  redline: number;
  shiftUp: number;
  shiftDown: number;
  gears: number[];
  reverseRatio: number;
  maxReverseSpeed: number; // m/s
  finalDrive: number;
  frontDrive: number; // 0 = RWD, 1 = FWD, between = AWD split

  // Brakes / resistance
  brakeForce: number;
  frontBrakeBias: number;
  drag: number; // aero drag coefficient, N per (m/s)^2
  downforce: number; // N per (m/s)^2

  // Tyres
  frontGrip: number;
  rearGrip: number;
  handbrakeGrip: number; // rear grip multiplier while handbrake held
  lateralStiffness: number; // N per m/s of side slip
  // Steering / handling
  maxSteer: number; // radians at low speed
  highSpeedSteer: number; // fraction of maxSteer at top speed
  steerSpeed: number; // how fast steering moves, 1/s
  yawDamping: number; // straightens the car when not steering
  airControl: number; // rad/s^2 of in-air yaw control from steering
  airStabilize: number; // in-air self-levelling strength
}

export const defaultParams = (): VehicleParams => ({
  mass: 1200,
  inertiaScale: 0.75,
  halfTrack: 0.8,
  frontAxle: 1.3,
  rearAxle: -1.25,
  anchorHeight: -0.1,

  restLength: 0.35,
  wheelRadius: 0.33,
  springK: 32000,
  damperK: 3800,
  antiRollK: 12000,
  forceLift: 0.25,

  maxTorque: 420,
  idleRpm: 900,
  redline: 7200,
  shiftUp: 6700,
  shiftDown: 3200,
  gears: [3.2, 2.1, 1.5, 1.15, 0.92, 0.75],
  reverseRatio: 3.0,
  maxReverseSpeed: 8,
  finalDrive: 3.6,
  frontDrive: 0.4,

  brakeForce: 11000,
  frontBrakeBias: 0.6,
  drag: 0.42,
  downforce: 0.9,

  frontGrip: 1.3,
  rearGrip: 1.2,
  handbrakeGrip: 0.45,
  lateralStiffness: 9000,

  maxSteer: 0.6,
  highSpeedSteer: 0.3,
  steerSpeed: 5,
  yawDamping: 1.5,
  airControl: 2.5,
  airStabilize: 4,
});
