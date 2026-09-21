'use client';
import { Button, ErrorState } from '@arena/ui';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="grid min-h-dvh place-items-center px-4">
      <ErrorState
        description={error.digest ? `Reference: ${error.digest}` : 'An unexpected error occurred.'}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </main>
  );
}
