import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { ArrowDown, ArrowUpRight, Check, FileArchive, Link } from 'lucide-react';
import { ShareTextsLogo } from '../components/ShareTextsLogo';
import './reference-film.css';

/** Offline editorial composition. Native screenshots come from two real
 * clients and the local Worker. Nothing here is loaded by the public app. */
export const REFERENCE_DURATION = 24;
type Point = { x: number; y: number; width: number; height: number };
type Metadata = { anchors: Record<string, Point>; actions: { kind: string; x: number; y: number; actor: string }[] };
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const ease = (t: number, start: number, duration: number) => {
  const p = clamp((t - start) / duration);
  return p * p * p * (p * (p * 6 - 15) + 10);
};
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
const visible = (t: number, start: number, end: number, fade = .25) => ease(t, start, fade) * (1 - ease(t, end - fade, fade));
const style = (x: number, y: number, scale = 1, rotate = 0): React.CSSProperties => ({ transform: `translate(${x}px,${y}px) translate(-50%,-50%) scale(${scale}) rotate(${rotate}deg)` });

function Browser({ children, className = '', label = 'sharetexts.online' }: { children: React.ReactNode; className?: string; label?: string }) {
  return <div className={`rf-browser ${className}`}><div className="rf-toolbar"><div className="rf-traffic"><i /><i /><i /></div><span>{label}</span><ArrowUpRight size={18} /></div><div className="rf-screen">{children}</div></div>;
}

function Phone({ children }: { children: React.ReactNode }) {
  return <div className="rf-phone"><div className="rf-phone-screen">{children}</div><div className="rf-island" /><div className="rf-home" /></div>;
}

function Caption({ children, opacity = 1, y = 0 }: { children: React.ReactNode; opacity?: number; y?: number }) {
  return <div className="rf-title" style={{ opacity, transform: `translateY(${y}px)` }}>{children}</div>;
}

/** Preserve exact native pixels while allowing a camera-sized crop. */
function Native({ root, actor = 'laptop', state, crop, width, height }: { root: string; actor?: 'laptop' | 'phone'; state: string; crop?: Point; width: number; height: number }) {
  const nativeWidth = actor === 'phone' ? 402 : 1008;
  const box = crop || { x: nativeWidth / 2, y: (actor === 'phone' ? 774 : 655) / 2, width: nativeWidth, height: actor === 'phone' ? 774 : 655 };
  const scale = Math.max(width / box.width, height / box.height);
  return <div className="rf-native" style={{ width, height }}><img src={`${root}/native-${actor}/state-${state}.jpg`} style={{ width: nativeWidth * scale, left: width / 2 - box.x * scale, top: height / 2 - box.y * scale }} /></div>;
}

function NativeMovie({ root, movie, video, width, height, playing }: { root: string; movie: Point; video: Point; width: number; height: number; playing: boolean }) {
  const crop = movie;
  const scale = Math.max(width / crop.width, height / crop.height);
  return <div className="rf-native-movie" style={{ width, height }}>
    <Native root={root} state="playback-0" crop={crop} width={width} height={height} />
    {playing && <video muted playsInline preload="auto" src="/film/out/fixtures/Earth%20%E2%80%94%20NASA.mp4" style={{ position: 'absolute', left: width / 2 + (video.x - video.width / 2 - crop.x) * scale, top: height / 2 + (video.y - video.height / 2 - crop.y) * scale, width: video.width * scale, height: video.height * scale }} />}
  </div>;
}

function Cursor({ x, y, opacity = 1, pressed = false }: { x: number; y: number; opacity?: number; pressed?: boolean }) {
  return <svg className="rf-cursor" style={{ transform: `translate(${x}px,${y}px) scale(${pressed ? .88 : 1})`, opacity }} width="40" height="48" viewBox="0 0 32 40"><path d="M3 2v29l7.6-7.2 6.2 13.4 5.6-2.6-6.2-13.2 10.6-1.1Z" fill="#202020" stroke="white" strokeWidth="2.5" strokeLinejoin="round" /></svg>;
}

export function ReferenceFilm() {
  const params = new URLSearchParams(location.search);
  const dark = params.get('theme') === 'dark';
  const phone = params.get('framing') === 'phone';
  const W = phone ? 1440 : 1920;
  const root = `/film/out/launch-v5-${dark ? 'dark' : 'light'}`;
  const pairingRoot = `/film/out/reference-pairing-${dark ? 'dark' : 'light'}`;
  const photo = '/film/out/fixtures/Earth%20%E2%80%94%20NASA.jpg';
  const [t, setT] = useState(0);
  const [meta, setMeta] = useState<Metadata | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch(`${root}/native-ui.json`).then(r => { if (!r.ok) throw Error('Capture native footage first'); return r.json(); }).then(value => {
      if (!alive) return;
      if (value.captureVersion !== 4) throw Error('Reference film requires captureVersion 4 native checkpoints');
      setMeta(value);
      window.__film = async time => {
        flushSync(() => setT(time >= REFERENCE_DURATION ? 0 : Math.max(0, time)));
        await Promise.all([...document.images].filter(i => i.getBoundingClientRect().width).map(i => i.decode()));
        const video = document.querySelector<HTMLVideoElement>('.rf-native-movie video');
        if (video && time >= 16.05 && time < 18.65) {
          if (video.readyState < 2) await new Promise<void>((resolve, reject) => { video.addEventListener('loadeddata', () => resolve(), { once: true }); video.addEventListener('error', () => reject(Error('Video source unavailable')), { once: true }); });
          const target = Math.min(video.duration - .04, Math.max(0, time - 16.05));
          if (Math.abs(video.currentTime - target) > .002) await new Promise<void>(resolve => { video.addEventListener('seeked', () => resolve(), { once: true }); video.currentTime = target; });
        }
      };
    }).catch(error => setTimeout(() => { throw error; }));
    return () => { alive = false; delete window.__film; };
  }, [root]);
  const anchor = (key: string, fallback: Point): Point => meta?.anchors[key] || fallback;
  const text = anchor('laptop-text', { x: 520, y: 350, width: 440, height: 220 });
  const file = anchor('laptop-file', { x: 520, y: 380, width: 440, height: 160 });
  const fileCrop = phone ? { ...file, x: file.x - 80, width: 350, height: 175 } : { ...file, width: Math.max(file.width + 60, 515), height: Math.max(file.height + 45, 190) };
  const fileWidth = phone ? 1080 : 1160;
  const fileHeight = phone ? 520 : 350;
  const fileScale = Math.max(fileWidth / fileCrop.width, fileHeight / fileCrop.height);
  const download = meta?.actions.find(action => action.actor === 'laptop' && action.kind === 'save');
  const downloadX = W / 2 + (phone ? 90 : 150) + ((download?.x ?? file.x - 170) - fileCrop.x) * fileScale;
  const downloadY = 675 + ((download?.y ?? file.y + 50) - fileCrop.y) * fileScale;
  const picture = anchor('laptop-photo', { x: 520, y: 350, width: 440, height: 260 });
  const movie = anchor('laptop-video-card', { x: 520, y: 380, width: 440, height: 280 });
  const video = anchor('laptop-video', { x: 520, y: 335, width: 440, height: 247.5 });
  const opening = t < 3.35 || t >= 23.35;
  const ot = t >= 23.35 ? 0 : t;
  const flight = ease(ot, .65, 1.05);
  const push = ease(ot, 2.65, .7);
  const browserX = phone ? 940 : 1280;
  const phoneX = phone ? 385 : 490;
  const browserW = phone ? 740 : 920;
  const phoneW = phone ? 264 : 300;
  const backdrop = <div className="rf-light-field"><div /><div /></div>;

  return <div className={`rf-stage${dark ? ' rf-dark' : ''}${phone ? ' rf-compact' : ''}`} style={{ width: W }} data-film-time={t}>
    {backdrop}
    {opening && <div className="rf-scene rf-opening" style={{ opacity: t >= 23.35 ? ease(t, 23.35, .3) : 1 - ease(t, 3.08, .27), transform: `scale(${1 + push * 1.8})`, transformOrigin: `${browserX}px 620px` }}>
      <Caption opacity={1 - push}>{ot < 1.5 ? 'A photo on your phone.' : 'Now on your laptop.'}</Caption>
      <div className="rf-device rf-opening-phone" style={{ ...style(phoneX - push * 300, 650, 1 - flight * .08, lerp(-9, -5, flight)), width: phoneW }}>
        <Phone><img className="rf-full-photo" src={photo} /><div className="rf-photo-overlay"><span>Earth — NASA.jpg</span><span>ShareTexts <ArrowUpRight size={20} /></span></div></Phone>
      </div>
      <div className="rf-device rf-opening-browser" style={{ ...style(browserX, 650, lerp(.96, 1, flight), lerp(5, 0, flight)), width: browserW }}>
        <Browser><Native root={root} state={flight > .9 ? 'photo-open' : 'initial'} width={browserW} height={browserW * .65} /></Browser><div className="rf-laptop-base" />
      </div>
      <div className="rf-flying-photo" style={{ ...style(lerp(phoneX, browserX, flight), 620 - Math.sin(flight * Math.PI) * 180, lerp(.48, .95, flight), lerp(-9, 0, flight)), opacity: visible(ot, .5, 1.85, .18), width: phone ? 620 : 760 }}><img src={photo} /><div className="rf-receipt"><Check size={24} /> Received</div></div>
      <div className="rf-device-label" style={{ left: phoneX, top: 1010, opacity: 1 - push }}>Phone</div><div className="rf-device-label" style={{ left: browserX, top: 1010, opacity: 1 - push }}>Laptop</div>
    </div>}

    {t >= 3.05 && t < 6.3 && <div className="rf-scene rf-pairing" style={{ opacity: visible(t, 3.05, 6.3, .25) }}>
      <Caption opacity={1 - ease(t, 6, .2)} y={lerp(24, 0, ease(t, 3.05, .6))}>One code connects them.</Caption>
      <div className="rf-pair-panels" style={{ transform: `translate(-50%,-50%) scale(${lerp(.92, 1, ease(t, 3.1, .8))})` }}>
        <div className="rf-pair-panel" style={{ transform: `perspective(1600px) rotateY(${lerp(12, 0, ease(t, 3.2, .9))}deg)` }}><img src={`${pairingRoot}/${t < 5.15 ? 'send' : 'connected-send'}.jpg`} /><div className="rf-pair-tag">Send</div></div>
        <div className="rf-pair-arrow"><ArrowUpRight size={52} /></div>
        <div className="rf-pair-panel" style={{ transform: `perspective(1600px) rotateY(${lerp(-12, 0, ease(t, 3.2, .9))}deg)` }}><img src={`${pairingRoot}/${t < 4.55 ? 'receive' : t < 5.15 ? 'filled' : 'connected-receive'}.jpg`} /><div className="rf-pair-tag">Receive</div></div>
      </div>
      <div className="rf-connected" style={{ opacity: ease(t, 5, .25), transform: `translate(-50%,${lerp(20, 0, ease(t, 5, .4))}px)` }}><Check size={28} /> Connected</div>
    </div>}

    {t >= 6 && t < 9.5 && <div className="rf-scene rf-text-scene" style={{ opacity: visible(t, 6, 9.5), transform: `translateX(${-ease(t, 9.1, .4) * W}px)` }}>
      <Caption opacity={ease(t, 6.2, .2)}>Text and links.</Caption>
      <div className="rf-text-source rf-glass" style={{ ...style(phone ? W / 2 : 600, 540, lerp(.92, 1, ease(t, 6, .6)), -3), width: phone ? 1180 : 880, opacity: 1 - ease(t, 7.2, .45) }}>
        <div className="rf-app-heading"><ShareTextsLogo size={40} /><span>My phone</span><ArrowUpRight size={28} /></div>
        <Native root={root} actor="phone" state="text-composed" crop={{ x: 201, y: 719, width: 402, height: 110 }} width={phone ? 1180 : 880} height={phone ? 323 : 240} />
      </div>
      <div className="rf-text-destination rf-glass" style={{ ...style(lerp(phone ? 920 : 1240, W / 2, ease(t, 7.2, .65)), lerp(680, 605, ease(t, 7.2, .65)), lerp(.8, 1, ease(t, 6.75, .8)), lerp(3, 0, ease(t, 7.2, .65))), width: phone ? 1060 : 1230, opacity: ease(t, 6.7, .3) }}>
        <div className="rf-app-heading"><ShareTextsLogo size={40} /><span>My laptop</span><span className="rf-direct"><i /> Direct</span></div>
        <Native root={root} state={t < 8.12 ? 'text-received' : 'text-copied'} crop={{ ...text, width: phone ? text.width + 48 : Math.max(text.width + 64, 550), height: phone ? text.height + 32 : Math.max(text.height + 80, 235) }} width={phone ? 1060 : 1230} height={390} />
      </div>
      <div className="rf-copy-confirm" style={{ opacity: visible(t, 8.15, 9.4, .15) }}><Check size={28} /> Copied</div>
    </div>}

    {t >= 9.1 && t < 12.5 && <div className="rf-scene rf-file-scene" style={{ opacity: visible(t, 9.1, 12.5), transform: `translateX(${(1 - ease(t, 9.1, .45)) * W}px)` }}>
      <Caption opacity={1 - ease(t, 12.1, .2)}>Files. Without a cable.</Caption>
      <div className="rf-archive-art" style={{ ...style(W / 2 - (phone ? 390 : 530), 615, lerp(.8, 1, ease(t, 9.25, .7)), lerp(-16, -7, ease(t, 9.25, .7))), opacity: ease(t, 9.2, .4) }}><FileArchive size={180} strokeWidth={1.2} /><span>.zip</span></div>
      <div className="rf-file-receipt rf-glass" style={{ ...style(W / 2 + (phone ? 90 : 150), 625, lerp(.88, 1, ease(t, 9.4, .7)), lerp(5, 0, ease(t, 9.4, .7))), width: fileWidth }}>
        <div className="rf-app-heading"><ShareTextsLogo size={40} /><span>Received on your laptop</span><Check size={28} /></div>
        <Native root={root} state={t < 11 ? 'file-received' : 'file-downloaded'} crop={fileCrop} width={fileWidth} height={fileHeight} />
      </div>
      <div className="rf-download-confirm" style={{ top: phone ? 1002 : 925, opacity: visible(t, 11.05, 12.4, .18), transform: `translate(-50%,${lerp(12, 0, ease(t, 11.05, .3))}px)` }}><ArrowDown size={26} /> Downloaded</div>
      <Cursor x={lerp(downloadX + 115, downloadX, ease(t, 10.25, .5))} y={lerp(downloadY + 160, downloadY, ease(t, 10.25, .5))} opacity={visible(t, 10.25, 11.55, .2)} pressed={t > 10.92 && t < 11.05} />
    </div>}

    {t >= 12.15 && t < 15.35 && <div className="rf-scene rf-photo-scene" style={{ opacity: visible(t, 12.15, 15.35, .2) }}>
      <Caption opacity={ease(t, 12.35, .2) * (1 - ease(t, 13.6, .6))}>Photos. In full.</Caption>
      <div className="rf-photo-native rf-glass" style={{ ...style(W / 2, 625, lerp(.94, 1, ease(t, 12.15, .6))), opacity: 1 - ease(t, 13.4, .35), width: phone ? 880 : 980 }}><Native root={root} state="photo-received" crop={picture} width={phone ? 880 : 980} height={phone ? 656 : 731} /></div>
      <div className="rf-photo-portal" style={{ ...style(W / 2, lerp(625, 540, ease(t, 13.45, .9)), lerp(.5, 1.05, ease(t, 13.45, .9))), width: W, height: 1080, opacity: ease(t, 13.35, .3) }}><img src={photo} /><div className="rf-portal-caption">Earth — NASA.jpg <Check size={28} /></div></div>
    </div>}

    {t >= 15.05 && t < 18.65 && <div className="rf-scene rf-video-scene" style={{ opacity: visible(t, 15.05, 18.65, .2) }}>
      <Caption opacity={ease(t, 15.1, .4) * (1 - ease(t, 18.2, .2))}>Videos, too.</Caption>
      <div className="rf-video-native" style={{ ...style(W / 2, 630, lerp(1.12, 1, ease(t, 15.05, .7))), width: phone ? 1030 : 1160 }}><NativeMovie root={root} movie={movie} video={video} width={phone ? 1030 : 1160} height={(phone ? 1030 : 1160) * movie.height / movie.width} playing={t >= 16.05} /></div>
    </div>}

    {t >= 18.35 && t < 21.1 && <div className="rf-scene rf-carousel-scene" style={{ opacity: visible(t, 18.35, 21.1, .2) }}>
      <Caption opacity={ease(t, 18.45, .25)}>Across your screens.</Caption>
      {[0, 1, 2, 3, 4].map((i) => {
        const p = ease(t, 18.45 + Math.abs(i - 2) * .07, .7);
        const shift = ease(t, 19.4, 1.2);
        const x = (i - 2) * (phone ? 325 : 400) - shift * 100;
        const central = i === 2;
        const position = style(W / 2 + x, 640 + Math.abs(i - 2) * 35 + (1 - p) * 260, central ? 1 : .88, lerp((i - 2) * 9, (i - 2) * 5, p));
        return <div key={i} className={`rf-carousel-card rf-carousel-${i}`} style={{ ...position, transform: `${position.transform} perspective(1600px) rotateY(${(i - 2) * -14}deg)`, opacity: p, zIndex: 5 - Math.abs(i - 2), transformOrigin: 'center', width: phone ? 360 : 430 }}>
          {i === 0 ? <div className="rf-note"><Link size={42} /><span>Look at this view.</span><small>nasa.gov/earth</small></div> : i === 1 ? <img className="rf-carousel-photo" src={photo} /> : i === 2 ? <Phone><Native root={root} actor="phone" state="final" width={phone ? 336 : 406} height={680} /></Phone> : i === 3 ? <div className="rf-zip-card"><FileArchive size={100} strokeWidth={1.3} /><span>Earth photos.zip</span><small><Check size={20} /> Received</small></div> : <Browser><Native root={root} state="final" width={phone ? 360 : 430} height={420} /></Browser>}
        </div>;
      })}
    </div>}

    {t >= 21.05 && <div className="rf-scene rf-ending" style={{ opacity: visible(t, 21.05, 23.45, .3), transform: `scale(${lerp(.95, 1, ease(t, 21.05, .8))})` }}><div className="rf-end-brand"><ShareTextsLogo size={phone ? 160 : 190} /><span>ShareTexts</span></div><div className="rf-end-benefit">No account. No app.</div><div className="rf-end-url">sharetexts.online <ArrowUpRight size={30} /></div></div>}
  </div>;
}
