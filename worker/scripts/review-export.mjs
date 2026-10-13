// Review step 1: writes the AI drafts waiting for review to review/drafts.json (not committed).
//   npm --prefix worker run review:export
// Claude then writes review/curated/<date>.json — every draft either fixed and published, or
// rejected — and applies it with review:apply.
import { mkdirSync, writeFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';

const proxy = await getPlatformProxy({ configPath: 'scripts/wrangler.remote.jsonc', persist: false });
const rows = await proxy.env.DB.prepare(
  "SELECT id, difficulty, domain, scheme, qa_cohesion, body FROM problems WHERE source = 'ai' AND status = 'draft' ORDER BY created_at",
).all();
await proxy.dispose();
const drafts = rows.results.map((r) => ({ id: r.id, tier: r.difficulty, domain: r.domain, scheme: r.scheme, cohesion: r.qa_cohesion, problem: JSON.parse(r.body) }));
mkdirSync('review', { recursive: true });
writeFileSync('review/drafts.json', `${JSON.stringify(drafts, null, 2)}\n`);
console.log(`review/drafts.json: ${drafts.length} drafts`);
