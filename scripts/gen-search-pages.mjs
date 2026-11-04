/**
 * The three answer-first pages (P6 STEP 4).
 *
 *   /iphone-to-windows     photos and files from an iPhone to a Windows PC
 *   /android-to-iphone     files between Android and iPhone
 *   /airdrop-alternative   an honest comparison, including where we lose
 *
 * Each one is a static HTML file in public/guides/, served at its short URL
 * (server.ts + vercel.json), with:
 *   • a unique title, description and H1,
 *   • the answer inside the first 40–60 words,
 *   • one fact per sentence,
 *   • a visible FAQ whose questions and answers are copied VERBATIM into
 *     FAQPage JSON-LD — markup never describes anything a reader can't see,
 *   • canonical + BreadcrumbList.
 *
 * The shell (head, CSS, header, footer) is lifted from an existing guide so the
 * pages stay visually identical without a second stylesheet to maintain.
 *
 * Run: node scripts/gen-search-pages.mjs
 */
import fs from 'node:fs';

const SHELL = fs.readFileSync('public/guides/how-to-transfer-files-from-phone-to-computer.html', 'utf8');
const headEnd = SHELL.indexOf('</head>');
const head = SHELL.slice(0, headEnd);
const tail = SHELL.slice(SHELL.indexOf('</body>'));
const header = SHELL.slice(headEnd, SHELL.indexOf('<main class="container">'));

/** Reuse the shell's <head>, swapping every route-specific value. */
function shellHead(page) {
  const abs = `https://sharetexts.online${page.path}`;
  let h = head;
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${page.title}</title>`);
  h = h.replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${page.description}" />`);
  h = h.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${abs}" />`);
  h = h.replace(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${page.title}" />`);
  h = h.replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${page.description}" />`);
  h = h.replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${abs}" />`);
  h = h.replace(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${page.title}" />`);
  h = h.replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${page.description}" />`);
  // Strip the shell's own structured data; each page injects exactly one block.
  h = h.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '');
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'ShareTexts', item: 'https://sharetexts.online/' },
          { '@type': 'ListItem', position: 2, name: 'Guides', item: 'https://sharetexts.online/guides' },
          { '@type': 'ListItem', position: 3, name: page.h1, item: abs },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: page.faq.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
  };
  return `${h}\n  <script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n  </script>\n</head>`;
}

const PAGES = [
  {
    slug: 'iphone-to-windows',
    path: '/iphone-to-windows',
    title: 'iPhone to Windows: send a file in about 20 seconds',
    description:
      'Send photos and files from an iPhone to a Windows PC in the browser. No iTunes, no cable, no app. Both devices show a code; the file arrives encrypted.',
    h1: 'How to send a file from iPhone to Windows',
    lead:
      'Open sharetexts.online on both devices. On the iPhone tap Send, then type the six-digit code on the PC. Pick the file. It arrives on the PC with a Save button. Nothing is installed on either side, and both devices must keep the tab open until the transfer finishes.',
    sections: [
      [
        'Why this works without iTunes or a cable',
        'The browser on each device opens one encrypted connection to the other. The file travels over that connection and never waits on a server. iTunes is only needed for backups and syncing, and a cable only moves files when both ends understand each other. Neither is involved here.',
      ],
      [
        'Step by step',
        null,
      ],
      [
        'What people usually send',
        'Camera-roll photos, screenshots, PDFs from Mail, a link from Safari, a paragraph of text. All of it takes the same route. Photos arrive as ordinary JPEG or HEIC files, exactly as the iPhone stored them.',
      ],
      [
        'When it will not work',
        'The iPhone must keep Safari in the foreground while the file sends. A Windows PC without Wi-Fi can still join if it has a wired connection. Very large videos over a weak mobile signal will be slow — that is the phone network, not the browser.',
      ],
    ],
    steps: [
      ['Open the site on both devices', 'On the iPhone, open Safari and go to sharetexts.online. Do the same in Edge or Chrome on the PC.'],
      ['Tap Send on the iPhone', 'A six-digit code and a QR code appear. Leave this screen open.'],
      ['Enter the code on the PC', 'Type the six digits, or scan the QR with the iPhone if the PC did not start the room.'],
      ['Pick the file, then save it', 'Choose the photo or file on the iPhone. On the PC it appears with a Save button.'],
    ],
    faq: [
      ['Do I need iTunes on Windows?', 'No. iTunes is not used. The transfer happens between the two browsers.'],
      ['Do I need to install anything on the iPhone?', 'No. Safari is enough, and nothing is added to the home screen unless you choose to install it.'],
      ['Does it work away from home Wi-Fi?', 'Yes, if both devices have internet. The connection goes through the network each device is on, so a phone on mobile data can send to a PC on home broadband.'],
      ['Where do the files go afterwards?', 'Downloads on the PC. Nothing is stored on a server after the transfer finishes, and a room closes when both tabs close.'],
      ['Can I send a whole album at once?', 'Yes. Select several photos in the picker; they queue and arrive one after another.'],
    ],
    related: [
      ['/android-to-iphone', 'Android → iPhone'],
      ['/airdrop-alternative', 'AirDrop alternative'],
      ['/guides/how-to-transfer-files-from-phone-to-computer.html', 'Phone → Computer'],
      ['/guides/transfer-photos-without-an-app.html', 'Photos without an app'],
    ],
  },
  {
    slug: 'android-to-iphone',
    path: '/android-to-iphone',
    title: 'Android to iPhone: move photos and files without a cable',
    description:
      'Send files from an Android phone to an iPhone in the browser. No app, no cable, no cloud account. A six-digit code pairs the two phones and the file goes straight across.',
    h1: 'How to send files from Android to iPhone',
    lead:
      'Open sharetexts.online on both phones. Tap Send on the Android phone, then enter the six digits on the iPhone. Choose the file. It appears on the iPhone with a Save button. Both phones need a browser and an internet connection, and both tabs must stay open while the file moves.',
    sections: [
      [
        'What actually moves',
        'Photos, videos, PDFs, documents, links and plain text. Android hands over the file as it is stored, so a 4K video stays a 4K video. The iPhone saves it into Files or Photos, depending on where you open it from.',
      ],
      ['Step by step', null],
      [
        'Why not just use a cloud drive',
        'A cloud drive makes you upload, wait, then download. That is three steps and a copy that outlives the transfer. This is one connection and no stored copy: when both tabs close, the room is gone.',
      ],
      [
        'Where the two platforms disagree',
        'Safari on iOS pauses a tab when you switch apps, so the iPhone side must stay visible while a large file arrives. Android can keep the tab alive in the background more reliably. If a transfer stalls, bring the iPhone tab back to the front and it resumes.',
      ],
    ],
    steps: [
      ['Open the site on both phones', 'Chrome on Android, Safari on iPhone. Both go to sharetexts.online.'],
      ['Tap Send on the Android phone', 'A six-digit code appears. Keep the screen on.'],
      ['Enter the code on the iPhone', 'Tap Receive, then type the six digits. The two phones connect directly.'],
      ['Send, then save', 'Pick the photos or files on Android. On the iPhone, tap Save on each item.'],
    ],
    faq: [
      ['Do both phones need the app?', 'No app is involved on either side. Both phones use their own browser.'],
      ['Can the iPhone send back to the Android phone?', 'Yes. Either device can create the room, and either can send once they are connected.'],
      ['Do Live Photos keep their motion?', 'A Live Photo arrives as a still image plus its video component only if the picker offers both. The simplest reliable result is the still image.'],
      ['Is there a size limit?', 'There is no fixed limit in the product. Real limits are the phone\'s memory and the patience of the network, so very large videos are better sent one at a time.'],
      ['Does it work between an old Android and a new iPhone?', 'Yes, as long as both browsers support WebRTC. Chrome 80 or later and iOS 14 or later both do.'],
    ],
    related: [
      ['/iphone-to-windows', 'iPhone → Windows'],
      ['/airdrop-alternative', 'AirDrop alternative'],
      ['/guides/how-to-transfer-files-between-devices.html', 'Between any devices'],
      ['/guides/supported-devices.html', 'Supported devices'],
    ],
  },
  {
    slug: 'airdrop-alternative',
    path: '/airdrop-alternative',
    title: 'An AirDrop alternative for Windows, Android and the browser',
    description:
      'AirDrop only talks to Apple devices. ShareTexts moves files between any two devices in the browser, including iPhone to Windows. An honest comparison of where each one wins.',
    h1: 'AirDrop alternative: what to use when the other device is not an Apple device',
    lead:
      'AirDrop only connects Apple devices to Apple devices. For an iPhone to a Windows PC, or an Android phone to an iPhone, open sharetexts.online on both and pair them with a six-digit code. The file goes straight between the two browsers. Nothing is installed, and no account is created.',
    sections: [
      [
        'Where AirDrop is simply better',
        'Between two Apple devices, AirDrop is the right answer. It is built into the system, it works with no network at all, and it moves a large video fast. If both devices are Apple and near each other, use AirDrop and ignore this page.',
      ],
      [
        'Where a browser wins',
        'AirDrop does not exist on Windows or Android. There is no Apple-supported version of it for those platforms. A browser page runs on all of them, needs no install, and can also carry text and links, which AirDrop handles awkwardly.',
      ],
      ['How the two compare', null],
      [
        'What it costs you',
        'Both devices need an internet connection, where AirDrop can work offline over its own radio. The first transfer needs a code typed on the second device. A browser tab has to stay open, and iOS pauses a backgrounded tab.',
      ],
      [
        'Privacy, plainly',
        'Each transfer is encrypted in the browser and goes between the two devices, not through storage. Room codes are short-lived. This is not a claim that it is audited or certified — the protocol is open in the repository if you want to read it.',
      ],
    ],
    compare: [
      ['iPhone → Windows PC', 'Not available', 'Works in any browser'],
      ['Android → iPhone', 'Not available', 'Works in any browser'],
      ['Apple → Apple, offline', 'Works, no network', 'Needs internet'],
      ['Install required', 'Built into iOS and macOS', 'No install; optional Home Screen app'],
      ['Text and links', 'Links only, via a shared app', 'Text, links and code'],
      ['Speed on a large video', 'Very fast, local radio', 'As fast as the network allows'],
    ],
    faq: [
      ['Is this as fast as AirDrop?', 'No. AirDrop uses a direct local radio link. This uses the network both devices are on, so a large video takes longer.'],
      ['Does it need internet?', 'Yes. The two browsers need a route to each other, which today means both have a connection.'],
      ['Is it private?', 'The transfer is encrypted between the two browsers and no copy is stored after it finishes. It has not been independently audited, and the code is public.'],
      ['Can I send to more than one device?', 'A room connects one sender to one receiver at a time. Send to a second device by joining with the same code from that device.'],
      ['Does it work on the same Wi-Fi only?', 'No. Devices on different networks work too, as long as both have internet.'],
    ],
    related: [
      ['/iphone-to-windows', 'iPhone → Windows'],
      ['/android-to-iphone', 'Android → iPhone'],
      ['/guides/compare-airdrop.html', 'Full AirDrop comparison'],
      ['/guides/how-it-works.html', 'How it works'],
    ],
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

for (const page of PAGES) {
  const body = `
  <main class="container">
    <article>
      <p class="muted" style="font-size:13px; margin-bottom:8px;">Guide</p>
      <nav class="st-crumb" aria-label="Breadcrumb">
        <a href="/">ShareTexts</a>
        <span aria-hidden="true">›</span>
        <a href="/guides">Guides</a>
        <span aria-hidden="true">›</span>
        <span aria-current="page">${esc(page.h1)}</span>
      </nav>
      <h1>${esc(page.h1)}</h1>
      <p class="subtitle">${esc(page.lead)}</p>

      <div class="callout">
        <p><strong>Quick answer:</strong> open <a href="/" class="accent">sharetexts.online</a> on both devices, tap Send on one, type the six-digit code on the other, pick the file. It arrives with a Save button.</p>
      </div>

${page.sections
  .map(([h2, text]) => {
    if (text === null && page.steps) {
      return `      <h2>${h2}</h2>\n      <ol class="steps">\n${page.steps
        .map(([t, p]) => `        <li><div><h3>${t}</h3><p>${p}</p></div></li>`)
        .join('\n')}\n      </ol>`;
    }
    if (text === null && page.compare) {
      const rows = page.compare
        .map(([a, b, c], i) => `          <tr${i === 0 ? ' style="border-top:none"' : ''}><th scope="row" style="text-align:left; font-weight:500; padding:10px 0;">${a}</th><td style="padding:10px 12px; color:#6e6e73;">${b}</td><td style="padding:10px 12px;">${c}</td></tr>`)
        .join('\n');
      return `      <h2>${h2}</h2>\n      <table style="width:100%; border-collapse:collapse; font-size:15px; margin-bottom:16px;">\n        <thead><tr><th style="text-align:left; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:#6e6e73; padding-bottom:8px;">Case</th><th style="text-align:left; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:#6e6e73; padding-bottom:8px;">AirDrop</th><th style="text-align:left; font-size:13px; text-transform:uppercase; letter-spacing:.04em; color:#6e6e73; padding-bottom:8px;">ShareTexts</th></tr></thead>\n        <tbody>\n${rows}\n        </tbody>\n      </table>`;
    }
    return `      <h2>${h2}</h2>\n      <p>${text}</p>`;
  })
  .join('\n\n')}

      <h2>Questions people ask</h2>
${page.faq.map(([q, a]) => `      <h3 style="font-size:16px; margin:20px 0 6px;">${esc(q)}</h3>\n      <p>${esc(a)}</p>`).join('\n')}

      <div style="text-align:center; margin: 40px 0;">
        <a href="/" class="cta">Try ShareTexts Free →</a>
      </div>

      <section class="related">
        <h2>Related</h2>
        <div class="related-links">
${page.related.map(([href, label]) => `          <a href="${href}">${label}</a>`).join('\n')}
        </div>
      </section>
    </article>
  </main>
`;
  const html = `${shellHead(page)}${header}${body}${tail}`;
  fs.writeFileSync(`public/guides/${page.slug}.html`, html);
  console.log(`wrote public/guides/${page.slug}.html (${(html.length / 1024).toFixed(1)} kB)`);
}
