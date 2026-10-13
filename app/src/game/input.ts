import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import * as audio from '../audio';
import { useGame } from '../state/store';
import { blocks, dom, drag, HOLD_Z, trayScreen, view, type BlockRT } from './runtime';

const TAP_MOVE_PX = 7;
/** Fingers jitter more than a mouse: a touch must travel further before it counts as a throw. */
const TOUCH_MOVE_PX = 12;
const LONG_PRESS_MS = 450;
let longPressTimer = 0;
const TAP_MS = 320;
const VELOCITY_WINDOW_MS = 90;

export function velocity(now = performance.now()) {
  const recent = drag.samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS);
  if (recent.length < 2) return { vx: 0, vy: 0, speed: 0 };
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = Math.max(8, b.t - a.t) / 1000;
  const vx = (b.x - a.x) / dt;
  const vy = (b.y - a.y) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}

/** Tray directly under the pointer: an inventory card, or a 3D tray's (expanded) screen rect. */
function trayAtPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y);
  const card = el?.closest<HTMLElement>('[data-tray-id]');
  if (card?.dataset.trayId) return card.dataset.trayId;
  if (!el || !dom.stage?.contains(el)) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const [id, r] of trayScreen) {
    if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue;
    const d = Math.hypot(x - r.cx, y - r.cy);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

/** Aim assist: the tray closest to the flick direction within maxDeg. */
function aimTarget(x: number, y: number, vx: number, vy: number, maxDeg: number): string | null {
  const speed = Math.hypot(vx, vy);
  if (!speed) return null;
  let best: string | null = null;
  let bestScore = Infinity;
  for (const [id, r] of trayScreen) {
    const dx = r.cx - x;
    const dy = r.cy - y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return id;
    const cos = (dx * vx + dy * vy) / (dist * speed);
    if (cos <= 0) continue;
    const deg = (Math.acos(Math.min(1, cos)) * 180) / Math.PI;
    if (deg > maxDeg) continue;
    const score = deg + dist / 250;
    if (score < bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

/**
 * Whether a tray can take this block: trays with a shown capacity refuse blocks once full
 * (resting blocks + blocks already flying there, not counting the block itself).
 */
export function canAccept(trayId: string, itemId: string): boolean {
  const game = useGame.getState();
  const cap = game.trays.find((tray) => tray.id === trayId)?.capacity;
  if (cap === undefined) return true;
  let used = 0;
  for (const item of game.items) {
    if (item.id === itemId) continue;
    const flying = blocks.get(item.id)?.flight;
    if (flying && blocks.get(item.id)?.phase === 'flying' ? flying.to === trayId : game.assign[item.id] === trayId) used++;
  }
  return used < cap;
}

export function decideTarget(release: boolean): { target: string | null; mode: 'drop' | 'aim' | null } {
  const { tuning } = useGame.getState();
  const id = drag.id ?? '';
  const over = trayAtPoint(drag.x, drag.y);
  if (over) return canAccept(over, id) || over === drag.fromTray ? { target: over, mode: 'drop' } : { target: null, mode: null };
  const v = velocity();
  const needed = release ? tuning.throwSpeed : tuning.throwSpeed * 0.55;
  if (v.speed < needed) return { target: null, mode: null };
  const aim = aimTarget(drag.x, drag.y, v.vx, v.vy, tuning.aimAngle);
  return aim && canAccept(aim, id) ? { target: aim, mode: 'aim' } : { target: null, mode: null };
}

function startFlight(rt: BlockRT, to: string) {
  rt.phase = 'flying';
  rt.flight = {
    p0: rt.pos.clone(),
    t0: performance.now(),
    dur: 0,
    to,
    s0: rt.scale,
    kind: 'manual',
    launched: true,
    q0: rt.group ? rt.group.quaternion.clone() : new THREE.Quaternion(),
    spin: 0,
  };
  const game = useGame.getState();
  if (game.selected === rt.id) game.select(null);
}

/** Send a block to a tray without dragging (tap-to-select, number keys, inventory click). */
export function sendTo(itemId: string, trayId: string) {
  const rt = blocks.get(itemId);
  const game = useGame.getState();
  if (!rt || rt.phase !== 'rest' || game.result || game.assign[itemId] === trayId) return;
  if (!canAccept(trayId, itemId)) {
    audio.miss();
    game.select(null);
    return;
  }
  startFlight(rt, trayId);
  audio.whoosh(900);
}

/**
 * Schedule an automatic drop ("おまかせ"): the block winds up in the pending area, then launches
 * after `delayMs` on a high tumbling arc. Returns false if the block can't be sent now.
 */
export function autoSend(itemId: string, trayId: string, delayMs: number): boolean {
  const rt = blocks.get(itemId);
  const game = useGame.getState();
  if (!rt || rt.phase !== 'rest' || game.result || game.assign[itemId] === trayId || !canAccept(trayId, itemId)) return false;
  startFlight(rt, trayId);
  const f = rt.flight!;
  f.kind = 'auto';
  f.launched = false;
  f.t0 = performance.now() + delayMs;
  f.spin = (Math.random() < 0.5 ? -1 : 1) * Math.PI * 2;
  return true;
}

export function beginDrag(id: string, e: ThreeEvent<PointerEvent>) {
  e.stopPropagation();
  const ne = e.nativeEvent;
  if (drag.active) return;
  if (ne.pointerType === 'mouse' && ne.button !== 0) return;
  const rt = blocks.get(id);
  const game = useGame.getState();
  if (!rt || rt.phase === 'flying' || game.result || game.briefingOpen) return;
  const now = performance.now();
  // Long-press (touch) shows the keyword's meaning instead of starting a throw.
  window.clearTimeout(longPressTimer);
  if (ne.pointerType === 'mouse') game.setPeek(null);
  drag.peeked = false;
  if (ne.pointerType !== 'mouse') {
    longPressTimer = window.setTimeout(() => {
      if (drag.active && drag.id === id && !drag.moved) {
        drag.peeked = true;
        useGame.getState().setPeek({ id, x: drag.x, y: drag.y });
      }
    }, LONG_PRESS_MS);
  }
  drag.active = true;
  drag.id = id;
  drag.pointerId = ne.pointerId;
  drag.startX = drag.x = ne.clientX;
  drag.startY = drag.y = ne.clientY;
  drag.startT = now;
  drag.moved = false;
  drag.target = null;
  drag.mode = null;
  drag.samples = [{ x: ne.clientX, y: ne.clientY, t: now }];
  drag.fromTray = useGame.getState().assign[id] ?? null;
  drag.point.set(rt.pos.x, rt.pos.y, HOLD_Z);
  rt.phase = 'held';
  rt.vel.set(0, 0, 0);
  if (dom.ghost) dom.ghost.textContent = rt.text;
  audio.pick();
  document.body.classList.add('is-dragging');
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
}

function onMove(ev: PointerEvent) {
  if (ev.pointerId !== drag.pointerId) return;
  const now = performance.now();
  drag.x = ev.clientX;
  drag.y = ev.clientY;
  drag.samples.push({ x: ev.clientX, y: ev.clientY, t: now });
  while (drag.samples.length > 2 && now - drag.samples[0].t > 200) drag.samples.shift();
  // Reading the meaning (long-press): sliding the finger never turns into a throw.
  if (drag.peeked) {
    useGame.getState().setPeek({ id: drag.id!, x: ev.clientX, y: ev.clientY });
    return;
  }
  const limit = ev.pointerType === 'mouse' ? TAP_MOVE_PX : TOUCH_MOVE_PX;
  if (!drag.moved && Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY) > limit) {
    drag.moved = true;
    window.clearTimeout(longPressTimer);
  }
}

function finish() {
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', onCancel);
  window.clearTimeout(longPressTimer);
  document.body.classList.remove('is-dragging');
  drag.active = false;
  drag.id = null;
  drag.target = null;
  drag.mode = null;
  useGame.getState().setDragTarget(null);
}

function onUp(ev: PointerEvent) {
  if (ev.pointerId !== drag.pointerId) return;
  const now = performance.now();
  drag.x = ev.clientX;
  drag.y = ev.clientY;
  drag.samples.push({ x: ev.clientX, y: ev.clientY, t: now });
  const id = drag.id;
  const rt = id ? blocks.get(id) : undefined;
  const fromTray = drag.fromTray;
  const isTap = !drag.moved && now - drag.startT < TAP_MS;
  const peeked = drag.peeked;
  const decision = isTap || peeked ? null : decideTarget(true);
  const v = velocity(now);
  finish();
  if (!id || !rt) return;

  const game = useGame.getState();
  if (peeked) {
    // Long-press was only to read the meaning: put the block back and hide the tooltip.
    drag.peeked = false;
    rt.phase = 'rest';
    game.setPeek(null);
    return;
  }
  if (isTap) {
    rt.phase = 'rest';
    if (fromTray) {
      game.moveItem(id, null);
      audio.drop();
    } else {
      game.select(game.selected === id ? null : id);
      audio.tick();
    }
    return;
  }

  if (decision?.target) {
    if (decision.target === fromTray) {
      rt.phase = 'rest';
      audio.drop();
      return;
    }
    startFlight(rt, decision.target);
    audio.whoosh(v.speed);
    return;
  }

  // Miss: no penalty, the block drifts in the flick direction and springs back to its home.
  rt.phase = 'rest';
  if (fromTray) game.moveItem(id, null);
  if (v.speed > game.tuning.throwSpeed * 0.6) {
    const worldPerPx = (2 * (view.camZ - HOLD_Z) * view.tanHalf) / Math.max(1, view.rect.height);
    rt.vel.set(v.vx * worldPerPx, -v.vy * worldPerPx, 0).multiplyScalar(0.45).clampLength(0, 7);
    audio.miss();
  } else {
    audio.drop();
  }
}

function onCancel(ev: PointerEvent) {
  if (ev.pointerId !== drag.pointerId) return;
  const rt = drag.id ? blocks.get(drag.id) : undefined;
  finish();
  if (rt) rt.phase = 'rest';
  if (drag.peeked) {
    drag.peeked = false;
    useGame.getState().setPeek(null);
  }
}
