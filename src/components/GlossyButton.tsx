import React from 'react';
import { cn } from '../lib/utils';
import { hapticTap } from '../lib/haptics';

/**
 * GlossyButton — the dissolve glossy pill, in ember.
 *
 * One recipe, six layers, all of them in `.glossy-btn`
 * (styles/apple-dna.css):
 *
 *   1. the ember fill                      (--gloss-fill)
 *   2. a 1px inside stroke, white gradient lit from the top
 *   3. a specular sheen across the top third
 *   4. a contact shadow plus an ember bounce under the bottom edge
 *   5. a white inner shadow on the top lip, a dark one at the foot
 *   6. a thin outer ring in the fill colour
 *
 * The fill, ring, sheen strength and shadow stack are all custom properties,
 * and `html.dark` re-declares them: light deepens the middle stop so the
 * white label keeps 3:1 against it, night steps the fill down and swaps the
 * invisible black drop shadow for an ember halo.
 *
 * Pressed it scales to 0.97 on a crisp spring while the inner light dims,
 * and fires the light haptic. The layers are CSS, so the motion costs
 * nothing on the main thread and never moves the label.
 *
 * Scope: the two hero doors only — the owner asked for this treatment
 * there, and the flat `TactileButton` grammar still owns every other
 * button in the app.
 */

type GlossyButtonSize = 'md' | 'lg';

interface GlossyButtonProps {
  children: React.ReactNode;
  /** Leading glyph. Sized by the caller, tinted by the label colour. */
  icon?: React.ReactNode;
  size?: GlossyButtonSize;
  className?: string;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit' | 'reset';
  'data-testid'?: string;
  'aria-label'?: string;
}

const SIZE_CLASS: Record<GlossyButtonSize, string> = {
  md: 'min-h-[44px] px-5 text-[15px]',
  lg: '',
};

export function GlossyButton({
  children,
  icon,
  size = 'lg',
  className,
  disabled,
  onClick,
  type = 'button',
  ...props
}: GlossyButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={disabled ? undefined : hapticTap}
      data-testid={props['data-testid']}
      aria-label={props['aria-label']}
      className={cn('glossy-btn', SIZE_CLASS[size], className)}
    >
      {icon && (
        <span className="flex shrink-0 items-center justify-center leading-none">
          {icon}
        </span>
      )}
      <span className="flex items-center leading-none">{children}</span>
    </button>
  );
}
