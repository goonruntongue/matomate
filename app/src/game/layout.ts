import * as THREE from 'three';
import {
  BLOCK_D,
  BLOCK_H,
  CAMERA_Z,
  FOV,
  TRAY_BACK_D,
  TRAY_DEPTH,
  TRAY_FLOOR_T,
  TRAY_TOTAL_H,
  TRAY_WALL,
  TRAY_Z,
} from './runtime';

export interface Metrics {
  camZ: number;
  tanHalf: number;
  vh0: number;
  vw0: number;
  vwT: number;
  trayY: number;
  trayGap: number;
  fieldLeft: number;
  fieldRight: number;
  fieldTop: number;
  fieldBottom: number;
}

/** The stage character's corner in CSS px (top-right of the canvas): its column width and how far
 *  down it reaches. Must match `.buddy` (top, right) + `.buddy-figure` (size) in styles.css. */
export function buddyCornerPx(width: number): { w: number; h: number } {
  return width <= 640 ? { w: 102, h: 52 + 126 } : { w: 164, h: 56 + 196 };
}

/** A part of the screen blocks must not rest under, in world units on the z = 0 plane. */
export interface Keepout {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** A CSS-px rectangle on the canvas (0,0 = its top-left) as a padded world-space keep-out. */
export function keepoutFromPx(m: Metrics, width: number, height: number, r: { left: number; top: number; right: number; bottom: number }, pad = 0.12): Keepout {
  const sx = m.vw0 / Math.max(width, 1);
  const sy = m.vh0 / Math.max(height, 1);
  return {
    left: (r.left - width / 2) * sx - pad,
    right: (r.right - width / 2) * sx + pad,
    top: (height / 2 - r.top) * sy + pad,
    bottom: (height / 2 - r.bottom) * sy - pad,
  };
}

/** World-space extents of the play area for a canvas of the given CSS size. */
export function metrics(width: number, height: number): Metrics {
  const aspect = width / Math.max(height, 1);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  // Pull the camera back on narrow screens so all trays stay visible.
  const camZ = aspect < 1.25 ? CAMERA_Z * Math.sqrt(1.25 / aspect) : CAMERA_Z;
  const vh0 = 2 * camZ * tanHalf;
  const vw0 = vh0 * aspect;
  const vhT = 2 * (camZ - TRAY_Z) * tanHalf;
  const vwT = vhT * aspect;
  const trayY = -vhT / 2 + 0.62;
  const trayTopFraction = (trayY + TRAY_TOTAL_H) / (vhT / 2);
  return {
    camZ,
    tanHalf,
    vh0,
    vw0,
    vwT,
    trayY,
    trayGap: 0.35,
    fieldLeft: -vw0 / 2 + 0.6,
    // Full width: the character's corner and the brief are keep-outs only for the rows they reach.
    fieldRight: vw0 / 2 - 0.6,
    fieldTop: vh0 / 2 - 0.95, // leaves room for the hint / status banners
    fieldBottom: trayTopFraction * (vh0 / 2) + 0.4,
  };
}

export function trayWidth(m: Metrics, count: number): number {
  return Math.min(2.7, (m.vwT * 0.9 - (count - 1) * m.trayGap) / count);
}

export function trayX(m: Metrics, index: number, count: number, width: number): number {
  return (index - (count - 1) / 2) * (width + m.trayGap);
}

/** Deterministic pseudo-random in [0, 1). */
export function rand(seed: number, k: number): number {
  const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Stable hash of a string in [0, 1). */
export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

interface Entry {
  id: string;
  width: number;
  seed: number;
}

interface Band {
  y: number;
  left: number;
  right: number;
}

/**
 * `n` evenly spread rows for blocks of the given height, each narrowed by the keep-outs it overlaps:
 * one on the left half pushes the row's start right, one on the right half pulls its end left.
 */
function bandsFor(m: Metrics, n: number, rowH: number, keepouts: Keepout[]): { bands: Band[]; gapY: number } {
  const areaH = Math.max(1, m.fieldTop - m.fieldBottom);
  const gapY = n > 1 ? THREE.MathUtils.clamp((areaH - n * rowH) / (n - 1), 0.08, 1.3) : 0;
  const totalH = n * rowH + (n - 1) * gapY;
  const midY = (m.fieldTop + m.fieldBottom) / 2;
  const bands: Band[] = [];
  for (let r = 0; r < n; r++) {
    const y = midY + totalH / 2 - rowH / 2 - r * (rowH + gapY);
    const top = y + rowH / 2 + 0.1; // + vertical jitter
    const bottom = y - rowH / 2 - 0.1;
    let left = m.fieldLeft;
    let right = m.fieldRight;
    for (const k of keepouts) {
      if (top <= k.bottom || bottom >= k.top) continue;
      if ((k.left + k.right) / 2 < 0) left = Math.max(left, k.right);
      else right = Math.min(right, k.left);
    }
    bands.push({ y, left, right });
  }
  return { bands, gapY };
}

/** Fill the rows top to bottom; `balanced` caps each at its share of the total so the last row isn't a stub. */
function fillBands(list: Entry[], bands: Band[], gapX: number, scale: number, balanced: boolean): Entry[][] | null {
  const rows: Entry[][] = bands.map(() => []);
  const room = bands.map((b) => Math.max(0, b.right - b.left));
  const totalRoom = room.reduce((a, b) => a + b, 0);
  const totalW = list.reduce((sum, e) => sum + e.width * scale + gapX, 0);
  let i = 0;
  for (let r = 0; r < bands.length && i < list.length; r++) {
    const share = balanced && totalRoom > 0 ? (totalW * room[r]) / totalRoom : Infinity;
    let w = 0;
    while (i < list.length) {
      const ew = list[i].width * scale;
      const next = rows[r].length ? w + gapX + ew : ew;
      if (next > room[r] || (rows[r].length && next - ew / 2 > share)) break;
      rows[r].push(list[i++]);
      w = next;
    }
  }
  return i === list.length ? rows : null;
}

/**
 * Non-overlapping, loosely jittered home positions for the floating blocks. Rows run the full width
 * of the field except where a keep-out (the brief card, the stage character) reaches into them, so
 * the space under the character is used too.
 * `boost` (text size 大) raises the starting size; the blocks still shrink until they fit, so a
 * crowded board (e.g. many blocks on a phone) ends up about the same size, never overlapping.
 */
export function layoutField(list: Entry[], m: Metrics, boost = 1, keepouts: Keepout[] = []): { homes: Map<string, THREE.Vector3>; scale: number } {
  const homes = new Map<string, THREE.Vector3>();
  if (!list.length) return { homes, scale: 1 };
  const areaH = Math.max(1, m.fieldTop - m.fieldBottom);
  const gapX = 0.32;
  const minGapY = 0.28;
  const maxRows = (rowH: number) => Math.max(1, Math.floor((areaH + minGapY) / (rowH + minGapY)));

  // Start above 1 so a sparse board (10-15 blocks) gets bigger, easier-to-read blocks; shrink until
  // everything fits, in the fewest rows.
  let scale = 1.25 * boost;
  let rows: Entry[][] | null = null;
  let bands: Band[] = [];
  let gapY = 0;
  for (;;) {
    const rowH = BLOCK_H * scale;
    for (let n = 1; n <= maxRows(rowH) && !rows; n++) {
      ({ bands, gapY } = bandsFor(m, n, rowH, keepouts));
      rows = fillBands(list, bands, gapX, scale, true) ?? fillBands(list, bands, gapX, scale, false);
    }
    if (rows || scale <= 0.55) break;
    scale -= 0.05;
  }
  if (!rows) {
    // Too many to fit even at the smallest size: deal them round-robin (they may touch).
    ({ bands, gapY } = bandsFor(m, maxRows(BLOCK_H * scale), BLOCK_H * scale, keepouts));
    const dealt: Entry[][] = bands.map(() => []);
    list.forEach((e, i) => dealt[i % bands.length].push(e));
    rows = dealt;
  }

  rows.forEach((row, r) => {
    if (!row.length) return;
    const band = bands[r];
    const areaW = Math.max(0, band.right - band.left);
    const rowW = row.reduce((sum, e) => sum + e.width * scale, 0) + (row.length - 1) * gapX;
    const slack = Math.max(0, areaW - rowW);
    const extraGap = row.length > 1 ? Math.min(0.6, (slack * 0.5) / (row.length - 1)) : 0;
    const usedW = rowW + extraGap * (row.length - 1);
    let x = band.left + (areaW - usedW) / 2 + (rand(r + 1, 7) - 0.5) * Math.min(0.8, Math.max(0, areaW - usedW));
    for (const e of row) {
      const w = e.width * scale;
      const s = e.seed * 1000;
      const jx = (rand(s, 1) - 0.5) * Math.min(0.16, gapX * 0.5 + extraGap * 0.5);
      const jy = (rand(s, 2) - 0.5) * Math.min(0.2, gapY * 0.6);
      const z = -0.55 + rand(s, 3) * 0.9;
      homes.set(e.id, new THREE.Vector3(x + w / 2 + jx, band.y + jy, z));
      x += w + gapX + extraGap;
    }
  });
  return { homes, scale };
}

export const TRAY_ROWS = 3;
// Usable cavity: between the back block's front face and the front wall's inner face.
const CAVITY_BACK = -TRAY_DEPTH / 2 + 0.005 + TRAY_BACK_D + 0.03;
const CAVITY_FRONT = TRAY_DEPTH / 2 - TRAY_WALL - 0.03;
const SLOTS_PER_LAYER = TRAY_ROWS * 2;
const LAY_FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const yawQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Local position of a block lying face-up on the tray floor: 2 columns × 3 rows filled back to front,
 * then stacked in layers. Returns its scale.
 */
export function slotLocal(index: number, trayW: number, blockW: number, out: THREE.Vector3): number {
  const innerW = trayW - TRAY_WALL * 2;
  const pitch = (CAVITY_FRONT - CAVITY_BACK) / TRAY_ROWS;
  const scale = Math.min(0.5, (innerW * 0.46) / blockW, (pitch * 0.92) / BLOCK_H);
  const layer = Math.floor(index / SLOTS_PER_LAYER);
  const slot = index % SLOTS_PER_LAYER;
  const row = Math.floor(slot / 2);
  const col = slot % 2;
  const thickness = BLOCK_D * scale;
  out.set(
    (col === 0 ? -1 : 1) * innerW * 0.25 + (rand(index, 11) - 0.5) * 0.04,
    TRAY_FLOOR_T + thickness / 2 + layer * thickness * 1.02,
    CAVITY_BACK + pitch * (row + 0.5),
  );
  return scale;
}

/** Local rotation for a slot: lying flat (face up) with a slight natural yaw. */
export function slotRotation(index: number, out: THREE.Quaternion): THREE.Quaternion {
  yawQ.setFromAxisAngle(UP, (rand(index, 13) - 0.5) * 0.14);
  return out.copy(yawQ).multiply(LAY_FLAT);
}
