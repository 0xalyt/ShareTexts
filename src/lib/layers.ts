/**
 * layers.ts — "is a sheet, menu or popover currently on screen?"
 *
 * The room answers Escape in a window-level listener. A sheet or menu also
 * answers Escape in its own listener, and both run for one keypress: the sheet
 * closes itself, then the room's listener sees that key too. It must not treat
 * that as "nothing was open" and open the Disconnect confirmation.
 *
 * Component state cannot answer this. The room and its sheets do not always
 * share one state object — Settings can be owned by a sibling view — so the
 * room's copy of `showSettings` is legitimately false while a sheet is open
 * (that is how Escape inside Settings used to open Disconnect). The DOM is the
 * honest source: it knows what is actually mounted and visible right now.
 *
 * Visibility matters in the other direction too. ShareTexts keeps several
 * surfaces mounted but invisible (`keepMounted`, `visibility:hidden`, an
 * `aria-hidden` host) so their lists do not restart. Counting those would make
 * Escape do nothing at all in a quiet room.
 */
export function hasOpenLayer(): boolean {
  if (typeof document === 'undefined') return false;

  const SELECTOR = '[role="dialog"][aria-modal="true"], [role="menu"], [role="listbox"]';
  const nodes = document.querySelectorAll(SELECTOR);

  for (const el of nodes) {
    // A surface parked inside a hidden host is not a layer.
    if (el.closest('[aria-hidden="true"]')) continue;
    // checkVisibility covers visibility:hidden, display:none and the `hidden`
    // attribute. Opacity is deliberately not consulted: a sheet that is still
    // fading out still owns the current Escape.
    if (typeof el.checkVisibility === 'function') {
      if (el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) return true;
      continue;
    }
    if (el.getClientRects().length > 0) return true;
  }

  return false;
}
