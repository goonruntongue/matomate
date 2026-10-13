import { useEffect, useLayoutEffect, useState } from 'react';
import * as audio from './audio';
import { PROBLEMS } from './data/problems';
import { sendTo } from './game/input';
import { dom } from './game/runtime';
import { Stage } from './game/Stage';
import { FONT_JP, FONT_MONO } from './game/textTexture';
import { useGame } from './state/store';
import { Header } from './ui/Header';
import { HintPanel } from './ui/HintPanel';
import { Inventory } from './ui/Inventory';
import { BriefCard, BriefingOverlay, KeywordTip, ResultPanel } from './ui/Round';
import { Celebration } from './ui/Celebration';
import { DebugPanel } from './ui/DebugPanel';
import { RoundEffects } from './ui/RoundEffects';
import { useAi } from './api';
import { prefetchAi, tiersForLevel } from './aiProblems';
import { Buddy } from './ui/Buddy';
import { CharacterGallery, CharacterReveal } from './ui/Characters';
import { Tutorial } from './ui/Tutorial';

// Block textures are baked once, so every glyph subset must be loaded before the stage mounts.
async function preloadFonts() {
  if (!document.fonts) return;
  const text = PROBLEMS.flatMap((p) => p.groups.flatMap((g) => g.items.map((kw) => kw.text))).join('') + 'ラベル未入力';
  const loads = [
    document.fonts.load(`700 40px ${FONT_JP}`, text),
    document.fonts.load(`900 40px ${FONT_JP}`, text),
    document.fonts.load(`500 40px ${FONT_JP}`, 'ラベル未入力'),
    document.fonts.load(`700 40px ${FONT_MONO}`, '0123456789'),
  ];
  await Promise.race([Promise.allSettled(loads), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const game = useGame.getState();
      if (e.key === 'Escape') {
        game.select(null);
        return;
      }
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (game.undo()) audio.drop();
        return;
      }
      if (e.key.toLowerCase() === 't') {
        game.toggleTuning();
        return;
      }
      if (e.key.toLowerCase() === 'h') {
        game.toggleHint();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 5 && game.selected) {
        const tray = game.trays[n - 1];
        if (tray) sendTo(game.selected, tray.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const [ready, setReady] = useState(false);
  const announcement = useGame((s) => s.announcement);
  const theme = useGame((s) => s.theme);
  const prefs = useGame((s) => s.prefs);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  // Settings (5.6) as attributes on <html>, read by styles.css.
  useLayoutEffect(() => {
    const root = document.documentElement.dataset;
    root.textSize = prefs.textSize;
    root.motion = prefs.motion;
    root.colorAssist = prefs.colorAssist ? 'on' : 'off';
  }, [prefs]);
  useEffect(() => {
    void preloadFonts().then(() => setReady(true));
  }, []);
  useKeyboard();
  useEffect(() => {
    void useAi.getState().refresh(); // AI ENERGY: once at start (no polling)
    const { mode, level } = useGame.getState();
    if (mode === 'level') void prefetchAi(tiersForLevel(level)); // an AI problem for the next board
  }, []);

  return (
    <div className="app">
      <Header />
      <main className="main">
        <section
          className="stage"
          aria-label="3Dステージ"
          ref={(el) => {
            dom.stage = el;
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {ready ? (
            <Stage />
          ) : (
            <div className="loading" role="status">
              <span className="kicker">LOADING KEYWORDS</span>
              <span className="loading-bar" />
              <small className="loading-note">キーワードの文字を準備しています…</small>
            </div>
          )}
          <Buddy />
          <BriefCard />
          <HintPanel />
          <ResultPanel />
          <BriefingOverlay />
        </section>
        <Inventory />
      </main>
      <div
        className="drag-ghost"
        aria-hidden="true"
        ref={(el) => {
          dom.ghost = el;
        }}
      />
      <KeywordTip />
      <RoundEffects />
      <CharacterReveal />
      <CharacterGallery />
      <Tutorial />
      <Celebration />
      <DebugPanel />
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
