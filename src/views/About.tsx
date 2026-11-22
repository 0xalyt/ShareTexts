import React, { useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { SiteFooter } from '../components/marketing/SiteFooter';
import { ReadingLanguageNote } from '../components/ReadingLanguageNote';
import { useI18n } from '../lib/i18n';
import content from './about-content.html?raw';
import './reading-pages.css';
import './about.css';

export function About() {
  const { t } = useI18n();
  useEffect(() => {
    const previous = document.title;
    document.title = 'About ShareTexts — A small bridge between your devices';
    return () => { document.title = previous; };
  }, []);
  return (
    <div className="reading-page min-h-dvh bg-apple-canvas dark:bg-night-900">
      <a href="#about-content" lang="en" className="reading-skip">Skip to content</a>
      <PageHeader
        links={[
          { href: '/docs', label: t('nav.docs') },
          { href: '/privacy', label: t('nav.privacy') },
          { href: '/terms', label: t('nav.terms') },
        ]}
        currentLabel={t('nav.about')}
      />
      <ReadingLanguageNote />
      {/* Repository-owned copy is shared with the crawlable, no-JS shell. */}
      <main id="about-content" lang="en" dir="ltr" tabIndex={-1} className="about-main" dangerouslySetInnerHTML={{ __html: content }} />
      <SiteFooter />
    </div>
  );
}
