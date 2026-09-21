import { Button, EmptyState } from '@arena/ui';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <EmptyState
        title="We couldn’t find that page"
        description="It may have moved, or you may not have access to it."
        action={<Button asChild><Link href="/">Go home</Link></Button>}
      />
    </main>
  );
}
