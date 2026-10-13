// Results of the first half: every team's answer side by side, on everyone's screen at once.
// Right and wrong are marked straight away; the model's labels appear when the game master shows them.
// The game master can also point at one team (it is highlighted for everybody) while it explains itself.
import { useEffect, useMemo, type CSSProperties } from 'react';
import { create } from 'zustand';
import { PROBLEMS } from '../data/problems';
import { dealTeamBoard, TRAY_GLYPHS, useGame } from '../state/store';
import { THEMES } from '../theme/themes';
import { avatarThumb } from './avatars';
import { checkBoard, useBoards, type Answer, type BoardData } from './boards';
import { teamsOf, useSession, type Member, type Round } from './session';

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

function TeamCard(props: {
  name: string;
  mates: Member[];
  board: BoardData;
  answer: Answer | null;
  rank: number | null;
  showPoints: boolean;
  showModel: boolean;
  focused: boolean;
  onFocus?: () => void;
}) {
  const { name, mates, board, answer, rank, showPoints, showModel, focused, onFocus } = props;
  const colors = THEMES[useGame((s) => s.theme)].trayColors;
  const g = answer?.grade;
  const body = (
    <>
      <header className="rv-team-head">
        {rank !== null && <span className="rv-rank num">{rank}位</span>}
        <h3>{name}</h3>
        <span className="rv-faces">
          {mates.map((m, i) => (
            <img key={i} className="avatar-face" src={avatarThumb(m.avatar)} alt="" title={m.name} draggable={false} />
          ))}
        </span>
      </header>
      {g && answer ? (
        <>
          <p className="rv-score">
            {g.total}個中 <b className="num">{g.correct}</b>個 正解
            {showPoints && <span className="rv-points num">{g.correct}点</span>}
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
      ) : (
        <p className="rv-none">答えがありません</p>
      )}
    </>
  );
  const className = `rv-team${focused ? ' is-focus' : ''}`;
  // The game master's cards are buttons: pressing one points everybody's screen at that team.
  return onFocus ? (
    <article className={`${className} is-pickable`} role="button" tabIndex={0} aria-pressed={focused} onClick={onFocus} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onFocus())}>
      {body}
    </article>
  ) : (
    <article className={className}>{body}</article>
  );
}

export function Reveal() {
  const config = useSession((s) => s.config);
  const members = useSession((s) => s.members);
  const round = useSession((s) => s.round);
  const reveal = useSession((s) => s.reveal);
  const isAdmin = useSession((s) => s.isAdmin);
  const busy = useSession((s) => s.busy);
  const { setReveal, startGame } = useSession.getState();
  const boards = useBoards(round, true);
  const problem = PROBLEMS.find((p) => p.id === round?.problemId);

  const rows = useMemo(() => {
    if (!round) return [];
    const list = teamsOf(config)
      .map((team) => ({
        team,
        mates: Object.values(members).filter((m) => m.team === team.id).sort((a, b) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0)),
        board: boards[team.id] ?? {},
      }))
      .filter((row) => row.mates.length > 0 || row.board.submitted)
      .map((row) => ({ ...row, answer: row.board.assign || row.board.submitted ? checkBoard(round, row.board) : null }));
    if (!(config.points && config.ranking)) return list.map((row) => ({ ...row, rank: null as number | null }));
    // Ranked: most correct first; teams with the same score share a place.
    const sorted = [...list].sort((a, b) => (b.answer?.grade.correct ?? -1) - (a.answer?.grade.correct ?? -1));
    return sorted.map((row) => ({ ...row, rank: 1 + sorted.filter((other) => (other.answer?.grade.correct ?? -1) > (row.answer?.grade.correct ?? -1)).length }));
  }, [round, config, members, boards]);

  // On a phone the teams are stacked: bring the one being pointed at into view.
  const focus = reveal.focus;
  useEffect(() => {
    if (focus) document.querySelector('.rv-team.is-focus')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focus]);

  if (!round || !problem) return null;
  return (
    <div className="rv">
      <header className="rv-head">
        <div>
          <p className="kicker">結果発表 ・ 前半（固定課題）</p>
          <h2>{problem.title}</h2>
          <p className="rv-brief">
            {problem.brief.user}が、{problem.brief.scene}、{problem.brief.goal}
          </p>
        </div>
        {isAdmin && (
          <div className="rv-admin" aria-label="ゲームマスターの操作">
            <label className="admin-toggle">
              <input type="checkbox" checked={reveal.showModel} disabled={busy} onChange={(e) => void setReveal({ showModel: e.target.checked })} />
              <span>模範の分け方を見せる</span>
            </label>
            <button type="button" className="btn" disabled={busy || !reveal.focus} onClick={() => void setReveal({ focus: '' })}>
              注目を外す
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void startGame()}>
              次のゲームを始める
            </button>
            <button type="button" className="btn" onClick={() => useRevealUi.getState().setPanelOpen(true)}>
              管理パネル
            </button>
          </div>
        )}
      </header>
      {isAdmin && <p className="rv-hint">チームのカードを押すと、全員の画面でそのチームが目立ちます。この画面は、全員に同じものが見えています。</p>}
      <div className="rv-grid">
        {rows.map((row) => (
          <TeamCard
            key={row.team.id}
            name={row.team.name}
            mates={row.mates}
            board={row.board}
            answer={row.answer}
            rank={row.rank}
            showPoints={config.points}
            showModel={reveal.showModel}
            focused={reveal.focus === row.team.id}
            onFocus={isAdmin ? () => void setReveal({ focus: reveal.focus === row.team.id ? '' : row.team.id }) : undefined}
          />
        ))}
      </div>
      {rows.length === 0 && <p className="rv-none">答えを読み込んでいます…</p>}
      {reveal.showModel && (
        <section className="rv-model-all" aria-label="模範の分け方">
          <h3>模範の分け方</h3>
          <ModelAnswer round={round} />
          <p className="rv-foot">模範は「一つの設計例」です。違う分け方でも、理由を説明できれば価値があります。</p>
        </section>
      )}
    </div>
  );
}
