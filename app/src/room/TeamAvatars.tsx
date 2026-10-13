// The team's avatars as 3D models inside the stage (drawn by the game's own canvas).
// A member pointing at the stage: the avatar stands just above that spot; holding a block, it steps behind it.
// Otherwise it rests in the top-right corner the board keeps clear (this player's own, larger, first),
// bobbing, and now and then shivering or spinning round.
import { Html, useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buddyCornerPx } from '../game/layout';
import { drag, HOLD_Z, remoteCursors } from '../game/runtime';
import { useGame } from '../state/store';
import { avatarUrl, normalized, PIN_URL } from './avatars';
import { EDITION } from './edition';
import { usePinColor } from './Face';
import { useSession, type Member } from './session';
import { CURSOR_IDLE_MS, myPointer } from './teamSync';

/** Depth of the resting corner, and of a pointing avatar (in front of the blocks at rest). */
const DOCK_Z = 2;
const POINT_Z = HOLD_Z + 0.25;
/** While it holds a block the avatar steps behind it (a held block is on the plane z = HOLD_Z). */
const CARRY_Z = HOLD_Z - 0.45;
/** Height of a pointing avatar in world units (a block is 0.5 tall). */
const POINT_H = 0.76;
/** One idle cycle: mostly bobbing, a shiver, and one full turn. */
const CYCLE_S = 9;

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const hit = new THREE.Vector3();

/** World point under a spot of the canvas (fractions of its size), on the plane z = `z`. */
function pointAt(cam: THREE.Camera, fx: number, fy: number, z: number, out: THREE.Vector3): boolean {
  ndc.set(fx * 2 - 1, -(fy * 2 - 1));
  ray.setFromCamera(ndc, cam);
  plane.constant = -z;
  return ray.ray.intersectPlane(plane, out) !== null;
}

function Actor({ uid, member, isMe, slot }: { uid: string; member: Member; isMe: boolean; slot: number }) {
  const pin = EDITION === 'pin';
  const { scene } = useGLTF(pin ? PIN_URL : avatarUrl(member.avatar));
  const color = usePinColor(uid);
  const model = useMemo(() => {
    const copy = normalized(scene);
    if (pin) {
      // The pin is modelled in plain white: its colour is the member's.
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const material = (mesh.material as THREE.MeshStandardMaterial).clone();
        material.color.set(color);
        material.roughness = 0.45;
        material.metalness = 0;
        mesh.material = material;
      });
    }
    return copy;
  }, [scene, pin, color]);
  const group = useRef<THREE.Group>(null);
  const turn = useRef<THREE.Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const born = useRef(false);

  useFrame((state, delta) => {
    const g = group.current;
    const inner = turn.current;
    if (!g || !inner) return;
    const dt = Math.min(delta, 1 / 20);
    const ease = (k: number) => 1 - Math.exp(-k * dt);
    const cam = state.camera as THREE.PerspectiveCamera;
    const W = state.size.width;
    const H = state.size.height;
    const still = useGame.getState().prefs.motion === 'off';
    const t = state.clock.elapsedTime + slot * 2.3;

    // Where is this member pointing, if anywhere?
    let fx = -1;
    let fy = -1;
    let carrying = false;
    if (isMe) {
      if (myPointer.inside && Date.now() - myPointer.movedAt < CURSOR_IDLE_MS) {
        const rect = state.gl.domElement.getBoundingClientRect();
        fx = (myPointer.x - rect.left) / Math.max(1, rect.width);
        fy = (myPointer.y - rect.top) / Math.max(1, rect.height);
        carrying = drag.active; // from the moment a block is pressed
      }
    } else {
      const c = remoteCursors.get(uid);
      if (c) {
        fx = c.x;
        fy = c.y;
        carrying = !!c.held;
      }
    }
    const pointing = fx >= 0;

    let height: number;
    let yaw = 0;
    let lean = 0;
    let roll = 0;
    let follow: number;
    if (pointing && pointAt(cam, fx, fy, carrying ? CARRY_Z : POINT_Z, hit)) {
      height = POINT_H;
      // Pointing: feet just above the spot. Holding a block: the avatar stands behind it and tips
      // towards the camera, so the block is in front, held up against its body.
      hit.y += (carrying ? 0.06 : 0.28) + (still ? 0 : Math.sin(t * 5) * 0.02);
      lean = carrying ? 0.32 : 0.08;
      roll = carrying && !still ? Math.sin(t * 9) * 0.05 : 0;
      follow = isMe ? 30 : 12;
    } else {
      // Resting corner, laid out in screen pixels: this player on top, teammates in a row below.
      const corner = buddyCornerPx(W);
      const small = W <= 640;
      const sizePx = isMe ? (small ? 50 : 83) : small ? 26 : 40;
      const px = isMe ? W - corner.w / 2 : W - corner.w + ((slot - 0.5) * corner.w) / 3;
      const py = isMe ? (small ? 14 : 20) + sizePx : (small ? 100 : 150) + sizePx;
      pointAt(cam, px / W, py / H, DOCK_Z, hit);
      const worldPerPx = (2 * (cam.position.z - DOCK_Z) * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / H;
      height = sizePx * worldPerPx;
      if (!still) {
        const c = t % CYCLE_S;
        hit.y += Math.sin(t * 1.6) * 0.045 * height;
        if (c > 3 && c < 3.5) roll = Math.sin(t * 42) * 0.07; // shiver
        if (c > 6 && c < 7) {
          const u = c - 6;
          yaw = (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2) * Math.PI * 2; // one full turn
        }
      }
      follow = 6;
    }

    if (!born.current) {
      born.current = true;
      g.position.copy(hit);
      g.scale.setScalar(0.001);
    }
    g.position.lerp(hit, ease(follow));
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, height, ease(10)));
    inner.rotation.set(THREE.MathUtils.lerp(inner.rotation.x, lean, ease(10)), yaw, roll);
    // This player's own avatar needs no name while it is the pointer.
    if (label.current) label.current.style.display = isMe && pointing ? 'none' : '';
  });

  return (
    <group ref={group}>
      <group ref={turn}>
        <primitive object={model} />
      </group>
      {/* Teammates' names go above the head: below the feet they would cover the block being carried. */}
      <Html center position={[0, isMe ? -0.14 : 1.16, 0]} zIndexRange={[23, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={label} className="team-name">
          {isMe ? 'あなた' : member.name}
        </div>
      </Html>
    </group>
  );
}

export function TeamAvatars() {
  const uid = useSession((s) => s.user?.uid ?? '');
  const members = useSession((s) => s.members);
  const me = members[uid];
  if (!me?.team) return null;
  const mates = Object.entries(members)
    .filter(([id, m]) => id !== uid && m.team === me.team && m.online !== false)
    .sort(([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0));
  return (
    <>
      <Suspense fallback={null}>
        <Actor key={`${uid}-${me.avatar}`} uid={uid} member={me} isMe slot={0} />
      </Suspense>
      {mates.map(([id, m], i) => (
        <Suspense key={`${id}-${m.avatar}`} fallback={null}>
          <Actor uid={id} member={m} isMe={false} slot={i + 1} />
        </Suspense>
      ))}
    </>
  );
}
