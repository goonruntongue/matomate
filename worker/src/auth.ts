// Who is calling (SPEC 8.5). One switch, AUTH_MODE:
//   none   → anonymous id = hash(IP + UTC day + salt); nothing is stored about the player.
//   access → Cloudflare Access signed the player in; ctx.access carries the identity. Checked here
//            again (not only at the edge) so a misconfigured Access app can't open the API.
import type { Context } from 'hono';
import { HttpError, utcDay, type Env } from './env';

export interface Player {
  id: string;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
  anonymous: boolean;
}

interface AccessIdentity {
  email?: string;
  name?: string;
}
interface AccessContext {
  aud: string;
  getIdentity(): Promise<AccessIdentity | undefined>;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function accessOf(c: Context<{ Bindings: Env }>): AccessContext | undefined {
  try {
    return (c.executionCtx as ExecutionContext & { access?: AccessContext }).access;
  } catch {
    return undefined; // no execution context
  }
}

export async function requireUser(c: Context<{ Bindings: Env }>, now = new Date()): Promise<Player> {
  const env = c.env;
  if (env.AUTH_MODE === 'access') {
    const access = accessOf(c);
    if (!access) throw new HttpError(401, 'Access did not run');
    const identity = await access.getIdentity();
    const email = identity?.email?.trim().toLowerCase();
    if (!email) throw new HttpError(401, 'No identity');
    const name = identity?.name ?? null;
    const stamp = now.toISOString();
    const row = await env.DB.prepare(
      `INSERT INTO users (id, email, name, created_at, last_seen_at) VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, last_seen_at = excluded.last_seen_at
       RETURNING id`,
    )
      .bind(crypto.randomUUID(), email, name, stamp)
      .first<{ id: string }>();
    if (!row) throw new HttpError(500, 'Could not register the user');
    const admins = (env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    return { id: row.id, email, name, isAdmin: admins.includes(email), anonymous: false };
  }
  if (env.AUTH_MODE !== 'none') throw new HttpError(500, `Unknown AUTH_MODE: ${String(env.AUTH_MODE)}`);
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const hash = await sha256Hex(`${ip}|${utcDay(now)}|${env.ANON_SALT ?? 'label-drop'}`);
  return { id: `anon:${hash.slice(0, 16)}`, email: null, name: null, isAdmin: false, anonymous: true };
}
