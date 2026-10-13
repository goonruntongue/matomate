// After a build: remove the avatar files the other edition uses, so each site ships only its own.
// (public/ is shared, and Vite copies all of it.)  Usage: node scripts/prune-dist.mjs pin|dx
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const edition = process.argv[2];
if (edition !== 'pin' && edition !== 'dx') throw new Error('usage: prune-dist.mjs pin|dx');
const dir = join(`dist-${edition}`, 'avatars');
if (existsSync(dir)) {
  for (const name of readdirSync(dir)) {
    const isPin = name.startsWith('avatar-pin');
    if (edition === 'pin' ? !isPin : isPin) rmSync(join(dir, name), { recursive: true });
  }
}
// The single-play characters (Label Drop's levels) are not part of the team game.
rmSync(join(`dist-${edition}`, 'characters'), { recursive: true, force: true });
console.log(`dist-${edition}: pruned`);
