import React, { useEffect, useState } from 'react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { LaptopApp, PhoneApp, PacketCard, type LaptopState, type PhoneState } from './FilmUI';

/**
 * FilmStage — the ShareTexts hero film, lit and shot.
 *
 * The picture is built from the product itself: LaptopApp and PhoneApp in
 * FilmUI are the real room/connect screens (QR plate, six-digit code, the
 * this ⇄ partner header, the composer) drawn at NATIVE laptop and phone
 * density rather than a 480×300 miniature blown up 2.4×. That single change
 * is most of the difference between "a mockup in a video" and "someone using
 * it": the type is the app's own type, at the size the app sets it.
 *
 * Around it sits a set: a lit desk, contact shadows, spill from the panels
 * onto the surface, a warm key from upper left, cool fill from the right,
 * bokeh behind, then a filmic grade. Depth of field is real in the sense that
 * matters — the plane that is not the subject is genuinely blurred, and the
 * pull happens on the story's beats.
 *
 * Framing rule, learned the hard way: the wide beats keep BOTH devices inside
 * the frame (≤1.06 scale), and the close beats push in far enough that the
 * other device is properly out of frame. A shot where both are half cut is
 * the one composition that reads as an accident.
 *
 * Determinism is unchanged: `window.__film(t)` sets the scene to an exact time
 * and resolves after two committed frames, and film.html disables CSS
 * animation and transitions. Every moving part is a function of t.
 *
 * Modes: ?mode=loop renders the 10-second hero loop (see LOOP_SHOTS).
 */

const STAGE_W = 1920;
const STAGE_H = 1080;
export const DURATION = 34.0;
export const LOOP_DURATION = 10.0;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const smooth = (p: number) => p * p * (3 - 2 * p);
const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const easeOut = (p: number) => 1 - (1 - p) ** 3;
const at = (t: number, start: number, dur: number) => smooth(clamp01((t - start) / dur));
const key = (t: number, keys: { t: number; v: number }[]) => {
  if (t <= keys[0].t) return keys[0].v;
  for (let i = 1; i < keys.length; i += 1) {
    if (t <= keys[i].t) {
      const a = keys[i - 1];
      const b = keys[i];
      return lerp(a.v, b.v, smooth(clamp01((t - a.t) / (b.t - a.t))));
    }
  }
  return keys[keys.length - 1].v;
};

/* ── world geometry (frame pixels) ─────────────────────────────────────── */

const LAPTOP = { left: 120, top: 118, width: 1120 };
const LAPTOP_BEZEL = 8;
const LAPTOP_GLASS_W = LAPTOP.width - LAPTOP_BEZEL * 2;
const LAPTOP_GLASS_H = Math.round(LAPTOP_GLASS_W * 0.625); // 16:10
const LAPTOP_DECK = 17;

const PHONE = { left: 1500, top: 113, width: 352 };
const PHONE_BEZEL = Math.round(PHONE.width * 0.042);
const PHONE_GLASS_W = PHONE.width - PHONE_BEZEL * 2;
const PHONE_GLASS_H = Math.round(PHONE_GLASS_W * (19.5 / 9));

const LAPTOP_BOTTOM = LAPTOP.top + LAPTOP_GLASS_H + LAPTOP_BEZEL * 2 + LAPTOP_DECK;
const PHONE_BOTTOM = PHONE.top + PHONE_GLASS_H + PHONE_BEZEL * 2;
/* Both devices stand ON the desk line, not above it: PHONE.top above is derived
   from DESK_Y for exactly that reason, and any change here has to keep the
   two bottoms equal or the phone floats. */
const DESK_Y = LAPTOP_BOTTOM;

const PACKET_A = { x: LAPTOP.left + LAPTOP.width + 14, y: LAPTOP.top + 340 };
const PACKET_B = { x: PHONE.left + 20, y: PHONE.top + 400 };

/* ── camera ────────────────────────────────────────────────────────────── */

type Cam = { s: number; x: number; y: number; ry: number };
const cam = (s: number, x = 0, y = 0, ry = 0): Cam => ({ s, x, y, ry });

const SHOTS: { from: number; to: number; a: Cam; b: Cam }[] = [
  // 0–3 establish: a slow push that barely announces itself.
  { from: 0.0, to: 3.0, a: cam(1.0, 0, 14, 1.0), b: cam(1.035, -12, 2, 0.2) },
  // 3–7.2 discovery: drift right onto the phone and its Nearby card.
  { from: 3.0, to: 7.2, a: cam(1.035, -12, 2, 0.2), b: cam(1.13, -404, -22, -1.6) },
  // 7.2–9.4 the tap: hold, a touch closer, no wobble.
  { from: 7.2, to: 9.4, a: cam(1.13, -404, -22, -1.6), b: cam(1.155, -432, -30, -1.9) },
  // 9.4–10.8 the other side types: arrive at the two-shot quickly. Both devices
  // are 1732px wide, so a two-shot cannot live above ~1.05 without cropping one
  // — and a shot that ends mid-pull leaves the window chrome sliced in half.
  { from: 9.4, to: 10.8, a: cam(1.155, -432, -30, -1.9), b: cam(1.035, -70, -8, -0.4) },
  // 10.8–12.4 hold: she is typing, the laptop is listening.
  { from: 10.8, to: 12.4, a: cam(1.035, -70, -8, -0.4), b: cam(1.035, -74, -8, -0.4) },
  // 12.4–13.4 hold the two-shot: the packet needs both devices in frame.
  { from: 12.4, to: 13.4, a: cam(1.035, -70, -8, -0.4), b: cam(1.045, -84, -6, -0.5) },
  // 13.4–16.4 text lands: settle wide, then lean in on the laptop.
  { from: 13.4, to: 16.4, a: cam(1.045, -74, -6, -0.5), b: cam(1.055, -46, -8, -0.4) },
  // 16.4–18.8 photo: push in on the laptop as it arrives.
  { from: 16.4, to: 18.8, a: cam(1.055, -46, -8, -0.4), b: cam(1.24, 320, -44, 0.5) },
  // 18.8–21.2 hold on the laptop.
  { from: 18.8, to: 21.2, a: cam(1.24, 320, -44, 0.5), b: cam(1.225, 306, -38, 0.4) },
  // 21.2–22.6 pull wide for the file.
  { from: 21.2, to: 22.6, a: cam(1.225, 306, -38, 0.4), b: cam(1.05, -60, -8, -0.4) },
  // 22.6–23.9 file lands: push until the phone is out of frame, then hold.
  { from: 22.6, to: 23.9, a: cam(1.05, -60, -8, -0.4), b: cam(1.235, 338, -44, 0.5) },
  { from: 23.9, to: 26.0, a: cam(1.235, 338, -44, 0.5), b: cam(1.22, 320, -38, 0.4) },
  // 26–28.6 closing pull-back.
  { from: 26.0, to: 28.6, a: cam(1.2, 292, -36, 0.4), b: cam(0.985, 0, 18, 0.6) },
];

/* The loop returns to its own first frame exactly: same camera, same focus,
   same UI state. The packet is the only thing that appears and disappears. */
const LOOP_SHOTS: { from: number; to: number; a: Cam; b: Cam }[] = [
  // x stays small and positive: at 1.075 with a +56 drift the phone's right
  // edge lands past the frame, and a hero loop cannot show half a phone.
  { from: 0.0, to: 4.4, a: cam(1.01, -8, 8, 0.4), b: cam(1.05, 6, -10, -0.8) },
  { from: 4.4, to: 7.2, a: cam(1.05, 6, -10, -0.8), b: cam(1.03, -14, 0, -0.1) },
  { from: 7.2, to: 10.0, a: cam(1.04, -16, 0, -0.1), b: cam(1.01, -8, 8, 0.4) },
];

function readCam(shots: typeof SHOTS, t: number): Cam {
  const shot = shots.find((s) => t < s.to) ?? shots[shots.length - 1];
  const p = easeInOut(clamp01((t - shot.from) / (shot.to - shot.from)));
  return {
    s: lerp(shot.a.s, shot.b.s, p),
    x: lerp(shot.a.x, shot.b.x, p),
    y: lerp(shot.a.y, shot.b.y, p),
    ry: lerp(shot.a.ry, shot.b.ry, p),
  };
}

/* ── chassis ───────────────────────────────────────────────────────────── */

const LID = 'linear-gradient(156deg, #6d6d77 0%, #4a4a53 18%, #2c2c34 52%, #1b1b21 82%, #141418 100%)';
const DECK = 'linear-gradient(180deg, #5b5b65 0%, #34343c 34%, #1d1d23 78%, #141418 100%)';
const BODY = 'linear-gradient(166deg, #7a7a86 0%, #4b4b55 16%, #2d2d35 52%, #1a1a20 84%, #121216 100%)';

function LaptopShell({ children, glow }: { children: React.ReactNode; glow: number }) {
  return (
    <div className="relative" style={{ width: LAPTOP.width }}>
      <div
        className="relative"
        style={{
          padding: LAPTOP_BEZEL,
          borderRadius: 9,
          background: LID,
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 0 0 1px rgba(255,255,255,0.06), inset 0 -2px 3px rgba(0,0,0,0.55), 0 2px 1px rgba(0,0,0,0.6), 0 60px 90px -44px rgba(0,0,0,1)',
        }}
      >
        {/* brushed metal: hairlines, strongest at the top edge where light hits */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: 9,
            background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 1px, rgba(0,0,0,0.06) 1px 3px)',
            maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.8), rgba(0,0,0,0.25))',
          }}
        />
        <span
          aria-hidden
          className="absolute left-1/2 top-[2.5px] h-[3px] w-[3px] -translate-x-1/2 rounded-full"
          style={{ background: '#09090b', boxShadow: '0 0 0 0.5px rgba(255,255,255,0.22)' }}
        />
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 4,
            width: LAPTOP_GLASS_W,
            height: LAPTOP_GLASS_H,
            background: '#060606',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9), inset 0 0 30px rgba(0,0,0,0.5)',
          }}
        >
          {/* The grade wrapper must carry the full size: a filter creates a
              containing block, and without explicit height the app's h-full
              resolves against a zero-height box and collapses. */}
          <div style={{ width: '100%', height: '100%', filter: 'brightness(1.24) contrast(1.02) saturate(1.05)' }}>{children}</div>
          {/* panel reflections: a broad wash plus one hard edge of the room */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30"
            style={{ background: 'linear-gradient(124deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0.04) 15%, rgba(255,255,255,0) 32%)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30"
            style={{ background: 'linear-gradient(196deg, rgba(255,232,206,0.07) 0%, rgba(255,255,255,0) 26%)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30"
            style={{ boxShadow: `inset 0 0 34px rgba(255,150,80,${0.04 + glow * 0.05})` }}
          />
        </div>
      </div>
      {/* hinge deck */}
      <div
        aria-hidden
        className="relative"
        style={{
          height: LAPTOP_DECK,
          marginLeft: -14,
          width: LAPTOP.width + 28,
          borderRadius: '0 0 10px 10px',
          background: DECK,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.32), 0 16px 26px -16px rgba(0,0,0,1)',
        }}
      >
        <span aria-hidden className="absolute left-1/2 top-0 h-[6px] w-[16%] -translate-x-1/2" style={{ borderRadius: '0 0 6px 6px', background: 'rgba(0,0,0,0.55)' }} />
      </div>
    </div>
  );
}

function PhoneShell({ children, glow }: { children: React.ReactNode; glow: number }) {
  return (
    <div className="relative" style={{ width: PHONE.width }}>
      <div
        className="relative"
        style={{
          padding: PHONE_BEZEL,
          borderRadius: 24,
          background: BODY,
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 0 0 1px rgba(255,255,255,0.08), 0 2px 1px rgba(0,0,0,0.5), 0 48px 84px -36px rgba(0,0,0,1)',
        }}
      >
        <span aria-hidden className="absolute left-0 top-[14%] h-[72%] w-[2px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.75), rgba(255,255,255,0.08) 55%, rgba(255,255,255,0.3))' }} />
        <span aria-hidden className="absolute right-0 top-[14%] h-[72%] w-[1.5px]" style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.04))' }} />
        <span aria-hidden className="absolute -left-[2px] top-[19%] h-[5%] w-[3px] rounded-l-[2px]" style={{ background: '#2a2a30' }} />
        <span aria-hidden className="absolute -left-[2px] top-[27%] h-[8%] w-[3px] rounded-l-[2px]" style={{ background: '#2a2a30' }} />
        <span aria-hidden className="absolute -right-[2px] top-[26%] h-[10%] w-[3px] rounded-r-[2px]" style={{ background: '#2a2a30' }} />
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 14,
            width: PHONE_GLASS_W,
            height: PHONE_GLASS_H,
            background: '#060606',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.9), inset 0 0 20px rgba(0,0,0,0.45)',
          }}
        >
          <div style={{ width: '100%', height: '100%', filter: 'brightness(1.24) contrast(1.02) saturate(1.05)' }}>{children}</div>
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-[1.5%] z-30 h-[3.1%] w-[29%] -translate-x-1/2 rounded-full bg-black" />
          <span aria-hidden className="pointer-events-none absolute bottom-[1.1%] left-1/2 z-30 h-[0.9%] w-[31%] -translate-x-1/2 rounded-full bg-white/35" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-30"
            style={{ background: 'linear-gradient(134deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 16%, rgba(255,255,255,0) 32%)' }}
          />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-30" style={{ boxShadow: `inset 0 0 24px rgba(255,150,80,${0.04 + glow * 0.06})` }} />
        </div>
      </div>
    </div>
  );
}

/* ── flight ─────────────────────────────────────────────────────────────── */

function Flight({ t, flights }: { t: number; flights: { from: number; to: number; kind: 'text' | 'photo' | 'file' }[] }) {
  const f = flights.find((x) => t >= x.from - 0.18 && t <= x.to + 0.1);
  if (!f) return null;
  const p = clamp01((t - f.from) / (f.to - f.from));
  const e = easeInOut(p);
  const x = lerp(PACKET_A.x, PACKET_B.x, e);
  const y = lerp(PACKET_A.y, PACKET_B.y, e) - Math.sin(e * Math.PI) * 64;
  const o = Math.min(1, clamp01((t - (f.from - 0.18)) / 0.22), clamp01((f.to + 0.1 - t) / 0.16));
  const scale = f.kind === 'text' ? lerp(0.94, 1, e) : lerp(0.88, 0.96, e);

  return (
    <div className="pointer-events-none absolute inset-0" style={{ opacity: o }}>
      <div
        className="absolute rounded-full"
        style={{
          left: x - 46,
          top: y - 28,
          width: 150,
          height: 58,
          transform: 'translate(-30%, 0)',
          background: 'radial-gradient(ellipse at center, rgba(255,138,54,0.42) 0%, rgba(255,120,40,0) 70%)',
          filter: 'blur(12px)',
        }}
      />
      {[0.06, 0.12].map((lag, i) => {
        const ep = easeInOut(clamp01(p - lag));
        const tx = lerp(PACKET_A.x, PACKET_B.x, ep);
        const ty = lerp(PACKET_A.y, PACKET_B.y, ep) - Math.sin(ep * Math.PI) * 64;
        return (
          <div
            key={lag}
            className="absolute rounded-[10px]"
            style={{
              left: tx,
              top: ty,
              width: f.kind === 'photo' ? 62 : 42,
              height: 26,
              transform: 'translate(-50%, -50%)',
              background: `rgba(255,126,44,${0.22 - i * 0.08})`,
              filter: 'blur(4px)',
            }}
          />
        );
      })}
      <div className="absolute" style={{ left: x, top: y, transform: `translate(-50%, -50%) rotate(${lerp(-3, 2.5, e)}deg)` }}>
        <PacketCard kind={f.kind} scale={scale} />
      </div>
    </div>
  );
}

/* ── stage ──────────────────────────────────────────────────────────────── */

export function FilmStage() {
  const loop = typeof window !== 'undefined' && /(?:^|[?&])mode=loop(?:&|$)/.test(window.location.search);
  const [t, setT] = useState(0);

  useEffect(() => {
    window.__film = (next: number) =>
      new Promise<void>((resolve) => {
        setT(next);
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    return () => {
      delete window.__film;
    };
  }, []);

  const c = readCam(loop ? LOOP_SHOTS : SHOTS, t);

  const laptopBlur = loop
    ? key(t, [{ t: 0, v: 0.6 }, { t: 3.2, v: 1.7 }, { t: 5.6, v: 0.45 }, { t: 10, v: 0.6 }])
    : key(t, [
        { t: 0, v: 0.9 }, { t: 3, v: 1.5 }, { t: 7.2, v: 1.7 }, { t: 9.4, v: 1.6 }, { t: 12.4, v: 1.4 },
        { t: 13.4, v: 0.9 }, { t: 14.4, v: 0.22 }, { t: 16.4, v: 0.5 }, { t: 18.6, v: 0.18 },
        { t: 21.2, v: 0.7 }, { t: 22.6, v: 0.3 }, { t: 26, v: 0.8 }, { t: 28.6, v: 0.7 },
      ]);
  const phoneBlur = loop
    ? key(t, [{ t: 0, v: 0.6 }, { t: 3.2, v: 0.3 }, { t: 5.6, v: 1.7 }, { t: 10, v: 0.6 }])
    : key(t, [
        { t: 0, v: 1.0 }, { t: 3, v: 0.6 }, { t: 7.2, v: 0.14 }, { t: 9.4, v: 0.14 }, { t: 12.4, v: 0.3 },
        { t: 13.6, v: 1.1 }, { t: 14.6, v: 1.4 }, { t: 16.4, v: 1.3 }, { t: 18.6, v: 1.9 },
        { t: 21.4, v: 1.3 }, { t: 23.4, v: 2.0 }, { t: 26, v: 1.0 }, { t: 28.6, v: 0.8 },
      ]);

  const land = (start: number) => (loop ? 1 : at(t, start, 0.4));
  const pulse = loop
    ? key(t, [{ t: 0, v: 0 }, { t: 3.9, v: 0 }, { t: 4.3, v: 1 }, { t: 5.6, v: 0.3 }, { t: 7.4, v: 0 }, { t: 10, v: 0 }])
    : Math.max(
        key(t, [{ t: 0, v: 0 }, { t: 14.3, v: 0 }, { t: 14.5, v: 1 }, { t: 15.5, v: 0.22 }, { t: 16.2, v: 0 }]),
        key(t, [{ t: 0, v: 0 }, { t: 18.2, v: 0 }, { t: 18.4, v: 1 }, { t: 19.5, v: 0.22 }, { t: 20.2, v: 0 }]),
        key(t, [{ t: 0, v: 0 }, { t: 23.0, v: 0 }, { t: 23.2, v: 1 }, { t: 24.4, v: 0.22 }, { t: 25.1, v: 0 }]),
      );

  const laptop: LaptopState = loop
    ? { linked: 1, nearby: 1, handshake: 1, text: 1, photo: 1, file: 1, fileProgress: 1, pulse }
    : {
        linked: at(t, 8.35, 0.45),
        nearby: at(t, 4.0, 0.5),
        handshake: at(t, 8.5, 0.4),
        text: land(14.3),
        photo: land(18.2),
        file: land(23.0),
        fileProgress: at(t, 23.15, 1.4),
        pulse,
      };

  const press = loop ? 0 : Math.min(at(t, 7.0, 0.16), 1 - at(t, 7.4, 0.4));
  const phone: PhoneState = loop
    ? { joined: 1, press: 0, typed: 1, text: 1, photo: 1, file: 1, attach: 'none', attachOn: 0 }
    : {
        joined: at(t, 8.85, 0.35),
        press,
        typed: t < 9.9 ? 0 : t < 11.1 ? at(t, 9.9, 1.2) : 1,
        text: land(13.7),
        photo: land(17.7),
        file: land(22.6),
        attach: t >= 16.4 && t < 17.8 ? 'photo' : t >= 21.3 && t < 22.7 ? 'file' : 'none',
        attachOn: Math.max(
          Math.min(at(t, 16.45, 0.35), 1 - at(t, 17.65, 0.3)),
          Math.min(at(t, 21.35, 0.35), 1 - at(t, 22.55, 0.3)),
        ),
      };

  const flights = loop
    ? [{ from: 2.6, to: 3.9, kind: 'text' as const }]
    : [
        { from: 13.5, to: 14.35, kind: 'text' as const },
        { from: 17.45, to: 18.25, kind: 'photo' as const },
        { from: 22.35, to: 23.15, kind: 'file' as const },
      ];

  const intro = loop ? 1 : clamp01(t / 0.6);
  const worldOut = loop ? 1 : 1 - clamp01((t - 28.2) / 0.85);
  const endIn = loop ? 0 : at(t, 28.75, 0.95);

  const glowLaptop = loop ? 0.6 : Math.max(0.3, pulse);
  const glowPhone = loop ? 0.5 : 0.35;

  return (
    <div style={{ width: STAGE_W, height: STAGE_H }} className="relative select-none overflow-hidden bg-[#0a0908]">
      {/* ── the room ───────────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(78% 66% at 40% -6%, #55402c 0%, #33241a 22%, #1b1512 48%, #0e0b0a 72%, #0a0908 100%)',
        }}
      />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(52% 56% at 94% 12%, rgba(110,138,210,0.13) 0%, rgba(0,0,0,0) 64%)' }} />
      {/* The room behind the set. It fades out with the world so the end card
          sits on a clean field instead of on six warm stains. */}
      <div className="absolute inset-0 overflow-hidden" style={{ opacity: loop ? 1 : worldOut }}>
        {[
          { x: 1640, y: 70, r: 150, o: 0.22, c: '255,196,134' },
          { x: 1800, y: 268, r: 92, o: 0.16, c: '255,170,100' },
          { x: 236, y: 54, r: 168, o: 0.16, c: '255,214,166' },
          { x: 84, y: 320, r: 74, o: 0.1, c: '255,196,148' },
          { x: 1052, y: 30, r: 120, o: 0.08, c: '200,216,255' },
          { x: 760, y: 168, r: 56, o: 0.07, c: '255,224,188' },
          { x: 1380, y: 150, r: 44, o: 0.06, c: '255,206,160' },
        ].map((b) => (
          <div
            key={`${b.x}-${b.y}`}
            className="absolute rounded-full"
            style={{
              left: b.x - b.r,
              top: b.y - b.r,
              width: b.r * 2,
              height: b.r * 2,
              background: `radial-gradient(circle at 50% 50%, rgba(${b.c},${b.o}) 0%, rgba(${b.c},${b.o * 0.45}) 44%, rgba(${b.c},0) 72%)`,
              filter: 'blur(28px)',
            }}
          />
        ))}
      </div>

      {/* ── the set ────────────────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ perspective: '2800px', opacity: worldOut }}>
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: '960px 540px',
            transform: `translate(${c.x}px, ${c.y}px) scale(${c.s}) rotateY(${c.ry}deg)`,
            transformStyle: 'preserve-3d',
            opacity: intro,
          }}
        >
          {/* desk surface: warm near the light, falling to black at the edge */}
          <div
            className="absolute"
            style={{
              left: -700,
              top: DESK_Y,
              width: 3320,
              height: 760,
              background:
                'linear-gradient(180deg, #382a1f 0%, #211a15 11%, #14100d 38%, #0c0a09 70%, #0a0908 100%)',
            }}
          />
          <div
            className="absolute"
            style={{
              left: -700,
              top: DESK_Y,
              width: 3320,
              height: 760,
              background: 'repeating-linear-gradient(87deg, rgba(255,255,255,0.02) 0 2px, rgba(0,0,0,0.03) 2px 6px)',
              maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.18) 34%, transparent 66%)',
            }}
          />
          {/* the specular streak across a real surface */}
          <div
            className="absolute"
            style={{
              left: 40,
              top: DESK_Y + 2,
              width: 1880,
              height: 96,
              background: 'radial-gradient(52% 100% at 44% 0%, rgba(255,214,170,0.19) 0%, rgba(255,160,90,0.07) 42%, rgba(0,0,0,0) 78%)',
              filter: 'blur(24px)',
            }}
          />
          {/* light pooling out of the panels onto the desk */}
          <div
            className="absolute"
            style={{
              left: LAPTOP.left + 20,
              top: DESK_Y - 10,
              width: LAPTOP.width + 40,
              height: 230,
              background: `radial-gradient(46% 100% at 50% 0%, rgba(255,150,80,${0.2 + glowLaptop * 0.14}) 0%, rgba(255,132,60,0) 74%)`,
              filter: 'blur(20px)',
              mixBlendMode: 'screen',
            }}
          />
          <div
            className="absolute"
            style={{
              left: PHONE.left - 100,
              top: DESK_Y - 6,
              width: PHONE.width + 200,
              height: 190,
              background: `radial-gradient(46% 100% at 50% 0%, rgba(255,160,90,${0.19 + glowPhone * 0.13}) 0%, rgba(255,140,60,0) 76%)`,
              filter: 'blur(18px)',
              mixBlendMode: 'screen',
            }}
          />
          {/* mirrored chassis: the surface answers, without a copy of the UI */}
          <div
            aria-hidden
            className="absolute"
            style={{
              left: LAPTOP.left - 10,
              top: DESK_Y,
              width: LAPTOP.width + 20,
              height: 170,
              transform: 'scaleY(-1)',
              transformOrigin: 'top center',
              background: 'linear-gradient(180deg, rgba(168,150,138,0.30) 0%, rgba(90,78,70,0.14) 30%, rgba(0,0,0,0) 74%)',
              filter: 'blur(9px)',
              maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.24) 42%, transparent 84%)',
              borderRadius: 10,
            }}
          />
          <div
            aria-hidden
            className="absolute"
            style={{
              left: PHONE.left - 6,
              top: DESK_Y,
              width: PHONE.width + 12,
              height: 230,
              transform: 'scaleY(-1)',
              transformOrigin: 'top center',
              background: 'linear-gradient(180deg, rgba(190,170,158,0.34) 0%, rgba(96,84,76,0.14) 32%, rgba(0,0,0,0) 76%)',
              filter: 'blur(10px)',
              maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 44%, transparent 86%)',
              borderRadius: 24,
            }}
          />

          {/* ── laptop ──────────────────────────────────────────────────── */}
          <div className="absolute" style={{ left: LAPTOP.left, top: LAPTOP.top, filter: laptopBlur > 0.04 ? `blur(${laptopBlur}px)` : undefined }}>
            <div
              aria-hidden
              className="absolute"
              style={{
                left: -40,
                top: LAPTOP_BOTTOM - LAPTOP.top - 16,
                width: LAPTOP.width + 80,
                height: 74,
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(15px)',
              }}
            />
            <LaptopShell glow={glowLaptop}>
              <LaptopApp {...laptop} />
            </LaptopShell>
          </div>

          {/* ── phone ───────────────────────────────────────────────────── */}
          <div className="absolute" style={{ left: PHONE.left, top: PHONE.top, filter: phoneBlur > 0.04 ? `blur(${phoneBlur}px)` : undefined }}>
            <div
              aria-hidden
              className="absolute"
              style={{
                left: -26,
                top: PHONE_BOTTOM - PHONE.top - 12,
                width: PHONE.width + 52,
                height: 50,
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(13px)',
              }}
            />
            <PhoneShell glow={glowPhone}>
              <PhoneApp {...phone} />
            </PhoneShell>
          </div>

          <Flight t={t} flights={flights} />
        </div>
      </div>

      {!loop && <Captions t={t} />}

      {!loop && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{
            opacity: endIn,
            transform: `scale(${lerp(1.015, 1, endIn) * lerp(1, 1.008, clamp01((t - 28.75) / (DURATION - 28.75)))})`,
          }}
        >
          <div className="absolute inset-0" style={{ background: 'radial-gradient(74% 60% at 50% 46%, rgba(240,100,19,0.15) 0%, rgba(0,0,0,0) 64%)' }} />
          <div className="flex items-center gap-5">
            <ShareTextsLogo size={62} />
            <span className="text-[64px] font-bold tracking-[-0.035em] text-white">ShareTexts</span>
          </div>
          <p className="mt-9 text-[33px] font-medium tracking-[-0.018em] text-white/88">Move anything between your devices.</p>
          <p className="mt-6 text-[19px] tracking-[0.015em] text-white/45">sharetexts.online</p>
        </div>
      )}

      {/* ── grade ─────────────────────────────────────────────────────────── */}
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 170px 30px rgba(0,0,0,0.52)' }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0) 16%, rgba(0,0,0,0) 76%, rgba(0,0,0,0.34) 100%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(40% 38% at ${LAPTOP.left + LAPTOP.width / 2}px ${LAPTOP.top + 300}px, rgba(255,196,148,0.09) 0%, rgba(0,0,0,0) 70%), radial-gradient(24% 32% at ${PHONE.left + PHONE.width / 2}px ${PHONE.top + 300}px, rgba(255,196,148,0.08) 0%, rgba(0,0,0,0) 72%)`,
          mixBlendMode: 'screen',
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ opacity: 0.05, mixBlendMode: 'overlay' }} aria-hidden>
        <filter id="film-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.78" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain)" />
      </svg>
    </div>
  );
}

/* ── captions ───────────────────────────────────────────────────────────── */

const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 3.4, to: 7.2, text: 'No app. No account.' },
  { from: 7.8, to: 12.0, text: 'One tap to connect.' },
  { from: 12.6, to: 16.2, text: 'Text.' },
  { from: 16.7, to: 21.0, text: 'Photos.' },
  { from: 21.3, to: 25.3, text: 'Files.' },
  { from: 25.6, to: 28.3, text: 'Encrypted. Nothing is kept.' },
];

function Captions({ t }: { t: number }) {
  return (
    <>
      {CAPTIONS.map((cap) => {
        const inn = easeOut(clamp01((t - cap.from) / 0.45));
        const out = 1 - clamp01((t - (cap.to - 0.4)) / 0.4);
        const o = Math.min(inn, out);
        if (o <= 0.001) return null;
        return (
          <div key={cap.text} className="absolute" style={{ left: 124, bottom: 96, opacity: o, transform: `translateY(${(1 - inn) * 9}px)` }}>
            <div className="flex items-center gap-3.5">
              <span className="h-[1px] w-9" style={{ background: 'rgba(240,100,19,0.8)' }} />
              <span className="text-[22px] font-medium tracking-[-0.012em] text-white/85">{cap.text}</span>
            </div>
          </div>
        );
      })}
    </>
  );
}

declare global {
  interface Window {
    __film?: (t: number) => Promise<void>;
  }
}

export default FilmStage;
