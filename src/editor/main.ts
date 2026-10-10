import { Assets } from '../engine/Assets';
import { TrackLibrary } from '../track/TrackLibrary';
import { parseTrack } from '../track/TrackData';
import { Editor } from './Editor';
import { EditorState, defaultTrack } from './EditorState';
import { Panel } from './Panel';

async function main() {
  // Resume the autosaved working copy; otherwise start from the test circuit.
  let initial = TrackLibrary.loadCurrent();
  if (!initial) {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}assets/tracks/test-circuit.track.json`);
      initial = parseTrack(await res.json());
    } catch {
      initial = defaultTrack();
    }
  }

  const assets = await new Assets().load(['car_rally', 'props']);
  const state = new EditorState(initial);
  const editor = new Editor(document.getElementById('viewport')!, assets, state);

  const testDrive = () => {
    TrackLibrary.saveCurrent(state.data);
    const start = Math.max(0, editor.selectedDistance() - 15);
    location.href = `index.html?track=@editor&start=${start.toFixed(0)}&test=1`;
  };
  const panel = new Panel(document.getElementById('panel')!, state, editor, testDrive);
  editor.onIssues = () => panel.render();

  state.onChange = (kind) => {
    if (kind === 'live') {
      // Live: fast road-only rebuild while dragging; just refresh handles otherwise.
      if (editor.track && JSON.stringify(editor.track.data.controlPoints) !== JSON.stringify(state.points)) editor.rebuild(false);
      else editor.updateHandles();
    } else {
      TrackLibrary.saveCurrent(state.data);
      editor.scheduleRebuild();
    }
    panel.render();
  };
  panel.render();

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) state.redo();
      else state.undo();
    } else if (ctrl && e.code === 'KeyY') {
      e.preventDefault();
      state.redo();
    } else if ((e.code === 'Delete' || e.code === 'Backspace') && state.selected !== null) {
      e.preventDefault();
      state.deletePoint(state.selected);
    } else if (e.code === 'KeyT') testDrive();
    else if (e.code === 'Escape') state.select(null);
  });

  if (import.meta.env.DEV) Object.assign(window, { editor, state });
}

main().catch((err) => {
  document.body.textContent = `Editor failed to start: ${err instanceof Error ? err.message : String(err)}`;
  console.error(err);
});
