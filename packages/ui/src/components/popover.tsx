'use client';
import { Popover as P, Tooltip as T, DropdownMenu as M } from 'radix-ui';
import type { ComponentProps, ReactNode } from 'react';
import { cn } from '../cn';

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export function PopoverContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        className={cn('glass z-50 rounded-lg p-1 data-[state=open]:animate-[pop-in_180ms_var(--ease-out)]', className)}
        {...props}
      />
    </P.Portal>
  );
}

export const TooltipProvider = T.Provider;
export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left' }) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-50 rounded-md border border-line bg-surface-3 px-2 py-1 text-xs text-fg shadow-e2 data-[state=delayed-open]:animate-[pop-in_140ms_var(--ease-out)]">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const DropdownMenu = M.Root;
export const DropdownMenuTrigger = M.Trigger;
export const DropdownMenuLabel = ({ className, ...p }: ComponentProps<typeof M.Label>) => (
  <M.Label className={cn('px-2 py-1.5 text-xs text-fg-subtle', className)} {...p} />
);
export const DropdownMenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
export function DropdownMenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content
        sideOffset={sideOffset}
        className={cn('glass z-50 min-w-48 rounded-lg p-1 data-[state=open]:animate-[pop-in_180ms_var(--ease-out)]', className)}
        {...props}
      />
    </M.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn('flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm text-fg outline-none select-none data-[highlighted]:bg-surface-3 data-[disabled]:opacity-50', className)}
      {...props}
    />
  );
}
export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof M.RadioItem>) {
  return (
    <M.RadioItem
      className={cn('flex cursor-default items-center gap-2 rounded-md py-2 pr-2 pl-7 text-sm text-fg outline-none select-none data-[highlighted]:bg-surface-3', className)}
      {...props}
    >
      <M.ItemIndicator className="absolute left-2" aria-hidden="true">●</M.ItemIndicator>
      {children}
    </M.RadioItem>
  );
}
export const DropdownMenuRadioGroup = M.RadioGroup;
