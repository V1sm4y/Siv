import type { ComponentProps } from 'react';
import { cn } from '../cn';

export const Table = ({ className, ...p }: ComponentProps<'table'>) => (
  <div className="overflow-x-auto"><table className={cn('w-full border-collapse text-sm', className)} {...p} /></div>
);
export const Th = ({ className, ...p }: ComponentProps<'th'>) => (
  <th scope="col" className={cn('border-b border-line px-3 py-2 text-left text-xs font-medium tracking-wide text-fg-subtle uppercase', className)} {...p} />
);
export const Td = ({ className, ...p }: ComponentProps<'td'>) => (
  <td className={cn('border-b border-line px-3 py-3 align-middle text-fg', className)} {...p} />
);
