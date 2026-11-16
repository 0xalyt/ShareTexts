import React from 'react';
import { StatePanel, StateSkeletonRow } from '../components/ui/StatePanel';

/**
 * StatesPage — dev-only (/__kit/states). The empty / loading / error family of
 * the saved-items sheet, side by side at the sheet's own width, so the three
 * can be looked at as one thing instead of argued about in three files.
 *
 * Copy here is the English source; the shipped strings live in messages/en.ts
 * and the other ten dictionaries.
 */
function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-apple-ink-muted dark:text-white/40">
        {label}
      </span>
      <div className="st-card overflow-hidden rounded-[20px] border border-black/[0.07] bg-apple-canvas dark:border-white/10 dark:bg-apple-tile-1">
        <div className="border-b border-apple-divider/70 px-6 py-3 dark:border-white/[0.07]">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-apple-ink dark:text-white">Saved items</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatesPage() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 pb-24 pt-10">
      <h1 className="text-[28px] font-bold tracking-[-0.02em] text-apple-ink dark:text-white">
        Saved items — one family
      </h1>
      <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-apple-ink-muted dark:text-white/55">
        Empty is a door, loading says what it is reading, error names the problem and the fix.
        Same tile, same two sentences, same action slot, same 300px floor — so the data landing
        fills the frame instead of moving it.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Frame label="Empty">
          <StatePanel
            kind="empty"
            testId="demo-empty"
            title="Nothing saved yet."
            body="Save a text, link, photo or file while sharing. It stays on this device."
            action={{ label: 'Start sharing', onClick: () => {} }}
          />
        </Frame>

        <Frame label="Loading">
          <StatePanel
            kind="loading"
            testId="demo-loading"
            title="Loading your saved items."
            body="Reading them from this browser. They never leave the device."
          >
            <div className="mt-5 flex w-full flex-col gap-2.5">
              <StateSkeletonRow index={0} />
            </div>
          </StatePanel>
        </Frame>

        <Frame label="Error — storage full">
          <StatePanel
            kind="error"
            testId="demo-error"
            title="This browser is out of space."
            body="This device is out of storage space. Remove some saved items and try again."
            action={{ label: 'Try again', onClick: () => {} }}
          />
        </Frame>
      </div>

      <p className="mt-8 text-[12px] leading-relaxed text-apple-ink-muted dark:text-white/40">
        Dev only (/__kit/states). Not shipped in a production build.
      </p>
    </div>
  );
}

export default StatesPage;
