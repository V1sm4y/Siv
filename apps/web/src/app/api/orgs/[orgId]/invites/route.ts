import { createInvite, listPendingInvites } from '@arena/domain';
import { getUser } from '@arena/domain';
import { organizations } from '@arena/db';
import { inviteInput, orgParams } from '@arena/schemas';
import { eq } from 'drizzle-orm';
import { defineRoute } from '@/server/define-route';
import { sendInviteEmail } from '@/server/mail';

export const GET = defineRoute({
  params: orgParams,
  org: { permission: { resource: 'members', action: 'write' } },
  handler: async ({ scope }) => {
    const rows = await listPendingInvites(scope);
    // Token hashes never leave the server.
    return { invites: rows.map(({ tokenHash: _t, ...rest }) => rest) };
  },
});

export const POST = defineRoute({
  params: orgParams,
  body: inviteInput,
  org: { permission: { resource: 'members', action: 'write' } },
  // Sends email to third parties: tight limit.
  rateLimit: { limit: 20, windowSec: 3600 },
  handler: async ({ scope, body, db, userId, info }) => {
    const { invite, token } = await createInvite(scope, body, { ip: info.ip, userAgent: info.userAgent });
    const [org] = await scope.tx.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, scope.orgId));
    const inviter = await getUser(db, userId);
    await sendInviteEmail(body.email, org?.name ?? 'an organisation', inviter?.name ?? 'A teammate', token);
    const { tokenHash: _t, ...safe } = invite;
    return Response.json({ invite: safe }, { status: 201 });
  },
});
