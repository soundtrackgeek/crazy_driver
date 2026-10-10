/** Visual theme of a track: sky, light, ground palette, backdrop and vegetation mix. */
export interface Theme {
  name: string;
  sky: { top: number; horizon: number };
  fog: { color: number; near: number; far: number };
  sun: { color: number; intensity: number; dir: [number, number, number]; disc: number };
  hemi: { sky: number; ground: number; intensity: number };
  ground: number[]; // terrain colours, picked per face
  rock: number; // steep slopes
  snow?: { color: number; line: number }; // above `line` metres over the track's base height
  shoulder: number[]; // strip between road and wall (two alternating shades)
  mountains: { far: number; near: number; caps?: number };
  clouds: number;
  water?: { color: number; level: number }; // level relative to the lowest track point
  vegetation: Record<string, number>; // prop name → relative weight
  vegetationDensity: number;
  terrainAmplitude: number;
}

export const THEMES: Record<string, Theme> = {
  grassland: {
    name: 'grassland',
    sky: { top: 0x3f74c8, horizon: 0xbcd6ee },
    fog: { color: 0xbcd6ee, near: 110, far: 460 },
    sun: { color: 0xfff2d0, intensity: 1.8, dir: [0.5, 0.8, 0.3], disc: 0xfff6c8 },
    hemi: { sky: 0xcfe6ff, ground: 0x5a4a30, intensity: 1.2 },
    ground: [0x5a9638, 0x528c33, 0x619d3d, 0x4f8530],
    rock: 0x8a8478,
    shoulder: [0x5a9638, 0x4f8a32],
    mountains: { far: 0x92aac4, near: 0x6d8f6a },
    clouds: 0xffffff,
    vegetation: { tree_pine: 0.3, tree_broadleaf: 0.4, bush: 0.2, rock: 0.1 },
    vegetationDensity: 1,
    terrainAmplitude: 22,
  },
  forest: {
    name: 'forest',
    sky: { top: 0x4a76b0, horizon: 0xc6d4dc },
    fog: { color: 0xb8c8cc, near: 70, far: 360 },
    sun: { color: 0xffeccc, intensity: 1.5, dir: [-0.4, 0.7, 0.5], disc: 0xfff0d0 },
    hemi: { sky: 0xc8dce8, ground: 0x3a3020, intensity: 1.1 },
    ground: [0x3f6f2c, 0x467a31, 0x3a6528, 0x4d7034],
    rock: 0x6e6a62,
    shoulder: [0x6a5a3e, 0x5f5036],
    mountains: { far: 0x8296a4, near: 0x3f5f44 },
    clouds: 0xf4f4f4,
    vegetation: { tree_pine: 0.65, tree_broadleaf: 0.2, bush: 0.1, rock: 0.05 },
    vegetationDensity: 1.8,
    terrainAmplitude: 30,
  },
  desert: {
    name: 'desert',
    sky: { top: 0x2f6cc0, horizon: 0xf0dcb8 },
    fog: { color: 0xead2a6, near: 140, far: 520 },
    sun: { color: 0xfff0d0, intensity: 2.1, dir: [0.2, 0.9, -0.3], disc: 0xffffe0 },
    hemi: { sky: 0xe8e0d0, ground: 0x8a6040, intensity: 1.2 },
    ground: [0xd8b878, 0xd0ae6c, 0xdcbf84, 0xc9a664],
    rock: 0xb0643c,
    shoulder: [0xc8a468, 0xbf9b60],
    mountains: { far: 0xd0a080, near: 0xa8603c },
    clouds: 0xfff8f0,
    vegetation: { rock: 0.7, bush: 0.3 },
    vegetationDensity: 0.5,
    terrainAmplitude: 35,
  },
  alpine: {
    name: 'alpine',
    sky: { top: 0x3c70d0, horizon: 0xdce8f4 },
    fog: { color: 0xdce6f0, near: 90, far: 420 },
    sun: { color: 0xffffff, intensity: 1.9, dir: [0.4, 0.6, 0.6], disc: 0xffffff },
    hemi: { sky: 0xe0ecff, ground: 0x707880, intensity: 1.3 },
    ground: [0x5b8a4a, 0x557f44, 0x628f50, 0x4e7840],
    rock: 0x7a7c84,
    snow: { color: 0xf0f4f8, line: 18 },
    shoulder: [0xe4ecf2, 0xd8e2ea],
    mountains: { far: 0x8492b0, near: 0x5f6878, caps: 0xf4f8fc },
    clouds: 0xffffff,
    vegetation: { tree_pine: 0.8, rock: 0.2 },
    vegetationDensity: 1.2,
    terrainAmplitude: 45,
  },
  coastal: {
    name: 'coastal',
    sky: { top: 0x2f7ad8, horizon: 0xc4e0f4 },
    fog: { color: 0xc4e0f4, near: 130, far: 500 },
    sun: { color: 0xfff4dc, intensity: 1.9, dir: [-0.5, 0.75, -0.3], disc: 0xfff8e0 },
    hemi: { sky: 0xd4ecff, ground: 0x80704c, intensity: 1.2 },
    ground: [0x7aa64a, 0x86ae52, 0x6f9a44, 0xd8c690],
    rock: 0x9a9284,
    shoulder: [0xd8c690, 0xcdb985],
    mountains: { far: 0x9cb4cc, near: 0x7c9a78 },
    clouds: 0xffffff,
    water: { color: 0x2a6aa8, level: -2.5 },
    vegetation: { tree_broadleaf: 0.4, bush: 0.4, rock: 0.2 },
    vegetationDensity: 0.8,
    terrainAmplitude: 18,
  },
};

export function getTheme(name: string | null | undefined): Theme {
  return (name && THEMES[name]) || THEMES.grassland;
}
