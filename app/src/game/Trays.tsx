import { RoundedBox } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { TRAY_GLYPHS, useGame, type Tray } from '../state/store';
import { THEMES } from '../theme/themes';
import { sendTo } from './input';
import { metrics, trayWidth } from './layout';
import { TRAY_BACK_D, TRAY_BACK_H, TRAY_BACK_R, TRAY_DEPTH, TRAY_FLOOR_T, TRAY_WALL, trays } from './runtime';
import { makeFloorGeometry, makeRimGeometry } from './trayGeometry';
import { drawNameplate, FONT_JP, makeCanvasTexture, PPU } from './textTexture';

const PLATE_H = 0.42;

export function Trays() {
  const list = useGame((s) => s.trays);
  const size = useThree((s) => s.size);
  const width = trayWidth(metrics(size.width, size.height), list.length);
  return (
    <>
      {list.map((tray) => (
        <TrayView key={tray.id} tray={tray} width={width} />
      ))}
    </>
  );
}

function TrayView({ tray, width }: { tray: Tray; width: number }) {
  const theme = THEMES[useGame((s) => s.theme)];
  const color = theme.trayColors[tray.colorIndex];
  const count = useGame((s) => {
    let c = 0;
    for (const id in s.assign) if (s.assign[id] === tray.id) c++;
    return c;
  });
  const group = useRef<THREE.Group>(null);
  const strip = useRef<THREE.MeshBasicMaterial>(null);
  const floor = useRef<THREE.MeshBasicMaterial>(null);

  const metal = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#123472',
        metalness: 0.55,
        roughness: 0.3,
        clearcoat: 0.7,
        clearcoatRoughness: 0.2,
        emissive: new THREE.Color('#061532'),
      }),
    [],
  );
  useEffect(() => () => metal.dispose(), [metal]);
  useEffect(() => {
    metal.color.set(theme.trayMetal);
    metal.emissive.set(theme.trayMetalEmissive);
    metal.metalness = theme.trayMetalness;
    metal.roughness = theme.trayRoughness;
    metal.clearcoat = theme.trayMetalness > 0.2 ? 0.7 : 0.15;
  }, [metal, theme]);

  useLayoutEffect(() => {
    trays.set(tray.id, {
      id: tray.id,
      colorIndex: tray.colorIndex,
      group: group.current,
      strip: strip.current,
      floor: floor.current,
      color: new THREE.Color(color),
      width,
      pulse: 0,
      hot: 0,
      candidate: 0,
      born: false,
    });
    return () => {
      trays.delete(tray.id);
    };
    // Width is refreshed every frame by the Director; registration only depends on identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tray.id, tray.colorIndex]);
  useEffect(() => {
    trays.get(tray.id)?.color.set(color);
  }, [tray.id, color]);

  const shape = useMemo(() => ({ rim: makeRimGeometry(width), floor: makeFloorGeometry(width) }), [width]);
  useEffect(
    () => () => {
      shape.rim.dispose();
      shape.floor.dispose();
    },
    [shape],
  );
  const backZ = -TRAY_DEPTH / 2 + 0.005 + TRAY_BACK_D / 2;

  const plateW = width * 0.86;
  const plate = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(plateW * PPU);
    canvas.height = Math.ceil(PLATE_H * PPU);
    return { canvas, texture: makeCanvasTexture(canvas, 8) };
  }, [plateW]);
  useEffect(() => () => plate.texture.dispose(), [plate]);

  useEffect(() => {
    let alive = true;
    const draw = () => {
      drawNameplate(plate.canvas, {
        label: tray.label,
        color,
        glyph: TRAY_GLYPHS[tray.colorIndex],
        count,
        capacity: tray.capacity,
        top: theme.plateTop,
        bottom: theme.plateBottom,
        text: theme.plateText,
        placeholder: theme.platePlaceholder,
      });
      plate.texture.needsUpdate = true;
    };
    draw();
    // Typed labels may need font subsets that aren't loaded yet; redraw once they arrive.
    if (tray.label && document.fonts) {
      document.fonts.load(`700 40px ${FONT_JP}`, tray.label).then(
        () => alive && draw(),
        () => undefined,
      );
    }
    return () => {
      alive = false;
    };
  }, [plate, tray.label, tray.colorIndex, tray.capacity, color, count, theme]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const selected = useGame.getState().selected;
    if (selected) sendTo(selected, tray.id);
  };

  return (
    <group
      ref={group}
      onClick={onClick}
      onPointerOver={() => {
        if (useGame.getState().selected) document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      {/* Rounded-rectangle rim + floor (plan-view corner radius, beveled top edge) */}
      <mesh geometry={shape.floor} material={metal} />
      <mesh geometry={shape.rim} material={metal} />
      {/* Thick back block, inset so its corners stay inside the rim's rounded corners */}
      <RoundedBox
        args={[width - 0.1, TRAY_BACK_H, TRAY_BACK_D]}
        radius={TRAY_BACK_R}
        smoothness={5}
        position={[0, TRAY_BACK_H / 2, backZ]}
        material={metal}
      />
      <mesh position={[0, 0.16, TRAY_DEPTH / 2 + 0.002]}>
        <boxGeometry args={[width * 0.4, 0.04, 0.012]} />
        <meshBasicMaterial ref={strip} color={color} toneMapped={false} />
      </mesh>
      <mesh position={[0, TRAY_FLOOR_T + 0.004, (backZ + TRAY_BACK_D / 2 + TRAY_DEPTH / 2 - TRAY_WALL) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[width - TRAY_WALL * 2 - 0.08, TRAY_DEPTH - TRAY_BACK_D - TRAY_WALL - 0.08]} />
        <meshBasicMaterial
          ref={floor}
          color={color}
          transparent
          opacity={0.1}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* Nameplate panel on the upper front of the back block, tilted slightly back toward the camera */}
      <group position={[0, TRAY_BACK_H - 0.02, backZ + TRAY_BACK_D / 2 + 0.03]} rotation={[-0.22, 0, 0]}>
        <RoundedBox args={[plateW + 0.08, PLATE_H + 0.08, 0.06]} radius={0.028} smoothness={4} material={metal} />
        <mesh position={[0, 0, 0.031]}>
          <planeGeometry args={[plateW, PLATE_H]} />
          <meshBasicMaterial map={plate.texture} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}
