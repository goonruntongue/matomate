// Single per-frame loop: camera rig, tray layout, drag targeting, block motion, guide line.
import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import * as audio from '../audio';
import { useGame } from '../state/store';
import { decideTarget, velocity } from './input';
import { buddyCornerPx, keepoutFromPx, layoutField, metrics, slotLocal, slotRotation, trayWidth, trayX, type Keepout } from './layout';
import { rainbowHex, THEMES } from '../theme/themes';
import {
  blocks,
  CAMERA_Y,
  debug,
  dom,
  drag,
  field,
  fieldHomes,
  guide,
  HOLD_Z,
  TRAY_DEPTH,
  TRAY_TILT,
  TRAY_TOTAL_H,
  TRAY_Z,
  trays,
  trayScreen,
  view,
} from './runtime';

const accent = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WRONG = new THREE.Color('#FF4D4D');
const RIGHT = new THREE.Color('#27D2BB');

function quadBezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number, out: THREE.Vector3) {
  const u = 1 - t;
  out.set(
    u * u * a.x + 2 * u * t * b.x + t * t * c.x,
    u * u * a.y + 2 * u * t * b.y + t * t * c.y,
    u * u * a.z + 2 * u * t * b.z + t * t * c.z,
  );
}

export function Director() {
  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      c: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      q2: new THREE.Quaternion(),
      e: new THREE.Euler(),
      obj: new THREE.Object3D(),
      ray: new THREE.Raycaster(),
      plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -HOLD_Z),
      ndc: new THREE.Vector2(),
      corners: Array.from({ length: 8 }, () => new THREE.Vector3()),
      base: new THREE.Color(),
      glow: new THREE.Color(),
    }),
    [],
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const t = state.clock.elapsedTime;
    const now = performance.now();
    const ease = (k: number) => 1 - Math.exp(-k * dt);
    const game = useGame.getState();
    const tun = game.tuning;
    const still = game.prefs.motion !== 'full'; // motion setting: no floating, no parallax
    const theme = THEMES[game.theme];
    accent.set(theme.accent);
    const cam = state.camera as THREE.PerspectiveCamera;
    const m = metrics(state.size.width, state.size.height);
    view.camZ = m.camZ;
    view.tanHalf = m.tanHalf;
    view.rect = state.gl.domElement.getBoundingClientRect();
    debug.camera = cam;

    // Camera rig: subtle parallax only, damped while dragging so aiming stays stable.
    const parallax = still ? 0 : tun.parallax * (drag.active ? 0.3 : 1);
    cam.position.x += (state.pointer.x * 0.7 * parallax - cam.position.x) * ease(3);
    cam.position.y += (CAMERA_Y + state.pointer.y * 0.35 * parallax - cam.position.y) * ease(3);
    cam.position.z = m.camZ;
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    if (state.scene.fog instanceof THREE.Fog) {
      state.scene.fog.near = m.camZ + 6;
      state.scene.fog.far = m.camZ + 30;
    }

    // Trays: arc layout, highlight states, and projected screen rects for hit testing.
    const n = game.trays.length;
    const tw = trayWidth(m, n);
    trayScreen.clear();
    game.trays.forEach((tray, i) => {
      const rt = trays.get(tray.id);
      if (!rt?.group) return;
      const g = rt.group;
      const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
      tmp.a.set(trayX(m, i, n, tw), m.trayY + 0.14 * u * u, TRAY_Z);
      if (!rt.born) {
        g.position.copy(tmp.a);
        g.position.y -= 2.4;
        rt.born = true;
      }
      g.position.lerp(tmp.a, ease(7));
      g.rotation.set(TRAY_TILT, -u * 0.1, 0);
      rt.width = tw;
      const isTarget = drag.active && drag.target === tray.id;
      rt.hot += ((isTarget ? 1 : 0) - rt.hot) * ease(14);
      const candidate = drag.active ? 1 : game.selected ? 0.7 : 0;
      rt.candidate += (candidate - rt.candidate) * ease(8);
      rt.pulse *= Math.exp(-3.5 * dt);
      g.scale.setScalar(1 + rt.hot * 0.05 + rt.pulse * 0.04);
      g.updateMatrixWorld();
      rt.strip?.color.copy(rt.color).multiplyScalar(1.25 + rt.candidate * 0.5 + rt.hot * 1.6 + rt.pulse * 2.2);
      if (rt.floor) rt.floor.opacity = theme.trayFloorOpacity + rt.candidate * 0.05 + rt.hot * 0.22 + rt.pulse * 0.3;

      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      tmp.corners.forEach((p, k) => {
        p.set(k & 1 ? tw / 2 : -tw / 2, k & 2 ? TRAY_TOTAL_H : 0, k & 4 ? TRAY_DEPTH / 2 : -TRAY_DEPTH / 2);
        g.localToWorld(p).project(cam);
        const sx = view.rect.left + ((p.x + 1) / 2) * view.rect.width;
        const sy = view.rect.top + ((1 - p.y) / 2) * view.rect.height;
        x0 = Math.min(x0, sx);
        x1 = Math.max(x1, sx);
        y0 = Math.min(y0, sy);
        y1 = Math.max(y1, sy);
      });
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const hw = ((x1 - x0) / 2) * tun.hitExpand;
      const hh = ((y1 - y0) / 2) * tun.hitExpand;
      trayScreen.set(tray.id, { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh, cx, cy });
    });

    // Drag: pointer ray onto the hold plane, live target prediction, and the off-canvas ghost.
    if (drag.active && drag.id) {
      tmp.ndc.set(
        ((drag.x - view.rect.left) / view.rect.width) * 2 - 1,
        -((drag.y - view.rect.top) / view.rect.height) * 2 + 1,
      );
      tmp.ray.setFromCamera(tmp.ndc, cam);
      if (tmp.ray.ray.intersectPlane(tmp.plane, tmp.a)) drag.point.copy(tmp.a);
      const decision = decideTarget(false);
      drag.target = decision.target;
      drag.mode = decision.mode;
      game.setDragTarget(decision.target);
      if (dom.ghost) {
        const r = view.rect;
        const outside = drag.x < r.left || drag.x > r.right || drag.y < r.top || drag.y > r.bottom;
        dom.ghost.style.display = outside ? 'block' : 'none';
        if (outside) dom.ghost.style.transform = `translate3d(${drag.x}px, ${drag.y}px, 0) translate(-50%, -50%)`;
      }
    } else if (dom.ghost && dom.ghost.style.display !== 'none') {
      dom.ghost.style.display = 'none';
    }

    // Homes stay put while blocks leave (a full reshuffle per throw is disorienting).
    // Re-layout only on resize, when a block returns without a home, or once the field has thinned out.
    const unsorted = game.items.filter((item) => !game.assign[item.id]);
    // Keep-outs: the stage character's corner, and the brief card / pill (its size changes when folded).
    const W = state.size.width;
    const H = state.size.height;
    const corner = buddyCornerPx(W);
    const keepouts: Keepout[] = [keepoutFromPx(m, W, H, { left: W - corner.w, top: 0, right: W, bottom: corner.h })];
    let briefKey = 'none';
    if (dom.brief?.isConnected) {
      const r = dom.brief.getBoundingClientRect();
      const box = { left: r.left - view.rect.left, top: r.top - view.rect.top, right: r.right - view.rect.left, bottom: r.bottom - view.rect.top };
      briefKey = [box.left, box.top, box.right, box.bottom].map((v) => Math.round(v / 8)).join(',');
      keepouts.push(keepoutFromPx(m, W, H, box));
    }
    const key = `${W}x${H}|${blocks.size}|${game.prefs.textSize}|${briefKey}`;
    const homeless = unsorted.some((item) => !fieldHomes.has(item.id));
    const thinned = unsorted.length > 0 && unsorted.length <= field.count * 0.6;
    if (key !== field.key || homeless || thinned) {
      field.key = key;
      field.count = unsorted.length;
      const result = layoutField(
        unsorted.map((item) => ({
          id: item.id,
          width: blocks.get(item.id)?.width ?? 1.4,
          seed: (blocks.get(item.id)?.seed ?? 0) / (Math.PI * 2),
        })),
        m,
        game.prefs.textSize === 'large' ? 1.2 : 1,
        keepouts,
      );
      fieldHomes.clear();
      result.homes.forEach((home, id) => fieldHomes.set(id, home));
      field.scale = result.scale;
    }

    // Resting cards in each tray, in the order they arrived.
    const perTray = new Map<string, string[]>();
    for (const item of game.items) {
      const trayId = game.assign[item.id];
      const b = blocks.get(item.id);
      if (!trayId || !b || b.phase !== 'rest') continue;
      const list = perTray.get(trayId);
      if (list) list.push(item.id);
      else perTray.set(trayId, [item.id]);
    }
    perTray.forEach((list) => list.sort((a, b) => (game.assignedAt[a] ?? 0) - (game.assignedAt[b] ?? 0)));

    // Blocks currently flying to each tray, in launch order (for slot reservation).
    const flyingTo = new Map<string, string[]>();
    for (const b of blocks.values()) {
      if (b.phase !== 'flying' || !b.flight) continue;
      const list = flyingTo.get(b.flight.to);
      if (list) list.push(b.id);
      else flyingTo.set(b.flight.to, [b.id]);
    }
    flyingTo.forEach((list) => list.sort((a, b) => (blocks.get(a)!.flight!.t0 ?? 0) - (blocks.get(b)!.flight!.t0 ?? 0)));

    const heldVelocity = drag.active ? velocity(now) : null;
    const wrongIds = new Set(game.result?.wrongIds ?? []);
    const faceCamera = (pos: THREE.Vector3) => {
      tmp.obj.position.copy(pos);
      tmp.obj.lookAt(cam.position);
      tmp.q.copy(tmp.obj.quaternion);
    };

    for (const item of game.items) {
      const b = blocks.get(item.id);
      if (!b?.group) continue;
      const g = b.group;
      const home = fieldHomes.get(item.id);
      if (!b.spawned) {
        if (!home) continue;
        b.pos.copy(home).add(tmp.a.set(Math.sin(b.seed) * 1.5, -1.2, -5));
        b.scale = 0.01;
        b.spawned = true;
      }
      const trayId = game.assign[item.id];
      let targetScale = field.scale;
      let glowTarget = 0;
      let tintTarget = 0;
      let tintColor: THREE.Color | null = null;

      if (b.phase === 'held') {
        b.pos.lerp(drag.point, ease(24));
        targetScale = 1.08 * Math.max(0.85, field.scale);
        glowTarget = 1;
        faceCamera(b.pos);
        if (heldVelocity) {
          tmp.e.set(
            THREE.MathUtils.clamp(heldVelocity.vy * 0.00012, -0.35, 0.35),
            0,
            THREE.MathUtils.clamp(-heldVelocity.vx * 0.00012, -0.35, 0.35),
          );
          tmp.q.multiply(tmp.q2.setFromEuler(tmp.e));
        }
        g.quaternion.slerp(tmp.q, ease(14));
        const target = drag.target ? trays.get(drag.target) : undefined;
        if (target) {
          tintTarget = 0.6;
          tintColor = target.color;
        }
      } else if (b.phase === 'flying' && b.flight && now < b.flight.t0) {
        // Auto drop, waiting its turn: pop forward out of the pending area and quiver ("wind-up").
        const trt = trays.get(b.flight.to);
        // Pending blocks wind up above their home; blocks being re-sorted wind up where they sit.
        tmp.a.copy(trayId ? b.flight.p0 : (home ?? b.flight.p0));
        tmp.a.y += 0.3;
        tmp.a.z += 0.8;
        tmp.a.x += Math.sin(now * 0.045 + b.seed) * 0.035;
        b.pos.lerp(tmp.a, ease(10));
        b.scale += (field.scale * 1.15 - b.scale) * ease(10);
        faceCamera(b.pos);
        g.quaternion.slerp(tmp.q, ease(10));
        glowTarget = 0.9;
        if (trt) {
          tintTarget = 0.35;
          tintColor = trt.color;
        }
      } else if (b.phase === 'flying' && b.flight) {
        const f = b.flight;
        const trt = trays.get(f.to);
        if (!trt?.group) {
          b.phase = 'rest';
          b.flight = null;
        } else {
          const auto = f.kind === 'auto';
          if (!f.launched) {
            f.launched = true;
            f.p0.copy(b.pos);
            f.s0 = b.scale;
            f.q0.copy(g.quaternion);
            audio.whoosh(1300);
          }
          // Each in-flight block reserves its own slot so simultaneous drops don't pile onto one spot.
          const inFlight = flyingTo.get(f.to) ?? [];
          const slotIndex = (perTray.get(f.to)?.length ?? 0) + Math.max(0, inFlight.indexOf(item.id));
          const slotScale = slotLocal(slotIndex, trt.width, b.width, tmp.b);
          tmp.q2.copy(trt.group.quaternion).multiply(slotRotation(slotIndex, tmp.q));
          trt.group.localToWorld(tmp.b);
          const dist = f.p0.distanceTo(tmp.b);
          if (f.dur === 0) {
            f.dur = auto
              ? THREE.MathUtils.clamp(0.5 + dist * 0.04, 0.55, 0.85)
              : THREE.MathUtils.clamp(0.3 + dist * 0.035, 0.32, 0.62);
          }
          const u = Math.min(1, (now - f.t0) / 1000 / f.dur);
          const e = auto ? (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2) : 1 - (1 - u) * (1 - u);
          tmp.c.copy(f.p0).add(tmp.b).multiplyScalar(0.5);
          tmp.c.y += auto ? 1.7 + dist * 0.12 : 0.9 + dist * 0.08;
          tmp.c.z += auto ? 1.1 : 0.7;
          quadBezier(f.p0, tmp.c, tmp.b, e, b.pos);
          b.scale = THREE.MathUtils.lerp(f.s0, slotScale * trt.group.scale.x, e);
          if (auto) {
            // Tumble on the way, unwinding so it lands flat and face-up.
            g.quaternion.copy(f.q0).slerp(tmp.q2, e);
            g.quaternion.multiply(tmp.q.setFromAxisAngle(Z_AXIS, (1 - e) * f.spin));
          } else {
            // Tip over to lie flat as it drops in, fully flat by landing.
            g.quaternion.slerp(tmp.q2, Math.max(ease(8), e * e));
          }
          glowTarget = 0.7;
          tintTarget = e;
          tintColor = trt.color;
          if (u >= 1) {
            b.phase = 'rest';
            b.flight = null;
            useGame.getState().moveItem(item.id, f.to);
            trt.pulse = 1;
            audio.clack();
            if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
          }
        }
      } else if (trayId && trays.get(trayId)?.group) {
        const trt = trays.get(trayId)!;
        const tg = trt.group!;
        const index = Math.max(0, perTray.get(trayId)?.indexOf(item.id) ?? 0);
        targetScale = slotLocal(index, trt.width, b.width, tmp.b) * tg.scale.x;
        tg.localToWorld(tmp.b);
        b.pos.lerp(tmp.b, ease(11));
        tmp.q2.copy(tg.quaternion).multiply(slotRotation(index, tmp.q));
        g.quaternion.slerp(tmp.q2, ease(10));
        tintTarget = 1;
        tintColor = trt.color;
      } else {
        const A = still ? 0 : tun.floatAmp;
        const sp = tun.floatSpeed;
        const ph = b.seed;
        tmp.a.copy(home ?? b.pos);
        tmp.a.x += A * (0.6 * Math.sin(t * 0.55 * sp + ph) + 0.4 * Math.sin(t * 0.93 * sp + ph * 1.7));
        tmp.a.y += A * (0.6 * Math.sin(t * 0.71 * sp + ph * 2.3) + 0.4 * Math.sin(t * 1.13 * sp + ph * 0.6));
        tmp.a.z += A * 0.8 * Math.sin(t * 0.43 * sp + ph * 3.1);
        if (game.selected === item.id) {
          tmp.a.z += 0.55;
          targetScale *= 1.12;
          glowTarget = 0.75 + 0.2 * Math.sin(t * 6);
        } else if (b.hover && !drag.active) {
          tmp.a.z += 0.35;
          targetScale *= 1.1;
          glowTarget = 0.35;
        }
        b.vel.multiplyScalar(Math.exp(-3.2 * dt));
        b.pos.addScaledVector(b.vel, dt);
        b.pos.lerp(tmp.a, ease(5));
        faceCamera(b.pos);
        const w = A / 0.14;
        // A per-block resting tilt shows the top and a side face, so the block's thickness reads as 3D.
        const tiltX = 0.3 + Math.sin(ph * 3.7) * 0.08;
        const tiltY = Math.sin(ph * 5.3) * 0.28;
        tmp.e.set(
          tiltX + 0.05 * w * Math.sin(t * 0.47 * sp + ph * 1.3),
          tiltY + 0.08 * w * Math.sin(t * 0.37 * sp + ph * 2.1),
          0.045 * w * Math.sin(t * 0.52 * sp + ph * 0.7),
        );
        tmp.q.multiply(tmp.q2.setFromEuler(tmp.e));
        g.quaternion.slerp(tmp.q, ease(6));
      }

      if (b.phase !== 'flying') b.scale += (targetScale - b.scale) * ease(10);
      g.position.copy(b.pos);
      g.scale.setScalar(Math.max(0.001, b.scale));
      b.glow += (glowTarget - b.glow) * ease(12);
      b.tint += (tintTarget - b.tint) * ease(6);
      if (tintColor) b.tintColor.copy(tintColor);
      if (b.body) {
        if (theme.blockColor === 'rainbow') {
          // Decorative gradient across the field (by home x), never tied to the answer groups.
          const x = (home ?? b.pos).x;
          const gx = (x - m.fieldLeft) / Math.max(0.001, m.fieldRight - m.fieldLeft);
          tmp.base.set(rainbowHex(gx, theme.rainbowSat, theme.rainbowLight));
        } else {
          tmp.base.set(theme.blockColor);
        }
        b.body.color.copy(tmp.base).lerp(b.tintColor, b.tint * 0.6);
        b.body.opacity = theme.blockOpacity;
        // Faint self-glow in the body color keeps the translucent glass readable on any backdrop.
        tmp.glow.copy(b.body.color).multiplyScalar(theme.blockGlow);
        b.body.emissive.copy(tintColor && b.phase !== 'rest' ? tintColor : accent).multiplyScalar(b.glow * 0.55);
        b.body.emissive.add(tmp.glow);
        // Answer check: wrong blocks pulse red, correct ones get a calm green glow.
        if (game.result) {
          if (wrongIds.has(item.id)) b.body.emissive.add(tmp.glow.copy(WRONG).multiplyScalar(0.55 + 0.35 * Math.sin(t * 5)));
          else b.body.emissive.add(tmp.glow.copy(RIGHT).multiplyScalar(0.25));
        }
      }
    }

    // Dashed arc from the held block to the tray it would land in.
    const line = guide.line;
    if (line) {
      const held = drag.active && drag.id ? blocks.get(drag.id) : undefined;
      const target = drag.target ? trays.get(drag.target) : undefined;
      const show = Boolean(tun.guide && held && target?.group);
      line.visible = show;
      if (show && held && target?.group) {
        tmp.b.set(0, 0.3, 0.15); // mouth of the cavity, in front of the back block
        target.group.localToWorld(tmp.b);
        const dist = held.pos.distanceTo(tmp.b);
        tmp.c.copy(held.pos).add(tmp.b).multiplyScalar(0.5);
        tmp.c.y += 0.9 + dist * 0.08;
        tmp.c.z += 0.7;
        line.setPoints(held.pos, tmp.b, tmp.c);
        line.computeLineDistances();
        (line.material as unknown as { color: THREE.Color }).color.copy(target.color).multiplyScalar(1.4);
      }
    }
  });

  return null;
}
