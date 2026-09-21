import { can } from '@arena/authz';
import { listAudit, verifyAuditChain, withOrgActor } from '@arena/domain';
import { users } from '@arena/db';
import { Badge, EmptyState, ErrorState, LedgerArt } from '@arena/ui';
import { inArray } from 'drizzle-orm';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { PageHeader, Section } from '@/components/page-header';
import { actionLabel } from '@/lib/format';
import { getDb } from '@/server/db';
import { loadOrgContext } from '@/server/shell';

export const metadata = { title: 'Audit log' };

export default async function AuditPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await loadOrgContext(slug);
  if (!ctx.canReadAudit) return <ErrorState title="You don’t have access to the audit log" description="Only owners and managers can view it." />;

  const db = getDb();
  const isOwner = ctx.role === 'owner';
  const entries = await withOrgActor(db, { userId: ctx.user.id, orgId: ctx.org.id }, async (scope) => {
    if (!can(scope.actor, 'read', 'audit_log')) return [];
    return listAudit(scope.tx, scope.orgId, { limit: 100, includeOwnerActions: isOwner });
  });
  const ids = [...new Set(entries.map((e) => e.actorUserId).filter((x): x is string => Boolean(x)))];
  const names = new Map((ids.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)) : []).map((u) => [u.id, u.name ?? u.email ?? 'Unknown']));
  // Managers cannot see owner-only rows, so their window is not a contiguous chain: only owners get the integrity check.
  const chain = isOwner && entries.length > 0 ? verifyAuditChain([...entries].reverse()) : null;
  const dayFmt = new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: ctx.user.timezone });
  const timeFmt = new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit', timeZone: ctx.user.timezone });
  // Group consecutive entries by local day (entries arrive newest first).
  const groups: { day: string; rows: typeof entries }[] = [];
  for (const e of entries) {
    const day = dayFmt.format(e.createdAt);
    const last = groups.at(-1);
    if (last?.day === day) last.rows.push(e);
    else groups.push({ day, rows: [e] });
  }

  return (
    <>
      <PageHeader
        eyebrow="Organisation"
        title="Audit log"
        description="Sensitive actions in this organisation. Entries are append-only and hash-chained so tampering is detectable."
        actions={
          chain && (
            <Badge tone={chain.ok ? 'success' : 'danger'} data-testid="chain-status">
              {chain.ok ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <ShieldAlert className="size-3.5" aria-hidden="true" />}
              {chain.ok ? `Integrity verified (last ${entries.length})` : 'Integrity check FAILED'}
            </Badge>
          )
        }
      />
      {entries.length === 0 ? (
        <EmptyState art={<LedgerArt />} title="Nothing recorded yet" description="Actions like inviting people or changing roles will appear here." />
      ) : (
        groups.map((g) => (
          <Section key={g.day} label={g.day} hint={`${g.rows.length} ${g.rows.length === 1 ? 'entry' : 'entries'}`}>
            <ol className="-mt-2 divide-y divide-line">
              {g.rows.map((e) => (
                <li key={e.id} className="grid grid-cols-[3.5rem_1fr] gap-4 py-3 text-sm sm:grid-cols-[3.5rem_14rem_1fr]">
                  <time className="text-fg-subtle tabular" dateTime={e.createdAt.toISOString()}>{timeFmt.format(e.createdAt)}</time>
                  <span>
                    <span className="text-fg">{e.actorUserId ? names.get(e.actorUserId) ?? 'Unknown' : 'System'}</span>
                    <span className="block text-fg-muted">{actionLabel(e.action)}</span>
                  </span>
                  <span className="col-span-2 text-xs text-fg-subtle sm:col-span-1">{Object.entries(e.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span>
                </li>
              ))}
            </ol>
          </Section>
        ))
      )}
    </>
  );
}
