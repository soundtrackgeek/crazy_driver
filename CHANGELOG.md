# Changelog

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
