import * as THREE from 'three';
import { applyLivery, type Assets } from '../engine/Assets';
import type { Controls, Input } from '../engine/Input';
import type { RetroRenderer } from '../engine/RetroRenderer';
import type { AudioEngine } from '../audio/AudioEngine';
import { CarAudio } from '../audio/CarAudio';
import { OpponentAudio } from '../audio/OpponentAudio';
import type { Announcer, Sfx } from '../audio/Sfx';
import { collideCars } from '../physics/CarCollisions';
import { Vehicle } from '../physics/Vehicle';
import type { Track } from '../track/Track';
import { TrackGround } from '../track/TrackGround';
import { checkpointDistances } from '../track/TrackMesh';
import { Hud } from '../ui/Hud';
import type { Theme } from '../world/Themes';
import type { Sky } from '../world/Sky';
import { AIDriver, makePersonalities } from './AIDriver';
import { CarView } from './CarView';
import { ChaseCamera } from './ChaseCamera';
import { LIVERIES, type NamedLivery } from './Liveries';
import { RaceState, type RaceEvent } from './RaceState';
import { RacingLine } from './RacingLine';
import { GhostPlayer, GhostRecorder, GhostStore, Records, trackKey } from './Records';
import { createTrackScene } from './TrackScene';

export type Mode = 'arcade' | 'timetrial' | 'quick' | 'test' | 'attract';

export const MODE_NAMES: Record<Mode, string> = {
  arcade: 'ARCADE',
  timetrial: 'TIME TRIAL',
  quick: 'QUICK RACE',
  test: 'TEST DRIVE',
  attract: 'DEMO',
};

export interface SessionConfig {
  track: Track;
  theme: Theme;
  mode: Mode;
  laps: number;
  opponents: number;
  livery: NamedLivery;
  startDist?: number;
}

export interface Standing {
  name: string;
  livery: NamedLivery;
  isPlayer: boolean;
  finished: boolean;
  time: number | null;
  bestLap: number | null;
}

export interface SessionResult {
  mode: Mode;
  trackName: string;
  standings: Standing[];
  playerPosition: number;
  timeOver: boolean;
  raceTime: number | null;
  bestLap: number | null;
  records: { lap: boolean; race: boolean };
}

export interface SessionDeps {
  assets: Assets;
  retro: RetroRenderer;
  input: Input;
  audio: AudioEngine;
  sfx: Sfx;
  announcer: Announcer;
}

interface Racer {
  name: string;
  livery: NamedLivery;
  vehicle: Vehicle;
  view: CarView;
  race: RaceState;
  ai: AIDriver | null;
  isPlayer: boolean;
  finishTime: number | null;
}

const AI_NAMES = ['VIPER', 'BLAZE', 'NOVA', 'DUKE', 'ZIGGY', 'ACE', 'REX'];
const ARCADE_PACE = 24; // m/s the arcade timer budgets for (~86 km/h average)
const HELD: Controls = { steer: 0, throttle: 0, brake: 0, handbrake: true, reset: false };
const COAST: Controls = { steer: 0, throttle: 0, brake: 0.3, handbrake: false, reset: false };

/**
 * One race: scene, cars (player + AI), rules for the selected mode, HUD,
 * audio and the result. The app creates a new session per race and disposes it after.
 */
export class RaceSession {
  readonly chase = new ChaseCamera();
  onEnd: ((result: SessionResult) => void) | null = null;
  paused = false;

  private scene: THREE.Scene;
  private sky: Sky;
  private racers: Racer[] = [];
  private player: Racer | null = null;
  private hud: Hud | null = null;
  private carAudio: CarAudio | null = null;
  private opponentAudio: OpponentAudio | null = null;
  private phase: 'countdown' | 'racing' | 'over' = 'countdown';
  private countdown = 3;
  private overTimer = 0;
  private timeLeft: number | null = null;
  private timeOver = false;
  private extensions: number[] = [];
  private wallHit = 0;
  private wasWrongWay = false;
  private camTarget = 0;
  private camTimer = 0;
  private key: string;
  private ghostRecorder: GhostRecorder | null = null;
  private ghost: GhostPlayer | null = null;
  private ghostBest = Infinity;
  private records = { lap: false, race: false };
  private ended = false;
  private fps = 60;

  constructor(
    readonly config: SessionConfig,
    private deps: SessionDeps,
  ) {
    const { track, theme, mode } = config;
    const world = createTrackScene(track, deps.assets, theme);
    this.scene = world.scene;
    this.sky = world.sky;
    this.chase.camera.far = world.farPlane;
    this.chase.camera.updateProjectionMatrix();
    this.key = trackKey(track.data);

    const line = new RacingLine(track);
    const solo = mode === 'timetrial' || mode === 'test';
    const aiCount = solo ? 0 : mode === 'attract' ? 5 : config.opponents;
    const total = aiCount + (mode === 'attract' ? 0 : 1);
    const personalities = makePersonalities(aiCount, track.length | 0);
    const others = LIVERIES.filter((l) => l.name !== config.livery.name);

    for (let k = 0; k < total; k++) {
      const isPlayer = mode !== 'attract' && k === total - 1; // player starts at the back of the grid
      const livery = isPlayer ? config.livery : others[k % others.length];
      const vehicle = new Vehicle(new TrackGround(track));
      const dist = solo ? (config.startDist ?? -20) : -14 - Math.floor(k / 2) * 9;
      const s = track.sampleAtDist(dist);
      const lateral = solo ? 0 : k % 2 === 0 ? -3 : 3;
      vehicle.reset(s.pos.clone().addScaledVector(s.right, lateral), Math.atan2(s.tangent.x, s.tangent.z));
      const view = new CarView(vehicle, deps.assets, livery);
      this.scene.add(view.root);
      const ai = isPlayer ? null : new AIDriver(track, line, vehicle, personalities[k] ?? personalities[0]);
      const racer: Racer = {
        name: isPlayer ? 'YOU' : AI_NAMES[k % AI_NAMES.length],
        livery,
        vehicle,
        view,
        race: new RaceState(track, config.laps),
        ai,
        isPlayer,
        finishTime: null,
      };
      this.racers.push(racer);
      if (isPlayer) this.player = racer;
    }

    if (this.player) {
      this.hud = new Hud(track);
      this.carAudio = new CarAudio(deps.audio, deps.sfx);
    }
    const aiVehicles = this.racers.filter((r) => r.ai).map((r) => r.vehicle);
    if (aiVehicles.length) this.opponentAudio = new OpponentAudio(deps.audio, aiVehicles);

    if (mode === 'arcade') this.setupArcadeTimer();
    if (mode === 'timetrial') {
      this.ghostRecorder = new GhostRecorder();
      const ghostData = GhostStore.load(this.key);
      if (ghostData) {
        this.ghostBest = ghostData.lapTime;
        const ghostMesh = this.makeGhostMesh();
        this.scene.add(ghostMesh);
        this.ghost = new GhostPlayer(ghostData, ghostMesh);
      }
    }
    if (mode === 'test' || mode === 'attract') this.phase = 'racing';
    else this.hud?.banner('3', 1);
    if (mode === 'test') this.hud?.banner('GO!', 0.8);
    if (mode !== 'test' && mode !== 'attract') deps.sfx.beep();
    this.deps.retro.resize(this.chase.camera);
  }

  /** The player's car (null in attract mode). */
  get playerVehicle() {
    return this.player?.vehicle ?? null;
  }

  private get track() {
    return this.config.track;
  }

  private setupArcadeTimer() {
    const L = this.track.length;
    const cps = checkpointDistances(this.track);
    const bounds = [0, ...cps, L];
    // Extension granted on reaching checkpoint k covers the segment to the next one.
    this.extensions = bounds.slice(1).map((b, i) => (bounds[i + 2] ?? L + cps[0]) - b).map((len) => len / ARCADE_PACE + 2);
    this.timeLeft = (cps[0] + 20) / ARCADE_PACE + 8;
  }

  private makeGhostMesh() {
    const material = new THREE.MeshBasicMaterial({ color: 0x80c0ff, transparent: true, opacity: 0.35, depthWrite: false });
    const body = new THREE.Mesh(applyLivery(this.deps.assets.geometry('car_rally_body'), this.config.livery), material);
    const g = new THREE.Group();
    g.add(body);
    g.visible = false;
    return g;
  }

  // --- simulation -------------------------------------------------------------

  update(dt: number) {
    if (this.paused) return;
    const controls = this.deps.input.poll();
    const vehicles = this.racers.map((r) => r.vehicle);

    if (this.phase === 'countdown') {
      for (const r of this.racers) r.vehicle.step(dt, HELD);
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (this.countdown <= 0) {
        this.phase = 'racing';
        this.hud?.banner('GO!', 1.2);
        this.deps.sfx.beep(true);
        this.deps.announcer.say('Go!');
      } else if (Math.ceil(this.countdown) !== before) {
        this.hud?.banner(String(Math.ceil(this.countdown)), 1);
        this.deps.sfx.beep();
      }
      return;
    }

    for (const r of this.racers) {
      const c = r.ai ? r.ai.update(dt) : this.timeOver ? COAST : controls;
      r.vehicle.step(dt, c);
    }
    collideCars(vehicles);
    if (this.player) this.wallHit = Math.max(this.wallHit, this.player.vehicle.wallHit);

    for (const r of this.racers) {
      const events = r.race.update(dt, r.vehicle.pos, r.vehicle.vel);
      if (r.race.finished && r.finishTime === null) r.finishTime = r.race.time;
      if (r.isPlayer) for (const e of events) this.onPlayerEvent(e);
    }

    this.rubberBand();
    this.updateRules(dt);
    if (this.ghostRecorder && this.player && this.player.race.lap > 0) {
      this.ghostRecorder.record(this.player.race.lapTime, this.player.vehicle.pos, this.player.vehicle.quat);
    }
  }

  /** Leaders ease off and stragglers get a little extra, so races stay close. */
  private rubberBand() {
    const p = this.player;
    for (const r of this.racers) {
      if (!r.ai) continue;
      if (!p || this.config.mode === 'attract') {
        r.ai.rubberBand = 1;
        continue;
      }
      const gap = r.race.progress - p.race.progress; // + = AI ahead
      r.ai.rubberBand = THREE.MathUtils.clamp(1 - gap / 2500, 0.86, 1.12);
    }
  }

  private updateRules(dt: number) {
    const p = this.player;
    if (!p) return;
    if (this.timeLeft !== null && this.phase === 'racing' && !p.race.finished) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.timeOver = true;
        this.phase = 'over';
        this.hud?.banner('TIME OVER', 4);
        this.deps.sfx.wrongWay();
        this.deps.announcer.say('Game over!');
      }
    }
    if (this.phase === 'over' || (p.race.finished && this.config.mode !== 'test')) {
      this.overTimer += dt;
      const everyoneDone = this.racers.every((r) => r.race.finished);
      if (this.overTimer > 4 && (everyoneDone || this.overTimer > 9)) this.finish();
    }
  }

  private extend(seconds: number) {
    if (this.timeLeft === null) return;
    this.timeLeft += seconds;
    this.hud?.banner(`EXTENDED PLAY! +${Math.round(seconds)}`, 1.6);
  }

  private onPlayerEvent(e: RaceEvent) {
    const p = this.player!;
    const { sfx, announcer } = this.deps;
    const arcade = this.timeLeft !== null;
    if (e === 'checkpoint') {
      sfx.checkpoint();
      if (arcade) {
        this.extend(this.extensions[p.race.nextCheckpoint - 1] ?? 10);
        announcer.say('Extended play!');
      } else {
        this.hud?.banner('CHECKPOINT');
        announcer.say('Checkpoint!');
      }
    }
    if (e === 'lap' || e === 'finish') this.onLapComplete();
    if (e === 'lap') {
      const final = p.race.lap === p.race.totalLaps;
      sfx.lap(final);
      if (arcade) this.extend(this.extensions[this.extensions.length - 1] ?? 10);
      else this.hud?.banner(final ? 'FINAL LAP' : `LAP ${p.race.lap}`);
      announcer.say(final ? 'Final lap!' : `Lap ${p.race.lap}`);
    }
    if (e === 'finish') {
      sfx.finish();
      const pos = this.positionOf(p);
      this.hud?.banner(this.config.mode === 'timetrial' ? 'FINISH!' : pos === 1 ? 'YOU WIN!' : 'FINISH!', 4);
      announcer.say(pos === 1 && this.racers.length > 1 ? 'You win! Fantastic!' : 'Finish! Great driving!');
      this.phase = 'over';
      // Let the computer bring the player's car home.
      p.ai = new AIDriver(this.track, new RacingLine(this.track), p.vehicle, { skill: 0.8, lineOffset: 0, aggression: 0.2 });
    }
  }

  /** Records, ghosts and lap banners after each completed lap. */
  private onLapComplete() {
    const p = this.player!;
    const lap = p.race.lastLap;
    if (lap === null || this.config.mode === 'test' || this.config.mode === 'attract') return;
    const raceTime = p.race.finished ? p.race.time : null;
    const beaten = Records.submit(this.key, lap, raceTime);
    this.records.lap ||= beaten.lap;
    this.records.race ||= beaten.race;
    if (beaten.lap) this.hud?.banner('NEW LAP RECORD!', 2);
    if (this.ghostRecorder) {
      if (lap < this.ghostBest) {
        const data = this.ghostRecorder.finish(lap);
        GhostStore.save(this.key, data);
        this.ghostBest = lap;
        if (!this.ghost) {
          const mesh = this.makeGhostMesh();
          this.scene.add(mesh);
          this.ghost = new GhostPlayer(data, mesh);
        } else this.ghost = new GhostPlayer(data, this.ghost.object);
      }
      this.ghostRecorder.reset();
    }
  }

  private standings(): Racer[] {
    return [...this.racers].sort((a, b) => {
      if (a.finishTime !== null && b.finishTime !== null) return a.finishTime - b.finishTime;
      if (a.finishTime !== null) return -1;
      if (b.finishTime !== null) return 1;
      return b.race.progress - a.race.progress;
    });
  }

  private positionOf(r: Racer) {
    return this.standings().indexOf(r) + 1;
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    const p = this.player!;
    const order = this.standings();
    this.onEnd?.({
      mode: this.config.mode,
      trackName: this.track.data.name,
      standings: order.map((r) => ({
        name: r.name,
        livery: r.livery,
        isPlayer: r.isPlayer,
        finished: r.finishTime !== null,
        time: r.finishTime,
        bestLap: r.race.bestLap,
      })),
      playerPosition: order.indexOf(p) + 1,
      timeOver: this.timeOver,
      raceTime: p.finishTime,
      bestLap: p.race.bestLap,
      records: this.records,
    });
  }

  // --- presentation -------------------------------------------------------------

  render(alpha: number, frameDt: number) {
    for (const r of this.racers) r.view.sync(alpha);

    // Attract mode: the camera hops between cars every few seconds.
    let target = this.player;
    if (!target) {
      this.camTimer -= frameDt;
      if (this.camTimer <= 0) {
        this.camTimer = 9;
        this.camTarget = (this.camTarget + 1) % this.racers.length;
      }
      target = this.racers[this.camTarget];
    }
    this.chase.update(target.view.root, target.vehicle.speed, frameDt);
    this.sky.update(this.chase.camera);
    this.deps.retro.render(this.scene, this.chase.camera);

    this.opponentAudio?.update(this.chase.camera);
    const p = this.player;
    if (!p) return;
    this.carAudio!.update(p.vehicle, this.paused ? HELD : this.deps.input.controls, frameDt, this.wallHit);
    this.wallHit = 0;
    if (p.race.wrongWay && !this.wasWrongWay) {
      this.deps.sfx.wrongWay();
      this.deps.announcer.say('Wrong way!');
    }
    this.wasWrongWay = p.race.wrongWay;
    this.ghost?.update(p.race.lap > 0 && !p.race.finished ? p.race.lapTime : Infinity);

    this.fps = this.fps * 0.95 + (1 / Math.max(frameDt, 1e-4)) * 0.05;
    const { w, h } = this.deps.retro.internalSize;
    const best = Records.get(this.key).bestLap ?? null;
    this.hud!.minimap.draw(this.racers.map((r) => ({ x: r.vehicle.pos.x, z: r.vehicle.pos.z, color: r.isPlayer ? '#ff3030' : '#ffff40' })));
    this.hud!.update(frameDt, {
      trackName: `${MODE_NAMES[this.config.mode]} - ${this.track.data.name}`,
      lap: p.race.lap,
      totalLaps: p.race.totalLaps,
      lapTime: p.race.lapTime,
      lastLap: p.race.lastLap,
      bestLap: this.config.mode === 'timetrial' ? best : p.race.bestLap,
      speed: p.vehicle.speed,
      gear: p.vehicle.gear,
      rpmRatio: p.vehicle.rpm / p.vehicle.params.redline,
      position: this.racers.length > 1 ? this.positionOf(p) : 0,
      cars: this.racers.length,
      timeLeft: this.timeLeft,
      wrongWay: p.race.wrongWay && this.phase === 'racing',
      footer: `${w}x${h} ${this.fps.toFixed(0)}fps  ESC pause  R reset  M sound  F2 res`,
    });
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.carAudio?.mute(paused);
  }

  dispose() {
    this.hud?.dispose();
    this.carAudio?.dispose();
    this.opponentAudio?.dispose();
    for (const name of ['track', 'terrain', 'sky']) {
      this.scene.getObjectByName(name)?.traverse((o) => {
        if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh)) o.geometry.dispose();
      });
    }
  }
}
