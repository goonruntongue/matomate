// The generation pipeline (SPEC 7.2): draw → reserve budget → generate → check (one retry with the
// problems listed) → embedding check → save — as a draft for Claude's review (PUBLISH_MODE=review,
// the default since 2026-10-03), or ready to play (auto). Every AI call is recorded, and the
// reservation is settled with what the call really cost.
import { markExhausted, recordCall, reserve, settle } from '../budget';
import type { Env } from '../env';
import type { Tier } from '../problems';
import { drawParams, type GenParams } from './catalog';
import { AiCallError, AiExhaustedError, chat, embed } from './client';
import { generationMessages, retryMessages } from './prompt';
import { quality } from './quality';
import { checkGenerated, extractJson, normalize, type Generated } from './validate';

export type GenFailure = 'budget' | 'exhausted' | 'ai-error' | 'invalid' | 'quality' | 'duplicate';
export type GenOutcome = { ok: true; id: string; cohesion: number | null } | { ok: false; reason: GenFailure; detail?: string };

/** Reserved per generation call: the estimate plus 20% (SPEC 8.3). */
const reserveFor = (env: Env) => (Number(env.EST_GEN_NEURONS) || 220) * 1.2;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** One reserved, recorded chat call. Throws AiExhaustedError / AiCallError; returns null when the budget says no. */
async function call(env: Env, messages: Parameters<typeof chat>[2], userId: string | null) {
  const model = env.GEN_MODEL;
  const reserved = reserveFor(env);
  if (!(await reserve(env, reserved))) return null;
  try {
    const res = await chat(env, model, messages, { temperature: 0.8, maxTokens: 4096 });
    await settle(env, reserved, res.neurons);
    return res;
  } catch (err) {
    // Unknown real cost: keep the reservation. 3036 also closes the day.
    if (err instanceof AiExhaustedError) await markExhausted(env);
    await recordCall(env, { kind: 'gen', model, ok: false, error: String((err as Error).message).slice(0, 200), userId });
    throw err;
  }
}

export async function generateProblem(env: Env, opts: { tier: Tier; theme?: string; userId: string | null; params?: GenParams }): Promise<GenOutcome> {
  const params = opts.params ?? drawParams(opts.tier, opts.theme);
  const first = generationMessages(params);
  const model = env.GEN_MODEL;
  let problem: Generated | null = null;
  try {
    let messages = first;
    for (let attempt = 0; attempt < 2 && !problem; attempt++) {
      const res = await call(env, messages, opts.userId);
      if (!res) return { ok: false, reason: 'budget' };
      let checked;
      try {
        checked = checkGenerated(extractJson(res.text));
      } catch (err) {
        checked = { ok: false as const, problems: [`JSONとして読めません: ${(err as Error).message}`] };
      }
      // Counted as a generation (quota) only when its answer is used.
      await recordCall(env, { kind: 'gen', model, tokensIn: res.tokensIn, tokensOut: res.tokensOut, neurons: res.neurons, ok: checked.ok, error: checked.ok ? undefined : checked.problems.join(' / ').slice(0, 300), userId: opts.userId });
      if (checked.ok) problem = checked.problem;
      else if (attempt === 0) messages = retryMessages(first, res.text, checked.problems);
      else return { ok: false, reason: 'invalid', detail: checked.problems.join(' / ') };
    }
  } catch (err) {
    if (err instanceof AiExhaustedError) return { ok: false, reason: 'exhausted' };
    if (err instanceof AiCallError) return { ok: false, reason: 'ai-error', detail: err.message };
    throw err;
  }
  if (!problem) return { ok: false, reason: 'invalid' };

  // Embedding check (skipped in mock mode). Each keyword is embedded with its meaning: a bare 2–6
  // character word carries too little (2026-10-02: good problems scored 0.57 on words alone, 0.73 with
  // meanings, while two problems with blurry groups stayed around 0.45).
  const texts = problem.groups.flatMap((g) => g.items.map((k) => k.text));
  const embedTexts = problem.groups.flatMap((g) => g.items.map((k) => `${k.text}：${k.desc}`));
  const groupOf = problem.groups.flatMap((g, gi) => g.items.map(() => gi));
  let cohesion: number | null = null;
  try {
    const emb = await embed(env, embedTexts);
    if (emb) {
      await recordCall(env, { kind: 'embed', model: env.EMBED_MODEL, tokensIn: emb.tokensIn, neurons: emb.neurons, ok: true, userId: opts.userId });
      await settle(env, 0, emb.neurons);
      if (emb.vectors.length === texts.length) {
        const q = quality(emb.vectors, groupOf);
        cohesion = q.cohesion;
        const min = Number(env.QA_MIN_COHESION) || 0.6;
        if (q.duplicates.length) return { ok: false, reason: 'quality', detail: `ほぼ同じキーワード: ${q.duplicates.map(([a, b]) => `${texts[a]}/${texts[b]}`).join(', ')}` };
        if (q.cohesion < min) return { ok: false, reason: 'quality', detail: `まとまり ${Math.round(q.cohesion * 100)}% < ${Math.round(min * 100)}%` };
      }
    }
  } catch (err) {
    if (err instanceof AiExhaustedError) return { ok: false, reason: 'exhausted' };
    // The check itself failed (capacity…): keep the problem, unchecked.
  }

  const id = `ai:${crypto.randomUUID()}`;
  const body = { id, tier: params.tier, title: problem.title, brief: problem.brief, axisHint: problem.axisHint, groups: problem.groups };
  const itemsHash = await sha256Hex(texts.map(normalize).sort().join('\n'));
  const saved = await env.DB.prepare(
    `INSERT OR IGNORE INTO problems (id, source, difficulty, domain, scheme, body, items_hash, qa_cohesion, status, created_at)
     VALUES (?1, 'ai', ?2, ?3, ?4, ?5, ?6, ?7, ?9, ?8)`,
  )
    .bind(id, params.tier, params.domain, params.scheme.id, JSON.stringify(body), itemsHash, cohesion, new Date().toISOString(), env.PUBLISH_MODE === 'auto' ? 'ready' : 'draft')
    .run();
  if (!saved.meta.changes) return { ok: false, reason: 'duplicate' };
  return { ok: true, id, cohesion };
}
