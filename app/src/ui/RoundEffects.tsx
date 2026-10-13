// Small celebrations after an answer check (smaller than the final clear):
//   clear   (★1+)     → glittering confetti burst + "CLEAR!" / "PERFECT!" + one-line praise
//   levelup           → party poppers + cheers + "LEVEL UP!" with the new title, then the new character
// The result panel is held back until the banner has played, then opens under the falling confetti.
// Result sounds (stars, fanfare) are played here for every answer check.
import { lazy, Suspense, useEffect, useState } from 'react';
import * as audio from '../audio';
import { cheerFor, levelUpCheer } from '../game/cheers';
import type { CelebrationVariant } from '../game/CelebrationScene';
import { titleFor } from '../game/levels';
import { useGame } from '../state/store';
import { SafeBoundary } from './SafeBoundary';

const CelebrationScene = lazy(() => import('../game/CelebrationScene'));
// Level up lingers (~5.5s) so the poppers, the banner and the falling confetti can be enjoyed.
const DURATION: Record<'clear' | 'levelup', number> = { clear: 2600, levelup: 7000 };
/** When the result panel opens (the banner is gone by then). */
const HOLD: Record<'clear' | 'levelup', number> = { clear: 1500, levelup: 5600 };

interface Show {
  id: number;
  variant: Extract<CelebrationVariant, 'clear' | 'levelup'>;
  heading: string;
  sub: string | null;
  cheer: string | null;
}

export function RoundEffects() {
  const [show, setShow] = useState<Show | null>(null);

  useEffect(() => {
    let id = 0;
    return useGame.subscribe((s, prev) => {
      const result = s.result;
      if (!result || s.submitSeq === prev.submitSeq) return;
      audio.stars(result.stars);
      if (s.celebrating) return; // the final clear takes over
      const cheer = cheerFor(result, s.levelUpTo);
      let variant: Show['variant'] | null = null;
      if (s.levelUpTo) {
        variant = 'levelup';
        window.setTimeout(() => audio.fanfare(), 700);
        setShow({ id: ++id, variant, heading: 'LEVEL UP!', sub: `LV ${s.levelUpTo} ・ ${titleFor(s.levelUpTo)}`, cheer });
      } else if (result.stars >= 1) {
        variant = 'clear';
        setShow({ id: ++id, variant, heading: result.correct === result.total ? 'PERFECT!' : 'CLEAR!', sub: null, cheer });
      }
      if (!variant) return;
      useGame.setState({ resultOpen: false });
      const levelUpTo = s.levelUpTo;
      window.setTimeout(() => {
        const now = useGame.getState();
        if (now.result !== result) return;
        // A level up reveals the new character first; closing it opens the result.
        if (levelUpTo) now.showReveal(levelUpTo - 1);
        else now.openResult();
      }, HOLD[variant]);
    });
  }, []);

  // Debug preview (?debug): the same level-up show for any level, without touching progress.
  useEffect(() => {
    let id = 1000;
    return useGame.subscribe((s, prev) => {
      if (s.previewSeq === prev.previewSeq) return;
      const level = s.previewLevel;
      audio.stars(3);
      window.setTimeout(() => audio.fanfare(), 700);
      setShow({ id: ++id, variant: 'levelup', heading: 'LEVEL UP!', sub: `LV ${level} ・ ${titleFor(level)}`, cheer: levelUpCheer(level) });
      window.setTimeout(() => useGame.getState().showReveal(level - 1, true), HOLD.levelup);
    });
  }, []);

  useEffect(() => {
    if (!show) return;
    const t = window.setTimeout(() => setShow(null), DURATION[show.variant]);
    return () => window.clearTimeout(t);
  }, [show]);

  if (!show) return null;
  return (
    <div key={show.id} className={`round-fx is-${show.variant}`} aria-hidden="true">
      {useGame.getState().prefs.motion === 'full' && (
        <SafeBoundary>
          <Suspense fallback={null}>
            <CelebrationScene variant={show.variant} />
          </Suspense>
        </SafeBoundary>
      )}
      <div className="round-fx-banner">
        <p className="round-fx-heading">{show.heading}</p>
        {show.sub && <p className="round-fx-sub">{show.sub}</p>}
        {show.cheer && <p className="round-fx-cheer">{show.cheer}</p>}
      </div>
    </div>
  );
}
