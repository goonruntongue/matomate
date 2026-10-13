// The settings panel (header, far right; T key). Display settings for everyone (SPEC 5.6), the
// controls the narrow header hides (passed in as children), and the feel tuning under 上級.
import { useEffect, type ReactNode } from 'react';
import { useGame, type Motion, type TextSize, type Tuning } from '../state/store';
import { THEME_IDS, type ThemeId } from '../theme/themes';
import { useDialog } from './useDialog';

const FIELDS: { key: Exclude<keyof Tuning, 'guide'>; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'floatAmp', label: '浮遊の振れ幅', min: 0, max: 0.4, step: 0.01 },
  { key: 'floatSpeed', label: '浮遊の速さ', min: 0, max: 2, step: 0.05 },
  { key: 'throwSpeed', label: 'スロー判定の速度', min: 300, max: 2000, step: 50, unit: 'px/s' },
  { key: 'aimAngle', label: 'エイムアシスト角', min: 0, max: 45, step: 1, unit: '°' },
  { key: 'hitExpand', label: 'ドロップ判定の広さ', min: 1, max: 1.8, step: 0.05, unit: '×' },
  { key: 'parallax', label: 'カメラ視差', min: 0, max: 1, step: 0.05 },
  { key: 'bloom', label: 'ブルーム', min: 0, max: 2, step: 0.05 },
];

const TEXT_SIZES: { id: TextSize; label: string }[] = [
  { id: 'normal', label: '標準' },
  { id: 'large', label: '大' },
];
const MOTIONS: { id: Motion; label: string }[] = [
  { id: 'full', label: '標準' },
  { id: 'reduced', label: '控えめ' },
  { id: 'off', label: '停止' },
];

/** A row of radio buttons that looks like a segmented control. */
function Segmented<T extends string>(props: { name: string; legend: string; note?: string; options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="settings-field">
      <legend>{props.legend}</legend>
      <div className="segmented">
        {props.options.map((o) => (
          <label key={o.id} className={props.value === o.id ? 'is-on' : undefined}>
            <input type="radio" name={props.name} value={o.id} checked={props.value === o.id} onChange={() => props.onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
      {props.note && <small>{props.note}</small>}
    </fieldset>
  );
}

export function SettingsPanel({ children }: { children?: ReactNode }) {
  const open = useGame((s) => s.tuningOpen);
  const tuning = useGame((s) => s.tuning);
  const prefs = useGame((s) => s.prefs);
  const theme = useGame((s) => s.theme);
  const { setTuning, resetTuning, toggleTuning, setPrefs, setTheme } = useGame.getState();
  const dialog = useDialog<HTMLDivElement>(toggleTuning, open);

  // A tap / click outside closes it (the header button toggles it itself).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest('.settings, [data-settings-toggle]')) useGame.getState().toggleTuning();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  if (!open) return null;
  return (
    <div className="settings" role="dialog" aria-labelledby="settings-title" ref={dialog}>
      <div className="settings-head">
        <div>
          <p className="kicker">SETTINGS</p>
          <h2 id="settings-title">設定</h2>
        </div>
        <button type="button" className="btn-icon" aria-label="閉じる" onClick={toggleTuning}>
          ×
        </button>
      </div>

      {children && <section className="settings-more" aria-label="ゲーム">{children}</section>}

      <section className="settings-group" aria-label="表示">
        <label className="settings-field">
          <span className="settings-legend">デザイン</span>
          <select value={theme} onChange={(e) => setTheme(e.target.value as ThemeId)}>
            {THEME_IDS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <Segmented name="text-size" legend="文字サイズ" options={TEXT_SIZES} value={prefs.textSize} onChange={(textSize) => setPrefs({ textSize })} />
        <Segmented
          name="motion"
          legend="モーション"
          note={prefs.motion === 'full' ? undefined : prefs.motion === 'reduced' ? 'ブロックの浮遊、カメラの揺れ、3Dの演出を止めます' : 'アニメーションをすべて止めます'}
          options={MOTIONS}
          value={prefs.motion}
          onChange={(motion) => setPrefs({ motion })}
        />
        <label className="settings-check">
          <input type="checkbox" checked={prefs.colorAssist} onChange={(e) => setPrefs({ colorAssist: e.target.checked })} />
          <span>
            色覚サポート
            <small>箱の記号（◆●▲■★）を大きくし、箱の中のブロックにも付けます</small>
          </span>
        </label>
      </section>

      <details className="settings-advanced">
        <summary>操作の調整（上級）</summary>
        {FIELDS.map((f) => (
          <label key={f.key} className="tuning-row">
            <span>{f.label}</span>
            <input
              type="range"
              min={f.min}
              max={f.max}
              step={f.step}
              value={tuning[f.key]}
              onChange={(e) => setTuning({ [f.key]: Number(e.target.value) })}
            />
            <span className="num">
              {tuning[f.key]}
              {f.unit ?? ''}
            </span>
          </label>
        ))}
        <label className="tuning-check">
          <input type="checkbox" checked={tuning.guide} onChange={(e) => setTuning({ guide: e.target.checked })} />
          軌道ガイドを表示
        </label>
        <button type="button" className="btn" onClick={resetTuning}>
          初期値に戻す
        </button>
      </details>
    </div>
  );
}
