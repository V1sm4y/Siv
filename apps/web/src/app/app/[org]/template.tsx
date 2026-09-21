'use client';
import { dur, ease } from '@arena/ui';
import { motion } from 'framer-motion';

/** Re-mounts on every navigation: a short fade + rise (transform/opacity only). Reduced motion → fade only via MotionConfig. */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.route, ease: ease.out }}>
      {children}
    </motion.div>
  );
}
