// "おまかせ仕分け": auto-drops blocks from the pending area into trays, following the reference groups
// but respecting the player's own trays (a group goes to the tray that already holds most of it).
import { useGame } from '../state/store';
import { refGroupOf } from './grading';
import { autoSend } from './input';
import { blocks } from './runtime';

export { refGroupOf };

/**
 * Group → tray mapping: majority vote over existing contents, then free trays.
 * When trays show a capacity, a group only goes to a tray whose capacity equals the group's size.
 */
function planTrays(groupsNeeded: Set<number>): Map<number, string> {
  const game = useGame.getState();
  const sizeOf = (g: number) => game.items.filter((item) => refGroupOf(item.id) === g).length;
  const fits = (trayId: string, g: number) => {
    const cap = game.trays.find((t) => t.id === trayId)?.capacity;
    return cap === undefined || cap === sizeOf(g);
  };
  const votes: { group: number; tray: string; n: number }[] = [];
  for (const tray of game.trays) {
    const counts = new Map<number, number>();
    for (const item of game.items) {
      if (game.assign[item.id] !== tray.id) continue;
      const g = refGroupOf(item.id);
      counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    counts.forEach((n, group) => votes.push({ group, tray: tray.id, n }));
  }
  votes.sort((a, b) => b.n - a.n);
  const map = new Map<number, string>();
  const usedTrays = new Set<string>();
  for (const v of votes) {
    if (map.has(v.group) || usedTrays.has(v.tray) || !fits(v.tray, v.group)) continue;
    map.set(v.group, v.tray);
    usedTrays.add(v.tray);
  }
  // Every group present on the board needs a tray (boards have exactly one tray per group).
  const allGroups = new Set([...groupsNeeded, ...game.items.map((item) => refGroupOf(item.id))]);
  for (const group of allGroups) {
    if (map.has(group)) continue;
    const tray = game.trays.find((t) => !usedTrays.has(t.id) && fits(t.id, group)) ?? game.trays.find((t) => !usedTrays.has(t.id));
    if (!tray) continue;
    map.set(group, tray.id);
    usedTrays.add(tray.id);
  }
  return map;
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Launch a left-to-right wave of auto drops. Returns how many blocks were sent. */
function launch(pairs: { itemId: string; trayId: string }[], firstDelay: number, gap: number): number {
  const ordered = [...pairs].sort((a, b) => (blocks.get(a.itemId)?.pos.x ?? 0) - (blocks.get(b.itemId)?.pos.x ?? 0));
  let sent = 0;
  for (const pair of ordered) {
    if (autoSend(pair.itemId, pair.trayId, firstDelay + sent * gap)) sent++;
  }
  return sent;
}

export const SOME_COUNT = 3;

/** Sort a few pending blocks (a head start). Never touches blocks the player already placed. */
export function assistSome(count = SOME_COUNT): number {
  const game = useGame.getState();
  const pending = game.items.filter((item) => !game.assign[item.id] && blocks.get(item.id)?.phase === 'rest');
  if (!pending.length) return 0;
  const picked = shuffle(pending).slice(0, count);
  const map = planTrays(new Set(picked.map((item) => refGroupOf(item.id))));
  const pairs = picked.flatMap((item) => {
    const trayId = map.get(refGroupOf(item.id));
    return trayId ? [{ itemId: item.id, trayId }] : [];
  });
  const sent = launch(pairs, 250, 260);
  if (sent) useGame.getState().recordAssist('some');
  return sent;
}

/** Sort everything into the reference grouping (label-only practice). Labels are kept. */
export function assistAll(): number {
  const game = useGame.getState();
  const map = planTrays(new Set(game.items.map((item) => refGroupOf(item.id))));
  const pairs = game.items.flatMap((item) => {
    const trayId = map.get(refGroupOf(item.id));
    if (!trayId || game.assign[item.id] === trayId) return [];
    return [{ itemId: item.id, trayId }];
  });
  const sent = launch(pairs, 300, 90);
  if (sent) useGame.getState().recordAssist('all');
  return sent;
}
