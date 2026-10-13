// Adds AI problems to the production stock by hand (the same pipeline as the cron and /api/generate,
// with the same budget accounting), e.g. to try the game before the next morning's pre-generation.
//   node scripts/generate-remote.mjs [count=5] [tier: everyday|service|web|mix=mix]
// Free plan: past the daily allocation calls just fail (3036); nothing is billed.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { getPlatformProxy } from 'wrangler';

const count = Number(process.argv[2] ?? 5);
const tierArg = process.argv[3] ?? 'mix';
const tiers = tierArg === 'mix' ? ['everyday', 'service', 'web'] : [tierArg];

await build({ entryPoints: ['src/ai/generate.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: '.wrangler/admin/generate.mjs', logLevel: 'error' });
const { generateProblem } = await import('../.wrangler/admin/generate.mjs');

// The deployed Worker's vars (comments stripped from wrangler.jsonc).
const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const proxy = await getPlatformProxy({ configPath: 'scripts/wrangler.remote.jsonc', persist: false });
const env = { ...config.vars, ...proxy.env, AI_MOCK: '0' };

for (let i = 0; i < count; i++) {
  const tier = tiers[i % tiers.length];
  const t0 = Date.now();
  const out = await generateProblem(env, { tier, userId: null });
  console.log(`${i + 1}/${count} ${tier}: ${JSON.stringify(out)} (${Math.round((Date.now() - t0) / 1000)}s)`);
  if (!out.ok && ['budget', 'exhausted'].includes(out.reason)) break;
}
await proxy.dispose();
