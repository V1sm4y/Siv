'use client';
import { Button } from '@arena/ui';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';

export function GuardianConsent({ token }: { token: string }) {
  const m = useMutation({ mutationFn: () => api<{ guardianName: string }>('/api/guardian/verify', { body: { token } }) });
  if (m.isSuccess) {
    return (
      <p role="status" className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
        Thank you{m.data.guardianName ? `, ${m.data.guardianName}` : ''}. Consent recorded. You can close this page.
      </p>
    );
  }
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <>
      {err && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {err.status === 404 ? 'This link is invalid or has expired. Ask the player to send a new request.' : err.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button size="lg" className="flex-1" loading={m.isPending} onClick={() => m.mutate()}>I consent</Button>
      </div>
      <p className="text-xs text-fg-subtle">If you do not consent, simply close this page. No action is needed.</p>
    </>
  );
}
