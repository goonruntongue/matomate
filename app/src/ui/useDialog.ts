// Modal behavior shared by every dialog (SPEC 5.6): Tab / Shift+Tab stay inside, Esc closes it (when it
// can be closed), and focus goes back to where it was once it closes. Dialogs can stack (the share
// popover opens from the settings panel): only the top one handles keys.
import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

const stack: HTMLElement[] = [];

/** Spread the returned ref onto the dialog element. `open` is for dialogs that stay mounted while closed. */
export function useDialog<T extends HTMLElement>(onClose?: () => void, open = true) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Captured while rendering: by the time effects run, autoFocus has already moved focus inside.
  const before = useRef<Element | null>(null);
  if (open && !before.current) before.current = document.activeElement;
  if (!open) before.current = null;

  useEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    stack.push(el);
    if (!el.contains(document.activeElement)) {
      const first = el.querySelector<HTMLElement>(FOCUSABLE);
      if (first) first.focus({ preventScroll: true });
      else {
        el.tabIndex = -1;
        el.focus({ preventScroll: true });
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return;
      if (e.key === 'Escape') {
        if (!close.current) return;
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.getClientRects().length > 0);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (!el.contains(at) || (e.shiftKey && at === first) || (!e.shiftKey && at === last)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const back = before.current;
    return () => {
      document.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(el), 1);
      if (back instanceof HTMLElement && back.isConnected && back !== document.body) back.focus({ preventScroll: true });
    };
  }, [open]);

  return ref;
}
