// The player's character in the corner of the stage, reacting to the game, with a speech bubble
// for moments outside the answer check (everything placed, a new form). During the result it
// stays behind the result card; the comment there speaks for it.
// It stays mounted (hidden with CSS) so the 3D model isn't rebuilt every round.
// The block field keeps its corner free (a keep-out, see buddyCornerPx), so it stays visible without
// covering blocks; rows below it use the full width. "awake" only gates the speech bubble.
// On narrow screens the trays stack under the stage; once the stage scrolls away, it follows down
// and stands on the 答え合わせ button (or at the top of the screen past it) — see useDock.
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { currentCharacterIndex } from '../game/characters';
import { dom } from '../game/runtime';
import { useGame } from '../state/store';
import type { Reaction } from '../game/BuddyScene';
import { SafeBoundary } from './SafeBoundary';

const BuddyScene = lazy(() => import('../game/BuddyScene'));
const scene = () => import('../game/BuddyScene');
const react = (r: Reaction) => void scene().then((m) => m.cue(r));

/** Drag / swipe sideways to turn (pan) the character, up/down to tilt it; a tap makes it hop. */
function useTurn() {
  const last = useRef({ x: 0, y: 0, t: 0, moved: 0 });
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (document.body.classList.contains('is-dragging')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    void scene().then(({ buddySpin }) => {
      buddySpin.dragging = true;
      buddySpin.vel = 0;
      buddySpin.lastTouch = performance.now();
    });
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const now = performance.now();
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    const dtS = Math.max(0.001, (now - last.current.t) / 1000);
    last.current = { x: e.clientX, y: e.clientY, t: now, moved: last.current.moved + Math.abs(dx) + Math.abs(dy) };
    void scene().then(({ buddySpin, PITCH_MIN, PITCH_MAX }) => {
      buddySpin.yaw += dx * 0.014;
      buddySpin.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, buddySpin.pitch + dy * 0.013));
      buddySpin.vel = (dx * 0.014) / dtS;
      buddySpin.lastTouch = now;
    });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const tapped = last.current.moved < 6;
    void scene().then(({ buddySpin, cue }) => {
      buddySpin.dragging = false;
      buddySpin.lastTouch = performance.now();
      if (performance.now() - last.current.t > 120) buddySpin.vel = 0; // held still before letting go
      if (tapped) cue('hop');
    });
  };
  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}

/** Below this width the trays sit under the stage (matches the 900px breakpoint in styles.css). */
const STACKED = '(max-width: 900px)';
/** Dock once this much of the stage has scrolled above the screen (about half the character). */
const DOCK_AFTER_PX = 110;

/**
 * Stacked layout: once the stage has scrolled away, the character leaves the stage and stands on
 * the top-right of the 答え合わせ button; past the button it stays at the top of the screen.
 * The position is written straight to the element (--dock-top), so scrolling doesn't re-render.
 */
function useDock(ref: React.RefObject<HTMLDivElement | null>) {
  const [docked, setDocked] = useState(false);
  useEffect(() => {
    const stacked = window.matchMedia(STACKED);
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      const stage = dom.stage;
      if (!el || !stage) return;
      const dock = stacked.matches && stage.getBoundingClientRect().top < -DOCK_AFTER_PX;
      setDocked(dock);
      el.classList.toggle('is-docked', dock); // now, so the figure is measured where it docks
      if (!dock) return;
      // The 答え合わせ button (or, after the check, the row of buttons) is the submit bar's last child.
      const button = document.querySelector('.submit')?.lastElementChild;
      const figure = el.querySelector<HTMLElement>('.buddy-figure');
      if (!button || !figure) return;
      const top = button.getBoundingClientRect().top - figure.offsetHeight + 8; // feet just on the button
      el.style.setProperty('--dock-top', `${Math.round(Math.min(top, window.innerHeight - figure.offsetHeight))}px`);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    stacked.addEventListener('change', schedule);
    const unsub = useGame.subscribe(schedule); // the checklist above the button can change height
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      stacked.removeEventListener('change', schedule);
      unsub();
    };
  }, [ref]);
  return docked;
}

type Say = { text: string; id: number } | null;

/** What the character says, by situation. */
const LINES = {
  half: '半分まで来たよ！ その調子',
  placedNeedLabels: '全部置けたね！ 次は箱に名前を付けよう',
  ready: '準備OK！ 答え合わせしてみよう',
  nudgeLabels: '名前のない箱があるよ！ ラベルを付けてから答え合わせしよう',
  nudgePending: 'まだ置いていないブロックがあるよ。全部、箱に入れてね',
  newForm: '新しい姿になったよ！',
};

/** Said now and then while the player is working (never twice in a row). */
const CHEERS = [
  'いい調子！',
  '迷ったら、お題の人の気持ちで考えてみて',
  '似たもの同士、集まってきたね',
  'ラベルは短く、わかりやすく！',
  'その分け方、いい感じ',
  'ゆっくりで大丈夫。じっくり考えよう',
];
const CHEER_EVERY_MS = 40000;

const placedCount = (s: { items: { id: string }[]; assign: Record<string, string | null> }) =>
  s.items.reduce((n, it) => (s.assign[it.id] ? n + 1 : n), 0);
const allLabeled = (s: { trays: { label: string }[] }) => s.trays.every((t) => t.label.trim() !== '');
const isReady = (s: Parameters<typeof placedCount>[0] & Parameters<typeof allLabeled>[0]) =>
  s.items.length > 0 && placedCount(s) === s.items.length && allLabeled(s);

export function Buddy() {
  const index = useGame(currentCharacterIndex);
  const hidden = useGame((s) => s.briefingOpen || s.celebrating || !!s.reveal);
  const [say, setSay] = useState<Say>(null);
  const sayId = useRef(0);
  const shownIndex = useRef<number | null>(null);
  const [awake, setAwake] = useState(false);
  const turn = useTurn();
  const root = useRef<HTMLDivElement>(null);
  const docked = useDock(root);
  const sleepTimer = useRef(0);

  const wake = useCallback((ms: number) => {
    setAwake(true);
    window.clearTimeout(sleepTimer.current);
    sleepTimer.current = window.setTimeout(() => setAwake(false), ms);
  }, []);

  const lastSpoke = useRef(performance.now());
  const speak = useCallback(
    (text: string, ms: number) => {
      const my = ++sayId.current;
      lastSpoke.current = performance.now();
      wake(ms);
      setSay({ text, id: my });
      window.setTimeout(() => setSay((cur) => (cur?.id === my ? null : cur)), ms);
    },
    [wake],
  );

  useEffect(
    () =>
      useGame.subscribe((s, prev) => {
        // Answer check.
        if (s.submitSeq !== prev.submitSeq && s.result && !s.celebrating) {
          const stars = s.result.stars;
          wake(2600);
          react(stars >= 3 ? 'spin' : stars >= 1 ? 'hop' : 'sad');
          return;
        }
        // 答え合わせ pressed too early.
        if (s.nudge && s.nudge !== prev.nudge) {
          react('sad');
          speak(s.nudge.reason === 'labels' ? LINES.nudgeLabels : LINES.nudgePending, 4200);
          return;
        }
        if (s.result || s.briefingOpen) return;
        // Everything placed and named: ready to check (also when the last label gets its first letter).
        if (isReady(s) && !isReady(prev) && s.items === prev.items) {
          react('hop');
          speak(LINES.ready, 4200);
          return;
        }
        // A block landed in a tray.
        if (s.assign !== prev.assign && s.items === prev.items) {
          const now = placedCount(s);
          const before = placedCount(prev);
          if (now > before) {
            react('nod');
            if (now === s.items.length) speak(LINES.placedNeedLabels, 4200);
            else if (now >= s.items.length / 2 && before < s.items.length / 2 && s.items.length >= 8) speak(LINES.half, 2800);
          }
        }
      }),
    [speak, wake],
  );

  // Pop in when first shown, and again (with a line) after changing into a new form.
  useEffect(() => {
    if (hidden || shownIndex.current === index) return;
    const changed = shownIndex.current !== null;
    shownIndex.current = index;
    react('appear');
    if (changed) speak(LINES.newForm, 3200);
  }, [hidden, index, speak]);

  // Pop in at the new spot when it docks below the stage or goes back up.
  const wasDocked = useRef(docked);
  useEffect(() => {
    if (wasDocked.current === docked) return;
    wasDocked.current = docked;
    if (!hidden) react('appear');
  }, [docked, hidden]);

  // Now and then, a word of encouragement while the player is working on the board.
  useEffect(() => {
    let last = -1;
    const timer = window.setInterval(() => {
      const s = useGame.getState();
      const busy = s.result || s.briefingOpen || s.celebrating || s.reveal || s.galleryOpen || s.tutorialOpen || s.hintOpen;
      if (busy || document.hidden || document.body.classList.contains('is-dragging')) return;
      if (placedCount(s) === 0 || isReady(s)) return; // not started yet, or the "ready" line already said it
      if (performance.now() - lastSpoke.current < CHEER_EVERY_MS) return;
      let i = Math.floor(Math.random() * CHEERS.length);
      if (i === last) i = (i + 1) % CHEERS.length;
      last = i;
      speak(CHEERS[i], 3600);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [speak]);

  return (
    <div
      ref={root}
      className={`buddy${hidden ? ' is-hidden' : ''}${docked ? ' is-docked' : ''}${awake ? '' : ' is-resting'}`}
      aria-hidden="true"
    >
      {say && !hidden && awake && (
        <p key={say.id} className="buddy-say">
          {say.text}
        </p>
      )}
      <div className="buddy-figure" title="ドラッグ／スワイプで回せます" {...turn}>
        <SafeBoundary>
          <Suspense fallback={null}>
            <BuddyScene index={index} />
          </Suspense>
        </SafeBoundary>
      </div>
    </div>
  );
}
