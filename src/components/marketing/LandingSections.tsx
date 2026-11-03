import type { Key, ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  Radar,
  QrCode,
  Globe,
  Download,
  Moon,
  Languages,
  Wallet,
  Github,
  ArrowRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';
import { ProductLoop } from '../landing/ProductLoop';
import { LOOPS } from '../../lib/loops.generated';

/* ---------------------------------------------------------------------------
 * LandingSections — the scroll tail of the front door.
 *
 * Phase 5 order (DESIGN.md §20a): hero → Three things → The small things →
 * FAQ → final call → footer. Each section is at most one phone viewport high,
 * and each story is one bold lead word, ONE plain sentence, and a recording of
 * the real product doing it — no invented screens, no mock notifications.
 *
 * Copy rules: short sentences, verbs, no marketing slop, no "!", every claim
 * backed by docs/redesign/claims.md. Strings live in messages/en.ts.
 * ------------------------------------------------------------------------- */

const EASE = [0.22, 1, 0.36, 1] as const;

/** Motion on the list item itself: <ul> children must be <li> for screen
 *  readers to announce a list, so a wrapper div is not an option here. */
const revealItem = {
  initial: { opacity: 0, y: 14 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-10% 0px' },
  transition: { duration: 0.5, ease: EASE },
} as const;

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

/* ── Three things — lead word, one sentence, one real recording ───────────── */

const STORIES = [
  { key: 'pair', loop: 'pair' },
  { key: 'send', loop: 'send' },
  { key: 'keep', loop: 'keep' },
] as const;

export function ThreeThings() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="how-title" className="w-full pt-14 pb-10">
      <SectionHead
        id="how-title"
        eyebrow={t('home.three.eyebrow')}
        heading={t('home.three.heading')}
      />
      {/* Three rows, not three cards: a hairline above each story holds the
          sequence together without boxing the product recording in. */}
      <ul className="flex flex-col gap-10">
        {STORIES.map(({ key, loop }) => {
          // A story with no recording yet is words on the page, one column:
          // an empty frame would be decoration pretending to be the product.
          const hasLoop = LOOPS[loop] !== null;
          return (
          <motion.li
            key={key}
            {...revealItem}
            className={cn(
              'grid gap-5 border-t border-black/[0.10] pt-5 dark:border-white/[0.14]',
              hasLoop && 'sm:grid-cols-2 sm:items-center sm:gap-8',
            )}
          >
              <div className="min-w-0">
                <h3 className="text-[22px] font-semibold leading-tight text-apple-ink dark:text-white">
                  {t(`home.three.${key}.lead`)}
                </h3>
                <p className="mt-2 max-w-[34ch] text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/60">
                  {t(`home.three.${key}.body`)}
                </p>
              </div>
              <ProductLoop name={loop} label={t(`home.three.${key}.lead`)} />
          </motion.li>
          );
        })}
      </ul>
    </section>
  );
}

/* ── The small things — eight items, icon plus a few words ────────────────── */

const SMALL = [
  { key: 'nearby', Icon: Radar },
  { key: 'pair', Icon: QrCode },
  { key: 'browser', Icon: Globe },
  { key: 'install', Icon: Download },
  { key: 'dark', Icon: Moon },
  { key: 'language', Icon: Languages },
  { key: 'free', Icon: Wallet },
] as const;

export function SmallThings() {
  const { t } = useI18n();
  return (
    <section aria-labelledby="features-title" className="w-full py-10">
      <SectionHead
        id="features-title"
        eyebrow={t('home.small.eyebrow')}
        heading={t('home.small.heading')}
      />
      <ul className="grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-4">
        {SMALL.map(({ key, Icon }) => (
          <motion.li key={key} {...revealItem} className="flex items-start gap-2.5 border-t border-black/[0.10] py-4 dark:border-white/[0.14]">
              <Icon
                className="mt-0.5 h-[17px] w-[17px] shrink-0 text-ember dark:text-azure-400"
                strokeWidth={1.5}
                aria-hidden
              />
              <span className="text-[14px] font-medium leading-snug text-apple-ink dark:text-white">
                {t(`home.small.${key}`)}
              </span>
          </motion.li>
        ))}
        {/* The eighth is a link, because the claim has somewhere to go. */}
        <motion.li {...revealItem} className="flex items-start gap-2.5 border-t border-black/[0.10] py-4 dark:border-white/[0.14]">
            <Github
              className="mt-0.5 h-[17px] w-[17px] shrink-0 text-ember dark:text-azure-400"
              strokeWidth={1.5}
              aria-hidden
            />
            <a
              href="https://github.com/0xalyt/ShareTexts"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] font-medium leading-snug text-apple-ink underline decoration-[1px] underline-offset-[5px] hover:text-ember dark:text-white dark:hover:text-azure-400"
            >
              {t('home.small.open')}
            </a>
        </motion.li>
      </ul>
    </section>
  );
}

/* ── FAQ — the eight questions that block a first transfer ────────────────── */

export function LandingFaq() {
  const { t } = useI18n();
  const items: QA[] = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
    { q: t('home.faq.q5'), a: t('home.faq.a5') },
    { q: t('home.faq.q6'), a: t('home.faq.a6') },
    { q: t('home.faq.q7'), a: t('home.faq.a7') },
    { q: t('home.faq.q8'), a: t('home.faq.a8') },
  ];
  return (
    <section aria-labelledby="faq-title" className="w-full py-10">
      <SectionHead eyebrow={t('home.faq.eyebrow')} heading={t('home.faq.heading')} id="faq-title" />
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

/* ── Final call — back to the two real actions ────────────────────────────── */

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
      <Reveal className="rounded-[24px] bg-apple-parchment/70 px-6 py-10 text-center dark:bg-white/[0.04] sm:py-12">
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
        {/* The one trust line the whole page earns. */}
        <p className="mt-5 text-[13px] font-medium text-apple-ink-muted dark:text-white/55">
          {t('footer.trust')}
        </p>
      </Reveal>
    </section>
  );
}
