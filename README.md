# Crazy Driver

A 90s-style arcade racer (think Screamer / Sega Rally on DOS) for the browser, built with three.js. Low-poly "blocky but nice" 3D, procedural scenery, Blender-generated assets and a built-in track editor.

See [docs/PLAN.md](docs/PLAN.md) for the stack, approach, graphics/asset pipeline, audio and milestones.

## Status
- **M0 (scaffold)** done: Vite + TypeScript + three.js, fixed-timestep loop, low-resolution retro renderer, unified keyboard/gamepad/touch input.
- **M1 (drivable car)** done: arcade rigid-body vehicle (raycast suspension, grip-budget tyres, auto gearbox, handbrake drifts, jumps with self-levelling, flip recovery) on a test ground with a ramp, bumps, gravel hills and grass.

## Getting started
Requires Node.js 20+.

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build into dist/
npm test         # physics tests (Vitest)
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
