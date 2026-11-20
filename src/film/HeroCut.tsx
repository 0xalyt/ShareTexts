import React, { useEffect, useState } from 'react';

/**
 * HeroCut — the hero film, simplified.
 *
 * The 32s desk film and its 15s launch cut are lit photographs: textures,
 * bokeh, grade, a camera that moves. This cut keeps the same two devices and
 * the same story but drops the set. What is left is the product on a warm
 * ground, two real device frames, and four movements, so the eye has one thing
 * to look at at a time.
 *
 * Why it looks better for being plainer:
 *   · The frames are drawn as vectors (case, bezel, glass, island, controls,
 *     contact shadow, each its own layer), so nothing is an upscaled mockup and
 *     nothing is a photograph of a laptop that happens to contain a screen.
 *   · Every motion is transform + opacity on a 12s clock, eased with a single
 *     curve. No camera shake, no whip pans, no parallax: at hero size any of
 *     those read as noise rather than craft.
 *   · The loop closes on itself: the first and last frames are the same idle
 *     room, so the video can loop without a seam or a flash.
 *
 * Deterministic like the rest of the rig: `window.__film(t)` sets the scene to
 * an exact time and resolves after two committed frames, and film.html has
 * already disabled CSS animation and transitions.
 */

const W = 1920;
const H = 1080;
export const HERO_DURATION = 12.0;

/* ── maths ─────────────────────────────────────────────────────────────── */
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const smooth = (p: number) => p * p * (3 - 2 * p);
const inOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
/** 0→1 over [start, start+dur], smooth. */
const at = (t: number, start: number, dur: number) => smooth(clamp01((t - start) / dur));
/** symmetric in/out envelope: rise, hold, fall */
const beat = (t: number, start: number, hold: number, fall: number) => {
  const up = clamp01((t - start) / 0.5);
  const down = 1 - clamp01((t - (start + hold)) / fall);
  return smooth(Math.min(up, down));
};

/* ── geometry (stage pixels) ───────────────────────────────────────────── */
/* Framing: the pair fills the frame the way a product shot should. Margins
   are equal top and bottom (178 px each) and the group is centred on x, so the
   hero card has the same air on every side at any size it is displayed at. */
const LAP = { left: 202, top: 178, width: 1100, bezel: 15, deck: 28, radius: 22 };
const LAP_GLASS_W = LAP.width - LAP.bezel * 2;
const LAP_GLASS_H = Math.round(LAP_GLASS_W * 0.625); // 16:10
const LAP_LID_H = LAP_GLASS_H + LAP.bezel * 2;
const LAP_BOTTOM = LAP.top + LAP_LID_H + LAP.deck;

const PHONE = { left: 1398, top: 0, width: 320, bezel: 11, radius: 48 };
const PHONE_GLASS_W = PHONE.width - PHONE.bezel * 2;
const PHONE_GLASS_H = Math.round(PHONE_GLASS_W * (19.5 / 9));
const PHONE_H = PHONE_GLASS_H + PHONE.bezel * 2;
const PHONE_TOP = LAP_BOTTOM - PHONE_H;
const PHONE_CY = PHONE_TOP + PHONE_H / 2;

const GLASS_X = LAP.left + LAP.bezel;
const GLASS_Y = LAP.top + LAP.bezel;
const P_X = PHONE.left + PHONE.bezel;
const P_Y = PHONE_TOP + PHONE.bezel;

/* Where a payload leaves the laptop and where it lands on the phone. It leaves
   from the composer's send button — the one place in the room where a thing
   actually departs — not from the middle of the plate. */
const FROM = { x: GLASS_X + LAP_GLASS_W * 0.78, y: GLASS_Y + LAP_GLASS_H * 0.935 };
const TO = { x: P_X + PHONE_GLASS_W * 0.5, y: P_Y + PHONE_GLASS_H * 0.36 };
const DX = TO.x - FROM.x;
const DY = TO.y - FROM.y;

/* ── the story ─────────────────────────────────────────────────────────── */
const CODE = ['4', '8', '2', '9', '1', '6'];
const SEND_AT = [3.0, 4.25, 5.5];
const FLIGHT = 1.35;
const ROWS_OUT = 9.4;

export function HeroCut() {
  const [t, setT] = useState(0);

  useEffect(() => {
    window.__film = async (time: number) => {
      setT(time);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    };
    return () => {
      delete window.__film;
    };
  }, []);

  /* The link draws between the two screens, once. */
  const link = beat(t, 2.0, 0.5, 0.7);
  const linkDraw = inOut(clamp01((t - 2.0) / 0.45));
  /* Three payloads, one at a time. */
  const flights = SEND_AT.map((start) => {
    const p = clamp01((t - start) / FLIGHT);
    return { p, e: inOut(p), on: p > 0 && p < 1 };
  });
  const rowIn = (i: number) => at(t, SEND_AT[i] + FLIGHT - 0.1, 0.42) * (1 - at(t, ROWS_OUT + i * 0.12, 0.34));
  const sentLabel = beat(t, 6.7, 2.4, 0.6);
  const glow = beat(t, SEND_AT[0] + FLIGHT, 3.1, 0.7);

  return (
    <div
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(120% 92% at 26% 10%, #1c1611 0%, #100d0b 46%, #080706 100%)',
      }}
    >
      {/* Light: one warm key from above the laptop, one cool fill behind the
          phone, and a floor that fades out rather than ending on a line. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(52% 42% at 44% 46%, rgba(255,150,60,0.10) 0%, rgba(255,150,60,0) 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(34% 34% at 78% 44%, rgba(120,160,255,0.06) 0%, rgba(120,160,255,0) 72%)',
        }}
      />
      {/* Contact shadows, one per device, sitting on the same floor line. */}
      <Shadow cx={LAP.left + LAP.width / 2} cy={LAP_BOTTOM + 14} rx={LAP.width * 0.52} ry={34} />
      <Shadow cx={PHONE.left + PHONE.width / 2} cy={LAP_BOTTOM + 10} rx={PHONE.width * 0.72} ry={22} />

      <Laptop link={link} sentLabel={sentLabel} glow={glow} />
      <Phone rowIn={rowIn} link={link} glow={glow} />

      {/* The hairline the payloads travel along: drawn once when the link
          opens, then it stays as a faint guide. */}
      <div
        style={{
          position: 'absolute',
          left: FROM.x,
          top: FROM.y,
          width: Math.abs(DX),
          height: 1,
          transformOrigin: 'left center',
          transform: `rotate(${Math.atan2(DY, DX)}rad) scaleX(${linkDraw})`,
          background:
            'linear-gradient(90deg, rgba(240,100,19,0.0), rgba(240,100,19,0.42), rgba(240,100,19,0.0))',
          opacity: link * 0.9,
        }}
      />

      {flights.map((f, i) =>
        f.on ? (
          <React.Fragment key={i}>
            <Payload p={f.p} e={f.e} index={i} />
          </React.Fragment>
        ) : null,
      )}

      {/* Vignette last, so it frames everything including the payloads. */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(78% 78% at 50% 48%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.38) 100%)',
        }}
      />
    </div>
  );
}

/* ── pieces ────────────────────────────────────────────────────────────── */

function Shadow({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - rx,
        top: cy - ry,
        width: rx * 2,
        height: ry * 2,
        borderRadius: '50%',
        background: 'radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 72%)',
        filter: 'blur(6px)',
      }}
    />
  );
}

/** A payload card in flight: leaves the composer, arcs over, lands. */
function Payload({ p, e, index }: { p: number; e: number; index: number }) {
  const arc = -Math.sin(Math.PI * p) * 54;
  const fade = Math.min(clamp01(p / 0.12), 1 - clamp01((p - 0.86) / 0.14));
  const scale = lerp(1, 0.62, e);
  const tilt = -2.2 * Math.sin(Math.PI * p);
  return (
    <div
      style={{
        position: 'absolute',
        left: FROM.x - 95,
        top: FROM.y - 32,
        width: 190,
        height: 64,
        opacity: fade,
        transform: `translate3d(${DX * e}px, ${DY * e + arc}px, 0) scale(${scale}) rotate(${tilt}deg)`,
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(52,44,37,0.99), rgba(30,26,22,0.99))',
        border: '1px solid rgba(255,178,120,0.42)',
        boxShadow: '0 20px 44px -18px rgba(0,0,0,0.92), 0 0 30px -6px rgba(240,100,19,0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 14px',
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 9,
          background: index === 0 ? 'rgba(240,100,19,0.22)' : 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.08)',
          flex: 'none',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <Bar w={index === 1 ? 96 : 78} />
        <Bar w={index === 2 ? 52 : 60} dim />
      </div>
    </div>
  );
}

function Bar({ w, dim }: { w: number; dim?: boolean }) {
  return (
    <div
      style={{
        width: w,
        height: dim ? 5 : 6,
        borderRadius: 3,
        background: dim ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.42)',
      }}
    />
  );
}

/* ── laptop ────────────────────────────────────────────────────────────── */
function Laptop({ link, sentLabel, glow }: { link: number; sentLabel: number; glow: number }) {
  return (
    <div style={{ position: 'absolute', left: LAP.left, top: LAP.top, width: LAP.width }}>
      {/* lid: case, then glass clipped inside it, then the notch above the
          glass — three layers, never one rectangle pretending to be a screen */}
      <div
        style={{
          position: 'relative',
          width: LAP.width,
          height: LAP_LID_H,
          borderRadius: LAP.radius,
          background: 'linear-gradient(180deg, #17151312 0%, #0d0c0b 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow:
            '0 2px 1px rgba(255,255,255,0.05) inset, 0 30px 70px -30px rgba(0,0,0,0.9)',
          padding: LAP.bezel,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: LAP.bezel - 5,
            width: 96,
            height: 9,
            transform: 'translateX(-50%)',
            borderRadius: '0 0 6px 6px',
            background: '#0a0908',
            border: '1px solid rgba(255,255,255,0.05)',
            borderTop: 'none',
            zIndex: 3,
          }}
        />
        <div
          style={{
            position: 'relative',
            width: LAP_GLASS_W,
            height: LAP_GLASS_H,
            borderRadius: 10,
            overflow: 'hidden',
            background: '#0b0a09',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.06) inset',
          }}
        >
          <LaptopScreen link={link} sentLabel={sentLabel} glow={glow} />
        </div>
      </div>
      {/* deck: a hinge line, then the base that reads as thickness */}
      <div
        style={{
          width: LAP.width + 44,
          marginLeft: -22,
          height: LAP.deck,
          borderTopLeftRadius: 4,
          borderTopRightRadius: 4,
          borderBottomLeftRadius: 12,
          borderBottomRightRadius: 12,
          background: 'linear-gradient(180deg, #2a2724 0%, #14120f 62%, #0b0a09 100%)',
          boxShadow: '0 -1px 0 rgba(255,255,255,0.09) inset, 0 18px 30px -18px rgba(0,0,0,0.9)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 2,
            width: 132,
            height: 5,
            transform: 'translateX(-50%)',
            borderRadius: 3,
            background: 'rgba(0,0,0,0.55)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.05)',
          }}
        />
      </div>
    </div>
  );
}

/** The room, as it actually looks: rail, code plate, QR, composer. */
function LaptopScreen({ link, sentLabel, glow }: { link: number; sentLabel: number; glow: number }) {
  const topBar = 46;
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0a09', color: '#fff' }}>
      {/* top bar */}
      <div
        style={{
          height: topBar,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 18px',
          borderBottom: '1px solid rgba(255,255,255,0.055)',
        }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{ width: 7, height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.16)' }}
          />
        ))}
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            height: 26,
            padding: '0 11px',
            borderRadius: 13,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: '#34c759',
              boxShadow: `0 0 8px rgba(52,199,89,${0.35 + link * 0.5})`,
            }}
          />
          <span style={{ fontSize: 11, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.62)' }}>
            Windows PC 2
          </span>
        </div>
      </div>

      {/* rail */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: topBar,
          bottom: 0,
          width: 62,
          borderRight: '1px solid rgba(255,255,255,0.045)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 16,
          gap: 12,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 30,
              height: 30,
              borderRadius: 9,
              background: i === 0 ? 'rgba(240,100,19,0.16)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${i === 0 ? 'rgba(240,100,19,0.3)' : 'rgba(255,255,255,0.05)'}`,
            }}
          />
        ))}
      </div>

      {/* code plate + QR */}
      <div
        style={{
          position: 'absolute',
          left: 62,
          right: 0,
          top: topBar,
          height: LAP_GLASS_H - topBar - 78,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 54,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.2em',
              color: 'rgba(255,255,255,0.32)',
              fontWeight: 600,
            }}
          >
            ROOM CODE
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
            {CODE.map((d, i) => (
              <span
                key={i}
                style={{
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
                  fontSize: 58,
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                  color: '#ffffff',
                  // The code is the room's resting state, not an entrance: the
                  // poster frame and the loop seam both need it already there.
                  display: 'inline-block',
                  ...(i === 3 ? { marginLeft: 8 } : null),
                }}
              >
                {d}
              </span>
            ))}
          </div>
          <div
            style={{
              marginTop: 4,
              height: 30,
              padding: '0 14px',
              borderRadius: 15,
              display: 'flex',
              alignItems: 'center',
              fontSize: 11,
              color: 'rgba(255,255,255,0.55)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            Copy
          </div>
        </div>
        <Qr />
      </div>

      {/* composer */}
      <div
        style={{
          position: 'absolute',
          left: 62,
          right: 0,
          bottom: 0,
          height: 78,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 520,
            height: 46,
            borderRadius: 23,
            background: 'rgba(255,255,255,0.045)',
            border: '1px solid rgba(255,255,255,0.075)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 8px 0 20px',
            gap: 10,
            position: 'relative',
            boxShadow: `0 0 0 1px rgba(240,100,19,${glow * 0.14})`,
          }}
        >
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
            Message, link, or drop a file…
          </span>
          <div style={{ flex: 1 }} />
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              background: '#f06413',
              boxShadow: '0 6px 14px -6px rgba(240,100,19,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      {/* sent receipt: the laptop's own confirmation, quiet */}
      <div
        style={{
          position: 'absolute',
          right: 22,
          bottom: 92,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: sentLabel,
          transform: `translateY(${(1 - sentLabel) * 6}px)`,
        }}
      >
        <Check size={13} />
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Delivered</span>
      </div>
    </div>
  );
}

/** A QR that is drawn, not pasted: three finders and a deterministic field. */
function Qr() {
  const n = 15;
  const cell = 168 / n;
  const cells: React.ReactNode[] = [];
  const finder = (x: number, y: number) => (
    <g key={`f${x}${y}`}>
      <rect x={x * cell} y={y * cell} width={cell * 5} height={cell * 5} fill="#0b0a09" />
      <rect x={(x + 1) * cell} y={(y + 1) * cell} width={cell * 3} height={cell * 3} fill="#fff" />
      <rect x={(x + 2) * cell} y={(y + 2) * cell} width={cell} height={cell} fill="#0b0a09" />
    </g>
  );
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const inFinder = (x < 5 && y < 5) || (x > n - 6 && y < 5) || (x < 5 && y > n - 6);
      if (inFinder) continue;
      const on = ((x * 7 + y * 11 + ((x * y) % 5)) % 3) % 2 === 0;
      if (!on) continue;
      cells.push(<rect key={`${x}-${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill="#0b0a09" />);
    }
  }
  return (
    <div
      style={{
        width: 184,
        height: 184,
        borderRadius: 12,
        background: '#fff',
        padding: 0,
        boxShadow: '0 14px 34px -16px rgba(0,0,0,0.8)',
        overflow: 'hidden',
      }}
    >
      <svg width="184" height="184" viewBox="0 0 168 168">
        {cells}
        {finder(0, 0)}
        {finder(n - 5, 0)}
        {finder(0, n - 5)}
      </svg>
    </div>
  );
}

function Check({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 12.5l5 5L20 6.5" stroke="#34c759" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── phone ─────────────────────────────────────────────────────────────── */
function Phone({
  rowIn,
  link,
  glow,
}: {
  rowIn: (i: number) => number;
  link: number;
  glow: number;
}) {
  return (
    <div style={{ position: 'absolute', left: PHONE.left, top: PHONE_TOP, width: PHONE.width }}>
      {/* side controls, outside the glass */}
      <div
        style={{
          position: 'absolute',
          left: -3,
          top: 118,
          width: 3,
          height: 26,
          borderRadius: 2,
          background: 'linear-gradient(180deg, #3a3632, #1a1815)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -3,
          top: 158,
          width: 3,
          height: 52,
          borderRadius: 2,
          background: 'linear-gradient(180deg, #3a3632, #1a1815)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -3,
          top: 196,
          width: 3,
          height: 78,
          borderRadius: 2,
          background: 'linear-gradient(180deg, #3a3632, #1a1815)',
        }}
      />

      <div
        style={{
          width: PHONE.width,
          height: PHONE_H,
          borderRadius: PHONE.radius,
          padding: PHONE.bezel,
          boxSizing: 'border-box',
          background: 'linear-gradient(160deg, #211d19 0%, #12100e 46%, #0a0908 100%)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow:
            '0 2px 2px rgba(255,255,255,0.05) inset, 0 40px 80px -40px rgba(0,0,0,0.95)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: PHONE_GLASS_W,
            height: PHONE_GLASS_H,
            borderRadius: PHONE.radius - PHONE.bezel,
            overflow: 'hidden',
            background: '#0b0a09',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.9)',
          }}
        >
          <PhoneScreen rowIn={rowIn} link={link} glow={glow} />
          {/* Dynamic Island, above the screen content */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 9,
              width: 88,
              height: 26,
              transform: 'translateX(-50%)',
              borderRadius: 13,
              background: '#080706',
              border: '1px solid rgba(255,255,255,0.06)',
              zIndex: 4,
            }}
          />
          {/* home indicator */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 7,
              width: 88,
              height: 4,
              transform: 'translateX(-50%)',
              borderRadius: 2,
              background: 'rgba(255,255,255,0.22)',
              zIndex: 4,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function PhoneScreen({
  rowIn,
  link,
  glow,
}: {
  rowIn: (i: number) => number;
  link: number;
  glow: number;
}) {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0a09', color: '#fff' }}>
      <div style={{ paddingTop: 46, paddingLeft: 16, paddingRight: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.32)', fontWeight: 600 }}>
            RECEIVE
          </span>
          <div style={{ flex: 1 }} />
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: '#34c759',
              opacity: 0.35 + link * 0.65,
            }}
          />
        </div>
        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 620, letterSpacing: '-0.01em' }}>
          From Windows PC
        </div>
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[0, 1, 2].map((i) => {
            const o = rowIn(i);
            return (
              <div
                key={i}
                style={{
                  height: 52,
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.045)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '0 10px',
                  opacity: o,
                  transform: `translateY(${(1 - o) * 8}px) scale(${0.97 + o * 0.03})`,
                }}
              >
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    background: i === 0 ? 'rgba(240,100,19,0.22)' : 'rgba(255,255,255,0.08)',
                    flex: 'none',
                  }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                  <div style={{ width: i === 1 ? 78 : 62, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.42)' }} />
                  <div style={{ width: 44, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.16)' }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 26,
          height: 44,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          boxShadow: `0 0 0 1px rgba(240,100,19,${glow * 0.16})`,
        }}
      >
        <Check size={12} />
        <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>
          {rowIn(2) > 0.5 ? '3 items received' : rowIn(0) > 0.5 ? 'Receiving…' : 'Waiting'}
        </span>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __film?: (t: number) => Promise<void>;
  }
}

export default HeroCut;
