/**
 * StoryArt — the three pictures in "Three things it does".
 *
 * These replace the recorded product loops. A recording of a phone screen in a
 * 168px column was a postage stamp of a UI: unreadable, four hundred kilobytes
 * of video on a page that may be opened on a train, and impossible to tell
 * apart from the two beside it at a glance. A drawing at this size does one
 * thing per picture, at a stroke weight you can actually see.
 *
 * The drawing rules, so the three read as one family:
 *   · one 320×220 frame, one hairline weight (1.5), one radius language
 *     (10 / 14 / 8), and the app's own two inks: the neutral line and ember.
 *   · each picture states its idea in a still frame. Pair is two frames joined
 *     by a link, Send is a card that has moved and a row that is now full, Keep
 *     is a shelf holding items under a seven-tick timer. Nothing needs the
 *     animation to be understood.
 *   · motion is additive only, and lives in CSS under
 *     `prefers-reduced-motion: no-preference`, so a device with animations
 *     switched off gets the complete, readable picture rather than a blank
 *     panel or a frozen half-second of one. That is the rule for everything in
 *     the app: animation may add emphasis, it may never carry meaning.
 *
 * Pure SVG, no images, no filters: about 3 KB each, crisp at any density, and
 * it costs the main thread nothing while the page scrolls.
 */

import type { ReactNode } from 'react';

type Story = 'pair' | 'send' | 'keep';

const STROKE = 1.5;

/* Shared inks. `currentColor` carries the neutral line so both themes work
   without a second palette, and ember is the app's one accent. */
const line = 'currentColor';

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 320 220"
      role="img"
      aria-label={label}
      className="h-full w-full text-apple-ink dark:text-white"
      fill="none"
    >
      {children}
    </svg>
  );
}

/* ── Pair: two frames, one link, one code ─────────────────────────────── */
function Pair({ label }: { label: string }) {
  return (
    <Frame label={label}>
      {/* laptop */}
      <g stroke={line} strokeWidth={STROKE} strokeLinejoin="round">
        <rect x="26" y="74" width="128" height="84" rx="10" opacity="0.5" />
        <rect x="32" y="80" width="116" height="72" rx="6" opacity="0.16" />
        <path d="M18 164h144" opacity="0.5" strokeLinecap="round" />
        <path d="M18 164h144" opacity="0.22" strokeLinecap="round" transform="translate(0 5)" />
      </g>
      {/* phone */}
      <g stroke={line} strokeWidth={STROKE} strokeLinejoin="round">
        <rect x="198" y="56" width="80" height="126" rx="14" opacity="0.5" />
        <rect x="203" y="61" width="70" height="116" rx="10" opacity="0.16" />
        <rect x="226" y="66" width="24" height="5" rx="2.5" opacity="0.45" stroke="none" fill={line} />
        <rect x="228" y="168" width="20" height="3" rx="1.5" opacity="0.4" stroke="none" fill={line} />
      </g>

      {/* the link: a hairline arc the two ends share */}
      <path
        d="M154 116 Q179 86 198 116"
        stroke="#f06413"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray="2 5"
        opacity="0.85"
      />
      {/* the travelling beat: additive. Without motion it rests mid-arc, which
          is exactly where the still picture wants it. */}
      <circle className="st-art-dot" cx="176" cy="101" r="2.6" fill="#f06413" />

      {/* the code plate above the laptop: six bars, not six glyphs, so the same
          picture works in every language */}
      <g opacity="0.9">
        <rect x="52" y="34" width="76" height="26" rx="8" fill="currentColor" opacity="0.07" />
        <rect x="52" y="34" width="76" height="26" rx="8" stroke={line} strokeWidth={STROKE} opacity="0.22" />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect
            key={i}
            x={62 + i * 10.5}
            y={43}
            width="5"
            height="8"
            rx="1.5"
            fill="#f06413"
            opacity={i < 3 ? 1 : 0.55}
          />
        ))}
      </g>

      {/* tick under the phone: the link landed */}
      <g stroke="#f06413" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M227 122l5 5 10-11" />
      </g>
    </Frame>
  );
}

/* ── Send: three cards, one of them already across ────────────────────── */
function Send({ label }: { label: string }) {
  return (
    <Frame label={label}>
      {/* the outgoing stack */}
      <g>
        {[0, 1, 2].map((i) => (
          <g key={i} opacity={i === 0 ? 1 : 0.55 - i * 0.12}>
            <rect
              x={26 + i * 3}
              y={62 + i * 40}
              width="104"
              height="32"
              rx="9"
              fill="currentColor"
              opacity={i === 0 ? 0.07 : 0.035}
            />
            <rect
              x={26 + i * 3}
              y={62 + i * 40}
              width="104"
              height="32"
              rx="9"
              stroke={line}
              strokeWidth={STROKE}
              opacity={i === 0 ? 0.4 : 0.22}
            />
            <rect x={36 + i * 3} y={72 + i * 40} width="12" height="12" rx="3.5" fill="#f06413" opacity={i === 0 ? 0.9 : 0.3} />
            <rect x={54 + i * 3} y={74 + i * 40} width={i === 1 ? 44 : 56} height="4" rx="2" fill={line} opacity="0.35" />
            <rect x={54 + i * 3} y={82 + i * 40} width="30" height="4" rx="2" fill={line} opacity="0.18" />
          </g>
        ))}
      </g>

      {/* the path it took */}
      <path d="M138 96 H208" stroke={line} strokeWidth={STROKE} strokeDasharray="3 5" opacity="0.35" strokeLinecap="round" />
      <path d="M200 90l8 6-8 6" stroke="#f06413" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.9" />
      {/* the one in flight: additive */}
      <rect className="st-art-fly" x="150" y="90" width="12" height="12" rx="3.5" fill="#f06413" />

      {/* the receiving frame, with the arrival already in place */}
      <g stroke={line} strokeWidth={STROKE}>
        <rect x="228" y="52" width="68" height="128" rx="14" opacity="0.5" />
        <rect x="233" y="57" width="58" height="118" rx="10" opacity="0.14" />
      </g>
      <g>
        <rect x="240" y="86" width="44" height="20" rx="6" fill="#f06413" opacity="0.16" />
        <rect x="240" y="86" width="44" height="20" rx="6" stroke="#f06413" strokeWidth={STROKE} opacity="0.7" />
        <rect x="264" y="92" width="4" height="8" rx="1.5" fill="#f06413" opacity="0.8" />
        <rect x="244" y="92" width="14" height="3" rx="1.5" fill={line} opacity="0.5" />
        {[0, 1].map((i) => (
          <g key={i} opacity="0.4">
            <rect x="240" y={114 + i * 22} width="44" height="16" rx="5" fill="currentColor" opacity="0.05" />
            <rect x="240" y={114 + i * 22} width="44" height="16" rx="5" stroke={line} strokeWidth={STROKE} opacity="0.2" />
          </g>
        ))}
      </g>
    </Frame>
  );
}

/* ── Keep: a shelf, and a seven-day clock ─────────────────────────────── */
function Keep({ label }: { label: string }) {
  const ticks = Array.from({ length: 7 }, (_, i) => i);
  return (
    <Frame label={label}>
      {/* the host: a shelf, not a box — it holds things and stays open */}
      <g stroke={line} strokeWidth={STROKE} strokeLinejoin="round">
        <path d="M46 78v96a10 10 0 0 0 10 10h150a10 10 0 0 0 10-10V78" opacity="0.45" />
        <path d="M46 96h170" opacity="0.22" />
        <path d="M212 78c0-9 8-16 18-16s18 7 18 16" opacity="0.2" />
      </g>

      {/* two items resting on the shelf */}
      {[0, 1].map((i) => (
        <g key={i} opacity={0.9 - i * 0.15}>
          <rect x={74 + i * 62} y={116} width="46" height="54" rx="8" fill="currentColor" opacity="0.06" />
          <rect x={74 + i * 62} y={116} width="46" height="54" rx="8" stroke={line} strokeWidth={STROKE} opacity="0.32" />
          <path
            d={`M${74 + i * 62 + 16} 116h12l6 6v10`}
            stroke={line}
            strokeWidth={STROKE}
            opacity="0.3"
            strokeLinecap="round"
            fill="none"
          />
          <rect x={74 + i * 62 + 12} y={140} width="22" height="3" rx="1.5" fill={line} opacity="0.28" />
        </g>
      ))}

      {/* the clock: seven ticks, the one that has passed is ember */}
      <g transform="translate(246 44)">
        <circle r="26" stroke={line} strokeWidth={STROKE} opacity="0.28" />
        <g className="st-art-clock">
          {ticks.map((i) => {
            const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
            const x1 = Math.cos(a) * 18;
            const y1 = Math.sin(a) * 18;
            const x2 = Math.cos(a) * 23;
            const y2 = Math.sin(a) * 23;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={i === 0 ? '#f06413' : line}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={i === 0 ? 1 : 0.4}
              />
            );
          })}
        </g>
        <path d="M-6 0l4 4 8-9" stroke="#f06413" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </g>
    </Frame>
  );
}

export function StoryArt({ story, label }: { story: Story; label: string }) {
  if (story === 'pair') return <Pair label={label} />;
  if (story === 'send') return <Send label={label} />;
  return <Keep label={label} />;
}

export default StoryArt;
