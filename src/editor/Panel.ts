import type { Surface } from '../physics/Ground';
import { parseTrack, DEFAULT_WIDTH } from '../track/TrackData';
import { TrackLibrary } from '../track/TrackLibrary';
import { THEMES } from '../world/Themes';
import type { Editor } from './Editor';
import { defaultTrack, MIN_POINTS, type EditorState } from './EditorState';

const SURFACES: Surface[] = ['asphalt', 'gravel', 'grass'];
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const rnd = () => Math.floor(Math.random() * 99999) + 1;

/** Editor side panel: track settings, selected point, file actions and issues. */
export class Panel {
  private flash = '';

  constructor(
    private root: HTMLElement,
    private state: EditorState,
    private editor: Editor,
    private testDrive: () => void,
  ) {
    root.addEventListener('change', this.onChange);
    // Show slider values while dragging (the edit itself is committed on release).
    root.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.type === 'range' && el.nextElementSibling instanceof HTMLOutputElement) el.nextElementSibling.textContent = el.value;
    });
    root.addEventListener('click', this.onClick);
  }

  private say(msg: string) {
    this.flash = msg;
    this.render();
    window.setTimeout(() => {
      if (this.flash === msg) {
        this.flash = '';
        this.render();
      }
    }, 2500);
  }

  render() {
    const d = this.state.data;
    const i = this.state.selected;
    const cp = i !== null ? this.state.points[i] : null;
    const len = this.editor.track?.length ?? 0;
    const issues = this.editor.issues;
    const num = (name: string, value: number, step = 1, attrs = '') =>
      `<input type="number" data-f="${name}" value="${value}" step="${step}" ${attrs}>`;
    const range = (name: string, value: number, min: number, max: number, step: number) =>
      `<input type="range" data-f="${name}" value="${value}" min="${min}" max="${max}" step="${step}"><output>${value}</output>`;
    const library = TrackLibrary.names();

    this.root.innerHTML = `
      <h1>TRACK EDITOR</h1>
      <div class="row buttons">
        <button data-a="undo" ${this.state.canUndo ? '' : 'disabled'} title="Ctrl+Z">Undo</button>
        <button data-a="redo" ${this.state.canRedo ? '' : 'disabled'} title="Ctrl+Y">Redo</button>
        <button data-a="top" title="Frame the whole track">Top view</button>
        <button data-a="drive" class="primary" title="T">Test drive</button>
      </div>
      ${this.flash ? `<p class="flash">${esc(this.flash)}</p>` : ''}

      <h2>Track</h2>
      <label>Name <input type="text" data-f="name" value="${esc(d.name)}"></label>
      <label>Theme <select data-f="theme">${Object.keys(THEMES).map((t) => `<option ${t === d.theme ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Laps ${num('laps', d.laps, 1, 'min="1" max="20"')}</label>
      <p class="stats">${this.state.points.length} points &middot; ${(len / 1000).toFixed(2)} km</p>

      <h2>Scenery</h2>
      <label class="check"><input type="checkbox" data-f="preview" ${this.editor.previewScenery ? 'checked' : ''}> Preview terrain &amp; props</label>
      <label>Props seed ${num('scenerySeed', d.scenery?.seed ?? 1)}<button data-a="seedScenery" title="Random">&#127922;</button></label>
      <label>Density ${range('density', d.scenery?.density ?? 0.7, 0, 1.5, 0.05)}</label>
      <label>Terrain seed ${num('terrainSeed', d.terrain?.seed ?? 7)}<button data-a="seedTerrain" title="Random">&#127922;</button></label>
      <label>Hills ${range('amplitude', d.terrain?.amplitude ?? THEMES[d.theme]?.terrainAmplitude ?? 20, 0, 80, 1)}</label>

      <h2>${cp ? `Point ${i}${i === 0 ? ' (start)' : ''}` : 'Point'}</h2>
      ${
        cp
          ? `<div class="xyz">X ${num('x', cp.p[0], 0.5)} Y ${num('y', cp.p[1], 0.5)} Z ${num('z', cp.p[2], 0.5)}</div>
             <label>Width ${range('width', cp.width ?? DEFAULT_WIDTH, 6, 30, 0.5)}</label>
             <label>Bank&deg; ${range('bank', cp.bank ?? 0, -25, 25, 1)}</label>
             <label>Surface <select data-f="surface">${SURFACES.map((s) => `<option ${s === (cp.surface ?? 'asphalt') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
             <div class="row buttons"><button data-a="delete" ${this.state.points.length <= MIN_POINTS ? 'disabled' : ''}>Delete point</button></div>`
          : '<p class="hint">Click a yellow handle to select a point.</p>'
      }

      <h2>Issues (${issues.length})</h2>
      <ul class="issues">${
        issues.length
          ? issues.map((x, k) => `<li class="${x.level}" data-issue="${k}">${x.level === 'error' ? '&#9888;' : '&#8226;'} ${esc(x.message)}</li>`).join('')
          : '<li class="ok">No problems found</li>'
      }</ul>

      <h2>File</h2>
      <div class="row buttons">
        <button data-a="new">New</button>
        <button data-a="save">Save</button>
        <button data-a="download">Download</button>
        <label class="button">Upload<input type="file" accept=".json,application/json" data-f="upload" hidden></label>
      </div>
      <div class="row">
        <select data-f="libraryPick">${library.length ? library.map((n) => `<option>${esc(n)}</option>`).join('') : '<option value="">(no saved tracks)</option>'}</select>
        <button data-a="load" ${library.length ? '' : 'disabled'}>Load</button>
        <button data-a="remove" ${library.length ? '' : 'disabled'}>&#10005;</button>
      </div>

      <h2>Controls</h2>
      <p class="hint">Drag handle: move &middot; Shift+drag: height<br>Double-click: add point &middot; Del: delete point<br>Right-drag: pan &middot; Middle-drag: rotate &middot; Wheel: zoom<br>Ctrl+Z / Ctrl+Y: undo / redo &middot; T: test drive</p>`;
  }

  private onChange = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const f = el.dataset.f;
    if (!f) return;
    const v = el.value;
    const n = Number(v);
    const s = this.state;
    const i = s.selected;
    const d = s.data;
    switch (f) {
      case 'name':
        s.updateTrack({ name: v.trim() || 'Untitled' });
        break;
      case 'theme':
        s.updateTrack({ theme: v });
        break;
      case 'laps':
        s.updateTrack({ laps: Math.max(1, Math.min(20, Math.round(n) || 1)) });
        break;
      case 'preview':
        this.editor.previewScenery = el.checked;
        this.editor.setSceneryVisible(el.checked);
        break;
      case 'scenerySeed':
        s.updateTrack({ scenery: { density: d.scenery?.density ?? 0.7, seed: Math.round(n) || 1 } });
        break;
      case 'density':
        s.updateTrack({ scenery: { seed: d.scenery?.seed ?? 1, density: n } });
        break;
      case 'terrainSeed':
        s.updateTrack({ terrain: { ...d.terrain, seed: Math.round(n) || 1 } });
        break;
      case 'amplitude':
        s.updateTrack({ terrain: { seed: d.terrain?.seed ?? 7, amplitude: n } });
        break;
      case 'x':
      case 'y':
      case 'z':
        if (i !== null && Number.isFinite(n)) {
          const p = [...s.points[i].p] as [number, number, number];
          p['xyz'.indexOf(f)] = n;
          s.change(() => s.setPosition(i, ...p));
        }
        break;
      case 'width':
      case 'bank':
        if (i !== null) s.updatePoint(i, { [f]: n });
        break;
      case 'surface':
        if (i !== null) s.updatePoint(i, { surface: v as Surface });
        break;
      case 'upload': {
        const file = el.files?.[0];
        if (file)
          void file.text().then((text) => {
            try {
              s.replace(parseTrack(JSON.parse(text)));
              this.editor.topView();
              this.say(`Loaded ${file.name}`);
            } catch (err) {
              this.say(`Could not load: ${err instanceof Error ? err.message : String(err)}`);
            }
          });
        break;
      }
    }
  };

  private onClick = (e: Event) => {
    const target = e.target as HTMLElement;
    const issue = target.closest<HTMLElement>('[data-issue]');
    if (issue) {
      const at = this.editor.issues[Number(issue.dataset.issue)]?.at;
      if (at) this.editor.controls.target.set(...at);
      return;
    }
    const a = target.closest<HTMLElement>('[data-a]')?.dataset.a;
    if (!a) return;
    const s = this.state;
    const pick = this.root.querySelector<HTMLSelectElement>('[data-f="libraryPick"]')?.value ?? '';
    switch (a) {
      case 'undo':
        s.undo();
        break;
      case 'redo':
        s.redo();
        break;
      case 'top':
        this.editor.topView();
        break;
      case 'drive':
        this.testDrive();
        break;
      case 'delete':
        if (s.selected !== null) s.deletePoint(s.selected);
        break;
      case 'seedScenery':
        s.updateTrack({ scenery: { density: s.data.scenery?.density ?? 0.7, seed: rnd() } });
        break;
      case 'seedTerrain':
        s.updateTrack({ terrain: { ...s.data.terrain, seed: rnd() } });
        break;
      case 'new':
        if (confirm('Start a new track? (You can undo this.)')) {
          s.replace(defaultTrack());
          this.editor.topView();
        }
        break;
      case 'save':
        this.say(TrackLibrary.save(s.data) ? `Saved "${s.data.name}"` : 'Could not save (storage full or blocked)');
        break;
      case 'load': {
        const t = pick && TrackLibrary.load(pick);
        if (t) {
          s.replace(t);
          this.editor.topView();
          this.say(`Loaded "${pick}"`);
        }
        break;
      }
      case 'remove':
        if (pick && confirm(`Delete saved track "${pick}"?`)) {
          TrackLibrary.remove(pick);
          this.say(`Deleted "${pick}"`);
        }
        break;
      case 'download': {
        const blob = new Blob([JSON.stringify(s.data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${s.data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'track'}.track.json`;
        link.click();
        URL.revokeObjectURL(url);
        break;
      }
    }
  };
}
