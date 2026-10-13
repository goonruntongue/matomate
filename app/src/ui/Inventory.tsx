import { useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import * as audio from '../audio';
import { assistAll, assistSome, SOME_COUNT } from '../game/assist';
import { sendTo } from '../game/input';
import { levelDef } from '../game/levels';
import { labelIssues } from '../hints/labelRules';
import { TRAY_GLYPHS, useGame, type Tray } from '../state/store';
import { THEMES } from '../theme/themes';

export function Inventory() {
  const trays = useGame((s) => s.trays);
  const items = useGame((s) => s.items);
  const assign = useGame((s) => s.assign);
  const selected = useGame((s) => s.selected);
  const mode = useGame((s) => s.mode);
  const level = useGame((s) => s.level);
  const { select } = useGame.getState();
  const unsorted = useMemo(() => items.filter((item) => !assign[item.id]), [items, assign]);

  return (
    <aside className="pane" aria-label="トレイと中身">
      <div className="pane-head">
        <div>
          <p className="kicker">{mode === 'level' ? `LEVEL ${level} ・ ${levelDef(level).title}` : 'YOUR TRAYS'}</p>
          <h2>
            トレイ <span className="num">{trays.length}</span>
          </h2>
          <p className="pane-sub">
            {mode === 'level'
              ? levelDef(level).goal
              : `キーワード${items.length}個 → ${trays.length}箱（1箱あたり約${Math.round(items.length / trays.length)}個）`}
          </p>
        </div>
      </div>
      <SubmitBar />
      <AssistBar />
      <div className="pane-list">
        {trays.map((tray, i) => (
          <TrayCard key={tray.id} tray={tray} index={i} />
        ))}
      </div>
      <details className="unsorted">
        <summary>
          ペンディングエリア（未分類） <span className="num">{unsorted.length}</span>
        </summary>
        <p className="kbd-note">キーボード：ブロックを選んで、1〜{trays.length} キーで箱へ。Ctrl+Z で元に戻す</p>
        <div className="chips">
          {unsorted.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`chip${selected === item.id ? ' is-selected' : ''}`}
              aria-pressed={selected === item.id}
              onClick={() => select(selected === item.id ? null : item.id)}
            >
              {item.text}
            </button>
          ))}
        </div>
      </details>
    </aside>
  );
}

/**
 * The goal of a round: "答え合わせ" once every block is in a tray (and labels are filled when the level asks).
 * After checking, the board is locked and the bar offers the result and the next round.
 */
function SubmitBar() {
  const items = useGame((s) => s.items);
  const assign = useGame((s) => s.assign);
  const trays = useGame((s) => s.trays);
  const mode = useGame((s) => s.mode);
  const level = useGame((s) => s.level);
  const result = useGame((s) => s.result);
  const resultOpen = useGame((s) => s.resultOpen);
  const { submit, openResult, newRound, nudgeSubmit } = useGame.getState();

  const pending = items.filter((item) => !assign[item.id]).length;
  const labelsRequired = mode === 'free' || levelDef(level).labelsRequired;
  const unlabeled = trays.filter((tray) => !tray.label.trim()).length;
  const checks = [
    { ok: pending === 0, text: pending === 0 ? 'すべて箱に入れた' : `ペンディングエリアにあと${pending}個` },
    ...(labelsRequired
      ? [{ ok: unlabeled === 0, text: unlabeled === 0 ? 'すべての箱に名前を付けた' : `名前のない箱があと${unlabeled}つ` }]
      : []),
  ];
  const ready = checks.every((c) => c.ok);

  if (result) {
    return (
      <section className="submit is-done" aria-label="答え合わせの結果">
        <p className="submit-title">
          答え合わせ済み ・ {result.total}個中{result.correct}個 正解 ・ {'★'.repeat(result.stars) || '★0'}
        </p>
        <div className="submit-buttons">
          {!resultOpen && (
            <button type="button" className="btn" onClick={openResult}>
              結果を見る
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={newRound}>
            次の問題へ
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={`submit${ready ? ' is-ready' : ''}`} aria-label="答え合わせ">
      <ul className="submit-checks">
        {checks.map((c) => (
          <li key={c.text} className={c.ok ? 'ok' : undefined}>
            <span aria-hidden="true">{c.ok ? '✓' : '・'}</span> {c.text}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`btn btn-primary submit-button${ready ? '' : ' is-blocked'}`}
        aria-disabled={!ready}
        onClick={() => (ready ? submit() : nudgeSubmit(pending > 0 ? 'pending' : 'labels'))}
      >
        答え合わせ
      </button>
    </section>
  );
}

/** "おまかせ仕分け": blocks drop themselves from the pending area into trays, with a staggered animation. */
function AssistBar() {
  const pendingCount = useGame((s) => s.items.reduce((n, item) => (s.assign[item.id] ? n : n + 1), 0));
  const locked = useGame((s) => s.result !== null);
  const [busy, setBusy] = useState(false);
  if (locked) return null;

  const run = (kind: 'some' | 'all') => {
    const game = useGame.getState();
    const sorted = game.items.length - pendingCount;
    if (
      kind === 'all' &&
      sorted > 0 &&
      !window.confirm('今の仕分けを模範の分け方に並べ替えて、ラベル付けの練習にします（入力済みのラベルは残ります）。よろしいですか？')
    ) {
      return;
    }
    const sent = kind === 'all' ? assistAll() : assistSome();
    if (!sent) return;
    // Buttons stay disabled until the last scheduled drop has landed.
    setBusy(true);
    const gap = kind === 'all' ? 90 : 260;
    window.setTimeout(() => setBusy(false), 300 + sent * gap + 900);
  };

  return (
    <section className="assist" aria-label="おまかせ仕分け">
      <p className="assist-title">おまかせ仕分け</p>
      <div className="assist-buttons">
        <button type="button" className="btn" disabled={busy || pendingCount === 0} onClick={() => run('some')}>
          少しおまかせ（{Math.min(SOME_COUNT, pendingCount)}個）
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => run('all')}>
          全部おまかせ・ラベル練習
        </button>
      </div>
      <p className="assist-note">ペンディングエリアから、模範の分け方でブロックが箱へ飛び込みます。使ったことは記録されます。</p>
    </section>
  );
}

function TrayCard({ tray, index }: { tray: Tray; index: number }) {
  const items = useGame((s) => s.items);
  const assign = useGame((s) => s.assign);
  const assignedAt = useGame((s) => s.assignedAt);
  const isTarget = useGame((s) => s.dragTarget === tray.id);
  const { setLabel, moveItem } = useGame.getState();
  const contents = useMemo(
    () =>
      items
        .filter((item) => assign[item.id] === tray.id)
        .sort((a, b) => (assignedAt[a.id] ?? 0) - (assignedAt[b.id] ?? 0)),
    [items, assign, assignedAt, tray.id],
  );
  const color = THEMES[useGame((s) => s.theme)].trayColors[tray.colorIndex];
  const trays = useGame((s) => s.trays);
  const locked = useGame((s) => s.result !== null);
  const full = tray.capacity !== undefined && contents.length >= tray.capacity;
  // Live label hint: only the most important issue, and not the "empty" error (the checklist covers that).
  const issue = useMemo(() => {
    const others = trays.filter((other) => other.id !== tray.id).map((other) => other.label);
    return labelIssues(
      tray.label,
      contents.map((item) => item.text),
      others,
    ).find((i) => i.level !== 'error');
  }, [trays, tray.id, tray.label, contents]);

  const onCardClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button')) return;
    const selected = useGame.getState().selected;
    if (selected) sendTo(selected, tray.id);
  };

  return (
    <section
      className={`tray-card${isTarget ? ' is-target' : ''}`}
      data-tray-id={tray.id}
      style={{ '--tray': color, '--glyph': `"${TRAY_GLYPHS[tray.colorIndex]}"` } as CSSProperties}
      onClick={onCardClick}
    >
      <header className="tray-card-head">
        <span className="tray-glyph" aria-hidden="true">
          {TRAY_GLYPHS[tray.colorIndex]}
        </span>
        <span className="tray-index">TRAY {index + 1}</span>
        <span className={`tray-count num${full ? ' is-full' : ''}`}>
          {String(contents.length).padStart(2, '0')}
          {tray.capacity !== undefined && <small>/{String(tray.capacity).padStart(2, '0')}</small>}
        </span>
      </header>
      <input
        className="tray-label"
        value={tray.label}
        placeholder="ラベルを入力"
        maxLength={20}
        readOnly={locked}
        aria-label={`トレイ${index + 1}のラベル`}
        onChange={(e) => setLabel(tray.id, e.target.value)}
        onKeyDown={(e) => {
          // Enter during IME conversion confirms the conversion, not the field.
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) e.currentTarget.blur();
        }}
      />
      {issue && (
        <p className={`label-hint is-${issue.level}`} role="status">
          {issue.message}
        </p>
      )}
      <div className="chips">
        {contents.length ? (
          contents.map((item) => (
            <button
              type="button"
              key={item.id}
              className="chip"
              title={`${item.desc}（クリックでペンディングエリアに戻す）`}
              disabled={locked}
              onClick={() => {
                moveItem(item.id, null);
                audio.drop();
              }}
            >
              {item.text}
              {!locked && <span aria-hidden="true">×</span>}
            </button>
          ))
        ) : (
          <p className="empty">ここにドロップ／投げ入れ</p>
        )}
      </div>
    </section>
  );
}
