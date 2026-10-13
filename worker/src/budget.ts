// The shared daily AI budget and what the AI ENERGY meter shows (SPEC 4.8, 8.3).
// Reads never write: a day without a row simply has nothing used yet.
import { utcDay, type Env } from './env';

export type AiMode = 'full' | 'saver' | 'offline';

export interface BudgetStatus {
  day: string;
  mode: AiMode;
  /** 0–100, shared by everyone. */
  remainingPct: number;
  /** About how many more generations / evaluations today (0 when the mode doesn't allow them). */
  estGen: number;
  estEval: number;
  /** Next reset (00:00 UTC = 09:00 JST), ISO string. */
  resetAt: string;
}

/** FULL ≥ 30% (generate + evaluate), SAVER 10–30% (evaluate only), OFFLINE < 10% or exhausted. */
export const SAVER_BELOW = 0.3;
export const OFFLINE_BELOW = 0.1;

export async function budgetStatus(env: Env, now = new Date()): Promise<BudgetStatus> {
  const day = utcDay(now);
  const fallbackCap = Number(env.DAILY_CAP) || 9000;
  const row = await env.DB.prepare('SELECT cap, used, exhausted FROM ai_budget WHERE day = ?1')
    .bind(day)
    .first<{ cap: number; used: number; exhausted: number }>();
  const cap = row?.cap ?? fallbackCap;
  const remaining = row?.exhausted ? 0 : Math.max(0, cap - (row?.used ?? 0));
  const share = cap > 0 ? remaining / cap : 0;
  const mode: AiMode = row?.exhausted || share < OFFLINE_BELOW ? 'offline' : share < SAVER_BELOW ? 'saver' : 'full';
  const per = (v: string, fallback: number) => Math.max(1, Number(v) || fallback);
  const estGen = mode === 'full' ? Math.floor(Math.max(0, remaining - cap * SAVER_BELOW) / per(env.EST_GEN_NEURONS, 220)) : 0;
  const estEval = mode === 'offline' ? 0 : Math.floor(Math.max(0, remaining - cap * OFFLINE_BELOW) / per(env.EST_EVAL_NEURONS, 90));
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return { day, mode, remainingPct: Math.round(share * 100), estGen, estEval, resetAt: reset.toISOString() };
}

/** Today's successful AI calls of one kind for one player (quotas count these; no extra table). */
export async function usedToday(env: Env, userId: string, kind: 'gen' | 'eval', now = new Date()): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM ai_calls WHERE user_id = ?1 AND day = ?2 AND kind = ?3 AND ok = 1')
    .bind(userId, utcDay(now), kind)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

// ── Spending (SPEC 8.3): reserve before a call, settle with the real cost after, stop on 3036. ──

/** Reserve `amount` Neurons for today. False when it would go past the cap (or the day is exhausted). */
export async function reserve(env: Env, amount: number, now = new Date()): Promise<boolean> {
  const day = utcDay(now);
  await env.DB.prepare('INSERT OR IGNORE INTO ai_budget (day, cap, used) VALUES (?1, ?2, 0)').bind(day, Number(env.DAILY_CAP) || 9000).run();
  const row = await env.DB.prepare('UPDATE ai_budget SET used = used + ?1 WHERE day = ?2 AND exhausted = 0 AND used + ?1 <= cap RETURNING used')
    .bind(amount, day)
    .first();
  return !!row;
}

/** Replace a reservation with what the call really cost. */
export async function settle(env: Env, reserved: number, actual: number, now = new Date()): Promise<void> {
  await env.DB.prepare('UPDATE ai_budget SET used = MAX(0, used - ?1 + ?2) WHERE day = ?3').bind(reserved, actual, utcDay(now)).run();
}

/** Workers AI said the free allocation is gone: nothing more today. */
export async function markExhausted(env: Env, now = new Date()): Promise<void> {
  await env.DB.prepare('UPDATE ai_budget SET exhausted = 1, used = cap WHERE day = ?1').bind(utcDay(now)).run();
}

export interface CallRecord {
  kind: 'gen' | 'eval' | 'embed';
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  neurons?: number;
  ok: boolean;
  error?: string;
  userId: string | null;
}

export async function recordCall(env: Env, c: CallRecord, now = new Date()): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO ai_calls (day, kind, model, tokens_in, tokens_out, neurons, ok, error, user_id, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)',
  )
    .bind(utcDay(now), c.kind, c.model, c.tokensIn ?? null, c.tokensOut ?? null, c.neurons ?? null, c.ok ? 1 : 0, c.error ?? null, c.userId, now.toISOString())
    .run();
}
