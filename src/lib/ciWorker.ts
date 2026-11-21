const enabled = import.meta.env.VITE_CI_LOCAL_WORKER === '1';
const configured = (import.meta.env.VITE_SIGNALING_URL as string | undefined)?.trim().replace(/\/+$/, '');

if (enabled && (!configured || !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(configured))) {
  throw new Error('VITE_CI_LOCAL_WORKER requires a local HTTP VITE_SIGNALING_URL with an explicit port');
}

export const ciWorker = enabled ? configured : undefined;
