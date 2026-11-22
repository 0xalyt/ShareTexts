import { SceneConnected, SceneOffline, SceneWaiting } from './art/Scenes';

export type LinkState = 'linked' | 'broken' | 'searching' | 'error';

/** Keep the device silhouettes fixed between states. The neighboring words,
 * not an endless pulse, explain the connection, including reduced motion. */
export function DeviceLinkIllustration({ state = 'linked', width = 208, className }: {
  state?: LinkState; width?: number; className?: string;
}) {
  const Scene = state === 'linked' ? SceneConnected : state === 'searching' ? SceneWaiting : SceneOffline;
  return <Scene size={width} className={`select-none pointer-events-none text-apple-ink-muted dark:text-white ${className ?? ''}`} />;
}
