// Every team's board for the current round, as stored in the database, and its answer check.
// Read by the game master's panel (always) and by everyone once the results are shown.
import { onValue, ref } from 'firebase/database';
import { useEffect, useState } from 'react';
import { PROBLEMS } from '../data/problems';
import { grade, type Grade } from '../game/grading';
import { dealTeamBoard, type Item } from '../state/store';
import { db } from './firebase';
import type { Round } from './session';

export interface BoardData {
  assign?: Record<string, { tray: string; at: number }>;
  labels?: Record<string, string>;
  comment?: string;
  submitted?: { by: string; at: number };
}

/** Boards by team id. Empty while `enabled` is false (the rules refuse the read then anyway). */
export function useBoards(round: Round | null, enabled: boolean): Record<string, BoardData> {
  const [boards, setBoards] = useState<Record<string, BoardData>>({});
  const key = round?.round;
  useEffect(() => {
    if (!enabled || key === undefined) {
      setBoards({});
      return;
    }
    return onValue(
      ref(db, 'room/boards'),
      (snap) => {
        const all = (snap.val() ?? {}) as Record<string, Record<string, BoardData>>;
        setBoards(Object.fromEntries(Object.entries(all).map(([team, rounds]) => [team, rounds?.[`r${key}`] ?? {}])));
      },
      () => setBoards({}),
    );
  }, [key, enabled]);
  return boards;
}

export interface Answer {
  items: Item[];
  trayIds: string[];
  /** Blocks the team left in the pending area. */
  pending: Item[];
  grade: Grade;
}

/** A team's answer checked against the model (the same check as single play, without stars for hints). */
export function checkBoard(round: Round, board: BoardData): Answer | null {
  const dealt = dealTeamBoard(round);
  const problemIndex = PROBLEMS.findIndex((p) => p.id === round.problemId);
  if (!dealt || problemIndex < 0) return null;
  const assign: Record<string, string | null> = {};
  for (const item of dealt.items) assign[item.id] = board.assign?.[item.id]?.tray ?? null;
  const trays = dealt.trayIds.map((id, i) => ({ id, label: board.labels?.[id] ?? '', colorIndex: i }));
  // Blocks in the order they went into each box.
  const items = [...dealt.items].sort((a, b) => (board.assign?.[a.id]?.at ?? 0) - (board.assign?.[b.id]?.at ?? 0));
  return {
    items,
    trayIds: dealt.trayIds,
    pending: dealt.items.filter((item) => !assign[item.id]),
    grade: grade({ problemIndex, items, trays, assign, labelsRequired: true, axisHintShown: false, assistUsed: { some: 0, all: false } }),
  };
}
