import { RetroRenderer } from './engine/RetroRenderer';
import { Loop } from './engine/Loop';
import { Input } from './engine/Input';
import { Assets } from './engine/Assets';
import { AudioEngine } from './audio/AudioEngine';
import { MusicPlayer } from './audio/MusicPlayer';
import { Announcer, Sfx } from './audio/Sfx';
import { RaceSession, MODE_NAMES, type Mode, type SessionResult } from './game/RaceSession';
import { formatTime } from './game/RaceState';
import { LIVERIES } from './game/Liveries';
import { CARS } from './game/Cars';
import { Records, trackKey } from './game/Records';
import { Track } from './track/Track';
import { parseTrack, type TrackData } from './track/TrackData';
import { TrackLibrary } from './track/TrackLibrary';
import { AudioPanel } from './ui/AudioPanel';
import { ordinal } from './ui/Hud';
import { Menu } from './ui/Menu';
import { getTheme } from './world/Themes';

interface TrackEntry {
  name: string;
  load: () => Promise<TrackData>;
}

const BASE = import.meta.env.BASE_URL;

async function fetchTrack(file: string) {
  const res = await fetch(`${BASE}assets/tracks/${file}.track.json`);
  if (!res.ok) throw new Error(`Could not load track "${file}" (${res.status})`);
  return parseTrack(await res.json());
}

/** Built-in tracks from the manifest plus tracks saved from the editor. */
async function trackList(): Promise<TrackEntry[]> {
  let builtIn: { file: string; name: string }[] = [];
  try {
    builtIn = await (await fetch(`${BASE}assets/tracks/index.json`)).json();
  } catch {
    builtIn = [{ file: 'test-circuit', name: 'Test Circuit' }];
  }
  return [
    ...builtIn.map((t) => ({ name: t.name, load: () => fetchTrack(t.file) })),
    ...TrackLibrary.names().map((n) => ({
      name: `${n} (custom)`,
      load: async () => {
        const t = TrackLibrary.load(n);
        if (!t) throw new Error(`Saved track "${n}" is missing`);
        return t;
      },
    })),
  ];
}

/** `?track=@editor`, `?track=@saved:Name` or a built-in file name. */
async function loadNamedTrack(name: string) {
  if (name === '@editor' || name.startsWith('@saved:')) {
    const data = name === '@editor' ? TrackLibrary.loadCurrent() : TrackLibrary.load(name.slice(7));
    if (!data) throw new Error(`Track "${name}" not found in this browser`);
    return data;
  }
  return fetchTrack(name);
}

async function main() {
  const params = new URLSearchParams(location.search);
  const testMode = params.has('test');
  const isTouch = matchMedia('(pointer: coarse)').matches;
  const heights = [200, 270, 400]; // chunky / normal / sharp
  let hIdx = isTouch ? 0 : 1;

  const retro = new RetroRenderer(heights[hIdx]);
  const [assets, tracks] = await Promise.all([new Assets().load([...CARS.map((c) => c.model), 'props']), trackList()]);
  const input = new Input(retro.renderer.domElement);
  const audio = new AudioEngine();
  const sfx = new Sfx(audio);
  const announcer = new Announcer(audio);
  const music = new MusicPlayer(audio);
  void music.init();
  const audioPanel = new AudioPanel(audio, music);
  const menu = new Menu();
  menu.onMove = () => sfx.tick();
  const deps = { assets, retro, input, audio, sfx, announcer };

  let session: RaceSession | null = null;
  const setup = { track: 0, car: 0, livery: 0, laps: 3, opponents: 5 };
  let lastRace: { data: TrackData; mode: Mode } | null = null;
  let debugPanel: { destroy(): void } | null = null;

  const startSession = (data: TrackData, mode: Mode, extra: { startDist?: number } = {}) => {
    session?.dispose();
    session = new RaceSession(
      {
        track: new Track(data),
        theme: getTheme(params.get('theme') ?? data.theme),
        mode,
        laps: mode === 'arcade' || mode === 'test' ? data.laps : setup.laps,
        opponents: mode === 'arcade' ? 5 : setup.opponents,
        livery: LIVERIES[setup.livery],
        car: CARS[setup.car],
        ...extra,
      },
      deps,
    );
    session.onEnd = (result) => showResults(result);
    if (mode !== 'attract') lastRace = { data, mode };
    if (import.meta.env.DEV) {
      debugPanel?.destroy();
      debugPanel = null;
      const vehicle = session.playerVehicle;
      if (vehicle) void import('./engine/DebugPanel').then(async (m) => (debugPanel = await m.createDebugPanel(vehicle)));
      Object.assign(window, { session });
    }
  };

  const restart = () => {
    if (!lastRace) return;
    menu.hide();
    startSession(lastRace.data, lastRace.mode);
  };

  /** Demo race behind the menus. */
  const attract = async () => {
    if (session?.config.mode === 'attract') return;
    try {
      startSession(await tracks[0].load(), 'attract');
    } catch (err) {
      console.warn('Attract mode unavailable', err);
    }
  };

  // --- Screens -----------------------------------------------------------------

  const titleScreen = () => {
    menu.show({
      title: 'CRAZY DRIVER',
      subtitle: 'ARCADE RACING',
      items: [{ label: 'PRESS START', action: mainMenu }],
      footer: 'Keyboard &middot; gamepad &middot; touch',
    });
  };

  const mainMenu = () => {
    sfx.select();
    void attract();
    menu.show({
      title: 'CRAZY DRIVER',
      items: [
        { label: 'ARCADE', action: () => setupMenu('arcade') },
        { label: 'TIME TRIAL', action: () => setupMenu('timetrial') },
        { label: 'QUICK RACE', action: () => setupMenu('quick') },
        { label: 'TRACK EDITOR', action: () => (location.href = 'editor.html') },
        { label: 'SOUND & MUSIC', action: () => audioPanel.toggle() },
      ],
      footer: 'Arcade: beat the clock, checkpoints add time &middot; Time trial: race your ghost',
      onBack: titleScreen,
    });
  };

  const recordCache = new Map<string, string>();
  /** "Best lap / best race" line for a track; loads lazily and refreshes the menu when known. */
  const recordFor = (entry: TrackEntry) => {
    const cached = recordCache.get(entry.name);
    if (cached !== undefined) return cached;
    recordCache.set(entry.name, '');
    void entry.load().then((data) => {
      const r = Records.get(trackKey(data));
      recordCache.set(entry.name, `<p class="sub">BEST LAP ${formatTime(r.bestLap ?? null)} &middot; BEST RACE ${formatTime(r.bestRace ?? null)}</p>`);
      menu.refresh();
    });
    return '';
  };

  const setupMenu = (mode: Mode) => {
    sfx.select();
    const step = (key: 'track' | 'car' | 'livery', n: number, d: number) => {
      setup[key] = (setup[key] + d + n) % n;
      render();
    };
    const clampSet = (key: 'laps' | 'opponents', d: number, max: number) => {
      setup[key] = Math.max(1, Math.min(max, setup[key] + d));
      render();
    };
    const render = () => {
      const entry = tracks[setup.track];
      menu.show({
        title: MODE_NAMES[mode],
        items: [
          { label: 'TRACK', value: entry.name, left: () => step('track', tracks.length, -1), right: () => step('track', tracks.length, 1) },
          { label: 'CAR', value: CARS[setup.car].name, left: () => step('car', CARS.length, -1), right: () => step('car', CARS.length, 1) },
          { label: 'COLOUR', value: LIVERIES[setup.livery].name, left: () => step('livery', LIVERIES.length, -1), right: () => step('livery', LIVERIES.length, 1) },
          ...(mode !== 'arcade' ? [{ label: 'LAPS', value: String(setup.laps), left: () => clampSet('laps', -1, 9), right: () => clampSet('laps', 1, 9) }] : []),
          ...(mode === 'quick'
            ? [{ label: 'OPPONENTS', value: String(setup.opponents), left: () => clampSet('opponents', -1, 7), right: () => clampSet('opponents', 1, 7) }]
            : []),
          { label: 'START', action: () => void go(mode) },
          { label: 'BACK', action: mainMenu },
        ],
        html: recordFor(entry) + carCard(),
        onBack: mainMenu,
      });
    };
    render();
  };

  const bars = (n: number) => '&#9608;'.repeat(n) + '<span class="dim">' + '&#9608;'.repeat(5 - n) + '</span>';
  const carCard = () => {
    const c = CARS[setup.car];
    return `<div class="car-card"><p>${c.blurb}</p><table>
      <tr><td>SPEED</td><td>${bars(c.stats.speed)}</td><td>ACCEL</td><td>${bars(c.stats.accel)}</td></tr>
      <tr><td>GRIP</td><td>${bars(c.stats.grip)}</td><td>OFFROAD</td><td>${bars(c.stats.offroad)}</td></tr></table></div>`;
  };

  const go = async (mode: Mode) => {
    sfx.select();
    menu.show({ title: 'LOADING...', items: [] });
    await new Promise((r) => setTimeout(r, 30)); // let the screen paint
    try {
      startSession(await tracks[setup.track].load(), mode);
      menu.hide();
    } catch (err) {
      menu.show({ title: 'ERROR', subtitle: err instanceof Error ? err.message : String(err), items: [{ label: 'BACK', action: mainMenu }] });
    }
  };

  const pauseMenu = () => {
    if (!session) return;
    session.setPaused(true);
    const resume = () => {
      session?.setPaused(false);
      menu.hide();
    };
    menu.show({
      title: 'PAUSED',
      items: [
        { label: 'RESUME', action: resume },
        { label: 'RESTART', action: restart },
        { label: 'QUIT TO MENU', action: mainMenu },
      ],
      onBack: resume,
    });
  };

  const showResults = (r: SessionResult) => {
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
    const rows = r.standings
      .map((s, i) => {
        const time = s.finished ? formatTime(s.time) : r.timeOver && s.isPlayer ? 'TIME OVER' : 'DNF';
        return `<tr class="${s.isPlayer ? 'me' : ''}"><td>${ordinal(i + 1)}</td><td><i style="background:${hex(s.livery.primary)}"></i>${s.name}</td><td>${time}</td><td>${formatTime(s.bestLap)}</td></tr>`;
      })
      .join('');
    const title = r.timeOver ? 'GAME OVER' : r.mode === 'timetrial' ? 'TIME TRIAL' : r.playerPosition === 1 ? 'YOU WIN!' : `${ordinal(r.playerPosition)} PLACE`;
    const recs = [r.records.lap && 'NEW LAP RECORD!', r.records.race && 'NEW RACE RECORD!'].filter(Boolean).join(' &middot; ');
    menu.show({
      title,
      subtitle: `${MODE_NAMES[r.mode]} - ${r.trackName}`,
      html: `${recs ? `<p class="rec">${recs}</p>` : ''}<table class="results"><tr><th></th><th>DRIVER</th><th>TIME</th><th>BEST LAP</th></tr>${rows}</table>`,
      items: [
        { label: 'RACE AGAIN', action: restart },
        { label: 'MAIN MENU', action: mainMenu },
      ],
      onBack: mainMenu,
    });
  };

  // --- Global keys, resize, loop -------------------------------------------------

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F2') {
      e.preventDefault();
      hIdx = (hIdx + 1) % heights.length;
      retro.setLowHeight(heights[hIdx]);
      if (session) retro.resize(session.chase.camera);
    }
    // Skip keys a menu already handled (e.g. Esc that just closed the pause menu).
    if (e.defaultPrevented || menu.visible || audioPanel.open || !session || session.config.mode === 'attract') return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (testMode) location.href = 'editor.html';
      else pauseMenu();
    }
  });
  window.addEventListener('resize', () => session && retro.resize(session.chase.camera));

  new Loop(
    (dt) => session?.update(dt),
    (alpha, frameDt) => {
      session?.render(alpha, frameDt);
      menu.pollGamepad(frameDt);
    },
  ).start();

  // Browsers need a gesture before audio can play; start the music on the first one.
  audio.onUnlock(() => music.start());

  if (testMode || params.has('track')) {
    // Direct entry: editor test drives, or ?track=name for a quick race.
    const data = await loadNamedTrack(params.get('track') ?? '@editor');
    setup.opponents = 3;
    startSession(data, testMode ? 'test' : 'quick', testMode ? { startDist: Number(params.get('start')) || 0 } : {});
  } else {
    await attract();
    titleScreen();
  }
}

main().catch((err) => {
  document.getElementById('hud')!.textContent = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
