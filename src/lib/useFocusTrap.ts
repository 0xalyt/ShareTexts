/**
 * useFocusTrap — traps keyboard focus inside a container element.
 *
 * Usage:
 *   const trapRef = useFocusTrap(isOpen);
 *   <div ref={trapRef} role="dialog" aria-modal="true">...</div>
 *
 * Behavior:
 * - When isOpen becomes true, remembers what had focus ("the trigger") and
 *   focuses the first focusable element in the container
 * - Tab cycles within the container; Shift+Tab cycles backwards
 * - Escape calls onClose (if provided)
 * - When isOpen becomes false, focus returns to the trigger — the control the
 *   person used to open the surface (DESIGN.md §18, APPLE-DNA §6.4)
 */
import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Only things a person can actually reach. `querySelectorAll` happily returns
 * the ✕ of a collapsed section, a control inside a hidden tab panel, or the
 * off-screen copy a sheet keeps mounted — and then Tab "focuses" something
 * invisible, which looks like the keyboard stopped working.
 */
function focusablesIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    return el.getClientRects().length > 0;
  });
}

export function useFocusTrap(
  isOpen: boolean,
  onClose?: () => void,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);

  // Open: remember the trigger. Close: give focus back to it.
  //
  // This has to happen in one effect that survives the transition. The old
  // version restored focus from inside a cleanup, where `isOpen` was still the
  // value from the render that created it, so the `!isOpen` branch was never
  // reachable and focus stayed on <body> (B30).
  useEffect(() => {
    if (isOpen) {
      if (!wasOpen.current) {
        previousFocusRef.current = document.activeElement as HTMLElement | null;
        wasOpen.current = true;
      }
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const trigger = previousFocusRef.current;
    previousFocusRef.current = null;
    if (!trigger || !document.contains(trigger)) return;
    // Deferred one frame: the trigger can be inside a surface that is still
    // animating out, and focusing it mid-exit scrolls the page back.
    const raf = requestAnimationFrame(() => {
      if (document.contains(trigger)) trigger.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;

    // Focus after a tick (allows DOM to settle). A surface can name where
    // focus belongs with [data-autofocus] — a confirmation wants its armed
    // action, a sheet wants its own container — and anything else keeps the
    // old first-control behaviour. Jumping to the first control is a guess:
    // in a sheet that is the ✕, so the first thing a keyboard user landed on
    // was "close this" and the first thing they saw was a focus ring around
    // it.
    const timer = setTimeout(() => {
      // Native autofocus may already have placed the caret in an editor.
      // Do not steal it (or trigger its blur-to-save) after the sheet opens.
      if (container.contains(document.activeElement)) return;
      const explicit = container.matches('[data-autofocus]')
        ? container
        : container.querySelector<HTMLElement>('[data-autofocus]');
      if (explicit) {
        explicit.focus({ preventScroll: true });
        return;
      }
      const focusable = focusablesIn(container);
      if (focusable.length > 0) focusable[0].focus();
      // A dialog with nothing focusable is still a dialog: park focus on the
      // container (it carries tabIndex={-1}) so the page behind cannot be
      // reached with the keyboard and Escape still lands somewhere sane.
      else container.focus({ preventScroll: true });
    }, 50);

    // Trap Tab
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = focusablesIn(container);
        if (focusable.length === 0) {
          // Nothing to cycle through: keep focus on the dialog itself.
          e.preventDefault();
          container.focus({ preventScroll: true });
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
      }
    };

    container.addEventListener('keydown', onKeyDown);

    /* Focus can leave without a Tab: a programmatic .focus() elsewhere, a
       click on a surface the scrim does not cover, an assistive-tech jump.
       Pulling it back is the difference between a trap and a suggestion. The
       trigger is restored by the effect above, after this listener is gone. */
    const onFocusIn = (e: FocusEvent) => {
      const target = e.target as Node | null;
      if (target && container.contains(target)) return;
      const list = focusablesIn(container);
      (list[0] ?? container).focus({ preventScroll: true });
    };
    document.addEventListener('focusin', onFocusIn);

    return () => {
      clearTimeout(timer);
      container.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [isOpen, onClose]);

  return containerRef;
}
