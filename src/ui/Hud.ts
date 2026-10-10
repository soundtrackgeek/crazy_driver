import { formatTime } from '../game/RaceState';
import type { Track } from '../track/Track';
import { Minimap } from './Minimap';
import { settings } from '../game/Settings';

/** Fired on window when the on-screen pause button is pressed. */
export const PAUSE_EVENT = 'crazy-driver:pause';

export interface HudData {
  trackName: string;
  lap: number;
  totalLaps: number;
  lapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  speed: number; // m/s
  gear: number;
  rpmRatio: number;
  position: number; // 1-based, 0 = hide
  cars: number;
  timeLeft: number | null; // arcade timer
  wrongWay: boolean;
  footer: string;
}

/** 1 → 1ST, 2 → 2ND, 11 → 11TH, 23 → 23RD */
export function ordinal(n: number) {
  const suffix = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]);
}

/** In-race overlay: text HUD, big banner, arcade timer, race position and minimap. */
export class Hud {
  readonly minimap: Minimap;
  private text = document.getElementById('hud')!;
  private bannerEl = document.getElementById('banner')!;
  private timer = el('div', 'timer');
  private position = el('div', 'position');
  private pauseButton = el('button', 'pause-button');
  private touch = el('div', 'touch-overlay');
  private bannerTimer = 0;

  constructor(track: Track) {
    this.minimap = new Minimap(track);
    this.pauseButton.textContent = '❚❚';
    this.pauseButton.title = 'Pause (Esc)';
    this.pauseButton.addEventListener('click', () => window.dispatchEvent(new Event(PAUSE_EVENT)));
    // Touch control hints over the zones Input uses: left half steers, right half gas (top) / brake (bottom).
    this.touch.innerHTML = '<div class="steer">&#9664; DRAG TO STEER &#9654;</div><div class="gas">GAS</div><div class="brake">BRAKE</div>';
    this.touch.hidden = !settings.touchControls;
    document.body.append(this.minimap.canvas, this.timer, this.position, this.pauseButton, this.touch);
    this.show(true);
  }

  show(visible: boolean) {
    for (const e of [this.text, this.minimap.canvas, this.timer, this.position, this.pauseButton, this.touch]) e.style.display = visible ? '' : 'none';
    if (!visible) this.bannerEl.style.visibility = 'hidden';
  }

  banner(text: string, seconds = 2) {
    this.bannerEl.textContent = text;
    this.bannerEl.style.visibility = 'visible';
    this.bannerTimer = seconds;
  }

  update(dt: number, d: HudData) {
    this.bannerTimer -= dt;
    if (d.wrongWay) {
      this.bannerEl.textContent = 'WRONG WAY!';
      this.bannerEl.style.visibility = 'visible';
    } else if (this.bannerTimer <= 0) this.bannerEl.style.visibility = 'hidden';

    const gear = d.gear < 0 ? 'R' : String(d.gear);
    const rpm = '#'.repeat(Math.round(d.rpmRatio * 20)).padEnd(20, '.');
    this.text.textContent =
      `${d.trackName.toUpperCase()}\n` +
      `LAP ${Math.max(1, Math.min(d.lap, d.totalLaps))}/${d.totalLaps}   ${formatTime(d.lapTime)}\n` +
      `LAST ${formatTime(d.lastLap)}  BEST ${formatTime(d.bestLap)}\n\n` +
      `${String(Math.round(Math.abs(d.speed) * 3.6)).padStart(3)} km/h  gear ${gear}\n` +
      `[${rpm}]\n\n${d.footer}`;

    this.timer.style.display = d.timeLeft === null ? 'none' : '';
    if (d.timeLeft !== null) {
      const t = Math.max(0, Math.ceil(d.timeLeft));
      this.timer.textContent = String(t);
      this.timer.classList.toggle('low', t <= 5);
    }
    this.position.style.display = d.position > 0 && d.cars > 1 ? '' : 'none';
    if (d.position > 0) this.position.innerHTML = `${ordinal(d.position)}<small>/${d.cars}</small>`;
  }

  dispose() {
    this.minimap.canvas.remove();
    this.timer.remove();
    this.position.remove();
    this.pauseButton.remove();
    this.touch.remove();
    this.text.textContent = '';
    this.bannerEl.style.visibility = 'hidden';
  }
}

function el(tag: string, cls: string) {
  const e = document.createElement(tag);
  e.className = cls;
  return e;
}

