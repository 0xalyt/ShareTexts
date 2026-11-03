/* Beacon — the front door's one character (DESIGN.md §20c).
 *
 * Beacon is built out of the logo and nothing else: a round body, two eyes, a
 * small smile, and the same signal arcs that sit over the mark. It is drawn
 * from the palette in index.css (--st-art-*), flat, with a single 2.5px
 * currentColor outline. No gradients, no shadows, no third-party character.
 *
 * Every coordinate below is a multiple of `r` (the body radius), so the
 * character is identical at 32px and at 200px and the arcs always clear the
 * head instead of crossing the face — the failure that made the first version
 * look like a ball with a halo.
 */

export type BeaconMood = 'calm' | 'hopeful' | 'asleep' | 'sad' | 'pleased';

const EYES: Record<BeaconMood, 'open' | 'closed' | 'half'> = {
  calm: 'open',
  hopeful: 'open',
  asleep: 'closed',
  sad: 'half',
  pleased: 'closed',
};

/** `size` is the width of the whole character, arcs included. */
export function Beacon({
  mood = 'calm',
  size = 64,
  className,
}: {
  mood?: BeaconMood;
  size?: number;
  className?: string;
}) {
  const r = size / 3.4; // body radius; the arcs take the rest of the height
  const eyes = EYES[mood];
  const eyeY = -0.16 * r;
  const eyeX = 0.36 * r;
  const eyeR = 0.15 * r;
  const mouth = {
    calm: `M ${-0.34 * r} ${0.2 * r} Q 0 ${0.5 * r} ${0.34 * r} ${0.2 * r}`,
    hopeful: `M ${-0.34 * r} ${0.24 * r} Q 0 ${0.56 * r} ${0.34 * r} ${0.24 * r}`,
    pleased: `M ${-0.42 * r} ${0.14 * r} Q 0 ${0.66 * r} ${0.42 * r} ${0.14 * r}`,
    sad: `M ${-0.34 * r} ${0.42 * r} Q 0 ${0.14 * r} ${0.34 * r} ${0.42 * r}`,
    asleep: `M ${-0.2 * r} ${0.28 * r} Q 0 ${0.4 * r} ${0.2 * r} ${0.28 * r}`,
  }[mood];

  return (
    <g className={className}>
      {/* Three arcs, each larger than the last, opening upward from just above
          the head — the logo's signal, at body scale. */}
      <g className="st-art-accent" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d={`M ${-0.46 * r} ${-1.16 * r} A ${0.46 * r} ${0.46 * r} 0 0 0 ${0.46 * r} ${-1.16 * r}`} opacity="0.95" />
        <path d={`M ${-0.76 * r} ${-1.16 * r} A ${0.76 * r} ${0.76 * r} 0 0 0 ${0.76 * r} ${-1.16 * r}`} opacity="0.55" />
        <path d={`M ${-1.06 * r} ${-1.16 * r} A ${1.06 * r} ${1.06 * r} 0 0 0 ${1.06 * r} ${-1.16 * r}`} opacity="0.28" />
      </g>

      {/* Body */}
      <circle cx="0" cy="0" r={r} className="st-art-body" stroke="currentColor" strokeWidth="2.5" />

      {/* Face */}
      {eyes === 'open' && (
        <g className="st-art-ink" fill="currentColor">
          <circle cx={-eyeX} cy={eyeY} r={eyeR} />
          <circle cx={eyeX} cy={eyeY} r={eyeR} />
        </g>
      )}
      {eyes === 'closed' && (
        <g className="st-art-ink" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d={`M ${-eyeX - 0.12 * r} ${eyeY} Q ${-eyeX} ${eyeY + 0.1 * r} ${-eyeX + 0.12 * r} ${eyeY}`} />
          <path d={`M ${eyeX - 0.12 * r} ${eyeY} Q ${eyeX} ${eyeY + 0.1 * r} ${eyeX + 0.12 * r} ${eyeY}`} />
        </g>
      )}
      {eyes === 'half' && (
        <g className="st-art-ink" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none">
          <path d={`M ${-eyeX - 0.13 * r} ${eyeY} L ${-eyeX + 0.13 * r} ${eyeY}`} />
          <path d={`M ${eyeX - 0.13 * r} ${eyeY} L ${eyeX + 0.13 * r} ${eyeY}`} />
        </g>
      )}

      {/* Smile */}
      <path d={mouth} className="st-art-ink" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </g>
  );
}
