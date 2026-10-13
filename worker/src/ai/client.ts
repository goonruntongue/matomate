// Calling Workers AI, and what each call costs in Neurons (SPEC 8.1–8.2).
// AI_MOCK=1 (local development) answers from a fixture and never touches the account's free allocation.
import type { Env } from '../env';
import { MOCK_GENERATED } from './mock';
import type { ChatMessage } from './prompt';

/** Neurons per 1M tokens (official price list, 2026-09-30). Unknown models are priced high, to be safe. */
const RATES: Record<string, { in: number; out: number }> = {
  '@cf/google/gemma-4-26b-a4b-it': { in: 9091, out: 27273 },
  '@cf/zai-org/glm-4.7-flash': { in: 5500, out: 36400 },
  '@cf/openai/gpt-oss-120b': { in: 31818, out: 68182 },
  '@cf/baai/bge-m3': { in: 1075, out: 0 },
};
const UNKNOWN_RATE = { in: 50000, out: 150000 };

/**
 * Per-model request options. Gemma 4 "thinks" first by default: on a 4096-token budget it spent
 * everything on reasoning and returned no JSON (2026-10-02, ~135 Neurons wasted per call). With
 * thinking off and JSON mode it answers in ~20 s for ~31 Neurons.
 */
const MODEL_OPTIONS: Record<string, Record<string, unknown>> = {
  '@cf/google/gemma-4-26b-a4b-it': { chat_template_kwargs: { enable_thinking: false }, response_format: { type: 'json_object' } },
};

export function neuronsFor(env: Env, model: string, tokensIn: number, tokensOut: number): number {
  const r = RATES[model] ?? UNKNOWN_RATE;
  const calibration = Number(env.CALIBRATION) || 1.15;
  return ((tokensIn * r.in + tokensOut * r.out) / 1e6) * calibration;
}

/** The day's free allocation is used up (Workers AI error 3036): stop until the reset. */
export class AiExhaustedError extends Error {}
/** Any other failure of the call itself (capacity, timeout, paid-only model…). */
export class AiCallError extends Error {}

const errorCode = (err: unknown) => /\b(3036|3040|5035)\b/.exec(String((err as Error)?.message ?? err))?.[1] ?? null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rough token count when a model reports no usage: Japanese ≈ 1 token per character, to stay on the safe side. */
const roughTokens = (s: string) => Math.ceil(s.length * 1.1);

async function runWithRetry(env: Env, model: string, input: unknown): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await env.AI.run(model as Parameters<Ai['run']>[0], input as never);
    } catch (err) {
      const code = errorCode(err);
      if (code === '3036') throw new AiExhaustedError('Workers AI daily allocation used up');
      if (code === '3040' && attempt === 0) {
        await sleep(500); // out of capacity: one more try (SPEC 8.3)
        continue;
      }
      throw new AiCallError(String((err as Error)?.message ?? err).slice(0, 300));
    }
  }
}

export interface ChatResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
  neurons: number;
}

export async function chat(env: Env, model: string, messages: ChatMessage[], opts: { temperature: number; maxTokens: number }): Promise<ChatResult> {
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0);
  if (env.AI_MOCK === '1') {
    const text = JSON.stringify(MOCK_GENERATED);
    return { text, tokensIn: Math.ceil(promptChars * 1.1), tokensOut: 0, neurons: 0 };
  }
  const res = (await runWithRetry(env, model, { messages, temperature: opts.temperature, max_tokens: opts.maxTokens, ...MODEL_OPTIONS[model] })) as {
    response?: unknown;
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; neurons?: number };
  };
  const raw = res.response ?? res.choices?.[0]?.message?.content ?? '';
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  const tokensIn = res.usage?.prompt_tokens ?? Math.ceil(promptChars * 1.1);
  const tokensOut = res.usage?.completion_tokens ?? roughTokens(text);
  // The real cost when the response reports it; the price list otherwise.
  const neurons = typeof res.usage?.neurons === 'number' ? res.usage.neurons : neuronsFor(env, model, tokensIn, tokensOut);
  return { text, tokensIn, tokensOut, neurons };
}

export interface EmbedResult {
  vectors: number[][];
  tokensIn: number;
  neurons: number;
}

export async function embed(env: Env, texts: string[]): Promise<EmbedResult | null> {
  if (env.AI_MOCK === '1') return null; // no quality check in mock mode
  const model = env.EMBED_MODEL || '@cf/baai/bge-m3';
  const res = (await runWithRetry(env, model, { text: texts })) as { data?: number[][]; response?: number[][] };
  const vectors = res.data ?? res.response ?? [];
  const tokensIn = roughTokens(texts.join(''));
  return { vectors, tokensIn, neurons: neuronsFor(env, model, tokensIn, 0) };
}
