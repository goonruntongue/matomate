// Celebrations in 3D, in three sizes (small → large):
//  - clear:   a quick glittering confetti burst from the bottom (transparent, over the game)
//  - levelup: two party poppers go "パーン" with cheers (transparent, over the game)
//  - final:   the full show — poppers, cheers + applause, confetti rain, bloom, dark backdrop
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as audio from '../audio';

const PALETTE = ['#FFD54A', '#FFB300', '#45E5FF', '#FF7BAC', '#7CF0B5', '#B6A1FF', '#FF8A3D', '#FFFFFF'].map((c) => new THREE.Color(c));
const MAX_CONFETTI = 900;
const MAX_SPARKS = 160;

export type CelebrationVariant = 'clear' | 'levelup' | 'final';

interface VariantConfig {
  poppers: boolean; // show 3D party poppers (otherwise invisible emitters below the bottom edge)
  popAt: [number, number]; // seconds after mount, left / right
  burst: number; // confetti per emitter
  sparks: number; // sparkles per emitter
  speed: number;
  spread: number;
  rain: number; // confetti per second falling from the top afterwards
  twinkle: boolean; // ambient twinkles over the screen
  kick: number; // camera shake strength
  transparent: boolean; // draw over the game (no backdrop, no bloom)
  sound: 'sparkle' | 'cheer' | 'grand';
}

const VARIANTS: Record<CelebrationVariant, VariantConfig> = {
  clear: { poppers: false, popAt: [0.05, 0.12], burst: 80, sparks: 20, speed: 1.15, spread: 0.55, rain: 0, twinkle: false, kick: 0, transparent: true, sound: 'sparkle' },
  levelup: { poppers: true, popAt: [0.55, 0.66], burst: 200, sparks: 40, speed: 0.9, spread: 0.45, rain: 9, twinkle: false, kick: 0.6, transparent: true, sound: 'cheer' },
  final: { poppers: true, popAt: [1.0, 1.14], burst: 340, sparks: 60, speed: 1, spread: 0.42, rain: 26, twinkle: true, kick: 1, transparent: false, sound: 'grand' },
};
const GRAVITY = 6.5;
const DRAG = 1.9;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#FFD54A';
  g.fillRect(0, 0, 256, 256);
  const cols = ['#FF5C93', '#45C8FF', '#7CF0B5'];
  for (let i = -8; i < 16; i++) {
    g.fillStyle = cols[(i + 24) % 3];
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32 + 16, 0);
    g.lineTo(i * 32 + 16 + 128, 256);
    g.lineTo(i * 32 + 128, 256);
    g.fill();
  }
  // Tiny stars on the paper.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.15, 'rgba(255,250,220,0.9)');
  grad.addColorStop(0.4, 'rgba(255,220,120,0.15)');
  grad.addColorStop(1, 'rgba(255,220,120,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  // Four-point twinkle.
  g.fillStyle = 'rgba(255,255,255,0.95)';
  g.beginPath();
  g.moveTo(64, 0);
  g.quadraticCurveTo(68, 60, 128, 64);
  g.quadraticCurveTo(68, 68, 64, 128);
  g.quadraticCurveTo(60, 68, 0, 64);
  g.quadraticCurveTo(60, 60, 64, 0);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(70,60,140,0.55)');
  grad.addColorStop(0.5, 'rgba(30,30,80,0.25)');
  grad.addColorStop(1, 'rgba(5,8,22,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Particles {
  pos: Float32Array;
  vel: Float32Array;
  rot: Float32Array;
  spin: Float32Array;
  size: Float32Array;
  phase: Float32Array;
  life: Float32Array;
  color: THREE.Color[];
  next: number;
}

function makeParticles(n: number): Particles {
  return {
    pos: new Float32Array(n * 3),
    vel: new Float32Array(n * 3),
    rot: new Float32Array(n * 3),
    spin: new Float32Array(n * 3),
    size: new Float32Array(n * 2),
    phase: new Float32Array(n),
    life: new Float32Array(n),
    color: Array.from({ length: n }, () => new THREE.Color()),
    next: 0,
  };
}

interface PopperDef {
  base: THREE.Vector3;
  dir: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

function usePoppers(v: VariantConfig): PopperDef[] {
  const { width, height } = useThree((s) => s.viewport);
  return useMemo(() => {
    const halfW = width / 2;
    const halfH = height / 2;
    const scale = THREE.MathUtils.clamp(halfW / 4.2, 0.55, 1);
    return [-1, 1].map((side) => {
      if (!v.poppers) {
        // Invisible emitters just below the bottom edge, fanning up and slightly inward.
        const up = new THREE.Vector3(-side * 0.22, 1, 0.2).normalize();
        return { base: new THREE.Vector3(side * halfW * 0.3, -halfH - 0.4, 0.5), dir: up, quat: new THREE.Quaternion(), scale };
      }
      const dir = new THREE.Vector3(-side * 0.5, 0.82, 0.28).normalize();
      return {
        base: new THREE.Vector3(side * (halfW - 1.0 * scale), -halfH + 0.9 * scale, 0.5),
        dir,
        quat: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir),
        scale,
      };
    });
  }, [width, height, v]);
}

function Scene({ v }: { v: VariantConfig }) {
  const POP_AT = v.popAt;
  const poppers = usePoppers(v);
  const viewport = useThree((s) => s.viewport);
  const confettiRef = useRef<THREE.InstancedMesh>(null);
  const sparkRef = useRef<THREE.InstancedMesh>(null);
  const popperRefs = useRef<(THREE.Group | null)[]>([]);
  const capRefs = useRef<(THREE.Mesh | null)[]>([]);
  const sealRefs = useRef<(THREE.Mesh | null)[]>([]);
  const flashRefs = useRef<(THREE.Mesh | null)[]>([]);
  const lightRefs = useRef<(THREE.PointLight | null)[]>([]);
  const state = useRef({ t: 0, popped: [false, false], rainAcc: 0, caps: [new THREE.Vector3(), new THREE.Vector3()], capVel: [new THREE.Vector3(), new THREE.Vector3()] });

  const conf = useMemo(() => makeParticles(MAX_CONFETTI), []);
  const sparks = useMemo(() => makeParticles(MAX_SPARKS), []);
  const tex = useMemo(() => ({ stripe: stripeTexture(), star: starTexture(), glow: glowTexture() }), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const tmp = useMemo(() => ({ n: new THREE.Vector3(), c: new THREE.Color(), white: new THREE.Color(1, 1, 1), q: new THREE.Quaternion(), e: new THREE.Euler() }), []);

  // Allocate per-instance colors before the first render so the shader is compiled with them.
  const initConfetti = (el: THREE.InstancedMesh | null) => {
    confettiRef.current = el;
    if (!el || el.instanceColor) return;
    for (let i = 0; i < MAX_CONFETTI; i++) el.setColorAt(i, tmp.white);
  };

  const spawnConfetti = (at: THREE.Vector3, vel: THREE.Vector3, size: number) => {
    const i = conf.next;
    conf.next = (conf.next + 1) % MAX_CONFETTI;
    conf.pos.set([at.x, at.y, at.z], i * 3);
    conf.vel.set([vel.x, vel.y, vel.z], i * 3);
    conf.rot.set([rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)], i * 3);
    conf.spin.set([rand(-9, 9), rand(-9, 9), rand(-6, 6)], i * 3);
    const dot = Math.random() < 0.18;
    const w = (dot ? 0.09 : rand(0.07, 0.12)) * size;
    conf.size.set([w, dot ? w : w * rand(1.4, 2.6)], i * 2);
    conf.phase[i] = rand(0, 6.28);
    conf.life[i] = 1;
    conf.color[i].copy(PALETTE[Math.floor(Math.random() * PALETTE.length)]);
  };

  const spawnSpark = (at: THREE.Vector3, vel: THREE.Vector3) => {
    const i = sparks.next;
    sparks.next = (sparks.next + 1) % MAX_SPARKS;
    sparks.pos.set([at.x, at.y, at.z], i * 3);
    sparks.vel.set([vel.x, vel.y, vel.z], i * 3);
    sparks.size[i * 2] = rand(0.12, 0.3);
    sparks.phase[i] = rand(0, 6.28);
    sparks.life[i] = rand(0.7, 1.5);
  };

  const pop = (k: number) => {
    const p = poppers[k];
    const mouth = p.base.clone().addScaledVector(p.dir, 0.95 * p.scale);
    const side = new THREE.Vector3().crossVectors(p.dir, new THREE.Vector3(0, 0, 1)).normalize();
    const up = new THREE.Vector3().crossVectors(side, p.dir).normalize();
    for (let n = 0; n < v.burst; n++) {
      const a = rand(0, Math.PI * 2);
      const r = Math.sqrt(Math.random()) * v.spread;
      const vel = p.dir
        .clone()
        .addScaledVector(side, Math.cos(a) * r)
        .addScaledVector(up, Math.sin(a) * r)
        .normalize()
        .multiplyScalar(rand(7, 16) * v.speed * (0.75 + 0.25 * p.scale));
      spawnConfetti(mouth, vel, p.scale);
    }
    for (let n = 0; n < v.sparks; n++) {
      const vel = p.dir
        .clone()
        .add(new THREE.Vector3(rand(-0.5, 0.5), rand(-0.5, 0.5), rand(-0.3, 0.3)))
        .normalize()
        .multiplyScalar(rand(4, 13) * v.speed);
      spawnSpark(mouth, vel);
    }
    state.current.caps[k].copy(mouth);
    state.current.capVel[k].copy(p.dir).multiplyScalar(9).add(new THREE.Vector3(0, 2, 0));
    if (v.sound === 'sparkle') {
      if (k === 0) audio.sparkle();
      return;
    }
    audio.popper();
    if (k !== 0) return;
    audio.cheer(0.25);
    audio.applause(0.35, v.sound === 'grand' ? 3.8 : 1.6);
  };

  useFrame((three, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    const s = state.current;
    s.t += dt;
    const t = s.t;

    // Poppers: rise in, tremble with anticipation, recoil on the pop, then settle down.
    poppers.forEach((p, k) => {
      const sinceP = t - POP_AT[k];
      if (!s.popped[k] && sinceP >= 0) {
        s.popped[k] = true;
        pop(k);
      }
      const g = popperRefs.current[k];
      if (!g) return;
      const rise = THREE.MathUtils.clamp(t / Math.min(0.7, POP_AT[0] - 0.1), 0, 1);
      const ease = 1 - Math.pow(1 - rise, 3);
      const shakeFrom = POP_AT[k] - 0.4;
      const shake = sinceP < 0 && t > shakeFrom ? Math.sin(t * 70) * 0.075 * (t - shakeFrom) : 0;
      const recoil = sinceP >= 0 ? Math.exp(-sinceP * 9) * 0.35 * p.scale : 0;
      g.position.copy(p.base).addScaledVector(p.dir, -recoil);
      g.position.y += (ease - 1) * 3 + shake;
      g.position.x += shake;
      g.quaternion.copy(p.quat);
      g.scale.setScalar(p.scale * (1 + (sinceP >= 0 ? Math.exp(-sinceP * 12) * 0.18 : 0)));
      const seal = sealRefs.current[k];
      if (seal) seal.visible = !s.popped[k];
      // Paper cap flies off after the pop.
      const cap = capRefs.current[k];
      if (cap) {
        if (s.popped[k]) {
          s.capVel[k].y -= GRAVITY * dt;
          s.caps[k].addScaledVector(s.capVel[k], dt);
          cap.position.copy(s.caps[k]);
          cap.rotation.x += dt * 14;
          cap.rotation.z += dt * 9;
          cap.visible = s.caps[k].y > -viewport.height;
        } else {
          cap.visible = false;
        }
      }
      // Muzzle flash and light burst.
      const flash = flashRefs.current[k];
      const light = lightRefs.current[k];
      const f = sinceP >= 0 ? Math.exp(-sinceP * 7) : 0;
      if (flash) {
        flash.position.copy(p.base).addScaledVector(p.dir, 1.1 * p.scale);
        flash.scale.setScalar(0.4 + (1 - f) * 3.2);
        (flash.material as THREE.MeshBasicMaterial).opacity = f;
        flash.visible = f > 0.01;
      }
      if (light) {
        light.position.copy(p.base).addScaledVector(p.dir, 1.4 * p.scale);
        light.intensity = f * 60;
      }
    });

    // Gentle confetti rain once the poppers went off.
    if (v.rain > 0 && t > POP_AT[0] + 0.6) {
      s.rainAcc += dt * v.rain;
      const drift = new THREE.Vector3();
      const at = new THREE.Vector3();
      while (s.rainAcc >= 1) {
        s.rainAcc -= 1;
        at.set(rand(-viewport.width / 2, viewport.width / 2), viewport.height / 2 + 0.4, rand(-1.5, 1.5));
        spawnConfetti(at, drift.set(rand(-0.4, 0.4), -rand(0.3, 1), 0), 0.9);
      }
    }

    // Camera nudge on the pop.
    const kick = POP_AT.reduce((m, at) => (t >= at ? m + Math.exp(-(t - at) * 10) : m), 0);
    three.camera.position.x = Math.sin(t * 60) * 0.06 * kick * v.kick;
    three.camera.position.y = Math.cos(t * 53) * 0.06 * kick * v.kick;

    // Confetti physics + glitter: brightness follows how squarely each piece faces the camera.
    const mesh = confettiRef.current;
    if (mesh) {
      const drag = Math.exp(-DRAG * dt);
      for (let i = 0; i < MAX_CONFETTI; i++) {
        const o = i * 3;
        if (conf.life[i] <= 0) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        conf.vel[o] *= drag;
        conf.vel[o + 1] = conf.vel[o + 1] * drag - GRAVITY * dt * (conf.vel[o + 1] < 0 ? 0.45 : 1);
        conf.vel[o + 2] *= drag;
        const sway = conf.vel[o + 1] < 0 ? Math.sin(t * 3 + conf.phase[i]) * 0.7 : 0;
        conf.pos[o] += (conf.vel[o] + sway) * dt;
        conf.pos[o + 1] += conf.vel[o + 1] * dt;
        conf.pos[o + 2] += conf.vel[o + 2] * dt;
        conf.rot[o] += conf.spin[o] * dt;
        conf.rot[o + 1] += conf.spin[o + 1] * dt;
        conf.rot[o + 2] += conf.spin[o + 2] * dt;
        if (conf.pos[o + 1] < -viewport.height / 2 - 1) conf.life[i] = 0;

        dummy.position.set(conf.pos[o], conf.pos[o + 1], conf.pos[o + 2]);
        dummy.rotation.set(conf.rot[o], conf.rot[o + 1], conf.rot[o + 2]);
        dummy.scale.set(conf.size[i * 2], conf.size[i * 2 + 1], 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        tmp.n.set(0, 0, 1).applyQuaternion(dummy.quaternion);
        const facing = Math.abs(tmp.n.z);
        const glint = Math.pow(facing, 24) * 2.6;
        tmp.c.copy(conf.color[i]).multiplyScalar(0.35 + 0.75 * facing).lerp(tmp.white, Math.min(0.6, glint * 0.3)).multiplyScalar(1 + glint);
        mesh.setColorAt(i, tmp.c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }

    // Sparkles: short-lived twinkling stars carried by the burst.
    const sm = sparkRef.current;
    if (sm) {
      const drag = Math.exp(-2.6 * dt);
      for (let i = 0; i < MAX_SPARKS; i++) {
        const o = i * 3;
        if (sparks.life[i] <= 0) {
          dummy.scale.setScalar(0);
          dummy.updateMatrix();
          sm.setMatrixAt(i, dummy.matrix);
          continue;
        }
        sparks.life[i] -= dt;
        sparks.vel[o] *= drag;
        sparks.vel[o + 1] = sparks.vel[o + 1] * drag - 1.2 * dt;
        sparks.vel[o + 2] *= drag;
        sparks.pos[o] += sparks.vel[o] * dt;
        sparks.pos[o + 1] += sparks.vel[o + 1] * dt;
        sparks.pos[o + 2] += sparks.vel[o + 2] * dt;
        const tw = 0.5 + 0.5 * Math.sin(t * 22 + sparks.phase[i]);
        const sz = sparks.size[i * 2] * Math.min(1, sparks.life[i] * 2) * (0.5 + tw);
        dummy.position.set(sparks.pos[o], sparks.pos[o + 1], sparks.pos[o + 2]);
        dummy.rotation.set(0, 0, t * 2 + sparks.phase[i]);
        dummy.scale.set(sz, sz, 1);
        dummy.updateMatrix();
        sm.setMatrixAt(i, dummy.matrix);
      }
      // Ambient twinkles over the whole screen after the burst.
      if (v.twinkle && t > POP_AT[0] + 0.8 && Math.random() < dt * 6) {
        spawnSpark(new THREE.Vector3(rand(-viewport.width / 2, viewport.width / 2), rand(-viewport.height / 2, viewport.height / 2), rand(-1, 1)), new THREE.Vector3());
      }
      sm.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      {!v.transparent && (
        <>
          <color attach="background" args={['#050816']} />
          <mesh position={[0, 0.6, -6]} scale={[viewport.width * 2.4, viewport.height * 2.4, 1]}>
            <planeGeometry />
            <meshBasicMaterial map={tex.glow} transparent depthWrite={false} />
          </mesh>
        </>
      )}
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 5, 6]} intensity={2.2} />
      <directionalLight position={[-4, -2, 3]} intensity={0.6} color="#8fb8ff" />

      {v.poppers &&
        poppers.map((_, k) => (
        <group key={k}>
          <group ref={(el) => void (popperRefs.current[k] = el)}>
            {/* Cone body: apex at the bottom (string side), mouth facing the firing direction. */}
            <mesh position={[0, 0.25, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.5, 1.4, 48, 1, true]} />
              <meshStandardMaterial map={tex.stripe} metalness={0.25} roughness={0.35} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, 0.95, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.5, 0.05, 12, 48]} />
              <meshStandardMaterial color="#FFD54A" metalness={0.9} roughness={0.2} />
            </mesh>
            {/* String hanging from the tip. */}
            <mesh position={[0.05, -0.75, 0]} rotation={[0, 0, 0.15]}>
              <cylinderGeometry args={[0.015, 0.015, 0.6, 6]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
            <mesh position={[0.1, -1.08, 0]}>
              <sphereGeometry args={[0.06, 12, 12]} />
              <meshStandardMaterial color="#FF5C93" />
            </mesh>
            {/* Paper seal over the mouth before the pop. */}
            <mesh ref={(el) => void (sealRefs.current[k] = el)} position={[0, 0.95, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.48, 40]} />
              <meshStandardMaterial map={tex.stripe} side={THREE.DoubleSide} />
            </mesh>
          </group>
          <mesh ref={(el) => void (capRefs.current[k] = el)} visible={false}>
            <circleGeometry args={[0.46, 40]} />
            <meshStandardMaterial map={tex.stripe} side={THREE.DoubleSide} />
          </mesh>
          <mesh ref={(el) => void (flashRefs.current[k] = el)} visible={false}>
            <planeGeometry />
            <meshBasicMaterial map={tex.star} color={[3, 2.6, 1.8]} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
          <pointLight ref={(el) => void (lightRefs.current[k] = el)} color="#ffd98a" distance={12} decay={1.6} intensity={0} />
        </group>
      ))}

      <instancedMesh ref={initConfetti} args={[undefined, undefined, MAX_CONFETTI]} frustumCulled={false}>
        <planeGeometry />
        <meshBasicMaterial side={THREE.DoubleSide} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparkRef} args={[undefined, undefined, MAX_SPARKS]} frustumCulled={false}>
        <planeGeometry />
        <meshBasicMaterial map={tex.star} color={[2.4, 2.2, 1.7]} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      {!v.transparent && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.85} luminanceSmoothing={0.2} />
        </EffectComposer>
      )}
    </>
  );
}

export default function CelebrationScene({ variant = 'final' }: { variant?: CelebrationVariant }) {
  const v = VARIANTS[variant];
  return (
    <Canvas
      className="celebration-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, stencil: false, alpha: v.transparent }}
      camera={{ position: [0, 0, 10], fov: 50 }}
      aria-hidden="true"
    >
      <Scene v={v} />
    </Canvas>
  );
}
