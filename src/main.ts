import { RetroRenderer } from './engine/RetroRenderer';
import { Loop } from './engine/Loop';
import { Input } from './engine/Input';
import { createTrackScene } from './game/TrackScene';
import { ChaseCamera } from './game/ChaseCamera';
import { CarView } from './game/CarView';
import { RaceState, formatTime, type RaceEvent } from './game/RaceState';
import { Vehicle } from './physics/Vehicle';
import { Track } from './track/Track';
import { TrackGround } from './track/TrackGround';
import { parseTrack } from './track/TrackData';
import { Minimap } from './ui/Minimap';
import { Assets } from './engine/Assets';
import { getTheme } from './world/Themes';
import { AudioEngine } from './audio/AudioEngine';
import { CarAudio } from './audio/CarAudio';
import { MusicPlayer } from './audio/MusicPlayer';
import { Announcer, Sfx } from './audio/Sfx';
import { AudioPanel } from './ui/AudioPanel';
import type { Controls } from './engine/Input';

async function loadTrack(name: string) {
  const res = await fetch(`${import.meta.env.BASE_URL}assets/tracks/${name}.track.json`);
  if (!res.ok) throw new Error(`Could not load track "${name}" (${res.status})`);
  return new Track(parseTrack(await res.json()));
}

async function main() {
  const params = new URLSearchParams(location.search);
  const trackName = params.get('track') ?? 'test-circuit';
  const [track, assets] = await Promise.all([loadTrack(trackName), new Assets().load(['car_rally', 'props'])]);

  const isTouch = matchMedia('(pointer: coarse)').matches;
  const heights = [200, 270, 400]; // chunky / normal / sharp
  let hIdx = isTouch ? 0 : 1;

  const retro = new RetroRenderer(heights[hIdx]);
  const theme = getTheme(params.get('theme') ?? track.data.theme);
  const t0 = performance.now();
  const { scene, sky, farPlane } = createTrackScene(track, assets, theme);
  console.info(`[scene] built in ${(performance.now() - t0).toFixed(0)} ms`);
  const ground = new TrackGround(track);
  const vehicle = new Vehicle(ground);
  // Rolling start: spawn 20 m behind the line.
  const spawn = track.sampleAtDist(-20);
  vehicle.reset(spawn.pos, Math.atan2(spawn.tangent.x, spawn.tangent.z));
  const carView = new CarView(vehicle, assets, { primary: 0xd01818, secondary: 0xf0f0f0 });
  scene.add(carView.root);
  const chase = new ChaseCamera();
  chase.camera.far = farPlane;
  chase.camera.updateProjectionMatrix();
  const input = new Input(retro.renderer.domElement);
  const race = new RaceState(track);

  const hud = document.getElementById('hud')!;
  const banner = document.getElementById('banner')!;
  const minimap = new Minimap(track);
  document.body.appendChild(minimap.canvas);

  let bannerTimer = 0;
  const showBanner = (text: string, seconds = 2) => {
    banner.textContent = text;
    banner.style.visibility = 'visible';
    bannerTimer = seconds;
  };

  // --- Audio
  const audio = new AudioEngine();
  const sfx = new Sfx(audio);
  const announcer = new Announcer(audio);
  const carAudio = new CarAudio(audio, sfx);
  const music = new MusicPlayer(audio);
  void music.init();
  const audioPanel = new AudioPanel(audio, music);

  const onRaceEvent = (e: RaceEvent) => {
    if (e === 'checkpoint') {
      showBanner('CHECKPOINT');
      sfx.checkpoint();
      announcer.say('Checkpoint!');
    }
    if (e === 'lap') {
      const final = race.lap === race.totalLaps;
      showBanner(final ? 'FINAL LAP' : `LAP ${race.lap}`);
      sfx.lap(final);
      announcer.say(final ? 'Final lap!' : `Lap ${race.lap}`);
    }
    if (e === 'finish') {
      showBanner(`FINISH!  BEST ${formatTime(race.bestLap)}`, 6);
      sfx.finish();
      announcer.say('Finish! Great driving!');
    }
  };

  // --- Race start: "press any key", then a 3-2-1-GO countdown with the car held on the brakes.
  let phase: 'waiting' | 'countdown' | 'racing' = 'waiting';
  let countdown = 3;
  showBanner('PRESS ANY KEY', Infinity);
  const begin = () => {
    if (phase !== 'waiting') return;
    phase = 'countdown';
    countdown = 3;
    showBanner('3', 1);
    audio.onUnlock(() => {
      sfx.beep();
      music.start();
    });
    window.removeEventListener('keydown', begin);
    window.removeEventListener('pointerdown', begin);
  };
  window.addEventListener('keydown', begin);
  window.addEventListener('pointerdown', begin);
  // Handbrake only: holding the brake at a standstill would select reverse.
  const held: Controls = { steer: 0, throttle: 0, brake: 0, handbrake: true, reset: false };
  let wallHit = 0;
  let wasWrongWay = false;

  const resize = () => retro.resize(chase.camera);
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') {
      e.preventDefault();
      hIdx = (hIdx + 1) % heights.length;
      retro.setLowHeight(heights[hIdx]);
      resize();
    }
  });

  if (import.meta.env.DEV) {
    void import('./engine/DebugPanel').then((m) => m.createDebugPanel(vehicle));
    Object.assign(window, { vehicle, race, track, chase, scene, audio, music }); // console access for tuning
  }

  let fps = 60;
  new Loop(
    (dt) => {
      const controls = input.poll();
      if (phase === 'racing') {
        vehicle.step(dt, controls);
        for (const e of race.update(dt, vehicle.pos, vehicle.vel)) onRaceEvent(e);
      } else {
        vehicle.step(dt, held);
        if (phase === 'countdown') {
          const before = Math.ceil(countdown);
          countdown -= dt;
          if (countdown <= 0) {
            phase = 'racing';
            showBanner('GO!', 1.2);
            sfx.beep(true);
            announcer.say('Go!');
          } else if (Math.ceil(countdown) !== before) {
            showBanner(String(Math.ceil(countdown)), 1);
            sfx.beep();
          }
        }
      }
      wallHit = Math.max(wallHit, vehicle.wallHit);
    },
    (alpha, frameDt) => {
      carView.sync(alpha);
      chase.update(carView.root, vehicle.speed, frameDt);
      sky.update(chase.camera);
      retro.render(scene, chase.camera);
      carAudio.update(vehicle, audioPanel.open ? held : input.controls, frameDt, wallHit);
      wallHit = 0;
      if (race.wrongWay && !wasWrongWay) {
        sfx.wrongWay();
        announcer.say('Wrong way!');
      }
      wasWrongWay = race.wrongWay;
      minimap.draw([{ x: vehicle.pos.x, z: vehicle.pos.z, color: '#ff3030' }]);

      bannerTimer -= frameDt;
      if (race.wrongWay) {
        banner.textContent = 'WRONG WAY!';
        banner.style.visibility = 'visible';
      } else if (bannerTimer <= 0) banner.style.visibility = 'hidden';

      fps = fps * 0.95 + (1 / Math.max(frameDt, 1e-4)) * 0.05;
      const { w, h } = retro.internalSize;
      const gear = vehicle.gear < 0 ? 'R' : String(vehicle.gear);
      const rpmBar = '#'.repeat(Math.round((vehicle.rpm / vehicle.params.redline) * 20)).padEnd(20, '.');
      hud.textContent =
        `${track.data.name.toUpperCase()}\n` +
        `LAP ${Math.max(1, race.lap)}/${race.totalLaps}   ${formatTime(race.lapTime)}\n` +
        `LAST ${formatTime(race.lastLap)}  BEST ${formatTime(race.bestLap)}\n\n` +
        `${String(Math.round(Math.abs(vehicle.speed) * 3.6)).padStart(3)} km/h  gear ${gear}\n` +
        `[${rpmBar}]\n` +
        `\n${w}x${h} ${fps.toFixed(0)}fps  F1 tune F2 res R reset M sound`;
    },
  ).start();
}

main().catch((err) => {
  document.getElementById('hud')!.textContent = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
