// Small face icons for the header / gallery, rendered once from each character model and cached
// in localStorage. Rendering uses a throwaway offscreen WebGL renderer so it never touches the
// visible canvases.
import { useSyncExternalStore } from 'react';
import * as THREE from 'three';

const KEY = 'practice-ia:face:v2:'; // v2: framing raised so tall hats aren't clipped
const W = 160;
const H = 96;

const faces = new Map<number, string>();
const listeners = new Set<() => void>();
const pending = new Set<number>();

function read(index: number): string | null {
  if (faces.has(index)) return faces.get(index)!;
  try {
    const v = localStorage.getItem(KEY + index);
    if (v) faces.set(index, v);
    return v;
  } catch {
    return null;
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useFace(index: number): string | null {
  return useSyncExternalStore(subscribe, () => read(index), () => null);
}

/** Render the upper body (both heads) of a loaded character scene, once per character. */
export function ensureFace(index: number, scene: THREE.Object3D) {
  if (read(index) || pending.has(index)) return;
  pending.add(index);
  // Off the critical path: the model has just appeared on screen.
  window.setTimeout(() => {
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      const canvas = document.createElement('canvas');
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      const s = new THREE.Scene();
      s.add(new THREE.AmbientLight(0xffffff, 1.5));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(1.5, 3, 4);
      s.add(sun);
      s.add(scene.clone(true));
      // Models are 1 unit tall, feet at y=0; frame the heads (top ~55%), 5:3.
      const halfW = 0.5;
      const halfH = (halfW * H) / W;
      const cy = 1.03 - halfH;
      const cam = new THREE.OrthographicCamera(-halfW, halfW, cy + halfH, cy - halfH, 0.1, 10);
      cam.position.set(0, 0, 3);
      renderer.render(s, cam);
      const url = canvas.toDataURL('image/webp', 0.85);
      faces.set(index, url);
      try {
        localStorage.setItem(KEY + index, url);
      } catch {
        /* storage full or blocked: keep it in memory */
      }
      listeners.forEach((fn) => fn());
    } catch {
      /* no WebGL: no icon */
    } finally {
      renderer?.dispose();
      renderer?.forceContextLoss();
      pending.delete(index);
    }
  }, 300);
}
