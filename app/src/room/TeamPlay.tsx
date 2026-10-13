// Team play on the shared board: the header, teammates' avatar cursors, and the team's chat memo.
import { limitToLast, onValue, push, query, ref, remove, serverTimestamp, set } from 'firebase/database';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { PROBLEMS } from '../data/problems';
import { sendTo, yieldBlock } from '../game/input';
import { dom, drag } from '../game/runtime';
import { TRASH_ID, TRASH_MAX, useGame } from '../state/store';
import { Icon } from '../ui/Header';
import { avatarThumb } from './avatars';
import { db } from './firebase';
import { boardKey, isPlaying, teamsOf, useSession } from './session';
import { COMMENT_MAX, CURSOR_IDLE_MS, myPointer, PURPOSE_MAX, startTeamSync, useTeamBoard } from './teamSync';

const CHAT_MAX = 500;
const CHAT_KEEP = 100;
const SOUND = 'M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14';
const MUTE = 'M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6';
const MEMO = 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z';

interface ChatMessage {
  id: string;
  uid: string;
  name: string;
  avatar: number;
  text: string;
  at: number;
}

const useTeamUi = create<{ chatOpen: boolean; messages: ChatMessage[]; seenAt: number; setChatOpen(open: boolean): void }>()((set_, get_) => ({
  chatOpen: false,
  messages: [],
  seenAt: 0,
  setChatOpen: (chatOpen) => set_({ chatOpen, seenAt: Math.max(get_().seenAt, ...get_().messages.map((m) => m.at), 0) }),
}));

function useMe() {
  const user = useSession((s) => s.user);
  const members = useSession((s) => s.members);
  const me = user ? members[user.uid] : undefined;
  return { uid: user?.uid ?? '', me, members };
}

/** Deals the round's board and keeps it in step with the team for as long as it is on screen. */
export function TeamSession() {
  const { uid, me } = useMe();
  const round = useSession((s) => s.round);
  const teamId = me?.team;
  // The second half deals the same blocks onto a board of its own.
  const free = useSession((s) => s.phase === 'free');
  const key = round ? `${round.round}|${round.problemId}|${round.seed}|${round.sizes.join(',')}|${free}` : '';
  useLayoutEffect(() => {
    if (!round || !teamId || !uid) return;
    if (!useGame.getState().loadTeamBoard(round, free)) return;
    const stopSync = startTeamSync(teamId, uid, boardKey(round.round, free));
    // The memo is the team's own: nobody else (not even the game master) can read it.
    const stopChat = onValue(query(ref(db, `room/chats/${teamId}`), limitToLast(CHAT_KEEP)), (snap) => {
      const messages: ChatMessage[] = [];
      snap.forEach((child) => {
        const v = child.val() as Omit<ChatMessage, 'id'>;
        if (v && typeof v.text === 'string') messages.push({ ...v, id: child.key!, at: typeof v.at === 'number' ? v.at : Date.now() });
      });
      const ui = useTeamUi.getState();
      useTeamUi.setState({ messages, seenAt: ui.chatOpen ? Math.max(ui.seenAt, ...messages.map((m) => m.at), 0) : ui.seenAt });
    });
    return () => {
      stopSync();
      stopChat();
      useTeamUi.setState({ messages: [], seenAt: 0, chatOpen: false });
    };
    // `key` stands for the round's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, teamId, uid]);

  // Handed in, or the results are out: nobody on the team can move or rename anything.
  const submitted = useTeamBoard((s) => !!s.submitted);
  const phase = useSession((s) => s.phase);
  const locked = submitted || !isPlaying(phase);
  useEffect(() => {
    if (locked && drag.active && drag.id) yieldBlock(drag.id);
    useGame.getState().setLocked(locked);
  }, [locked]);
  return null;
}

function Face({ n, className = '' }: { n: number; className?: string }) {
  return <img className={`avatar-face ${className}`} src={avatarThumb(n)} alt="" draggable={false} />;
}

export function TeamHeader() {
  const { uid, me, members } = useMe();
  const config = useSession((s) => s.config);
  const problemIndex = useGame((s) => s.problemIndex);
  const total = useGame((s) => s.items.length);
  const done = useGame((s) => s.items.reduce((n, item) => (s.assign[item.id] ? n + 1 : n), 0));
  const muted = useGame((s) => s.muted);
  const chatOpen = useTeamUi((s) => s.chatOpen);
  const unread = useTeamUi((s) => (s.chatOpen ? 0 : s.messages.filter((m) => m.at > s.seenAt && m.uid !== uid).length));
  const team = teamsOf(config).find((t) => t.id === me?.team);
  const mates = Object.entries(members).filter(([, m]) => m.team === me?.team);
  const measure = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const apply = () => document.documentElement.style.setProperty('--hud-real', `${el.offsetHeight}px`);
    apply();
    new ResizeObserver(apply).observe(el);
  }, []);
  return (
    <header className="hud team-hud" ref={measure}>
      <div className="hud-brand">
        <b className="team-brand">
          Mato <span>mate</span>
        </b>
        <span className="badge">{team?.name ?? 'チーム'}</span>
      </div>
      <ul className="team-faces" aria-label="チームのメンバー">
        {mates.map(([id, m]) => (
          <li key={id} className={m.online === false ? 'is-away' : undefined} title={`${m.name}${m.online === false ? '（切断中）' : ''}`}>
            <Face n={m.avatar} />
            <span className="sr-only">{m.name}</span>
          </li>
        ))}
      </ul>
      <span className="hud-title">{PROBLEMS[problemIndex]?.title}</span>
      <span className="team-progress num" aria-label={`${total}個中 ${done}個を箱に入れた`}>
        {done} / {total}
      </span>
      <span className="team-hud-space" />
      <button
        type="button"
        className="btn team-memo-btn"
        aria-expanded={chatOpen}
        onClick={() => useTeamUi.getState().setChatOpen(!chatOpen)}
      >
        <Icon d={MEMO} />
        メモ
        {unread > 0 && (
          <span className="team-unread num" aria-label={`未読 ${unread}件`}>
            {unread}
          </span>
        )}
      </button>
      <button
        type="button"
        className="btn-icon"
        aria-label={muted ? 'サウンドをオンにする' : 'サウンドをオフにする'}
        title={muted ? 'サウンドをオンにする' : 'サウンドをオフにする'}
        aria-pressed={muted}
        onClick={() => useGame.getState().toggleMute()}
      >
        <Icon d={muted ? MUTE : SOUND} />
      </button>
    </header>
  );
}

/**
 * The avatars themselves are 3D models inside the stage (TeamAvatars.tsx). This is only the small ring
 * that marks the exact spot this player is pointing at: the mouse pointer is hidden on the canvas.
 */
export function TeamCursors() {
  const ring = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const el = ring.current;
      const rect = dom.stage?.getBoundingClientRect();
      if (!el || !rect) return;
      const show = myPointer.inside && Date.now() - myPointer.movedAt < CURSOR_IDLE_MS;
      el.style.display = show ? '' : 'none';
      if (show) el.style.transform = `translate3d(${myPointer.x - rect.left}px, ${myPointer.y - rect.top}px, 0)`;
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="team-layer" aria-hidden="true">
      <div ref={ring} className="team-ring" />
    </div>
  );
}

function clock(at: number): string {
  const d = new Date(at);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** The team's memo: stays out of the way until opened; only this team can read it. */
export function TeamChat() {
  const { uid, me } = useMe();
  const open = useTeamUi((s) => s.chatOpen);
  const messages = useTeamUi((s) => s.messages);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const teamId = me?.team;

  useEffect(() => {
    if (open) list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [open, messages.length]);

  if (!open || !me || !teamId) return null;
  const text = draft.trim();
  const send = () => {
    if (!text) return;
    setError('');
    setDraft('');
    set(push(ref(db, `room/chats/${teamId}`)), { uid, name: me.name, avatar: me.avatar, text: text.slice(0, CHAT_MAX), at: serverTimestamp() }).catch(() => {
      setDraft(text);
      setError('送れませんでした。もう一度お試しください。');
    });
  };
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  return (
    <section className="team-chat" aria-label="チームのメモ">
      <header className="team-chat-head">
        <h2>チームのメモ</h2>
        <small>このチームだけが読めます</small>
        <button type="button" className="btn-mini" aria-label="メモを閉じる" onClick={() => useTeamUi.getState().setChatOpen(false)}>
          ×
        </button>
      </header>
      <ol className="team-chat-list" ref={list}>
        {messages.length === 0 && <li className="team-chat-empty">気づいたことや、分け方の理由を書き残せます。</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.uid === uid ? 'is-mine' : undefined}>
            <Face n={m.avatar} />
            <div className="team-chat-body">
              <p className="team-chat-meta">
                <b>{m.name}</b> <span className="num">{clock(m.at)}</span>
                {m.uid === uid && (
                  <button type="button" className="team-chat-delete" onClick={() => void remove(ref(db, `room/chats/${teamId}/${m.id}`)).catch(() => undefined)}>
                    消す
                  </button>
                )}
              </p>
              <p className="team-chat-text">{m.text}</p>
            </div>
          </li>
        ))}
      </ol>
      {error && (
        <p className="team-chat-error" role="alert">
          {error}
        </p>
      )}
      <form
        className="team-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={draft}
          rows={2}
          maxLength={CHAT_MAX}
          placeholder={coarse ? 'メモを書く' : 'メモを書く（Enter で送信、Shift+Enter で改行）'}
          aria-label="メモを書く"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Phones: Enter is a line break (there is a send button). IME: Enter confirms the conversion.
            if (e.key === 'Enter' && !e.shiftKey && !coarse && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={!text}>
          送る
        </button>
      </form>
    </section>
  );
}

/**
 * In the tray list: what is still missing, then the team's final comment and the hand-in button.
 * After handing in, the board is locked for the whole team; the comment can still be edited, and the
 * answer can be taken back until the game master shows the results.
 */
export function TeamSubmit({ checks }: { checks: { ok: boolean; text: string }[] }) {
  const members = useSession((s) => s.members);
  const phase = useSession((s) => s.phase);
  const comment = useTeamBoard((s) => s.comment);
  const submitted = useTeamBoard((s) => s.submitted);
  const error = useTeamBoard((s) => s.error);
  const { setComment, submit, takeBack } = useTeamBoard.getState();
  // Second half: the team must also have said what it is sorting for.
  const free = useGame((s) => s.free);
  const purpose = useTeamBoard((s) => s.purpose);
  if (free) checks = [{ ok: !!purpose.trim(), text: purpose.trim() ? '目的を決めた' : '目的を決める（いちばん上の欄）' }, ...checks];
  const ready = checks.every((c) => c.ok);
  const revealed = !isPlaying(phase);
  const commentBox = (
    <label className="team-comment">
      <span>
        最終コメント：なぜ、この分け方にしましたか？
        <small className="num">
          {comment.length}/{COMMENT_MAX}
        </small>
      </span>
      <textarea
        value={comment}
        rows={3}
        maxLength={COMMENT_MAX}
        readOnly={revealed}
        placeholder="例：使う場面ごとに分けた。迷ったのは〜で、〜と考えてここに入れた。"
        onChange={(e) => setComment(e.target.value)}
      />
    </label>
  );

  if (submitted || revealed) {
    return (
      <section className="submit is-done" aria-label="提出">
        <p className="submit-title">
          {revealed ? '結果発表中です' : `提出しました${members[submitted!.by] ? `（${members[submitted!.by].name}さん）` : ''}。結果発表をお待ちください`}
        </p>
        {commentBox}
        {!revealed && (
          <>
            <p className="team-submit-note">コメントは、結果発表まで書き直せます。分け方を直したいときは、提出を取り消してください。</p>
            <button type="button" className="btn" onClick={takeBack}>
              提出を取り消す
            </button>
          </>
        )}
        {error && (
          <p className="team-chat-error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className={`submit${ready ? ' is-ready' : ''}`} aria-label="提出">
      <ul className="submit-checks">
        {checks.map((c) => (
          <li key={c.text} className={c.ok ? 'ok' : undefined}>
            <span aria-hidden="true">{c.ok ? '✓' : '・'}</span> {c.text}
          </li>
        ))}
        {ready && (
          <li className={comment.trim() ? 'ok' : undefined}>
            <span aria-hidden="true">{comment.trim() ? '✓' : '・'}</span> {comment.trim() ? '最終コメントを書いた' : '最終コメントを書く'}
          </li>
        )}
      </ul>
      {ready && commentBox}
      <button type="button" className="btn btn-primary submit-button" disabled={!ready || !comment.trim()} onClick={submit}>
        チームの答えを提出する
      </button>
      {error && (
        <p className="team-chat-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/** Over the stage once the answer is handed in: the board stays visible underneath. */
export function TeamWaiting() {
  const submitted = useTeamBoard((s) => !!s.submitted);
  const phase = useSession((s) => s.phase);
  if (!isPlaying(phase) || !submitted) return null;
  return (
    <div className="team-waiting" role="status">
      <b>提出しました</b>
      <span>結果発表をお待ちください</span>
    </div>
  );
}

/** "マスターの声": the game master's message, popped up on every participant's screen. */
export function AnnouncementPopup() {
  const announcement = useSession((s) => s.announcement);
  const isAdmin = useSession((s) => s.isAdmin);
  const [closedAt, setClosedAt] = useState(0);
  const [shownAt, setShownAt] = useState(0);
  // Only messages sent while this page is open (or just before): an old one must not greet a late arrival.
  useEffect(() => {
    if (!announcement) return;
    const serverNow = Date.now() + useSession.getState().clockOffset;
    if (serverNow - announcement.at < 60_000) setShownAt(announcement.at);
  }, [announcement]);
  if (isAdmin || !announcement || announcement.at !== shownAt || closedAt === announcement.at) return null;
  return (
    <div className="announce" role="alertdialog" aria-modal="true" aria-label="マスターの声">
      <div className="announce-card">
        <p className="kicker">マスターの声</p>
        <p className="announce-text">{announcement.text}</p>
        <button type="button" className="btn btn-primary" autoFocus onClick={() => setClosedAt(announcement.at)}>
          閉じる
        </button>
      </div>
    </div>
  );
}

/**
 * Second half: the purpose the team sorts for, in the team's own words. Shared like the labels:
 * anyone on the team can type, and it can be changed until the answer is handed in.
 */
export function TeamPurpose() {
  const purpose = useTeamBoard((s) => s.purpose);
  const locked = useGame((s) => s.locked);
  const examples = useGame((s) => PROBLEMS[s.problemIndex]?.examples ?? []);
  const [showExamples, setShowExamples] = useState(false);
  return (
    <div className="team-purpose">
      <label className="team-comment">
        <span>
          目的：だれが・どんなとき・何のために？
          <small className="num">
            {purpose.length}/{PURPOSE_MAX}
          </small>
        </span>
        <textarea
          value={purpose}
          rows={2}
          maxLength={PURPOSE_MAX}
          readOnly={locked}
          placeholder="チームで決めた目的を書きましょう"
          onChange={(e) => useTeamBoard.getState().setPurpose(e.target.value)}
        />
      </label>
      {/* Examples stay hidden until asked for: the team should try to think of its own purpose first. */}
      {!locked && examples.length > 0 && (
        <>
          <button type="button" className="team-examples-toggle" aria-expanded={showExamples} onClick={() => setShowExamples(!showExamples)}>
            {showExamples ? '例をとじる' : '思いつかないときは、例を見る'}
          </button>
          {showExamples && (
            <ul className="team-examples">
              {examples.map((ex) => {
                const text = `${ex.user}が、${ex.scene}、${ex.goal}`;
                return (
                  <li key={text}>
                    <span>{text}</span>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        useTeamBoard.getState().setPurpose(text);
                        setShowExamples(false);
                      }}
                    >
                      これにする
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Second half, on the stage: where blocks are thrown away. Drop a block on it, or select a block and tap it.
 * What is inside is listed (and can be taken back) in the tray list.
 */
export function TeamTrash() {
  const free = useGame((s) => s.free);
  const count = useGame((s) => s.items.reduce((n, item) => (s.assign[item.id] === TRASH_ID ? n + 1 : n), 0));
  const isTarget = useGame((s) => s.dragTarget === TRASH_ID);
  const armed = useGame((s) => s.selected !== null);
  const locked = useGame((s) => s.locked);
  if (!free || locked) return null;
  const full = count >= TRASH_MAX;
  return (
    <button
      type="button"
      className={`team-trash${isTarget ? ' is-target' : ''}${armed && !full ? ' is-armed' : ''}${full ? ' is-full' : ''}`}
      data-tray-id={TRASH_ID}
      aria-label={`要らないブロックを捨てる（${count}／${TRASH_MAX}個）`}
      onClick={() => {
        const selected = useGame.getState().selected;
        if (selected) sendTo(selected, TRASH_ID);
      }}
    >
      <span aria-hidden="true">🗑️</span>
      <b className="num">
        {count}/{TRASH_MAX}
      </b>
      <small>{full ? 'いっぱい' : '捨てる'}</small>
    </button>
  );
}
