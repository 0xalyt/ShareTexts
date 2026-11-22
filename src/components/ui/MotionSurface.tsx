import React, { useState } from 'react';
import { motion, useIsPresent } from 'motion/react';
import { useMotionPreference } from '../../lib/useMotionPreference';

/** Structural motion belongs to the opening action, not a later pointer
 * event. Exiting surfaces may remain visible, but never own input or focus. */
export const MotionSurface = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof motion.div>>(
  function MotionSurface({ style, initial, exit, transition, ...props }, ref) {
    const present = useIsPresent();
    const reduced = useMotionPreference();
    const [pointerEntry] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.motionIntent === 'pointer');
    const quiet = reduced || !pointerEntry || (typeof document !== 'undefined' && document.documentElement.dataset.motionIntent === 'keyboard');
    return (
      <motion.div
        {...props}
        ref={ref}
        data-motion-entry={pointerEntry ? 'pointer' : 'quiet'}
        initial={quiet ? false : initial}
        exit={quiet ? { opacity: 0, transition: { duration: 0 } } : exit}
        transition={quiet ? { duration: 0 } : transition}
        inert={!present || props.inert}
        style={{ ...style, pointerEvents: present ? style?.pointerEvents : 'none' }}
      />
    );
  },
);
