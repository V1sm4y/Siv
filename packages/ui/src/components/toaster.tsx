'use client';
import { Toaster as S, toast } from 'sonner';

export { toast };
export function Toaster() {
  return (
    <S
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: '!bg-surface-3 !text-fg !border !border-line-strong !shadow-e3 !rounded-lg',
          description: '!text-fg-muted',
        },
      }}
    />
  );
}
