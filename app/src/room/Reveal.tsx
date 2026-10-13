// The results screen: every team's answer side by side, on everyone's screen at once.
//  - First half (fixedReveal): right and wrong are marked straight away; the model's labels appear
//    when the game master shows them.
//  - Second half (freeReveal): each team's purpose and grouping, nothing marked. Everyone gives one
//    heart to the team whose answer they liked (their own team is allowed).
//  - Score: the hearts are counted and, when points are on, added to the first half's correct answers.
// The game master can point at one team (it is highlighted for everybody) while it explains itself.
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { create } from 'zustand';
import { PROBLEMS } from '../data/problems';
import { dealTeamBoard, TRAY_GLYPHS, useGame } from '../state/store';
import { THEMES } from '../theme/themes';
import { avatarThumb } from './avatars';
import { castVote, checkBoard, layOutFree, slotUsed, useBoards, useFreeTeams, useMyVote, useVotes, type Answer, type BoardData, type FreeAnswer, type FreeTeam } from './boards';
import { isFreeHalf, teamsOf, useCanRun, useSession, type Member, type Round } from './session';

/** The game master flips between this screen and the control panel. */
export const useRevealUi = create<{ panelOpen: boolean; setPanelOpen(open: boolean): void }>()((set_) => ({
  panelOpen: false,
  setPanelOpen: (panelOpen) => set_({ panelOpen }),
}));

/** Model answer of a round: the groups it deals, with the words taken from each. */
export function ModelAnswer({ round }: { round: Round }) {
  const problem = PROBLEMS.find((p) => p.id === round.problemId);
  const board = useMemo(() => dealTeamBoard(round), [round]);
  if (!problem || !board) return null;
  const groups = new Map<number, string[]>();
  for (const item of board.items) {
    const gi = Number(item.id.slice(problem.id.length + 1).split('-')[0]);
    groups.set(gi, [...(groups.get(gi) ?? []), item.text]);
  }
  return (
    <div className="admin-answer">
      <ul>
        {[...groups.entries()].map(([gi, words]) => (
          <li key={gi}>
            <b>{problem.groups[gi].label}</b>
            <span>{words.join('、')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** First half: the team's boxes with every block marked right or wrong. */
function FixedBody({ answer, board, showModel, points }: { answer: Answer; board: BoardData; showModel: boolean; points: boolean }) {
  const colors = THEMES[useGame((s) => s.theme)].trayColors;
  const g = answer.grade;
  return (
    <>
      <p className="rv-score">
        {g.total}個中 <b className="num">{g.correct}</b>個 正解
        {points && <span className="rv-points num">{g.correct}点</span>}
      </p>
      <div className="rv-trays">
        {g.trays.map((tray, i) => (
          <section key={tray.trayId} className="rv-tray" style={{ '--tray': colors[i] } as CSSProperties}>
            <h4>
              <span aria-hidden="true">{TRAY_GLYPHS[i]}</span> {tray.label || <i>（名前なし）</i>}
            </h4>
            {showModel && (
              <p className="rv-model">
                模範：<b>{tray.modelLabel}</b>
                {tray.labelMatch === 'match' && <em className="label-verdict is-match">◎ 同じ意味</em>}
                {tray.labelMatch === 'close' && <em className="label-verdict is-close">○ 近い</em>}
              </p>
            )}
            <ul>
              {tray.items.map((item) => (
                <li key={item.id} className={item.ok ? 'ok' : 'ng'}>
                  <span aria-hidden="true">{item.ok ? '✓' : '✗'}</span>
                  <span className="sr-only">{item.ok ? '正解' : '不正解'}</span> {item.text}
                  {showModel && !item.ok && item.shouldTrayId && <em>→ {g.trays.find((t) => t.trayId === item.shouldTrayId)?.modelLabel}</em>}
                </li>
              ))}
              {tray.items.length === 0 && <li className="is-empty">（空）</li>}
            </ul>
          </section>
        ))}
        {answer.pending.length > 0 && (
          <section className="rv-tray is-pending">
            <h4>入れなかったブロック</h4>
            <ul>
              {answer.pending.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <p className="rv-comment">
        <b>なぜ、この分け方？</b>
        {board.comment?.trim() || '（コメントなし）'}
      </p>
    </>
  );
}

/** Second half: the purpose first, then the boxes. Nothing is marked. */
function FreeBody({ answer, board }: { answer: FreeAnswer; board: BoardData }) {
  const colors = THEMES[useGame((s) => s.theme)].trayColors;
  return (
    <>
      <p className="rv-purpose">
        <b>目的</b>
        {board.purpose?.trim() || '（目的なし）'}
      </p>
      <div className="rv-trays">
        {answer.trays.map((tray, i) => (
          <section key={tray.trayId} className="rv-tray" style={{ '--tray': colors[i] } as CSSProperties}>
            <h4>
              <span aria-hidden="true">{TRAY_GLYPHS[i]}</span> {tray.label || <i>（名前なし）</i>}
            </h4>
            <ul>
              {tray.items.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
              {tray.items.length === 0 && <li className="is-empty">（空）</li>}
            </ul>
          </section>
        ))}
        {answer.trash.length > 0 && (
          <section className="rv-tray is-pending">
            <h4>🗑️ 捨てたブロック</h4>
            <ul>
              {answer.trash.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </section>
        )}
        {answer.pending.length > 0 && (
          <section className="rv-tray is-pending">
            <h4>入れなかったブロック</h4>
            <ul>
              {answer.pending.map((item) => (
                <li key={item.id}>{item.text}</li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <p className="rv-comment">
        <b>なぜ、この分け方？</b>
        {board.comment?.trim() || '（コメントなし）'}
      </p>
    </>
  );
}

/**
 * Second half of one team. A team that stocked several purposes shows its first choice; the others
 * are a tab away (each viewer flips for themselves).
 */
function FreeSlots({ round, team }: { round: Round; team: FreeTeam }) {
  const used = team.slots.map((board, i) => ({ board, n: i + 1 })).filter(({ board, n }) => slotUsed(board) || n === team.primary);
  const [shown, setShown] = useState(team.primary);
  const current = used.find((u) => u.n === shown) ?? used.find((u) => u.n === team.primary) ?? used[0];
  const answer = useMemo(() => (current ? layOutFree(round, current.board) : null), [round, current]);
  if (!current || !answer) return <p className="rv-none">答えがありません</p>;
  return (
    <>
      {used.length > 1 && (
        <div className="team-slot-tabs" role="tablist" aria-label="目的">
          {used.map(({ n }) => (
            <button key={n} type="button" role="tab" aria-selected={n === current.n} className={`team-slot-tab${n === current.n ? ' is-on' : ''}`} onClick={() => setShown(n)}>
              目的{n}
              {n === team.primary && <small>★第一候補</small>}
            </button>
          ))}
        </div>
      )}
      <FreeBody answer={answer} board={current.board} />
    </>
  );
}

function TeamCard(props: { name: string; mates: Member[]; rank: number | null; focused: boolean; onFocus?: () => void; children: ReactNode; foot?: ReactNode }) {
  const { name, mates, rank, focused, onFocus, children, foot } = props;
  const className = `rv-team${focused ? ' is-focus' : ''}`;
  const head = (
    <header className="rv-team-head">
      {rank !== null && <span className="rv-rank num">{rank}位</span>}
      <h3>{name}</h3>
      <span className="rv-faces">
        {mates.map((m, i) => (
          <img key={i} className="avatar-face" src={avatarThumb(m.avatar)} alt="" title={m.name} draggable={false} />
        ))}
      </span>
    </header>
  );
  return (
    <article className={className}>
      {/* The game master's card header is a button: pressing it points everybody's screen at that team. */}
      {onFocus ? (
        <button type="button" className="rv-pick" aria-pressed={focused} title="全員の画面で、このチームを目立たせる" onClick={onFocus}>
          {head}
        </button>
      ) : (
        head
      )}
      {children}
      {foot}
    </article>
  );
}

export function Reveal() {
  const config = useSession((s) => s.config);
  const members = useSession((s) => s.members);
  const round = useSession((s) => s.round);
  const phase = useSession((s) => s.phase);
  const reveal = useSession((s) => s.reveal);
  const isAdmin = useSession((s) => s.isAdmin);
  const uid = useSession((s) => s.user?.uid ?? '');
  const busy = useSession((s) => s.busy);
  const { setReveal, startGame, startFree, showScore, endGame } = useSession.getState();
  // The game master, or (self mode) the host: a participant who also runs the game.
  const canRun = useCanRun();
  const free = isFreeHalf(phase);
  const scoring = phase === 'score';
  const fixedBoards = useBoards(round, true, false);
  const freeTeams = useFreeTeams(round, free);
  const votes = useVotes(round, isAdmin || scoring);
  const myVote = useMyVote(round, isAdmin ? '' : uid);
  const problem = PROBLEMS.find((p) => p.id === round?.problemId);
  const isMember = !!members[uid];

  const rows = useMemo(() => {
    if (!round) return [];
    const hearts = (teamId: string) => Object.values(votes).filter((t) => t === teamId).length;
    const list = teamsOf(config)
      .map((team) => {
        const fixedBoard = fixedBoards[team.id] ?? {};
        const freeTeam = freeTeams[team.id];
        const mates = Object.values(members).filter((m) => m.team === team.id).sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
        const fixed = fixedBoard.assign || fixedBoard.submitted ? checkBoard(round, fixedBoard) : null;
        const correct = fixed?.grade.correct ?? 0;
        return {
          team,
          mates,
          fixedBoard,
          fixed,
          freeTeam: free && freeTeam && (freeTeam.submitted || freeTeam.slots.some(slotUsed)) ? freeTeam : null,
          correct,
          hearts: hearts(team.id),
          // What the ranking goes by: correct answers after the first half, plus hearts at the end.
          total: scoring ? correct + hearts(team.id) : correct,
          answered: !!(fixedBoard.submitted || freeTeam?.submitted),
        };
      })
      .filter((row) => row.mates.length > 0 || row.answered);
    const ranked = config.points && config.ranking && (phase === 'fixedReveal' || scoring);
    if (!ranked) return list.map((row) => ({ ...row, rank: null as number | null }));
    // Highest first; teams with the same total share a place.
    const sorted = [...list].sort((a, b) => b.total - a.total);
    return sorted.map((row) => ({ ...row, rank: 1 + sorted.filter((other) => other.total > row.total).length }));
  }, [round, config, members, fixedBoards, freeTeams, votes, free, scoring, phase]);

  // On a phone the teams are stacked: bring the one being pointed at into view.
  const focus = reveal.focus;
  useEffect(() => {
    if (focus) document.querySelector('.rv-team.is-focus')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  if (!round || !problem) return null;
  const voters = Object.keys(members).length;
  const voted = Object.keys(votes).filter((id) => members[id]).length;
  return (
    <div className="rv">
      <header className="rv-head">
        <div>
          <p className="kicker">{scoring ? '結果 ・ ハートとポイント' : free ? '結果発表 ・ 後半（自由課題）' : '結果発表 ・ 前半（固定課題）'}</p>
          <h2>{problem.title}</h2>
          <p className="rv-brief">
            {free ? '同じブロックを、チームごとに決めた目的で分け直しました。目的が変わると、分け方と名前はどう変わったでしょう？' : `${problem.brief.user}が、${problem.brief.scene}、${problem.brief.goal}`}
          </p>
        </div>
        {canRun && (
          <div className="rv-admin" aria-label="進行の操作">
            {phase === 'fixedReveal' && (
              <label className="admin-toggle">
                <input type="checkbox" checked={reveal.showModel} disabled={busy} onChange={(e) => void setReveal({ showModel: e.target.checked })} />
                <span>模範の分け方を見せる</span>
              </label>
            )}
            {phase === 'freeReveal' && isAdmin && (
              <span className="rv-voted num">
                投票済み {voted} / {voters}人
              </span>
            )}
            {!scoring && (
              <button type="button" className="btn" disabled={busy || !reveal.focus} onClick={() => void setReveal({ focus: '' })}>
                注目を外す
              </button>
            )}
            {phase === 'fixedReveal' && (
              <>
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startFree()}>
                  後半（自由課題）を始める
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => void startGame()}>
                  次のゲームを始める
                </button>
              </>
            )}
            {phase === 'freeReveal' && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void showScore()}>
                投票を締め切って、結果を見せる
              </button>
            )}
            {scoring && (
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startGame()}>
                次のゲームを始める
              </button>
            )}
            {isAdmin ? (
              <button type="button" className="btn" onClick={() => useRevealUi.getState().setPanelOpen(true)}>
                管理パネル
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={() => void endGame()}>
                ロビーへ戻す
              </button>
            )}
          </div>
        )}
      </header>
      {canRun && !scoring && <p className="rv-hint">チーム名を押すと、全員の画面でそのチームが目立ちます。この画面は、全員に同じものが見えています。</p>}
      {phase === 'freeReveal' && !isAdmin && (
        <p className="rv-vote-note" role="status">
          {isMember
            ? myVote
              ? '❤ を付けました。結果が出るまで、付け直せます。'
              : 'いいと思ったチームに、❤ を1つ付けてください（自分のチームでもかまいません）。'
            : '入室している人だけが ❤ を付けられます。'}
        </p>
      )}
      <div className="rv-grid">
        {rows.map((row) => (
          <TeamCard
            key={row.team.id}
            name={row.team.name}
            mates={row.mates}
            rank={row.rank}
            focused={reveal.focus === row.team.id}
            onFocus={canRun && !scoring ? () => void setReveal({ focus: reveal.focus === row.team.id ? '' : row.team.id }) : undefined}
            foot={
              phase === 'freeReveal' && !isAdmin && isMember ? (
                <button type="button" className={`rv-heart${myVote === row.team.id ? ' is-on' : ''}`} aria-pressed={myVote === row.team.id} onClick={() => void castVote(round, uid, row.team.id).catch(() => undefined)}>
                  <span aria-hidden="true">{myVote === row.team.id ? '❤' : '♡'}</span> {myVote === row.team.id ? 'このチームに付けました' : 'このチームに ❤ を付ける'}
                </button>
              ) : undefined
            }
          >
            {scoring && (
              <p className="rv-total">
                {config.points && (
                  <span>
                    正解 <b className="num">{row.correct}</b>
                  </span>
                )}
                <span className="rv-hearts">
                  ❤ <b className="num">{row.hearts}</b>
                </span>
                {config.points && (
                  <span className="rv-points num">
                    合計 {row.total}点
                  </span>
                )}
              </p>
            )}
            {free ? (
              row.freeTeam ? (
                <FreeSlots key={row.freeTeam.primary} round={round} team={row.freeTeam} />
              ) : (
                <p className="rv-none">答えがありません</p>
              )
            ) : row.fixed ? (
              <FixedBody answer={row.fixed} board={row.fixedBoard} showModel={reveal.showModel} points={config.points} />
            ) : (
              <p className="rv-none">答えがありません</p>
            )}
          </TeamCard>
        ))}
      </div>
      {rows.length === 0 && <p className="rv-none">答えを読み込んでいます…</p>}
      {phase === 'fixedReveal' && reveal.showModel && (
        <section className="rv-model-all" aria-label="模範の分け方">
          <h3>模範の分け方</h3>
          <ModelAnswer round={round} />
          <p className="rv-foot">模範は「一つの設計例」です。違う分け方でも、理由を説明できれば価値があります。</p>
        </section>
      )}
    </div>
  );
}
