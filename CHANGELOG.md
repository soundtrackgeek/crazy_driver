# Changelog

## [0.7.0] - 2026-10-10
### Added
- M4 procedural terrain: seeded fractal-noise heightfield around the track that blends down to just below the road (cuttings and embankments), coloured by slope (rock), height (snow on alpine) and per-face variation; chunked for culling.
- Sky backdrop: gradient dome, two rings of low-poly mountains (snow caps on alpine), an 8-sided sun and flat clouds, all centred on the camera.
- Themes: grassland, forest, desert, alpine and coastal (with water), each with sky, fog, sun, hemisphere light, ground and shoulder colours, mountains and vegetation mix. Set by the track's `theme` or `?theme=`.
- Vegetation scattered across the whole landscape on a jittered grid: dense near the track, sparse far away, no trees on steep slopes, nothing under water.
- Track `terrain` settings (`seed`, `amplitude`).
- Terrain, noise and bucket-search tests.

### Changed
- Global nearest-point lookups on the track use a 64 m bucket grid searched in rings (about 10x faster); the scene now builds in about 170 ms instead of 1.5 s.
- The camera's far plane follows the theme's fog distance and the sky fits inside it; vegetation is batched per 250 m tile so off-screen tiles are culled.
- Track barriers extend below the road to meet the terrain; the grass apron is replaced by the terrain, and shoulder colours come from the theme.

## [0.6.0] - 2026-10-10
### Added
- M3 Blender asset pipeline: Python mesh builder, shared palette, glTF export and Workbench preview renders, run headless with `npm run assets` (`tools/build-assets.mjs` finds Blender or uses `BLENDER`).
- Rally hatchback model (492 tris) with livery key colours, bonnet lamp pod, roof wing, stripes, and a separate wheel mesh.
- Prop kit (`props.glb`): pine, broadleaf tree, bush, rock, tyre stack, cone, chevron sign, lamp post, grandstand with crowd, house, billboard.
- In-game asset loader with a shared flat-shaded vertex-colour material and runtime livery recolouring.
- Seeded prop placement: mixed vegetation, chevron boards and tyre stacks on the outside of tight bends (mirrored for left bends), grandstand, lamp posts and cones at the start, billboards on straights, houses.

### Changed
- The car is now the Blender model; wheels on the right side are rotated so rims face outwards.

## [0.5.0] - 2026-10-10
### Added
- M2 spline tracks: `*.track.json` format with validation, centripetal Catmull-Rom centre line resampled every 2 m with width, banking, surface and curvature per sample.
- Track physics ground: banked road height, per-section surfaces, side walls with impulse-based collisions (glancing blows rotate the car), R respawns on the track centre.
- Track mesh builder: chunked flat-shaded road with edge lines, centre dashes, kerbs on tight corners, striped barriers, grass aprons, start/finish gate with chequered line, checkpoint gates.
- Race state: rolling start, ordered checkpoints, lap counting, last/best lap times, finish, wrong-way detection.
- HUD banners (GO!, CHECKPOINT, FINAL LAP, WRONG WAY!) and a minimap.
- Test Circuit (~1.7 km) with banked corners, elevation, a gravel section and a hairpin; load other tracks with `?track=<name>`.
- Track and race tests.

### Removed
- M1 test ground scene (the `TestGround` physics fixture is kept for tests).

## [0.4.0] - 2026-10-10
### Added
- M1 arcade vehicle physics: rigid body with 4 raycast suspension springs, anti-roll bars and bump stops, grip-budget tyre model per surface (asphalt/gravel/grass), AWD drivetrain with 6-speed auto gearbox and capped reverse, handbrake drifts, aero drag and downforce.
- In-air steering and self-levelling, automatic flip recovery, R to reset.
- Test ground with jump ramp, bumpy section, gravel hills and grass, rendered as a flat-shaded vertex-coloured mesh.
- Car placeholder with wheels that spin, steer and follow suspension travel.
- Dev-only lil-gui tuning panel (F1) with Copy JSON.
- HUD with speed, gear, rpm bar, slip and surface.
- Vitest physics tests (`npm test`).

### Changed
- Chase camera follows the car's smoothed flat heading.

### Removed
- M0 kinematic placeholder car.

## [0.3.0] - 2026-10-10
### Added
- M0 scaffold: Vite + TypeScript + three.js project.
- Low-resolution retro renderer (nearest-neighbour upscale, F2 cycles 200/270/400 lines).
- Fixed-timestep (120 Hz) game loop with render interpolation.
- Unified input for keyboard, gamepad and touch.
- Placeholder car, chase camera with speed FOV, test scene with fog and instanced trees.

## [0.2.0] - 2026-10-10
### Changed
- Plan: decided on mobile touch controls, original music with custom MP3 playlists, split-screen as distant stretch goal.

## [0.1.0] - 2026-10-10
### Added
- Project plan (`docs/PLAN.md`): stack, graphics approach, Blender asset pipeline, track format & editor, physics, audio and milestones.
- README and CHANGELOG.
