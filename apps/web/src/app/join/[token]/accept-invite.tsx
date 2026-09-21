'use client';
import { Button } from '@arena/ui';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const m = useMutation({
    mutationFn: () => api<{ orgSlug: string }>('/api/invites/accept', { body: { token } }),
    onSuccess: (r) => router.push(`/app/${r.orgSlug}`),
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <>
      {err && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {err.status === 404 ? 'This invite is not valid for your account. Check that you are signed in with the invited email.' : err.message}
        </p>
      )}
      <Button size="lg" loading={m.isPending} onClick={() => m.mutate()}>Accept invitation</Button>
    </>
  );
}
