import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '../lib/format';

interface CountUpProps {
  value: number;
  /** Delay before the first count (power-on stagger), in ms. */
  delay?: number;
  /** Duration of the first count from 0 (ms); updates use 600 ms. */
  duration?: number;
  className?: string;
}

/**
 * Number count-up (UX §13 #4): tweens from the last shown value with ease-out quart through a
 * motion value — no React state per frame. Reduced motion shows the final value.
 */
export function CountUp({ value, delay = 0, duration = 1100, className }: CountUpProps) {
  const { i18n } = useTranslation();
  const reduced = useReducedMotion();
  const mv = useMotionValue(reduced ? value : 0);
  const first = useRef(true);
  const nf = useMemo(() => new Intl.NumberFormat(localeFor(i18n.resolvedLanguage ?? 'en')), [i18n.resolvedLanguage]);
  const text = useTransform(mv, (v) => nf.format(Math.round(v)));

  useEffect(() => {
    if (reduced) {
      mv.set(value);
      first.current = false;
      return;
    }
    const isFirst = first.current;
    first.current = false;
    const controls = animate(mv, value, {
      duration: (isFirst ? duration : 600) / 1000,
      delay: isFirst ? delay / 1000 : 0,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, reduced, mv, delay, duration]);

  return <motion.span className={className}>{text}</motion.span>;
}
