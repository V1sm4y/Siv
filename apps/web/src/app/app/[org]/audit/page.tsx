import { can } from '@arena/authz';
import { listAudit, verifyAuditChain, withOrgActor } from '@arena/domain';
import { users } from '@arena/db';
import { Badge, EmptyState, ErrorState, Table, Td, Th } from '@arena/ui';
import { inArray } from 'drizzle-orm';
import { ScrollText, ShieldCheck, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { getDb } from '@/server/db';
import { loadOrgContext } from '@/server/shell';

export const metadata = { title: 'Audit log' };

const LABELS: Record<string, string> = {
  'org.create': 'Created the organisation',
  'team.create': 'Created a game container',
  'invite.create': 'Sent an invitation',
  'invite.accept': 'Accepted an invitation',
  'member.role_change': 'Changed a member’s role',
};

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
  const fmt = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: ctx.user.timezone });

  return (
    <>
      <PageHeader
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
        <div className="rounded-lg border border-dashed border-line-strong"><EmptyState icon={<ScrollText className="size-5" />} title="Nothing recorded yet" description="Actions like inviting people or changing roles will appear here." /></div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-surface-1">
          <Table>
            <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Details</Th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-fg-muted"><time dateTime={e.createdAt.toISOString()}>{fmt.format(e.createdAt)}</time></Td>
                  <Td>{e.actorUserId ? names.get(e.actorUserId) ?? 'Unknown' : 'System'}</Td>
                  <Td>{LABELS[e.action] ?? e.action}</Td>
                  <Td className="text-xs text-fg-muted">{Object.entries(e.metadata).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
