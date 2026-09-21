import { createDb, memberships, organizations, teamMemberships, teams, users } from '@arena/db';
import { randomUUID } from 'node:crypto';

const ADMIN = process.env.TEST_DATABASE_URL_ADMIN ?? 'postgres://arena:arena@localhost:5432/arena_test';
const APP = process.env.TEST_DATABASE_URL ?? 'postgres://arena_app:arena_app@localhost:5432/arena_test';

/** `admin` bypasses RLS (fixtures only). `app` is the runtime role that RLS applies to. */
export function testDbs() {
  const admin = createDb(ADMIN, { max: 3 });
  const app = createDb(APP, { max: 5 });
  return { admin, app, close: async () => { await admin.close(); await app.close(); } };
}

export const uniq = (p: string) => `${p}-${randomUUID().slice(0, 8)}`;

type Admin = ReturnType<typeof testDbs>['admin'];

export async function makeUser(admin: Admin, name: string, dob = '1998-05-05') {
  const [u] = await admin.db
    .insert(users)
    .values({ name, email: `${uniq(name.toLowerCase())}@test.arena`, dateOfBirth: dob, onboardedAt: new Date() })
    .returning();
  return u!;
}

export async function makeOrg(admin: Admin, name: string) {
  const [o] = await admin.db.insert(organizations).values({ name, slug: uniq('org') }).returning();
  return o!;
}

export async function join(admin: Admin, orgId: string, userId: string, role: string) {
  await admin.db.insert(memberships).values({ orgId, userId, role });
}

export async function makeTeam(admin: Admin, orgId: string, gameId = 'valorant') {
  const [t] = await admin.db.insert(teams).values({ orgId, gameId, name: 'Team', slug: uniq('team') }).returning();
  return t!;
}

export async function joinTeam(admin: Admin, orgId: string, teamId: string, userId: string, role: string) {
  await admin.db.insert(teamMemberships).values({ orgId, teamId, userId, role });
}
