// Pre-generation (SPEC 8.4), every 30 minutes. Since 2026-10-03 it makes raw drafts for Claude's review
// (PUBLISH_MODE=review): the stock it fills is the pile of drafts waiting for review, kept small.
// In the last hours before the reset (JST 06:00–08:59) leftover energy above 12% tops the pile up to
// POOL_TARGET per tier; at other times only a pile under POOL_MIN gets one more, one at a time.
// A run makes at most a few problems: the free plan keeps each invocation short.
import { budgetStatus } from './budget';
import type { Env } from './env';
import { generateProblem, type GenOutcome } from './ai/generate';
import { TIERS, type Tier } from './problems';

export const POOL_TARGET = 10; // drafts waiting for review per tier (unplayed ready ones in auto mode)
export const POOL_MIN = 3;
const MAX_PER_RUN = 3;

async function stock(env: Env): Promise<Record<Tier, number>> {
  const rows = await env.DB.prepare(
    env.PUBLISH_MODE === 'auto'
      ? "SELECT difficulty AS tier, COUNT(*) AS n FROM problems WHERE source = 'ai' AND status = 'ready' AND play_count = 0 GROUP BY difficulty"
      : "SELECT difficulty AS tier, COUNT(*) AS n FROM problems WHERE source = 'ai' AND status = 'draft' GROUP BY difficulty",
  ).all<{ tier: Tier; n: number }>();
  const out = Object.fromEntries(TIERS.map((t) => [t, 0])) as Record<Tier, number>;
  for (const r of rows.results) if (r.tier in out) out[r.tier] = r.n;
  return out;
}

export async function pregenerate(env: Env, now = new Date()): Promise<GenOutcome[]> {
  const jstHour = (now.getUTCHours() + 9) % 24;
  const beforeReset = jstHour >= 6 && jstHour < 9;
  const results: GenOutcome[] = [];
  for (let i = 0; i < MAX_PER_RUN; i++) {
    const status = await budgetStatus(env, now);
    const counts = await stock(env);
    const lowest = TIERS.reduce((a, b) => (counts[b] < counts[a] ? b : a));
    const wanted = beforeReset
      ? status.remainingPct > (i === 0 ? 15 : 12) && counts[lowest] < POOL_TARGET
      : status.mode === 'full' && counts[lowest] < POOL_MIN && i === 0;
    if (!wanted) break;
    const outcome = await generateProblem(env, { tier: lowest, userId: null });
    results.push(outcome);
    if (!outcome.ok && (outcome.reason === 'budget' || outcome.reason === 'exhausted' || outcome.reason === 'ai-error')) break;
  }
  return results;
}
