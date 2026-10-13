// The player's current character standing in the stage corner. It idles (breathing, looking
// around) and reacts: a nod when a block lands, a hop on ★1–2, a double hop + spin on ★3, a
// slump on ★0, and a pop-in spin when it changes into a new character.
import { useGLTF } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../state/store';
import { characterUrl } from './characters';
import { ensureFace } from './faces';

export type Reaction = 'nod' | 'hop' | 'spin' | 'sad' | 'appear';
const DURATION: Record<Reaction, number> = { nod: 0.4, hop: 0.7, spin: 1.2, sad: 1.8, appear: 0.9 };

/** Written by the UI layer, read every frame here. */
export const buddyCue: { reaction: Reaction | null; at: number } = { reaction: null, at: 0 };

/** Player-controlled turn (drag / swipe): yaw (pan) with flick velocity, and pitch (tilt). */
export const buddySpin = { yaw: 0, vel: 0, pitch: 0, dragging: false, lastTouch: 0 };
export const PITCH_MIN = -0.9; // looking up at it (~50°)
export const PITCH_MAX = 1.15; // looking down on it (~65°)

export function cue(reaction: Reaction) {
  buddyCue.reaction = reaction;
  buddyCue.at = performance.now() / 1000;
}

const ease = (x: number) => Math.sin(Math.PI * Math.min(1, Math.max(0, x)));

function Figure({ index }: { index: number }) {
  const { scene } = useGLTF(characterUrl(index));
  useEffect(() => ensureFace(index, scene), [index, scene]);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      m.roughness = Math.max(0.55, m.roughness ?? 1);
      m.metalness = 0;
      mesh.material = m;
    });
    return clone;
  }, [scene]);
  const ref = useRef<THREE.Group>(null);
  const tiltRef = useRef<THREE.Group>(null);

  // The model may finish loading after the "appear" cue: restart it so the pop-in is seen.
  useEffect(() => {
    if (buddyCue.reaction === 'appear' && performance.now() / 1000 - buddyCue.at < 6) cue('appear');
  }, [index]);

  useFrame(({ clock }, rawDt) => {
    const g = ref.current;
    if (!g) return;
    const dt = Math.min(rawDt, 1 / 30);
    // Player turn: coast after a flick, then drift back to facing front.
    if (!buddySpin.dragging) {
      buddySpin.yaw += buddySpin.vel * dt;
      buddySpin.vel *= Math.exp(-3 * dt);
      if (performance.now() - buddySpin.lastTouch > 2500) {
        const front = Math.round(buddySpin.yaw / (Math.PI * 2)) * Math.PI * 2;
        buddySpin.yaw += (front - buddySpin.yaw) * (1 - Math.exp(-2 * dt));
        buddySpin.pitch += (0 - buddySpin.pitch) * (1 - Math.exp(-2.5 * dt));
      }
    }
    // Motion setting: "reduced" stops the idle sway, "off" also the reactions (turning by hand still works).
    const motion = useGame.getState().prefs.motion;
    const t = motion === 'full' ? clock.elapsedTime : 0;
    const since = performance.now() / 1000 - buddyCue.at;
    const r = motion !== 'off' && buddyCue.reaction && since < DURATION[buddyCue.reaction] ? buddyCue.reaction : null;
    const p = r ? since / DURATION[r] : 0;

    // Idle: breathe and glance around.
    let y = Math.sin(t * 2.2) * 0.012;
    let rotY = Math.sin(t * 0.55) * 0.35;
    let rotX = 0;
    let rotZ = 0;
    let scaleY = 1 + Math.sin(t * 2.2) * 0.01;
    let scale = 1;

    if (r === 'nod') rotX = 0.18 * ease(p);
    if (r === 'hop') {
      y += 0.28 * ease(p);
      scaleY *= p < 0.12 ? 1 - p : 1;
    }
    if (r === 'spin') {
      const half = p < 0.45 ? p / 0.45 : (p - 0.45) / 0.55;
      y += (p < 0.45 ? 0.22 : 0.34) * ease(half);
      if (p >= 0.45) rotY = Math.PI * 2 * Math.min(1, half) + rotY * (1 - half);
    }
    if (r === 'sad') {
      const k = ease(Math.min(1, p * 1.3));
      rotX = 0.28 * k;
      y -= 0.05 * k;
      rotY = Math.sin(since * 13) * 0.22 * (1 - p);
      scaleY *= 1 - 0.05 * k;
    }
    if (r === 'appear') {
      scale = 1 - Math.pow(1 - Math.min(1, p * 1.4), 3) * 1;
      rotY = (1 - p) * Math.PI * 2;
      y += 0.15 * ease(p);
    }
    if (r === 'appear' && p < 0.02) scale = 0.001;

    g.position.y = y;
    g.rotation.set(rotX, rotY + buddySpin.yaw, rotZ);
    tiltRef.current?.rotation.set(buddySpin.pitch, 0, 0);
    g.scale.set(scale, scale * scaleY, scale);
  });

  return (
    // Tilt pivots around the body's middle (y=0.5) so the head stays in frame.
    <group ref={tiltRef} position={[0, 0.5, 0]}>
      <group position={[0, -0.5, 0]}>
        <group ref={ref}>
          <primitive object={object} />
        </group>
      </group>
    </group>
  );
}

/** The camera is aimed at the body's middle (y=0.6), not R3F's default origin (the feet), so tall
 *  hats and hops stay inside the frame. */
export default function BuddyScene({ index }: { index: number }) {
  return (
    <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 3.4], fov: 30 }}
      onCreated={({ camera }) => camera.lookAt(0, 0.6, 0)} gl={{ alpha: true, antialias: true }} style={{ pointerEvents: 'none' }}>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2, 4, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={1} color="#8fd8ff" />
      <Suspense fallback={null}>
        <Figure key={index} index={index} />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <circleGeometry args={[0.42, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.28} />
      </mesh>
    </Canvas>
  );
}
