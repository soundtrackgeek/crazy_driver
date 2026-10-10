import { parseTrack, type TrackData } from './TrackData';

/** Named tracks saved in the browser, plus the editor's autosaved working copy. */

const LIBRARY_KEY = 'crazy-driver.tracks';
const CURRENT_KEY = 'crazy-driver.editor.current';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const TrackLibrary = {
  names(): string[] {
    return Object.keys(read<Record<string, TrackData>>(LIBRARY_KEY, {})).sort();
  },
  load(name: string): TrackData | null {
    const t = read<Record<string, TrackData>>(LIBRARY_KEY, {})[name];
    return t ? parseTrack(t) : null;
  },
  save(track: TrackData) {
    const all = read<Record<string, TrackData>>(LIBRARY_KEY, {});
    all[track.name] = track;
    return write(LIBRARY_KEY, all);
  },
  remove(name: string) {
    const all = read<Record<string, TrackData>>(LIBRARY_KEY, {});
    delete all[name];
    return write(LIBRARY_KEY, all);
  },
  loadCurrent(): TrackData | null {
    const t = read<TrackData | null>(CURRENT_KEY, null);
    try {
      return t ? parseTrack(t) : null;
    } catch {
      return null;
    }
  },
  saveCurrent(track: TrackData) {
    return write(CURRENT_KEY, track);
  },
};
