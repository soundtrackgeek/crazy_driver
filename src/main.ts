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

async function loadTrack(name: string) {
  const res = await fetch(`${import.meta.env.BASE_URL}assets/tracks/${name}.track.json`);
  if (!res.ok) throw new Error(`Could not load track "${name}" (${res.status})`);
  return new Track(parseTrack(await res.json()));
}

async function main() {
  const trackName = new URLSearchParams(location.search).get('track') ?? 'test-circuit';
  const [track, assets] = await Promise.all([loadTrack(trackName), new Assets().load(['car_rally', 'props'])]);

  const isTouch = matchMedia('(pointer: coarse)').matches;
  const heights = [200, 270, 400]; // chunky / normal / sharp
  let hIdx = isTouch ? 0 : 1;

  const retro = new RetroRenderer(heights[hIdx]);
  const scene = createTrackScene(track, assets);
  const ground = new TrackGround(track);
  const vehicle = new Vehicle(ground);
  // Rolling start: spawn 20 m behind the line.
  const spawn = track.sampleAtDist(-20);
  vehicle.reset(spawn.pos, Math.atan2(spawn.tangent.x, spawn.tangent.z));
  const carView = new CarView(vehicle, assets, { primary: 0xd01818, secondary: 0xf0f0f0 });
  scene.add(carView.root);
  const chase = new ChaseCamera();
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
  const onRaceEvent = (e: RaceEvent) => {
    if (e === 'start') showBanner('GO!', 1.2);
    if (e === 'checkpoint') showBanner('CHECKPOINT');
    if (e === 'lap') showBanner(race.lap === race.totalLaps ? 'FINAL LAP' : `LAP ${race.lap}`);
    if (e === 'finish') showBanner(`FINISH!  BEST ${formatTime(race.bestLap)}`, 6);
  };

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
    Object.assign(window, { vehicle, race, track }); // console access for tuning
  }

  let fps = 60;
  new Loop(
    (dt) => {
      vehicle.step(dt, input.poll());
      for (const e of race.update(dt, vehicle.pos, vehicle.vel)) onRaceEvent(e);
    },
    (alpha, frameDt) => {
      carView.sync(alpha);
      chase.update(carView.root, vehicle.speed, frameDt);
      retro.render(scene, chase.camera);
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
        `\n${w}x${h} ${fps.toFixed(0)}fps  F1 tune F2 res R reset`;
    },
  ).start();
}

main().catch((err) => {
  document.getElementById('hud')!.textContent = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
