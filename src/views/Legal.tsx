import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { SiteFooter } from '../components/marketing/SiteFooter';
import { ReadingLanguageNote } from '../components/ReadingLanguageNote';
import { useI18n } from '../lib/i18n';
import privacyContent from './privacy-content.html?raw';
import termsContent from './terms-content.html?raw';
import './reading-pages.css';

type LegalPage = 'privacy' | 'terms';

const PRIVACY_SECTIONS = ['The short version', 'What you do not need to provide', 'What the connection server sees', 'What stays on your device', 'Cookies and trackers', 'Changes to this policy'];
const TERMS_SECTIONS = ['Using ShareTexts', 'Your content is yours', 'Acceptable use', 'Rooms are temporary', 'No warranty', 'Contact'];
const sectionId = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function Legal({ page }: { page: LegalPage }) {
  const { t } = useI18n();
  const isPrivacy = page === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Use';
  const sections = isPrivacy ? PRIVACY_SECTIONS : TERMS_SECTIONS;
  const [active, setActive] = useState(sectionId(sections[0]));

  useEffect(() => {
    const previous = document.title;
    document.title = `ShareTexts ${title}`;
    return () => { document.title = previous; };
  }, [title]);

  useEffect(() => {
    const elements = sections.map(title => document.getElementById(sectionId(title))).filter((element): element is HTMLElement => element !== null);
    let frame = 0;
    const updateActive = () => {
      frame = 0;
      let current = elements[0];
      for (const element of elements) {
        if (element.getBoundingClientRect().top <= 112) current = element;
      }
      if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
        current = elements[elements.length - 1];
      }
      if (current) setActive(current.id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(updateActive);
    };
    const target = document.getElementById(window.location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
    updateActive();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [sections]);

  return (
    <div className="reading-page min-h-dvh bg-apple-canvas dark:bg-night-900 font-sans">
      <a href="#legal-content" lang="en" className="reading-skip">Skip to {isPrivacy ? 'privacy policy' : 'terms'}</a>
      {/* The shared PageHeader: Legal used to be the one screen with no way
          to Docs or About from its header. */}
      <PageHeader
        links={[
          { href: '/docs', label: t('nav.docs') },
          { href: '/about', label: t('nav.about') },
        ]}
        currentLabel={title}
      />

      {/* Long-form content is English-only; lang="en" keeps a screen reader
          from reading it with the voice of the surrounding app language. */}
      <ReadingLanguageNote />
      <main lang="en" dir="ltr" id="legal-content" tabIndex={-1}>
        <div className="legal-hero">
          <p className="reading-eyebrow">ShareTexts <span aria-hidden>/</span> {isPrivacy ? 'Your privacy' : 'The ground rules'}</p>
          <h1>{title}</h1>
          <p>{isPrivacy ? 'What is shared, what is stored, and what you can control.' : 'Your content, your responsibilities, and the limits of the service.'}</p>
          <div className="legal-meta"><span>Updated November 2026</span><span>Written in plain language</span></div>
        </div>
        <div className="reading-layout legal-layout">
          <nav className="reading-sidebar legal-sidebar" aria-label="On this page">
            <div className="reading-sticky">
              <p className="reading-nav-label">On this page</p>
              <div className="reading-nav-items">
                {sections.map((section, index) => <a key={section} href={`#${sectionId(section)}`} className="reading-nav-link" aria-current={active === sectionId(section) ? 'location' : undefined}><span aria-hidden>{String(index + 1).padStart(2, '0')}</span>{section}</a>)}
              </div>
              <a href={isPrivacy ? '/terms' : '/privacy'} className="reading-sidebar-home">{isPrivacy ? 'Terms of use' : 'Privacy policy'} <ArrowRight size={16} aria-hidden /></a>
            </div>
          </nav>
          <article className="legal-article">
            {/* Authored HTML is shared with the no-JavaScript pages at build time. */}
            <div dangerouslySetInnerHTML={{ __html: isPrivacy ? privacyContent : termsContent }} />
            <div className="legal-related">
              <div><p>Questions about the details?</p><a href="/docs#privacy">Explore the privacy guide <ArrowRight size={16} aria-hidden /></a></div>
              <a href={isPrivacy ? '/terms' : '/privacy'}>{isPrivacy ? 'Terms of use' : 'Privacy policy'} <ArrowRight size={16} aria-hidden /></a>
            </div>
          </article>
        </div>
      </main>

      {/* The same footer every long-form page carries. Privacy and Terms used to
          end in a one-line "read also" row and nothing else, so the two pages a
          cautious reader opens to decide whether to trust the product were the
          only pages with no way forward but the browser's back button. */}
      <SiteFooter />
    </div>
  );
}
