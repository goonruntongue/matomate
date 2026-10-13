import { Grid, Sparkles } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { useGame } from '../state/store';
import { THEMES } from '../theme/themes';
import { metrics } from './layout';

/** Local PMREM environment for glassy reflections (no HDR download). */
export function SceneEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const intensity = THEMES[useGame((s) => s.theme)].envIntensity;
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, inner);
  g.addColorStop(1, new THREE.Color(outer).getStyle().replace('rgb(', 'rgba(').replace(')', ', 0)'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The LP's radial glows + fading grid floor + faint data dust. */
export function Backdrop() {
  const size = useThree((s) => s.size);
  const m = metrics(size.width, size.height);
  const theme = THEMES[useGame((s) => s.theme)];
  const glowA = useMemo(() => glowTexture(theme.glowA, theme.background), [theme]);
  const glowB = useMemo(() => glowTexture(theme.glowB, theme.background), [theme]);
  useEffect(
    () => () => {
      glowA.dispose();
      glowB.dispose();
    },
    [glowA, glowB],
  );

  return (
    <group>
      <mesh position={[0, 3.5, -14]} renderOrder={-2}>
        <planeGeometry args={[44, 26]} />
        <meshBasicMaterial map={glowA} transparent depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
      <mesh position={[-11, -1, -12]} renderOrder={-2}>
        <planeGeometry args={[26, 20]} />
        <meshBasicMaterial map={glowB} transparent depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
      <Grid
        position={[0, m.trayY - 0.3, 0]}
        args={[60, 60]}
        cellSize={0.6}
        cellThickness={0.6}
        cellColor={theme.gridCell}
        sectionSize={3}
        sectionThickness={1}
        sectionColor={theme.gridSection}
        fadeDistance={m.camZ + 14}
        fadeStrength={1.4}
        infiniteGrid
        followCamera={false}
      />
      <Sparkles count={70} scale={[20, 11, 10]} position={[0, 0.5, -4]} size={2.2} speed={0.25} opacity={theme.sparklesOpacity} color={theme.sparkles} noise={0.8} />
    </group>
  );
}
