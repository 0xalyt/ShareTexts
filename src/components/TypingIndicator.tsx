/**
 * TypingIndicator — the peer is typing, said quietly.
 *
 * Two forms of the same fact: a row of three dots in the bar's status line, and
 * a ghost bubble at the end of the thread. Both animate transform and opacity
 * only, so neither triggers layout, and the ghost bubble reserves NO height
 * when idle — it mounts on the frame it is needed and leaves on the frame it
 * is not, without moving the message above it.
 *
 * Under `prefers-reduced-motion` the dots stop moving and the word does the
 * work: a small "typing…" is still an answer, a frozen animation is not.
 */
import React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useI18n } from '../lib/i18n';

/** Three dots in a 1.2 s wave, 80 ms apart. */
export function TypingDots({ className = '' }: { className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) {
    return <span className={`text-[12px] font-medium text-apple-ink-muted dark:text-white/50 ${className}`}>···</span>;
  }
  return (
    <span className={`inline-flex items-end gap-[3px] ${className}`} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block h-[5px] w-[5px] rounded-full bg-current"
          animate={{ y: [0, -3, 0], opacity: [0.45, 1, 0.45] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay: i * 0.08 }}
        />
      ))}
    </span>
  );
}

/** The ghost bubble at the end of the thread. No text, no height when absent. */
export function TypingGhostBubble({ align }: { align: 'left' | 'right' }) {
  const { t } = useI18n();
  const reduced = useReducedMotion();
  return (
    <motion.div
      data-testid="typing-bubble"
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: 'easeOut' }}
      className={align === 'right' ? 'flex w-full justify-end pr-1' : 'flex w-full justify-start'}
      aria-hidden
    >
      <div className="st-card flex items-center gap-[3px] rounded-[18px] px-3.5 py-2.5 text-apple-ink-muted dark:text-white/60">
        <TypingDots />
        <span className="sr-only">{t('chat.typing')}</span>
      </div>
    </motion.div>
  );
}
