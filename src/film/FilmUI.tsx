import React from 'react';
import { QrArt } from '../components/qr/QrArt';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import { PhoneStatusBar } from '../components/mockups/PhoneFrame';

/**
 * FilmUI — the product, drawn at the size the film needs.
 *
 * Everything here is the real app: the same tokens (#f06413 ember, night-950
 * canvas, apple-tile-1 cards, 14px/12px radii), the same room-code card
 * (a QR plate, six digits in two groups of three, a countdown, Copy code),
 * the same "Room" header with this ⇄ partner and a live link badge, the same
 * composer. What is different from the landing page's miniature demo is
 * DENSITY: these are drawn at native laptop and native phone sizes instead of
 * a 480×300 miniature scaled up 2.4×, so the type in the film is the type the
 * product actually sets — which is most of the difference between "a mockup"
 * and "someone using it".
 *
 * Determinism: nothing in here animates on its own. Every moving part takes a
 * progress value computed from the film clock in FilmStage.
 */

/* ── shared bits ───────────────────────────────────────────────────────── */

const EMBER = '#f06413';

function Glass({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`absolute inset-[6px] overflow-hidden rounded-[10px] bg-[#0b0a09] ${className}`}>{children}</div>;
}

function Dot({ tone = 'success' }: { tone?: 'success' | 'mute' }) {
  return (
    <span
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{ background: tone === 'success' ? '#34c759' : 'rgba(255,255,255,0.25)' }}
    />
  );
}

/* ── the laptop: ShareTexts in a browser, full window ───────────────────── */

export type LaptopState = {
  /** 0 = the room is waiting, 1 = a device is on the other end. */
  linked: number;
  /** Nearby suggestion appears (discovery). */
  nearby: number;
  /** "Connecting…" → "Direct" crossfade progress. */
  handshake: number;
  /** How much of the received thread is on screen. */
  text: number;
  photo: number;
  file: number;
  /** File progress 0..1 (uploads/verifies), then "Saved". */
  fileProgress: number;
  /** Receive pulse, 0..1, decaying. */
  pulse: number;
};

const NOTE = 'Kitchen is 2481 — see you at 7';
const NOTE_TIME = '9:41';

export function LaptopApp(s: LaptopState) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0e0e0e] font-sans text-white antialiased">
      {/* browser chrome */}
      <div className="flex h-[46px] shrink-0 items-center gap-3 border-b border-white/[0.07] bg-[#171614] px-4">
        <span className="flex items-center gap-[7px]">
          <span className="h-[11px] w-[11px] rounded-full bg-[#ff5f57]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#febc2e]" />
          <span className="h-[11px] w-[11px] rounded-full bg-[#28c840]" />
        </span>
        <span className="ml-2 flex h-[27px] flex-1 max-w-[420px] items-center gap-2 rounded-[7px] bg-white/[0.055] px-3">
          <svg viewBox="0 0 12 12" className="h-[9px] w-[9px] text-white/40" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="2.4" y="5.2" width="7.2" height="5.4" rx="1.4" />
            <path d="M4.1 5.2V3.7a1.9 1.9 0 0 1 3.8 0v1.5" />
          </svg>
          <span className="text-[12.5px] font-medium tracking-tight text-white/70">sharetexts.online/r/8QK2LM</span>
        </span>
        <span className="ml-auto flex items-center gap-2 rounded-full bg-white/[0.055] px-2.5 py-[5px] text-[11px] font-semibold text-white/55">
          <svg viewBox="0 0 12 12" className="h-[9px] w-[9px]" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2.2" y="5.2" width="7.6" height="5.2" rx="1.3" />
            <path d="M4 5.2V3.6a2 2 0 0 1 4 0v1.6" />
          </svg>
          Encrypted
        </span>
      </div>

      <div className="flex h-[calc(100%-46px)]">
        {/* left rail */}
        <div className="flex w-[186px] shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-[#121110] px-3 py-4">
          <div className="mb-3 flex items-center gap-2 px-1">
            <ShareTextsLogo size={20} />
            <span className="text-[14.5px] font-bold tracking-[-0.02em]">ShareTexts</span>
          </div>
          <span
            className="mb-2 flex h-[36px] items-center justify-center gap-2 rounded-[10px] text-[13px] font-semibold text-white"
            style={{ background: EMBER, boxShadow: '0 6px 18px -8px rgba(240,100,19,0.8)' }}
          >
            <svg viewBox="0 0 14 14" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M7 2.6v8.8M2.6 7h8.8" strokeLinecap="round" />
            </svg>
            New room
          </span>
          <RailRow label="Nearby" hint="1 device" active={s.nearby > 0.4} icon="radar" />
          <RailRow label="Temporary Space" hint="7 days" icon="clock" />
          <div className="mt-auto px-1 text-[11px] leading-relaxed text-white/35">
            2,094 rooms made so far
            <span className="mt-0.5 block text-white/20">No account needed</span>
          </div>
        </div>

        {/* room panel */}
        <div className="relative flex min-w-0 flex-1 flex-col bg-[#0e0e0e]">
          {/* receive pulse: the whole room warms for a beat as something lands */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10"
            style={{ background: `radial-gradient(70% 60% at 50% 30%, rgba(240,100,19,${0.16 * s.pulse}) 0%, transparent 68%)` }}
          />

          {/* header */}
          <div className="z-20 flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-5 py-3">
            {s.linked > 0.5 ? (
              <>
                <DeviceChip kind="laptop" name="MacBook Pro" />
                <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] shrink-0 text-white/25" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M3 5.5h10M3 10.5h10M5.5 3 3 5.5l2.5 2.5M10.5 8l2.5 2.5-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <DeviceChip kind="phone" name="iPhone" />
                <span className="ml-2 flex items-center gap-[6px] text-[12.5px] font-semibold text-[#34c759]">
                  <Dot />
                  {s.handshake > 0.5 ? 'Direct' : 'Connecting…'}
                </span>
              </>
            ) : (
              <>
                <ShareTextsLogo size={19} />
                <span className="text-[14px] font-semibold">Room</span>
                <span className="text-[12.5px] text-white/35">waiting for your other device</span>
              </>
            )}
            <span className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-full bg-white/[0.05]">
              <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] text-white/45" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="8" cy="8" r="2.2" />
                <path d="M8 1.6v1.6M8 12.8v1.6M1.6 8h1.6M12.8 8h1.6" strokeLinecap="round" />
              </svg>
            </span>
          </div>

          {/* body: either the join card or the thread */}
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <div className="absolute inset-0" style={{ opacity: 1 - s.linked, transform: `scale(${1 - 0.015 * s.linked})` }}>
              <JoinCard nearby={s.nearby} />
            </div>
            <div className="absolute inset-0" style={{ opacity: s.linked, transform: `translateY(${(1 - s.linked) * 14}px)` }}>
              <Thread s={s} />
            </div>
          </div>

          {/* composer */}
          <div className="z-20 shrink-0 border-t border-white/[0.07] px-5 py-3">
            <div className="mx-auto flex w-full max-w-[46rem] items-center gap-2.5">
              <span className="flex h-[40px] flex-1 items-center gap-2 rounded-full bg-white/[0.06] px-3.5">
                <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] text-white/35" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M11.4 7.2 8 10.6a2.4 2.4 0 0 1-3.4-3.4l3.8-3.8a1.6 1.6 0 1 1 2.3 2.3l-3.8 3.8a.8.8 0 0 1-1.1-1.1l3.4-3.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-[13px] text-white/30">Message, link, or drop a file…</span>
              </span>
              <span
                className="flex h-[40px] w-[40px] items-center justify-center rounded-full"
                style={{ background: s.linked > 0.5 ? EMBER : 'rgba(255,255,255,0.08)' }}
              >
                <svg viewBox="0 0 16 16" className="h-[14px] w-[14px] text-white" fill="none" stroke="currentColor" strokeWidth="1.7">
                  <path d="M14 2 7 9M14 2l-4.4 12-2.6-5-5-2.6L14 2Z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function RailRow({ label, hint, icon, active }: { label: string; hint: string; icon: 'radar' | 'clock'; active?: boolean }) {
  return (
    <span className={`flex items-center gap-2 rounded-[8px] px-2 py-[7px] text-[12.5px] ${active ? 'bg-white/[0.06] text-white' : 'text-white/55'}`}>
      {icon === 'radar' ? (
        <svg viewBox="0 0 16 16" className="h-[12px] w-[12px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.6" />
          <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-[12px] w-[12px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="5.8" />
          <path d="M8 4.6V8l2.4 1.6" strokeLinecap="round" />
        </svg>
      )}
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 text-[11px] text-white/30">{hint}</span>
    </span>
  );
}

function DeviceChip({ kind, name }: { kind: 'laptop' | 'phone'; name: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] border border-white/[0.09] bg-white/[0.05] text-white/70">
        {kind === 'laptop' ? (
          <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="2.6" y="3.6" width="10.8" height="7.2" rx="1.3" />
            <path d="M1 13h14" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="h-[13px] w-[13px]" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="4.6" y="1.8" width="6.8" height="12.4" rx="1.8" />
            <path d="M7 12.2h2" strokeLinecap="round" />
          </svg>
        )}
      </span>
      <span className="text-[12.5px] font-semibold text-white/85">{name}</span>
    </span>
  );
}

function JoinCard({ nearby }: { nearby: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      {/* One designed object, not four things floating in a black rectangle:
          the code card is the app's own card, with its segmented control. */}
      <div className="w-[660px] rounded-[18px] border border-white/[0.075] bg-white/[0.025] p-7 shadow-[0_44px_90px_-52px_rgba(0,0,0,1)]">
        <div className="flex items-center justify-between">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-white/45">Room code</p>
          <div className="flex items-center gap-0.5 rounded-[9px] bg-white/[0.055] p-[3px] text-[11.5px] font-semibold">
            <span className="flex h-[24px] items-center rounded-[7px] px-2.5 text-white/45">Code</span>
            <span className="flex h-[24px] items-center rounded-[7px] bg-white/[0.1] px-2.5 text-white">QR</span>
            <span className="flex h-[24px] items-center rounded-[7px] px-2.5 text-white/45">Link</span>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-8">
          <div className="rounded-[13px] bg-[#f8f6f3] p-3.5 shadow-[0_20px_44px_-24px_rgba(0,0,0,1)]">
            <QrArt value="https://sharetexts.online/r/8QK2LM" size={150} label="Room QR code" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-7" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {[0, 3].map((start) => (
                <span key={start} className="flex items-baseline gap-[5px]">
                  {'482916'.slice(start, start + 3).split('').map((d, i) => (
                    <span key={`${start}-${i}`} className="text-[52px] font-bold leading-none tracking-[-0.03em] text-white">
                      {d}
                    </span>
                  ))}
                </span>
              ))}
            </div>
            <p className="mt-3.5 flex items-center gap-1.5 text-[13px] font-medium text-white/45" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <svg viewBox="0 0 16 16" className="h-[12px] w-[12px]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="5.8" />
                <path d="M8 4.8V8l2.2 1.5" strokeLinecap="round" />
              </svg>
              Valid for 4:59 · scan it or type it
            </p>
            <span className="mt-4 flex h-[36px] w-[164px] items-center justify-center gap-2 rounded-[10px] border border-white/[0.13] bg-white/[0.06] text-[12.5px] font-semibold text-white/85">
              <svg viewBox="0 0 16 16" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="5.4" y="5.4" width="8" height="8" rx="1.6" />
                <path d="M10.6 5.4V4a1.6 1.6 0 0 0-1.6-1.6H4A1.6 1.6 0 0 0 2.4 4v5a1.6 1.6 0 0 0 1.6 1.6h1.4" strokeLinecap="round" />
              </svg>
              Copy code
            </span>
          </div>
        </div>
      </div>

      {/* discovery: the other device shows up on its own */}
      <div
        className="mt-5 flex w-[560px] items-center gap-3.5 rounded-[14px] border border-white/[0.1] bg-white/[0.045] px-4 py-3.5"
        style={{ opacity: nearby, transform: `translateY(${(1 - nearby) * 10}px)` }}
      >
        <span className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px]" style={{ background: 'rgba(240,100,19,0.16)' }}>
          <svg viewBox="0 0 16 16" className="h-[16px] w-[16px]" fill="none" stroke={EMBER} strokeWidth="1.5">
            <rect x="4.6" y="1.6" width="6.8" height="12.8" rx="1.9" />
            <path d="M7 12.3h2" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight">Your iPhone</span>
          <span className="mt-1 flex items-center gap-1.5 text-[11.5px] leading-tight text-white/40">
            <Dot />
            Nearby · direct on this network
          </span>
        </span>
        <span className="flex h-[34px] items-center rounded-[10px] px-4 text-[13px] font-semibold text-white" style={{ background: EMBER }}>
          Connect
        </span>
      </div>
    </div>
  );
}

function Thread({ s }: { s: LaptopState }) {
  const item = (on: number, i: number) => ({
    opacity: on,
    transform: `translateY(${(1 - on) * 10}px) scale(${0.985 + 0.015 * on})`,
    transition: 'none',
    marginTop: i === 0 ? 0 : 10,
  });

  return (
    // The app centres the thread and the composer at max-w-3xl (48rem). Drawn
    // full-width, a handful of messages sit in the left third of a 1104px panel
    // and the room looks empty; centred, it is the app.
    <div className="mx-auto flex h-full w-full max-w-[46rem] flex-col justify-end px-6 pb-2 pt-4">
      <div className="mb-3 flex items-center justify-center gap-2 text-[11.5px] font-medium text-white/35">
        <Dot />
        Connected · encrypted, device to device
      </div>

      <div className="flex flex-col items-start" style={item(s.text, 0)}>
        <span className="max-w-[440px] rounded-[14px] rounded-bl-[5px] bg-white/[0.07] px-3.5 py-2.5 text-[13.5px] leading-snug text-white/90">
          {NOTE}
        </span>
        <span className="mt-1 pl-1 text-[10.5px] text-white/30">{NOTE_TIME} · received</span>
      </div>

      <div className="flex flex-col items-start" style={item(s.photo, 1)}>
        <div className="w-[268px] overflow-hidden rounded-[13px] border border-white/[0.08] bg-white/[0.04]">
          <img src="/demo/photo-4x3.jpg" alt="Photo received on the laptop" className="block aspect-[4/3] w-full object-cover" />
          <div className="flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/80">Above the clouds.jpg</span>
            <span className="shrink-0 text-[10.5px] text-white/35">2.4 MB</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start" style={item(s.file, 2)}>
        <div className="flex w-[330px] items-center gap-3 rounded-[13px] border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
          <span className="flex h-[34px] w-[30px] items-center justify-center rounded-[7px] text-[9px] font-bold text-white" style={{ background: EMBER }}>
            PDF
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-semibold leading-tight text-white/85">Q3-budget.pdf</span>
            <span className="mt-1 block text-[10.5px] leading-none text-white/35" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {s.fileProgress >= 1 ? '4.2 MB · Saved to Downloads' : `4.2 MB · ${Math.round(s.fileProgress * 100)}%`}
            </span>
            <span className="mt-1.5 block h-[2px] w-full overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full" style={{ width: `${Math.min(1, s.fileProgress) * 100}%`, background: s.fileProgress >= 1 ? '#34c759' : EMBER }} />
            </span>
          </span>
          <span className="shrink-0 text-[10.5px] text-white/30">{NOTE_TIME}</span>
        </div>
      </div>
    </div>
  );
}

/* ── the phone: the same session from the other side ────────────────────── */

export type PhoneState = {
  /** Connect screen → room. */
  joined: number;
  /** The Connect button's press (0..1, 1 = fully pressed). */
  press: number;
  /** Composer text, character by character. */
  typed: number;
  /** Outgoing rows, 0..1 each. */
  text: number;
  photo: number;
  file: number;
  /** Attachment strip state for the beat in progress. */
  attach: 'none' | 'photo' | 'file';
  attachOn: number;
};

export function PhoneApp(p: PhoneState) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0e0e0e] font-sans text-white antialiased">
      <PhoneStatusBar />
      <div className="absolute inset-0" style={{ opacity: 1 - p.joined }}>
        <PhoneConnect press={p.press} />
      </div>
      <div className="absolute inset-0 flex flex-col" style={{ opacity: p.joined }}>
        <PhoneRoom p={p} />
      </div>
    </div>
  );
}

function PhoneConnect({ press }: { press: number }) {
  return (
    <div className="flex h-full flex-col px-[18px] pb-5 pt-[6px]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShareTextsLogo size={17} />
          <span className="text-[14px] font-bold tracking-[-0.02em]">ShareTexts</span>
        </div>
        <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-white/[0.06]">
          <svg viewBox="0 0 12 12" className="h-[10px] w-[10px] text-white/50" fill="currentColor">
            <circle cx="2.6" cy="6" r="1" />
            <circle cx="6" cy="6" r="1" />
            <circle cx="9.4" cy="6" r="1" />
          </svg>
        </span>
      </div>

      <h1 className="mt-5 text-[25px] font-bold leading-[1.14] tracking-[-0.03em]">
        Send to a<br />device near you.
      </h1>
      <p className="mt-2 text-[12.5px] leading-snug text-white/45">No app. No account. Nothing to install.</p>

      {/* discovery */}
      <div className="mt-5 rounded-[15px] border border-white/[0.09] bg-white/[0.035] p-3">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
          <span className="relative flex h-[7px] w-[7px]">
            <span className="absolute inset-0 rounded-full" style={{ background: 'rgba(52,199,89,0.35)', transform: `scale(${1 + press * 2.2})` }} />
            <span className="absolute inset-0 rounded-full bg-[#34c759]" />
          </span>
          Nearby
        </div>
        <div className="mt-2.5 flex items-center gap-2.5">
          <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] border border-white/[0.08] bg-white/[0.05]">
            <svg viewBox="0 0 16 16" className="h-[15px] w-[15px] text-white/75" fill="none" stroke="currentColor" strokeWidth="1.4">
              <rect x="2.6" y="3.6" width="10.8" height="7.2" rx="1.3" />
              <path d="M1 13h14" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight">MacBook Pro</span>
            <span className="block text-[11px] leading-tight text-white/40">Same network · 1 m away</span>
          </span>
          <span
            className="flex h-[30px] items-center rounded-[9px] px-3 text-[12px] font-semibold text-white"
            style={{
              background: press > 0.05 ? '#d85a10' : EMBER,
              transform: `scale(${1 - 0.04 * press})`,
              boxShadow: `0 0 0 ${press * 8}px rgba(240,100,19,${0.16 * (1 - press) * 3})`,
            }}
          >
            Connect
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 text-[11px] text-white/30">
        <span className="h-[1px] flex-1 bg-white/[0.07]" />
        or enter a code
        <span className="h-[1px] flex-1 bg-white/[0.07]" />
      </div>
      <div className="mt-3 flex justify-center gap-1.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {'482916'.split('').map((d, i) => (
          <span key={i} className="flex h-[38px] w-[30px] items-center justify-center rounded-[8px] border border-white/[0.09] bg-white/[0.03] text-[15px] font-semibold text-white/70">
            {d}
          </span>
        ))}
      </div>

      <p className="mt-auto flex items-center justify-center gap-1.5 text-[10.5px] text-white/30">
        <svg viewBox="0 0 12 12" className="h-[9px] w-[9px]" fill="none" stroke="currentColor" strokeWidth="1.4">
          <rect x="2.2" y="5.2" width="7.6" height="5.2" rx="1.3" />
          <path d="M4 5.2V3.6a2 2 0 0 1 4 0v1.6" />
        </svg>
        Encrypted · nothing is kept
      </p>
    </div>
  );
}

function PhoneRoom({ p }: { p: PhoneState }) {
  const row = (on: number, i: number) => ({ opacity: on, transform: `translateY(${(1 - on) * 12}px) scale(${0.97 + 0.03 * on})`, marginTop: i === 0 ? 0 : 8 });
  const shown = Math.round(NOTE.length * p.typed);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-white/[0.07] px-3.5 py-2.5">
        <span className="flex h-[24px] w-[24px] items-center justify-center rounded-[7px] border border-white/[0.09] bg-white/[0.05]">
          <svg viewBox="0 0 16 16" className="h-[12px] w-[12px] text-white/70" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="4.6" y="1.6" width="6.8" height="12.8" rx="1.9" />
          </svg>
        </span>
        <span className="text-[12px] font-semibold">iPhone</span>
        <svg viewBox="0 0 16 16" className="h-[11px] w-[11px] text-white/25" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M3 5.5h10M3 10.5h10M5.5 3 3 5.5l2.5 2.5M10.5 8l2.5 2.5-2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="text-[12px] font-semibold text-white/70">MacBook Pro</span>
        <span className="ml-auto flex items-center gap-[5px] text-[10.5px] font-semibold text-[#34c759]">
          <Dot />
          Direct
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-end gap-0 px-3 pb-1">
        <div className="mb-2.5 text-center text-[10px] font-medium text-white/30">Connected · encrypted, device to device</div>

        <div className="flex flex-col items-end" style={row(p.text, 0)}>
          <span className="max-w-[230px] rounded-[14px] rounded-br-[5px] px-3 py-2 text-[12.5px] leading-snug text-white" style={{ background: EMBER }}>
            {NOTE}
          </span>
          <span className="mt-1 flex items-center gap-1 pr-1 text-[9.5px] text-white/30">
            9:41
            <svg viewBox="0 0 12 12" className="h-[9px] w-[9px] text-[#34c759]" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M2.2 6.2 4.5 8.5l5-5.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>

        <div className="flex flex-col items-end" style={row(p.photo, 1)}>
          <span className="w-[168px] overflow-hidden rounded-[14px] rounded-br-[5px] border border-white/[0.1]">
            <img src="/demo/photo-4x3.jpg" alt="Photo sent from the phone" className="block aspect-[4/3] w-full object-cover" />
          </span>
          <span className="mt-1 pr-1 text-[9.5px] text-white/30">9:41 · 2.4 MB</span>
        </div>

        <div className="flex flex-col items-end" style={row(p.file, 2)}>
          <span className="flex w-[214px] items-center gap-2 rounded-[14px] rounded-br-[5px] border border-white/[0.1] bg-white/[0.06] px-2.5 py-2">
            <span className="flex h-[26px] w-[23px] items-center justify-center rounded-[6px] text-[8px] font-bold text-white" style={{ background: EMBER }}>
              PDF
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-semibold leading-tight">Q3-budget.pdf</span>
              <span className="block text-[9.5px] leading-tight text-white/35">4.2 MB</span>
            </span>
          </span>
          <span className="mt-1 pr-1 text-[9.5px] text-white/30">9:41</span>
        </div>
      </div>

      {/* attachment strip + composer */}
      <div className="shrink-0 px-3 pb-3">
        <div style={{ opacity: p.attachOn, transform: `translateY(${(1 - p.attachOn) * 8}px)` }}>
          {p.attach === 'photo' && (
            <div className="mb-2 flex items-center gap-2 rounded-[11px] border border-white/[0.09] bg-white/[0.04] p-2">
              <img src="/demo/photo-4x3.jpg" alt="" className="h-[34px] w-[34px] rounded-[6px] object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">Above the clouds.jpg</span>
                <span className="block text-[9.5px] text-white/35">2.4 MB</span>
              </span>
              <span className="text-[10px] text-white/30">Ready</span>
            </div>
          )}
          {p.attach === 'file' && (
            <div className="mb-2 flex items-center gap-2 rounded-[11px] border border-white/[0.09] bg-white/[0.04] p-2">
              <span className="flex h-[26px] w-[23px] items-center justify-center rounded-[6px] text-[8px] font-bold text-white" style={{ background: EMBER }}>
                PDF
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] font-semibold">Q3-budget.pdf</span>
                <span className="block text-[9.5px] text-white/35">4.2 MB</span>
              </span>
              <span className="text-[10px] text-white/30">Ready</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex h-[38px] flex-1 items-center gap-1.5 rounded-full bg-white/[0.06] px-3">
            <svg viewBox="0 0 16 16" className="h-[12px] w-[12px] shrink-0 text-white/35" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M11.4 7.2 8 10.6a2.4 2.4 0 0 1-3.4-3.4l3.8-3.8a1.6 1.6 0 1 1 2.3 2.3l-3.8 3.8a.8.8 0 0 1-1.1-1.1l3.4-3.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="min-w-0 flex-1 overflow-hidden truncate whitespace-nowrap text-[12px] text-white/70">
              {p.typed > 0 && p.typed < 1 ? `${NOTE.slice(0, shown)}` : ''}
              {p.typed === 0 || p.typed >= 1 ? <span className="text-white/30">Message…</span> : null}
            </span>
          </span>
          <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full" style={{ background: EMBER }}>
            <svg viewBox="0 0 16 16" className="h-[13px] w-[13px] text-white" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M14 2 7 9M14 2l-4.4 12-2.6-5-5-2.6L14 2Z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </div>
    </>
  );
}

/* ── payloads in flight ─────────────────────────────────────────────────── */

/** What is crossing the desk right now: the real payload, not an abstract dot. */
export function PacketCard({ kind, scale = 1 }: { kind: 'text' | 'photo' | 'file'; scale?: number }) {
  if (kind === 'photo') {
    return (
      <div className="overflow-hidden rounded-[11px] border border-white/20 bg-[#16140f] shadow-[0_26px_60px_-14px_rgba(0,0,0,0.9)]" style={{ transform: `scale(${scale})` }}>
        <img src="/demo/photo-4x3.jpg" alt="" className="block aspect-[4/3] w-[126px] object-cover" />
      </div>
    );
  }
  if (kind === 'file') {
    return (
      <div className="flex items-center gap-2 rounded-[11px] border border-white/20 bg-[#16140f] px-2.5 py-2 shadow-[0_26px_60px_-14px_rgba(0,0,0,0.9)]" style={{ transform: `scale(${scale})` }}>
        <span className="flex h-[24px] w-[21px] items-center justify-center rounded-[5px] text-[8px] font-bold text-white" style={{ background: EMBER }}>
          PDF
        </span>
        <span className="text-[11px] font-semibold text-white/90">Q3-budget.pdf</span>
      </div>
    );
  }
  return (
    <div className="max-w-[196px] rounded-[12px] px-2.5 py-[7px] text-[11.5px] font-medium leading-snug text-white shadow-[0_26px_60px_-14px_rgba(0,0,0,0.9)]" style={{ background: EMBER, transform: `scale(${scale})` }}>
      {NOTE}
    </div>
  );
}

export { Glass };
