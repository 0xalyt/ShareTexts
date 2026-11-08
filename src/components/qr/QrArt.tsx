import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * QrArt — the room's join code, drawn rather than stamped.
 *
 * A stock QR component paints a grid of 1px squares inside a white box. That
 * reads as a form field, not as the one thing on the screen someone has to
 * point a phone at. This draws the same symbol with the app's own material:
 * one dot per module, rounded finder patterns, and the ShareTexts mark sitting
 * in the middle of the symbol instead of beside it.
 *
 * Two revisions shaped the current look:
 *
 *   - The card follows the theme. It used to be near-black in both modes,
 *     which made a heavy black slab the loudest object on a cream page and an
 *     edge-less rectangle on a graphite one. Light mode is now ink on paper;
 *     dark mode is the same ink on a dimmed paper card, so the code reads as a
 *     physical thing lying on the screen and it scans with normal polarity
 *     (dark modules on a light field) in both modes — the polarity some
 *     scanners refuse.
 *   - The quiet zone grew from three modules to four, so the finder patterns
 *     stop crowding the rounded corners. The dot radius went up a little at
 *     the same time: bolder modules read better at arm's length, which is
 *     exactly where this symbol gets used.
 *
 * Nothing about that is free. Three rules keep it scannable:
 *
 *   1. Error correction is level H (~30% recoverable), so punching a hole for
 *      the logo costs nothing that matters — the hole is about 4% of the grid.
 *   2. Modules inside the logo's radius are skipped outright, not drawn over,
 *      so no light dot peeks out from behind the chip.
 *   3. The card itself is the quiet zone: four modules of flat colour on every
 *      side, and the finder patterns are never touched.
 *
 * `scripts/verify-qr.mjs` decodes this exact output with jsQR at three sizes,
 * in both themes, so a redesign cannot quietly break it.
 */

export type QrArtProps = {
  /** What the code encodes — the room's join URL. */
  value: string;
  /** Rendered edge in CSS px. */
  size?: number;
  /** Accessible name; defaults to a generic join description. */
  label?: string;
  className?: string;
  /** Set false to draw the symbol without the centre chip. */
  logo?: boolean;
};

const GLYPH = '/brand/logo-glyph-orange.webp';

/**
 * Colours live in an inline stylesheet rather than in CSS variables or
 * Tailwind classes for one reason: `scripts/verify-qr.mjs` clones this <svg>
 * into a standalone document and decodes it. Anything the app's stylesheet
 * supplies would be missing there, so the defaults have to travel with the
 * symbol, and the dark overrides hang off `:root.dark`, which exists only when
 * the page is actually dark.
 */
const THEME_CSS = `
  .qr-sheet { fill: #ffffff; }
  .qr-ink { fill: #0c0c0d; }
  :root.dark .qr-sheet { fill: #e9e9ec; }
`;

/** Ec level H: the logo hole and a scuffed phone screen both stay recoverable. */
function encode(value: string): boolean[][] {
  const qr = qrcode(0, 'H');
  qr.addData(value);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) =>
    Array.from({ length: n }, (_, c) => qr.isDark(r, c)),
  );
}

/** Is (r, c) inside one of the three finder areas (including its separator)? */
function inFinder(n: number, r: number, c: number): boolean {
  // Exactly the 7x7 finder. Row/column 7 is the light separator and 8 is
  // already data — padding this box to 9 erases real modules and the symbol
  // stops decoding (which is precisely how this was caught).
  const top = r < 7;
  const bottom = r >= n - 7;
  const left = c < 7;
  const right = c >= n - 7;
  return (top && (left || right)) || (bottom && left);
}

export function QrArt({ value, size = 220, label, className, logo = true }: QrArtProps) {
  const { modules, n, chipR, clearR } = useMemo(() => {
    const grid = encode(value);
    const count = grid.length;
    const chip = Math.max(2.5, count * 0.098);
    return { modules: grid, n: count, chipR: chip, clearR: chip + 0.8 };
  }, [value]);

  const quiet = 4;
  const box = n + quiet * 2;
  const centre = n / 2;
  /** Slightly bolder than half a module: reads at arm's length, still gapped. */
  const DOT = 0.56;
  const dots: React.ReactElement[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules[r][c]) continue;
      if (inFinder(n, r, c)) continue;
      // The mark owns its circle: leave the modules out instead of covering
      // them, so the chip's edge is clean at every size.
      if (logo && Math.hypot(r + 0.5 - centre, c + 0.5 - centre) < clearR) continue;
      dots.push(<circle key={`${r}-${c}`} className="qr-ink" cx={c + 0.5} cy={r + 0.5} r={DOT} />);
    }
  }

  const finders = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ].map(([x, y]) => (
    <g key={`f${x}-${y}`}>
      <rect className="qr-ink" x={x} y={y} width={7} height={7} rx={1.9} />
      <rect className="qr-sheet" x={x + 1} y={y + 1} width={5} height={5} rx={1.25} />
      <rect className="qr-ink" x={x + 2} y={y + 2} width={3} height={3} rx={0.8} />
    </g>
  ));

  return (
    <svg
      viewBox={`${-quiet} ${-quiet} ${box} ${box}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={label ?? 'QR code'}
      shapeRendering="geometricPrecision"
      data-testid="qr-art"
    >
      <style>{THEME_CSS}</style>
      <rect
        className="qr-sheet"
        x={-quiet}
        y={-quiet}
        width={box}
        height={box}
        rx={box * 0.13}
      />
      <g>{finders}</g>
      <g>{dots}</g>
      {logo && (
        <g>
          <circle className="qr-sheet" cx={centre} cy={centre} r={chipR} />
          <image
            href={GLYPH}
            x={centre - chipR * 0.74}
            y={centre - chipR * 0.74}
            width={chipR * 1.48}
            height={chipR * 1.48}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      )}
    </svg>
  );
}
