export interface Env {
  DB: D1Database;
  AI: Ai;
  /** "none": anonymous players (hashed IP, rotates daily). "access": Cloudflare Access sign-in (SPEC 8.5). */
  AUTH_MODE: 'none' | 'access';
  /** Comma-separated origins allowed to call the API (the pages that serve the game). */
  ALLOWED_ORIGINS: string;
  /** "1": also allow http://localhost:* and http://127.0.0.1:* (the Vite dev server). */
  ALLOW_LOCALHOST?: string;
  /** Comma-separated admin emails (AUTH_MODE=access only). A secret: `wrangler secret put ADMIN_EMAILS`. */
  ADMIN_EMAILS?: string;
  DAILY_CAP: string;
  QUOTA_EVAL_PER_DAY: string;
  QUOTA_GEN_PER_DAY: string;
  EST_GEN_NEURONS: string;
  EST_EVAL_NEURONS: string;
  GEN_MODEL: string;
  EMBED_MODEL: string;
  /** Multiplies the computed Neurons, corrected against the dashboard once real calls run (SPEC 8.2). */
  CALIBRATION: string;
  /** "1": answer from a fixture instead of calling Workers AI (local development). */
  AI_MOCK?: string;
  /** Share of keywords that must sit closest to their own group (leave-one-out) in the embedding check (SPEC 7.2 ④). */
  QA_MIN_COHESION?: string;
  /**
   * "review" (default, decided 2026-10-03): generated problems are saved as drafts and only reach
   * players after Claude has reviewed and fixed them (scripts/review-*.mjs). "auto": straight to ready.
   */
  PUBLISH_MODE?: 'review' | 'auto';
  /** Secret salt for anonymous ids (`wrangler secret put ANON_SALT`); a fixed fallback is used when unset. */
  ANON_SALT?: string;
}

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503,
    message: string,
  ) {
    super(message);
  }
}

/** The UTC day, which is also the Workers AI reset day (00:00 UTC = 09:00 JST). */
export const utcDay = (now: Date) => now.toISOString().slice(0, 10);
