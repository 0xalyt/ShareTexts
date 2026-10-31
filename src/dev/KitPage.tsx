import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Globe, MoreHorizontal, Sun } from 'lucide-react';
import { LargeTitle } from '../components/ui/LargeTitle';
import { ListRow } from '../components/ui/ListRow';
import { GlassCircleButton } from '../components/ui/GlassCircleButton';
import { GlassCapsule } from '../components/ui/GlassCapsule';
import { Segmented } from '../components/ui/Segmented';
import { TactileButton } from '../components/TactileButton';

/**
 * KitPage — dev-only (/__kit). Every primitive in both themes, in one place,
 * so a change to the grammar can be looked at instead of argued about.
 *
 * Not shipped: main.tsx imports this inside `import.meta.env.DEV`.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-apple-divider py-8 dark:border-white/10">
      <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-apple-ink-muted dark:text-white/40">{title}</h3>
      {children}
    </section>
  );
}

function Kit() {
  const [mode, setMode] = useState<'code' | 'qr' | 'link'>('code');
  const [busy, setBusy] = useState(false);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col px-5 pb-24">
      <div className="pt-10">
        <LargeTitle as="h1" subtitle="Every control, light and dark. Dev only.">Kit</LargeTitle>
      </div>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <TactileButton variant="primary" size="lg" icon={<ArrowRight className="h-4 w-4" />}>Send</TactileButton>
          <TactileButton variant="secondary" size="lg" icon={<ArrowLeft className="h-4 w-4" />}>Receive</TactileButton>
          <TactileButton variant="ghost" size="md">Tertiary</TactileButton>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <TactileButton variant="primary" size="md" onClick={() => { setBusy(true); setTimeout(() => setBusy(false), 1800); }} loading={busy}>{busy ? 'Sending' : 'Send'}</TactileButton>
          <TactileButton variant="primary" size="md" success>Sending</TactileButton>
          <TactileButton variant="primary" size="md" disabled>Disabled</TactileButton>
          <TactileButton variant="secondary" size="sm">Small</TactileButton>
        </div>
      </Section>

      <Section title="Glass">
        <div className="flex items-center gap-3">
          <GlassCircleButton label="Back"><ArrowLeft className="h-5 w-5" strokeWidth={1.8} /></GlassCircleButton>
          <GlassCircleButton label="Solid (no blur)" tone="solid"><Check className="h-4 w-4" /></GlassCircleButton>
          <GlassCapsule label="Room actions">
            <button type="button" aria-label="Language" className="press flex h-11 w-11 items-center justify-center rounded-full text-apple-ink dark:text-white"><Globe className="h-[18px] w-[18px]" strokeWidth={1.8} /></button>
            <button type="button" aria-label="More" className="press flex h-11 w-11 items-center justify-center rounded-full text-apple-ink dark:text-white"><MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={1.8} /></button>
          </GlassCapsule>
          <GlassCircleButton label="Theme"><Sun className="h-[18px] w-[18px]" strokeWidth={1.8} /></GlassCircleButton>
        </div>
      </Section>

      <Section title="Segmented">
        <Segmented
          label="Connection method"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'code', label: 'Code' },
            { value: 'qr', label: 'QR' },
            { value: 'link', label: 'Link' },
          ]}
        />
        <p className="text-[13px] text-apple-ink-muted dark:text-white/45">Selected: {mode}</p>
      </Section>

      <Section title="List rows">
        <div className="flex flex-col">
          <ListRow title="Nearby" subtitle="Looking for devices…" leading={<span className="h-1.5 w-1.5 rounded-full bg-status-success" />} trailing="2" onClick={() => {}} />
          <ListRow title="Temporary Space" subtitle="Files and text for up to 7 days" onClick={() => {}} />
          <ListRow title="Theme" subtitle="Follow system" trailing="System" onClick={() => {}} />
          <ListRow title="Disabled row" disabled />
        </div>
      </Section>
    </div>
  );
}

export function KitPage() {
  return (
    <div className="min-h-dvh bg-apple-canvas text-apple-ink dark:bg-bg dark:text-white">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col divide-x-0 sm:grid sm:grid-cols-2 sm:divide-x sm:divide-apple-divider dark:sm:divide-white/10">
        <div className="bg-apple-canvas px-6"><Kit /></div>
        <div className="dark bg-bg px-6 text-white"><Kit /></div>
      </div>
    </div>
  );
}

export default KitPage;
