import { AlloSymbol } from '../AlloSymbol';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';
import { WebsiteHandoff } from '../landing/BrowserCompatibility';
export { BrowserCompatibility } from '../landing/BrowserCompatibility';

/* ---------------------------------------------------------------------------
 * LandingSections — the scroll tail of the front door.
 *
 * Hero → handoff guide → the separate Temporary Spaces story → FAQ → footer.
 * The guide's examples are explicitly labelled illustrations, never live
 * rooms or pretend controls. Both instructions stay readable at every step.
 *
 * Copy rules: short sentences, verbs, no marketing slop, no "!", every claim
 * backed by docs/redesign/claims.md. Strings live in messages/en.ts.
 * ------------------------------------------------------------------------- */

/* No eyebrow. A section's heading is its own label; "What it does" over
 * "Three things it does." said the same thing twice in two sizes, and it is
 * the kind of second label that makes a page feel annotated rather than
 * designed. The heading alone carries the rank. */
function SectionHead({ heading, id }: { heading: string; id?: string }) {
  return (
    <div className="landing-section-head mb-8 max-w-[560px]">
      <h2 id={id} className="st-h2 text-apple-ink dark:text-white">
        {heading}
      </h2>
    </div>
  );
}

/* ── Handoff guide — one idea at a time, with no automatic progression ───── */

const STEPS = ['open', 'pair', 'arrive'] as const;

export function ThreeThings() {
  const { t, lang } = useI18n();
  return (
    <section aria-labelledby="how-title" className="landing-story w-full py-16">
      <SectionHead id="how-title" heading={t('home.three.heading')} />
      <WebsiteHandoff />
      <ol className="landing-proof" aria-label={t('home.how.eyebrow')}>
        {STEPS.map((step, i) => (
          <li key={step} data-testid={`landing-proof-${step}`}>
            <div className="landing-proof-screen" aria-hidden="true" lang="en">
              <img className="landing-proof-light" src={`/media/landing/${step}-light.webp`} width="390" height="480" loading="lazy" decoding="async" alt="" />
              <img className="landing-proof-dark" src={`/media/landing/${step}-dark.webp`} width="390" height="480" loading="lazy" decoding="async" alt="" />
            </div>
            <h3><bdi>{new Intl.NumberFormat(lang).format(i + 1)}.</bdi> {t(`home.proof.${step}.title`)}</h3>
            <p>{t(`home.proof.${step}.body`)}</p>
          </li>
        ))}
      </ol>
      <p className="landing-privacy-line">{t('home.privacyLine')} <a href="/privacy">{t('nav.privacy')}</a></p>
    </section>
  );
}

/* ── FAQ — the seven questions that actually block a first transfer ────────
 *
 * The list is ordered the way a first-time visitor asks, not the way the
 * docs are organised: what is this → how do I use it → what does it cost →
 * will it work on MY device → where can I do this → is it safe → what can I
 * send. Everything that only matters once someone is already in a room (code
 * lifetime, relay internals, Temporary Spaces) lives in the docs, one click
 * away, instead of competing here.
 * ------------------------------------------------------------------------- */

export function LandingFaq() {
  const { t } = useI18n();
  // Include storage before the first transfer, not only in the docs.
  const items: QA[] = [
    { q: t('home.faq.q7'), a: t('home.faq.a7') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
    { q: t('home.faq.q6'), a: t('home.faq.a6') },
  ];
  return (
    <section aria-labelledby="faq-title" className="landing-faq w-full py-16">
      <h2 id="faq-title" className="st-h2">{t('home.faq.heading')}</h2>
      <div>
        <FaqSection items={items} hideLabel defaultOpen={0} className="landing-faq-list" />
        <a href="/docs" className="landing-text-action">
          {t('home.faq.more')}<AlloSymbol name="right" />
        </a>
      </div>
    </section>
  );
}
