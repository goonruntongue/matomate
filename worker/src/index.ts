// Label Drop API (SPEC 9.4): who am I, how much AI energy is left today, a problem to play (stock or
// templates), and AI generation on demand (P4) — plus the cron pre-generation. AI evaluation is P5.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requireUser } from './auth';
import { generateProblem } from './ai/generate';
import { budgetStatus, usedToday } from './budget';
import { pregenerate } from './cron';
import { HttpError, type Env } from './env';
import { parseRequest, pickAiProblem, pickProblem, serveProblem, TIERS, type Tier } from './problems';

const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

export const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const allowed = c.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  const localOk = c.env.ALLOW_LOCALHOST === '1';
  return cors({
    origin: (origin) => (allowed.includes(origin) || (localOk && LOCALHOST.test(origin)) ? origin : null),
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true, // Access (AUTH_MODE=access) sends its session cookie
    maxAge: 86400,
  })(c, next);
});

app.get('/api/health', (c) => c.json({ ok: true }));

app.get('/api/me', async (c) => {
  const user = await requireUser(c);
  const evalMax = Number(c.env.QUOTA_EVAL_PER_DAY) || 15;
  const genMax = Number(c.env.QUOTA_GEN_PER_DAY) || 3;
  const [evalUsed, genUsed] = await Promise.all([usedToday(c.env, user.id, 'eval'), usedToday(c.env, user.id, 'gen')]);
  return c.json({
    authMode: c.env.AUTH_MODE,
    anonymous: user.anonymous,
    email: user.email,
    name: user.name,
    isAdmin: user.isAdmin,
    quota: user.isAdmin
      ? { evalLeft: null, genLeft: null, evalMax: null, genMax: null }
      : { evalLeft: Math.max(0, evalMax - evalUsed), genLeft: Math.max(0, genMax - genUsed), evalMax, genMax },
  });
});

app.get('/api/status', async (c) => {
  await requireUser(c); // same gate as every other API
  return c.json(await budgetStatus(c.env));
});

app.post('/api/problem', async (c) => {
  await requireUser(c);
  const req = parseRequest(await c.req.json().catch(() => ({})));
  const [problem, budget] = await Promise.all([pickProblem(c.env, req), budgetStatus(c.env)]);
  if (!problem) throw new HttpError(404, 'No problem available');
  return c.json({ problem, budget });
});

// An AI problem from stock, with its answer, for the game to play and check itself (option A).
app.post('/api/problem/ai', async (c) => {
  await requireUser(c);
  const req = parseRequest(await c.req.json().catch(() => ({})));
  const problem = await pickAiProblem(c.env, req);
  if (!problem) throw new HttpError(404, 'No AI problem in stock');
  return c.json({ problem, budget: await budgetStatus(c.env) });
});

// On-demand generation (SPEC 9.4 /api/generate): FULL energy only, per-player quota and rate limit.
app.post('/api/generate', async (c) => {
  const user = await requireUser(c);
  // Under review (the default), an on-the-spot problem would reach a player unreviewed: closed.
  if (c.env.PUBLISH_MODE !== 'auto') throw new HttpError(403, 'Generated problems are reviewed before play: on-demand generation is off');
  const body = ((await c.req.json().catch(() => ({}))) ?? {}) as { tier?: unknown; theme?: unknown };
  if (!TIERS.includes(body.tier as Tier)) throw new HttpError(400, 'tier must be everyday, service or web');
  if (body.theme !== undefined && (typeof body.theme !== 'string' || body.theme.length > 30)) throw new HttpError(400, 'theme must be up to 30 characters');
  const theme = typeof body.theme === 'string' ? body.theme.replace(/\s+/g, ' ').trim() || undefined : undefined;
  if ((await budgetStatus(c.env)).mode !== 'full') throw new HttpError(409, 'AI energy is low: generation is paused');
  if (!user.isAdmin) {
    const max = Number(c.env.QUOTA_GEN_PER_DAY) || 3;
    if ((await usedToday(c.env, user.id, 'gen')) >= max) throw new HttpError(429, 'Daily generation quota used up');
  }
  // Short-term limit (SPEC 8.5: 2 per 60 s), from the call log rather than a paid-tier binding.
  const since = new Date(Date.now() - 60_000).toISOString();
  const recent = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM ai_calls WHERE user_id = ?1 AND kind = 'gen' AND created_at > ?2").bind(user.id, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= 2) throw new HttpError(429, 'Too many generations, wait a minute');
  const out = await generateProblem(c.env, { tier: body.tier as Tier, theme, userId: user.id });
  if (!out.ok) {
    if (out.reason === 'budget' || out.reason === 'exhausted') throw new HttpError(409, 'AI energy is used up for today');
    return c.json({ error: 'Generation failed', reason: out.reason, budget: await budgetStatus(c.env) }, 503);
  }
  const problem = await serveProblem(c.env, out.id);
  return c.json({ problem, budget: await budgetStatus(c.env) });
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: 'Internal error' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(pregenerate(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
