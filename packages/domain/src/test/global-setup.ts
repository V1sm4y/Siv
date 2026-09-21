import { migrate } from '@arena/db/migrate';

export const TEST_ADMIN_URL = process.env.TEST_DATABASE_URL_ADMIN ?? 'postgres://arena:arena@localhost:5432/arena_test';

export default async function setup() {
  await migrate(TEST_ADMIN_URL, 'arena_app');
}
