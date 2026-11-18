import React from 'react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { QrArt } from '../components/qr/QrArt';

/**
 * BragStage — the landing hero film, re-cut as a launch film.
 *
 * Six frames, fifteen seconds, one argument: the shortest distance between two
 * devices is not a cloud. It is built the way the /brag run plans it — a hook
 * that is fully settled at frame 0 (the hero is muted and loops, so frame 0 is
 * also the poster), then four receipts, then the lockup.
 *
 * Every frame is a pure function of t: `window.__film(t)` sets the clock and the
 * stage renders exactly that instant. Nothing animates on its own, no CSS
 * transitions survive film.html's reset, and the camera moves are 1–3% pushes
 * rather than anything that would call attention to itself.
 *
 * The surfaces are the product's own: Allo and Inter, #f06413, the real QR
 * component, the real room-code format, the real fragment-key URL. The film
 * never draws a dashboard whole — each scene crops to the one object that
 * carries its beat.
 */

export const BRAG_DURATION = 15.0;

const INK = '#0B0A09';
const CREAM = '#F2E9DE';
const MUTED = 'rgba(242,233,222,0.52)';
const DIM = 'rgba(242,233,222,0.30)';
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
  lineHeight: 0.96,
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

const CHAPTERS = [
  { t0: 0.0, t1: 2.6, n: '01', name: 'The promise' },
  { t0: 2.6, t1: 5.2, n: '02', name: 'The link' },
  { t0: 5.2, t1: 7.8, n: '03', name: 'The send' },
  { t0: 7.8, t1: 10.4, n: '04', name: 'The file' },
  { t0: 10.4, t1: 12.8, n: '05', name: 'The key' },
  { t0: 12.8, t1: 15.1, n: '06', name: 'Your turn' },
];

const IN = [0.0, 2.6, 5.2, 7.8, 10.4, 12.8] as const;
const scene = (t: number, i: number) => t >= IN[i] && t < (IN[i + 1] ?? BRAG_DURATION);
/** The 1–3% push that keeps a held frame from looking like a slide. */
const drift = (t: number, t0: number, t1: number) => 1 + 0.022 * clamp01((t - t0) / (t1 - t0));

function Rise({
  p,
  y = 18,
  children,
  style,
}: {
  p: number;
  y?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * y}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Scene({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <div style={{ position: 'absolute', inset: 0, opacity: on ? 1 : 0 }}>{children}</div>;
}

/* ── frame chrome ─────────────────────────────────────────────────────── */

function Chrome({ t }: { t: number }) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 120,
          top: 66,
          display: 'flex',
          alignItems: 'center',
          gap: 13,
        }}
      >
        <ShareTextsLogo size={26} />
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: CREAM,
          }}
        >
          ShareTexts
        </span>
      </div>
      <div style={{ position: 'absolute', right: 120, top: 72, display: 'flex', gap: 14, alignItems: 'baseline' }}>
        {CHAPTERS.map((c, i) => {
          const on = t >= c.t0 && t < c.t1;
          return (
            <span
              key={c.n}
              style={{
                ...LABEL,
                fontSize: 14,
                color: on ? 'rgba(242,233,222,0.72)' : 'rgba(242,233,222,0.20)',
                transition: 'none',
              }}
            >
              <span style={{ color: on ? EMBER : 'rgba(242,233,222,0.20)' }}>{c.n}</span>
              <span style={{ marginLeft: 8 }}>{c.name}</span>
            </span>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 120,
          right: 120,
          bottom: 58,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          borderTop: '1px solid rgba(242,233,222,0.10)',
          paddingTop: 20,
        }}
      >
        <span style={{ ...LABEL, letterSpacing: '0.14em', color: 'rgba(242,233,222,0.46)' }}>
          sharetexts.online
        </span>
        <span style={{ ...LABEL, letterSpacing: '0.16em' }}>
          A file transfer with nothing in the middle
        </span>
      </div>
    </>
  );
}

/* ── 01 · the hook ────────────────────────────────────────────────────── */

function Wire({ t }: { t: number }) {
  const p = clamp01((t - 0.35) / 1.8);
  const e = smooth(p);
  // cubic between the laptop's edge and the phone
  const a = { x: 424, y: 236 };
  const b = { x: 452, y: 236 };
  const c = { x: 468, y: 224 };
  const d = { x: 486, y: 228 };
  const bez = (u: number) => {
    const v = 1 - u;
    return {
      x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x,
      y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y,
    };
  };
  const dot = bez(e);
  const glow = Math.sin(Math.PI * p) * 0.9 + 0.1;

  return (
    <svg width={700} height={470} viewBox="0 0 700 470" fill="none" style={{ overflow: 'visible' }}>
      {/* laptop */}
      <rect x={40} y={96} width={384} height={240} rx={14} stroke="rgba(242,233,222,0.26)" strokeWidth={2} />
      <rect x={58} y={114} width={348} height={204} rx={8} stroke="rgba(242,233,222,0.10)" strokeWidth={1.5} />
      <path d="M18 352 H446" stroke="rgba(242,233,222,0.26)" strokeWidth={2} strokeLinecap="round" />
      {/* the room, cropped: one code plate inside the laptop, no dashboard */}
      <rect x={206} y={168} width={164} height={96} rx={10} fill="rgba(240,100,19,0.10)" stroke="rgba(240,100,19,0.38)" />
      <text
        x={288}
        y={207}
        textAnchor="middle"
        fill="rgba(242,233,222,0.85)"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 700, letterSpacing: '0.14em' }}
      >
        482 916
      </text>
      <text
        x={288}
        y={234}
        textAnchor="middle"
        fill="rgba(242,233,222,0.38)"
        style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.16em' }}
      >
        ROOM CODE
      </text>
      {/* phone */}
      <rect x={488} y={110} width={112} height={224} rx={24} stroke="rgba(242,233,222,0.30)" strokeWidth={2} />
      <rect x={500} y={126} width={88} height={192} rx={14} stroke="rgba(242,233,222,0.12)" strokeWidth={1.5} />
      <rect x={528} y={120} width={32} height={5} rx={2.5} fill="rgba(242,233,222,0.22)" />
      {/* a received bubble on the phone */}
      <rect x={510} y={196} width={68} height={30} rx={9} fill="rgba(240,100,19,0.16)" stroke="rgba(240,100,19,0.45)" />
      <path d="M518 211 H570" stroke="rgba(242,233,222,0.55)" strokeWidth={3} strokeLinecap="round" />
      <path d="M518 219 H556" stroke="rgba(242,233,222,0.32)" strokeWidth={3} strokeLinecap="round" />
      {/* the wire */}
      <path d="M424 236 H486" stroke="rgba(242,233,222,0.16)" strokeWidth={2} strokeDasharray="4 7" />
      <circle cx={dot.x} cy={dot.y} r={16} fill={EMBER} opacity={0.16 * glow} />
      <circle cx={dot.x} cy={dot.y} r={6.5} fill={EMBER} />
      <circle cx={dot.x} cy={dot.y} r={2.4} fill="#ffe6cf" />
      <text x={40} y={394} fill="rgba(242,233,222,0.30)" style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.2em' }}>
        THIS DEVICE
      </text>
      <text x={470} y={394} fill="rgba(242,233,222,0.30)" style={{ fontFamily: 'var(--font-sans)', fontSize: 12, fontWeight: 600, letterSpacing: '0.2em' }}>
        THAT DEVICE
      </text>
    </svg>
  );
}

function Hook({ t }: { t: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 0, 2.6)})`, transformOrigin: '50% 45%' }}>
      <div style={{ position: 'absolute', left: 120, top: 300, width: 1060 }}>
        <div style={{ ...LABEL, color: EMBER, marginBottom: 30 }}>No account · no app · no install</div>
        <div style={{ ...DISPLAY, fontSize: 126 }}>
          <div>Send it straight</div>
          <div style={{ color: 'rgba(242,233,222,0.92)' }}>to your other</div>
          <div style={{ color: EMBER }}>device.</div>
        </div>
        <div
          style={{
            marginTop: 34,
            width: 168,
            height: 4,
            borderRadius: 2,
            background: EMBER,
            opacity: 0.85,
          }}
        />
      </div>
      <div style={{ position: 'absolute', left: 1062, top: 288, transform: 'scale(1.1)', transformOrigin: '50% 50%' }}>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 40,
            top: 60,
            width: 600,
            height: 360,
            borderRadius: '50%',
            background: 'radial-gradient(ellipse at center, rgba(240,100,19,0.13), rgba(240,100,19,0) 68%)',
            filter: 'blur(12px)',
          }}
        />
        <Wire t={t} />
      </div>
    </div>
  );
}

/* ── 02 · the link ────────────────────────────────────────────────────── */

const CODE = ['4', '8', '2', '9', '1', '6'];

function Code({ t }: { t: number }) {
  return (
    <div style={{ display: 'flex', gap: 34, alignItems: 'center' }}>
      {[0, 3].map((start) => (
        <div key={start} style={{ display: 'flex', gap: 12 }}>
          {CODE.slice(start, start + 3).map((d, k) => {
            const i = start + k;
            const lit = t >= 3.12 + i * 0.13;
            const next = !lit && t >= 3.12 + (i - 1) * 0.13 && i > 0;
            return (
              <div
                key={i}
                style={{
                  width: 104,
                  height: 138,
                  borderRadius: 14,
                  background: lit ? 'rgba(242,233,222,0.055)' : 'rgba(242,233,222,0.02)',
                  border: `1px solid ${next ? 'rgba(240,100,19,0.55)' : lit ? 'rgba(242,233,222,0.18)' : 'rgba(242,233,222,0.07)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: next ? '0 0 26px rgba(240,100,19,0.18)' : 'none',
                }}
              >
                <span
                  style={{
                    ...DISPLAY,
                    fontSize: 66,
                    letterSpacing: '-0.02em',
                    color: lit ? CREAM : 'rgba(242,233,222,0.10)',
                  }}
                >
                  {d}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Link({ t }: { t: number }) {
  const p = at(t, 2.7, 0.4);
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 2.6, 5.2)})`, transformOrigin: '44% 48%' }}>
      <div style={{ position: 'absolute', left: 120, top: 216, width: 800 }}>
        <Rise p={p} y={22}>
          <div style={{ ...DISPLAY, fontSize: 104 }}>
            <div>One code.</div>
            <div style={{ color: EMBER }}>Two devices.</div>
          </div>
          <p
            style={{
              marginTop: 34,
              fontFamily: 'var(--font-sans)',
              fontSize: 27,
              lineHeight: 1.45,
              color: MUTED,
              maxWidth: 560,
            }}
          >
            Open it on both. Scan the plate, or type six digits.
          </p>
        </Rise>
        <Rise p={at(t, 2.78, 0.35)} y={16} style={{ marginTop: 62 }}>
          <Code t={t} />
        </Rise>
        <Rise p={at(t, 3.05, 0.4)} y={10} style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: GREEN }} />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 19, fontWeight: 500, color: 'rgba(242,233,222,0.40)' }}>
            iPhone · typing…
          </span>
        </Rise>
      </div>

      <div
        style={{
          position: 'absolute',
          right: 132,
          top: 196,
          width: 430,
          height: 430,
          borderRadius: 30,
          background: '#f7f2e8',
          boxShadow: '0 60px 120px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `rotate(${-1.6 + 0.6 * at(t, 2.6, 2.6)}deg) scale(${1 + 0.012 * at(t, 2.6, 2.6)})`,
        }}
      >
        <QrArt value="https://sharetexts.online/r/482916" size={336} label="Room QR code" />
      </div>
    </div>
  );
}

/* ── 03 · the send ────────────────────────────────────────────────────── */

function Bubble({
  p,
  children,
  align = 'right',
}: {
  p: number;
  children: React.ReactNode;
  align?: 'right' | 'left';
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        opacity: p,
        transform: `translateY(${(1 - p) * 18}px) scale(${0.985 + 0.015 * p})`,
        marginTop: 14,
      }}
    >
      {children}
    </div>
  );
}

function Thread({ t }: { t: number }) {
  return (
    <div
      style={{
        width: 800,
        height: 560,
        borderRadius: 28,
        background: CARD,
        border: '1px solid rgba(242,233,222,0.10)',
        boxShadow: '0 70px 130px -60px rgba(0,0,0,0.9)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: 46,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 26px',
          borderBottom: '1px solid rgba(242,233,222,0.08)',
          background: 'rgba(242,233,222,0.02)',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 9, background: '#ff5f57' }} />
        <span style={{ width: 9, height: 9, borderRadius: 9, background: '#febc2e' }} />
        <span style={{ width: 9, height: 9, borderRadius: 9, background: '#28c840' }} />
        <span style={{ marginLeft: 14, ...LABEL, fontSize: 11, letterSpacing: '0.2em', color: 'rgba(242,233,222,0.28)' }}>
          Room · 482 916
        </span>
      </div>

      <div
        style={{
          height: 62,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 26px',
          borderBottom: '1px solid rgba(242,233,222,0.07)',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: 9, background: GREEN, boxShadow: '0 0 12px rgba(52,199,89,0.7)' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 600, color: 'rgba(242,233,222,0.80)' }}>
          MacBook Pro ⇄ iPhone
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 600, color: GREEN }}>Direct</span>
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-sans)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.06em',
            color: 'rgba(242,233,222,0.45)',
            border: '1px solid rgba(242,233,222,0.14)',
            borderRadius: 999,
            padding: '5px 10px',
          }}
        >
          ENCRYPTED
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '10px 30px 22px' }}>
        <div
          style={{
            alignSelf: 'center',
            marginBottom: 8,
            fontFamily: 'var(--font-sans)',
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: '0.12em',
            color: 'rgba(242,233,222,0.26)',
            opacity: at(t, 5.2, 0.3),
          }}
        >
          TODAY · BOTH DEVICES
        </div>
        <Bubble p={at(t, 5.44, 0.32)}>
          <div
            style={{
              maxWidth: 470,
              background: EMBER,
              color: '#fff',
              fontFamily: 'var(--font-sans)',
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.28,
              padding: '16px 22px',
              borderRadius: 20,
              borderBottomRightRadius: 7,
              boxShadow: '0 22px 44px -20px rgba(240,100,19,0.7)',
            }}
          >
            Kitchen is 2481 — see you at 7
          </div>
        </Bubble>

        <Bubble p={at(t, 5.82, 0.32)}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              background: 'rgba(242,233,222,0.07)',
              border: '1px solid rgba(242,233,222,0.12)',
              borderRadius: 20,
              borderBottomRightRadius: 7,
              padding: '14px 20px',
              maxWidth: 470,
            }}
          >
            <span
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(240,100,19,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke={EMBER} strokeWidth="1.7">
                <path d="M6.4 9.6 9.6 6.4M6.9 4.1l1.3-1.3a2.9 2.9 0 0 1 4.1 4.1l-1.3 1.3M9.1 11.9l-1.3 1.3a2.9 2.9 0 0 1-4.1-4.1l1.3-1.3" strokeLinecap="round" />
              </svg>
            </span>
            <span>
              <span style={{ display: 'block', fontFamily: 'var(--font-sans)', fontSize: 26, fontWeight: 600, color: CREAM }}>
                sharetexts.online
              </span>
              <span style={{ display: 'block', marginTop: 3, fontFamily: 'var(--font-sans)', fontSize: 17, color: 'rgba(242,233,222,0.42)' }}>
                Temporary Spaces guide
              </span>
            </span>
          </div>
        </Bubble>

        <Bubble p={at(t, 6.20, 0.32)}>
          <div
            style={{
              borderRadius: 20,
              borderBottomRightRadius: 7,
              overflow: 'hidden',
              border: '1px solid rgba(242,233,222,0.14)',
              boxShadow: '0 24px 44px -24px rgba(0,0,0,0.9)',
            }}
          >
            <img src="/demo/photo-4x3.jpg" alt="" style={{ display: 'block', width: 342, height: 256, objectFit: 'cover' }} />
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '9px 14px',
                background: 'rgba(20,18,16,0.96)',
                fontFamily: 'var(--font-sans)',
                fontSize: 15,
                color: 'rgba(242,233,222,0.55)',
              }}
            >
              <span>IMG_2481.HEIC</span>
              <span>3.8 MB</span>
            </div>
          </div>
        </Bubble>
      </div>

      <div style={{ padding: '0 26px 22px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'rgba(242,233,222,0.055)',
            border: '1px solid rgba(242,233,222,0.08)',
            borderRadius: 999,
            padding: '10px 10px 10px 22px',
          }}
        >
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 18, color: 'rgba(242,233,222,0.32)', flex: 1 }}>
            Message, link, or drop a file…
          </span>
          <span
            style={{
              width: 42,
              height: 42,
              borderRadius: 42,
              background: EMBER,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 0 ${18 + 14 * Math.sin(Math.PI * clamp01((t - 5.3) / 2.4))}px rgba(240,100,19,0.55)`,
            }}
          >
            <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="1.8">
              <path d="M14 2 7 9M14 2l-4.4 12-2.6-5-5-2.6L14 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

function Send({ t }: { t: number }) {
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 5.2, 7.8)})`, transformOrigin: '60% 50%' }}>
      <div style={{ position: 'absolute', left: 120, top: 214, width: 720 }}>
        <Rise p={at(t, 5.2, 0.4)} y={20}>
          <div style={{ ...DISPLAY, fontSize: 104 }}>Send anything.</div>
          <p
            style={{
              marginTop: 32,
              fontFamily: 'var(--font-sans)',
              fontSize: 27,
              lineHeight: 1.5,
              color: MUTED,
              maxWidth: 470,
            }}
          >
            Text. A link. A photo. They land on the other device, in order, still encrypted.
          </p>
        </Rise>
      </div>
      <div style={{ position: 'absolute', right: 120, top: 232 }}>
        <Thread t={t} />
      </div>
    </div>
  );
}

/* ── 04 · the file ────────────────────────────────────────────────────── */

function FileScene({ t }: { t: number }) {
  const prog = easeOut(clamp01((t - 8.15) / 1.1));
  const saved = t >= 9.5;
  const p = at(t, 7.95, 0.42);
  const pct = Math.round(prog * 100);
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 7.8, 10.4)})`, transformOrigin: '50% 50%' }}>
      <div style={{ position: 'absolute', left: 120, top: 168 }}>
        <Rise p={p} y={18}>
          <div style={{ ...DISPLAY, fontSize: 104 }}>Files, byte for byte.</div>
          <p style={{ marginTop: 26, fontFamily: 'var(--font-sans)', fontSize: 27, color: MUTED }}>
            No compression. No re-upload. The bytes you send are the bytes that land.
          </p>
        </Rise>
      </div>

      {/* ghosts: the other files this could be, kept at the edge of vision */}
      {[
        { x: 268, y: 468, r: -2.4, w: 1240, label: 'board-deck.pdf' },
        { x: 316, y: 486, r: 1.8, w: 1180, label: 'IMG_9921.HEIC' },
      ].map((g, i) => (
        <div
          key={g.label}
          style={{
            position: 'absolute',
            left: g.x,
            top: g.y - i * 8,
            width: g.w,
            height: 300,
            borderRadius: 26,
            background: 'rgba(242,233,222,0.018)',
            border: '1px solid rgba(242,233,222,0.05)',
            transform: `rotate(${g.r}deg)`,
          }}
        />
      ))}

      <div
        style={{
          position: 'absolute',
          left: 300,
          top: 446,
          width: 1320,
          height: 312,
          borderRadius: 28,
          background: CARD,
          border: '1px solid rgba(242,233,222,0.12)',
          boxShadow: '0 80px 140px -60px rgba(0,0,0,0.95)',
          display: 'flex',
          alignItems: 'center',
          gap: 44,
          padding: '0 52px',
          opacity: p,
          transform: `translateY(${(1 - p) * 22}px)`,
        }}
      >
        <div
          style={{
            width: 108,
            height: 134,
            borderRadius: 14,
            background: EMBER,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'var(--font-sans)',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.06em',
            color: '#fff',
            boxShadow: '0 22px 44px -18px rgba(240,100,19,0.65)',
          }}
        >
          PDF
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM }}>
              Q3-budget.pdf
            </span>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 21, color: 'rgba(242,233,222,0.38)' }}>
              24.3 MB · PDF
            </span>
          </div>

          <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              style={{
                flex: 1,
                height: 10,
                borderRadius: 5,
                background: 'rgba(242,233,222,0.09)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${prog * 100}%`,
                  height: '100%',
                  borderRadius: 5,
                  background: EMBER,
                  boxShadow: '0 0 22px rgba(240,100,19,0.55)',
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 34,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: saved ? GREEN : 'rgba(242,233,222,0.72)',
                width: 210,
                textAlign: 'right',
              }}
            >
              {saved ? '✓ Saved' : `${pct}%`}
            </span>
          </div>

          <div
            style={{
              marginTop: 18,
              fontFamily: 'var(--font-sans)',
              fontSize: 19,
              color: saved ? 'rgba(52,199,89,0.85)' : 'rgba(242,233,222,0.34)',
            }}
          >
            {saved ? 'Byte-for-byte verified on the receiving device' : 'Sealing on this device · sending device to device'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 05 · the key ─────────────────────────────────────────────────────── */

function KeyScene({ t }: { t: number }) {
  const p = at(t, 10.5, 0.42);
  const bracket = at(t, 11.15, 0.45);
  return (
    <div style={{ position: 'absolute', inset: 0, transform: `scale(${drift(t, 10.4, 12.8)})`, transformOrigin: '50% 48%' }}>
      <div style={{ position: 'absolute', left: 120, top: 196, width: 1500 }}>
        <Rise p={p} y={20}>
          <div style={{ ...DISPLAY, fontSize: 104 }}>Encrypted end to end.</div>
          <p style={{ marginTop: 28, fontFamily: 'var(--font-sans)', fontSize: 28, lineHeight: 1.5, color: MUTED, maxWidth: 1060 }}>
            The key is made on your devices. It never reaches the server.
          </p>
        </Rise>

        <Rise p={at(t, 10.72, 0.4)} y={16} style={{ marginTop: 74 }}>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', maxWidth: 1500 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '30px 54px',
                borderRadius: 22,
                background: CARD,
                border: '1px solid rgba(242,233,222,0.12)',
                boxShadow: '0 50px 100px -50px rgba(0,0,0,0.9)',
                fontFamily: 'var(--font-sans)',
                fontSize: 44,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                width: 1180,
              }}
            >
              <span style={{ color: 'rgba(242,233,222,0.92)' }}>sharetexts.online/space/6b1c</span>
              <span
                style={{
                  color: EMBER,
                  borderBottom: `2px dashed ${bracket > 0 ? `rgba(240,100,19,${0.55 * bracket})` : 'transparent'}`,
                  paddingBottom: 6,
                }}
              >
                #k=9f2a8c…
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, opacity: bracket }}>
              <svg width="30" height="14" viewBox="0 0 30 14" fill="none">
                <path d="M29 1v4a3 3 0 0 1-3 3H5a3 3 0 0 0-3 3v2" stroke="rgba(240,100,19,0.55)" strokeWidth="1.6" />
              </svg>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 20, color: 'rgba(240,100,19,0.85)' }}>
                the fragment never leaves the browser
              </span>
            </div>
          </div>
        </Rise>

        <Rise p={at(t, 11.3, 0.5)} y={8} style={{ marginTop: 78 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <svg width="22" height="26" viewBox="0 0 22 26" fill="none" stroke="rgba(242,233,222,0.30)" strokeWidth="1.6">
              <rect x="2" y="11" width="18" height="13" rx="3" />
              <path d="M6 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 22, color: 'rgba(242,233,222,0.40)' }}>
              The server only ever holds ciphertext — never the key, never the file.
            </span>
          </div>
        </Rise>
      </div>
    </div>
  );
}

/* ── 06 · the lockup ──────────────────────────────────────────────────── */

function Outro({ t }: { t: number }) {
  const p = at(t, 12.9, 0.5);
  const q = at(t, 13.15, 0.5);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${drift(t, 12.8, 15)})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 920,
          height: 620,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(240,100,19,0.14), rgba(240,100,19,0) 68%)',
          filter: 'blur(18px)',
          opacity: p,
        }}
      />
      <Rise p={p} y={16} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18, marginBottom: 42 }}>
        <ShareTextsLogo size={64} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', color: CREAM }}>
          ShareTexts
        </span>
      </Rise>
      <Rise p={p} y={18} style={{ position: 'relative', textAlign: 'center' }}>
        <div style={{ ...DISPLAY, fontSize: 96 }}>Move anything between</div>
        <div style={{ ...DISPLAY, fontSize: 96, color: 'rgba(242,233,222,0.92)' }}>your devices.</div>
      </Rise>
      <Rise p={q} y={12} style={{ position: 'relative', marginTop: 46, display: 'flex', alignItems: 'center', gap: 22 }}>
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 34, fontWeight: 600, color: CREAM }}>sharetexts.online</span>
        <span style={{ width: 1, height: 26, background: 'rgba(242,233,222,0.18)' }} />
        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 26, color: 'rgba(242,233,222,0.46)' }}>Free. No account.</span>
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
            'radial-gradient(58% 52% at 12% 92%, rgba(240,100,19,0.15), rgba(240,100,19,0) 70%),'
            + ' radial-gradient(46% 44% at 92% 8%, rgba(255,214,170,0.055), rgba(255,214,170,0) 70%)',
        }}
      />

      <Chrome t={t} />

      <Scene on={scene(t, 0)}><Hook t={t} /></Scene>
      <Scene on={scene(t, 1)}><Link t={t} /></Scene>
      <Scene on={scene(t, 2)}><Send t={t} /></Scene>
      <Scene on={scene(t, 3)}><FileScene t={t} /></Scene>
      <Scene on={scene(t, 4)}><KeyScene t={t} /></Scene>
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
