import type { Livery } from '../engine/Assets';

export interface NamedLivery extends Livery {
  name: string;
}

export const LIVERIES: NamedLivery[] = [
  { name: 'Rosso', primary: 0xd01818, secondary: 0xf0f0f0 },
  { name: 'Azure', primary: 0x1f5fd0, secondary: 0xf0d020 },
  { name: 'Lime', primary: 0x50c020, secondary: 0x181818 },
  { name: 'Sunset', primary: 0xf07818, secondary: 0x6020a0 },
  { name: 'Snow', primary: 0xf0f0f0, secondary: 0xd01818 },
  { name: 'Midnight', primary: 0x202838, secondary: 0x20e0e0 },
  { name: 'Gold', primary: 0xe0b020, secondary: 0x202020 },
  { name: 'Candy', primary: 0xe04090, secondary: 0xf0f0f0 },
];
