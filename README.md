# Crazy Driver

A 90s-style arcade racer (think Screamer / Sega Rally on DOS) for the browser, built with three.js. Low-poly "blocky but nice" 3D, procedural scenery, Blender-generated assets and a built-in track editor.

See [docs/PLAN.md](docs/PLAN.md) for the stack, approach, graphics/asset pipeline, audio and milestones.

## Status
Milestone **M0 (scaffold)** done: Vite + TypeScript + three.js, fixed-timestep loop, low-resolution retro renderer, unified keyboard/gamepad/touch input, placeholder car and test scene.

## Getting started
Requires Node.js 20+.

```bash
npm install
npm run dev      # dev server at http://localhost:5173
npm run build    # type-check + production build into dist/
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
