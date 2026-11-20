import { ArrowRight } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { FaqSection, type QA } from './FaqSection';
import { StoryArt } from '../landing/StoryArt';

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

/* No eyebrow. A section's heading is its own label; "What it does" over
 * "Three things it does." said the same thing twice in two sizes, and it is
 * the kind of second label that makes a page feel annotated rather than
 * designed. The heading alone carries the rank. */
function SectionHead({ heading, id }: { heading: string; id?: string }) {
  return (
    <div className="mb-8 max-w-[560px]">
      <h2 id={id} className="st-h2 text-apple-ink dark:text-white">
        {heading}
      </h2>
    </div>
  );
}

/* ── Three things — lead word, one sentence, one real recording ───────────── */

const STORIES = ['pair', 'send'] as const;

export function ThreeThings({ onOpenSpace }: { onOpenSpace: () => void }) {
  const { t } = useI18n();
  return (
    <section aria-labelledby="how-title" className="landing-story w-full py-16">
      <SectionHead id="how-title" heading={t('home.three.heading')} />
      <ol className="landing-story-live">
        {STORIES.map((key, i) => (
          <li key={key}>
            <div className="landing-story-art st-art-panel" aria-hidden="true">
              <StoryArt story={key} label={t(`home.three.${key}.lead`)} />
            </div>
            <div className="landing-story-copy">
              <span className="landing-story-index" aria-hidden="true">0{i + 1}</span>
              <div>
                <h3>{t(`home.three.${key}.lead`)}</h3>
                <p>{t(`home.three.${key}.body`)}</p>
              </div>
            </div>
          </li>
        ))}
      </ol>
      {/* A server-backed shelf is an alternative to a live room, not step
          three of a transfer. Give it its own space and a real way in. */}
      <div className="landing-story-later">
        <div className="landing-story-later-copy">
          <h3>{t('space.entryTitle')}</h3>
          <p>{t('home.three.keep.body')}</p>
          <button type="button" onClick={onOpenSpace} className="landing-text-action">
            {t('space.createHeading')}<ArrowRight aria-hidden="true" />
          </button>
        </div>
        <div className="landing-story-later-art" aria-hidden="true">
          <StoryArt story="keep" label={t('home.three.keep.lead')} />
        </div>
      </div>
    </section>
  );
}

/** Names, not approximate logo drawings or an endorsement strip. All are
 * visible at once; the visitor never waits for their browser to scroll by. */
export function BrowserCompatibility() {
  const { t } = useI18n();
  return (
    <section className="landing-browsers w-full" aria-labelledby="browsers-title">
      <h2 id="browsers-title" className="st-h2">{t('home.browsers')}</h2>
      <ul aria-labelledby="browsers-title">
        {['Chrome', 'Safari', 'Firefox', 'Edge', 'Samsung Internet'].map(name => <li key={name}>{name}</li>)}
      </ul>
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
  /* Four, not seven. The last three answered questions nobody has before a
   * first transfer (code lifetime, relay internals, Temporary Spaces) and are
   * one click away in the docs. A landing FAQ is the objections that stop the
   * tap, nothing else. */
  const items: QA[] = [
    { q: t('home.faq.q1'), a: t('home.faq.a1') },
    { q: t('home.faq.q2'), a: t('home.faq.a2') },
    { q: t('home.faq.q3'), a: t('home.faq.a3') },
    { q: t('home.faq.q4'), a: t('home.faq.a4') },
  ];
  return (
    <section aria-labelledby="faq-title" className="landing-faq w-full py-16">
      <h2 id="faq-title" className="st-h2">{t('home.faq.heading')}</h2>
      <div>
        <FaqSection items={items} pinFirst hideLabel defaultOpen={0} />
        <a href="/docs" className="landing-text-action">
          {t('home.faq.more')}<ArrowRight aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
