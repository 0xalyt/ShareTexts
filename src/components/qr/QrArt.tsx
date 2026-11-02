import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/**
 * QrArt — the room's join code, drawn rather than stamped.
 *
 * A stock QR component paints a grid of 1px squares inside a white box. That
 * reads as a form field, not as the one thing on the screen someone has to
 * point a phone at. This draws the same symbol with the app's own material:
 * a near-black card with a generous radius, one dot per module, rounded
 * finder patterns, and the ShareTexts glyph sitting in the middle.
 *
 * Nothing about that is free. Three rules keep it scannable:
 *
 *   1. Error correction is level H (~30% recoverable), so punching a hole for
 *      the logo costs nothing that matters — the hole is about 4% of the grid.
 *   2. Modules inside the logo's radius are skipped outright, not drawn over,
 *      so no white dot peeks out from behind the chip.
 *   3. The card itself is the quiet zone. It is at least three modules of
 *      flat colour on every side, and the finder patterns are never touched.
 *
 * The symbol is white on ink (as the reference art is). Scanners handle that
 * polarity routinely; `scripts/verify-qr.mjs` decodes this exact output with
 * jsQR at three sizes, in both themes, so a redesign cannot quietly break it.
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

const CARD = '#0B0B0C';
const MODULE = '#FFFFFF';
const GLYPH = '/brand/logo-glyph-orange.png';

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
    const chip = Math.max(2.4, count * 0.1);
    return { modules: grid, n: count, chipR: chip, clearR: chip + 0.8 };
  }, [value]);

  const quiet = 3;
  const box = n + quiet * 2;
  const centre = n / 2;
  const dots: React.ReactElement[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!modules[r][c]) continue;
      if (inFinder(n, r, c)) continue;
      // The logo owns its circle: leave the modules out instead of covering
      // them, so the chip's edge is clean at every size.
      if (logo && Math.hypot(r + 0.5 - centre, c + 0.5 - centre) < clearR) continue;
      dots.push(<circle key={`${r}-${c}`} cx={c + 0.5} cy={r + 0.5} r={0.53} fill={MODULE} />);
    }
  }

  const finders = [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ].map(([x, y]) => (
    <g key={`f${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} rx={2} fill={MODULE} />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1.4} fill={CARD} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.9} fill={MODULE} />
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
      <rect
        x={-quiet}
        y={-quiet}
        width={box}
        height={box}
        rx={box * 0.12}
        fill={CARD}
      />
      <g>{finders}</g>
      <g>{dots}</g>
      {logo && (
        <g>
          <circle cx={centre} cy={centre} r={chipR} fill="#FFFFFF" />
          <image
            href={GLYPH}
            x={centre - chipR * 0.66}
            y={centre - chipR * 0.66}
            width={chipR * 1.32}
            height={chipR * 1.32}
            preserveAspectRatio="xMidYMid meet"
          />
        </g>
      )}
    </svg>
  );
}
