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

    // Focus the first focusable element after a tick (allows DOM to settle)
    const timer = setTimeout(() => {
      const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length > 0) {
        focusable[0].focus();
      }
    }, 50);

    // Trap Tab
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (focusable.length === 0) return;

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

    return () => {
      clearTimeout(timer);
      container.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  return containerRef;
}
