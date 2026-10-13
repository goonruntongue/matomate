// AI-made problems in the game (decided 2026-10-02, option A): the API sends a problem from its stock
// together with its answer, and the game plays and checks it exactly like a bundled template.
// One problem is fetched ahead for the next level-mode board; if none arrives in time, the board is
// a template as before. Recent ones stay in this browser so a save slot can reopen its board.
import { AI_ENABLED, API_BASE } from './api';
import { addProblem, PROBLEMS, type Problem, type Tier } from './data/problems';
import { FONT_JP } from './game/textTexture';

const CACHE_KEY = 'practice-ia:ai-problems';
const CACHE_MAX = 30;

function readCache(): Problem[] {
  try {
    const list = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '[]') as Problem[];
    return Array.isArray(list) ? list.filter((p) => p?.id && Array.isArray(p.groups)) : [];
  } catch {
    return [];
  }
}
function writeCache(list: Problem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(list.slice(-CACHE_MAX)));
  } catch {
    // Non-critical: only save slots of AI boards need it.
  }
}

// Problems seen before rejoin the list at startup (save slots refer to them by id). Not in the edition
// without AI: it shares this browser storage with the portal's AI edition on the same domain.
// Unreviewed ones (served before 2026-10-03) are dropped.
if (AI_ENABLED) {
  const reviewed = readCache().filter((p) => p.reviewed);
  writeCache(reviewed);
  for (const p of reviewed) addProblem(p);
}

/** Fetched and not played yet. */
const ready: number[] = [];
let inFlight = false;

/** Tiers a level draws from (same widening as the templates in store.ts). */
export const tiersForLevel = (level: number): Tier[] => (level <= 3 ? ['everyday'] : level <= 6 ? ['everyday', 'service'] : ['everyday', 'service', 'web']);

/** Fetch one AI problem for these tiers unless one is already waiting. Never throws. */
export async function prefetchAi(tiers: Tier[]): Promise<void> {
  if (!API_BASE || inFlight || ready.some((i) => tiers.includes(PROBLEMS[i].tier))) return;
  inFlight = true;
  try {
    const exclude = readCache().map((p) => p.id);
    const res = await fetch(`${API_BASE}/api/problem/ai`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tiers, exclude }),
    });
    if (!res.ok) return; // 404 = no stock yet
    const { problem } = (await res.json()) as { problem: Problem };
    if (!problem?.id || !Array.isArray(problem.groups) || !problem.groups.length || !problem.reviewed) return;
    const p: Problem = { ...problem, source: 'ai' };
    // Block textures are drawn once: the glyphs of its keywords must be loaded first (as App does at start).
    if (document.fonts) {
      const text = p.groups.flatMap((g) => g.items.map((k) => k.text)).join('');
      await Promise.race([
        Promise.allSettled([document.fonts.load(`700 40px ${FONT_JP}`, text), document.fonts.load(`900 40px ${FONT_JP}`, text)]),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    const index = addProblem(p);
    writeCache([...readCache().filter((x) => x.id !== p.id), p]);
    if (!ready.includes(index)) ready.push(index);
  } catch {
    // Offline or API down: templates only.
  } finally {
    inFlight = false;
  }
}

/** Takes a waiting AI problem for these tiers (index into PROBLEMS), or null. */
export function takeAi(tiers: Tier[], current: number): number | null {
  const at = ready.findIndex((i) => i !== current && tiers.includes(PROBLEMS[i].tier));
  return at < 0 ? null : ready.splice(at, 1)[0];
}

/** A saved board's problem, by id (templates and remembered AI problems); -1 if unknown. */
export const indexOfProblem = (id: string) => PROBLEMS.findIndex((p) => p.id === id);
