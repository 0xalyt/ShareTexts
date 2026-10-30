import type { Key, ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Send,
  QrCode,
  ScanLine,
  Archive,
  Radar,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';

/* ---------------------------------------------------------------------------
 * LandingSections — the scroll tail of the marketing landing.
 *
 * Phase 5 order: Hero → live demo → How it works (01/02/03) → Features (6
 * cards) → FAQ → final CTA → footer. The demo IS the illustration, so these
 * sections carry no decorative artwork — numbers, one Lucide glyph per card,
 * and the real FAQ the Docs page already publishes (same verified claims).
 *
 * Copy rules (implementation brief): ≤12-word sentences, verbs, no marketing
 * slop words, no "!", every claim backed by docs/claims.md. Strings live in
 * messages/en.ts (i18n), never inline.
 * ------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const;

/** Reveal-on-scroll: quiet, once. Reduced motion resolves to the same final
 *  state with no travel (motion/react honors prefers-reduced-motion via
 *  MotionConfig at the app root; `once` keeps replay out of the story). */
function Reveal({ children, className }: {
  children: ReactNode;
  className?: string;
  /** Declared so keyed map usage typechecks; React strips it before props. */
  key?: Key;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.5, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function SectionHead({ eyebrow, heading, id }: { eyebrow: string; heading: string; id?: string }) {
  return (
    <div className="mb-7 max-w-[560px]">
      <span className="st-eyebrow">{eyebrow}</span>
      <h2 id={id} className="st-h2 mt-2 text-apple-ink dark:text-white">
        {heading}
      </h2>
    </div>
  );
}

/* ── How it works — three steps, 01/02/03 ─────────────────────────────────── */

export function HowItWorks() {
  const { t } = useI18n();
  const steps = [t('home.how.1'), t('home.how.2'), t('home.how.3')];
  return (
    <section aria-labelledby="how-title" className="w-full pt-12 pb-10">
      <div className="mb-7 max-w-[560px]">
        <span className="st-eyebrow">{t('home.how.eyebrow')}</span>
        <h2 id="how-title" className="st-h2 mt-2 text-apple-ink dark:text-white">
          {t('home.how.heading')}
        </h2>
      </div>
      {/* Three rules, three steps. No boxes: a card with a number in it is
          the most generic shape a landing page can draw. A hairline over
          each step (Apple's own editorial rhythm) gives the sequence a
          spine while leaving the words alone on the page. */}
      <ol className="grid gap-x-8 gap-y-7 sm:grid-cols-3">
        {steps.map((step, i) => (
          <Reveal key={i}>
            <li className="border-t border-black/[0.10] pt-4 dark:border-white/[0.14]">
              <span className="block font-mono text-[12px] font-semibold tabular-nums tracking-[0.09em] text-ember dark:text-azure-400">
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="mt-2 text-[16px] font-medium leading-snug text-apple-ink dark:text-white">
                {step}
              </p>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}

/* ── Features — six cards, one Lucide glyph each ──────────────────────────── */

const FEATURES = [
  { key: 'send', Icon: Send },
  { key: 'code', Icon: QrCode },
  { key: 'qr', Icon: ScanLine },
  { key: 'space', Icon: Archive },
  { key: 'nearby', Icon: Radar },
  { key: 'private', Icon: Lock },
] as const;

export function FeatureGrid() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="features-title" className="w-full py-10">
      <SectionHead id="features-title" eyebrow={t('home.features.eyebrow')} heading={t('home.features.heading')} />
      {/* The same hairline grid as the steps, with the glyph sitting bare
          above the title. The old version put every icon in a tinted circle
          inside a bordered card — three competing containers for one small
          idea, which is exactly what makes a page read as a template. */}
      <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(({ key, Icon }) => (
          <Reveal key={key}>
            <li className="border-t border-black/[0.10] pt-4 dark:border-white/[0.14]">
              <Icon className="h-[18px] w-[18px] text-ember dark:text-azure-400" strokeWidth={1.5} aria-hidden />
              <h3 className="st-title mt-2.5 text-apple-ink dark:text-white">
                {t(`home.features.${key}.title`)}
              </h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-apple-ink-muted dark:text-white/60">
                {t(`home.features.${key}.body`)}
              </p>
            </li>
          </Reveal>
        ))}
      </ul>
    </section>
  );
}

/* ── FAQ — the five questions that block a first transfer ─────────────────── */

export function LandingFaq() {
  const { t } = useI18n();
  const items: QA[] = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
    { q: t('home.faq.q5'), a: t('home.faq.a5') },
  ];
  return (
    <section aria-labelledby="faq-title" className="w-full py-10">
      <SectionHead eyebrow={t('home.faq.eyebrow')} heading={t('home.faq.heading')} />
      <FaqSection items={items} defaultOpen={null} hideLabel className="max-w-[720px]" />
      <a
        href="/docs"
        className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ember hover:underline dark:text-azure-400"
      >
        {t('home.faq.more')}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </a>
    </section>
  );
}

/* ── Final CTA — bring the visitor back to the two actions ────────────────── */

export function LandingCta({
  onSend,
  onReceive,
  sendLabel,
  receiveLabel,
}: {
  onSend: () => void;
  onReceive: () => void;
  sendLabel: string;
  receiveLabel: string;
}) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="cta-title" className="w-full py-12">
      {/* A tone shift instead of a bordered card: the CTA is the last calm
          moment on the page, so it gets room, not a frame. */}
      <Reveal className="rounded-[24px] bg-apple-parchment/70 dark:bg-white/[0.04] px-6 py-10 text-center sm:py-12">
        <h2 id="cta-title" className="st-h2 text-apple-ink dark:text-white">
          {t('home.cta.heading')}
        </h2>
        <p className="mx-auto mt-2.5 max-w-[42ch] text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/60">
          {t('home.cta.sub')}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onSend}
            data-testid="cta-send"
            className={cn(
              'inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[16px] font-semibold text-white active:scale-[0.98] transition-motion',
              'bg-apple-ink hover:bg-apple-ink/90 dark:bg-white dark:text-night-900 dark:hover:bg-white/90',
            )}
          >
            {sendLabel}
          </button>
          <button
            type="button"
            onClick={onReceive}
            data-testid="cta-receive"
            className={cn(
              'inline-flex min-h-[48px] items-center gap-2 rounded-full px-6 text-[16px] font-semibold border active:scale-[0.98] transition-motion',
              'border-apple-divider bg-white text-apple-ink hover:border-apple-ink/25',
              'dark:border-white/[0.14] dark:bg-white/[0.05] dark:text-white dark:hover:border-white/30',
            )}
          >
            {receiveLabel}
          </button>
        </div>
      </Reveal>
    </section>
  );
}
