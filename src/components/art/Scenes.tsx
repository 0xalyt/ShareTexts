import type { ReactNode } from 'react';
import type { BeaconMood } from './Beacon';

interface SceneProps { size?: number; className?: string }

/** One neutral outline, one accent, and a distinct silhouette for each state.
 * Copy carries the meaning. These drawings stay decorative and still, even
 * at the room's 88px size; no tiny fake text or animation to decipher. */
function Frame({ size = 132, className, children }: SceneProps & { children: ReactNode }) {
  return <svg viewBox="0 0 200 144" width={size} height={size * .72}
    className={className} style={{ maxWidth: '100%', height: 'auto' }} fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {children}
  </svg>;
}

function Phone({ muted = false }: { muted?: boolean }) {
  return <g opacity={muted ? .4 : 1}>
    <rect x="142" y="33" width="34" height="70" rx="8" className="st-art-body" />
    <path d="M154 40h10m-9 56h8" opacity=".4" />
  </g>;
}

function Laptop() {
  return <g>
    <rect x="20" y="42" width="72" height="48" rx="6" className="st-art-body" />
    <path d="M14 97h84l-5 6H20z" className="st-art-shade" />
    <path d="M28 50h56" opacity=".2" />
  </g>;
}

function Note({ x = 75, y = 30 }: { x?: number; y?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <path d="M0 6a6 6 0 0 1 6-6h30l14 14v58a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6z" className="st-art-body" />
    <path d="M36 0v10a4 4 0 0 0 4 4h10M12 34h26M12 45h26M12 56h15" opacity=".4" />
  </g>;
}

function Clock({ x = 139, y = 91 }: { x?: number; y?: number }) {
  return <g transform={`translate(${x} ${y})`}>
    <circle r="21" className="st-art-body" />
    <path d="M0-11V1l8 5" className="st-art-accent" />
    <path d="M0-17v1M17 0h-1M0 17v-1M-17 0h1" opacity=".3" />
  </g>;
}

export function SceneWaiting(props: SceneProps) {
  return <Frame {...props}><Laptop /><Phone />
    <path d="M101 68h30" strokeDasharray="2 6" opacity=".5" />
    <circle cx="115" cy="68" r="3" className="st-art-accent" fill="currentColor" stroke="none" />
  </Frame>;
}

export function SceneConnected(props: SceneProps) {
  return <Frame {...props}><Laptop /><Phone />
    <path d="M101 68h30m20-2 6 6 10-12" className="st-art-accent" />
    <path d="M33 64h32M33 73h20" opacity=".35" />
  </Frame>;
}

export function SceneEmptyRoom(props: SceneProps) {
  return <Frame {...props}>
    <rect x="35" y="25" width="130" height="91" rx="12" className="st-art-shade" />
    <path d="M35 44h130" opacity=".25" />
    <path d="M47 35h1m6 0h1m6 0h1" opacity=".4" />
    <path d="M55 65h48a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6H69l-9 7v-7h-5a6 6 0 0 1-6-6V71a6 6 0 0 1 6-6Z" className="st-art-body" />
    <path d="M61 76h30M61 83h18" opacity=".35" />
    <path d="M127 71v22m-11-11h22" className="st-art-accent" />
  </Frame>;
}

export function SceneOffline(props: SceneProps) {
  return <Frame {...props}><Laptop /><Phone muted />
    <path d="M101 68h8m14 0h8" strokeDasharray="2 4" opacity=".5" />
    <path d="m119 57-7 22" className="st-art-accent" />
  </Frame>;
}

export function SceneCodeExpired(props: SceneProps) {
  return <Frame {...props}>
    <rect x="30" y="35" width="129" height="62" rx="10" className="st-art-shade" />
    {[0, 1, 2, 3, 4, 5].map(i => <path key={i} d={`M${46 + i * 18} 62v10`} opacity=".4" strokeWidth="4" />)}
    <Clock />
  </Frame>;
}

export function SceneRoomEnded(props: SceneProps) {
  return <Frame {...props}>
    <rect x="67" y="22" width="66" height="99" rx="6" className="st-art-shade" />
    <path d="M77 32h46v79H77z" className="st-art-body" />
    <circle cx="113" cy="73" r="2.5" className="st-art-accent" fill="currentColor" stroke="none" />
    <path d="M43 121h114" opacity=".35" />
  </Frame>;
}

export function SceneNotFound(props: SceneProps) {
  return <Frame {...props}><Note x={61} y={25} />
    <circle cx="126" cy="88" r="19" className="st-art-body" />
    <path d="m140 102 15 15M119 88h14" className="st-art-accent" />
  </Frame>;
}

export function SceneArrived(props: SceneProps) {
  return <Frame {...props}><Note />
    <circle cx="130" cy="95" r="18" className="st-art-body" />
    <path d="m122 95 6 6 11-12" className="st-art-accent" />
  </Frame>;
}

export function SceneSaved(props: SceneProps) {
  return <Frame {...props}>
    <path d="M51 36h83a7 7 0 0 1 7 7v72H51z" className="st-art-shade" />
    <Note x={62} y={23} />
    <path d="M91 24v27l9-6 9 6V24" className="st-art-accent" fill="var(--st-art-body)" />
    <path d="M43 115h106" opacity=".35" />
  </Frame>;
}

export function SceneSpace(props: SceneProps) {
  return <Frame {...props}>
    <Note x={49} y={24} />
    <path d="M32 87h113l-7 31H39z" className="st-art-shade" />
    <path d="M70 98h32" opacity=".4" />
    <Clock x={147} y={60} />
  </Frame>;
}

export const SCENES = { waiting: SceneWaiting, connected: SceneConnected,
  emptyRoom: SceneEmptyRoom, offline: SceneOffline, codeExpired: SceneCodeExpired,
  roomEnded: SceneRoomEnded, notFound: SceneNotFound, arrived: SceneArrived,
  saved: SceneSaved, space: SceneSpace } as const;
export type SceneName = keyof typeof SCENES;
export type { BeaconMood };
