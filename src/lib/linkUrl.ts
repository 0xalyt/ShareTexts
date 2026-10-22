import { sanitizeUrl } from './utils';

/** Universal composer — LINK detection: a message (or caption) that is
 *  EXACTLY one URL — nothing else — renders as a tappable link card instead
 *  of naked text ("paste URL → LINK"). Text containing a link plus other
 *  words stays a normal text bubble. No global flag: .test() must stay
 *  stateless. www. hosts get an https:// prefix so they open, not 404.
 *
 *  Extracted from MessageCard so Saved Items classifies links with the exact
 *  same policy the chat renders with — one definition, not two that drift. */
const PURE_URL_RE = /^(https?:\/\/\S+|www\.\S+)$/i;

export function pureLinkUrl(text: string): string | null {
  const raw = text.trim();
  if (!PURE_URL_RE.test(raw)) return null;
  const candidate = /^www\./i.test(raw) ? `https://${raw}` : raw;
  return sanitizeUrl(candidate);
}
