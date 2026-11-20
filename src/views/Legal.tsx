import React, { useEffect } from 'react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { PageHeader } from '../components/PageHeader';
import { SiteFooter } from '../components/marketing/SiteFooter';
import { ThemeToggle } from '../components/ThemeToggle';
// Gravity UI icons aliased onto the names this file already uses (Cookie has
// no Gravity equivalent — it stays on lucide).
import { ArrowLeft, ShieldCheck, FileText, EyeOff, Server, Database } from 'lucide-react';
import { Cookie } from 'lucide-react';

/**
 * Legal — Privacy Policy and Terms of Use, one quiet page each.
 *
 * ShareTexts's entire product promise is privacy, so the policy is written in
 * plain language and structured around what we DON'T collect. English only:
 * other locales fall back automatically, and legal copy is safest untranslated.
 *
 * There is deliberately NO cookie consent banner anywhere in the app: the only
 * things stored are strictly-necessary localStorage entries (session
 * credentials, theme, language, drafts) and the user's own Saved Items library
 * (IndexedDB, created only by an explicit save, local to the device). The
 * absence of tracking is stated as a fact, not hidden behind a banner.
 */

type LegalPage = 'privacy' | 'terms';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="pt-8 first:pt-0">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-[8px] bg-azure-600/10 dark:bg-azure-600/20 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <h2 className="st-h3 text-apple-ink dark:text-white">{title}</h2>
      </div>
      <div className="text-[16px] leading-relaxed text-apple-ink-muted dark:text-white/60 space-y-3 [&_strong]:text-apple-ink dark:[&_strong]:text-white [&_a]:text-apple-blue dark:[&_a]:text-azure-400 [&_a:hover]:underline">
        {children}
      </div>
    </section>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-8">
      <Section icon={<ShieldCheck className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="The short version">
        <p>
          ShareTexts moves text, photos, and files directly between <strong>your</strong> devices.
          Live rooms encrypt transfers in transit and use a direct peer-to-peer connection when
          available, with an encrypted relay fallback. The service issues the room secret, so
          this is not a zero-knowledge system. Do not use it for secrets you cannot entrust to the service.
        </p>
        <p>
          <strong>Temporary Spaces store content for later.</strong> A space exists so a device can
          collect later, so what you add is held until the space closes or reaches its expiry
          (6 hours to 7 days, whichever the creator chose), and it is deleted then. Closing a space
          early deletes its stored content early. Keep your own copy before the space closes.
        </p>
      </Section>

      <Section icon={<EyeOff className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="What you do not need to provide">
        <p>ShareTexts does not ask for:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Your name, email, phone number, or any account</li>
          <li>Contacts, location, or advertising identifiers</li>
        </ul>
        <p>
          Room transfers use a key derived from the room secret. Because the service issues that
          secret, it could derive the same key. Temporary Space items are stored server-side and
          can be accessed by anyone holding the space's access token until the space closes.
        </p>
      </Section>

      <Section icon={<Server className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="What the connection server sees">
        <p>
          Pairing requires a signaling service. It sees IP addresses, room identifiers and secrets,
          pairing codes, WebRTC handshake data, transfer sizes, and times. Relay transfers also pass
          encrypted content through the service. Room state expires automatically, except rooms
          you choose to keep with Stay Connected. Aggregate activity counters measure service use.
        </p>
      </Section>

      <Section icon={<Database className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="What stays on your device">
        <p>ShareTexts keeps a few things in your browser's local storage and its local database:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li><strong>Room credentials</strong> (room id + secret) so a refresh doesn't break the pairing</li>
          <li><strong>Recent messages</strong> so history survives an accidental reload</li>
          <li><strong>Preferences</strong>: theme, language, device name</li>
          <li><strong>Unsent drafts</strong> so a typed message survives a refresh</li>
          <li><strong>Saved items</strong> you bookmark from a session — text, links, photos and
            files you chose to keep, in this browser's IndexedDB storage</li>
        </ul>
        <p>
          Room entries are removed when you close the room, and clearing your browser data removes
          everything instantly — saved items included. Saved items are the one deliberate
          exception to the room's impermanence: saving is an explicit action, the content never
          leaves this device, is never uploaded, and stays only until you remove it, clear the
          library, or clear site data. Anyone with access to this browser profile can see it, and
          browser storage is not encrypted by ShareTexts beyond normal device protection.
          Nothing is synced anywhere.
        </p>
      </Section>

      <Section icon={<Cookie className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Cookies and trackers">
        <p>
          ShareTexts sets no tracking cookies and loads no third-party analytics scripts. The
          service counts aggregate product events without attaching message contents. Network
          requests include signaling, relay or peer-to-peer traffic, and Temporary Space storage.
        </p>
      </Section>

      <Section icon={<FileText className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Changes to this policy">
        <p>
          If the policy ever changes, the updated version will be published on this page. The
          page explains how live rooms, Temporary Spaces, and local Saved Items handle your content.
        </p>
      </Section>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-8">
      <Section icon={<ShieldCheck className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Using ShareTexts">
        <p>
          ShareTexts is a free browser utility for moving content between devices you control.
          You don't need an account, and you don't need to give us anything to use it.
        </p>
      </Section>

      <Section icon={<FileText className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Your content is yours">
        <p>
          Everything you send belongs to you. ShareTexts claims no rights over your text, photos,
          videos, or files. Encryption in transit does not make the service unable to access
          content. You are responsible for what you send and to whom.
        </p>
      </Section>

      <Section icon={<Server className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Acceptable use">
        <p>You agree not to use ShareTexts to:</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Send content that is illegal where you live</li>
          <li>Harass, threaten, or spam other people</li>
          <li>Attempt to break the pairing mechanism, rate limits, or the service itself</li>
        </ul>
      </Section>

      <Section icon={<Database className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Rooms are temporary">
        <p>
          Live rooms expire automatically unless you enable Stay Connected. Closing a room does
          not remove files already saved on a device. Temporary Spaces hold content server-side
          for the chosen lifetime (6 hours to 7 days), or until closed early. Saved Items remain
          in your own browser until you remove them or clear site data. Keep a separate backup.
        </p>
      </Section>

      <Section icon={<ShieldCheck className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="No warranty">
        <p>
          ShareTexts is provided <strong>as is</strong>, without warranties of any kind. We work
          hard to keep transfers reliable and byte-perfect, but networks fail and browsers differ.
          For anything irreplaceable, keep a backup. To the maximum extent permitted by law,
          ShareTexts's operators are not liable for lost, incomplete, or unexpected transfers.
        </p>
      </Section>

      <Section icon={<FileText className="w-4 h-4 text-azure-600 dark:text-azure-400" />} title="Contact">
        <p>
          Questions about these terms? Reach us on X <a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer">@0xalyt</a>.
        </p>
      </Section>
    </div>
  );
}

export function Legal({ page }: { page: LegalPage }) {
  const isPrivacy = page === 'privacy';
  const title = isPrivacy ? 'Privacy Policy' : 'Terms of Use';

  useEffect(() => {
    const previous = document.title;
    document.title = `ShareTexts ${title}`;
    return () => { document.title = previous; };
  }, [title]);

  return (
    <div className="min-h-dvh bg-apple-canvas dark:bg-night-900 font-sans">
      {/* The shared PageHeader: Legal used to be the one screen with no way
          to Docs or About from its header. */}
      <PageHeader
        links={[
          { href: '/docs', label: 'Docs' },
          { href: '/about', label: 'About' },
        ]}
        currentLabel={title}
      />

      {/* Long-form content is English-only; lang="en" keeps a screen reader
          from reading it with the voice of the surrounding app language. */}
      <div lang="en" className="max-w-2xl mx-auto px-6 py-10 sm:py-14">
        <h1 className="st-display text-[34px] text-apple-ink dark:text-white mb-2">
          {title}
        </h1>
        <p className="text-[16px] text-apple-ink-muted/80 dark:text-white/40 mb-9">
          Last updated: November 2026
        </p>
        {isPrivacy ? <PrivacyContent /> : <TermsContent />}

        <div className="mt-12 pt-6 border-t border-apple-divider/60 dark:border-white/[0.08] flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p className="text-[13px] font-medium text-apple-ink-muted dark:text-white/50">
            Read also our 
            <a href={isPrivacy ? '/terms' : '/privacy'} className="text-apple-blue dark:text-azure-400 hover:underline">
              {isPrivacy ? 'Terms of Use' : 'Privacy Policy'}
            </a>
            {' '}and the <a href="/docs" className="text-apple-blue dark:text-azure-400 hover:underline">documentation</a>.
          </p>
          <a href="/" className="inline-flex items-center min-h-[44px] text-[13px] font-semibold text-apple-blue dark:text-azure-400 hover:underline">
            Back to ShareTexts
          </a>
        </div>
      </div>

      {/* The same footer every long-form page carries. Privacy and Terms used to
          end in a one-line "read also" row and nothing else, so the two pages a
          cautious reader opens to decide whether to trust the product were the
          only pages with no way forward but the browser's back button. */}
      <SiteFooter />
    </div>
  );
}
