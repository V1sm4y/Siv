'use client';
import { X } from 'lucide-react';
import { Dialog as D } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn';

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  hideTitle,
  ...props
}: Omit<ComponentProps<typeof D.Content>, 'title'> & { title: string; description?: string; hideTitle?: boolean; children: ReactNode }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-[overlay-in_160ms_ease-out]" />
      <D.Content
        className={cn(
          'glass fixed top-1/2 left-1/2 z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl p-6',
          'data-[state=open]:animate-[pop-in_220ms_var(--ease-out)]',
          className,
        )}
        aria-describedby={description ? undefined : undefined}
        {...props}
      >
        <D.Title className={cn('font-display text-xl font-semibold', hideTitle && 'sr-only')}>{title}</D.Title>
        {description ? (
          <D.Description className="mt-1 text-sm text-fg-muted">{description}</D.Description>
        ) : (
          <D.Description className="sr-only">{title}</D.Description>
        )}
        <div className="mt-4">{children}</div>
        <D.Close aria-label="Close" className="absolute top-3 right-3 rounded-md p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <X className="size-4" aria-hidden="true" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
