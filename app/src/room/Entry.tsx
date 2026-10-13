// Before the game: sign in → nickname and avatar → pick a team and wait in the lobby.
import { lazy, Suspense, useEffect, useState } from 'react';
import { SafeBoundary } from '../ui/SafeBoundary';
import { Admin } from './Admin';
import { AVATAR_COUNT, avatarThumb, randomAvatar } from './avatars';
import { BLOCK_SETS, blockSetOf, dealableProblems, MAX_MEMBERS, NAME_MAX, teamsOf, useSession, validName, type Member } from './session';

const AvatarViewer = lazy(() => import('./AvatarViewer'));

function Messages() {
  const notice = useSession((s) => s.notice);
  const error = useSession((s) => s.error);
  return (
    <>
      {notice && <p className="entry-notice" role="status">{notice}</p>}
      {error && <p className="entry-error" role="alert">{error}</p>}
    </>
  );
}

function Brand() {
  return (
    <header className="entry-brand">
      <h1>
        Mato <span>mate</span>
      </h1>
      <p>チームで仕分けて、名前を付けよう</p>
    </header>
  );
}

function Login() {
  const busy = useSession((s) => s.busy);
  const signInGoogle = useSession((s) => s.signInGoogle);
  const signInGuest = useSession((s) => s.signInGuest);
  return (
    <div className="entry-card is-narrow">
      <Brand />
      <Messages />
      <button type="button" className="btn btn-primary entry-wide" disabled={busy} onClick={() => void signInGoogle()}>
        Google でログイン
      </button>
      <button type="button" className="btn entry-wide" disabled={busy} onClick={() => void signInGuest()}>
        ゲストで入る
      </button>
      <p className="entry-note">Google アカウントがないときは、ゲストで入れます。</p>
    </div>
  );
}

function AvatarFace({ n, className = '' }: { n: number; className?: string }) {
  return <img className={`avatar-face ${className}`} src={avatarThumb(n)} alt="" draggable={false} />;
}

/** Nickname and avatar. Used to enter the room, and later to change them from the lobby. */
function Profile({ current, onDone }: { current?: Member; onDone?: () => void }) {
  const user = useSession((s) => s.user);
  const busy = useSession((s) => s.busy);
  const join = useSession((s) => s.join);
  const saveProfile = useSession((s) => s.saveProfile);
  const signOut = useSession((s) => s.signOut);
  const [name, setName] = useState(current?.name ?? user?.displayName?.slice(0, NAME_MAX) ?? '');
  const [avatar, setAvatar] = useState(() => current?.avatar ?? randomAvatar());
  const submit = async () => {
    if (current) {
      await saveProfile(name, avatar);
      onDone?.();
    } else {
      await join(name, avatar);
    }
  };
  return (
    <form
      className="entry-card"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="entry-title">{current ? 'ニックネームとアバターを変える' : 'ニックネームとアバターを決めよう'}</h2>
      <Messages />
      <div className="profile">
        <div className="profile-stage">
          <SafeBoundary key={avatar} fallback={<AvatarFace n={avatar} className="is-big" />}>
            <Suspense fallback={<AvatarFace n={avatar} className="is-big" />}>
              <AvatarViewer n={avatar} className="profile-canvas" />
            </Suspense>
          </SafeBoundary>
        </div>
        <div className="profile-fields">
          <label className="entry-label" htmlFor="nickname">
            ニックネーム
          </label>
          <input
            id="nickname"
            className="entry-input"
            value={name}
            maxLength={NAME_MAX}
            placeholder="自分の名前やあだ名"
            required
            aria-describedby="nickname-note"
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setName(e.target.value)}
          />
          <p className="entry-note profile-name-note" id="nickname-note">
            {name.trim() === 'ゲスト' ? '「ゲスト」のままでは入れません。ほかの名前にしてください。' : 'チームの人に見える名前です。入力すると入室できます。'}
          </p>
          <p className="entry-label" id="avatar-label">
            アバター
          </p>
          <div className="avatar-grid" role="radiogroup" aria-labelledby="avatar-label">
            {Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={n === avatar}
                aria-label={`アバター ${n}`}
                className={`avatar-pick${n === avatar ? ' is-on' : ''}`}
                onClick={() => setAvatar(n)}
              >
                <AvatarFace n={n} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="entry-actions">
        {current ? (
          <button type="button" className="btn" onClick={onDone}>
            やめる
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>
            ログイン画面へ戻る
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !validName(name)}>
          {current ? '保存する' : '入室する'}
        </button>
      </div>
    </form>
  );
}

function MemberChip({ member, me }: { member: Member; me: boolean }) {
  return (
    <li className={`member${me ? ' is-me' : ''}${member.online === false ? ' is-away' : ''}`}>
      <AvatarFace n={member.avatar} />
      <span className="member-name">{member.name}</span>
      {me && <span className="member-tag">あなた</span>}
      {member.online === false && <span className="member-tag is-away">切断中</span>}
    </li>
  );
}

/**
 * Self mode (when the game master allows it): one participant is the host and runs the game.
 * Anyone in the room can take the host's seat while it is free, or after the host has dropped out.
 */
function SelfMode({ me }: { me: Member | undefined }) {
  const uid = useSession((s) => s.user?.uid ?? '');
  const config = useSession((s) => s.config);
  const members = useSession((s) => s.members);
  const host = useSession((s) => s.host);
  const phase = useSession((s) => s.phase);
  const busy = useSession((s) => s.busy);
  const { claimHost, releaseHost, startGame, saveConfig } = useSession.getState();
  if (!config.selfMode || !me) return null;
  const hostMember = host ? members[host] : undefined;
  const hostGone = !!host && (!hostMember || hostMember.online === false);
  const amHost = host === uid;
  const anyTeam = Object.values(members).some((m) => m.team);
  const set = blockSetOf(config.blockSet);
  const problems = dealableProblems();
  return (
    <section className="self-mode" aria-label="セルフモード">
      <p className="kicker">SELF MODE</p>
      {amHost ? (
        <>
          <p className="self-mode-text">
            <b>あなたがホストです。</b>全員がチームに入ったら、ゲームを始めてください。
          </p>
          {phase === 'lobby' && (
            <div className="admin-grid">
              <label className="admin-field">
                <span>ブロックと箱</span>
                <select value={set.id} disabled={busy} onChange={(e) => void saveConfig({ blockSet: e.target.value })}>
                  {BLOCK_SETS.map((b) => (
                    <option key={b.id} value={b.id}>
                      ブロック{b.blocks}個・箱{b.trays}つ（1箱{b.each}個）
                    </option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>お題</span>
                <select value={problems.some((p) => p.id === config.problem) ? config.problem : 'random'} disabled={busy} onChange={(e) => void saveConfig({ problem: e.target.value })}>
                  <option value="random">おまかせ（ランダム）</option>
                  {problems.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <div className="entry-actions is-start">
            {phase === 'lobby' && (
              <button type="button" className="btn btn-primary" disabled={busy || !anyTeam || !me.team} onClick={() => void startGame()}>
                ゲームを始める
              </button>
            )}
            <button type="button" className="btn" disabled={busy} onClick={() => void releaseHost()}>
              ホストをやめる
            </button>
          </div>
          {phase === 'lobby' && !me.team && <p className="entry-note">ホストも、先にチームに入ってください。</p>}
        </>
      ) : host && !hostGone ? (
        <p className="self-mode-text">
          ホストは <b>{hostMember?.name}</b> さんです。ホストがゲームを進めます。
        </p>
      ) : (
        <>
          <p className="self-mode-text">{hostGone ? 'ホストがいなくなりました。だれかが引き継いでください。' : 'まだホストがいません。ゲームを進める人を1人決めてください。'}</p>
          <div className="entry-actions is-start">
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void claimHost()}>
              {hostGone ? 'ホストを引き継ぐ' : 'ホストになる'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function Lobby() {
  const user = useSession((s) => s.user)!;
  const config = useSession((s) => s.config);
  const members = useSession((s) => s.members);
  const busy = useSession((s) => s.busy);
  const chooseTeam = useSession((s) => s.chooseTeam);
  const leave = useSession((s) => s.leave);
  const signOut = useSession((s) => s.signOut);
  const phase = useSession((s) => s.phase);
  const playing = phase !== 'lobby';
  const [editing, setEditing] = useState(false);
  const me: Member | undefined = members[user.uid];
  const list = Object.entries(members).sort(([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
  const teams = teamsOf(config);
  const unassigned = list.filter(([, m]) => !m.team || !teams.some((t) => t.id === m.team));

  if (editing && me) return <Profile current={me} onDone={() => setEditing(false)} />;
  return (
    <div className="entry-card is-wide">
      <div className="lobby-head">
        <div>
          <p className="kicker">LOBBY</p>
          <h2 className="entry-title">
            {playing
              ? me
                ? 'ゲーム中です。次のゲームが始まるまで、お待ちください'
                : 'ゲーム中です'
              : me
                ? me.team
                  ? 'ゲームが始まるまで、お待ちください'
                  : 'チームを選んでください'
                : '参加者のようす'}
          </h2>
        </div>
        <span className="lobby-count num" aria-label={`参加者 ${list.length}人（上限 ${MAX_MEMBERS}人）`}>
          {list.length} / {MAX_MEMBERS}
        </span>
      </div>
      <Messages />
      <SelfMode me={me} />
      <div className="team-grid">
        {teams.map((team) => {
          const inTeam = list.filter(([, m]) => m.team === team.id);
          const mine = me?.team === team.id;
          const full = inTeam.length >= config.teamSize;
          return (
            <section key={team.id} className={`team-card${mine ? ' is-mine' : ''}`} aria-label={team.name}>
              <header className="team-head">
                <h3>{team.name}</h3>
                <span className="num">
                  {inTeam.length} / {config.teamSize}
                </span>
              </header>
              <ul className="member-list">
                {inTeam.map(([uid, m]) => (
                  <MemberChip key={uid} member={m} me={uid === user.uid} />
                ))}
              </ul>
              {me && !mine && !playing && (
                <button type="button" className="btn team-join" disabled={busy || full} onClick={() => void chooseTeam(team.id)}>
                  {full ? '満員' : me.team ? 'ここへ移る' : 'ここに入る'}
                </button>
              )}
            </section>
          );
        })}
      </div>
      {unassigned.length > 0 && (
        <section className="lobby-rest" aria-label="チームを選んでいない人">
          <h3>チームを選んでいない人</h3>
          <ul className="member-list is-row">
            {unassigned.map(([uid, m]) => (
              <MemberChip key={uid} member={m} me={uid === user.uid} />
            ))}
          </ul>
        </section>
      )}
      <div className="entry-actions">
        {me ? (
          <>
            <button type="button" className="btn" disabled={busy} onClick={() => void leave()}>
              退室する
            </button>
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              ニックネームとアバターを変える
            </button>
          </>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>
            ログアウト
          </button>
        )}
      </div>
    </div>
  );
}

/** Full-screen gate shown until the game itself is on screen. */
export function Entry() {
  const user = useSession((s) => s.user);
  const loaded = useSession((s) => s.loaded);
  const isAdmin = useSession((s) => s.isAdmin);
  const joined = useSession((s) => !!s.user && !!s.members[s.user.uid]);
  const clearMessages = useSession((s) => s.clearMessages);
  const step = user === undefined || (user && !loaded) ? 'loading' : !user ? 'login' : joined || isAdmin ? 'lobby' : 'profile';
  // A message belongs to the screen it appeared on.
  useEffect(() => {
    if (step === 'lobby') clearMessages();
  }, [step, clearMessages]);
  return (
    <div className="entry">
      {step === 'loading' && (
        <div className="loading" role="status">
          <span className="kicker">CONNECTING</span>
          <span className="loading-bar" />
        </div>
      )}
      {step === 'login' && <Login />}
      {step === 'profile' && <Profile />}
      {step === 'lobby' && (isAdmin ? <Admin /> : <Lobby />)}
    </div>
  );
}
