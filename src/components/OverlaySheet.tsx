import React from 'react';
import { Sheet } from './ui/Sheet';

/**
 * OverlaySheet — the app's form/flow overlay. A thin, named wrapper over
 * `ui/Sheet` so every caller keeps the API it already had while the actual
 * physics (drag-to-dismiss, pull-up-to-grow, haptics, scroll lock, focus
 * trap, Escape, backdrop) live in exactly one place.
 */
export function OverlaySheet({
  open,
  onClose,
  label,
  maxWidth = 440,
  labelledBy,
  children,
  testId,
  keepMounted = false,
}: {
  open: boolean;
  onClose(): void;
  /** Accessible name of the dialog. */
  label: string;
  /** Desktop max width in px (mobile is always full-bleed bottom sheet). */
  maxWidth?: number;
  /** Point at a visible heading instead of naming the dialog invisibly. */
  labelledBy?: string;
  children: React.ReactNode;
  testId?: string;
  /**
   * Keep the children mounted while the sheet is closed, inside an inert
   * hidden host. For content that IS the work — nearby discovery keeps
   * scanning, so its popup can still arrive while the list is shut — the
   * sheet must not unmount it. Everything inside stays unreachable by
   * keyboard and assistive tech (hidden + aria-hidden) while closed.
   */
  keepMounted?: boolean;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label={labelledBy ? undefined : label}
      labelledBy={labelledBy}
      maxWidth={maxWidth}
      testId={testId}
      keepMounted={keepMounted}
    >
      {children}
    </Sheet>
  );
}
