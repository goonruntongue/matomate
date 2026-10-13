// Runs the API against a local D1 (Miniflare via getPlatformProxy). `npm test` applies the
// migrations to .wrangler/test-state first. Covers both AUTH_MODEs (P3 done-condition, SPEC 11).
import { getPlatformProxy, type PlatformProxy } from 'wrangler';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import type { Env } from '../src/env';

const ORIGIN = 'https://knowledge-surrounding-ai.pages.dev';
let proxy: PlatformProxy<Env>;
let env: Env;

beforeAll(async () => {
  proxy = await getPlatformProxy<Env>({ persist: { path: '.wrangler/test-state/v3' }, remoteBindings: false });
  env = proxy.env;
});
afterAll(async () => {
  await proxy.dispose();
});
beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM ai_budget'), env.DB.prepare('DELETE FROM ai_calls'), env.DB.prepare('DELETE FROM users')]);
});

const today = () => new Date().toISOString().slice(0, 10);

function ctx(access?: { email?: string; name?: string } | null) {
  const base = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} };
  if (access === undefined || access === null) return base as unknown as ExecutionContext;
  return { ...base, access: { aud: 'label-drop-dev', getIdentity: async () => access } } as unknown as ExecutionContext;
}

function call(path: string, opts: { vars?: Partial<Env>; ctx?: ExecutionContext; origin?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { Origin: opts.origin ?? ORIGIN };
  if (opts.ip) headers['cf-connecting-ip'] = opts.ip;
  return app.request(path, { headers }, { ...env, ...opts.vars }, opts.ctx ?? ctx());
}

describe('CORS', () => {
  it('answers the allowed origins and localhost only', async () => {
    const ok = await call('/api/health');
    expect(ok.status).toBe(200);
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    const dev = await call('/api/health', { origin: 'http://localhost:5173' });
    expect(dev.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    const other = await call('/api/health', { origin: 'https://evil.example' });
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    const noLocal = await call('/api/health', { origin: 'http://localhost:5173', vars: { ALLOW_LOCALHOST: '0' } });
    expect(noLocal.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('AUTH_MODE=none', () => {
  it('gives an anonymous id per IP and the daily quotas', async () => {
    const a = await (await call('/api/me', { ip: '203.0.113.1' })).json<Record<string, unknown>>();
    expect(a).toMatchObject({ authMode: 'none', anonymous: true, email: null, isAdmin: false, quota: { evalLeft: 15, genLeft: 3 } });
    const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
    expect(users?.n).toBe(0); // nothing stored about anonymous players
  });

  it('counts today\'s successful AI calls against the quota', async () => {
    // Recreate the anonymous id the same way the API does.
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`198.51.100.7|${today()}|label-drop`));
    const id = `anon:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16)}`;
    const insert = (kind: string, ok: number) =>
      env.DB.prepare('INSERT INTO ai_calls (day, kind, model, ok, user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(
        today(), kind, 'test', ok, id, new Date().toISOString(),
      );
    await env.DB.batch([insert('eval', 1), insert('eval', 1), insert('eval', 0), insert('gen', 1)]);
    const me = await (await call('/api/me', { ip: '198.51.100.7' })).json<{ quota: { evalLeft: number; genLeft: number } }>();
    expect(me.quota).toMatchObject({ evalLeft: 13, genLeft: 2 });
  });
});

describe('AUTH_MODE=access', () => {
  const vars = { AUTH_MODE: 'access' as const, ADMIN_EMAILS: 'admin@example.com' };

  it('refuses requests Access did not authenticate', async () => {
    const res = await call('/api/me', { vars });
    expect(res.status).toBe(401);
    expect((await call('/api/status', { vars })).status).toBe(401);
    expect((await call('/api/me', { vars, ctx: ctx({}) })).status).toBe(401); // no email
  });

  it('registers the signed-in player once and knows the admin', async () => {
    const me = await (await call('/api/me', { vars, ctx: ctx({ email: 'Admin@Example.com', name: 'G' }) })).json<Record<string, unknown>>();
    expect(me).toMatchObject({ authMode: 'access', anonymous: false, email: 'admin@example.com', isAdmin: true, quota: { evalLeft: null } });
    const friend = await (await call('/api/me', { vars, ctx: ctx({ email: 'friend@example.com' }) })).json<Record<string, unknown>>();
    expect(friend).toMatchObject({ isAdmin: false, quota: { evalLeft: 15, genLeft: 3 } });
    await call('/api/me', { vars, ctx: ctx({ email: 'friend@example.com', name: 'Friend' }) });
    const rows = await env.DB.prepare('SELECT email, name FROM users ORDER BY email').all<{ email: string; name: string | null }>();
    expect(rows.results).toEqual([
      { email: 'admin@example.com', name: 'G' },
      { email: 'friend@example.com', name: 'Friend' },
    ]);
  });
});

describe('/api/status (AI ENERGY)', () => {
  const setBudget = (used: number, exhausted = 0) =>
    env.DB.prepare('INSERT INTO ai_budget (day, cap, used, exhausted) VALUES (?1, 9000, ?2, ?3)').bind(today(), used, exhausted).run();
  const status = async () => (await call('/api/status')).json<{ mode: string; remainingPct: number; estGen: number; estEval: number; resetAt: string }>();

  it('is full at the start of the day and resets at 00:00 UTC', async () => {
    const s = await status();
    expect(s).toMatchObject({ mode: 'full', remainingPct: 100 });
    expect(s.estGen).toBeGreaterThan(0);
    expect(s.resetAt.endsWith('T00:00:00.000Z')).toBe(true);
  });

  it('switches to saver below 30% (no generation) and offline below 10%', async () => {
    await setBudget(7000); // 22% left
    expect(await status()).toMatchObject({ mode: 'saver', remainingPct: 22, estGen: 0 });
    expect((await status()).estEval).toBeGreaterThan(0);
    await env.DB.prepare('UPDATE ai_budget SET used = 8500').run(); // 6% left
    expect(await status()).toMatchObject({ mode: 'offline', estGen: 0, estEval: 0 });
  });

  it('is offline once the provider said the day is used up', async () => {
    await setBudget(100, 1);
    expect(await status()).toMatchObject({ mode: 'offline', remainingPct: 0 });
  });
});

describe('POST /api/problem (templates)', () => {
  const post = (body: unknown, vars: Partial<Env> = {}) =>
    app.request('/api/problem', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, { ...env, ...vars }, ctx());
  type View = { id: string; source: string; tier: string; groupCount: number; keywords: { text: string; desc: string }[] } & Record<string, unknown>;

  it('serves a template from the requested tiers without the answer', async () => {
    const res = await post({ tiers: ['everyday'] });
    expect(res.status).toBe(200);
    const { problem, budget } = await res.json<{ problem: View; budget: { mode: string } }>();
    expect(problem.id.startsWith('tpl:')).toBe(true);
    expect(problem).toMatchObject({ source: 'template', tier: 'everyday' });
    expect(problem.groupCount).toBeGreaterThanOrEqual(3);
    expect(problem.keywords.length).toBeGreaterThanOrEqual(problem.groupCount * 3);
    expect(problem.keywords[0]).toEqual({ text: expect.any(String), desc: expect.any(String) });
    expect(problem).not.toHaveProperty('groups'); // no grouping, no model labels
    expect(JSON.stringify(problem)).not.toContain('"label"');
    expect(budget.mode).toBe('full');
  });

  it('skips excluded ids, and plays the least-played first', async () => {
    const all = await env.DB.prepare("SELECT id FROM problems WHERE difficulty = 'web'").all<{ id: string }>();
    const ids = all.results.map((r) => r.id);
    expect(ids.length).toBeGreaterThan(1);
    const keep = ids[0];
    const { problem } = await (await post({ tiers: ['web'], exclude: ids.slice(1) })).json<{ problem: View }>();
    expect(problem.id).toBe(keep);
    // Everything excluded: still serves something instead of failing.
    expect((await post({ tiers: ['web'], exclude: ids })).status).toBe(200);
  });

  it('rejects bad requests', async () => {
    expect((await post({ tiers: ['hard'] })).status).toBe(400);
    expect((await post({ exclude: Array.from({ length: 101 }, (_, i) => `x${i}`) })).status).toBe(400);
  });

  it('is behind the same gate in access mode', async () => {
    expect((await post({}, { AUTH_MODE: 'access' })).status).toBe(401);
  });
});
