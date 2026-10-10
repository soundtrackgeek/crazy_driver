export type CameraMode = 'chase' | 'far' | 'bumper';
export type Quality = 'high' | 'low';

export interface GameSettings {
  dosMode: boolean;
  resolution: number; // internal render height
  camera: CameraMode;
  quality: Quality;
  touchControls: boolean;
}

const KEY = 'crazy-driver.settings';
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const RESOLUTIONS = [200, 270, 400];
export const CAMERAS: CameraMode[] = ['chase', 'far', 'bumper'];

function defaults(): GameSettings {
  return { dosMode: false, resolution: isTouch ? 200 : 270, camera: 'chase', quality: isTouch ? 'low' : 'high', touchControls: isTouch };
}

function load(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...JSON.parse(raw) } : defaults();
  } catch {
    return defaults();
  }
}

/** Persistent video/gameplay settings (audio has its own in AudioEngine). */
export const settings: GameSettings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // storage blocked: settings last for this session only
  }
}

/** Scenery cost knobs derived from the quality setting. */
export function qualityProfile(q: Quality = settings.quality) {
  return q === 'low' ? { vegetation: 0.45, terrainCell: 12, fogScale: 0.85 } : { vegetation: 1, terrainCell: 8, fogScale: 1 };
}
