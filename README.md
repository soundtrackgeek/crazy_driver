# Crazy Driver

A 90s-style arcade racer (think Screamer / Sega Rally on DOS) for the browser, built with three.js. Low-poly "blocky but nice" 3D, procedural scenery, Blender-generated assets and a built-in track editor.

See [docs/PLAN.md](docs/PLAN.md) for the stack, approach, graphics/asset pipeline, audio and milestones.

## Status
- **M0 (scaffold)** done: Vite + TypeScript + three.js, fixed-timestep loop, low-resolution retro renderer, unified keyboard/gamepad/touch input.
- **M1 (drivable car)** done: arcade rigid-body vehicle (raycast suspension, grip-budget tyres, auto gearbox, handbrake drifts, jumps with self-levelling, flip recovery) on a test ground with a ramp, bumps, gravel hills and grass.
- **M2 (spline tracks)** done: tracks defined as JSON control points, built into a banked road with kerbs, edge lines, walls, start gate and checkpoint gates; laps, checkpoints, lap times, wrong-way warning and a minimap.

## Getting started
Requires Node.js 20+.

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build into dist/
npm test         # physics tests (Vitest)
```

Load a different track with `?track=<name>`, which reads `public/assets/tracks/<name>.track.json` (default: `test-circuit`).

## Track format
Tracks are JSON files (`*.track.json`). The road is a smooth closed curve through the control points:

```jsonc
{
  "version": 1,
  "name": "Test Circuit",
  "theme": "grassland",
  "closed": true,
  "laps": 3,
  "controlPoints": [
    { "p": [0, 0, 0], "width": 14 },                 // x, height, z in metres
    { "p": [-30, 3, 250], "width": 13, "bank": 6 },  // bank in degrees, + = right side lower
    { "p": [-280, 6, 190], "surface": "gravel" }     // asphalt (default) | gravel | grass
  ],
  "checkpoints": [0.25, 0.5, 0.75],                  // fractions of the lap
  "scenery": { "seed": 1234, "density": 0.7 }
}
```

## Controls
| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | Arrows / A D | Left stick | Drag on left half |
| Gas | Up / W | RT or A | Right half, top |
| Brake / reverse | Down / S | LT | Right half, bottom |
| Handbrake | Space | X | – |
| Reset car | R | Y | – |
| Cycle render resolution (200/270/400 lines) | F2 | – | – |

## Tuning the handling
In dev builds (`npm run dev`) press **F1** for a live tuning panel covering suspension, engine, tyres and handling. Use **Copy JSON** to copy the current values, then paste them into `src/physics/VehicleParams.ts` to make them the defaults. The car is also exposed as `window.vehicle` in the browser console.
