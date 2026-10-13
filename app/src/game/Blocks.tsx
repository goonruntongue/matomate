import { RoundedBox } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGame, type Item } from '../state/store';
import { beginDrag } from './input';
import { hashSeed } from './layout';
import { THEMES } from '../theme/themes';
import { BLOCK_COLOR, BLOCK_D, BLOCK_H, BLOCK_RADIUS, blocks, drag } from './runtime';
import { blockWidth, makeBlockTexture } from './textTexture';

export function Blocks() {
  const items = useGame((s) => s.items);
  return (
    <>
      {items.map((item) => (
        <BlockView key={item.id} item={item} />
      ))}
    </>
  );
}

function BlockView({ item }: { item: Item }) {
  const gl = useThree((s) => s.gl);
  const theme = THEMES[useGame((s) => s.theme)];
  const width = useMemo(() => blockWidth(item.text), [item.text]);
  const texture = useMemo(
    () => makeBlockTexture(item.text, width, BLOCK_H, gl.capabilities.getMaxAnisotropy()),
    [item.text, width, gl],
  );
  useEffect(() => () => texture.dispose(), [texture]);

  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.MeshPhysicalMaterial>(null);

  useLayoutEffect(() => {
    group.current?.scale.setScalar(0.001);
    blocks.set(item.id, {
      id: item.id,
      text: item.text,
      width,
      seed: hashSeed(item.id) * Math.PI * 2,
      group: group.current,
      body: body.current,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      scale: 0.01,
      phase: 'rest',
      hover: false,
      flight: null,
      glow: 0,
      tint: 0,
      tintColor: new THREE.Color('#45E5FF'),
      spawned: false,
    });
    return () => {
      blocks.delete(item.id);
    };
  }, [item.id, item.text, width]);

  const setHover = (hover: boolean) => {
    const rt = blocks.get(item.id);
    if (rt) rt.hover = hover;
    if (!drag.active) document.body.style.cursor = hover ? 'grab' : '';
  };

  return (
    <group
      ref={group}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => beginDrag(item.id, e)}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHover(true);
        // Desktop: hovering a keyword shows its meaning (touch uses long-press, see input.ts).
        if (e.nativeEvent.pointerType === 'mouse' && !drag.active) {
          useGame.getState().setPeek({ id: item.id, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
        }
      }}
      onPointerOut={() => {
        setHover(false);
        if (useGame.getState().peek?.id === item.id && !drag.peeked) useGame.getState().setPeek(null);
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}
    >
      {/* Blue translucent glass: low alpha + faint self-glow in the same blue (Director); keyword stays fully opaque. */}
      <RoundedBox args={[width, BLOCK_H, BLOCK_D]} radius={BLOCK_RADIUS} smoothness={5}>
        <meshPhysicalMaterial
          ref={body}
          color={BLOCK_COLOR}
          transparent
          opacity={theme.blockOpacity}
          depthWrite={false}
          metalness={0}
          roughness={0.06}
          clearcoat={1}
          clearcoatRoughness={0.04}
          envMapIntensity={1.2}
        />
      </RoundedBox>
      <mesh position={[0, 0, BLOCK_D / 2 + 0.003]} renderOrder={1}>
        <planeGeometry args={[width - 0.04, BLOCK_H - 0.04]} />
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}
