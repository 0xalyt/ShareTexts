import { useContext, useSyncExternalStore } from 'react';
import { MotionConfigContext } from 'motion/react';

const query = '(prefers-reduced-motion: reduce)';
const snapshot = () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(query).matches;
const serverSnapshot = () => true;
const subscribe = (notify: () => void) => {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

/** Motion 12's useReducedMotion snapshots the OS preference on mount. Data
 * and gesture primitives need a live subscription, including a settings
 * change while a room stays open. Honor explicit MotionConfig overrides too. */
export function useMotionPreference(): boolean {
  const preference = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const { reducedMotion } = useContext(MotionConfigContext);
  if (reducedMotion === 'always') return true;
  if (reducedMotion === 'never') return false;
  return preference;
}
