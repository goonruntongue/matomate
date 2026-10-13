// The Label Drop API (worker/, SPEC 9.4). The game never depends on it: without it, it plays from
// the bundled problems with local scoring. Only the AI ENERGY meter reads it for now (P3).
import { create } from 'zustand';

/**
 * AI features (meter, API calls, AI-made problems) are off unless the build sets VITE_AI=on.
 * Since 2026-10-03 (decision #25) every build is static: problems are written by Claude and built in.
 * The API and this code stay for later (classroom mode, docs/CLASSROOM_SPEC.md).
 */
export const AI_ENABLED = import.meta.env.VITE_AI === 'on';

/** Where the API lives. Dev: `npm --prefix worker run dev` (port 8787); VITE_API_BASE overrides both.
 *  An empty value means "no API" and the meter says AI is being prepared. */
const PROD_API = 'https://label-drop-api.goonruntongue.workers.dev';
export const API_BASE: string = !AI_ENABLED ? '' : ((import.meta.env.VITE_API_BASE as string | undefined) ?? (import.meta.env.DEV ? 'http://localhost:8787' : PROD_API));

export type AiMode = 'full' | 'saver' | 'offline';

export interface AiStatus {
  mode: AiMode;
  remainingPct: number;
  estGen: number;
  estEval: number;
  resetAt: string;
}

export interface AiQuota {
  evalLeft: number | null;
  genLeft: number | null;
  evalMax: number | null;
  genMax: number | null;
}

type State = 'idle' | 'loading' | 'ready' | 'unavailable' | 'unconfigured';

interface AiStore {
  state: State;
  status: AiStatus | null;
  quota: AiQuota | null;
  refresh(): Promise<void>;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const useAi = create<AiStore>((set, get) => ({
  state: API_BASE ? 'idle' : 'unconfigured',
  status: null,
  quota: null,
  // No polling (SPEC 4.8): fetched at start, on retry, and later with every AI response.
  refresh: async () => {
    if (!API_BASE || get().state === 'loading') return;
    set({ state: 'loading' });
    try {
      const [status, me] = await Promise.all([getJson<AiStatus>('/api/status'), getJson<{ quota: AiQuota }>('/api/me')]);
      set({ state: 'ready', status, quota: me.quota });
    } catch {
      set({ state: 'unavailable' });
    }
  },
}));

export const MODE_LABEL: Record<AiMode, string> = { full: 'AI生成', saver: '節約', offline: 'オフライン' };
