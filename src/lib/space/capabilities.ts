import { spaceApiBase } from './api';

/**
 * What this deployment can honestly promise a Space.
 *
 * OD-2: file affordances stay hidden until storage is really on. R2 is off on
 * the owner's Cloudflare account (error 10042 on 2026-10-18), so the Worker
 * would answer every upload with 503 while the screen offered a paperclip —
 * a promise in eleven languages that the server could not keep.
 *
 * The flag is a build constant, so the default copy is static: no request, no
 * layout that waits for one, and no flicker from "files" to "no files". The
 * Worker still answers `GET /space/capabilities`; that is the second lock, for
 * the day the flag flips and a deployment without a bucket must not accept an
 * upload.
 */
export const FEATURE_SPACE_FILES = false;

export type SpaceCapabilities = { files: boolean };

export const NO_FILES: SpaceCapabilities = { files: false };

/** Server truth, for when the flag is on. Any failure is "no files": the
 *  honest default is the one that cannot disappoint. */
export async function readSpaceCapabilities(signal?: AbortSignal): Promise<SpaceCapabilities> {
  if (!FEATURE_SPACE_FILES) return NO_FILES;
  const base = spaceApiBase();
  if (!base) return NO_FILES;
  try {
    const res = await fetch(`${base}/space/capabilities`, { method: 'GET', signal });
    if (!res.ok) return NO_FILES;
    const data = (await res.json()) as Partial<SpaceCapabilities>;
    return { files: data.files === true };
  } catch {
    return NO_FILES;
  }
}
