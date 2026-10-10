import type { AudioEngine, MusicMode } from '../audio/AudioEngine';
import type { MusicPlayer } from '../audio/MusicPlayer';

const MODES: [MusicMode, string][] = [
  ['all', 'Built-in + my music'],
  ['builtin', 'Built-in soundtrack'],
  ['custom', 'My music only'],
];

/** Retro overlay for volumes, music mode and the player's own music library. Toggle with M. */
export class AudioPanel {
  private root = document.createElement('div');
  private button = document.createElement('button');

  constructor(
    private audio: AudioEngine,
    private music: MusicPlayer,
  ) {
    this.root.className = 'panel audio-panel';
    this.root.hidden = true;
    document.body.appendChild(this.root);

    this.button.className = 'audio-button';
    this.button.textContent = '♪';
    this.button.title = 'Sound & music (M)';
    this.button.addEventListener('click', () => this.toggle());
    document.body.appendChild(this.button);

    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'KeyM') this.toggle();
      if (e.code === 'KeyN') music.next();
      if (e.code === 'Escape' && !this.root.hidden) {
        e.preventDefault();
        this.toggle();
      }
    });
    music.onChange = () => this.render();
    this.render();
  }

  get open() {
    return !this.root.hidden;
  }

  toggle() {
    this.root.hidden = !this.root.hidden;
    this.render();
  }

  private render() {
    if (this.root.hidden) return;
    const s = this.audio.settings;
    const cur = this.music.current;
    const lib = this.music.library;
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
    this.root.innerHTML = `
      <h2>SOUND</h2>
      ${(['master', 'music', 'sfx'] as const)
        .map(
          (k) => `<label>${k.toUpperCase()}<input type="range" min="0" max="1" step="0.05" value="${s[k]}" data-vol="${k}"></label>`,
        )
        .join('')}
      <label>MUSIC <select data-mode>${MODES.map(([m, t]) => `<option value="${m}" ${m === s.musicMode ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-announcer ${s.announcer ? 'checked' : ''}> Announcer</label>
      <div class="now">
        <button data-prev>&#9664;&#9664;</button>
        <span>${cur ? esc(cur.title) : this.audio.unlocked ? '-' : 'Press any key to start audio'}</span>
        <button data-next>&#9654;&#9654;</button>
      </div>
      <h3>MY MUSIC (${lib.length})</h3>
      <ul>${lib.map((t) => `<li><span>${esc(t.name)}</span><button data-remove="${t.id}" title="Remove">&#10005;</button></li>`).join('') || '<li class="empty">No files yet. Add MP3/OGG files to race to your own music.</li>'}</ul>
      <label class="add">ADD MUSIC FILES&hellip;<input type="file" accept="audio/*" multiple data-add hidden></label>
      <p class="hint">M close &middot; N next track</p>`;

    this.root.querySelectorAll<HTMLInputElement>('[data-vol]').forEach((el) =>
      el.addEventListener('input', () => this.audio.set(el.dataset.vol as 'master' | 'music' | 'sfx', Number(el.value))),
    );
    this.root.querySelector<HTMLSelectElement>('[data-mode]')!.addEventListener('change', (e) =>
      this.music.setMode((e.target as HTMLSelectElement).value as MusicMode),
    );
    this.root.querySelector<HTMLInputElement>('[data-announcer]')!.addEventListener('change', (e) =>
      this.audio.set('announcer', (e.target as HTMLInputElement).checked),
    );
    this.root.querySelector('[data-prev]')!.addEventListener('click', () => this.music.prev());
    this.root.querySelector('[data-next]')!.addEventListener('click', () => this.music.next());
    this.root.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach((b) =>
      b.addEventListener('click', () => void this.music.remove(Number(b.dataset.remove))),
    );
    this.root.querySelector<HTMLInputElement>('[data-add]')!.addEventListener('change', (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files?.length) void this.music.addFiles(files);
    });
  }
}
