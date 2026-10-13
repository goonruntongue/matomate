// P4 (AI generation) against a local D1 and a fake Workers AI: no real call, no Neurons spent.
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateProblem } from '../src/ai/generate';
import { MOCK_GENERATED } from '../src/ai/mock';
import { quality } from '../src/ai/quality';
import { checkGenerated } from '../src/ai/validate';
import { budgetStatus } from '../src/budget';
import { pregenerate } from '../src/cron';
import type { Env } from '../src/env';
import { app } from '../src/index';

let proxy: PlatformProxy<Env>;
let base: Env;

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: { path: '.wrangler/test-state/v3' }, remoteBindings: false });
  base = proxy.env;
});
afterAll(async () => {
  await proxy.dispose();
});
beforeEach(async () => {
  await base.DB.batch([
    base.DB.prepare('DELETE FROM ai_budget'),
    base.DB.prepare('DELETE FROM ai_calls'),
    base.DB.prepare("DELETE FROM problems WHERE source = 'ai'"),
  ]);
});

const today = () => new Date().toISOString().slice(0, 10);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A valid answer, made unique by suffixing every keyword (the stock refuses duplicates). */
function variant(n: number) {
  const p = clone(MOCK_GENERATED);
  for (const g of p.groups) for (const k of g.items) k.text = `${k.text}${n}`;
  return p;
}

const groupOfText = new Map<string, number>();
function vectorsFor(texts: string[]): number[][] {
  // Each keyword points at its group's axis, with a small private wobble (cos ≈ 0.89 within a group).
  return texts.map((t, i) => {
    const g = groupOfText.get(t.split('：')[0].replace(/\d+$/, '')) ?? 0;
    const v = new Array(64).fill(0);
    v[g] = 1;
    v[10 + i] = 0.35;
    return v;
  });
}
MOCK_GENERATED.groups.forEach((g, gi) => g.items.forEach((k) => groupOfText.set(k.text, gi)));

type Reply = string | Error;
function fakeAi(replies: Reply[], embed: (texts: string[]) => number[][] = vectorsFor) {
  const calls: { model: string; input: unknown }[] = [];
  const ai = {
    calls,
    async run(model: string, input: { text?: string[] }) {
      calls.push({ model, input });
      if (input.text) return { data: embed(input.text) };
      const next = replies.shift();
      if (next === undefined) throw new Error('no reply left');
      if (next instanceof Error) throw next;
      return { response: next, usage: { prompt_tokens: 1500, completion_tokens: 3000 } };
    },
  };
  return ai;
}

// Most tests run the pipeline in "auto" mode; the review mode (the default) has its own tests below.
const envWith = (ai: ReturnType<typeof fakeAi>, vars: Partial<Env> = {}): Env => ({ ...base, AI_MOCK: '0', PUBLISH_MODE: 'auto', ...vars, AI: ai as unknown as Ai });

describe('checking a generated problem', () => {
  it('accepts the fixture', () => {
    expect(checkGenerated(clone(MOCK_GENERATED)).ok).toBe(true);
  });

  it('lists what is wrong, in words that can be sent back', () => {
    const p = clone(MOCK_GENERATED);
    p.groups[0].items.pop(); // 5 keywords instead of 6
    p.groups[1].items[0].text = p.groups[2].items[0].text; // duplicate
    p.groups[3].items[0].text = `${p.groups[3].label}具`; // label word inside
    p.axisHint = `${p.groups[4].label}かどうかで考えてみましょう`; // names a group
    const r = checkGenerated(p);
    expect(r.ok).toBe(false);
    const text = r.ok ? '' : r.problems.join('\n');
    expect(text).toContain('ちょうど6個');
    expect(text).toContain('重複');
    expect(text).toContain('グループ名「留める」を含んで');
    expect(text).toContain('axisHint');
  });
});

describe('embedding check', () => {
  const groupOf = [0, 0, 0, 1, 1, 1];
  const v = (g: number, i: number) => {
    const x = new Array(16).fill(0);
    x[g] = 1;
    x[4 + i] = 0.35;
    return x;
  };
  it('passes a cohesive problem', () => {
    const q = quality([0, 1, 2, 3, 4, 5].map((i) => v(groupOf[i], i)), groupOf);
    expect(q.cohesion).toBe(1);
    expect(q.duplicates).toEqual([]);
  });
  it('sees keywords that belong elsewhere, and near-duplicates', () => {
    const vectors = [0, 1, 2, 3, 4, 5].map((i) => v(groupOf[i], i));
    vectors[2] = v(1, 2); // a group-0 keyword that looks like group 1
    vectors[5] = [...vectors[4]]; // the same thing twice
    const q = quality(vectors, groupOf);
    expect(q.cohesion).toBeLessThan(1);
    expect(q.duplicates).toContainEqual([4, 5]);
  });
});

describe('generateProblem', () => {
  it('saves a ready AI problem and settles the budget with the real cost', async () => {
    const ai = fakeAi([JSON.stringify(variant(1))]);
    const out = await generateProblem(envWith(ai), { tier: 'service', userId: 'u1' });
    expect(out).toMatchObject({ ok: true, cohesion: 1 });
    const row = await base.DB.prepare("SELECT source, difficulty, status, qa_cohesion FROM problems WHERE source = 'ai'").first();
    expect(row).toMatchObject({ source: 'ai', difficulty: 'service', status: 'ready', qa_cohesion: 1 });
    const calls = await base.DB.prepare('SELECT kind, ok, neurons FROM ai_calls ORDER BY id').all<{ kind: string; ok: number; neurons: number }>();
    expect(calls.results.map((c) => [c.kind, c.ok])).toEqual([['gen', 1], ['embed', 1]]);
    const genCost = ((1500 * 9091 + 3000 * 27273) / 1e6) * 1.15;
    expect(calls.results[0].neurons).toBeCloseTo(genCost, 3);
    const budget = await base.DB.prepare('SELECT used FROM ai_budget WHERE day = ?1').bind(today()).first<{ used: number }>();
    expect(budget!.used).toBeGreaterThan(genCost); // generation + a sliver of embedding, reservation released
    expect(budget!.used).toBeLessThan(genCost + 1);
  });

  it('sends the problems back once, and keeps the corrected answer', async () => {
    const bad = variant(2);
    bad.groups[0].items.pop();
    const ai = fakeAi([JSON.stringify(bad), `説明です。\n\`\`\`json\n${JSON.stringify(variant(2))}\n\`\`\``]);
    const out = await generateProblem(envWith(ai), { tier: 'web', userId: null });
    expect(out.ok).toBe(true);
    const retry = ai.calls[1].input as { messages: { role: string; content: string }[] };
    expect(retry.messages.at(-1)!.content).toContain('ちょうど6個');
    const gens = await base.DB.prepare("SELECT ok FROM ai_calls WHERE kind = 'gen' ORDER BY id").all<{ ok: number }>();
    expect(gens.results.map((r) => r.ok)).toEqual([0, 1]);
  });

  it('gives up after the second bad answer, saving nothing', async () => {
    const ai = fakeAi(['これはJSONではありません', '{"title": "x"}']);
    const out = await generateProblem(envWith(ai), { tier: 'everyday', userId: null });
    expect(out).toMatchObject({ ok: false, reason: 'invalid' });
    const n = await base.DB.prepare("SELECT COUNT(*) AS n FROM problems WHERE source = 'ai'").first<{ n: number }>();
    expect(n!.n).toBe(0);
  });

  it('rejects a problem whose keywords do not hang together', async () => {
    const scattered = (texts: string[]) => texts.map((_, i) => {
      const v = new Array(64).fill(0);
      v[(i * 7) % 5] = 1; // groups mixed up
      v[10 + i] = 0.35;
      return v;
    });
    const out = await generateProblem(envWith(fakeAi([JSON.stringify(variant(3))], scattered)), { tier: 'service', userId: null });
    expect(out).toMatchObject({ ok: false, reason: 'quality' });
  });

  it('closes the day when Workers AI says the free allocation is used up (3036)', async () => {
    const ai = fakeAi([new Error('AiError: 3036: You have used up your daily free allocation of 10,000 neurons.')]);
    const out = await generateProblem(envWith(ai), { tier: 'service', userId: null });
    expect(out).toMatchObject({ ok: false, reason: 'exhausted' });
    expect(await budgetStatus(base)).toMatchObject({ mode: 'offline', remainingPct: 0 });
  });

  it('does not call the AI when the budget has no room', async () => {
    await base.DB.prepare('INSERT INTO ai_budget (day, cap, used) VALUES (?1, 9000, 8990)').bind(today()).run(); // less than one reservation left
    const ai = fakeAi([JSON.stringify(variant(4))]);
    expect(await generateProblem(envWith(ai), { tier: 'service', userId: null })).toMatchObject({ ok: false, reason: 'budget' });
    expect(ai.calls).toHaveLength(0);
  });
});

describe('POST /api/generate', () => {
  const ORIGIN = 'https://knowledge-surrounding-ai.pages.dev';
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const post = (env: Env, body: unknown, ip = '192.0.2.10') =>
    app.request('/api/generate', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) }, env, ctx);

  it('returns the new problem without its answer', async () => {
    const res = await post(envWith(fakeAi([JSON.stringify(variant(5))])), { tier: 'service', theme: '水族館のサイト' });
    expect(res.status).toBe(200);
    const { problem } = await res.json<{ problem: { id: string; source: string; keywords: unknown[] } & Record<string, unknown> }>();
    expect(problem.source).toBe('ai');
    expect(problem.keywords).toHaveLength(30);
    expect(problem).not.toHaveProperty('groups');
  });

  it('is paused below FULL energy', async () => {
    await base.DB.prepare('INSERT INTO ai_budget (day, cap, used) VALUES (?1, 9000, 7000)').bind(today()).run();
    expect((await post(envWith(fakeAi([])), { tier: 'service' })).status).toBe(409);
  });

  it('allows two a minute per player', async () => {
    const env = envWith(fakeAi([JSON.stringify(variant(6)), JSON.stringify(variant(7)), JSON.stringify(variant(8))]));
    expect((await post(env, { tier: 'service' }, '192.0.2.20')).status).toBe(200);
    expect((await post(env, { tier: 'service' }, '192.0.2.20')).status).toBe(200);
    expect((await post(env, { tier: 'service' }, '192.0.2.20')).status).toBe(429);
    expect((await post(env, { tier: 'service' }, '192.0.2.21')).status).toBe(200); // someone else
  });

  it('rejects bad input', async () => {
    expect((await post(envWith(fakeAi([])), { tier: 'hard' })).status).toBe(400);
    expect((await post(envWith(fakeAi([])), { tier: 'web', theme: 'あ'.repeat(31) })).status).toBe(400);
  });
});

describe('stock first, then templates', () => {
  it('serves an unplayed AI problem before any template', async () => {
    await generateProblem(envWith(fakeAi([JSON.stringify(variant(9))])), { tier: 'everyday', userId: null });
    const res = await app.request('/api/problem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tiers: ['everyday'] }) }, base, { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext);
    const { problem } = await res.json<{ problem: { source: string } }>();
    expect(problem.source).toBe('ai');
  });
});

describe('cron pre-generation', () => {
  // 22:00 UTC = 07:00 JST (before the reset); 03:00 UTC = 12:00 JST.
  const beforeReset = new Date(`${today()}T22:00:00Z`);
  const midday = new Date(`${today()}T03:00:00Z`);

  it('turns leftover energy into stock before the reset (a few per run)', async () => {
    const ai = fakeAi([10, 11, 12, 13].map((n) => JSON.stringify(variant(n))));
    const out = await pregenerate(envWith(ai), beforeReset);
    expect(out.filter((o) => o.ok)).toHaveLength(3);
  });

  it('otherwise only tops up an almost empty stock, one at a time', async () => {
    const ai = fakeAi([14, 15].map((n) => JSON.stringify(variant(n))));
    expect((await pregenerate(envWith(ai), midday)).length).toBe(1);
  });

  it('does nothing below FULL outside the window', async () => {
    await base.DB.prepare('INSERT INTO ai_budget (day, cap, used) VALUES (?1, 9000, 7000)').bind(midday.toISOString().slice(0, 10)).run();
    const ai = fakeAi([JSON.stringify(variant(16))]);
    expect(await pregenerate(envWith(ai), midday)).toEqual([]);
    expect(ai.calls).toHaveLength(0);
  });
});

describe('POST /api/problem/ai (option A: with the answer)', () => {
  const post = (body: unknown) =>
    app.request('/api/problem/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, base, { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext);

  it('returns a whole AI problem, and 404 when the stock is empty', async () => {
    expect((await post({ tiers: ['web'] })).status).toBe(404);
    await generateProblem(envWith(fakeAi([JSON.stringify(variant(20))])), { tier: 'web', userId: null });
    const res = await post({ tiers: ['web'] });
    expect(res.status).toBe(200);
    const { problem } = await res.json<{ problem: { id: string; source: string; tier: string; groups: { label: string; altLabels: string[]; items: unknown[] }[] } }>();
    expect(problem).toMatchObject({ source: 'ai', tier: 'web' });
    expect(problem.id.startsWith('ai:')).toBe(true);
    expect(problem.groups).toHaveLength(5);
    expect(problem.groups[0].altLabels.length).toBeGreaterThan(0);
  });
});

describe('review mode (the default since 2026-10-03)', () => {
  const ctx = { waitUntil() {}, passThroughOnException() {}, props: {} } as unknown as ExecutionContext;
  const reviewEnv = (ai: ReturnType<typeof fakeAi>) => envWith(ai, { PUBLISH_MODE: undefined });

  it('saves generated problems as drafts, which are never served', async () => {
    const out = await generateProblem(reviewEnv(fakeAi([JSON.stringify(variant(30))])), { tier: 'everyday', userId: null });
    expect(out.ok).toBe(true);
    const row = await base.DB.prepare("SELECT status FROM problems WHERE source = 'ai'").first<{ status: string }>();
    expect(row?.status).toBe('draft');
    const res = await app.request('/api/problem/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"tiers":["everyday"]}' }, base, ctx);
    expect(res.status).toBe(404);
  });

  it('closes on-demand generation', async () => {
    const res = await app.request('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"tier":"everyday"}' }, reviewEnv(fakeAi([])), ctx);
    expect(res.status).toBe(403);
  });

  it('keeps only a small pile of drafts', async () => {
    const env = reviewEnv(fakeAi([40, 41, 42, 43].map((n) => JSON.stringify(variant(n)))));
    const out = await pregenerate(env, new Date(`${today()}T22:00:00Z`));
    expect(out.filter((o) => o.ok)).toHaveLength(3);
    const n = await base.DB.prepare("SELECT COUNT(*) AS n FROM problems WHERE source = 'ai' AND status = 'draft'").first<{ n: number }>();
    expect(n?.n).toBe(3);
  });
});
