// Who is signed in, and the room they are in: its settings, its members and their teams.
// There is one room. It holds up to 30 participants; each one owns a numbered seat (0..29),
// and the database rules refuse a 31st.
import { ROOM } from './edition';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { get, onDisconnect, onValue, ref, serverTimestamp, set, update } from 'firebase/database';
import { create } from 'zustand';
import { PROBLEMS } from '../data/problems';
import { ADMIN_EMAIL, auth, db } from './firebase';

export const MAX_MEMBERS = 30;
export const NAME_MAX = 20;

/** A nickname the person chose themselves: not empty, and not just "ゲスト". */
export function validName(name: string): boolean {
  const n = name.trim();
  return n.length > 0 && n !== 'ゲスト';
}

export interface Member {
  name: string;
  avatar: number;
  seat: number;
  team?: string;
  guest?: boolean;
  online?: boolean;
  joinedAt?: number;
}

export interface RoomConfig {
  teamCount: number;
  teamSize: number;
  /** Team names set by the admin, by team id. Missing ones fall back to Aチーム, Bチーム… */
  teamNames?: Record<string, string>;
  /** Which set of blocks and boxes the next round deals (an id from BLOCK_SETS). */
  blockSet: string;
  /** The next round's problem: 'random', or a problem id. */
  problem: string;
  /** Points (correct answers + hearts) are counted and shown. */
  points: boolean;
  /** Teams are ranked by points (only when points are on). */
  ranking: boolean;
  /** Purposes a team may stock in the second half. */
  slots: number;
  /**
   * Self mode: a participant may become the host and run the game without the game master
   * (start, reveal, second half, score). Off unless the game master allows it.
   */
  selfMode: boolean;
}

/** Blocks, boxes and how many each box takes. Problems hold 5 groups of 6 words, which bounds these. */
export const BLOCK_SETS = [
  { id: '9-3', blocks: 9, trays: 3, each: 3 },
  { id: '12-3', blocks: 12, trays: 3, each: 4 },
  { id: '12-4', blocks: 12, trays: 4, each: 3 },
  { id: '16-4', blocks: 16, trays: 4, each: 4 },
  { id: '15-5', blocks: 15, trays: 5, each: 3 },
  { id: '20-5', blocks: 20, trays: 5, each: 4 },
] as const;

export function blockSetOf(id: string) {
  return BLOCK_SETS.find((b) => b.id === id) ?? BLOCK_SETS[0];
}

export const MAX_TEAMS = 10;
export const MAX_TEAM_SIZE = 10;

export const DEFAULT_CONFIG: RoomConfig = { teamCount: 5, teamSize: 4, blockSet: '9-3', problem: 'random', points: true, ranking: true, slots: 1, selfMode: false };

/** Problems the game master can deal: the ones written for the team game (they can be sorted for several purposes). */
export function dealableProblems() {
  return PROBLEMS.filter((p) => p.team && p.groups.length >= 5 && p.groups.every((g) => g.items.length >= 4));
}

export interface Team {
  id: string;
  name: string;
}

export function teamsOf(config: RoomConfig): Team[] {
  return Array.from({ length: config.teamCount }, (_, i) => {
    const id = `t${i + 1}`;
    return { id, name: config.teamNames?.[id] || `${String.fromCharCode(65 + i)}チーム` };
  });
}

/**
 * lobby: picking teams.
 * fixed: the first half (a set purpose, with a model answer).
 * fixedReveal: the game master is showing every team's answer to the first half.
 * free: the second half (each team sets its own purpose and sorts the same blocks again; nothing is right or wrong).
 * freeReveal: every team's answer to the second half is on screen, and everyone gives one heart.
 * score: the hearts are counted and, when points are on, each team's total is shown.
 */
export type Phase = 'lobby' | 'fixed' | 'fixedReveal' | 'free' | 'freeReveal' | 'score';
const PHASES: Phase[] = ['lobby', 'fixed', 'fixedReveal', 'free', 'freeReveal', 'score'];

/** Teams are sorting. */
export const isPlaying = (phase: Phase) => phase === 'fixed' || phase === 'free';
/** Everyone is looking at the shared results screen. */
export const isResults = (phase: Phase) => phase === 'fixedReveal' || phase === 'freeReveal' || phase === 'score';
/** The second half, and everything after it. */
export const isFreeHalf = (phase: Phase) => phase === 'free' || phase === 'freeReveal' || phase === 'score';

export const MAX_SLOTS = 3;

/**
 * Where a round's boards live under room/boards/{team}/. The first half has one board (r3). In the
 * second half a team may stock several purposes, each with a board of its own (r3f1, r3f2, r3f3).
 */
export function boardKey(round: number, free: boolean, slot = 1): string {
  return free ? `r${round}f${slot}` : `r${round}`;
}

/**
 * Where the team-wide facts of a half live: whether the team has handed in, and (second half) which
 * purpose is its first choice. The first half keeps them on its one board (r3); the second half on r3f.
 * room/status/{team}/ uses the same key.
 */
export function teamKey(round: number, free: boolean): string {
  return free ? `r${round}f` : `r${round}`;
}

/** What the results screen shows right now; set by the game master, the same for everybody. */
export interface RevealView {
  /** The model's labels and where the wrong blocks belong. */
  showModel: boolean;
  /** Team id being pointed at, or ''. */
  focus: string;
}

/** The game master's message to everyone ("マスターの声"). */
export interface Announcement {
  text: string;
  at: number;
}

/** What the game master dealt for this round: every device builds the same board from it. */
export interface Round {
  round: number;
  problemId: string;
  seed: number;
  /** Blocks per reference group: [3, 3, 3] = 9 blocks into 3 boxes. */
  sizes: number[];
  /** Each box shows how many blocks it takes, and refuses more. */
  caps?: boolean;
}

interface SessionState {
  /** undefined until Firebase has answered whether someone is signed in. */
  user: User | null | undefined;
  isAdmin: boolean;
  /** Self mode: uid of the participant who is running the game ('' = nobody). */
  host: string;
  /** Teams that have handed in, by team id then board key (see boardKey). Everyone can read this; not the answers. */
  status: Record<string, Record<string, boolean>>;
  /** Self mode: take the host's seat (when it is free, or the host has dropped out), or give it up. */
  claimHost: () => Promise<void>;
  releaseHost: () => Promise<void>;
  /** False until the first copy of the room has arrived. */
  loaded: boolean;
  config: RoomConfig;
  phase: Phase;
  round: Round | null;
  reveal: RevealView;
  announcement: Announcement | null;
  /** Server clock minus this device's clock (ms): devices in a classroom don't all agree on the time. */
  clockOffset: number;
  members: Record<string, Member>;
  /** Shown once on the entry screen (e.g. after being removed by the admin). */
  notice: string;
  error: string;
  busy: boolean;
  signInGoogle: () => Promise<void>;
  signInGuest: () => Promise<void>;
  signOut: () => Promise<void>;
  join: (name: string, avatar: number) => Promise<void>;
  saveProfile: (name: string, avatar: number) => Promise<void>;
  chooseTeam: (teamId: string) => Promise<void>;
  leave: () => Promise<void>;
  clearRoom: () => Promise<void>;
  /** Admin: deal a new round to every team (as set in the config) and clear the last round's boards and memos. */
  startGame: () => Promise<void>;
  /** Admin: show every team's answer (all teams must have handed in). */
  showResults: () => Promise<void>;
  /** Admin: start the second half (same blocks, each team's own purpose). */
  startFree: () => Promise<void>;
  /** Admin: close the voting and show the hearts (and the points, when those are on). */
  showScore: () => Promise<void>;
  /** Admin: change what the results screen shows. */
  setReveal: (patch: Partial<RevealView>) => Promise<void>;
  saveConfig: (patch: Partial<RoomConfig>) => Promise<void>;
  /** Admin: pop a message up on everyone's screen. */
  announce: (text: string) => Promise<void>;
  /** Admin: put a member in a team (or '' for none), or remove them from the room. */
  moveMember: (uid: string, teamId: string) => Promise<void>;
  kick: (uid: string) => Promise<void>;
  /** Admin: back to the lobby. */
  endGame: () => Promise<void>;
  clearMessages: () => void;
}

function message(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/popup-blocked') return 'ログインの画面が開けませんでした。ポップアップを許可して、もう一度押してください。';
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found' || code === 'auth/admin-restricted-operation') return 'このログイン方法は、まだ有効になっていません。';
  if (code === 'auth/unauthorized-domain') return `このアドレス（${location.hostname}）は、まだ Google ログインが許可されていません。管理者が Firebase の「承認済みドメイン」に追加すると使えます。それまでは「ゲストで入る」をお使いください。`;
  if (code === 'auth/network-request-failed') return 'ネットワークにつながりません。接続を確かめてください。';
  if (code === 'name-required') return 'ニックネームを入力してください。';
  if (code === 'team-full') return 'このチームは満員です。ほかのチームを選んでください。';
  if (code === 'PERMISSION_DENIED' || /permission_denied/i.test(String((err as Error)?.message))) return '操作が許可されませんでした。';
  // The code tells us what went wrong when someone reports this message.
  return `うまくいきませんでした。もう一度お試しください。${code ? `（${code}）` : ''}`;
}

export const useSession = create<SessionState>()((set_, get_) => {
  let stopRoom: (() => void) | null = null;
  /** True once this browser has seen its own member record, so its disappearance means "removed". */
  let wasMember = false;

  const run = async (work: () => Promise<void>) => {
    set_({ busy: true, error: '' });
    try {
      await work();
    } catch (err) {
      set_({ error: message(err) });
    } finally {
      set_({ busy: false });
    }
  };

  /** Presence: online while connected; the server marks the member offline when the connection drops. */
  function goOnline(uid: string) {
    const online = ref(db, `${ROOM}/members/${uid}/online`);
    void onDisconnect(online)
      .set(false)
      .then(() => set(online, true))
      .catch(() => undefined);
  }

  function watchRoom(user: User) {
    const offs = [
      onValue(ref(db, `${ROOM}/config`), (snap) => set_({ config: { ...DEFAULT_CONFIG, ...(snap.val() ?? {}) } })),
      onValue(ref(db, `${ROOM}/state`), (snap) => {
        const v = (snap.val() ?? {}) as Partial<Round> & { phase?: Phase; showModel?: boolean; focus?: string };
        const ok = typeof v.round === 'number' && typeof v.problemId === 'string' && typeof v.seed === 'number' && Array.isArray(v.sizes);
        set_({
          phase: ok && v.phase && PHASES.includes(v.phase) ? v.phase : 'lobby',
          round: ok ? { round: v.round!, problemId: v.problemId!, seed: v.seed!, sizes: v.sizes!, caps: v.caps === true } : null,
          reveal: { showModel: v.showModel === true, focus: typeof v.focus === 'string' ? v.focus : '' },
        });
      }),
      onValue(ref(db, '.info/serverTimeOffset'), (snap) => set_({ clockOffset: Number(snap.val()) || 0 })),
      onValue(ref(db, `${ROOM}/host`), (snap) => set_({ host: typeof snap.val() === 'string' ? (snap.val() as string) : '' })),
      onValue(ref(db, `${ROOM}/status`), (snap) => set_({ status: (snap.val() ?? {}) as Record<string, Record<string, boolean>> })),
      onValue(ref(db, `${ROOM}/announce`), (snap) => {
        const v = snap.val() as Announcement | null;
        set_({ announcement: v && typeof v.text === 'string' && typeof v.at === 'number' ? v : null });
      }),
      onValue(
        ref(db, `${ROOM}/members`),
        (snap) => {
          const members = (snap.val() ?? {}) as Record<string, Member>;
          const mine = !!members[user.uid];
          if (wasMember && !mine) set_({ notice: '部屋から退室しました。' });
          if (mine && !wasMember) goOnline(user.uid);
          wasMember = mine;
          set_({ members, loaded: true });
        },
        () => set_({ loaded: true, error: '部屋の情報を読み込めませんでした。' }),
      ),
      onValue(ref(db, `admins/${user.uid}`), (snap) => {
        if (snap.val() === true) set_({ isAdmin: true });
      }),
      // After a dropped connection comes back, the server has already marked this member offline.
      onValue(ref(db, '.info/connected'), (snap) => {
        if (snap.val() === true && get_().members[user.uid]) goOnline(user.uid);
      }),
    ];
    return () => offs.forEach((off) => off());
  }

  onAuthStateChanged(auth, (user) => {
    stopRoom?.();
    stopRoom = null;
    wasMember = false;
    set_({ user, isAdmin: !!user && user.email === ADMIN_EMAIL && user.emailVerified, loaded: false, host: '', status: {}, members: {}, phase: 'lobby', round: null, reveal: { showModel: false, focus: '' }, announcement: null });
    if (user) stopRoom = watchRoom(user);
  });

  async function writeMember(user: User, name: string, avatar: number) {
    const uid = user.uid;
    const existing = get_().members[uid];
    if (!validName(name)) throw Object.assign(new Error('name'), { code: 'name-required' });
    const profile = { name: name.trim().slice(0, NAME_MAX), avatar };
    if (existing) {
      await update(ref(db, `${ROOM}/members/${uid}`), profile);
      return;
    }
    // Take the first free seat. If someone else takes it at the same moment the write is refused: try the next.
    const seats = ((await get(ref(db, `${ROOM}/seats`))).val() ?? {}) as Record<string, string>;
    const free = Array.from({ length: MAX_MEMBERS }, (_, i) => i).filter((i) => !seats[i]);
    if (!free.length) throw Object.assign(new Error('full'), { full: true });
    let lastError: unknown;
    for (const seat of free.slice(0, 5)) {
      try {
        await update(ref(db, ROOM), {
          [`seats/${seat}`]: uid,
          [`members/${uid}`]: { ...profile, seat, guest: user.isAnonymous, online: true, joinedAt: serverTimestamp() },
        });
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  return {
    user: undefined,
    isAdmin: false,
    host: '',
    status: {},
    claimHost: () =>
      run(async () => {
        const user = get_().user;
        if (user) await set(ref(db, `${ROOM}/host`), user.uid);
      }),
    releaseHost: () => run(async () => set(ref(db, `${ROOM}/host`), null)),
    loaded: false,
    config: DEFAULT_CONFIG,
    phase: 'lobby',
    round: null,
    reveal: { showModel: false, focus: '' },
    announcement: null,
    clockOffset: 0,
    members: {},
    notice: '',
    error: '',
    busy: false,
    signInGoogle: () => run(async () => void (await signInWithPopup(auth, new GoogleAuthProvider()))),
    signInGuest: () => run(async () => void (await signInAnonymously(auth))),
    signOut: () =>
      run(async () => {
        await get_().leave();
        await fbSignOut(auth);
      }),
    join: async (name, avatar) => {
      const user = get_().user;
      if (!user) return;
      set_({ busy: true, error: '', notice: '' });
      try {
        await writeMember(user, name, avatar);
      } catch (err) {
        set_({
          error: (err as { full?: boolean })?.full ? `満員です（${MAX_MEMBERS}人）。空きが出るまでお待ちください。` : message(err),
        });
      } finally {
        set_({ busy: false });
      }
    },
    saveProfile: (name, avatar) =>
      run(async () => {
        const user = get_().user;
        if (user) await writeMember(user, name, avatar);
      }),
    chooseTeam: (teamId) =>
      run(async () => {
        const { user, members, config } = get_();
        if (!user || !members[user.uid]) return;
        const count = Object.entries(members).filter(([uid, m]) => m.team === teamId && uid !== user.uid).length;
        if (count >= config.teamSize) throw Object.assign(new Error('team full'), { code: 'team-full' });
        await set(ref(db, `${ROOM}/members/${user.uid}/team`), teamId);
      }),
    leave: async () => {
      const { user, members } = get_();
      const me = user && members[user.uid];
      if (!user || !me) return;
      wasMember = false;
      await onDisconnect(ref(db, `${ROOM}/members/${user.uid}/online`)).cancel().catch(() => undefined);
      // A host who leaves gives the seat up, so someone else can carry on.
      if (get_().host === user.uid) await set(ref(db, `${ROOM}/host`), null).catch(() => undefined);
      await update(ref(db, ROOM), { [`seats/${me.seat}`]: null, [`members/${user.uid}`]: null }).catch(() => undefined);
    },
    clearRoom: () => run(async () => update(ref(db, ROOM), { seats: null, members: null, host: null })),
    startGame: () =>
      run(async () => {
        const { config, round: last } = get_();
        const set = blockSetOf(config.blockSet);
        const sizes = Array.from({ length: set.trays }, () => set.each);
        const fits = dealableProblems();
        const chosen = fits.find((p) => p.id === config.problem);
        const pool = fits.filter((p) => p.id !== last?.problemId);
        const problem = chosen ?? (pool.length ? pool : fits)[Math.floor(Math.random() * (pool.length || fits.length))];
        await update(ref(db, ROOM), {
          state: { phase: 'fixed', round: (last?.round ?? 0) + 1, problemId: problem.id, seed: Math.floor(Math.random() * 2 ** 31), sizes, caps: true },
          boards: null,
          chats: null,
          votes: null,
          status: null,
        });
      }),
    showResults: () => run(async () => update(ref(db, `${ROOM}/state`), { phase: get_().phase === 'free' ? 'freeReveal' : 'fixedReveal', showModel: false, focus: '' })),
    startFree: () => run(async () => update(ref(db, `${ROOM}/state`), { phase: 'free', showModel: false, focus: '' })),
    showScore: () => run(async () => update(ref(db, `${ROOM}/state`), { phase: 'score', focus: '' })),
    setReveal: (patch) => run(async () => update(ref(db, `${ROOM}/state`), patch)),
    saveConfig: (patch) => run(async () => update(ref(db, `${ROOM}/config`), patch)),
    announce: (text) =>
      run(async () => {
        const body = text.trim().slice(0, 200);
        if (body) await set(ref(db, `${ROOM}/announce`), { text: body, at: serverTimestamp() });
      }),
    moveMember: (uid, teamId) => run(async () => set(ref(db, `${ROOM}/members/${uid}/team`), teamId || null)),
    kick: (uid) =>
      run(async () => {
        const seat = get_().members[uid]?.seat;
        await update(ref(db, ROOM), { [`members/${uid}`]: null, ...(seat === undefined ? {} : { [`seats/${seat}`]: null }) });
      }),
    endGame: () => run(async () => set(ref(db, `${ROOM}/state/phase`), 'lobby')),
    clearMessages: () => set_({ notice: '', error: '' }),
  };
});

/** The person running the game right now: the game master, or (self mode) the host. */
export function useCanRun(): boolean {
  return useSession((s) => s.isAdmin || (s.config.selfMode && !!s.user && s.host === s.user.uid));
}

/** Teams with someone in them, and which of those have handed in for the current phase. */
export function useHandIns(): { active: Team[]; waiting: Team[]; allIn: boolean } {
  const config = useSession((s) => s.config);
  const members = useSession((s) => s.members);
  const status = useSession((s) => s.status);
  const round = useSession((s) => s.round);
  const phase = useSession((s) => s.phase);
  const key = round ? teamKey(round.round, phase === 'free') : '';
  const active = teamsOf(config).filter((t) => Object.values(members).some((m) => m.team === t.id));
  const waiting = active.filter((t) => !status[t.id]?.[key]);
  return { active, waiting, allIn: isPlaying(phase) && active.length > 0 && waiting.length === 0 };
}
