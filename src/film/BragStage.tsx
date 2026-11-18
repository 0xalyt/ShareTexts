import React from 'react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';

/**
 * BragStage — the landing hero film, cut as a launch film.
 *
 * The first cut explained the mechanism: a code, a QR plate, a six-digit
 * handshake. True, and it read like a setup guide — the viewer learned how to
 * pair two devices and never learned why they should care.
 *
 * This cut is one photograph's journey. Beat 1 promises it, beat 2 says what
 * every other route costs, beat 3 is the moment it is simply *there*, beat 4
 * shows what else travels the same way, beat 5 is the one trust fact that
 * matters, beat 6 is the door. The code survives as one sentence in beat 3,
 * where it belongs: the mechanism is the price of entry, not the pitch.
 *
 * Built to the launch-film rules: the promise is legible at frame 0 (which is
 * also the poster), no shot holds two ideas, no shot shows a whole dashboard,
 * and nothing moves that is not the subject of its beat.
 *
 * Every frame is a pure function of t: `window.__film(t)` sets the clock and
 * the stage renders exactly that instant. Nothing animates on its own and no
 * CSS transition survives film.html's reset.
 */

export const BRAG_DURATION = 15.0;

const INK = '#0B0A09';
const CREAM = '#F2E9DE';
const MUTED = 'rgba(242,233,222,0.58)';
const DIM = 'rgba(242,233,222,0.32)';
const HAIR = 'rgba(242,233,222,0.12)';
const EMBER = '#f06413';
const CARD = '#141210';
const GREEN = '#34c759';

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (p: number) => p * p * (3 - 2 * p);
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const at = (t: number, start: number, dur: number) => smooth(clamp01((t - start) / dur));

const DISPLAY: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 700,
  letterSpacing: '-0.045em',
  lineHeight: 0.92,
  color: CREAM,
  fontVariationSettings: '"opsz" 32',
};

const LABEL: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 15,
  fontWeight: 600,
  letterSpacing: '0.22em',
  textTransform: 'uppercase',
  color: DIM,
};

/** Six beats: 2.7 · 2.7 · 2.7 · 2.7 · 2.4 · 1.8 */
const IN = [0.0, 2.7, 5.4, 8.1, 10.8, 13.2] as const;
const scene = (t: number, i: number) => t >= IN[i] && t < (IN[i + 1] ?? BRAG_DURATION);
/** The 1.6% push that keeps a held frame from reading as a slide. */
const drift = (t: number, t0: number, t1: number) => 1 + 0.016 * clamp01((t - t0) / (t1 - t0));

function Rise({
  p,
  y = 16,
  children,
  style,
}: {
  p: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * y}px)`, ...style }}>
      {children}
    </div>
  );
}

function Scene({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, opacity: on ? 1 : 0 }}>{children}</div>;
}

/* ── chrome: a mark, a URL, and one ember progress line ───────────────── */

function Chrome({ t }: { t: number }) {
  const progress = clamp01(t / BRAG_DURATION);
  return (
    <>
      <div style={{ position: 'absolute', left: 120, top: 62, display: 'flex', alignItems: 'center', gap: 12 }}>
        <ShareTextsLogo size={24} />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.015em',
            color: 'rgba(242,233,222,0.82)',
          }}
        >
          ShareTexts
        </span>
      </div>
      <div style={{ position: 'absolute', left: 120, bottom: 54 }}>
        <span style={{ ...LABEL, letterSpacing: '0.16em', color: 'rgba(242,233,222,0.42)' }}>
          sharetexts.online
        </span>
      </div>
      {/* The progress line is the only chrome that changes: it makes the cut
          read as one running film and gives the loop a visible clock. */}
      <div
        aria-hidden
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(242,233,222,0.07)' }}
      >
        <div style={{ width: `${progress * 100}%`, height: '100%', background: EMBER, opacity: 0.8 }} />
      </div>
    </>
  );
}

/* ── device art ───────────────────────────────────────────────────────── */

function Laptop({
  x,
  y,
  w,
  h,
  children,
  glow,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: React.ReactNode;
  glow?: number;
}) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w }}>
      {glow ? (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: -w * 0.14,
            top: -h * 0.16,
            width: w * 1.28,
            height: h * 1.4,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(240,100,19,0.16), rgba(240,100,19,0) 70%)',
            filter: 'blur(14px)',
            opacity: glow,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'relative',
          width: w,
          height: h,
          borderRadius: 16,
          border: '1.5px solid rgba(242,233,222,0.20)',
          background: '#0c0b09',
          padding: 11,
          boxShadow: '0 70px 120px -60px rgba(0,0,0,0.95)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#070706',
            border: '1px solid rgba(242,233,222,0.07)',
            position: 'relative',
          }}
        >
          {children}
        </div>
      </div>
      <div
        style={{
          marginTop: 9,
          marginLeft: -w * 0.035,
          width: w * 1.07,
          height: 13,
          borderRadius: '0 0 14px 14px',
          background: 'linear-gradient(180deg, rgba(242,233,222,0.16), rgba(242,233,222,0.04))',
        }}
      />
    </div>
  );
}

function Phone({ x, y, w, h, children }: { x: number; y: number; w: number; h: number; children?: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 30,
        border: '1.5px solid rgba(242,233,222,0.24)',
        background: '#0c0b09',
        padding: 10,
        boxShadow: '0 60px 110px -50px rgba(0,0,0,0.95)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 21,
          overflow: 'hidden',
          background: '#080807',
          border: '1px solid rgba(242,233,222,0.07)',
        }}
      >
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: 7,
            transform: 'translateX(-50%)',
            width: w * 0.28,
            height: 5,
            borderRadius: 3,
            background: 'rgba(242,233,222,0.18)',
            zIndex: 3,
          }}
        />
        {children}
      </div>
    </div>
  );
}

function Photo({ width, height, radius = 14 }: { width: number; height: number; radius?: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        background: '#1a1713',
        border: '1px solid rgba(242,233,222,0.16)',
        boxShadow: '0 40px 80px -30px rgba(0,0,0,0.9)',
      }}
    >
      <img
        src="/demo/photo-4x3.jpg"
        alt=""
        style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  );
}

/* ── 01 · the promise (frame 0 is the poster) ─────────────────────────── */

function Hook({ t }: { t: number }) {
  // The photograph leaves the phone and crosses to the laptop. It is the same
  // card that lands in beat 3, so the film has one object instead of six demos.
  const p = easeOut(clamp01((t - 0.45) / 1.85));
  const from = { x: 1772, y: 512 };
  const to = { x: 1382, y: 470 };
  const cx = 1600;
  const cy = 372;
  const bez = (u: number) => {
    const v = 1 - u;
    return {
      x: v * v * from.x + 2 * v * u * cx + u * u * to.x,
      y: v * v * from.y + 2 * v * u * cy + u * u * to.y,
    };
  };
  const pos = bez(p);
  const visible = t >= 0.45 ? 1 : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 0, 2.7)})`, transformOrigin: '44% 52%' }}>
      <div style={{ position: 'absolute', left: 120, top: 286, width: 880 }}>
        <div style={{ ...LABEL, color: EMBER, letterSpacing: '0.2em', marginBottom: 28 }}>
          No account · no app · no install
        </div>
        <div style={{ ...DISPLAY, fontSize: 148 }}>
          <div>Phone to</div>
          <div>laptop.</div>
        </div>
        <div
          style={{
            marginTop: 34,
            fontFamily: 'var(--font-sans)',
            fontSize: 40,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'rgba(242,233,222,0.72)',
          }}
        >
          Nothing in between.
        </div>
      </div>

      {/* the two devices, drawn once, reused as the film's cast */}
      <Laptop x={1076} y={316} w={540} h={344} glow={0.9}>
        {/* An empty screen with a landing outline: no label, because a label
            here would be read at the same moment as the headline. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '18%',
            top: '26%',
            width: '64%',
            height: '48%',
            borderRadius: 10,
            border: '1px dashed rgba(242,233,222,0.10)',
            background: 'rgba(242,233,222,0.012)',
          }}
        />
      </Laptop>

      <Phone x={1672} y={366} w={164} h={316}>
        <div style={{ position: 'absolute', inset: 0, padding: 12, paddingTop: 24 }}>
          <Photo width={120} height={90} radius={9} />
          <div style={{ marginTop: 10, height: 7, width: 96, borderRadius: 4, background: 'rgba(242,233,222,0.16)' }} />
          <div style={{ marginTop: 7, height: 7, width: 62, borderRadius: 4, background: 'rgba(242,233,222,0.09)' }} />
        </div>
      </Phone>

      {/* the flight */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 1580,
          top: 604,
          width: 26,
          height: 26,
          marginLeft: -13,
          marginTop: -13,
          borderRadius: 13,
          background: EMBER,
          opacity: 0.22 * visible * (1 - p),
          filter: 'blur(6px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: pos.x,
          top: pos.y,
          transform: `translate(-50%,-50%) rotate(${-7 * (1 - p)}deg) scale(${0.52 + 0.48 * p})`,
          opacity: visible,
        }}
      >
        <Photo width={196} height={147} radius={12} />
      </div>
    </div>
  );
}

/* ── 02 · what every other route costs ────────────────────────────────── */

const OLD_WAYS = [
  { label: 'Email yourself', note: 'a draft sits in the middle', glyph: 'mail' },
  { label: 'Upload to a drive', note: 'the file waits on a server', glyph: 'cloud' },
  { label: 'Send it in a chat', note: 'the photo arrives compressed', glyph: 'chat' },
] as const;

function Glyph({ kind }: { kind: (typeof OLD_WAYS)[number]['glyph'] }) {
  const common = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'rgba(242,233,222,0.52)', strokeWidth: 1.5 } as const;
  if (kind === 'mail') {
    return (
      <svg {...common}>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
        <path d="m3.5 6.5 8.5 6 8.5-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === 'cloud') {
    return (
      <svg {...common}>
        <path d="M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.2 9.2 3.9 3.9 0 0 0 7 18Z" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 11.5v5m0-5-2 2m2-2 2 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M20.5 4.5 10 15M20.5 4.5l-6.2 16-4.3-5.5L4 10.7l16.5-6.2Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyScene({ t }: { t: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 2.7, 5.4)})`, transformOrigin: '50% 50%' }}>
      <Rise p={at(t, 2.78, 0.4)} y={20} style={{ position: 'absolute', left: 120, top: 176, width: 1100 }}>
        <div style={{ ...DISPLAY, fontSize: 116 }}>
          <div>Everything else</div>
          <div style={{ color: 'rgba(242,233,222,0.88)' }}>makes a copy.</div>
        </div>
      </Rise>

      <div style={{ position: 'absolute', left: 120, top: 512, width: 1380 }}>
        {OLD_WAYS.map((row, i) => {
          const p = at(t, 3.02 + i * 0.24, 0.34);
          const strike = at(t, 3.34 + i * 0.24, 0.42);
          return (
            <div
              key={row.label}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 26,
                height: 118,
                borderTop: `1px solid ${HAIR}`,
                opacity: p,
                transform: `translateY(${(1 - p) * 14}px)`,
              }}
            >
              <Glyph kind={row.glyph} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-sans)',
                    fontSize: 38,
                    fontWeight: 600,
                    letterSpacing: '-0.015em',
                    color: strike > 0 ? 'rgba(242,233,222,0.42)' : 'rgba(242,233,222,0.92)',
                  }}
                >
                  {row.label}
                </div>
                <div style={{ marginTop: 5, fontFamily: 'var(--font-sans)', fontSize: 21, color: 'rgba(242,233,222,0.34)' }}>
                  {row.note}
                </div>
              </div>
              {/* the strike: drawn, not faded, so the beat lands as an edit */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 54,
                  top: 48,
                  height: 2,
                  // Only the label is struck: a line the width of the row read
                  // as a section divider instead of a refusal.
                  width: `${strike * 470}px`,
                  background: 'rgba(240,100,19,0.5)',
                }}
              />
            </div>
          );
        })}
      </div>

      <Rise p={at(t, 4.28, 0.42)} y={14} style={{ position: 'absolute', left: 120, top: 902 }}>
        <div style={{ fontFamily: 'var(--font-sans)', fontSize: 42, fontWeight: 600, letterSpacing: '-0.02em', color: EMBER }}>
          ShareTexts doesn’t.
        </div>
      </Rise>
    </div>
  );
}

/* ── 03 · the moment (the film's peak) ────────────────────────────────── */

function Arrival({ t }: { t: number }) {
  const land = easeOut(clamp01((t - 5.58) / 0.62));
  const sweep = clamp01((t - 6.05) / 0.85);
  const saved = t >= 6.5;
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 5.4, 8.1)})`, transformOrigin: '54% 50%' }}>
      <div style={{ position: 'absolute', left: 120, top: 250, width: 700 }}>
        <Rise p={at(t, 5.5, 0.4)} y={18}>
          <div style={{ ...DISPLAY, fontSize: 120 }}>
            <div>It’s already</div>
            <div style={{ color: EMBER }}>there.</div>
          </div>
          <div
            style={{
              marginTop: 30,
              fontFamily: 'var(--font-sans)',
              fontSize: 28,
              lineHeight: 1.5,
              color: MUTED,
              maxWidth: 560,
            }}
          >
            One code on each device. That’s the whole setup.
          </div>
          <div
            style={{
              marginTop: 26,
              fontFamily: 'var(--font-sans)',
              fontSize: 24,
              color: 'rgba(242,233,222,0.38)',
            }}
          >
            No email to yourself. No sync to wait for.
          </div>
        </Rise>
      </div>

      <Laptop x={900} y={236} w={860} h={548} glow={0.55}>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: land,
            transform: `scale(${1.05 - 0.05 * land})`,
          }}
        >
          <img
            src="/demo/photo-4x3.jpg"
            alt=""
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {/* the light that arrives with it */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(105deg, rgba(255,255,255,0) ${Math.max(0, sweep * 120 - 40)}%, rgba(255,255,255,${0.14 * (1 - sweep)}) ${sweep * 120}%, rgba(255,255,255,0) ${sweep * 120 + 30}%)`,
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            right: 18,
            bottom: 18,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 999,
            background: 'rgba(8,8,7,0.72)',
            border: '1px solid rgba(242,233,222,0.14)',
            opacity: saved ? 1 : 0,
            transform: `translateY(${saved ? 0 : 6}px)`,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: 4, background: GREEN }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 15, fontWeight: 600, color: 'rgba(242,233,222,0.86)' }}>
            Saved on this device
          </span>
        </div>
      </Laptop>
    </div>
  );
}

/* ── 04 · what travels the same way ───────────────────────────────────── */

const PAYLOADS = [
  { kind: 'text' as const, title: 'Kitchen is 2481 — see you at 7', meta: 'Text' },
  { kind: 'link' as const, title: 'sharetexts.online/guides', meta: 'Link' },
  { kind: 'file' as const, title: 'Q3-budget.pdf', meta: '24.3 MB' },
];

function PayloadCard({ item, t, index }: { item: (typeof PAYLOADS)[number]; t: number; index: number; key?: React.Key }) {
  const p = at(t, 8.3 + index * 0.19, 0.4);
  const progress = index === 2 ? easeOut(clamp01((t - 8.95) / 0.75)) : 1;
  // Green at the same instant the bar fills: a card that reads 100% in orange
  // for a beat looks like it stalled one frame from done.
  const done = index !== 2 || progress >= 0.995;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        width: 760,
        padding: '22px 26px',
        borderRadius: 20,
        background: CARD,
        border: `1px solid ${index === 0 ? 'rgba(240,100,19,0.32)' : 'rgba(242,233,222,0.10)'}`,
        boxShadow: '0 40px 80px -40px rgba(0,0,0,0.9)',
        opacity: p,
        transform: `translateX(${(1 - p) * 40}px)`,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 14,
          background: index === 0 ? 'rgba(240,100,19,0.16)' : 'rgba(242,233,222,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {item.kind === 'text' && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={EMBER} strokeWidth="1.6">
            <path d="M4 6h16M4 12h11M4 18h7" strokeLinecap="round" />
          </svg>
        )}
        {item.kind === 'link' && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(242,233,222,0.62)" strokeWidth="1.6">
            <path d="M10 14 14 10M9.5 7.5l1.6-1.6a3.7 3.7 0 0 1 5.2 5.2l-1.6 1.6M14.5 16.5l-1.6 1.6a3.7 3.7 0 0 1-5.2-5.2l1.6-1.6" strokeLinecap="round" />
          </svg>
        )}
        {item.kind === 'file' && (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(242,233,222,0.62)" strokeWidth="1.6">
            <path d="M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9l-6-6Z" strokeLinejoin="round" />
            <path d="M13 3v6h6" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 27,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: 'rgba(242,233,222,0.94)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title}
        </div>
        <div style={{ marginTop: 6, fontFamily: 'var(--font-sans)', fontSize: 17, color: 'rgba(242,233,222,0.38)' }}>
          {item.meta}
        </div>
      </div>

      {index === 2 ? (
        <div style={{ width: 150, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 18,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color: done ? GREEN : 'rgba(242,233,222,0.6)',
            }}
          >
            {done ? 'Saved' : `${Math.round(progress * 100)}%`}
          </span>
          <div style={{ width: '100%', height: 5, borderRadius: 3, background: 'rgba(242,233,222,0.10)' }}>
            <div style={{ width: `${progress * 100}%`, height: '100%', borderRadius: 3, background: done ? GREEN : EMBER }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Anything({ t }: { t: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 8.1, 10.8)})`, transformOrigin: '50% 50%' }}>
      <Rise p={at(t, 8.18, 0.4)} y={18} style={{ position: 'absolute', left: 120, top: 226, width: 760 }}>
        <div style={{ ...DISPLAY, fontSize: 112 }}>
          <div>Text. Links.</div>
          <div>Photos. Files.</div>
        </div>
        <div
          style={{
            marginTop: 30,
            fontFamily: 'var(--font-sans)',
            fontSize: 27,
            lineHeight: 1.5,
            color: MUTED,
            maxWidth: 660,
            // One line, so "re-uploaded" can never hyphenate across two.
            textWrap: 'pretty',
          }}
        >
          Sent as they are. Nothing compressed.
        </div>
      </Rise>

      <div style={{ position: 'absolute', left: 986, top: 286, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {PAYLOADS.map((item, i) => (
          <PayloadCard key={item.title} item={item} t={t} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ── 05 · the one trust fact ──────────────────────────────────────────── */

function Private({ t }: { t: number }) {
  const bracket = at(t, 11.5, 0.45);
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 10.8, 13.2)})`, transformOrigin: '50% 46%' }}>
      <Rise p={at(t, 10.88, 0.42)} y={18} style={{ position: 'absolute', left: 120, top: 214, width: 1180 }}>
        <div style={{ ...DISPLAY, fontSize: 132 }}>
          <div>Encrypted</div>
          <div style={{ color: EMBER }}>end to end.</div>
        </div>
        <div style={{ marginTop: 32, fontFamily: 'var(--font-sans)', fontSize: 30, lineHeight: 1.5, color: MUTED, maxWidth: 900 }}>
          The key is made on your devices. It never reaches the server.
        </div>
      </Rise>

      {/* One object on the right so the frame is a composition, not a column
          of text against a void: the lock the sentence is about. */}
      <Rise p={at(t, 10.95, 0.5)} y={12} style={{ position: 'absolute', right: 150, top: 264, width: 430, textAlign: 'center' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: '50%',
            top: 150,
            width: 520,
            height: 520,
            marginLeft: -260,
            marginTop: -260,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(240,100,19,0.12), rgba(240,100,19,0) 68%)',
            filter: 'blur(16px)',
          }}
        />
        <svg width={214} height={252} viewBox="0 0 214 252" fill="none" style={{ position: 'relative' }}>
          <rect x={18} y={104} width={178} height={132} rx={26} stroke="rgba(242,233,222,0.26)" strokeWidth={3} />
          <path d="M58 104V78a49 49 0 0 1 98 0v26" stroke="rgba(242,233,222,0.26)" strokeWidth={3} strokeLinecap="round" />
          <circle cx={107} cy={164} r={15} stroke={EMBER} strokeWidth={3} />
          <path d="M107 179v30" stroke={EMBER} strokeWidth={3} strokeLinecap="round" />
        </svg>
        <div
          style={{
            position: 'relative',
            marginTop: 26,
            fontFamily: 'var(--font-sans)',
            fontSize: 20,
            lineHeight: 1.45,
            color: 'rgba(242,233,222,0.38)',
          }}
        >
          only your two devices hold the key
        </div>
      </Rise>

      <Rise p={at(t, 11.12, 0.4)} y={14} style={{ position: 'absolute', left: 120, top: 704 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              padding: '24px 34px',
              borderRadius: 18,
              background: CARD,
              border: `1px solid ${HAIR}`,
              fontFamily: 'var(--font-sans)',
              fontSize: 32,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="22" height="26" viewBox="0 0 22 26" fill="none" stroke="rgba(242,233,222,0.5)" strokeWidth="1.6">
              <rect x="2" y="11" width="18" height="13" rx="3" />
              <path d="M6 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ color: 'rgba(242,233,222,0.86)' }}>sharetexts.online/space/6b1c</span>
            <span style={{ color: EMBER, borderBottom: `2px dashed rgba(240,100,19,${0.5 * bracket})`, paddingBottom: 4 }}>
              #k=9f2a…
            </span>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-sans)',
              fontSize: 21,
              color: 'rgba(240,100,19,0.82)',
              opacity: bracket,
            }}
          >
            the fragment never leaves the browser
          </span>
        </div>
      </Rise>
    </div>
  );
}

/* ── 06 · the door ────────────────────────────────────────────────────── */

function Outro({ t }: { t: number }) {
  const p = at(t, 13.28, 0.45);
  const q = at(t, 13.55, 0.4);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${drift(t, 13.2, 15)})`,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          width: 940,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(240,100,19,0.16), rgba(240,100,19,0) 68%)',
          filter: 'blur(20px)',
          opacity: p,
        }}
      />
      <Rise p={p} y={14} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, marginBottom: 40 }}>
        <ShareTextsLogo size={62} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 38, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM }}>
          ShareTexts
        </span>
      </Rise>
      <Rise p={p} y={16} style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ ...DISPLAY, fontSize: 92 }}>Move anything between</div>
        <div style={{ ...DISPLAY, fontSize: 92, color: 'rgba(242,233,222,0.9)' }}>your devices.</div>
      </Rise>
      <Rise p={q} y={10} style={{ position: 'relative', marginTop: 44, display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 32, fontWeight: 600, color: CREAM }}>sharetexts.online</span>
        <span style={{ width: 1, height: 24, background: 'rgba(242,233,222,0.18)' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 24, color: 'rgba(242,233,222,0.46)' }}>Free. No account.</span>
      </Rise>
    </div>
  );
}

/* ── the film ─────────────────────────────────────────────────────────── */

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export function BragStage() {
  const [t, setT] = React.useState(0);

  React.useEffect(() => {
    const film = (time: number) => {
      setT(time);
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    };
    (window as unknown as { __film: (time: number) => Promise<void> }).__film = film;
  }, []);

  /* `?play=1` plays the cut in a browser. The rig never passes it: there the
     clock is driven frame by frame and must stay a pure function of t. */
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get('play') !== '1') return;
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setT(((performance.now() - start) / 1000) % BRAG_DURATION);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      id="brag-stage"
      data-t={t.toFixed(2)}
      style={{
        position: 'relative',
        width: 1920,
        height: 1080,
        overflow: 'hidden',
        background: INK,
        color: CREAM,
      }}
    >
      {/* the room the film sits in: one warm key, one cold fall-off */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(56% 50% at 10% 94%, rgba(240,100,19,0.16), rgba(240,100,19,0) 70%),'
            + ' radial-gradient(44% 42% at 94% 6%, rgba(255,214,170,0.05), rgba(255,214,170,0) 70%)',
        }}
      />

      <Chrome t={t} />

      <Scene on={scene(t, 0)}><Hook t={t} /></Scene>
      <Scene on={scene(t, 1)}><CopyScene t={t} /></Scene>
      <Scene on={scene(t, 2)}><Arrival t={t} /></Scene>
      <Scene on={scene(t, 3)}><Anything t={t} /></Scene>
      <Scene on={scene(t, 4)}><Private t={t} /></Scene>
      <Scene on={scene(t, 5)}><Outro t={t} /></Scene>

      {/* grain + vignette: the same two passes on every frame, so cuts do not flash */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: GRAIN, opacity: 0.055, mixBlendMode: 'overlay' }} />
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(120% 100% at 50% 50%, rgba(0,0,0,0) 52%, rgba(0,0,0,0.55) 100%)',
        }}
      />
    </div>
  );
}

export default BragStage;
