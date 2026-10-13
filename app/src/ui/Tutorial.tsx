// Fix 7: an animated "how to play". Shown once on the first visit, and any time from the header
// ("？ 遊び方"). Each step is a small looping CSS animation of the real gesture.
import { useEffect, useState } from 'react';
import { useGame } from '../state/store';
import { useDialog } from './useDialog';

export const TUTORIAL_SEEN_KEY = 'practice-ia:tutorial-seen';

interface Step {
  title: string;
  text: string;
  scene: 'throw' | 'tap' | 'name' | 'check';
}

const STEPS: Step[] = [
  { title: 'ブロックを箱に投げ入れる', text: 'キーワードのブロックをつかんで、箱の方へ投げます（スマホはスワイプ）。', scene: 'throw' },
  { title: 'タップでも入れられる', text: 'ブロックをタップして選び、入れたい箱をタップしても入ります。', scene: 'tap' },
  { title: '箱に名前を付ける', text: '中身をひと言で表すラベルを付けます。お題の人が探しやすい言葉で。', scene: 'name' },
  { title: '答え合わせで★を集める', text: '★を5つ集めるとレベルアップ。新しい称号とキャラクターが手に入ります。', scene: 'check' },
];

function Scene({ scene }: { scene: Step['scene'] }) {
  return (
    <div className={`tut-scene is-${scene}`} aria-hidden="true">
      <div className="tut-trays">
        <div className="tut-tray is-a">
          <span className="tut-label">{scene === 'name' ? <span className="tut-typing">野菜</span> : scene === 'check' ? '野菜' : ''}</span>
          {(scene === 'name' || scene === 'check') && (
            <>
              <i className="tut-mini">トマト</i>
              <i className="tut-mini is-2">キャベツ</i>
            </>
          )}
        </div>
        <div className="tut-tray is-b">
          <span className="tut-label">{scene === 'check' ? '飲み物' : ''}</span>
          {scene === 'check' && <i className="tut-mini">牛乳</i>}
        </div>
      </div>
      {(scene === 'throw' || scene === 'tap') && <div className="tut-block">トマト</div>}
      {scene !== 'check' && scene !== 'name' && <div className="tut-hand">👆</div>}
      {scene === 'name' && <div className="tut-caret" />}
      {scene === 'check' && (
        <>
          <div className="tut-button">答え合わせ</div>
          <div className="tut-hand is-check">👆</div>
          <div className="tut-stars">
            <span>★</span>
            <span>★</span>
            <span>★</span>
          </div>
        </>
      )}
    </div>
  );
}

export function Tutorial() {
  const open = useGame((s) => s.tutorialOpen);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const dialog = useDialog<HTMLDivElement>(() => close(), open);
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem(TUTORIAL_SEEN_KEY, '1');
    } catch {
      /* private mode: show again next time */
    }
    useGame.getState().closeTutorial();
  };
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="tut-modal" role="dialog" aria-modal="true" aria-labelledby="tut-title" ref={dialog}>
      <div className="tut-card">
        <header className="tut-head">
          <p className="kicker">
            HOW TO PLAY <span className="num">{step + 1}/{STEPS.length}</span>
          </p>
          <button type="button" className="btn-mini" onClick={close}>
            スキップ
          </button>
        </header>
        <Scene key={s.scene} scene={s.scene} />
        <h2 id="tut-title">{s.title}</h2>
        <p className="tut-text">{s.text}</p>
        <div className="tut-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <i key={i} className={i === step ? 'on' : undefined} />
          ))}
        </div>
        <div className="tut-actions">
          <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}>
            ← 戻る
          </button>
          <button type="button" className="btn btn-primary" autoFocus onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? 'はじめる' : '次へ →'}
          </button>
        </div>
      </div>
    </div>
  );
}
