import React, { useEffect, useState } from 'react';
import { LaptopFrame } from '../components/mockups/LaptopFrame';
import { PhoneFrame } from '../components/mockups/PhoneFrame';
import { RoomWindow, PhoneScreen } from '../components/HeroDeviceDemo';
import { ShareTextsLogo } from '../components/ShareTextsLogo';

/**
 * FilmStage — the hero film, rendered from the product itself.
 *
 * There is no Blender here and no invented UI: the surfaces are the SAME
 * components the landing page renders (LaptopFrame, PhoneFrame, RoomWindow,
 * PhoneScreen), so every pixel of interface in the film is the real one. What
 * this file adds is the part a screenshot cannot: a camera, light, and a
 * clock.
 *
 * The clock is the whole trick. `window.__film(t)` sets the scene to an exact
 * time and resolves after two frames are committed, and nothing in the scene
 * animates on its own (CSS animation is disabled in film.html). So the capture
 * rig can ask for t = 13.2083 and get the same frame every time, which is what
 * makes a 33-second film reproducible instead of a screen recording of luck.
 *
 * Coordinate system is the frame: 1920 × 1080, origin top-left. The camera
 * dollies and orbits the WORLD inside that frame; the devices live at fixed
 * world coordinates so the packet can fly between two known points.
 */

const STAGE_W = 1920;
const STAGE_H = 1080;
export const DURATION = 36.0;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
const easeOut = (p: number) => 1 - (1 - p) ** 3;

type Cam = { s: number; x: number; y: number; ry: number; rx: number };
const cam = (s: number, x = 0, y = 0, ry = 0, rx = 0): Cam => ({ s, x, y, ry, rx });

/* The shot list. Each entry is one deliberate camera move — a push-in, a
   drift toward one surface, a pull-back. No handheld, no bounce. */
const SHOTS: { from: number; to: number; a: Cam; b: Cam }[] = [
  { from: 0.0, to: 4.2, a: cam(0.99, 0, 6, 0.6), b: cam(1.04, -16, -2, -1.2) },
  { from: 4.2, to: 9.2, a: cam(1.06, -34, -6, -2), b: cam(1.1, -86, -12, -3) },
  { from: 9.2, to: 13.4, a: cam(1.14, -300, -14, -3), b: cam(1.22, -740, -30, -4.5) },
  // The send happens in the WIDE part of this move, on purpose: a payload
  // that lands on a device cropped out of frame is a payload nobody sees
  // arrive. The push into the laptop comes after the landing.
  { from: 13.4, to: 15.6, a: cam(1.09, -30, -6, -2.4), b: cam(1.14, -70, -12, -3.2) },
  { from: 15.6, to: 18.6, a: cam(1.18, 240, -8, -3), b: cam(1.22, 300, -14, -4) },
  { from: 18.6, to: 22.6, a: cam(1.12, -56, -4, -2.6), b: cam(1.1, -104, -12, -3.4) },
  { from: 22.6, to: 27.2, a: cam(1.2, -700, -10, -3.4), b: cam(1.14, -260, 0, -2.2) },
  { from: 27.2, to: 30.2, a: cam(1.05, -18, 0, -0.8), b: cam(0.98, 0, 6, 0) },
];

/** Rack focus. Two devices in one frame are two depths; without this the shot
 *  reads as two pictures glued to the same wall. 1.5px at 1080p is enough to
 *  say which surface the camera is thinking about, and subtle enough that the
 *  soft one is still legible. */
function rackFocus(t: number): { laptop: number; phone: number } {
  const seg = (a: number, b: number, v: number) => clamp01((v - a) / (b - a));
  const onPhone = Math.max(
    Math.min(seg(9.4, 10.2, t), 1 - seg(13.2, 13.9, t)),
    Math.min(seg(22.8, 23.5, t), 1 - seg(26.6, 27.3, t)),
  );
  const onLaptop = Math.min(seg(15.6, 16.3, t), 1 - seg(18.0, 18.6, t));
  return { laptop: clamp01(onPhone) * 1.5, phone: clamp01(onLaptop) * 1.5 };
}

/* World layout. The gap between the two glasses is deliberately wide enough to
   read as a flight rather than a hop. */
const LAPTOP = { left: 108, top: 112, width: 1112 };
const LAPTOP_SCREEN_W = LAPTOP.width - 14; // LaptopFrame bezel
const LAPTOP_NATIVE = { w: 480, h: 300 }; // 16:10, and the UI's own density
const PHONE = { left: 1452, top: 140, width: 398 };
const PHONE_SCREEN_W = PHONE.width * (1 - 0.09); // PhoneFrame 4.5% padding
const PHONE_NATIVE = { w: 170, h: 170 * (19.5 / 9) };

const PACKET_A = { x: LAPTOP.left + LAPTOP.width + 4, y: LAPTOP.top + 300 };
const PACKET_B = { x: PHONE.left + 16, y: PHONE.top + 330 };

const FLIGHTS = [
  { from: 13.9, to: 15.3, reverse: false },
  { from: 19.2, to: 20.6, reverse: false },
  { from: 23.6, to: 25.0, reverse: true },
];

const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 4.9, to: 9.0, text: 'No app. No account.' },
  { from: 9.6, to: 13.0, text: 'Your other device appears.' },
  { from: 13.6, to: 18.0, text: 'Connect once. Send anything.' },
  { from: 20.4, to: 26.6, text: 'Encrypted. Nothing is kept.' },
];

function Fit({
  nativeW,
  nativeH,
  targetW,
  children,
}: {
  nativeW: number;
  nativeH: number;
  targetW: number;
  children: React.ReactNode;
}) {
  const k = targetW / nativeW;
  return (
    <div className="absolute left-0 top-0 overflow-hidden" style={{ width: targetW, height: Math.round(nativeH * k) }}>
      <div className="origin-top-left" style={{ width: nativeW, height: nativeH, transform: `scale(${k})` }}>
        {children}
      </div>
    </div>
  );
}

function Packet({ t }: { t: number }) {
  const active = FLIGHTS.find((f) => t >= f.from && t <= f.to);
  if (!active) return null;
  const p = clamp01((t - active.from) / (active.to - active.from));
  const e = easeInOut(p);
  const from = active.reverse ? PACKET_B : PACKET_A;
  const to = active.reverse ? PACKET_A : PACKET_B;
  const x = lerp(from.x, to.x, e);
  const y = lerp(from.y, to.y, e) - Math.sin(e * Math.PI) * 58;

  return (
    <>
      {/* trail: three ghosts, thinner and fainter the further back they are */}
      {[0.05, 0.1, 0.15].map((lag, i) => {
        const ep = easeInOut(clamp01(p - lag));
        const tx = lerp(from.x, to.x, ep);
        const ty = lerp(from.y, to.y, ep) - Math.sin(ep * Math.PI) * 58;
        return (
          <div
            key={lag}
            className="absolute rounded-full bg-ember"
            style={{
              left: tx,
              top: ty,
              width: 9 - i * 2,
              height: 9 - i * 2,
              transform: 'translate(-50%, -50%)',
              opacity: 0.32 - i * 0.09,
              filter: 'blur(1.5px)',
            }}
          />
        );
      })}
      <div
        className="absolute"
        style={{
          left: x,
          top: y,
          transform: `translate(-50%, -50%) rotate(${lerp(-4, 4, e)}deg) scale(${lerp(0.98, 1, p)})`,
        }}
      >
        <div className="flex items-center gap-2 rounded-[14px] border border-white/15 bg-ember py-[10px] pl-[10px] pr-4 shadow-[0_22px_48px_-14px_rgba(0,0,0,0.85),0_0_36px_-6px_rgba(240,100,19,0.55)]">
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-white/25 text-[10px] font-bold leading-none text-white">
            PDF
          </span>
          <span className="text-[17px] font-semibold leading-none text-white">plan.pdf</span>
        </div>
      </div>
    </>
  );
}

export function FilmStage() {
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

  const shot = SHOTS.find((s) => t < s.to) ?? SHOTS[SHOTS.length - 1];
  const sp = easeInOut(clamp01((t - shot.from) / (shot.to - shot.from)));
  const c: Cam = {
    s: lerp(shot.a.s, shot.b.s, sp),
    x: lerp(shot.a.x, shot.b.x, sp),
    y: lerp(shot.a.y, shot.b.y, sp),
    ry: lerp(shot.a.ry, shot.b.ry, sp),
    rx: lerp(shot.a.rx, shot.b.rx, sp),
  };

  const focus = rackFocus(t);
  const onRoom = t >= 9.2;
  const laptopLinked = t >= 12.4;
  const laptopSent = t >= 13.9;
  const laptopArrived = t >= 20.6;
  const phoneJoined = t >= 13.0;
  const phoneTyping = t >= 11.6 && t < 13.0;
  const phoneArrived = t >= 15.3;
  const phoneFlying = t >= 13.9 && t < 15.3;

  const intro = clamp01(t / 0.9);
  const worldOut = 1 - clamp01((t - 30.0) / 0.7);
  const endIn = clamp01((t - 30.35) / 0.9);

  return (
    <div
      style={{ width: STAGE_W, height: STAGE_H }}
      className="relative overflow-hidden bg-[#070605] select-none"
    >
      {/* ── the room: a warm practical light behind the desk ───────────── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 86% at 50% -14%, #3a2417 0%, #1c1310 34%, #0d0a09 62%, #060505 100%)',
        }}
      />

      {/* ── the world ─────────────────────────────────────────────────── */}
      <div className="absolute inset-0" style={{ perspective: '2400px', opacity: worldOut }}>
        <div
          className="absolute inset-0"
          style={{
            transformOrigin: '960px 540px',
            transform: `translate(${c.x}px, ${c.y}px) scale(${c.s}) rotateY(${c.ry}deg) rotateX(${c.rx}deg)`,
            transformStyle: 'preserve-3d',
            opacity: intro,
            filter: 'brightness(1.06) saturate(1.04)',
          }}
        >
          {/* desk surface: one wide sheen so the devices sit ON something */}
          <div
            className="absolute"
            style={{
              left: -420,
              top: 700,
              width: 2760,
              height: 560,
              background:
                'radial-gradient(52% 90% at 50% 0%, rgba(255,206,158,0.26) 0%, rgba(255,150,80,0.08) 34%, rgba(0,0,0,0) 70%)',
              filter: 'blur(14px)',
            }}
          />
          {/* warm bounce behind the phone: the practical is behind it */}
          <div
            className="absolute rounded-full"
            style={{
              left: PHONE.left - 190,
              top: PHONE.top - 150,
              width: PHONE.width + 380,
              height: 700,
              background:
                'radial-gradient(ellipse at center, rgba(255,176,102,0.20) 0%, rgba(255,140,60,0.06) 45%, rgba(0,0,0,0) 72%)',
              filter: 'blur(26px)',
            }}
          />

          {/* ── laptop ──────────────────────────────────────────────── */}
          <div
            className="absolute"
            style={{ left: LAPTOP.left, top: LAPTOP.top, width: LAPTOP.width, filter: focus.laptop > 0.05 ? `blur(${focus.laptop}px)` : undefined }}
          >
            <div
              className="absolute"
              style={{
                left: '2%',
                width: '96%',
                top: '94%',
                height: 74,
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(16px)',
              }}
            />
            <LaptopFrame label="ShareTexts on a laptop">
              {onRoom ? (
                <Fit nativeW={LAPTOP_NATIVE.w} nativeH={LAPTOP_NATIVE.h} targetW={LAPTOP_SCREEN_W}>
                  <RoomWindow
                    linked={laptopLinked}
                    sent={laptopSent}
                    arrived={laptopArrived}
                    closed={false}
                  />
                </Fit>
              ) : (
                <img
                  src="/film/assets/landing-laptop.png"
                  alt="ShareTexts open in a browser on a laptop"
                  className="block h-full w-full object-cover"
                />
              )}
            </LaptopFrame>
          </div>

          {/* ── phone ───────────────────────────────────────────────── */}
          <div
            className="absolute"
            style={{ left: PHONE.left, top: PHONE.top, width: PHONE.width, filter: focus.phone > 0.05 ? `blur(${focus.phone}px)` : undefined }}
          >
            <div
              className="absolute"
              style={{
                left: '-14%',
                width: '128%',
                top: '97%',
                height: 46,
                background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 70%)',
                filter: 'blur(12px)',
              }}
            />
            <PhoneFrame label="ShareTexts on a phone">
              {onRoom ? (
                <Fit nativeW={PHONE_NATIVE.w} nativeH={PHONE_NATIVE.h} targetW={PHONE_SCREEN_W}>
                  <div className="h-full w-full">
                    <PhoneScreen
                      joined={phoneJoined}
                      typing={phoneTyping}
                      flying={phoneFlying}
                      arrived={phoneArrived}
                      closed={false}
                      bump={phoneArrived ? 1 : 0}
                    />
                  </div>
                </Fit>
              ) : (
                <img
                  src="/film/assets/landing-phone.png"
                  alt="ShareTexts open in a browser on a phone"
                  className="block h-full w-full object-cover"
                />
              )}
            </PhoneFrame>
          </div>

          <Packet t={t} />
        </div>
      </div>

      {/* ── captions ──────────────────────────────────────────────────── */}
      {CAPTIONS.map((cap) => {
        const inn = easeOut(clamp01((t - cap.from) / 0.5));
        const out = 1 - clamp01((t - (cap.to - 0.45)) / 0.45);
        const o = Math.min(inn, out);
        if (o <= 0.001) return null;
        return (
          <div
            key={cap.text}
            className="absolute"
            style={{ left: 132, bottom: 116, opacity: o, transform: `translateY(${(1 - inn) * 10}px)` }}
          >
            <div className="flex items-center gap-3">
              <span className="h-[1px] w-8 bg-ember/70" />
              <span className="text-[21px] font-medium tracking-[-0.01em] text-white/85">{cap.text}</span>
            </div>
          </div>
        );
      })}

      {/* ── end card ──────────────────────────────────────────────────── */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{
          opacity: endIn,
          // The card holds for six seconds while the last line is spoken. A
          // card that holds perfectly still reads as a freeze frame; this keeps
          // drifting for as long as it is on screen.
          transform: `scale(${
            lerp(1.02, 1, endIn) * lerp(1, 1.012, clamp01((t - 30.35) / (DURATION - 30.35)))
          })`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(90% 70% at 50% 44%, rgba(240,100,19,0.10) 0%, rgba(0,0,0,0) 62%)',
          }}
        />
        <div className="flex items-center gap-4">
          <ShareTextsLogo size={54} />
          <span className="text-[58px] font-bold tracking-[-0.03em] text-white">ShareTexts</span>
        </div>
        <p className="mt-8 text-[34px] font-medium tracking-[-0.015em] text-white/88">
          Move anything between your devices.
        </p>
        <p className="mt-5 text-[19px] tracking-[0.02em] text-white/45">sharetexts.online</p>
        <p className="mt-10 text-[15px] tracking-[0.16em] text-white/30">NO APP · NO ACCOUNT · NO CABLE</p>
      </div>

      {/* ── grade: vignette, warmth, grain ────────────────────────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 200px 48px rgba(0,0,0,0.6)',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 76%, rgba(0,0,0,0.38) 100%)',
        }}
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.05, mixBlendMode: 'overlay' }}
        aria-hidden
      >
        <filter id="film-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="3" stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain)" />
      </svg>
    </div>
  );
}

declare global {
  interface Window {
    __film?: (t: number) => Promise<void>;
  }
}

export default FilmStage;
