/**
 * Motion tokens — one hand, one rhythm.
 *
 * The app's feel comes from consistent timing: taps answer instantly,
 * state changes explain themselves, entrances arrive without noise.
 * New motion code imports from here; existing components keep their
 * tuned springs (they already follow these curves in spirit).
 *
 *   fast   — 120ms, press/selection answers
 *   state  — 180ms, a state visibly changed (toggle, swap, banner)
 *   enter  — 280ms, something arrived (card, section, overlay)
 *
 * All curves are Apple-like ease-outs (fast start, gentle settle);
 * MotionConfig reducedMotion="user" suppresses animated transforms; data
 * still needs a static equivalent (see useMotionPreference).
 */
import type { Transition } from 'motion/react';
import { DUR, EASE } from './motion/tokens';

export const EASE_OUT = EASE.out;

export const DUR_FAST = DUR.micro / 1000;
export const DUR_STATE = DUR.short / 1000;
export const DUR_ENTER = DUR.medium / 1000;

/** Press/selection feedback. */
export const tapTransition: Transition = { duration: DUR_FAST, ease: EASE_OUT };

/** A state change the user caused (banner in/out, toggle, swap). */
export const stateTransition: Transition = { duration: DUR_STATE, ease: EASE_OUT };

/** Something arrived (card, section, overlay). */
export const enterTransition: Transition = { duration: DUR_ENTER, ease: EASE_OUT };
