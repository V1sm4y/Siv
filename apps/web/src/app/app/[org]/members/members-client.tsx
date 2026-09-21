'use client';
import type { OrgRole } from '@arena/authz';
import { Avatar, Badge, Button, Dialog, DialogContent, EmptyState, Field, Input, Select, Table, Td, Th, toast } from '@arena/ui';
import { getGame } from '@arena/game-registry';
import { useMutation } from '@tanstack/react-query';
import { MailPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Member { membershipId: string; name: string | null; email: string | null; role: OrgRole; isSelf: boolean; allowedRoles: OrgRole[] }
interface Invite { id: string; email: string; orgRole: string; teamRole: string | null; expiresAt: string }
interface Team { id: string; name: string; gameId: string }

export function MembersClient({ orgId, members, invites, teams, canInviteManager }: { orgId: string; members: Member[]; invites: Invite[]; teams: Team[]; canInviteManager: boolean }) {
  const [inviting, setInviting] = useState(false);
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="members-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="members-h" className="text-sm font-medium text-fg-muted">People ({members.length})</h2>
          <Button size="sm" onClick={() => setInviting(true)} data-testid="invite-open"><MailPlus className="size-4" aria-hidden="true" /> Invite</Button>
        </div>
        <div className="overflow-hidden rounded-lg border border-line bg-surface-1">
          <Table>
            <thead><tr><Th>Name</Th><Th>Email</Th><Th className="w-44">Organisation role</Th></tr></thead>
            <tbody>{members.map((m) => <MemberRow key={m.membershipId} orgId={orgId} m={m} />)}</tbody>
          </Table>
        </div>
      </section>

      <section aria-labelledby="invites-h">
        <h2 id="invites-h" className="mb-3 text-sm font-medium text-fg-muted">Pending invitations ({invites.length})</h2>
        {invites.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong">
            <EmptyState title="No pending invitations" description="Invitations expire after 7 days and only work for the email address they were sent to." />
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-1">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="truncate">{i.email}</span>
                <span className="flex items-center gap-2">
                  <Badge className="capitalize">{i.teamRole ?? i.orgRole}</Badge>
                  <span className="text-xs text-fg-subtle">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <InviteDialog orgId={orgId} teams={teams} open={inviting} onOpenChange={setInviting} canInviteManager={canInviteManager} />
    </div>
  );
}

function MemberRow({ orgId, m }: { orgId: string; m: Member }) {
  const router = useRouter();
  const mut = useMutation({
    mutationFn: (role: OrgRole) => api(`/api/orgs/${orgId}/members/${m.membershipId}`, { method: 'PATCH', body: { role } }),
    onSuccess: () => { toast.success('Role updated'); router.refresh(); },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Could not update role'),
  });
  const locked = m.allowedRoles.length <= 1;
  return (
    <tr>
      <Td>
        <span className="flex items-center gap-3">
          <Avatar name={m.name ?? m.email} />
          <span>{m.name ?? 'Unnamed'}{m.isSelf && <Badge className="ml-2">You</Badge>}</span>
        </span>
      </Td>
      <Td className="text-fg-muted">{m.email}</Td>
      <Td>
        <Select
          aria-label={`Organisation role for ${m.name ?? m.email}`}
          value={m.role}
          disabled={locked || mut.isPending}
          onChange={(e) => mut.mutate(e.target.value as OrgRole)}
          className="h-9 capitalize"
        >
          {m.allowedRoles.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </Td>
    </tr>
  );
}

function InviteDialog({ orgId, teams, open, onOpenChange, canInviteManager }: { orgId: string; teams: Team[]; open: boolean; onOpenChange: (o: boolean) => void; canInviteManager: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [orgRole, setOrgRole] = useState<'manager' | 'member' | 'guest'>('member');
  const [teamId, setTeamId] = useState('');
  const [teamRole, setTeamRole] = useState<'coach' | 'analyst' | 'player' | 'staff'>('player');
  const team = teams.find((t) => t.id === teamId);
  const game = team ? getGame(team.gameId) : null;
  const m = useMutation({
    mutationFn: () => api(`/api/orgs/${orgId}/invites`, { body: { email, orgRole, ...(orgRole === 'member' ? { teamId, teamRole } : {}) } }),
    onSuccess: () => { toast.success(`Invitation sent to ${email}`); setEmail(''); onOpenChange(false); router.refresh(); },
  });
  const err = m.error instanceof ApiError ? m.error : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Invite someone" description="They’ll get a link that only works for this email address.">
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="flex flex-col gap-4">
          <Field label="Email" error={err?.field('email')}>
            {(p) => <Input {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="invite-email" />}
          </Field>
          <Field label="Access level">
            {(p) => (
              <Select {...p} value={orgRole} onChange={(e) => setOrgRole(e.target.value as typeof orgRole)}>
                <option value="member">Team member (coach, analyst, player, staff)</option>
                <option value="guest">Guest / sponsor (read-only, shared items)</option>
                {canInviteManager && <option value="manager">Manager</option>}
              </Select>
            )}
          </Field>
          {orgRole === 'member' && (
            <>
              <Field label="Team" error={err?.field('teamId')}>
                {(p) => (
                  <Select {...p} value={teamId} onChange={(e) => setTeamId(e.target.value)} required>
                    <option value="">Choose a team…</option>
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                )}
              </Field>
              <Field label="Role on the team" hint={game ? `In-game roles (${game.roles.map((r) => r.short).join(', ')}) are set on the roster later.` : undefined} error={err?.field('teamRole')}>
                {(p) => (
                  <Select {...p} value={teamRole} onChange={(e) => setTeamRole(e.target.value as typeof teamRole)}>
                    <option value="player">Player</option>
                    <option value="coach">Coach</option>
                    <option value="analyst">Analyst</option>
                    <option value="staff">Staff</option>
                  </Select>
                )}
              </Field>
            </>
          )}
          {err && !err.details && <p role="alert" className="text-sm text-danger">{err.message}</p>}
          <Button type="submit" loading={m.isPending} data-testid="invite-submit">Send invitation</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
