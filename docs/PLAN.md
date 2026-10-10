# Crazy Driver — Project Plan

An arcade racer in the spirit of **Screamer** (1995) and **Sega Rally** (DOS/PC port), built for the browser with **three.js**. Low-poly, flat/vertex-shaded, low-res textured "blocky but nice" 3D — fast, loud, and fun rather than simulation.

---

## 1. Vision & Pillars

| Pillar | What it means in practice |
|---|---|
| **Instant fun** | Press a key, race in < 5 s. Drift by default, forgiving collisions, rubber-band AI. |
| **Authentic mid-90s look** | Low poly counts, 64–128 px textures, nearest-neighbour filtering, 320×200/640×400 internal resolution upscaled, linear fog, vertex lighting. |
| **Speed feeling** | FOV kick, camera shake, roadside objects streaming past, screaming engine pitch. |
| **Make your own tracks** | Built-in track editor; tracks are plain JSON that can be shared. |

### Scope for v1.0
- 3 cars (each with 2–3 paint schemes), 4 tracks (desert/canyon, alpine/snow, coastal city, forest/rally), plus any custom tracks.
- Modes: **Arcade** (checkpoints + timer), **Time Trial** (ghost car), **Quick Race** (vs. 5 AI).
- Keyboard + gamepad on desktop; **touch controls on mobile** (on-screen steering/pedals, optional tilt steering).

Out of scope for v1: online multiplayer, damage modelling, career mode (can come later). **Split-screen 2-player** is a far-off stretch goal — keep camera/HUD/input per-player (no singletons) so it stays possible.

---

## 2. Tech Stack

| Area | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Game code grows fast; types keep track data / physics sane. |
| Build / dev server | **Vite** | Instant HMR, trivial static deploy. |
| Rendering | **three.js** (WebGL2) | Requested; mature, great glTF support. |
| Physics | **Custom arcade vehicle model** (raycast suspension) + optional **Rapier** (`@dimforge/rapier3d-compat`) for car-vs-car/prop collisions | Arcade feel is easier to tune with hand-written physics than with a realistic rigid-body vehicle. |
| Audio | **Web Audio API** directly (thin wrapper) | Need pitch-shifted engine loops, crossfades, doppler — Howler is too high-level for engines. |
| Input | Keyboard + **Gamepad API** + **Touch** (Pointer Events) | No dependency needed; all sources map to one abstract `Controls` state. |
| UI / menus | Plain DOM + CSS with a pixel font (e.g. "Press Start 2P" / custom bitmap font) | Easy, retro-styled, overlays the canvas. |
| Editor UI | Same app, separate route (`/editor`), DOM panels + three.js viewport | Reuses the engine; WYSIWYG. |
| State | Small hand-rolled store / event bus | Avoid framework weight in the game loop. |
| Asset pipeline | **Blender 4.x headless** (`blender -b -P script.py`) → **glTF (.glb)** | Scriptable, reproducible assets checked into git as Python. |
| Testing | **Vitest** for pure logic (spline math, lap timing, track serialization) | Physics/feel tested by playing. |
| Lint/format | ESLint + Prettier | Standard. |
| Deploy | Static hosting (GitHub Pages / Netlify) | No server needed. |

---

## 3. Project Structure

```
crazy_driver/
├─ docs/                     PLAN.md, design notes
├─ blender/                  Python scripts that generate every 3D asset
│  ├─ lib/                   shared helpers (lowpoly primitives, palette, export)
│  ├─ cars/                  car_rally.py, car_muscle.py, car_gt.py
│  ├─ props/                 trees, rocks, signs, barriers, buildings, start gate
│  └─ build_all.py           regenerates everything into public/assets/
├─ tools/
│  ├─ build-assets.ps1/.sh   runs Blender headless over blender/
│  └─ sfx/                   scripts for procedural sound generation
├─ public/assets/
│  ├─ models/  *.glb
│  ├─ textures/ *.png (palette-limited, ≤128 px)
│  ├─ audio/   *.ogg
│  └─ tracks/  *.track.json
├─ src/
│  ├─ main.ts
│  ├─ engine/                renderer, retro post-processing, loop, asset loader
│  ├─ game/                  race state, laps, checkpoints, AI, camera
│  ├─ physics/               vehicle model, surfaces, collisions
│  ├─ track/                 spline, road mesh builder, scenery generator, serializer
│  ├─ audio/                 engine synth, sfx, music
│  ├─ ui/                    menus, HUD
│  └─ editor/                track editor
└─ tests/
```

---

## 4. Graphics Approach — "Blocky but Nice"

### 4.1 The retro look
1. **Low internal resolution**: render to a `WebGLRenderTarget` at e.g. 480×270 (or 640×360 "hi-res mode"), upscale to the canvas with `NearestFilter`. User toggle: *Chunky / Sharp*.
2. **Textures**: ≤128 px, `magFilter = NearestFilter`, no mipmaps (or optional), limited palette (~64 colours per texture).
3. **Lighting**: `MeshLambertMaterial` (Gouraud/vertex lighting — exactly the 90s look) + one directional "sun" + hemisphere ambient. Baked vertex colours for AO on cars and track edges.
4. **Fog**: linear `THREE.Fog` matching the sky horizon colour — hides draw distance, very era-authentic.
5. **Sky**: large gradient dome + a scrolling low-res panorama strip (mountains/clouds), like Screamer's backdrops.
6. **Optional post effects** (toggleable shader pass): ordered dither + palette quantization (e.g. 15/16-bit colour), slight scanline. Off by default; "DOS mode" toggle.
7. **Sprites**: some distant scenery and crowd as camera-facing billboards (classic trick).
8. **Effects**: dust/snow/spray quads from wheels, skid-mark decals (ring buffer of quads), simple blob shadow under cars.

### 4.2 Performance budget
- Car: 300–800 tris (player), 200–400 (AI LOD).
- Visible scene: < 150k tris, < 200 draw calls → use `InstancedMesh` for all repeated props, merge static track chunks.
- Target 60 fps on integrated GPUs; easy because of low internal resolution.

---

## 5. Asset Creation with Blender (headless)

All 3D assets are **generated by Python scripts**, not hand-modelled, so they are version-controlled, tweakable, and reproducible.

### Pipeline
```
blender -b --factory-startup -P blender/build_all.py -- --out public/assets/models
```
- `lib/lowpoly.py`: helpers — extruded profiles, bevelled boxes, wheel generator, flat-shading, vertex-colour painting, UV box projection.
- `lib/palette.py`: shared colour palette so everything matches.
- `lib/export.py`: apply modifiers, triangulate, export `.glb` (Y-up, +Z forward convention, metres), optional Draco off (meshes are tiny).
- Textures: small PNGs generated procedurally (Python/Pillow inside Blender, or Blender bake) — liveries, number decals, road surface, grass, rock, signs.

### Cars
- Built from a **side-profile + top-profile polyline** extruded and intersected → classic blocky silhouette. Separate objects/nodes: `body`, `wheel_FL/FR/RL/RR`, `brakelight`, `headlight`, `shadow`.
- Wheels are separate nodes so the game spins/steers them.
- Liveries via a 128×128 atlas texture + paint colour as material colour → many variants from one mesh.
- Three archetypes: **Rally hatch** (Sega Rally Celica/Delta vibe), **Muscle coupe**, **Mid-engine GT** (Screamer vibe). Original designs — no real brands.

### Props / Scenery kit
Trees (pine, palm, deciduous; 2–3 crossed planes + low-poly trunk), rocks, cliff segments, barriers, tyre walls, fences, signs/arrows, grandstands, start/finish gate, bridges, tunnels, houses/buildings, lamp posts, cones, spectators (billboards).

---

## 6. Tracks — Representation, Procedural Scenery & Editor

### 6.1 Track data model (`*.track.json`)
```jsonc
{
  "version": 1,
  "name": "Canyon Dash",
  "theme": "desert",            // drives palette, sky, props, fog, surface
  "closed": true,               // circuit vs. point-to-point
  "laps": 3,
  "controlPoints": [
    { "p": [0,0,0], "width": 12, "bank": 0, "surface": "asphalt" },
    { "p": [80,2,40], "width": 10, "bank": -8, "surface": "gravel" }
  ],
  "props":   [ { "type": "tree_pine", "p": [..], "rot": 0, "scale": 1 } ],
  "zones":   [ { "from": 0.2, "to": 0.3, "kind": "tunnel" } ],
  "scenery": { "seed": 1234, "density": 0.7 },
  "terrain": { "seed": 99, "amplitude": 30 }
}
```

### 6.2 Road mesh generation
- Closed **Catmull-Rom (centripetal) spline** through control points; sample by arc length every ~2 m.
- Build a **rotation-minimizing frame** along the curve + per-point bank (roll) and width → road ribbon, kerbs, shoulders, walls.
- Track is split into chunks (~100 m) for frustum culling.
- Each sample stores: position, tangent, normal, width, surface, distance along track → used for physics surface lookup, AI racing line, lap progress, minimap, and "wrong way" detection.

### 6.3 Procedural scenery
- **Terrain**: heightmap from noise (simplex, seeded), then **flattened/blended toward the road** in a corridor so the track always sits correctly. Low-res grid, flat shaded, vertex-coloured by height/slope.
- **Prop scattering**: Poisson-disk samples along both sides of the road at distance bands (near: barriers/signs; mid: trees/rocks; far: billboards), rules per theme, seeded so the result is deterministic and editable.
- Automatic details: arrow signs placed before sharp corners (computed from curvature), kerbs on tight corners, start gate at t=0, checkpoint gates evenly spaced.

### 6.4 Track editor (`/editor`)
- Top-down + free-orbit 3D viewport with live-rebuilt road.
- Tools: add / move / delete control points (drag in XZ, height with modifier key), width / bank / surface per point, theme picker, scenery seed & density sliders, manual prop placement (paint/stamp), zones (tunnel, bridge, water splash).
- **Test drive** button: drop into the car instantly at the cursor point; ESC returns to the editor.
- Validation: self-intersection warning, minimum curve radius, steep-slope warning.
- Save/load: localStorage + download/upload `.track.json`. Built-in tracks are made with this same editor.
- Undo/redo (command stack).

---

## 7. Gameplay & Physics

### Vehicle model (arcade)
- Car body = single rigid body. 4 raycasts down for suspension (spring + damper) → gives bumps, jumps, body roll.
- Simplified tyre model: lateral grip per surface; **drift** when lateral slip exceeds threshold or handbrake used → reduced rear grip, auto counter-steer assist.
- Surfaces: asphalt, gravel, dirt, snow, grass, water — each with grip, drag, particle type, sound.
- Automatic gearbox (manual optional), speed-sensitive steering, air control after jumps, auto-righting if upside down / reset to track button.
- Collisions: walls push car back along track normal with speed loss (no getting stuck); car-vs-car via simple sphere/box impulses (or Rapier).

### Race logic
- Progress = distance along spline; position ranking from lap + progress.
- Checkpoints with time extension (Arcade mode, Sega Rally style "EXTENDED PLAY!").
- Ghost replay for Time Trial (record inputs or transforms at 30 Hz, store in localStorage).

### AI
- Follow a racing line = spline offset optimized per segment (precomputed: cut inside on corners).
- Throttle/brake from upcoming curvature lookahead; small personality noise; **rubber-banding** to keep races close.

### Camera
- Chase cam (spring-damped), bumper cam, hood cam. FOV increases with speed, shake on rough surfaces and landings.

### HUD
Speedometer/tacho (pixel-art dial), gear, lap/time, position, minimap from the spline, big "CHECKPOINT!" / "FINAL LAP" banners.

---

## 8. Audio

| Sound | Approach |
|---|---|
| **Engine** | Granular-ish: 3–4 recorded/synthesized loops (idle, low, mid, high) crossfaded by RPM and **pitch-shifted** via `playbackRate`; separate on-load/off-load layers. AI cars use cheaper single-loop version with distance attenuation + doppler. |
| Tyre squeal / gravel crunch | Looping samples, volume = slip amount, chosen by surface. |
| Impacts, gear shift, turbo blow-off, checkpoint, countdown beeps | One-shot samples. |
| Announcer ("Checkpoint!", "Final lap!", "Game over… yeah!") | Recorded voice or TTS processed with lo-fi filter (bitcrush) for 90s flavour. |
| Music | **Original** upbeat 90s-style rock/techno, composed in a tracker (OpenMPT/MilkyTracker), shipped as `.ogg` (optionally real `.xm` via a JS module player). **Custom music**: players can load their own MP3/OGG files (file picker, stored in IndexedDB) to build a playlist that replaces or mixes with the built-in soundtrack. |

**Sound creation**: start with **procedural synthesis** (tools/sfx — Web Audio offline rendering or a Python script generating WAVs: sawtooth+noise engines, filtered noise for gravel/tyres) so we're never blocked, and swap in better CC0 samples (freesound.org, filtered by CC0 licence) as they're found. All audio shipped as `.ogg` (+ `.m4a` fallback for Safari if needed). Master bus: compressor + optional "Sound Blaster" low-pass/bitcrush toggle.

---

## 9. Milestones

| # | Milestone | Deliverable |
|---|---|---|
| **M0** ✅ | Scaffold | Vite + TS + three.js, game loop, retro low-res render target, input. |
| **M1** ✅ | Drivable box | Arcade vehicle physics on a flat plane, chase camera, debug HUD. |
| **M2** | Spline track | Track JSON → road mesh, walls, surfaces, lap/checkpoint logic, one test track. |
| **M3** | Blender pipeline | Headless build script, first car + 10 props exported to `.glb`, loaded in game. |
| **M4** | Scenery | Terrain + seeded prop scattering + sky/fog per theme. First "looks like the 90s" screenshot. |
| **M5** | Audio | Engine synth, tyre/surface sounds, SFX, music player. |
| **M6** | Track editor | Edit, test-drive, save/load, undo. |
| **M7** | Race game | AI opponents, positions, menus, modes (Arcade / Time Trial / Quick Race), ghosts. |
| **M8** | Content | 3 cars × liveries, 4 themed tracks built in the editor. |
| **M9** | Polish | Particles, skid marks, camera feel, DOS-mode post effect, gamepad, touch controls & mobile perf profile, custom MP3 playlist, settings, performance pass, deploy. |

Each milestone ends playable. Feel tuning (physics constants, camera, audio) happens continuously and is exposed via a debug panel (`lil-gui`) in dev builds.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Driving feels floaty / not fun | Custom arcade model with exposed tuning params; test early (M1) and often. |
| Procedural assets look generic | Shared palette, hand-tuned profiles per car, curated prop kits per theme. |
| Terrain/road intersections | Road-corridor flattening + editor validation. |
| Audio sounds synthetic | Procedural first, replace with CC0 samples; layered engines. |
| Browser autoplay restrictions | Audio context unlocked on first "Press Start" input. |
| Asset licensing | Only self-generated or CC0/clearly licensed assets; track sources in `docs/CREDITS.md`. |

---

## 11. Decisions
- **Mobile:** supported with touch controls (left/right steer zones or virtual wheel, gas/brake buttons, optional tilt). Mobile gets a lower internal resolution and reduced scenery density.
- **Music:** original tracker-composed soundtrack, plus the option for players to use their own MP3 files.
- **Split-screen 2-player:** very distant stretch goal; architecture keeps it possible but no work is planned.
