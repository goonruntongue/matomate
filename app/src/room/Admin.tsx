// The game master's control panel: run the round, set the room up, and watch every team.
// Only the admin sees it. Team memos are not here: nobody outside a team can read them.
import { useMemo, useState, type CSSProperties } from 'react';
import { PROBLEMS } from '../data/problems';
import { dealTeamBoard, TRASH_ID, TRAY_GLYPHS, useGame } from '../state/store';
import { THEMES } from '../theme/themes';
import { avatarThumb } from './avatars';
import { useBoards, type BoardData } from './boards';
import { ModelAnswer, useRevealUi } from './Reveal';
import {
  BLOCK_SETS,
  blockSetOf,
  dealableProblems,
  isFreeHalf,
  isPlaying,
  MAX_MEMBERS,
  MAX_TEAM_SIZE,
  MAX_TEAMS,
  teamsOf,
  useSession,
  type Member,
  type Round,
} from './session';

function Confirm({ text, action, onYes, onNo }: { text: string; action: string; onYes: () => void; onNo: () => void }) {
  // Asked on the page itself: some browsers never show window.confirm.
  return (
    <div className="entry-confirm" role="alertdialog" aria-label={action}>
      <p>{text}</p>
      <div className="entry-actions">
        <button type="button" className="btn" autoFocus onClick={onNo}>
          やめる
        </button>
        <button type="button" className="btn btn-danger" onClick={onYes}>
          {action}
        </button>
      </div>
    </div>
  );
}

function Stepper({ label, value, min, max, onChange, disabled }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className="admin-field">
      <span>{label}</span>
      <div className="admin-stepper">
        <button type="button" className="btn" aria-label={`${label}を減らす`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <b className="num">{value}</b>
        <button type="button" className="btn" aria-label={`${label}を増やす`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
          ＋
        </button>
      </div>
    </div>
  );
}

function Toggle({ label, note, value, onChange, disabled }: { label: string; note?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="admin-toggle">
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {note && <small>{note}</small>}
      </span>
    </label>
  );
}

function TeamAnswer({ round, board }: { round: Round; board: BoardData }) {
  const dealt = useMemo(() => dealTeamBoard(round), [round]);
  const colors = THEMES[useGame((s) => s.theme)].trayColors;
  if (!dealt) return null;
  const inTray = (trayId: string) =>
    dealt.items.filter((item) => board.assign?.[item.id]?.tray === trayId).sort((a, b) => (board.assign![a.id].at ?? 0) - (board.assign![b.id].at ?? 0));
  const pending = dealt.items.filter((item) => !board.assign?.[item.id]);
  const trash = inTray(TRASH_ID);
  return (
    <div className="admin-board">
      {board.purpose !== undefined && (
        <p className="admin-comment">
          <b>目的：</b>
          {board.purpose || '（まだ決まっていません）'}
        </p>
      )}
      {dealt.trayIds.map((trayId, i) => (
        <div key={trayId} className="admin-tray" style={{ '--tray': colors[i] } as CSSProperties}>
          <b>
            <span aria-hidden="true">{TRAY_GLYPHS[i]}</span> {board.labels?.[trayId] || <i>（名前なし）</i>}
          </b>
          <span>{inTray(trayId).map((item) => item.text).join('、') || '—'}</span>
        </div>
      ))}
      {trash.length > 0 && (
        <div className="admin-tray is-pending">
          <b>🗑️ 捨てた</b>
          <span>{trash.map((item) => item.text).join('、')}</span>
        </div>
      )}
      {pending.length > 0 && (
        <div className="admin-tray is-pending">
          <b>まだ入れていない</b>
          <span>{pending.map((item) => item.text).join('、')}</span>
        </div>
      )}
      {board.comment && <p className="admin-comment">💬 {board.comment}</p>}
    </div>
  );
}

function MemberRow({ uid, member, teams, canMove }: { uid: string; member: Member; teams: { id: string; name: string }[]; canMove: boolean }) {
  const moveMember = useSession((s) => s.moveMember);
  const kick = useSession((s) => s.kick);
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <li className="admin-member is-asking">
        <Confirm
          text={`${member.name} さんを退室させます。`}
          action="退室させる"
          onNo={() => setAsking(false)}
          onYes={() => {
            setAsking(false);
            void kick(uid);
          }}
        />
      </li>
    );
  }
  return (
    <li className={`admin-member${member.online === false ? ' is-away' : ''}`}>
      <img className="avatar-face" src={avatarThumb(member.avatar)} alt="" draggable={false} />
      <span className="member-name">
        {member.name}
        {member.guest && <small>ゲスト</small>}
        {member.online === false && <small>切断中</small>}
      </span>
      <select aria-label={`${member.name} さんのチーム`} value={teams.some((t) => t.id === member.team) ? member.team : ''} disabled={!canMove} onChange={(e) => void moveMember(uid, e.target.value)}>
        <option value="">チームなし</option>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button type="button" className="btn-mini" aria-label={`${member.name} さんを退室させる`} title="退室させる" onClick={() => setAsking(true)}>
        ×
      </button>
    </li>
  );
}

export function Admin() {
  const config = useSession((s) => s.config);
  const members = useSession((s) => s.members);
  const phase = useSession((s) => s.phase);
  const round = useSession((s) => s.round);
  const busy = useSession((s) => s.busy);
  const error = useSession((s) => s.error);
  const { saveConfig, startGame, showResults, startFree, endGame, clearRoom, announce, signOut } = useSession.getState();
  const playing = phase !== 'lobby';
  const sorting = isPlaying(phase);
  const boards = useBoards(round, playing, isFreeHalf(phase));
  const [showAnswers, setShowAnswers] = useState(true);
  const [showModel, setShowModel] = useState(false);
  const [confirming, setConfirming] = useState<'clear' | 'end' | null>(null);
  const [voice, setVoice] = useState('');
  const [voiceSent, setVoiceSent] = useState(false);
  const [names, setNames] = useState<Record<string, string>>({});

  const teams = teamsOf(config);
  const list = Object.entries(members).sort(([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
  const unassigned = list.filter(([, m]) => !teams.some((t) => t.id === m.team));
  const active = teams.filter((t) => list.some(([, m]) => m.team === t.id));
  const waiting = active.filter((t) => !boards[t.id]?.submitted);
  const allIn = sorting && active.length > 0 && waiting.length === 0;
  const set = blockSetOf(config.blockSet);
  const problems = useMemo(() => dealableProblems(), []);
  const total = round ? round.sizes.reduce((a, b) => a + b, 0) : 0;
  // What the next round would deal, for a look at the answer before starting.
  const preview: Round | null = useMemo(() => {
    if (playing && round) return round;
    const chosen = problems.find((p) => p.id === config.problem);
    return chosen ? { round: 0, problemId: chosen.id, seed: 1, sizes: Array.from({ length: set.trays }, () => set.each) } : null;
  }, [playing, round, problems, config.problem, set.trays, set.each]);

  const sendVoice = () => {
    if (!voice.trim()) return;
    void announce(voice).then(() => {
      setVoice('');
      setVoiceSent(true);
      window.setTimeout(() => setVoiceSent(false), 3000);
    });
  };

  return (
    <div className="entry-card is-wide admin">
      <div className="lobby-head">
        <div>
          <p className="kicker">GAME MASTER</p>
          <h2 className="entry-title">
            {phase === 'lobby'
              ? 'ロビー：チーム分けと設定'
              : `${{ fixed: '前半（固定課題）', fixedReveal: '前半の結果発表', free: '後半（自由課題）', freeReveal: '後半の結果発表・投票', score: '結果：ハートとポイント' }[phase]}：${PROBLEMS.find((p) => p.id === round?.problemId)?.title ?? ''}`}
          </h2>
        </div>
        <span className="lobby-count num" aria-label={`参加者 ${list.length}人（上限 ${MAX_MEMBERS}人）`}>
          {list.length} / {MAX_MEMBERS}
        </span>
      </div>
      {error && (
        <p className="entry-error" role="alert">
          {error}
        </p>
      )}

      {/* ── Running the round ── */}
      <section className="admin-section" aria-label="進行">
        {allIn && (
          <p className="admin-alert" role="alert">
            全チームの回答が出そろいました。結果発表ができます。
          </p>
        )}
        {sorting && !allIn && (
          <p className="entry-note">
            提出済み {active.length - waiting.length} / {active.length} チーム{waiting.length > 0 && `（まだ：${waiting.map((t) => t.name).join('、')}）`}
            。全チームが提出すると、結果発表ができます。
            {waiting.some((t) => list.every(([, m]) => m.team !== t.id || m.online === false)) && ' 全員が切断中のチームは、メンバーを「チームなし」にすると数えません。'}
          </p>
        )}
        <div className="entry-actions is-start">
          {phase === 'lobby' && (
            <button type="button" className="btn btn-primary" disabled={busy || active.length === 0} onClick={() => void startGame()}>
              ゲームを始める
            </button>
          )}
          {sorting && (
            <button type="button" className="btn btn-primary" disabled={busy || !allIn} onClick={() => {
                useRevealUi.getState().setPanelOpen(false);
                void showResults();
              }}
            >
              結果発表
            </button>
          )}
          {!sorting && playing && (
            <>
              <button type="button" className="btn btn-primary" onClick={() => useRevealUi.getState().setPanelOpen(false)}>
                結果発表の画面へ戻る
              </button>
              {phase === 'fixedReveal' && (
                <button type="button" className="btn" disabled={busy} onClick={() => void startFree()}>
                  後半（自由課題）を始める
                </button>
              )}
              <button type="button" className="btn" disabled={busy} onClick={() => void startGame()}>
                次のゲームを始める
              </button>
            </>
          )}
          {playing && (
            <button type="button" className="btn" disabled={busy} onClick={() => setConfirming('end')}>
              ゲームを終えてロビーへ戻す
            </button>
          )}
          <button type="button" className="btn btn-danger" disabled={busy || list.length === 0} onClick={() => setConfirming('clear')}>
            全員を退室させる
          </button>
          <button type="button" className="btn" disabled={busy} onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
        {phase === 'lobby' && active.length === 0 && <p className="entry-note">だれかがチームに入ると、ゲームを始められます。</p>}
        {confirming === 'clear' && (
          <Confirm
            text={`参加者を全員（${list.length}人）退室させます。よろしいですか？`}
            action="全員を退室させる"
            onNo={() => setConfirming(null)}
            onYes={() => {
              setConfirming(null);
              void clearRoom();
            }}
          />
        )}
        {confirming === 'end' && (
          <Confirm
            text="今のゲームを終えて、全員をロビーへ戻します。よろしいですか？"
            action="ロビーへ戻す"
            onNo={() => setConfirming(null)}
            onYes={() => {
              setConfirming(null);
              void endGame();
            }}
          />
        )}
      </section>

      {/* ── Master's voice ── */}
      <section className="admin-section" aria-label="マスターの声">
        <h3>マスターの声</h3>
        <form
          className="admin-voice"
          onSubmit={(e) => {
            e.preventDefault();
            sendVoice();
          }}
        >
          <input className="entry-input" value={voice} maxLength={200} placeholder="全員の画面にポップアップで出すメッセージ" aria-label="全員へのメッセージ" onChange={(e) => setVoice(e.target.value)} />
          <button type="submit" className="btn" disabled={busy || !voice.trim()}>
            全員に送る
          </button>
        </form>
        {voiceSent && (
          <p className="entry-note" role="status">
            送りました。
          </p>
        )}
      </section>

      {/* ── Teams ── */}
      <section className="admin-section" aria-label="チームのようす">
        <div className="admin-section-head">
          <h3>チームのようす</h3>
          {playing && <Toggle label="回答を表示する" value={showAnswers} onChange={setShowAnswers} />}
        </div>
        <div className="admin-teams">
          {teams.map((team) => {
            const inTeam = list.filter(([, m]) => m.team === team.id);
            const board = boards[team.id] ?? {};
            const placed = Object.keys(board.assign ?? {}).length;
            return (
              <article key={team.id} className={`admin-team${board.submitted ? ' is-submitted' : ''}`}>
                <header>
                  <h4>{team.name}</h4>
                  <span className="num">
                    {inTeam.length} / {config.teamSize}
                  </span>
                  {playing && inTeam.length > 0 && (
                    <span className={`admin-badge${board.submitted ? ' is-done' : ''}`}>{board.submitted ? '提出済み' : `${placed} / ${total} 個`}</span>
                  )}
                </header>
                <ul className="admin-members">
                  {inTeam.map(([uid, m]) => (
                    <MemberRow key={uid} uid={uid} member={m} teams={teams} canMove={!busy} />
                  ))}
                  {inTeam.length === 0 && <li className="admin-empty">だれもいません</li>}
                </ul>
                {playing && round && inTeam.length > 0 && (showAnswers ? <TeamAnswer round={round} board={board} /> : <p className="admin-hidden">回答は伏せています</p>)}
              </article>
            );
          })}
        </div>
        {unassigned.length > 0 && (
          <article className="admin-team is-rest">
            <header>
              <h4>チームを選んでいない人</h4>
              <span className="num">{unassigned.length}</span>
            </header>
            <ul className="admin-members is-row">
              {unassigned.map(([uid, m]) => (
                <MemberRow key={uid} uid={uid} member={m} teams={teams} canMove={!busy} />
              ))}
            </ul>
          </article>
        )}
      </section>

      {/* ── Settings ── */}
      <section className="admin-section" aria-label="設定">
        <h3>設定{playing && <small>（お題・ブロックの設定は、次のゲームから効きます）</small>}</h3>
        <div className="admin-grid">
          <Stepper
            label="チーム数"
            value={config.teamCount}
            min={1}
            max={Math.min(MAX_TEAMS, Math.floor(MAX_MEMBERS / config.teamSize))}
            disabled={busy || playing}
            onChange={(teamCount) => void saveConfig({ teamCount })}
          />
          <Stepper
            label="1チームの人数"
            value={config.teamSize}
            min={1}
            max={Math.min(MAX_TEAM_SIZE, Math.floor(MAX_MEMBERS / config.teamCount))}
            disabled={busy || playing}
            onChange={(teamSize) => void saveConfig({ teamSize })}
          />
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
          <Stepper label="自由課題の目的の数" value={config.slots} min={1} max={3} disabled={busy} onChange={(slots) => void saveConfig({ slots })} />
        </div>
        <p className="entry-note">チーム数 × 人数は、{MAX_MEMBERS}人までです。「自由課題の目的の数」は、まだ1つで動きます（2つ以上にしても、今は変わりません）。</p>
        <div className="admin-toggles">
          <Toggle label="点数をつける" note="正解1つ・ハート1つを1点として数えます" value={config.points} disabled={busy} onChange={(points) => void saveConfig({ points })} />
          <Toggle label="順位をつける" value={config.ranking} disabled={busy || !config.points} onChange={(ranking) => void saveConfig({ ranking })} />
        </div>
        <details className="admin-names">
          <summary>チーム名を変える</summary>
          <div className="admin-grid">
            {teams.map((team, i) => (
              <label key={team.id} className="admin-field">
                <span>{String.fromCharCode(65 + i)}</span>
                <input
                  className="entry-input"
                  value={names[team.id] ?? team.name}
                  maxLength={12}
                  disabled={busy}
                  onChange={(e) => setNames({ ...names, [team.id]: e.target.value })}
                  onBlur={() => {
                    const next = (names[team.id] ?? team.name).trim();
                    if (next !== team.name) void saveConfig({ teamNames: { ...config.teamNames, [team.id]: next } });
                    setNames(({ [team.id]: _, ...rest }) => rest);
                  }}
                />
              </label>
            ))}
          </div>
        </details>
      </section>

      {/* ── Model answer ── */}
      <section className="admin-section" aria-label="固定課題の答え">
        <div className="admin-section-head">
          <h3>固定課題の答え</h3>
          <Toggle label="答えを表示する" value={showModel} onChange={setShowModel} />
        </div>
        {showModel &&
          (preview ? (
            <>
              <p className="admin-brief">
                <b>{PROBLEMS.find((p) => p.id === preview.problemId)?.title}</b>
              </p>
              <ModelAnswer round={preview} />
              {!playing && <p className="entry-note">どの言葉が配られるかは、ゲームを始めるときに決まります（これは一例です）。</p>}
            </>
          ) : (
            <p className="entry-note">お題が「おまかせ」のときは、ゲームを始めると、そのお題の答えがここに出ます。</p>
          ))}
      </section>
      <p className="entry-note">管理者は参加者の人数には入りません。チームのメモは、そのチームの人だけが読めます。</p>
    </div>
  );
}
