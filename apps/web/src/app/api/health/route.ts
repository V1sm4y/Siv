import { definePublicRoute } from '@/server/define-route';
import { sql } from 'drizzle-orm';

export const GET = definePublicRoute({
  rateLimit: { limit: 60, windowSec: 60 },
  handler: async ({ db }) => {
    await db.execute(sql`select 1`);
    return { status: 'ok', time: new Date().toISOString() };
  },
});
