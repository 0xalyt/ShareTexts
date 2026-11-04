// In-app browsers (WhatsApp, Instagram, Facebook, LinkedIn, Telegram, X).
//
// They are real browsers wearing an app's chrome, and that chrome breaks the
// things this product needs: WebRTC is often restricted, the clipboard needs a
// second gesture, and "Share" belongs to the host app. The honest response is
// one line telling the reader how to get out — never a wall, and never a claim
// that the app is broken, because most of it still works.
//
// Detection is deliberately two-sided:
//   • user-agent tokens the hosts put there on purpose, and
//   • missing features (no RTCPeerConnection), which is the thing that
//     actually matters for a transfer.
// "Everything works" wins: if WebRTC and the clipboard are available, the
// notice stays away even inside an in-app browser.

const TOKENS: { name: string; re: RegExp }[] = [
  { name: 'WhatsApp', re: /\bWhatsApp\/|WhatsApp/i },
  { name: 'Instagram', re: /Instagram/i },
  { name: 'Facebook', re: /\bFBAN\/|FBAV\/|FB_IAB|FB4A/i },
  { name: 'Messenger', re: /\bMessenger/i },
  { name: 'LinkedIn', re: /\bLinkedInApp|LinkedIn/i },
  { name: 'Telegram', re: /\bTelegram/i },
  { name: 'X', re: /\bTwitter/i },
  { name: 'Line', re: /\bLine\/|LineApp/i },
];

export interface InAppInfo {
  /** True when the page is inside a host app's browser. */
  inApp: boolean;
  /** Which host, when the user agent names one. */
  host: string | null;
  /** iOS cannot be redirected out of the host browser; Android can. */
  ios: boolean;
  android: boolean;
  /** Chrome intent URL that leaves the host app (Android only). */
  intentUrl: string | null;
  /** The host browser will not support a transfer well enough to stay quiet. */
  limited: boolean;
}

export function detectInApp(ua?: string, href?: string): InAppInfo {
  if (typeof navigator === 'undefined' && !ua) {
    return { inApp: false, host: null, ios: false, android: false, intentUrl: null, limited: false };
  }
  const agent = ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');
  const url = href ?? (typeof location !== 'undefined' ? location.href : 'https://sharetexts.online/');
  const host = TOKENS.find((t) => t.re.test(agent))?.name ?? null;
  const ios = /iPhone|iPad|iPod/i.test(agent);
  const android = /Android/i.test(agent);

  // Missing WebRTC is the failure that matters: without it, nothing pairs.
  const noRtc = typeof window !== 'undefined' && !('RTCPeerConnection' in window) && !('webkitRTCPeerConnection' in window);
  const limited = noRtc;

  // Android: an intent:// URL hands the page to Chrome. `S.browser_fallback_url`
  // covers the phone that has no Chrome.
  const bare = url.replace(/^https?:\/\//, '');
  const intentUrl = android ? `intent://${bare}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end` : null;

  return { inApp: host !== null, host, ios, android, intentUrl, limited };
}
