// SPDX-License-Identifier: AGPL-3.0-or-later
// Pointer, wheel, pinch and keyboard input on the preview, reported as
// pan (CSS px) and zoom (multiplicative factor) callbacks.

const KEY_STEP = 10; // CSS px per arrow press
const KEY_STEP_FAST = 40; // with Shift
const KEY_ZOOM = 1.1;
const WHEEL_ZOOM = 0.0015; // per wheel pixel

/**
 * @param {HTMLElement} el
 * @param {{ onPan: (dx: number, dy: number) => void, onZoom: (factor: number) => void }} handlers
 * @returns {() => void} detach
 */
export function attachGestures(el, { onPan, onZoom }) {
  const pointers = new Map(); // pointerId -> { x, y }

  const pinchState = () => {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  };
  let pinch = null;

  const down = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    el.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch = pointers.size === 2 ? pinchState() : null;
  };

  const move = (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    e.preventDefault();
    if (pointers.size === 1) {
      onPan(e.clientX - prev.x, e.clientY - prev.y);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && pinch) {
      const next = pinchState();
      if (pinch.dist > 0 && next.dist > 0) onZoom(next.dist / pinch.dist);
      onPan(next.mx - pinch.mx, next.my - pinch.my);
      pinch = next;
    }
  };

  const up = (e) => {
    pointers.delete(e.pointerId);
    pinch = pointers.size === 2 ? pinchState() : null;
  };

  const wheel = (e) => {
    e.preventDefault();
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
    onZoom(Math.exp(-px * WHEEL_ZOOM));
  };

  const key = (e) => {
    const step = e.shiftKey ? KEY_STEP_FAST : KEY_STEP;
    const actions = {
      ArrowLeft: () => onPan(step, 0),
      ArrowRight: () => onPan(-step, 0),
      ArrowUp: () => onPan(0, step),
      ArrowDown: () => onPan(0, -step),
      "+": () => onZoom(KEY_ZOOM),
      "=": () => onZoom(KEY_ZOOM),
      "-": () => onZoom(1 / KEY_ZOOM),
      _: () => onZoom(1 / KEY_ZOOM),
    };
    const action = actions[e.key];
    if (!action || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    action();
  };

  const opts = { passive: false };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move, opts);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
  el.addEventListener("lostpointercapture", up);
  el.addEventListener("wheel", wheel, opts);
  el.addEventListener("keydown", key);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move, opts);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", up);
    el.removeEventListener("lostpointercapture", up);
    el.removeEventListener("wheel", wheel, opts);
    el.removeEventListener("keydown", key);
  };
}
