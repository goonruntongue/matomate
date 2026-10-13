// One avatar in 3D, slowly turning. Drag / swipe to turn it by hand.
import { ContactShadows, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo } from 'react';
import { avatarUrl, normalized } from './avatars';

function Model({ n }: { n: number }) {
  const { scene } = useGLTF(avatarUrl(n));
  const object = useMemo(() => normalized(scene), [scene]);
  return <primitive object={object} scale={2.1} position={[0, -1.05, 0]} />;
}

export default function AvatarViewer({ n, className }: { n: number; className?: string }) {
  return (
    <Canvas className={className} dpr={[1, 2]} camera={{ position: [0, 0.35, 4.6], fov: 34 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={1.6} />
      <directionalLight position={[2.5, 4, 3]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={1} color="#8fd8ff" />
      <Suspense fallback={null}>
        <Model key={n} n={n} />
      </Suspense>
      <ContactShadows position={[0, -1.07, 0]} opacity={0.4} scale={4} blur={2.4} far={2} />
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
