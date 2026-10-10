import type { AudioEngine, MusicMode } from './AudioEngine';
import { MusicStore, type StoredTrack } from './MusicStore';
import { SONGS } from './songs';
import { TrackerPlayer, type Song } from './Tracker';

export type PlaylistEntry = { kind: 'song'; title: string; song: Song } | { kind: 'file'; title: string; track: StoredTrack };

/**
 * Plays the built-in tracker songs and/or the player's own audio files
 * (MP3, OGG, ... anything the browser decodes), depending on the music mode.
 */
export class MusicPlayer {
  onChange: (() => void) | null = null;
  private tracker: TrackerPlayer;
  private element = new Audio();
  private files: StoredTrack[] = [];
  private objectUrl: string | null = null;
  private index = -1;
  private started = false;

  constructor(private audio: AudioEngine) {
    this.tracker = new TrackerPlayer(audio);
    this.tracker.onEnded = () => this.next();
    this.element.addEventListener('ended', () => this.next());
    this.element.addEventListener('error', () => this.next());
    audio.ctx.createMediaElementSource(this.element).connect(audio.music);
  }

  async init() {
    try {
      this.files = await MusicStore.list();
    } catch (err) {
      console.warn('Music library unavailable', err);
      this.files = [];
    }
    this.onChange?.();
  }

  get mode(): MusicMode {
    return this.audio.settings.musicMode;
  }

  /** Current playlist for the selected mode (built-in songs if there are no custom files). */
  get playlist(): PlaylistEntry[] {
    const songs: PlaylistEntry[] = SONGS.map((song) => ({ kind: 'song', title: song.title, song }));
    const files: PlaylistEntry[] = this.files.map((track) => ({ kind: 'file', title: track.name, track }));
    if (this.mode === 'custom' && files.length) return files;
    if (this.mode === 'all') return [...songs, ...files];
    return songs;
  }

  get library() {
    return this.files;
  }

  get current(): PlaylistEntry | null {
    return this.playlist[this.index] ?? null;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.play(Math.floor(Math.random() * this.playlist.length));
  }

  play(index: number) {
    const list = this.playlist;
    if (!list.length) return;
    this.index = ((index % list.length) + list.length) % list.length;
    this.stopAll();
    const entry = list[this.index];
    if (entry.kind === 'song') this.tracker.play(entry.song);
    else {
      this.objectUrl = URL.createObjectURL(entry.track.blob);
      this.element.src = this.objectUrl;
      void this.element.play().catch(() => this.next());
    }
    this.onChange?.();
  }

  next() {
    if (this.started) this.play(this.index + 1);
  }

  prev() {
    if (this.started) this.play(this.index - 1);
  }

  setMode(mode: MusicMode) {
    this.audio.set('musicMode', mode);
    if (this.started) this.play(0);
    else this.onChange?.();
  }

  async addFiles(files: FileList | File[]) {
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('audio/')) continue;
      await MusicStore.add(f.name.replace(/\.[^.]+$/, ''), f);
    }
    await this.init();
  }

  async remove(id: number) {
    const playingIt = this.current?.kind === 'file' && this.current.track.id === id;
    await MusicStore.remove(id);
    await this.init();
    if (playingIt) this.play(this.index);
  }

  private stopAll() {
    this.tracker.stop();
    this.element.pause();
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
  }
}
