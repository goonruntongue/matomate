// Lv10 final exam cleared. The 3D scene (party poppers, glittering confetti) plays first,
// then the title appears and the closing message is typed out slowly, like a typewriter.
import { lazy, Suspense, useEffect, useState } from 'react';
import * as audio from '../audio';
import { LEGEND_INDEX } from '../game/characters';
import { LEGEND_TITLE } from '../game/levels';
import { useGame } from '../state/store';
import { SafeBoundary } from './SafeBoundary';
import { useDialog } from './useDialog';

const CelebrationScene = lazy(() => import('../game/CelebrationScene'));
const CharacterViewer = lazy(() => import('../game/CharacterViewer'));

const FINAL_TITLE = LEGEND_TITLE;
const LINES = [
  '散らばった言葉たちは、あなたの手で居場所と名前を手に入れました。',
  `もう、あなたは「${FINAL_TITLE}」。`,
  'この先も、情報に迷う人のために、その力で道を照らしてください。',
];
const TOTAL_CHARS = LINES.reduce((n, l) => n + l.length, 0);
const TITLE_AT = 2100; // ms: after the poppers went off
const TYPE_AT = 3600;
const CHAR_MS = 95;
const LINE_PAUSE_MS = 750;

type Phase = 'intro' | 'title' | 'typing' | 'done';

/** Slow, solemn typing. Returns how many characters are visible. */
function useTypewriter(active: boolean, skip: boolean) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (skip) {
      setShown(TOTAL_CHARS);
      return;
    }
    let n = 0;
    let timer = 0;
    const step = () => {
      n += 1;
      setShown(n);
      if (n >= TOTAL_CHARS) return;
      let acc = 0;
      const atLineEnd = LINES.some((l) => (acc += l.length) === n);
      if (n % 2 === 0) audio.typeKey();
      timer = window.setTimeout(step, atLineEnd ? LINE_PAUSE_MS : CHAR_MS);
    };
    timer = window.setTimeout(step, CHAR_MS);
    return () => window.clearTimeout(timer);
  }, [active, skip]);
  return shown;
}

function Message({ shown }: { shown: number }) {
  let rest = shown;
  return (
    <div className="celebration-message" aria-hidden="true">
      {LINES.map((line, i) => {
        const visible = Math.max(0, Math.min(line.length, rest));
        const typing = rest > 0 && rest <= line.length && shown < TOTAL_CHARS;
        rest -= line.length;
        return (
          <p key={i}>
            {line.slice(0, visible)}
            {typing && <span className="caret" />}
            <span className="ghost">{line.slice(visible)}</span>
          </p>
        );
      })}
    </div>
  );
}

export function Celebration() {
  const celebrating = useGame((s) => s.celebrating);
  const count = useGame((s) => s.clears.count);
  if (!celebrating) return null;
  // Keyed by the clear count so a new clear always replays from the start.
  return <CelebrationBody key={count} />;
}

function CelebrationBody() {
  const clears = useGame((s) => s.clears);
  const totalStars = useGame((s) => s.totalStars);
  const rounds = useGame((s) => s.rounds);
  const [reducedMotion] = useState(() => useGame.getState().prefs.motion !== 'full');
  const dialog = useDialog<HTMLDivElement>(); // no Esc: it ends with its own button
  const [phase, setPhase] = useState<Phase>(reducedMotion ? 'done' : 'intro');
  const [skip, setSkip] = useState(reducedMotion);
  const shown = useTypewriter(phase === 'typing' || phase === 'done', skip);

  useEffect(() => {
    if (reducedMotion) {
      audio.grandFanfare(0.1);
      return;
    }
    const timers = [
      window.setTimeout(() => {
        setPhase('title');
        audio.grandFanfare(0);
      }, TITLE_AT),
      window.setTimeout(() => setPhase('typing'), TYPE_AT),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reducedMotion]);

  useEffect(() => {
    if (shown >= TOTAL_CHARS) setPhase('done');
  }, [shown]);

  const skipAll = () => {
    setSkip(true);
    setPhase('done');
  };

  const date = clears.lastAt ? new Date(clears.lastAt).toLocaleDateString('ja-JP') : '';
  const finished = phase === 'done' && shown >= TOTAL_CHARS;

  return (
    <div className={`celebration is-${phase}`} role="dialog" aria-modal="true" aria-label="クリアおめでとう" ref={dialog}>
      {!reducedMotion && (
        <SafeBoundary>
          <Suspense fallback={null}>
            <CelebrationScene />
          </Suspense>
        </SafeBoundary>
      )}
      <div className="celebration-card" onClick={finished ? undefined : skipAll}>
        {phase !== 'intro' && (
          <>
            <p className="celebration-title">CONGRATULATIONS!!</p>
            <div className="celebration-character" onClick={(e) => e.stopPropagation()}>
              <SafeBoundary>
                <Suspense fallback={null}>
                  <CharacterViewer index={LEGEND_INDEX} className="char-canvas" />
                </Suspense>
              </SafeBoundary>
            </div>
            <p className="celebration-rank">
              称号「<b>{FINAL_TITLE}</b>」を手に入れました
            </p>
          </>
        )}
        <p className="sr-only">{LINES.join('')}</p>
        {(phase === 'typing' || phase === 'done') && <Message shown={shown} />}
        {finished && (
          <div className="celebration-after">
            <dl className="celebration-stats">
              <div>
                <dt>クリア日</dt>
                <dd>{date}</dd>
              </div>
              <div>
                <dt>集めた★</dt>
                <dd className="num">{totalStars}</dd>
              </div>
              <div>
                <dt>答え合わせ</dt>
                <dd className="num">{rounds}回</dd>
              </div>
              <div>
                <dt>クリア回数</dt>
                <dd className="num">👑×{clears.count}</dd>
              </div>
            </dl>
            <button type="button" className="btn btn-primary celebration-button" autoFocus onClick={() => useGame.getState().finishCelebration()}>
              最初に戻る（Lv1から）
            </button>
            <p className="celebration-note">👑 クリアの証は、ヘッダーの称号の横に残ります。</p>
          </div>
        )}
      </div>
      {!finished && (
        <button type="button" className="celebration-skip" onClick={skipAll}>
          スキップ ▸▸
        </button>
      )}
    </div>
  );
}
