// AI ENERGY meter (SPEC 4.8): ten segments + %, colored by mode, details on demand.
// "Neurons" never appears here. In the header on wide screens; on phones inside the settings panel.
import { useEffect, useState } from 'react';
import { MODE_LABEL, useAi, type AiMode } from '../api';
import { useDialog } from './useDialog';

const SEGMENTS = 10;

function Bar({ pct, mode }: { pct: number | null; mode: AiMode | null }) {
  const lit = pct === null ? 0 : Math.ceil((pct / 100) * SEGMENTS);
  return (
    <span className={`ai-bar is-${mode ?? 'none'}`} aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <i key={i} className={i < lit ? 'on' : undefined} />
      ))}
    </span>
  );
}

/** "09:00 JST（あと 3時間12分）" */
function recharge(resetAt: string, now = Date.now()) {
  const ms = Math.max(0, Date.parse(resetAt) - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `09:00 JST（あと ${h ? `${h}時間` : ''}${m}分）`;
}

/** The text of the meter: used in the header popover and in the settings panel. */
export function AiEnergyDetails() {
  const { state, status, quota, refresh } = useAi();
  if (state === 'unconfigured') {
    return <p className="ai-note">AI による出題と評価は準備中です。いまは内蔵の問題とローカル採点で遊べます。</p>;
  }
  if (state === 'unavailable') {
    return (
      <>
        <p className="ai-note">AI のサーバーに接続できません。内蔵の問題とローカル採点で、そのまま遊べます。</p>
        <button type="button" className="btn" onClick={() => void refresh()}>
          もう一度つなぐ
        </button>
      </>
    );
  }
  if (!status) return <p className="ai-note">読み込み中…</p>;
  return (
    <dl className="ai-details">
      <div>
        <dt>本日のAIエネルギー（全員共有）</dt>
        <dd className="num">{status.remainingPct}%</dd>
      </div>
      <div>
        <dt>残りの目安</dt>
        <dd>
          問題生成 あと約{status.estGen}回 ／ AI評価 あと約{status.estEval}回
        </dd>
      </div>
      {quota && quota.evalMax !== null && (
        <div>
          <dt>あなたの今日の残り</dt>
          <dd>
            AI評価 {quota.evalLeft}/{quota.evalMax} ・ テーマ指定生成 {quota.genLeft}/{quota.genMax}
          </dd>
        </div>
      )}
      <div>
        <dt>リチャージ</dt>
        <dd>{recharge(status.resetAt)}</dd>
      </div>
      <div>
        <dt>現在のモード</dt>
        <dd>{MODE_LABEL[status.mode]}</dd>
      </div>
      <p className="ai-note">AI による出題と評価は準備中です（いまは内蔵の問題で遊べます）。</p>
    </dl>
  );
}

function Popover({ onClose }: { onClose: () => void }) {
  const dialog = useDialog<HTMLDivElement>(onClose);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest('.ai-popover, .ai-meter')) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [onClose]);
  return (
    <div className="ai-popover" role="dialog" aria-label="AIエネルギー" ref={dialog}>
      <p className="kicker">AI ENERGY</p>
      <AiEnergyDetails />
    </div>
  );
}

/** Header meter (wide screens). */
export function AiEnergyMeter() {
  const { state, status } = useAi();
  const [open, setOpen] = useState(false);
  const pct = state === 'ready' && status ? status.remainingPct : null;
  const label = pct === null ? (state === 'unconfigured' ? '準備中' : state === 'unavailable' ? '接続なし' : '…') : `${pct}%`;
  return (
    <div className="hud-ai">
      <button
        type="button"
        className="ai-meter"
        aria-expanded={open}
        aria-label={`AIエネルギー ${label}${status ? `、モード ${MODE_LABEL[status.mode]}` : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="kicker">AI ENERGY</span>
        <Bar pct={pct} mode={status?.mode ?? null} />
        <span className="num ai-pct">{label}</span>
      </button>
      {open && <Popover onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Settings panel (phones): the bar and the details inline. */
export function AiEnergySection() {
  const { state, status } = useAi();
  const pct = state === 'ready' && status ? status.remainingPct : null;
  return (
    <section className="settings-ai" aria-label="AIエネルギー">
      <p className="settings-legend">
        AIエネルギー <Bar pct={pct} mode={status?.mode ?? null} />
      </p>
      <AiEnergyDetails />
    </section>
  );
}
