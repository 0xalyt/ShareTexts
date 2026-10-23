"use client";

// ---------------------------------------------------------------------------
// Emoji — renders one reaction as Apple artwork (default) or as the native
// character (VITE_EMOJI_SET=native), per DESIGN.md §7. One component, so the
// picker, the burst particles and the message chips can never disagree.
//
// Apple mode: <img> inside a role="img" span with an aria-label; width and
// height are ALWAYS set (no layout shift), decoding="async", never draggable.
// On image error it falls back to the native character — a reaction never
// disappears (§7). Native mode: the character only, no request at all.
// ---------------------------------------------------------------------------

import React, { memo, useState } from 'react';
import { EMOJI_SET, emojiChar, emojiSrc, reactionById, reactionByChar } from '../lib/emoji';

export interface EmojiProps {
  /** Reaction id (preferred) or native character key. */
  id?: string;
  char?: string;
  /** Rendered box in px. Always applied to width AND height (no layout shift).
   *  Standard sizes in chrome are 20 | 24 | 32; the reaction picker and its
   *  burst particles keep their own 26/30/42 metrics. */
  size?: number;
  className?: string;
}

export const Emoji = memo(function Emoji({ id, char, size = 20, className }: EmojiProps) {
  const [failed, setFailed] = useState(false);
  const key = id ?? char ?? '';
  const entry = id ? reactionById(id) : reactionByChar(char ?? '');
  const native = emojiChar(key);

  const useApple = EMOJI_SET === 'apple' && !failed && (entry ? emojiSrc(entry.id) !== undefined : false);

  if (!useApple) {
    return (
      <span
        role="img"
        aria-label={entry?.label ?? native}
        className={className}
        style={{ fontSize: Math.round(size * 0.86), lineHeight: 1, width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {native}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={entry!.label}
      className={className}
      style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <img
        src={emojiSrc(entry!.id)}
        width={size}
        height={size}
        alt={native}
        draggable={false}
        decoding="async"
        onError={() => setFailed(true)}
        style={{ width: size, height: size, maxWidth: 'none', display: 'block' }}
      />
    </span>
  );
});
