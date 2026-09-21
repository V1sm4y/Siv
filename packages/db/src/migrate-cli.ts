import { migrate } from './migrate';

const url = process.env.DATABASE_URL_ADMIN;
if (!url) throw new Error('DATABASE_URL_ADMIN is required');
await migrate(url, process.env.APP_DB_PASSWORD || 'arena_app');
console.log('migrations applied');
