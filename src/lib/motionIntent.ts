/** Keyboard paths are immediate. Pointer paths may spend a short motion
 * budget explaining the handoff. Page-lived, two passive event listeners;
 * no React renders, timers, or per-frame work. */
export function initMotionIntent() {
  const root = document.documentElement;
  const set = (value: 'keyboard' | 'pointer') => {
    if (root.dataset.motionIntent !== value) root.dataset.motionIntent = value;
  };
  const pointer = () => set('pointer');
  const keyboard = () => set('keyboard');
  set('keyboard');
  window.addEventListener('pointerdown', pointer, { capture: true, passive: true });
  window.addEventListener('keydown', keyboard, { capture: true, passive: true });
  return () => {
    window.removeEventListener('pointerdown', pointer, true);
    window.removeEventListener('keydown', keyboard, true);
  };
}
