// A 3D character on a glowing pedestal. Drag / swipe to turn it; it slowly spins on its own
// until touched. Locked characters are drawn as a dark silhouette.
import { ContactShadows, OrbitControls, Sparkles, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { characterUrl } from './characters';
import { ensureFace } from './faces';

function Model({ index, locked }: { index: number; locked: boolean }) {
  const { scene } = useGLTF(characterUrl(index));
  useEffect(() => {
    if (!locked) ensureFace(index, scene); // never reveal a locked face
  }, [index, scene, locked]);
  const object = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (locked) {
        mesh.material = new THREE.MeshBasicMaterial({ color: '#0d1030' });
      } else {
        const m = (mesh.material as THREE.MeshStandardMaterial).clone();
        m.roughness = Math.max(0.55, m.roughness ?? 1);
        m.metalness = 0;
        mesh.material = m;
      }
    });
    return clone;
  }, [scene, locked]);
  // Models are normalised to 1 unit tall with the feet at y=0.
  return <primitive object={object} scale={2.1} position={[0, -1.05, 0]} />;
}

function Pedestal({ legend }: { legend: boolean }) {
  return (
    <group position={[0, -1.08, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.25, 64]} />
        <meshBasicMaterial color={legend ? '#ffd54a' : '#45e5ff'} transparent opacity={0.16} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[1.18, 1.25, 64]} />
        <meshBasicMaterial color={legend ? '#ffe9a0' : '#9ff3ff'} transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

export interface CharacterViewerProps {
  /** 0-based: 0..9 = Lv1..Lv10, 10 = legend. */
  index: number;
  locked?: boolean;
  className?: string;
}

export default function CharacterViewer({ index, locked = false, className }: CharacterViewerProps) {
  const legend = index >= 10;
  return (
    <Canvas className={className} dpr={[1, 2]} camera={{ position: [0, 0.35, 4.6], fov: 34 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1.4} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={1.2} color={legend ? '#ffd54a' : '#8fd8ff'} />
      <Suspense fallback={null}>
        <Model key={`${index}-${locked}`} index={index} locked={locked} />
      </Suspense>
      <Pedestal legend={legend} />
      <ContactShadows position={[0, -1.07, 0]} opacity={0.45} scale={4} blur={2.4} far={2} />
      {!locked && <Sparkles count={legend ? 60 : 28} scale={[2.6, 2.6, 2]} size={legend ? 4 : 2.5} speed={0.4} color={legend ? '#ffd54a' : '#bff6ff'} />}
      <OrbitControls
        enablePan={false}
        enableZoom={false}
        autoRotate
        autoRotateSpeed={1.6}
        minPolarAngle={Math.PI / 2 - 0.5}
        maxPolarAngle={Math.PI / 2 + 0.15}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
