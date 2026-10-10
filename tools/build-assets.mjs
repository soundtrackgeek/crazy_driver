// Runs Blender headless to regenerate all .glb assets.
// Usage: npm run assets [-- --preview <dir>] [--only <name>]
// Set BLENDER=/path/to/blender if it is not on PATH or in a standard location.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function findBlender() {
  if (process.env.BLENDER) return process.env.BLENDER;
  const candidates = [];
  if (process.platform === 'win32') {
    const root = 'C:\\Program Files\\Blender Foundation';
    if (existsSync(root)) {
      for (const dir of readdirSync(root).sort().reverse()) candidates.push(join(root, dir, 'blender.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender');
  }
  return candidates.find(existsSync) ?? 'blender';
}

const blender = findBlender();
const args = ['-b', '--factory-startup', '-P', 'blender/build_all.py', '--', '--out', 'public/assets/models', ...process.argv.slice(2)];
console.log(`> ${blender} ${args.join(' ')}`);
const res = spawnSync(blender, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
if (res.error) {
  console.error(`Could not run Blender (${res.error.message}). Set the BLENDER environment variable.`);
  process.exit(1);
}
for (const line of res.stdout.split('\n')) if (line.startsWith('[assets]') || /Error|Traceback/.test(line)) console.log(line);
process.exit(res.status ?? 1);
