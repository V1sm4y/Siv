// Auth.js owns this route (its own CSRF + rate protections); it is the one handler that is not wrapped.
import { handlers } from '@/server/auth';

export const { GET, POST } = handlers;
