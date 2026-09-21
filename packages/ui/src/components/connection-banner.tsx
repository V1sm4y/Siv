'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useSyncExternalStore } from 'react';

export type ConnectionState = 'online' | 'offline' | 'reconnecting';

const subscribe = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
export const useOnlineStatus = () =>
  useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/**
 * Announces connection loss politely and stays until resolved. The realtime service (M1) will feed
 * `state="reconnecting"`; until then it reflects the browser's online/offline status.
 */
export function ConnectionBanner({ state, queued = 0 }: { state?: ConnectionState; queued?: number }) {
  const online = useOnlineStatus();
  const effective: ConnectionState = state ?? (online ? 'online' : 'offline');
  const show = effective !== 'online';
  return (
    <div role="status" aria-live="polite">
      <AnimatePresence initial={false}>
        {show && (
          <motion.div
            key={effective}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-b border-warning/40 bg-warning/10"
          >
            <p className="flex items-center gap-2 px-4 py-2 text-sm text-warning">
              {effective === 'offline' ? <WifiOff className="size-4" aria-hidden="true" /> : <RefreshCw className="size-4 animate-[spin_1.2s_linear_infinite]" aria-hidden="true" />}
              {effective === 'offline' ? 'You are offline.' : 'Reconnecting…'}
              {queued > 0 && <span>{queued} action{queued === 1 ? '' : 's'} will send when you are back.</span>}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
