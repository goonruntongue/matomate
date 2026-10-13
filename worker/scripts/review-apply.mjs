// Review step 2: applies a curated file to production — each entry is
//   { "id": "ai:…", "action": "publish", "note": "what was fixed", "problem": { title, brief, axisHint, groups } }
//   { "id": "ai:…", "action": "reject", "note": "why" }
// Published problems are checked with the same rules as generation, marked reviewed, and become ready.
//   npm --prefix worker run review:apply -- review/curated/2026-10-03.json [--dry-run]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { getPlatformProxy } from 'wrangler';

const file = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!file) throw new Error('usage: review-apply.mjs <curated.json> [--dry-run]');
await build({ entryPoints: ['src/ai/validate.ts'], bundle: true, format: 'esm', platform: 'neutral', outfile: '.wrangler/admin/validate.mjs', logLevel: 'error' });
const { checkGenerated, normalize } = await import('../.wrangler/admin/validate.mjs');

const curated = JSON.parse(readFileSync(file, 'utf8'));
const reviewedAt = curated.reviewedAt ?? new Date().toISOString().slice(0, 10);
let bad = 0;
for (const e of curated.items) {
  if (e.action !== 'publish') continue;
  const r = checkGenerated(e.problem);
  if (!r.ok) {
    bad++;
    console.log(`✗ ${e.id} ${e.problem?.title}: ${r.problems.join(' / ')}`);
  }
}
if (bad) throw new Error(`${bad} curated problem(s) break the rules; nothing applied`);

const proxy = await getPlatformProxy({ configPath: 'scripts/wrangler.remote.jsonc', persist: false });
const db = proxy.env.DB;
for (const e of curated.items) {
  const row = await db.prepare('SELECT id, difficulty, body FROM problems WHERE id = ?1').bind(e.id).first();
  if (!row) {
    console.log(`? ${e.id}: not found`);
    continue;
  }
  if (e.action === 'reject') {
    if (!dryRun) await db.prepare("UPDATE problems SET status = 'rejected' WHERE id = ?1").bind(e.id).run();
    console.log(`reject  ${JSON.parse(row.body).title} — ${e.note ?? ''}`);
    continue;
  }
  const old = JSON.parse(row.body);
  const body = { id: e.id, tier: row.difficulty, ...e.problem, reviewed: true, reviewedAt, reviewNote: e.note ?? '' };
  const texts = body.groups.flatMap((g) => g.items.map((k) => normalize(k.text))).sort();
  const hash = createHash('sha256').update(texts.join('\n')).digest('hex');
  if (!dryRun) {
    await db.prepare("UPDATE problems SET body = ?1, items_hash = ?2, status = 'ready' WHERE id = ?3").bind(JSON.stringify(body), hash, e.id).run();
  }
  console.log(`publish ${old.title} → ${body.title} — ${e.note ?? ''}`);
}
await proxy.dispose();
console.log(dryRun ? '(dry run: nothing written)' : 'applied');
