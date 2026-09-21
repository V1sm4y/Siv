'use client';
import { Button, ErrorState } from '@arena/ui';

export default function OrgError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      description={error.digest ? `Reference: ${error.digest}` : 'We could not load this page.'}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
