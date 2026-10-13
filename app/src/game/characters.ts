// The character for each title: Lv1..Lv10 and the legend (Lv10 final exam passed).
import { LEGEND_TITLE, MAX_LEVEL, TITLES } from './levels';

export const CHARACTER_COUNT = MAX_LEVEL + 1;
export const LEGEND_INDEX = MAX_LEVEL;

/** Relative to the page, so it works on GitHub Pages and the portal alike. */
export function characterUrl(index: number): string {
  return `./characters/lv${String(index + 1).padStart(2, '0')}.glb`;
}

export function characterTitle(index: number): string {
  return index >= LEGEND_INDEX ? LEGEND_TITLE : TITLES[index];
}

export function characterLabel(index: number): string {
  return index >= LEGEND_INDEX ? '全クリア' : `LV ${index + 1}`;
}

/** The character that represents the player right now: the current level's in level mode,
 *  the best one unlocked in free mode. */
export function currentCharacterIndex(s: { mode: string; level: number; bestLevel: number; clears: { count: number } }): number {
  if (s.mode === 'level') return Math.min(MAX_LEVEL, Math.max(1, s.level)) - 1;
  return s.clears.count > 0 ? LEGEND_INDEX : Math.max(1, s.bestLevel) - 1;
}
