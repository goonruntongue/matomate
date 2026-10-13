import { useEffect, useMemo, useState } from 'react';
import { PROBLEMS } from '../data/problems';
import { coach, GUIDE_STEPS } from '../hints/guide';
import { useGame } from '../state/store';

/** Thinking guide: a procedure (not answers) + a coach that points at the current step. */
export function HintPanel() {
  const open = useGame((s) => s.hintOpen);
  const items = useGame((s) => s.items);
  const assign = useGame((s) => s.assign);
  const trays = useGame((s) => s.trays);
  const problemIndex = useGame((s) => s.problemIndex);
  const axisHintShown = useGame((s) => s.axisHintShown);
  const { toggleHint, revealAxisHint } = useGame.getState();
  const problem = PROBLEMS[problemIndex];

  const advice = useMemo(() => {
    const sorted = items.filter((item) => assign[item.id]).length;
    return coach({
      total: items.length,
      sorted,
      trays: trays.map((tray) => ({
        label: tray.label,
        contents: items.filter((item) => assign[item.id] === tray.id).map((item) => item.text),
      })),
    });
  }, [items, assign, trays]);

  // Follow the coach until the player opens another step themselves.
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [advice.step]);
  const expanded = picked ?? advice.step;

  if (!open) return null;

  return (
    <aside className="hint-panel" aria-label="考え方ガイド">
      <div className="hint-panel-head">
        <div>
          <p className="kicker">THINKING GUIDE</p>
          <h2>考え方ガイド</h2>
        </div>
        <button type="button" className="btn-mini" aria-label="考え方ガイドを閉じる" onClick={toggleHint}>
          ×
        </button>
      </div>

      <section className="hint-brief">
        <p className="hint-caption">お題</p>
        <p className="hint-brief-title">{problem.title}</p>
        <p>
          <b>だれが</b> {problem.brief.user}
          <br />
          <b>どんなとき</b> {problem.brief.scene}
          <br />
          <b>何のため</b> {problem.brief.goal}
        </p>
      </section>

      <section className="hint-coach" aria-live="polite">
        <p className="hint-caption">
          いまのあなたへ ・ STEP {advice.step + 1}
        </p>
        <ul>
          {advice.tips.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>

      <ol className="hint-steps">
        {GUIDE_STEPS.map((step, i) => {
          const isOpen = expanded === i;
          return (
            <li key={step.title} className={`hint-step${isOpen ? ' is-open' : ''}${advice.step === i ? ' is-current' : ''}`}>
              <button type="button" className="hint-step-head" aria-expanded={isOpen} onClick={() => setPicked(isOpen ? -1 : i)}>
                <span className="hint-step-no num">{i + 1}</span>
                <span>{step.title}</span>
              </button>
              {isOpen && (
                <div className="hint-step-body">
                  <p className="hint-why">{step.why}</p>
                  <ul>
                    {step.todo.map((line) => (
                      <li key={line} className={line.startsWith('・') ? 'is-sub' : undefined}>
                        {line.replace(/^・/, '')}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <section className="hint-axis">
        {axisHintShown ? (
          <>
            <p className="hint-caption">このお題の切り口ヒント</p>
            <p>{problem.axisHint}</p>
          </>
        ) : (
          <>
            <p className="hint-caption">それでも迷ったら</p>
            <button type="button" className="btn" onClick={revealAxisHint}>
              このお題の切り口ヒントを見る
            </button>
            <p className="hint-note">使ったことは記録されます（採点を入れる P1 から、少し減点になる予定です）。</p>
          </>
        )}
      </section>
    </aside>
  );
}
