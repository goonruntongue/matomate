// The mini characters a participant picks as their avatar (public/avatars/avatar1..21.glb).
// The same avatar may be picked by several people.
import * as THREE from 'three';

export const AVATAR_COUNT = 21;

export function avatarUrl(n: number): string {
  return `./avatars/avatar${n}.glb`;
}

/** Small picture of the avatar (made by the dev tool in thumbs.ts). */
export function avatarThumb(n: number): string {
  return `./avatars/thumbs/avatar${n}.webp`;
}

export function randomAvatar(): number {
  return 1 + Math.floor(Math.random() * AVATAR_COUNT);
}

/** A copy of a loaded model, scaled to 1 unit tall, feet at y=0, centred on x and z
 *  (the models come in different sizes and origins). */
export function normalized(scene: THREE.Object3D): THREE.Group {
  const clone = scene.clone(true);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const scale = 1 / Math.max(size.y, 1e-6);
  clone.position.set(-centre.x, -box.min.y, -centre.z);
  const group = new THREE.Group();
  group.add(clone);
  group.scale.setScalar(scale);
  return group;
}
