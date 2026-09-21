'use client';
import { animate, useMotionValue, useTransform, motion } from 'framer-motion';
import { useEffect } from 'react';
import { useReducedMotionEffective } from '../motion';

/** Counts to the value on mount/update. Exposes the final value to assistive tech immediately. */
export function AnimatedNumber({
  value,
  format,
  className,
}: {
  value: number;
  format?: Intl.NumberFormatOptions;
  className?: string;
}) {
  const reduced = useReducedMotionEffective();
  const mv = useMotionValue(reduced ? value : 0);
  const fmt = new Intl.NumberFormat(undefined, format);
  const text = useTransform(mv, (v) => fmt.format(v));
  useEffect(() => {
    if (reduced) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { duration: 0.6, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [value, reduced, mv]);
  return (
    <span className={className}>
      <span className="sr-only">{fmt.format(value)}</span>
      <motion.span aria-hidden="true" className="tabular">{text}</motion.span>
    </span>
  );
}
