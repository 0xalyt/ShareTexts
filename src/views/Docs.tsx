import React, { useState, useEffect, useRef } from 'react';
import { PageHeader } from '../components/PageHeader';
import { PlatformStrip } from '../components/marketing/PlatformStrip';
import { SiteFooter } from '../components/marketing/SiteFooter';
import { useI18n } from '../lib/i18n';
import { ReadingLanguageNote } from '../components/ReadingLanguageNote';
import './reading-pages.css';
import docsFaq from './docs-faq.json';
import { Send, QrCode, Shield, Monitor, Smartphone, Terminal, Key, Clock,
  RefreshCw, CircleAlert as AlertCircle, ArrowLeft, ArrowRight, ChevronDown, Radio,
} from 'lucide-react';

type Section = 'overview' | 'transfer' | 'pairing' | 'nearby' | 'spaces' | 'hop' | 'troubleshooting' | 'privacy' | 'devices' | 'faq' | 'developer' | 'api';

interface NavItem {
  id: Section;
  label: string;
  icon: React.ReactNode;
  group?: 'user' | 'developer';
}

const NAV_ITEMS: NavItem[] = [
  // ── User Documentation ──────────────────────────────────────
  { id: 'overview', label: 'Getting Started', icon: <Monitor className="w-4 h-4" />, group: 'user' },
  { id: 'transfer', label: 'How to Transfer', icon: <Send className="w-4 h-4" />, group: 'user' },
  { id: 'pairing', label: 'Pairing & QR', icon: <QrCode className="w-4 h-4" />, group: 'user' },
  { id: 'nearby', label: 'Nearby Devices', icon: <Radio className="w-4 h-4" />, group: 'user' },
  { id: 'spaces', label: 'Temporary Spaces', icon: <Clock className="w-4 h-4" />, group: 'user' },
  { id: 'hop', label: 'Linked Devices (Hop)', icon: <Monitor className="w-4 h-4" />, group: 'user' },
  { id: 'troubleshooting', label: 'Troubleshooting', icon: <RefreshCw className="w-4 h-4" />, group: 'user' },
  { id: 'privacy', label: 'Privacy & Security', icon: <Shield className="w-4 h-4" />, group: 'user' },
  { id: 'devices', label: 'Supported Devices', icon: <Smartphone className="w-4 h-4" />, group: 'user' },
  { id: 'faq', label: 'FAQ', icon: <AlertCircle className="w-4 h-4" />, group: 'user' },
  // ── Developer Documentation ─────────────────────────────────
  { id: 'developer', label: 'Developer Guide', icon: <Terminal className="w-4 h-4" />, group: 'developer' },
  { id: 'api', label: 'API Reference', icon: <Key className="w-4 h-4" />, group: 'developer' },
];

function CodeBlock({ code, language = 'bash' }: { code: string; language?: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  useEffect(() => {
    if (status === 'idle') return;
    const timer = window.setTimeout(() => setStatus('idle'), 2400);
    return () => window.clearTimeout(timer);
  }, [status]);
  return (
    <div className="relative rounded-[12px] bg-night-800 dark:bg-night-950 border border-white/[0.08] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.08]">
        <span className="text-[12px] font-medium text-white/40">{language}</span>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              setStatus('copied');
            } catch {
              setStatus('error');
            }
          }}
          aria-label={`Copy ${language} code`}
          className="min-h-11 min-w-11 text-sm text-white/70 hover:text-white transition-colors"
        >
          {status === 'copied' ? 'Copied' : status === 'error' ? 'Try again' : 'Copy'}
        </button>
      </div>
      <span role="status" className="sr-only">{status === 'copied' ? 'Code copied to clipboard.' : status === 'error' ? 'Could not copy. Select the code and copy it manually.' : ''}</span>
      <pre className="p-4 overflow-x-auto overscroll-x-contain text-[13px] leading-relaxed text-white/70 font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function Chapter({ title, intro, children }: { title: string; intro: string; children: React.ReactNode }) {
  return <div className="docs-copy"><header><h2 className="st-display text-[34px]">{title}</h2><p>{intro}</p></header>{children}</div>;
}

function Steps({ items }: { items: { title: string; text: string }[] }) {
  return <ol className="docs-steps">{items.map(item => <li key={item.title}><h3>{item.title}</h3><p>{item.text}</p></li>)}</ol>;
}

function OverviewSection() {
  return (
    <div className="docs-copy">
      <header>
        <h1 className="st-display text-[34px]">Move something to your other device.</h1>
        <p>A link on your phone, a photo for your laptop, a file for someone else. Choose how you want to share.</p>
      </header>
      <div className="guide-shortcuts">
        <a href="#transfer"><Send size={20} aria-hidden /><span><strong>Send it now</strong><small>Open a live room on both devices</small></span><ArrowRight size={16} aria-hidden /></a>
        <a href="#spaces"><Clock size={20} aria-hidden /><span><strong>Leave it for later</strong><small>Keep a Temporary Space open for hours or days</small></span><ArrowRight size={16} aria-hidden /></a>
        <a href="#hop"><Monitor size={20} aria-hidden /><span><strong>Share with your own devices</strong><small>Link them once with Hop</small></span><ArrowRight size={16} aria-hidden /></a>
      </div>
      <div className="guide-start">
        <div className="reading-eyebrow">Your first live transfer</div>
        <Steps items={[
          { title: 'Open ShareTexts on both devices', text: 'Use a browser on the device sending and the device receiving. Both need internet access.' },
          { title: 'Connect with the six-digit code', text: 'Choose Send on one device. On the other, choose Receive and enter the code shown.' },
          { title: 'Send, then save what you need', text: 'Type a note, paste a link, or attach a file. Keep both tabs open until it finishes. Download the file on the receiving device.' },
        ]} />
        <a className="reading-text-link" href="/#main-content">Open ShareTexts <ArrowRight size={16} aria-hidden /></a>
      </div>
      <p>Stuck at a code or a progress bar? <a href="#troubleshooting">Find the next step in troubleshooting.</a> For device-specific instructions, <a href="/guides">browse the guides.</a></p>
      <PlatformStrip />
    </div>
  );
}

function TransferSection() {
  return <Chapter title="Send text, photos, or files" intro="Use a live room when both devices are available now. You do not need the same operating system or Wi-Fi network.">
    <Steps items={[
      { title: 'Connect the devices', text: 'Open ShareTexts on each device. Choose Send on one and Receive on the other, then enter the six-digit code. A QR scan or room link works too.' },
      { title: 'Choose what to send', text: 'Type or paste text into the message box, or use the attachment control to choose a file. On a computer, you can also drag a file into the room.' },
      { title: 'Wait for completion', text: 'Keep both tabs open and devices awake. A file still showing progress has not finished. Use Retry if the transfer reports a failure.' },
      { title: 'Keep a copy', text: 'Download the file on the receiving device. To keep a message in ShareTexts, save it to Saved Items in that browser. Check the saved copy before deleting the original.' },
    ]} />
    <h3>Original files, not converted copies</h3>
    <p>ShareTexts transfers the file you select without compressing or converting it. Your photo picker may offer an original or converted version before ShareTexts receives it.</p>
    <h3>Large files need more care</h3>
    <p>Browser memory, available storage, and the connection affect what can finish. Start with a small file to check the connection. For a large transfer, keep the screens awake and avoid switching apps on a phone.</p>
    <p><a href="#pairing">Other ways to connect</a> · <a href="#troubleshooting">Fix a stalled transfer</a></p>
  </Chapter>;
}

function PairingSection() {
  return <Chapter title="Connect with a code, QR scan, or link" intro="Each method opens the same live room. Choose the one that fits the devices in front of you.">
    <h3>Enter the six-digit code</h3>
    <p>Choose Send on the first device. On the other, choose Receive and enter the current code. Codes refresh automatically; use the digits on screen, not an older screenshot.</p>
    <h3>Scan the QR code</h3>
    <p>Show the QR code on the sending device. Scan it with the receiving phone's camera and open the link. If you scan inside the browser, allow camera access when asked. You can enter the code instead.</p>
    <h3>Open the room link</h3>
    <p>Copy the room's share link and open it on the receiving device. Treat the link and QR code as invitations: anyone holding one may join while the room is available.</p>
    <h3>Check the other device</h3>
    <p>When the room opens, check that the expected device has connected before sending private content. Only share a code or invitation with the intended recipient.</p>
    <p>A live room uses six digits. A <a href="#spaces">Temporary Space uses eight characters</a>; enter that code on the space join page, not the live-room screen.</p>
  </Chapter>;
}

function NearbySection() {
  return <Chapter title="Find a device with Nearby" intro="Nearby can save you typing a code. It is optional and depends on both devices' network and service configuration.">
    <Steps items={[
      { title: 'Make the receiving device visible', text: 'Open ShareTexts on the device you want to send to. Turn Nearby on for 10 minutes. Opening the website alone does not make a device visible.' },
      { title: 'Select it on the sending device', text: 'Open ShareTexts on the other device, on the same network. Look for the receiving device in Nearby and select it.' },
      { title: 'Accept on the receiving device', text: 'Check the invitation and accept only if you recognize the sender. Then use the room to share.' },
    ]} />
    <h3>If the device does not appear</h3>
    <p>Check that Nearby is still on and neither device is already in a room. Some guest networks, VPNs, or hosting configurations prevent discovery. Use a <a href="#pairing">code, QR scan, or room link</a> instead; these do not depend on Nearby.</p>
    <h3>What other devices can see</h3>
    <p>Nearby shows a temporary device label while visibility is on. It is not a list of everyone using ShareTexts, and it does not use Bluetooth or request location permission. Turn Nearby off when you no longer need it.</p>
  </Chapter>;
}

function SpacesSection() {
  return <Chapter title="Leave content in a Temporary Space" intro="Use a space when people will open it at different times. Unlike a live room, its content is stored on the server.">
    <Steps items={[
      { title: 'Create a space', text: 'Open the space creation page. Choose or generate an eight-character code and choose a lifetime, from 6 hours to 7 days.' },
      { title: 'Share its code or link', text: 'Give the invitation only to people you want in the space. They can open the space join page and enter the eight-character code.' },
      { title: 'Add content and save copies', text: 'Members can add text and links. File uploads are not currently available in Temporary Spaces; use a live room to send a file. Copy anything you need before the space closes. The creator does not need to keep a tab open.' },
    ]} />
    <p><a href="/space/create">Create a space</a> · <a href="/space/join">Join with a space code</a></p>
    <h3>Access ends when the space closes</h3>
    <p>The creator can close it early. Otherwise, it closes at the chosen expiry. The code and link stop working, and server content enters deletion. Copies already downloaded or saved on a device remain.</p>
    <p>A space invitation is access, not a private contact list. Anyone holding a working code or link can join. Do not use a space as your only copy or for secrets you cannot entrust to the service.</p>
    <a className="reading-text-link" href="/guides/temporary-spaces.html">Read the space guide <ArrowRight size={16} aria-hidden /></a>
  </Chapter>;
}

function HopSection() {
  return <Chapter title="Link your own devices with Hop" intro="Hop remembers your devices so you do not need to enter a room code for each handoff. It uses a different storage model from live rooms.">
    <Steps items={[
      { title: 'Open Hop on your first device', text: 'Choose Hop from the home screen, then use its option to link another device.' },
      { title: 'Open the invitation on your other device', text: 'Scan the displayed QR code or open the link there. Keep the first device available to approve the request.' },
      { title: 'Compare before approving', text: 'Check that both screens show the same four emoji. Approve only a device you recognize. If the comparison differs, stop and create a new invitation.' },
    ]} />
    <h3>Send after linking</h3>
    <p>Open Hop to send text or a file to your linked devices. A device can collect waiting items when it returns online. Check the delivery state rather than assuming an offline device has received the item.</p>
    <h3>What waits on the server</h3>
    <p>The browser encrypts Hop content before uploading it. Encrypted copies wait in a server mailbox with a 30-day item lifetime. Hop is not permanent storage. Device keys and local copies stay in your browser, so clearing site data can require linking again.</p>
    <p><a href="#privacy">Compare all storage modes</a> · <a href="#troubleshooting">Fix a linking problem</a></p>
  </Chapter>;
}

function TroubleshootingSection() {
  return <Chapter title="Get a transfer moving again" intro="Start with the symptom below. Keep your original file, and copy any unsent text before refreshing a tab.">
    {[
      ['The room will not open', 'Check that both devices can load other websites. If room creation still fails, the service may be unavailable. Wait and try again rather than repeatedly creating rooms.'],
      ['The code is not accepted', 'Use the current six digits on the sending device. An eight-character code belongs on the Temporary Space join page. Use separate devices or browser profiles, not two tabs in the same profile.'],
      ['Nearby is empty', 'Turn Nearby on on the receiving device for 10 minutes and check the network. If nothing appears, connect with a code or room link instead.'],
      ['The transfer stops progressing', 'Bring both tabs to the foreground, keep the devices awake, and check the connection. If a transfer reports failure, use Retry. Try a small file to separate connection trouble from file size or storage limits.'],
      ['A received file is not in Downloads', 'Receiving is not the same as saving. Use the file download control, then check your browser downloads or Files app. Allow downloads if the browser asks.'],
      ['A space code no longer works', 'Check that it is the eight-character code and ask the creator whether the space has closed. Closed or expired spaces cannot be reopened with an old invitation.'],
      ['Hop will not link or deliver', 'Keep both devices online for linking, compare the four emoji, and approve on the first device. Check the device clock if requests fail. Clearing site data can remove keys; link again if needed.'],
    ].map(([title, text]) => <section key={title}><h3>{title}</h3><p>{text}</p></section>)}
    <p>Still stuck? <a href="https://x.com/0xalyt" target="_blank" rel="noopener noreferrer">Report the problem to @0xalyt</a> with your browser, device, and the message you see. Never post a room link, secret, access code, or private file publicly.</p>
  </Chapter>;
}

function PrivacySection() {
  return <Chapter title="Know where your content stays" intro="Encryption and storage are different questions. Choose the sharing mode that fits what you are sending.">
    <h3>Live rooms: share while both devices are open</h3>
    <p>Transfers are encrypted in transit, directly when possible or through an encrypted relay. The service issues the room secret and could derive the same encryption key. This is not a zero-knowledge system. Live-room content is not kept as a server-side message history.</p>
    <h3>Temporary Spaces: stored for later</h3>
    <p>Space content is stored on the server for the chosen lifetime, from 6 hours to 7 days, or until the creator closes it. Anyone with a working space code or link can join. Closure ends access; deletion runs afterward.</p>
    <h3>Hop: an encrypted mailbox for linked devices</h3>
    <p>Your browser encrypts items before uploading them. The server stores encrypted copies and delivery information with a 30-day item lifetime, not the content's decryption key.</p>
    <h3>Saved Items: a copy in this browser</h3>
    <p>Saving is an explicit action. These copies do not sync to your other devices and have no automatic expiry. Remove them from Saved Items or clear site data. Someone using the same browser profile may be able to read them.</p>
    <p>Closing a room or space does not erase downloaded or saved copies on another device. Keep invitations private and approve only devices you recognize.</p>
    <a href="/privacy" className="reading-text-link">Read the full Privacy Policy <ArrowRight size={16} aria-hidden /></a>
  </Chapter>;
}

function DevicesSection() {
  return <Chapter title="Choose a browser that can connect" intro="Use an up-to-date Chrome, Safari, Firefox, or Edge browser. Devices do not need to run the same system.">
    <p>ShareTexts is designed for iPhone, iPad, Android, Windows, macOS, Linux, and ChromeOS. A browser must support the connection and storage features used by the mode you choose. Not every browser, extension, or private-browsing setup behaves the same.</p>
    <h3>Open links in your main browser</h3>
    <p>A browser inside a social or messaging app may block transfers or downloads. Open the ShareTexts link in your regular browser if a connection fails there.</p>
    <h3>Allow only the permissions you need</h3>
    <p>Text transfers do not need your contacts or location. Scanning inside the browser asks for camera access. Notifications are optional for space reminders. If you decline the camera, enter the code instead.</p>
    <h3>Keep mobile transfers in view</h3>
    <p>Phones can suspend background tabs. Keep ShareTexts visible and the device awake until the transfer finishes. Check available storage before receiving a large file.</p>
    <p><a href="/guides/supported-devices.html">Read the device guide</a> · <a href="#troubleshooting">Troubleshoot your browser</a></p>
  </Chapter>;
}

function FAQSection() {
  return <Chapter title="Before you share" intro="Answers to the questions that change which sharing mode you should use.">
    {docsFaq.map(({ question, answer }) => <section key={question}><h3>{question}</h3><p>{answer}</p></section>)}
    <p><a href="/guides">Browse step-by-step guides</a> · <a href="/privacy">Read the Privacy Policy</a></p>
  </Chapter>;
}

function AgentSection() {
  return <Chapter title="Send from a trusted script" intro="The push API can send into an active live room. It is a developer integration, not a separate account or a way to retrieve room history.">
    <h3>Use the room's credentials carefully</h3>
    <p>Requests need the room ID and its secret as a bearer credential. This is the room secret, not a separate, revocable agent token. Do not put it in a public repository, logs, screenshots, or a shared chat. Close the room if its credentials are exposed.</p>
    <h3>Use the active connection service</h3>
    <p>Send the request to the signaling service that owns the room. On a self-hosted setup, use that deployment's base URL. The public website and the connection service are not necessarily the same origin.</p>
    <p>Keep a receiving device connected. A successful API response means the service accepted the send, not that someone downloaded or read it.</p>
    <a className="reading-text-link" href="#api">Request formats and limits <ArrowRight size={16} aria-hidden /></a>
  </Chapter>;
}

function APISection() {
  return <Chapter title="Push API reference" intro="POST /api/push sends text or a small file into an active room. Replace the placeholders below with the connection-service URL and credentials for that room.">
    <h3>Send text</h3>
    <CodeBlock code={`curl "$SIGNALING_URL/api/push" \\
  -H "Authorization: Bearer $ROOM_SECRET" \\
  -H "Content-Type: application/json" \\
  --data "{\\"roomId\\":\\"$ROOM_ID\\",\\"text\\":\\"Hello from my script\\"}"`} />
    <h3>Send a binary file</h3>
    <CodeBlock code={`curl "$SIGNALING_URL/api/push?roomId=$ROOM_ID" \\
  -H "Authorization: Bearer $ROOM_SECRET" \\
  -H "Content-Type: application/octet-stream" \\
  -H "X-File-Name: notes.txt" \\
  -H "X-File-Mime: text/plain" \\
  --data-binary @notes.txt`} />
    <p>Text is limited to 256 KB and files to 8 MB on this endpoint. These are push API limits, not live browser-transfer limits. Requests are rate-limited; wait before retrying a 429 response.</p>
    <h3>Read the response</h3>
    <CodeBlock language="json" code={'{ "ok": true, "messageId": "example-message-id" }'} />
    <p>A 401 response means the credential is missing or wrong; 404 means the room is unavailable. A 413 response means the request is too large. Do not retry an unauthorized request in a loop.</p>
    <p>Requests pass through the service. Do not treat the push API as a channel that hides content from the server.</p>
  </Chapter>;
}

const SECTION_IDS = NAV_ITEMS.map(i => i.id) as string[];

function sectionFromHash(): Section {
  // Deep links like /docs#faq land on the right section; anything unknown
  // (or absent) falls back to the overview. Guards for SSR-safety.
  if (typeof window === 'undefined') return 'overview';
  const h = window.location.hash.replace('#', '');
  if (h === 'security') return 'privacy';
  return (SECTION_IDS as string[]).includes(h) ? (h as Section) : 'overview';
}

export function Docs() {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState<Section>(sectionFromHash);
  const contentRef = useRef<HTMLDivElement>(null);
  const chapter = NAV_ITEMS.findIndex(item => item.id === activeSection);

  // Per-route document title — the home shell has its own static <title>.
  useEffect(() => {
    const previous = document.title;
    document.title = 'ShareTexts Docs | transfer text, photos & files between devices';
    return () => { document.title = previous; };
  }, []);

  // Browser back/forward moves between sections, same as clicking.
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#docs-content') return;
      const id = sectionFromHash();
      setActiveSection(id);
      contentRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
      contentRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const showSection = (id: Section) => {
    window.location.hash = id;
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'overview': return <OverviewSection />;
      case 'transfer': return <TransferSection />;
      case 'pairing': return <PairingSection />;
      case 'nearby': return <NearbySection />;
      case 'spaces': return <SpacesSection />;
      case 'hop': return <HopSection />;
      case 'troubleshooting': return <TroubleshootingSection />;
      case 'privacy': return <PrivacySection />;
      case 'devices': return <DevicesSection />;
      case 'faq': return <FAQSection />;
      case 'developer': return <AgentSection />;
      case 'api': return <APISection />;
    }
  };

  return (
    <div className="reading-page min-h-dvh bg-apple-canvas dark:bg-night-900 font-sans">
      <a href="#docs-content" lang="en" className="reading-skip">Skip to documentation</a>
      {/* Header — the shared PageHeader, so Docs, Legal and the 404 share one
          header instead of three hand-rolled near-copies. */}
      <PageHeader
        links={[
          { href: '/about', label: t('nav.about') },
          { href: '/privacy', label: t('nav.privacy') },
          { href: '/terms', label: t('nav.terms') },
        ]}
        currentLabel={t('nav.docs')}
      />

      <ReadingLanguageNote />
      <div lang="en" dir="ltr" className="reading-layout docs-layout">
        {/* Sidebar Navigation — desktop only */}
        <nav className="reading-sidebar docs-sidebar" aria-label="Documentation chapters">
          <div className="reading-sticky">
            <a className="guide-wordmark" href="/docs">The guide<span>ShareTexts, explained.</span></a>
            {/* User Documentation */}
            <div>
              <p className="reading-nav-label">The essentials</p>
              <div className="reading-nav-items">
                {NAV_ITEMS.filter(i => i.group === 'user').map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                    className="reading-nav-link"
                  >
                    {item.icon}
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            {/* Developer Documentation */}
            <div>
              <p className="reading-nav-label">Build with it</p>
              <div className="reading-nav-items">
                {NAV_ITEMS.filter(i => i.group === 'developer').map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    aria-current={activeSection === item.id ? 'page' : undefined}
                    className="reading-nav-link"
                  >
                    {item.icon}
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
            <a href="/" className="reading-sidebar-home">Back to sharing <ArrowRight size={16} aria-hidden /></a>
          </div>
        </nav>

        {/* Main Content */}
        {/* Long-form content is English-only; lang="en" keeps a screen reader
            from reading it with the voice of the surrounding app language. */}
        <main lang="en" className="docs-main">
          {/* A native chapter picker keeps every topic reachable on phones. */}
          <div className="guide-mobile-nav">
            <label htmlFor="guide-chapter">Explore the guide</label>
            <div>
              <select id="guide-chapter" value={activeSection} onChange={event => showSection(event.target.value as Section)}>
                <optgroup label="The essentials">{NAV_ITEMS.filter(item => item.group === 'user').map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
                <optgroup label="Build with it">{NAV_ITEMS.filter(item => item.group === 'developer').map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>
              </select>
              <ChevronDown size={16} aria-hidden />
            </div>
          </div>
          <div id="docs-content" ref={contentRef} tabIndex={-1} className="docs-content">
            {activeSection !== 'overview' && <h1 className="sr-only">{NAV_ITEMS[chapter].label}</h1>}
            <p className="reading-eyebrow">Documentation <span aria-hidden>/</span> {String(chapter + 1).padStart(2, '0')}</p>
            {renderSection()}
          </div>
          <nav className="guide-pagination" aria-label="Previous and next chapters">
            {chapter > 0 ? <a href={`#${NAV_ITEMS[chapter - 1].id}`}><ArrowLeft size={16} aria-hidden /><span><small>Previous</small>{NAV_ITEMS[chapter - 1].label}</span></a> : <span />}
            {chapter < NAV_ITEMS.length - 1 ? <a href={`#${NAV_ITEMS[chapter + 1].id}`}><span><small>Up next</small>{NAV_ITEMS[chapter + 1].label}</span><ArrowRight size={16} aria-hidden /></a> : <a href="/"><span><small>All set</small>Back to sharing</span><ArrowRight size={16} aria-hidden /></a>}
          </nav>
        </main>
      </div>

      {/* Footer — the same one every long-form page carries, so the site
          speaks one navigation language from anywhere. */}
      <SiteFooter />
    </div>
  );
}
