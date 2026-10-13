import { createRoot } from 'react-dom/client';
import App from './App';
import { EDITION } from './room/edition';
import './styles.css';

if (EDITION === 'dx') document.title = 'Mato mate DX（マトメイト DX）';

const root = createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && new URLSearchParams(location.search).has('make-thumbs')) {
  // Dev tool: (re)make the avatar pictures. See src/room/thumbs.ts.
  const lines: string[] = [];
  void import('./room/thumbs').then(({ makeThumbs }) =>
    makeThumbs((line) => {
      lines.push(line);
      root.render(<pre style={{ padding: 16 }}>{lines.join('\n')}</pre>);
    }),
  );
} else {
  root.render(<App />);
}

// No pinch zoom: the page is a game board, and a zoomed page slides sideways under the finger.
// Safari in the browser ignores user-scalable=no, so its own pinch gesture events are cancelled too
// (CSS touch-action: pan-y covers the other browsers). Text size 大 in the settings replaces zooming.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// PWA: register the service worker in production builds only (dev uses Vite's own module serving).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js?v=offline-v3', { updateViaCache: 'none' }).catch(() => undefined);
  });
}
