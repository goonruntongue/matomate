// Debug panel: open the app with "?debug" in the URL (works on phones too).
// Jump to any level / star count to check titles, replay the clear celebration, remove the 👑 badge.
import { useState } from 'react';
import { MAX_LEVEL, STARS_TO_LEVEL_UP, TITLES } from '../game/levels';
import { useGame } from '../state/store';

const enabled = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export function DebugPanel() {
  const level = useGame((s) => s.level);
  const levelStars = useGame((s) => s.levelStars);
  const clears = useGame((s) => s.clears);
  const [open, setOpen] = useState(true);
  const [pickLevel, setPickLevel] = useState(level);
  const [pickStars, setPickStars] = useState(0);
  const [previewLevel, setPreviewLevel] = useState(2);
  if (!enabled) return null;
  const { debugSetProgress, debugCelebrate, debugClearBadge, debugPreviewLevelUp, openGallery } = useGame.getState();

  if (!open) {
    return (
      <button type="button" className="debug-toggle" onClick={() => setOpen(true)}>
        DEBUG
      </button>
    );
  }

  return (
    <div className="debug-panel" role="dialog" aria-label="デバッグ">
      <div className="debug-head">
        <b>DEBUG</b>
        <button type="button" className="btn-mini" aria-label="たたむ" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
      <p className="debug-now">
        いま: LV{level} ★{levelStars} ・ {TITLES[level - 1]} ・ 👑×{clears.count}
      </p>
      <label>
        レベル
        <select value={pickLevel} onChange={(e) => setPickLevel(Number(e.target.value))}>
          {Array.from({ length: MAX_LEVEL }, (_, i) => (
            <option key={i} value={i + 1}>
              LV{i + 1} {TITLES[i]}
            </option>
          ))}
        </select>
      </label>
      <label>
        ★（次まで）
        <select value={pickStars} onChange={(e) => setPickStars(Number(e.target.value))}>
          {Array.from({ length: STARS_TO_LEVEL_UP }, (_, i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn" onClick={() => debugSetProgress(pickLevel, pickStars)}>
        このレベルにする
      </button>
      <label>
        レベルアップ演出
        <select value={previewLevel} onChange={(e) => setPreviewLevel(Number(e.target.value))}>
          {Array.from({ length: MAX_LEVEL - 1 }, (_, i) => (
            <option key={i} value={i + 2}>
              LV{i + 1}→LV{i + 2} {TITLES[i + 1]}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn" onClick={() => debugPreviewLevelUp(previewLevel)}>
        レベルアップ演出をプレビュー
      </button>
      <button type="button" className="btn" onClick={() => openGallery()}>
        図鑑を開く
      </button>
      <button type="button" className="btn" onClick={debugCelebrate}>
        クリア演出を再生（👑+1）
      </button>
      <button type="button" className="btn" onClick={debugClearBadge}>
        👑バッジを消す
      </button>
      <p className="debug-tip">★を4にして答え合わせで★を取ると、レベルアップ（LV10ならクリア）を本番どおり確認できます。</p>
    </div>
  );
}
