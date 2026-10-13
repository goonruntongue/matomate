// Tray geometry modeled on box-model-sample.glb: a single hollow rounded-rectangle rim with
// beveled (rounded) edges instead of five separate boxes with square plan-view corners.
import * as THREE from 'three';
import { TRAY_BEVEL, TRAY_CORNER_R, TRAY_DEPTH, TRAY_FLOOR_T, TRAY_RIM_H, TRAY_WALL } from './runtime';

function roundedRect(w: number, d: number, r: number, path: THREE.Path = new THREE.Shape()) {
  const x = -w / 2;
  const y = -d / 2;
  const rr = Math.max(0.001, Math.min(r, w / 2, d / 2));
  path.moveTo(x + rr, y);
  path.lineTo(x + w - rr, y);
  path.quadraticCurveTo(x + w, y, x + w, y + rr);
  path.lineTo(x + w, y + d - rr);
  path.quadraticCurveTo(x + w, y + d, x + w - rr, y + d);
  path.lineTo(x + rr, y + d);
  path.quadraticCurveTo(x, y + d, x, y + d - rr);
  path.lineTo(x, y + rr);
  path.quadraticCurveTo(x, y, x + rr, y);
  return path;
}

/** Extrude a plan-view shape upward to a finished height, with rounded (beveled) edges. */
function extrudeUp(shape: THREE.Shape, height: number, bevel: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, height - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 5,
    curveSegments: 20,
  });
  // Shape XY → plan XZ, extrusion → +Y, bottom of the bevel at y = 0.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, bevel, 0);
  geometry.computeVertexNormals();
  return geometry;
}

/** Hollow rim: outer rounded rectangle minus the inner cavity. Final outer size is exactly width × TRAY_DEPTH. */
export function makeRimGeometry(width: number): THREE.ExtrudeGeometry {
  const b = TRAY_BEVEL;
  // Bevel grows the outline outward and the hole inward, so pre-compensate both paths.
  const outer = roundedRect(width - b * 2, TRAY_DEPTH - b * 2, TRAY_CORNER_R - b) as THREE.Shape;
  const innerW = width - TRAY_WALL * 2 + b * 2;
  const innerD = TRAY_DEPTH - TRAY_WALL * 2 + b * 2;
  outer.holes.push(roundedRect(innerW, innerD, Math.max(0.03, TRAY_CORNER_R - TRAY_WALL + b), new THREE.Path()));
  return extrudeUp(outer, TRAY_RIM_H, b);
}

/** Solid rounded floor slab under the rim. */
export function makeFloorGeometry(width: number): THREE.ExtrudeGeometry {
  const b = 0.02;
  const shape = roundedRect(width - b * 2, TRAY_DEPTH - b * 2, TRAY_CORNER_R - b) as THREE.Shape;
  return extrudeUp(shape, TRAY_FLOOR_T, b);
}
