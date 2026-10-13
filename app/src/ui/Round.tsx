// One round of play: brief before starting, brief card while playing, keyword meanings, and the answer check.
import { useState, type CSSProperties } from 'react';
import * as audio from '../audio';
import { PROBLEMS } from '../data/problems';
import { cheerFor } from '../game/cheers';
import { levelDef, MAX_LEVEL, STARS_TO_LEVEL_UP, titleFor } from '../game/levels';
import { TRAY_GLYPHS, useGame } from '../state/store';
import { THEMES } from '../theme/themes';
import { dom } from '../game/runtime';
import { useDialog } from './useDialog';

function Stars({ value, max = 3, size }: { value: number; max?: number; size?: 'lg' }) {
  return (
    <span className={`stars${size === 'lg' ? ' stars-lg' : ''}`} aria-label={`★${value} / ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={i < value ? 'on' : 'off'} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

/** Before each board: read the brief first, so the sorting criterion is clear before any block moves. */
export function BriefingOverlay() {
  const open = useGame((s) => s.briefingOpen);
  const mode = useGame((s) => s.mode);
  const level = useGame((s) => s.level);
  const problemIndex = useGame((s) => s.problemIndex);
  const itemCount = useGame((s) => s.items.length);
  const trays = useGame((s) => s.trays);
  const dialog = useDialog<HTMLDivElement>(() => useGame.getState().dismissBriefing(), open);
  if (!open) return null;
  const problem = PROBLEMS[problemIndex];
  const def = levelDef(level);
  const caps = trays.map((t) => t.capacity).filter((c): c is number => c !== undefined);
  const start = () => {
    useGame.getState().dismissBriefing();
    audio.tick();
  };

  return (
    <div className="briefing" role="dialog" aria-modal="true" aria-label="お題" ref={dialog}>
      <div className="briefing-card">
        {mode === 'level' ? (
          <p className="kicker">
            LEVEL {level} ・ {def.title} ・ {titleFor(level)}
          </p>
        ) : (
          <p className="kicker">FREE PLAY</p>
        )}
        <h2>
          {problem.title}
          {problem.source === 'ai' && (
            <span className="ai-made" title="AI が作り、Claude が手直しした問題です">
              AI 作問・監修済
            </span>
          )}
        </h2>
        <dl className="brief-rows">
          <div>
            <dt>だれが</dt>
            <dd>{problem.brief.user}</dd>
          </div>
          <div>
            <dt>どんなとき</dt>
            <dd>{problem.brief.scene}</dd>
          </div>
          <div>
            <dt>何のため</dt>
            <dd>{problem.brief.goal}</dd>
          </div>
        </dl>
        <p className="briefing-tip">この人になりきって、「この人なら、どこを探す？」で分けてみましょう。</p>
        <p className="briefing-task">
          {mode === 'level' ? `${def.goal}。` : ''}
          キーワード{itemCount}個 → {trays.length}つの箱
          {caps.length ? `（${caps.join('・')}個）` : ''}
        </p>
        <ul className="briefing-controls">
          <li>
            <b>つかんで投げる</b>・<b>タップ → 箱をタップ</b>で入れる
          </li>
          <li>
            キーワードに<b>マウスを乗せる／長押し</b>で意味が見られます
          </li>
        </ul>
        <button type="button" className="btn btn-primary" autoFocus onClick={start}>
          はじめる
        </button>
      </div>
    </div>
  );
}

const BRIEF_COLLAPSED_KEY = 'practice-ia:brief-collapsed';

/** Collapsed by default on narrow screens (the brief was just read; blocks need the room). Remembered per device. */
function initialCollapsed(): boolean {
  try {
    const saved = localStorage.getItem(BRIEF_COLLAPSED_KEY);
    if (saved !== null) return saved === '1';
  } catch {
    // Non-critical.
  }
  return window.matchMedia('(max-width: 900px)').matches;
}

/**
 * While playing: the brief stays in view (top-left). It folds into a small pill so it never hides blocks on
 * phones; the expanded card's body reopens the full brief.
 */
export function BriefCard() {
  const open = useGame((s) => s.briefingOpen);
  const problemIndex = useGame((s) => s.problemIndex);
  const mode = useGame((s) => s.mode);
  const level = useGame((s) => s.level);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  if (open) return null;
  const problem = PROBLEMS[problemIndex];
  const tag = `${mode === 'level' ? `LV ${level} ・ お題` : 'お題'}${problem.source === 'ai' ? ' ・ AI 作問・監修済' : ''}`;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(BRIEF_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Non-critical.
    }
  };

  if (collapsed) {
    return (
      <button type="button" className="brief-pill" ref={(el) => void (dom.brief = el)} onClick={toggle} aria-expanded={false} title="お題を開く">
        <span className="kicker">{tag}</span>
        <span className="brief-pill-arrow" aria-hidden="true">
          ▶
        </span>
      </button>
    );
  }

  // Two labelled buttons, one action each: the text itself does nothing when tapped
  // (it used to: the top half folded the card, the bottom half opened the brief — easy to mix up).
  return (
    <div className="brief-card" ref={(el) => void (dom.brief = el)}>
      <div className="brief-card-head">
        <span className="kicker">{tag}</span>
        <div className="brief-card-actions">
          <button type="button" className="brief-act" onClick={() => useGame.getState().openBriefing()} title="お題をもう一度くわしく見る">
            くわしく
          </button>
          <button type="button" className="brief-act is-icon" onClick={toggle} aria-expanded={true} aria-label="お題をたたむ" title="お題をたたむ">
            <span aria-hidden="true">－</span>
          </button>
        </div>
      </div>
      <div className="brief-card-body">
        <b>{problem.title}</b>
        <span>
          {problem.brief.user}が、{problem.brief.scene}
        </span>
      </div>
    </div>
  );
}

/** Meaning of the keyword under the pointer (hover) or finger (long-press). */
export function KeywordTip() {
  const peek = useGame((s) => s.peek);
  const item = useGame((s) => (s.peek ? s.items.find((i) => i.id === s.peek!.id) : undefined));
  if (!peek || !item) return null;
  const x = Math.min(window.innerWidth - 12, Math.max(12, peek.x));
  const y = Math.max(12, peek.y - 18);
  return (
    <div className="keyword-tip" role="tooltip" style={{ left: x, top: y } as CSSProperties}>
      <b>{item.text}</b>
      <span>{item.desc}</span>
    </div>
  );
}

/** The answer check: stars, which blocks were off and where they belong, model labels, level progress. */
export function ResultPanel() {
  const result = useGame((s) => s.result);
  const open = useGame((s) => s.resultOpen);
  const trays = useGame((s) => s.trays);
  const mode = useGame((s) => s.mode);
  const level = useGame((s) => s.level);
  const levelStars = useGame((s) => s.levelStars);
  const levelUpTo = useGame((s) => s.levelUpTo);
  const theme = THEMES[useGame((s) => s.theme)];
  const dialog = useDialog<HTMLDivElement>(() => useGame.getState().closeResult(), !!result && open);

  if (!result || !open) return null;
  const trayById = new Map(trays.map((t) => [t.id, t]));
  const { newRound, closeResult } = useGame.getState();
  const perfect = result.correct === result.total;
  const cheer = cheerFor(result, levelUpTo);

  return (
    <div className="result" role="dialog" aria-modal="true" aria-label="答え合わせ" ref={dialog}>
      <div className="result-card">
        <p className="kicker">RESULT</p>
        {cheer && <p className="result-cheer">{cheer}</p>}
        <div className="result-head">
          <Stars value={result.stars} size="lg" />
          <div>
            <p className="result-score">
              {result.total}個中 <b className="num">{result.correct}</b>個 正解
            </p>
            <p className="result-comment">
              {perfect ? 'パーフェクト！ 分け方の軸がしっかり通っています。' : result.correct / result.total >= 0.8 ? 'おしい！ 赤く光っているブロックを確認しましょう。' : 'どの軸で分けたかを振り返ってみましょう。お題の「だれが・何のため」がヒントです。'}
            </p>
          </div>
        </div>
        {result.notes.length > 0 && (
          <ul className="result-notes">
            {result.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}

        {mode === 'level' &&
          (levelUpTo ? (
            <div className="level-up">
              <p className="level-up-title">LEVEL UP!</p>
              <p>
                <b>LV {levelUpTo}</b> ・ {levelDef(levelUpTo).title}
              </p>
              <p className="level-up-rank">
                称号アップ！ {titleFor(levelUpTo - 1)} → <b>{titleFor(levelUpTo)}</b>
              </p>
              <p className="level-up-goal">{levelDef(levelUpTo).goal}</p>
            </div>
          ) : (
            <div className="level-progress">
              <span>
                LV {level}
                {level >= MAX_LEVEL ? '（最終試験）' : ''}
              </span>
              {(
                <>
                  <span className="level-bar" aria-hidden="true">
                    <i style={{ width: `${(levelStars / STARS_TO_LEVEL_UP) * 100}%` }} />
                  </span>
                  <span className="num">
                    ★{levelStars}/{STARS_TO_LEVEL_UP}
                  </span>
                </>
              )}
            </div>
          ))}

        <div className="result-trays">
          {result.trays.map((gt) => {
            const tray = trayById.get(gt.trayId);
            const color = tray ? theme.trayColors[tray.colorIndex] : undefined;
            return (
              <section key={gt.trayId} className="result-tray" style={{ '--tray': color } as CSSProperties}>
                <header>
                  <span className="tray-glyph">{tray ? TRAY_GLYPHS[tray.colorIndex] : ''}</span>
                  <span>
                    あなた: <b>{gt.label || '（ラベルなし）'}</b>
                  </span>
                  <span className="result-model">
                    模範: <b>{gt.modelLabel}</b>
                    {gt.labelMatch === 'match' && <em className="label-verdict is-match">◎ 同じ意味</em>}
                    {gt.labelMatch === 'close' && <em className="label-verdict is-close">○ 近い</em>}
                  </span>
                </header>
                <ul>
                  {gt.items.map((it) => {
                    const should = it.shouldTrayId ? trayById.get(it.shouldTrayId) : undefined;
                    const shouldLabel = result.trays.find((t) => t.trayId === it.shouldTrayId)?.modelLabel;
                    return (
                      <li key={it.id} className={it.ok ? 'ok' : 'ng'}>
                        <span aria-hidden="true">{it.ok ? '✓' : '✗'}</span> {it.text}
                        {!it.ok && should && (
                          <em>
                            → {TRAY_GLYPHS[should.colorIndex]} {shouldLabel} の箱
                          </em>
                        )}
                        {it.flexible && (
                          <small className="flex-mark" title="迷いやすい語なので、どちらの箱に入れても正解です">
                            ◇ どちらの箱でも正解
                          </small>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="result-foot">模範は「一つの設計例」です。違う分け方でも、理由を説明できれば価値があります。</p>
        <div className="result-actions">
          <button type="button" className="btn" onClick={closeResult}>
            盤面を見る
          </button>
          <button type="button" className="btn btn-primary" ref={(el) => el?.focus({ preventScroll: true })} onClick={newRound}>
            次の問題へ
          </button>
        </div>
      </div>
    </div>
  );
}
