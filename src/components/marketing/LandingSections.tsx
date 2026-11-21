import { useId, useState } from 'react';
import { AlloSymbol } from '../AlloSymbol';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';
import { PairingDetail, TransferDetail, SpaceDetail } from '../landing/ProductDetails';
export { BrowserCompatibility, WebsiteHandoff } from '../landing/BrowserCompatibility';

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

const STORIES = ['pair', 'send'] as const;

export function ThreeThings({ onOpenSpace }: { onOpenSpace: () => void }) {
  const { t, lang } = useI18n();
  const guideId = useId();
  const [step, setStep] = useState<{ key: typeof STORIES[number]; animate: boolean }>({ key: 'pair', animate: false });
  const number = (value: number) => new Intl.NumberFormat(lang, { minimumIntegerDigits: 2 }).format(value);
  return (
    <section aria-labelledby="how-title" className="landing-story w-full py-16">
      <div className="landing-guide">
        <div>
          <SectionHead id="how-title" heading={t('home.three.heading')} />
          <ol className="landing-guide-steps" aria-label={t('home.how.eyebrow')}>
            {STORIES.map((key, i) => (
              <li key={key}>
                <button
                  type="button"
                  className="landing-guide-step"
                  data-testid={`landing-guide-${key}`}
                  aria-pressed={step.key === key}
                  aria-controls={`${guideId}-example`}
                  aria-labelledby={`${guideId}-label ${guideId}-${key}-title`}
                  aria-describedby={`${guideId}-${key}-body`}
                  onClick={event => {
                    if (key !== step.key) setStep({ key, animate: event.detail > 0 });
                  }}
                >
                  <span className="landing-guide-index" aria-hidden="true">{number(i + 1)}</span>
                  <span>
                    <strong id={`${guideId}-${key}-title`}>{t(`home.three.${key}.lead`)}</strong>
                    <span id={`${guideId}-${key}-body`} className="landing-guide-body">{t(`home.three.${key}.body`)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <figure id={`${guideId}-example`} className="landing-guide-frame">
          {/* Explanation, not ambient motion: only pointer selection fades
              between illustrations. Persistent layers let rapid selections
              retarget from their current values instead of restarting.
              Keyboard selection and reduced motion are instantaneous. */}
          <div className="landing-guide-example" data-animate={step.animate}>
            <div className="landing-guide-layer" data-active={step.key === 'pair'}><PairingDetail /></div>
            <div className="landing-guide-layer" data-active={step.key === 'send'}><TransferDetail /></div>
          </div>
          <figcaption>
            <span id={`${guideId}-label`}>{t('demo.handoff.illustration')}</span>
            <span aria-hidden="true">{number(step.key === 'pair' ? 1 : 2)} / {number(2)}</span>
          </figcaption>
        </figure>
      </div>
      {/* A server-backed shelf is an alternative to a live room, not step
          three of a transfer. Give it its own space and a real way in. */}
      <div className="landing-story-later">
        <div className="landing-story-later-copy">
          <span className="landing-space-label">{t('space.entryTitle')}</span>
          <h3>{t('home.later.heading')}</h3>
          <p>{t('home.three.keep.body')}</p>
          <p className="landing-space-storage">{t('home.space.storage')}</p>
          <button type="button" onClick={onOpenSpace} className="landing-text-action" data-testid="landing-open-space">
            {t('space.createHeading')}<AlloSymbol name="right" />
          </button>
        </div>
        <div className="landing-story-later-art">
          <SpaceDetail />
        </div>
      </div>
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
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
    { q: t('home.faq.q6'), a: t('home.faq.a6') },
  ];
  return (
    <section aria-labelledby="faq-title" className="landing-faq w-full py-16">
      <h2 id="faq-title" className="st-h2">{t('home.faq.heading')}</h2>
      <div>
        <FaqSection items={items} pinFirst hideLabel defaultOpen={0} className="landing-faq-list" />
        <a href="/docs" className="landing-text-action">
          {t('home.faq.more')}<AlloSymbol name="right" />
        </a>
      </div>
    </section>
  );
}
