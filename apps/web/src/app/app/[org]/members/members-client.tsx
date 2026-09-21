'use client';
import type { OrgRole } from '@arena/authz';
import { Avatar, Badge, Button, Dialog, DialogContent, EmptyState, Field, Input, InviteArt, Select, Table, Td, Th, playCue, toast } from '@arena/ui';
import { Section } from '@/components/page-header';
import { getGame } from '@arena/game-registry';
import { useMutation } from '@tanstack/react-query';
import { MailPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/lib/api';

interface Member { membershipId: string; name: string | null; email: string | null; role: OrgRole; isSelf: boolean; allowedRoles: OrgRole[] }
interface Invite { id: string; email: string; orgRole: string; teamRole: string | null; expiresAt: string }
interface Team { id: string; name: string; gameId: string }

export function MembersClient({ orgId, members, invites, teams, canInviteManager, initialInviteOpen = false }: { orgId: string; members: Member[]; invites: Invite[]; teams: Team[]; canInviteManager: boolean; initialInviteOpen?: boolean }) {
  const [inviting, setInviting] = useState(initialInviteOpen);
  return (
    <>
      <Section label="People" hint={`${members.length} in this organisation.`}>
        <div className="-mt-2 mb-4 flex justify-end">
          <Button size="sm" onClick={() => setInviting(true)} data-testid="invite-open"><MailPlus className="size-4" aria-hidden="true" /> Invite</Button>
        </div>
        <Table>
          <thead><tr><Th>Name</Th><Th>Email</Th><Th className="w-44">Organisation role</Th></tr></thead>
          <tbody>{members.map((m) => <MemberRow key={m.membershipId} orgId={orgId} m={m} />)}</tbody>
        </Table>
      </Section>

      <Section label="Invitations" hint="Expire after 7 days and only work for the email they were sent to.">
        {invites.length === 0 ? (
          <EmptyState art={<InviteArt />} title="No pending invitations" description="Invite coaches, players and staff. They land here until they accept." className="py-8" />
        ) : (
          <ul className="-mt-2 divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="truncate">{i.email}</span>
                <span className="flex items-center gap-3">
                  <Badge className="capitalize">{i.teamRole ?? i.orgRole}</Badge>
                  <span className="text-xs text-fg-subtle">expires {new Date(i.expiresAt).toLocaleDateString()}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <InviteDialog orgId={orgId} teams={teams} open={inviting} onOpenChange={setInviting} canInviteManager={canInviteManager} />
    </>
  );
}

function MemberRow({ orgId, m }: { orgId: string; m: Member }) {
  const router = useRouter();
  const mut = useMutation({
    mutationFn: (role: OrgRole) => api(`/api/orgs/${orgId}/members/${m.membershipId}`, { method: 'PATCH', body: { role } }),
    onSuccess: () => { playCue('confirm'); toast.success('Role updated'); router.refresh(); },
    onError: (e) => { playCue('error'); toast.error(e instanceof ApiError ? e.message : 'Could not update role'); },
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
    onSuccess: () => { playCue('confirm'); toast.success(`Invitation sent to ${email}`); setEmail(''); onOpenChange(false); router.refresh(); },
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
