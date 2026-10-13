// Who is signed in, and the room they are in: its settings, its members and their teams.
// There is one room. It holds up to 30 participants; each one owns a numbered seat (0..29),
// and the database rules refuse a 31st.
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
import { ADMIN_EMAIL, auth, db } from './firebase';

export const MAX_MEMBERS = 30;
export const NAME_MAX = 20;

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
}

export const DEFAULT_CONFIG: RoomConfig = { teamCount: 5, teamSize: 4 };

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

export type Phase = 'lobby';

interface SessionState {
  /** undefined until Firebase has answered whether someone is signed in. */
  user: User | null | undefined;
  isAdmin: boolean;
  /** False until the first copy of the room has arrived. */
  loaded: boolean;
  config: RoomConfig;
  phase: Phase;
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
  clearMessages: () => void;
}

function message(err: unknown): string {
  const code = (err as { code?: string })?.code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/popup-blocked') return 'ログインの画面が開けませんでした。ポップアップを許可して、もう一度押してください。';
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found' || code === 'auth/admin-restricted-operation') return 'このログイン方法は、まだ有効になっていません。';
  if (code === 'auth/network-request-failed') return 'ネットワークにつながりません。接続を確かめてください。';
  if (code === 'team-full') return 'このチームは満員です。ほかのチームを選んでください。';
  if (code === 'PERMISSION_DENIED' || /permission_denied/i.test(String((err as Error)?.message))) return '操作が許可されませんでした。';
  return 'うまくいきませんでした。もう一度お試しください。';
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
    const online = ref(db, `room/members/${uid}/online`);
    void onDisconnect(online)
      .set(false)
      .then(() => set(online, true))
      .catch(() => undefined);
  }

  function watchRoom(user: User) {
    const offs = [
      onValue(ref(db, 'room/config'), (snap) => set_({ config: { ...DEFAULT_CONFIG, ...(snap.val() ?? {}) } })),
      onValue(ref(db, 'room/state/phase'), (snap) => set_({ phase: (snap.val() as Phase) ?? 'lobby' })),
      onValue(
        ref(db, 'room/members'),
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
    set_({ user, isAdmin: !!user && user.email === ADMIN_EMAIL && user.emailVerified, loaded: false, members: {}, phase: 'lobby' });
    if (user) stopRoom = watchRoom(user);
  });

  async function writeMember(user: User, name: string, avatar: number) {
    const uid = user.uid;
    const existing = get_().members[uid];
    const profile = { name: name.trim().slice(0, NAME_MAX) || 'ゲスト', avatar };
    if (existing) {
      await update(ref(db, `room/members/${uid}`), profile);
      return;
    }
    // Take the first free seat. If someone else takes it at the same moment the write is refused: try the next.
    const seats = ((await get(ref(db, 'room/seats'))).val() ?? {}) as Record<string, string>;
    const mine = Object.entries(seats).find(([, owner]) => owner === uid)?.[0];
    const free = mine !== undefined ? [Number(mine)] : Array.from({ length: MAX_MEMBERS }, (_, i) => i).filter((i) => !seats[i]);
    if (!free.length) throw Object.assign(new Error('full'), { full: true });
    let lastError: unknown;
    for (const seat of free.slice(0, 5)) {
      try {
        await update(ref(db, 'room'), {
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
    loaded: false,
    config: DEFAULT_CONFIG,
    phase: 'lobby',
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
        await set(ref(db, `room/members/${user.uid}/team`), teamId);
      }),
    leave: async () => {
      const { user, members } = get_();
      const me = user && members[user.uid];
      if (!user || !me) return;
      wasMember = false;
      await onDisconnect(ref(db, `room/members/${user.uid}/online`)).cancel().catch(() => undefined);
      await update(ref(db, 'room'), { [`seats/${me.seat}`]: null, [`members/${user.uid}`]: null }).catch(() => undefined);
    },
    clearRoom: () => run(async () => update(ref(db, 'room'), { seats: null, members: null })),
    clearMessages: () => set_({ notice: '', error: '' }),
  };
});
