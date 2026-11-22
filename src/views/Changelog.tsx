import { useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { SiteFooter } from '../components/marketing/SiteFooter';
import { useI18n } from '../lib/i18n';
import content from './changelog-content.html?raw';
import './reading-pages.css';
import './about.css';

export function Changelog() {
  const { t } = useI18n();
  useEffect(() => {
    const previous = document.title;
    document.title = 'What’s new — ShareTexts';
    return () => { document.title = previous; };
  }, []);
  return <div className="reading-page min-h-dvh bg-apple-canvas dark:bg-night-900">
    <a href="#changelog-content" lang="en" className="reading-skip">Skip to content</a>
    <PageHeader links={[{ href: '/docs', label: t('nav.docs') }, { href: '/about', label: t('nav.about') }]} currentLabel={t('nav.changelog')} />
    <main id="changelog-content" lang="en" dir="ltr" tabIndex={-1} className="about-main" dangerouslySetInnerHTML={{ __html: content }} />
    <SiteFooter />
  </div>;
}
