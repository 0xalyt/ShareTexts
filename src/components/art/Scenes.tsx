/* The eight scenes (DESIGN.md §20c).
 *
 * One frame, one idea: Beacon plus the few shapes that name the situation. The
 * palette is four CSS variables plus the brand accent, the outline is one
 * 2.5px currentColor stroke, and nothing is filled with a gradient or given a
 * shadow — flat drawings that still look like the same drawing in dark mode.
 *
 * Rules kept here:
 *   • at most one scene per screen (callers decide; the kit shows them all);
 *   • the scene sits beside a clear action, never instead of one;
 *   • aria-hidden: the sentence next to it is what a reader hears;
 *   • reduced motion turns the one loop (Waiting's pulse) off — it is a CSS
 *     animation on a class the stylesheet disables, not a JS timer.
 *   • each component is small enough to stay well under the 4 KB ceiling.
 */
import type { ReactNode } from 'react';
import { Beacon, type BeaconMood } from './Beacon';

interface SceneProps {
  /** Rendered size in CSS pixels; the SVG scales, the outline does not vanish. */
  size?: number;
  className?: string;
}

function Frame({ size = 132, className, children }: SceneProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 200 160"
      width={size}
      height={(size * 160) / 200}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {children}
    </svg>
  );
}

/** Two devices, one arc between them: the pair is being waited on. */
export function SceneWaiting({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <rect x="26" y="52" width="34" height="58" rx="8" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <rect x="140" y="52" width="34" height="58" rx="8" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <g className="st-art-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M 70 81 Q 100 66 130 81" className="st-wait-dash" strokeDasharray="5 6" />
      </g>
      <g transform="translate(100 100)">
        <Beacon mood="hopeful" size={50} />
      </g>
    </Frame>
  );
}

/** Beacon inside the room, both devices lit. */
export function SceneConnected({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <rect x="22" y="48" width="32" height="62" rx="8" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <rect x="146" y="48" width="32" height="62" rx="8" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="st-art-accent" fill="none">
        <path d="M 54 79 H 76" />
        <path d="M 124 79 H 146" />
      </g>
      <g transform="translate(100 96)">
        <Beacon mood="pleased" size={50} />
      </g>
    </Frame>
  );
}

/** An open shelf with nothing on it yet. */
export function SceneEmptyRoom({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <rect x="34" y="40" width="132" height="80" rx="10" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <path d="M 34 82 H 166" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <g transform="translate(100 92)">
        <Beacon mood="calm" size={46} />
      </g>
    </Frame>
  );
}

/** A plug pulled out: no connection, no blame. */
export function SceneOffline({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <g transform="translate(100 96)">
        <Beacon mood="sad" size={56} />
      </g>
      <g stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="st-art-accent">
        <path d="M 64 46 L 136 46" />
        <path d="M 76 38 L 76 54" />
        <path d="M 124 38 L 124 54" />
      </g>
    </Frame>
  );
}

/** A code that ran out of time: digits on a card, a clock hand past the mark. */
export function SceneCodeExpired({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <rect x="30" y="30" width="140" height="58" rx="10" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <g className="st-art-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M 58 60 H 78" />
        <path d="M 88 60 H 112" />
        <path d="M 122 60 H 142" />
      </g>
      <g transform="translate(100 120)">
        <Beacon mood="sad" size={40} />
      </g>
    </Frame>
  );
}

/** A closed door with Beacon waving goodbye. */
export function SceneRoomEnded({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <rect x="118" y="30" width="56" height="96" rx="6" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="126" cy="80" r="3" className="st-art-accent" fill="currentColor" />
      <g transform="translate(72 88)">
        <Beacon mood="calm" size={50} />
      </g>
      <path d="M 26 126 H 174" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </Frame>
  );
}

/** A page that is not there. */
export function SceneNotFound({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <rect x="40" y="22" width="120" height="74" rx="10" className="st-art-shade" stroke="currentColor" strokeWidth="2.5" />
      <g className="st-art-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M 70 48 H 122" />
        <path d="M 70 66 H 104" />
      </g>
      <g transform="translate(100 122)">
        <Beacon mood="sad" size={44} />
      </g>
    </Frame>
  );
}

/** A bubble arriving: the thing landed. */
export function SceneArrived({ size, className }: SceneProps) {
  return (
    <Frame size={size} className={className}>
      <g transform="translate(74 78)">
        <Beacon mood="pleased" size={48} />
      </g>
      <g className="st-art-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <path d="M 116 56 h 52 a 8 8 0 0 1 8 8 v 26 a 8 8 0 0 1 -8 8 h -30 l -12 10 v -10 h -10 a 8 8 0 0 1 -8 -8 V 64 a 8 8 0 0 1 8 -8 z" />
        <path d="M 132 76 l 6 7 l 12 -14" />
      </g>
    </Frame>
  );
}

export const SCENES = {
  waiting: SceneWaiting,
  connected: SceneConnected,
  emptyRoom: SceneEmptyRoom,
  offline: SceneOffline,
  codeExpired: SceneCodeExpired,
  roomEnded: SceneRoomEnded,
  notFound: SceneNotFound,
  arrived: SceneArrived,
} as const;

export type SceneName = keyof typeof SCENES;
export type { BeaconMood };
