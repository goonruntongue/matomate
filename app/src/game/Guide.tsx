import { QuadraticBezierLine, type QuadraticBezierLineRef } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import { guide } from './runtime';

const ORIGIN: [number, number, number] = [0, 0, 0];
const UP: [number, number, number] = [0, 0.01, 0];

/** Dashed aim guide; positioned every frame by the Director. */
export function Guide() {
  const ref = useRef<QuadraticBezierLineRef>(null);
  useLayoutEffect(() => {
    guide.line = ref.current;
    if (ref.current) ref.current.visible = false;
    return () => {
      guide.line = null;
    };
  }, []);
  return (
    <QuadraticBezierLine
      ref={ref}
      start={ORIGIN}
      end={UP}
      dashed
      dashSize={0.14}
      gapSize={0.09}
      lineWidth={2.5}
      color="#45E5FF"
      toneMapped={false}
    />
  );
}
