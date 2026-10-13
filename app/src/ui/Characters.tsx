// Characters: the level-up reveal ("新しい姿を手に入れた！") and the character gallery (魔法使い図鑑).
// The 3D viewer is lazy-loaded so the models and viewer code only download when first needed.
import { lazy, Suspense } from 'react';
import { CHARACTER_COUNT, characterLabel, characterTitle, LEGEND_INDEX } from '../game/characters';
import { useFace } from '../game/faces';
import { useGame } from '../state/store';
import { SafeBoundary } from './SafeBoundary';
import { useDialog } from './useDialog';

const CharacterViewer = lazy(() => import('../game/CharacterViewer'));

function Viewer({ index, locked = false }: { index: number; locked?: boolean }) {
  return (
    <div className="char-stage">
      <SafeBoundary key={`${index}-${locked}`} fallback={<div className="char-loading">オフラインのため表示できません（一度オンラインで見たキャラは表示できます）</div>}>
        <Suspense fallback={<div className="char-loading">LOADING…</div>}>
          <CharacterViewer index={index} locked={locked} className="char-canvas" />
        </Suspense>
      </SafeBoundary>
      {!locked && <p className="char-hint">ドラッグ／スワイプで回せます</p>}
    </div>
  );
}

export function isUnlocked(index: number, bestLevel: number, clears: number): boolean {
  if (clears > 0) return true;
  return index < LEGEND_INDEX && index < bestLevel;
}

function SlotFace({ index, unlocked }: { index: number; unlocked: boolean }) {
  const face = useFace(index);
  return (
    <>
      {unlocked && face && <img className="char-slot-face" src={face} alt="" draggable={false} />}
      <span className="char-slot-no">{index >= LEGEND_INDEX ? '👑' : index + 1}</span>
    </>
  );
}

/** After the LEVEL UP banner: the new character on its pedestal. */
export function CharacterReveal() {
  const reveal = useGame((s) => s.reveal);
  const closeReveal = useGame((s) => s.closeReveal);
  const dialog = useDialog<HTMLDivElement>(closeReveal, !!reveal);
  if (!reveal) return null;
  return (
    <div className="char-modal is-reveal" role="dialog" aria-modal="true" aria-label="新しい姿" ref={dialog}>
      <div className="char-card">
        <p className="kicker">NEW CHARACTER</p>
        <h2 className="char-reveal-title">新しい姿を手に入れた！</h2>
        <Viewer index={reveal.index} />
        <p className="char-name">
          <span className="num">{characterLabel(reveal.index)}</span> {characterTitle(reveal.index)}
        </p>
        <p className="char-note">いつでもヘッダーの「📖 図鑑」から見返せます。</p>
        <button type="button" className="btn btn-primary char-ok" autoFocus onClick={closeReveal}>
          {reveal.preview ? '閉じる（プレビュー）' : '結果を見る'}
        </button>
      </div>
    </div>
  );
}

/** The character gallery: every title's character; locked ones appear as silhouettes. */
export function CharacterGallery() {
  const open = useGame((s) => s.galleryOpen);
  const index = useGame((s) => s.galleryIndex);
  const bestLevel = useGame((s) => s.bestLevel);
  const clears = useGame((s) => s.clears.count);
  const closeGallery = useGame((s) => s.closeGallery);
  const openGallery = useGame((s) => s.openGallery);
  if (!open) return null;
  const unlocked = isUnlocked(index, bestLevel, clears);
  const got = Array.from({ length: CHARACTER_COUNT }, (_, i) => isUnlocked(i, bestLevel, clears)).filter(Boolean).length;
  return <GalleryBody {...{ index, unlocked, got, bestLevel, clears, closeGallery, openGallery }} />;
}

function GalleryBody(props: {
  index: number;
  unlocked: boolean;
  got: number;
  bestLevel: number;
  clears: number;
  closeGallery: () => void;
  openGallery: (i: number) => void;
}) {
  const { index, unlocked, got, bestLevel, clears, closeGallery, openGallery } = props;
  const dialog = useDialog<HTMLDivElement>(closeGallery);
  return (
    <div className="char-modal" role="dialog" aria-modal="true" aria-labelledby="gallery-title" onMouseDown={closeGallery} ref={dialog}>
      <div className="char-card is-gallery" onMouseDown={(e) => e.stopPropagation()}>
        <header className="char-head">
          <div>
            <p className="kicker">COLLECTION</p>
            <h2 id="gallery-title">
              魔法使い図鑑 <small className="num">{got}/{CHARACTER_COUNT}</small>
            </h2>
          </div>
          <button type="button" className="btn-icon" aria-label="閉じる" onClick={closeGallery}>
            ×
          </button>
        </header>
        <Viewer index={index} locked={!unlocked} />
        <p className="char-name">
          <span className="num">{characterLabel(index)}</span> {unlocked ? characterTitle(index) : '？？？'}
        </p>
        {!unlocked && <p className="char-note">{index >= LEGEND_INDEX ? 'LV10 の最終試験に合格すると解放' : `LV ${index + 1} に到達すると解放`}</p>}
        <div className="char-slots" role="tablist" aria-label="キャラクター">
          {Array.from({ length: CHARACTER_COUNT }, (_, i) => {
            const on = isUnlocked(i, bestLevel, clears);
            return (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                className={`char-slot${on ? ' is-on' : ''}${i === index ? ' is-current' : ''}${i >= LEGEND_INDEX ? ' is-legend' : ''}`}
                title={on ? characterTitle(i) : '未解放'}
                onClick={() => openGallery(i)}
              >
                <SlotFace index={i} unlocked={on} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
