// Mutable per-frame state shared by the render loop and input handlers.
// Kept outside React so 60fps updates never trigger re-renders.
import type { QuadraticBezierLineRef } from '@react-three/drei';
import * as THREE from 'three';

export const BLOCK_H = 0.5;
// Proportions follow wordblock-sample.glb (depth ≈ 0.82 × height, edge radius ≈ 9% of height).
export const BLOCK_D = 0.41;
export const BLOCK_RADIUS = 0.046;
export const BLOCK_COLOR = '#6B86CE';
export const HOLD_Z = 2.6;
export const CAMERA_Z = 12;
export const CAMERA_Y = 0.4;
export const FOV = 40;
export const TRAY_Z = 1.3;
export const TRAY_DEPTH = 1.25;
export const TRAY_TILT = 0.22;
// Tray shape follows box-model-sample.glb: one rounded-rectangle rim (large corner radius in plan view,
// thick walls with a rounded top edge), a low front, and a thick back block carrying the nameplate.
// Values are the sample's proportions × ~2.5 (a typical tray is ~2.3–2.7 wide).
export const TRAY_CORNER_R = 0.14;
export const TRAY_WALL = 0.11;
export const TRAY_BEVEL = 0.05;
export const TRAY_RIM_H = 0.34;
export const TRAY_FLOOR_T = 0.08;
export const TRAY_BACK_D = 0.26;
export const TRAY_BACK_H = 0.82;
export const TRAY_BACK_R = 0.1;
export const TRAY_TOTAL_H = 1.12;

export type Phase = 'rest' | 'held' | 'flying';

export interface Flight {
  p0: THREE.Vector3;
  /** Launch time (ms). Auto flights are scheduled in the future and "wind up" in the pending area until then. */
  t0: number;
  dur: number;
  to: string;
  s0: number;
  kind: 'manual' | 'auto';
  launched: boolean;
  q0: THREE.Quaternion;
  /** Tumble (radians around the block's own axis) that unwinds to 0 by landing; auto flights only. */
  spin: number;
}

export interface BlockRT {
  id: string;
  text: string;
  width: number;
  seed: number;
  group: THREE.Group | null;
  body: THREE.MeshPhysicalMaterial | null;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  scale: number;
  phase: Phase;
  hover: boolean;
  flight: Flight | null;
  glow: number;
  tint: number;
  tintColor: THREE.Color;
  spawned: boolean;
}

export interface TrayRT {
  id: string;
  colorIndex: number;
  group: THREE.Group | null;
  strip: THREE.MeshBasicMaterial | null;
  floor: THREE.MeshBasicMaterial | null;
  color: THREE.Color;
  width: number;
  pulse: number;
  hot: number;
  candidate: number;
  born: boolean;
}

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
}

export const blocks = new Map<string, BlockRT>();
export const trays = new Map<string, TrayRT>();
export const trayScreen = new Map<string, ScreenRect>();
export const fieldHomes = new Map<string, THREE.Vector3>();
export const field = { key: '', count: 0, scale: 1 };
export const view = {
  camZ: CAMERA_Z,
  tanHalf: Math.tan(THREE.MathUtils.degToRad(FOV / 2)),
  rect: new DOMRect(),
};

export const drag = {
  active: false,
  id: null as string | null,
  pointerId: -1,
  startX: 0,
  startY: 0,
  startT: 0,
  x: 0,
  y: 0,
  moved: false,
  fromTray: null as string | null,
  samples: [] as { x: number; y: number; t: number }[],
  point: new THREE.Vector3(),
  target: null as string | null,
  mode: null as 'drop' | 'aim' | null,
  /** A touch long-press showed the keyword's meaning (release shouldn't count as a tap). */
  peeked: false,
};

export const dom = {
  stage: null as HTMLElement | null,
  /** The brief card / pill over the stage's top-left: blocks keep out from under it. */
  brief: null as HTMLElement | null,
  ghost: null as HTMLDivElement | null,
};

export const guide = { line: null as QuadraticBezierLineRef | null };

// Dev-only handle for inspecting input/physics state from the console.
export const debug = { camera: null as THREE.Camera | null };
if (import.meta.env.DEV) Object.assign(window, { __p0: { blocks, trays, trayScreen, drag, view, debug } });
