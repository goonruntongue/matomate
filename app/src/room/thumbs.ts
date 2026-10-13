// Dev tool: makes the small avatar pictures (public/avatars/thumbs/avatarN.webp).
// Open the dev server with ?make-thumbs after adding or changing an avatar model; the pictures are
// rendered here and saved by the dev server (see vite.config.ts). Not part of the game.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AVATAR_COUNT, avatarUrl, normalized } from './avatars';

const SIZE = 192;

export async function makeThumbs(log: (line: string) => void) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  const loader = new GLTFLoader();
  // The whole body, seen slightly from the front-left so the face and the shape both read.
  const half = 0.56;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 10);
  camera.position.set(0.9, 0.9, 3);
  camera.lookAt(0, 0.5, 0);
  for (let n = 1; n <= AVATAR_COUNT; n++) {
    const gltf = await loader.loadAsync(avatarUrl(n));
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1.5, 3, 4);
    scene.add(sun);
    // The models are up to 1 unit wide and deep too: shrink a little so turned corners stay in frame.
    const model = normalized(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const fit = Math.min(1, 1 / Math.max(size.x, size.y, size.z));
    model.scale.multiplyScalar(fit);
    model.position.y = (1 - size.y * fit) / 2;
    scene.add(model);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    if (!blob) throw new Error(`avatar${n}: no image`);
    const res = await fetch(`/__thumbs/avatar${n}.webp`, { method: 'POST', body: blob });
    log(`avatar${n}.webp ${res.ok ? 'saved' : `failed (${res.status})`} ${Math.round(blob.size / 1024)} KB`);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  log('done');
}

/** Characters on the DX edition's app icon (see scripts/make-icons.mjs), drawn large and from the front. */
const ICON_AVATARS = [12, 2, 7];
const ICON_SIZE = 640;

/**
 * Dev tool: draws the art for the DX app icon into icons/dx/ (open the dev server with ?make-thumbs=icon,
 * then run `npm run icons`).
 */
export async function makeIconArt(log: (line: string) => void) {
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(ICON_SIZE, ICON_SIZE, false);
  const loader = new GLTFLoader();
  const half = 0.56;
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 10);
  camera.position.set(0.35, 0.75, 3);
  camera.lookAt(0, 0.5, 0);
  for (const n of ICON_AVATARS) {
    const gltf = await loader.loadAsync(avatarUrl(n));
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 1.7));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(1.5, 3, 4);
    scene.add(sun);
    const model = normalized(gltf.scene);
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    const fit = Math.min(1, 1 / Math.max(size.x, size.y, size.z));
    model.scale.multiplyScalar(fit);
    model.position.y = (1 - size.y * fit) / 2;
    scene.add(model);
    renderer.render(scene, camera);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.95));
    if (!blob) throw new Error(`avatar${n}: no image`);
    const res = await fetch(`/__thumbs/icon-avatar${n}.webp`, { method: 'POST', body: blob });
    log(`icon-avatar${n}.webp ${res.ok ? 'saved' : `failed (${res.status})`} ${Math.round(blob.size / 1024)} KB`);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  log('done');
}
