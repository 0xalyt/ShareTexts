import React, { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useIsPresent, type DOMKeyframesDefinition } from 'motion/react';
import { useMotionPreference } from '../../lib/useMotionPreference';

/** Structural motion belongs to the opening action, not a later pointer
 * event. Exiting surfaces may remain visible, but never own input or focus. */
export const MotionSurface = React.forwardRef<HTMLDivElement, React.ComponentProps<typeof motion.div>>(
  function MotionSurface({ style, initial, exit, transition, ...props }, ref) {
    const present = useIsPresent();
    const reduced = useMotionPreference();
    const [pointerEntry] = useState(() => typeof document !== 'undefined' && document.documentElement.dataset.motionIntent === 'pointer');
    const quiet = reduced || !pointerEntry || (typeof document !== 'undefined' && document.documentElement.dataset.motionIntent === 'keyboard');
    const element = useRef<HTMLDivElement>(null);
    const wasQuiet = useRef(quiet);
    useImperativeHandle(ref, () => element.current!, []);
    useLayoutEffect(() => {
      const becameQuiet = quiet && !wasQuiet.current;
      wasQuiet.current = quiet;
      // Changing a transition doesn't interrupt an already-running animation
      // whose target is unchanged. Settle that same visual element explicitly.
      if (becameQuiet && present && element.current && props.animate && typeof props.animate === 'object' && !Array.isArray(props.animate) && !('start' in props.animate)) {
        animate(element.current, props.animate as DOMKeyframesDefinition, { duration: 0 }).complete();
      }
    }, [quiet, present, props.animate]);
    return (
      <motion.div
        {...props}
        ref={element}
        data-motion-entry={pointerEntry ? 'pointer' : 'quiet'}
        initial={quiet ? false : initial}
        exit={exit === undefined ? undefined : quiet ? { opacity: 0, transition: { duration: 0 } } : exit}
        transition={quiet ? { duration: 0 } : transition}
        inert={!present || props.inert}
        style={{ ...style, pointerEvents: present ? style?.pointerEvents : 'none' }}
      />
    );
  },
);
