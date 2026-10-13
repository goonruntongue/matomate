// Every team's board for the current round, as stored in the database, and its answer check.
// Read by the game master's panel (always) and by everyone once the results are shown.
import { onValue, ref, set } from 'firebase/database';
import { useEffect, useState } from 'react';
import { PROBLEMS } from '../data/problems';
import { grade, type Grade } from '../game/grading';
import { dealTeamBoard, TRASH_ID, type Item } from '../state/store';
import { db } from './firebase';
import { boardKey, MAX_SLOTS, teamKey, type Round } from './session';

export interface BoardData {
  assign?: Record<string, { tray: string; at: number }>;
  labels?: Record<string, string>;
  /** Second half: the purpose the team chose. */
  purpose?: string;
  comment?: string;
  submitted?: { by: string; at: number };
}

/**
 * Boards by team id, of the first half or (free) the second. Empty while `enabled` is false
 * (the rules refuse the read then anyway).
 */
export function useBoards(round: Round | null, enabled: boolean, free = false): Record<string, BoardData> {
  const [boards, setBoards] = useState<Record<string, BoardData>>({});
  const key = round ? boardKey(round.round, free) : undefined;
  useEffect(() => {
    if (!enabled || key === undefined) {
      setBoards({});
      return;
    }
    return onValue(
      ref(db, 'room/boards'),
      (snap) => {
        const all = (snap.val() ?? {}) as Record<string, Record<string, BoardData>>;
        setBoards(Object.fromEntries(Object.entries(all).map(([team, rounds]) => [team, rounds?.[key] ?? {}])));
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

export interface FreeAnswer {
  trays: { trayId: string; label: string; items: Item[] }[];
  /** Blocks the team threw away as not needed for its purpose. */
  trash: Item[];
  pending: Item[];
}

/** A team's answer to the second half, laid out for display. There is no model to check it against. */
export function layOutFree(round: Round, board: BoardData): FreeAnswer | null {
  const dealt = dealTeamBoard(round);
  if (!dealt) return null;
  const inOrder = [...dealt.items].sort((a, b) => (board.assign?.[a.id]?.at ?? 0) - (board.assign?.[b.id]?.at ?? 0));
  const where = (item: Item) => board.assign?.[item.id]?.tray ?? null;
  return {
    trays: dealt.trayIds.map((trayId) => ({ trayId, label: board.labels?.[trayId] ?? '', items: inOrder.filter((item) => where(item) === trayId) })),
    trash: inOrder.filter((item) => where(item) === TRASH_ID),
    pending: dealt.items.filter((item) => !where(item)),
  };
}

// ── Hearts: after the second half, everyone gives one heart to the team whose answer they liked. ──

/** Everyone's vote (uid → team id). Readable by the game master, and by all once the voting is closed. */
export function useVotes(round: Round | null, enabled: boolean): Record<string, string> {
  const [votes, setVotes] = useState<Record<string, string>>({});
  const key = round?.round;
  useEffect(() => {
    if (!enabled || key === undefined) {
      setVotes({});
      return;
    }
    return onValue(
      ref(db, `room/votes/r${key}`),
      (snap) => setVotes((snap.val() ?? {}) as Record<string, string>),
      () => setVotes({}),
    );
  }, [key, enabled]);
  return votes;
}

/** This person's own vote ('' = none yet). */
export function useMyVote(round: Round | null, uid: string): string {
  const [vote, setVote] = useState('');
  const key = round?.round;
  useEffect(() => {
    if (!uid || key === undefined) {
      setVote('');
      return;
    }
    return onValue(
      ref(db, `room/votes/r${key}/${uid}`),
      (snap) => setVote(typeof snap.val() === 'string' ? (snap.val() as string) : ''),
      () => setVote(''),
    );
  }, [key, uid]);
  return vote;
}

export function castVote(round: Round, uid: string, teamId: string): Promise<void> {
  return set(ref(db, `room/votes/r${round.round}/${uid}`), teamId);
}

/** A team's second half: every purpose it stocked (index 0 = 目的1), and which one it presents first. */
export interface FreeTeam {
  slots: BoardData[];
  primary: number;
  submitted?: { by: string; at: number };
}

/** A purpose the team actually worked on (an untouched slot is not shown anywhere). */
export const slotUsed = (board: BoardData | undefined) => !!board && (!!board.purpose?.trim() || !!board.assign);

/** Every team's second half, by team id. Empty while `enabled` is false. */
export function useFreeTeams(round: Round | null, enabled: boolean): Record<string, FreeTeam> {
  const [teams, setTeams] = useState<Record<string, FreeTeam>>({});
  const n = round?.round;
  useEffect(() => {
    if (!enabled || n === undefined) {
      setTeams({});
      return;
    }
    return onValue(
      ref(db, 'room/boards'),
      (snap) => {
        const all = (snap.val() ?? {}) as Record<string, Record<string, BoardData & { primary?: number }>>;
        setTeams(
          Object.fromEntries(
            Object.entries(all).map(([team, rounds]) => {
              const wide = rounds?.[teamKey(n, true)] ?? {};
              const slots = Array.from({ length: MAX_SLOTS }, (_, i) => rounds?.[boardKey(n, true, i + 1)] ?? {});
              const primary = Number(wide.primary) >= 1 && Number(wide.primary) <= MAX_SLOTS ? Number(wide.primary) : 1;
              return [team, { slots, primary, submitted: wide.submitted }];
            }),
          ),
        );
      },
      () => setTeams({}),
    );
  }, [n, enabled]);
  return teams;
}
