import { steps, type Song } from './Tracker';

/*
 * Original soundtrack, written as tracker patterns (16 steps per bar, 4 bars
 * per pattern). Helpers build the repetitive parts; melodies are spelled out.
 */

const rest = (n = 16) => Array<string>(n).fill('.');
const up = (note: string, octaves = 1) => note.replace(/-?\d$/, (o) => String(Number(o) + octaves));

/** One bar of bass per chord root. */
function bass(roots: string[], style: 'rock' | 'offbeat' | 'sparse' | 'gallop') {
  return roots.flatMap((r) => {
    const R = up(r);
    switch (style) {
      case 'rock':
        return steps(`${r} . ${r} . ${R} . ${r} . ${r} . ${r} . ${R} . ${r} ${R}`);
      case 'offbeat':
        return steps(`. . ${r} . . . ${R} . . . ${r} . . . ${R} ${r}`);
      case 'gallop':
        return steps(`${r} . ${r} ${r} ${R} . ${r} ${r} ${r} . ${r} ${r} ${R} . ${R} ${r}`);
      default:
        return steps(`${r} - - - - - - - ${r} - - - ${R} - - -`);
    }
  });
}

/** 16th-note arpeggio over each chord. */
function arp(chords: string[][]) {
  return chords.flatMap(([a, b, c]) => steps(`${a} ${b} ${c} ${b} ${up(a)} ${c} ${b} ${c} `.repeat(2)));
}

/** Held pad note per bar. */
function pad(notes: string[]) {
  return notes.flatMap((n) => [n, ...Array<string>(15).fill('-')]);
}

function drums(style: 'rock' | 'four' | 'half' | 'build' | 'hats', bars = 4) {
  const r = (s: string) => Array.from({ length: bars }, () => steps(s)).flat();
  switch (style) {
    case 'rock':
      return { kick: r('X . . . . . . x x . . . . . . .'), snare: r('. . . . X . . . . . . . X . . x'), hat: r('x . x . x . x . x . x . x . x .') };
    case 'four':
      return { kick: r('X . . . x . . . X . . . x . . .'), snare: r('. . . . X . . . . . . . X . . .'), hat: r('. . X . . . X . . . X . . . X x') };
    case 'half':
      return { kick: r('X . . . . . . . . . x . . . . .'), snare: r('. . . . . . . . X . . . . . . .'), hat: r('x . x . x . x . x . x . x . x .') };
    case 'build':
      return {
        kick: [...r('X . . . x . . . X . . . x . . .').slice(0, 48), ...steps('X . X . X . X . X X X X X X X X')],
        snare: [...rest(48), ...steps('. . x . . . x . x . x . X X X X')],
        hat: r('x x x x x x x x x x x x x x x x'),
      };
    default:
      return { hat: r('x . x . x . x . x . x . x . x .') };
  }
}

// ---------------------------------------------------------------------------
// 1. "Full Throttle" — driving A-minor rock, 140 bpm.

const ftRoots = ['A1', 'F1', 'G1', 'E1'];
const ftChords = [
  ['A4', 'C5', 'E5'],
  ['F4', 'A4', 'C5'],
  ['G4', 'B4', 'D5'],
  ['E4', 'G4', 'B4'],
];
const ftMelodyA = steps(`
  E5 - - - D5 - C5 - D5 - E5 - - - A4 -
  C5 - - - A4 - C5 - F5 - - - E5 - C5 -
  D5 - - - B4 - D5 - G5 - - - F5 - D5 -
  E5 - - - - - - - B4 - D5 - E5 - G5 -`);
const ftMelodyB = steps(`
  A5 - G5 - E5 - G5 - A5 - - - C6 - B5 -
  A5 - - - G5 - F5 - E5 - F5 - G5 - - -
  G5 - F5 - D5 - F5 - G5 - - - B5 - A5 -
  G5 - - - - - - - E5 - - - . . . .`);

const fullThrottle: Song = {
  title: 'Full Throttle',
  bpm: 140,
  patterns: {
    intro: { channels: { arp: arp(ftChords), bass: bass(ftRoots, 'sparse'), ...drums('hats') } },
    A: { channels: { bass: bass(ftRoots, 'rock'), arp: arp(ftChords), ...drums('rock') } },
    B: { channels: { bass: bass(ftRoots, 'rock'), lead: ftMelodyA, arp: arp(ftChords), ...drums('rock') } },
    C: { channels: { bass: bass(ftRoots, 'gallop'), lead: ftMelodyB, pad: pad(['A3', 'F3', 'G3', 'E3']), ...drums('four') } },
    brk: { channels: { pad: pad(['A3', 'F3', 'G3', 'E3']), bass: bass(ftRoots, 'sparse'), ...drums('half') } },
    build: { channels: { bass: bass(ftRoots, 'gallop'), arp: arp(ftChords), ...drums('build') } },
    end: {
      channels: {
        bass: [...steps('A1 - - - - - - - - - - - - - - -'), ...rest(48)],
        pad: [...steps('A3 - - - - - - - - - - - - - - -'), ...rest(48)],
        kick: [...steps('X . . . . . . . . . . . . . . .'), ...rest(48)],
      },
    },
  },
  order: ['intro', 'A', 'B', 'B', 'C', 'C', 'brk', 'build', 'B', 'B', 'C', 'C', 'A', 'end'],
};

// ---------------------------------------------------------------------------
// 2. "Desert Turbo" — D-minor techno, 152 bpm.

const dtRoots = ['D2', 'Bb1', 'C2', 'A1'];
const dtChords = [
  ['D4', 'F4', 'A4'],
  ['Bb3', 'D4', 'F4'],
  ['C4', 'E4', 'G4'],
  ['A3', 'C#4', 'E4'],
];
const dtRiff = steps(`
  D5 . F5 . A5 . F5 . D5 . F5 . A5 - G5 -
  F5 . D5 . Bb4 . D5 . F5 . D5 . F5 - G5 -
  E5 . G5 . C6 . G5 . E5 . G5 . C6 - Bb5 -
  A5 - - - E5 - - - C#5 - - - E5 - - -`);
const dtLong = steps(`
  A5 - - - - - - - G5 - - - F5 - - -
  F5 - - - - - - - D5 - - - F5 - - -
  G5 - - - - - - - E5 - - - C6 - - -
  A5 - - - - - - - - - - - . . . .`);

const desertTurbo: Song = {
  title: 'Desert Turbo',
  bpm: 152,
  patterns: {
    intro: { channels: { bass: bass(dtRoots, 'offbeat'), ...drums('four'), snare: rest(64) } },
    A: { channels: { bass: bass(dtRoots, 'offbeat'), arp: arp(dtChords), ...drums('four') } },
    B: { channels: { bass: bass(dtRoots, 'offbeat'), lead: dtRiff, ...drums('four') } },
    C: { channels: { bass: bass(dtRoots, 'gallop'), lead: dtLong, arp: arp(dtChords), ...drums('four') } },
    brk: { channels: { pad: pad(['D4', 'Bb3', 'C4', 'A3']), arp: arp(dtChords), ...drums('hats') } },
    build: { channels: { bass: bass(dtRoots, 'offbeat'), pad: pad(['D4', 'Bb3', 'C4', 'A3']), ...drums('build') } },
    end: {
      channels: {
        bass: [...steps('D2 - - - - - - - - - - - - - - -'), ...rest(48)],
        pad: [...steps('D4 - - - - - - - - - - - - - - -'), ...rest(48)],
        kick: [...steps('X . . . . . . . . . . . . . . .'), ...rest(48)],
      },
    },
  },
  order: ['intro', 'A', 'B', 'B', 'C', 'brk', 'build', 'B', 'B', 'C', 'C', 'A', 'end'],
};

export const SONGS: Song[] = [fullThrottle, desertTurbo];
