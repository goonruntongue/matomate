// Team play: keeps one team's board the same on every member's device.
//
// Shared in the database, under room/boards/{team}/r{round}:
//   assign/{block}  = { tray, at }   which tray a block is in (missing = pending area)
//   labels/{tray}   = text
//   holds/{block}   = uid            who is holding or throwing the block right now
//   cursors/{uid}   = { x, y, h }    pointer over the stage (fractions of the stage) and the block carried
//   purpose         = text           second half: the purpose the team chose to sort for
//   comment         = text           the team's final comment: why it sorted this way
//   submitted       = { by, at }     set once the team has handed its answer in (removed to take it back)
// In the second half a team may stock several purposes: each has a board like the above (r3f1, r3f2…),
// and `submitted` moves to the team-wide node r3f, next to `primary` (which purpose is the first choice).
//
// Two people reaching for the same block: the first hold written wins (the rules refuse the second),
// and the loser's block springs back. Two people typing the same label: the last one to stop typing wins.
import { onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { remoteSend, yieldBlock } from '../game/input';
import { blocks, dom, drag, remoteCursors, remoteHolds } from '../game/runtime';
import { create } from 'zustand';
import { useGame } from '../state/store';
import { db } from './firebase';

const TICK_MS = 100;
/** A pointer that hasn't moved for this long is no longer shown to the team. */
export const CURSOR_IDLE_MS = 4000;
const LABEL_SEND_MS = 300;
/** While this player is typing a label, a teammate's edits to the same label wait this long. */
const LABEL_QUIET_MS = 1200;

/** This player's pointer (page pixels), whether it is over the stage, and when it last moved. */
export const myPointer = { x: 0, y: 0, inside: false, movedAt: 0 };

export const COMMENT_MAX = 300;
export const PURPOSE_MAX = 120;

export interface Submitted {
  by: string;
  at: number;
}

/** The parts of the team's board that are not on the 3D stage: the final comment and whether it is handed in. */
interface TeamBoardState {
  /** Second half only: who the sorting is for, when, and what for, in the team's own words. */
  purpose: string;
  setPurpose(text: string): void;
  comment: string;
  submitted: Submitted | null;
  /** Second half: which of the team's purposes this player is looking at (each player chooses for themselves). */
  slot: number;
  setSlot(slot: number): void;
  /** Second half: the purpose the team will present first. Shared by the team. */
  primary: number;
  setPrimary(slot: number): void;
  error: string;
  setComment(text: string): void;
  /** Hand the team's answer in. The board is locked for everyone on the team until it is taken back. */
  submit(): void;
  /** Take the answer back (possible until the game master shows the results). */
  takeBack(): void;
}

/** Set while a board is being synced: where it lives, and who this player is. */
let active: { base: string; teamBase: string; statusPath: string; uid: string; touch(field: 'comment' | 'purpose'): void } | null = null;
/** The team-wide node of the last sync: `submitted` and `primary` carry over while it stays the same (switching purposes). */
let lastTeamBase = '';

export const useTeamBoard = create<TeamBoardState>()((set_, get_) => ({
  purpose: '',
  setPurpose: (text) => {
    set_({ purpose: text.slice(0, PURPOSE_MAX) });
    active?.touch('purpose');
  },
  comment: '',
  submitted: null,
  slot: 1,
  setSlot: (slot) => set_({ slot }),
  primary: 1,
  setPrimary: (slot) => {
    if (!active) return;
    set(ref(db, `${active.teamBase}/primary`), slot).catch(() => set_({ error: '第一候補を変えられませんでした。' }));
  },
  error: '',
  setComment: (text) => {
    set_({ comment: text.slice(0, COMMENT_MAX) });
    active?.touch('comment');
  },
  submit: () => {
    if (!active) return;
    const { base, teamBase, statusPath, uid } = active;
    set_({ error: '' });
    // The comment goes with it, in case the last keystrokes haven't been sent yet.
    // room/status only says "this team has handed in": that much everyone may know (the host needs it).
    update(ref(db), {
      [`${base}/comment`]: get_().comment.trim(),
      [`${base}/purpose`]: get_().purpose.trim(),
      [`${teamBase}/submitted`]: { by: uid, at: serverTimestamp() },
      [statusPath]: true,
    }).catch(() => set_({ error: '提出できませんでした。もう一度お試しください。' }));
  },
  takeBack: () => {
    if (!active) return;
    set_({ error: '' });
    update(ref(db), { [`${active.teamBase}/submitted`]: null, [active.statusPath]: null }).catch(() => set_({ error: '取り消せませんでした。結果発表が始まっているかもしれません。' }));
  },
}));

interface RemoteAssign {
  tray: string;
  at: number;
}

/** `key` names the board within the team, `teamKey` its team-wide node: see boardKey() and teamKey() in session.ts. */
export function startTeamSync(teamId: string, uid: string, key: string, teamKey: string): () => void {
  const base = `room/boards/${teamId}/${key}`;
  const teamBase = `room/boards/${teamId}/${teamKey}`;
  const at = (path: string) => ref(db, `${base}/${path}`);
  let remoteAssign: Record<string, RemoteAssign> = {};
  let remoteLabels: Record<string, string> = {};
  /** True while a change coming from the team is being put into the store (so it isn't sent back). */
  let fromRemote = false;
  /** Blocks flying on this screen to replay a teammate's move. */
  const replaying = new Set<string>();
  /** Blocks this player has claimed (held or thrown). */
  const claimed = new Set<string>();
  /** This player's moves that the database hasn't confirmed yet (block → tray): not to be undone by older news. */
  const unconfirmed = new Map<string, string | null>();
  const labelEditedAt = new Map<string, number>();
  const labelTimers = new Map<string, number>();
  // The team's texts (final comment, purpose): typed by anyone, the last one to stop typing wins.
  const texts = {
    comment: { remote: '', editedAt: 0, timer: 0 },
    purpose: { remote: '', editedAt: 0, timer: 0 },
  };
  type TextField = keyof typeof texts;
  let stopped = false;

  function applyText(field: TextField) {
    const t = texts[field];
    if (useTeamBoard.getState()[field] === t.remote) return;
    const quietUntil = t.editedAt + LABEL_QUIET_MS;
    const now = Date.now();
    if (now < quietUntil) {
      window.setTimeout(() => !stopped && applyText(field), quietUntil - now + 20);
      return;
    }
    useTeamBoard.setState({ [field]: t.remote });
  }
  useTeamBoard.setState({ comment: '', purpose: '', error: '', ...(teamBase === lastTeamBase ? {} : { submitted: null, primary: 1 }) });
  lastTeamBase = teamBase;
  active = {
    base,
    teamBase,
    statusPath: `room/status/${teamId}/${teamKey}`,
    uid,
    // This player typed in the box: send it once the typing pauses.
    touch: (field) => {
      const t = texts[field];
      t.editedAt = Date.now();
      window.clearTimeout(t.timer);
      t.timer = window.setTimeout(() => {
        const text = useTeamBoard.getState()[field];
        if (!stopped && text !== t.remote) void set(at(field), text).catch(() => undefined);
      }, LABEL_SEND_MS);
    },
  };

  const wanted = (itemId: string) => remoteAssign[itemId]?.tray ?? null;
  const busyHere = (itemId: string) => {
    const rt = blocks.get(itemId);
    return !!rt && (rt.phase === 'held' || (rt.phase === 'flying' && !rt.flight?.remote));
  };

  /** Bring the local board in line with the team's. */
  function applyAssign() {
    const game = useGame.getState();
    const assign = { ...game.assign };
    const assignedAt = { ...game.assignedAt };
    let changed = false;
    for (const item of game.items) {
      const want = wanted(item.id);
      const stamp = remoteAssign[item.id]?.at;
      if (want && typeof stamp === 'number' && assignedAt[item.id] !== stamp && (assign[item.id] ?? null) === want) {
        assignedAt[item.id] = stamp;
        changed = true;
      }
      if (unconfirmed.has(item.id)) {
        if (unconfirmed.get(item.id) !== want) continue;
        unconfirmed.delete(item.id);
      }
      if ((assign[item.id] ?? null) === want || busyHere(item.id) || replaying.has(item.id)) continue;
      if (want && game.trays.some((t) => t.id === want) && remoteSend(item.id, want)) {
        replaying.add(item.id); // lands through moveItem, see the store subscription below
        continue;
      }
      assign[item.id] = want;
      if (want && typeof stamp === 'number') assignedAt[item.id] = stamp;
      changed = true;
    }
    if (!changed) return;
    fromRemote = true;
    useGame.setState({ assign, assignedAt });
    fromRemote = false;
  }

  function applyLabels() {
    const game = useGame.getState();
    const now = Date.now();
    let trays = game.trays;
    for (const tray of game.trays) {
      const want = remoteLabels[tray.id] ?? '';
      if (tray.label === want) continue;
      const quietUntil = (labelEditedAt.get(tray.id) ?? 0) + LABEL_QUIET_MS;
      if (now < quietUntil) {
        // Typing here: look again once the typing has paused (by then our own text has been sent).
        window.setTimeout(() => !stopped && applyLabels(), quietUntil - now + 20);
        continue;
      }
      trays = trays.map((t) => (t.id === tray.id ? { ...t, label: want } : t));
    }
    if (trays === game.trays) return;
    fromRemote = true;
    useGame.setState({ trays });
    fromRemote = false;
  }

  const offs = [
    onValue(at('assign'), (snap) => {
      remoteAssign = (snap.val() ?? {}) as Record<string, RemoteAssign>;
      applyAssign();
    }),
    onValue(at('labels'), (snap) => {
      remoteLabels = (snap.val() ?? {}) as Record<string, string>;
      applyLabels();
    }),
    ...(['comment', 'purpose'] as const).map((field) =>
      onValue(at(field), (snap) => {
        texts[field].remote = typeof snap.val() === 'string' ? (snap.val() as string) : '';
        applyText(field);
      }),
    ),
    onValue(ref(db, `${teamBase}/primary`), (snap) => {
      const v = Number(snap.val());
      useTeamBoard.setState({ primary: v >= 1 && v <= 3 ? v : 1 });
    }),
    onValue(ref(db, `${teamBase}/submitted`), (snap) => {
      const v = snap.val() as Submitted | null;
      useTeamBoard.setState({ submitted: v && typeof v.by === 'string' ? { by: v.by, at: typeof v.at === 'number' ? v.at : Date.now() } : null });
    }),
    onValue(at('holds'), (snap) => {
      const holds = (snap.val() ?? {}) as Record<string, string>;
      remoteHolds.clear();
      for (const [itemId, holder] of Object.entries(holds)) {
        if (holder === uid) continue;
        remoteHolds.set(itemId, holder);
        // Both reached for it: the database kept the teammate's hold.
        if (busyHere(itemId)) {
          claimed.delete(itemId);
          yieldBlock(itemId);
        }
      }
    }),
    onValue(at('cursors'), (snap) => {
      const cursors = (snap.val() ?? {}) as Record<string, { x: number; y: number; h?: string }>;
      remoteCursors.clear();
      for (const [who, c] of Object.entries(cursors)) {
        if (who !== uid && typeof c?.x === 'number' && typeof c?.y === 'number') remoteCursors.set(who, { x: c.x, y: c.y, held: c.h ?? null });
      }
    }),
  ];

  // Local changes → the team.
  const unsubscribe = useGame.subscribe((s, prev) => {
    if (fromRemote || stopped) return;
    if (s.assign !== prev.assign) {
      const writes: Record<string, unknown> = {};
      for (const item of s.items) {
        const now = s.assign[item.id] ?? null;
        if (now === (prev.assign[item.id] ?? null)) continue;
        if (replaying.delete(item.id)) continue; // a teammate's move has landed here
        if (now === wanted(item.id)) continue;
        writes[`assign/${item.id}`] = now ? { tray: now, at: serverTimestamp() } : null;
        writes[`holds/${item.id}`] = null;
        claimed.delete(item.id);
        unconfirmed.set(item.id, now);
      }
      const sent = Object.keys(writes).filter((k) => k.startsWith('assign/')).map((k) => k.slice(7));
      if (sent.length) {
        update(ref(db, base), writes).catch(() => {
          // Refused (a teammate holds the block, or the round is over): show the team's board again.
          sent.forEach((id) => unconfirmed.delete(id));
          if (!stopped) applyAssign();
        });
      }
      // A replayed move may have been overtaken by a newer one while it was in the air.
      applyAssign();
    }
    if (s.trays !== prev.trays) {
      for (const tray of s.trays) {
        const before = prev.trays.find((t) => t.id === tray.id);
        if (!before || before.label === tray.label) continue;
        labelEditedAt.set(tray.id, Date.now());
        window.clearTimeout(labelTimers.get(tray.id));
        labelTimers.set(
          tray.id,
          window.setTimeout(() => {
            const label = useGame.getState().trays.find((t) => t.id === tray.id)?.label ?? '';
            if (!stopped && label !== (remoteLabels[tray.id] ?? '')) void set(at(`labels/${tray.id}`), label).catch(() => undefined);
          }, LABEL_SEND_MS),
        );
      }
    }
  });

  // This player's pointer over the stage.
  const track = (ev: PointerEvent) => {
    const rect = dom.stage?.getBoundingClientRect();
    myPointer.x = ev.clientX;
    myPointer.y = ev.clientY;
    myPointer.inside = !!rect && ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
    myPointer.movedAt = Date.now();
  };
  const leave = () => {
    myPointer.inside = false;
  };
  window.addEventListener('pointermove', track);
  window.addEventListener('pointerdown', track);
  // A lifted finger is no longer pointing anywhere (a mouse stays where it is).
  const lift = (ev: PointerEvent) => {
    if (ev.pointerType !== 'mouse') leave();
  };
  window.addEventListener('pointerup', lift);
  window.addEventListener('pointercancel', leave);
  document.addEventListener('pointerleave', leave);

  const myCursor = at(`cursors/${uid}`);
  void onDisconnect(myCursor).remove().catch(() => undefined);
  let sentCursor = '';

  const tick = window.setInterval(() => {
    // Claim the blocks this player is holding or throwing; release the ones that are done.
    const game = useGame.getState();
    for (const item of game.items) {
      const busy = busyHere(item.id);
      if (busy && !claimed.has(item.id)) {
        if (remoteHolds.has(item.id)) {
          yieldBlock(item.id);
          continue;
        }
        claimed.add(item.id);
        const hold = at(`holds/${item.id}`);
        void onDisconnect(hold).remove().catch(() => undefined);
        set(hold, uid).catch(() => {
          claimed.delete(item.id);
          if (busyHere(item.id)) yieldBlock(item.id);
        });
      } else if (!busy && claimed.has(item.id)) {
        claimed.delete(item.id);
        const hold = at(`holds/${item.id}`);
        void remove(hold).catch(() => undefined);
        void onDisconnect(hold).cancel().catch(() => undefined);
      }
    }

    // Pointer: sent only while it moves over the stage.
    const rect = dom.stage?.getBoundingClientRect();
    const show = !!rect && myPointer.inside && Date.now() - myPointer.movedAt < CURSOR_IDLE_MS;
    let next = '';
    if (show && rect) {
      const x = Math.round(((myPointer.x - rect.left) / Math.max(1, rect.width)) * 1000) / 1000;
      const y = Math.round(((myPointer.y - rect.top) / Math.max(1, rect.height)) * 1000) / 1000;
      const held = drag.active && drag.id ? drag.id : null;
      next = JSON.stringify(held ? { x, y, h: held } : { x, y });
    }
    if (next !== sentCursor) {
      sentCursor = next;
      void (next ? set(myCursor, JSON.parse(next)) : remove(myCursor)).catch(() => undefined);
    }
  }, TICK_MS);

  return () => {
    stopped = true;
    active = null;
    window.clearTimeout(texts.comment.timer);
    window.clearTimeout(texts.purpose.timer);
    useTeamBoard.setState({ comment: '', purpose: '', error: '' });
    offs.forEach((off) => off());
    unsubscribe();
    window.clearInterval(tick);
    labelTimers.forEach((id) => window.clearTimeout(id));
    window.removeEventListener('pointermove', track);
    window.removeEventListener('pointerdown', track);
    window.removeEventListener('pointerup', lift);
    window.removeEventListener('pointercancel', leave);
    document.removeEventListener('pointerleave', leave);
    void remove(myCursor).catch(() => undefined);
    void onDisconnect(myCursor).cancel().catch(() => undefined);
    for (const itemId of claimed) void remove(at(`holds/${itemId}`)).catch(() => undefined);
    remoteHolds.clear();
    remoteCursors.clear();
  };
}
