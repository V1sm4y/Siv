import 'server-only';
import { ForbiddenError, can, type Action, type Resource, type ResourceContext } from '@arena/authz';
import { AppError, UnauthorizedError, ValidationError, withOrgActor, type OrgScope } from '@arena/domain';
import type { Db } from '@arena/db';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from './auth';
import { getDb } from './db';
import { rateLimit } from './rate-limit';

/**
 * Every API handler in this app MUST be created with defineRoute / definePublicRoute (enforced by
 * src/server/routes.arch.test.ts). This is what makes "enforce on the server, never only in the UI"
 * structural: authn → origin check → rate limit → tenant resolution → permission → validation → handler.
 */

type AnySchema = z.ZodType;
type Infer<S extends AnySchema | undefined> = S extends AnySchema ? z.infer<S> : undefined;

export type OrgAccess =
  | { permission: { resource: Resource; action: Action; context?: ResourceContext } }
  /** Explicit opt-out: any org member may call, and the handler/domain filters what they see. */
  | { membershipOnly: true };

interface Base<P extends AnySchema | undefined, Q extends AnySchema | undefined, B extends AnySchema | undefined> {
  params?: P;
  query?: Q;
  body?: B;
  /** Requests per window, per user (or IP for public routes). */
  rateLimit?: { limit: number; windowSec: number };
}

export interface RequestInfo {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

interface UserCtx<P, Q, B> {
  req: NextRequest;
  userId: string;
  db: Db;
  params: P;
  query: Q;
  body: B;
  info: RequestInfo;
}
interface OrgCtx<P, Q, B> extends UserCtx<P, Q, B> {
  scope: OrgScope;
}

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string | string[] | undefined>> }) => Promise<Response>;

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function requestInfo(req: NextRequest): RequestInfo {
  const fwd = req.headers.get('x-forwarded-for');
  return {
    ip: fwd?.split(',')[0]?.trim() ?? null,
    userAgent: req.headers.get('user-agent'),
    requestId: req.headers.get('x-request-id') ?? randomUUID(),
  };
}

function errorResponse(err: unknown, info: RequestInfo): Response {
  const headers = { 'x-request-id': info.requestId };
  if (err instanceof z.ZodError) {
    return Response.json(
      { error: { code: 'validation_error', message: 'Invalid input', details: z.flattenError(err) } },
      { status: 400, headers },
    );
  }
  if (err instanceof ForbiddenError) {
    return Response.json({ error: { code: 'forbidden', message: err.message } }, { status: 403, headers });
  }
  if (err instanceof AppError) {
    return Response.json(
      { error: { code: err.code, message: err.message, details: err.details } },
      { status: err.status, headers },
    );
  }
  console.error(`[api ${info.requestId}]`, err);
  return Response.json({ error: { code: 'internal', message: 'Something went wrong' } }, { status: 500, headers });
}

/** Browsers cannot forge Origin. Reject cross-site state-changing requests (CSRF) and non-JSON bodies. */
function checkOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get('origin');
  if (origin && origin !== req.nextUrl.origin) {
    throw new AppError(403, 'bad_origin', 'Cross-origin request rejected');
  }
  const ct = req.headers.get('content-type');
  if (ct && !ct.includes('application/json')) throw new ValidationError('Content-Type must be application/json');
}

async function readJson(req: NextRequest): Promise<unknown> {
  if (!MUTATING.has(req.method)) return undefined;
  const text = await req.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new ValidationError('Body is not valid JSON');
  }
}

function parseQuery(req: NextRequest) {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}

async function limit(cfg: { limit: number; windowSec: number } | undefined, key: string, info: RequestInfo) {
  const l = cfg ?? { limit: 120, windowSec: 60 };
  const r = await rateLimit(key, l.limit, l.windowSec);
  if (!r.allowed) {
    throw Object.assign(new AppError(429, 'rate_limited', 'Too many requests'), { retryAfter: r.retryAfterSec, info });
  }
}

function toResponse(result: unknown, info: RequestInfo): Response {
  if (result instanceof Response) return result;
  return Response.json(result ?? { ok: true }, { headers: { 'x-request-id': info.requestId } });
}

/** Signed-in, optionally tenant-scoped route. */
export function defineRoute<
  P extends AnySchema | undefined = undefined,
  Q extends AnySchema | undefined = undefined,
  B extends AnySchema | undefined = undefined,
>(
  cfg: Base<P, Q, B> & {
    /** Tenant-scoped: `params` must include `orgId`. Membership is resolved server-side (404 for non-members). */
    org?: OrgAccess;
    handler: (ctx: OrgCtx<Infer<P>, Infer<Q>, Infer<B>>) => Promise<unknown>;
  },
): Handler {
  return async (req, routeCtx) => {
    const info = requestInfo(req);
    try {
      checkOrigin(req);
      const session = await auth();
      const userId = session?.user?.id;
      if (!userId) throw new UnauthorizedError();
      await limit(cfg.rateLimit, `u:${userId}:${req.method}:${req.nextUrl.pathname}`, info);

      const rawParams = await routeCtx.params;
      const params = (cfg.params ? cfg.params.parse(rawParams) : undefined) as Infer<P>;
      const rawBody = await readJson(req);
      const db = getDb();

      const finish = (scope: OrgScope | undefined) => {
        const query = (cfg.query ? cfg.query.parse(parseQuery(req)) : undefined) as Infer<Q>;
        const body = (cfg.body ? cfg.body.parse(rawBody) : undefined) as Infer<B>;
        return cfg.handler({ req, userId, db, params, query, body, info, scope: scope as OrgScope });
      };

      let result: unknown;
      if (cfg.org) {
        const orgId = (params as { orgId?: string } | undefined)?.orgId;
        if (!orgId) throw new Error('org routes require an `orgId` param schema');
        result = await withOrgActor(db, { userId, orgId }, async (scope) => {
          if ('permission' in cfg.org!) {
            const { resource, action, context } = cfg.org.permission;
            if (!can(scope.actor, action, resource, context)) throw new ForbiddenError(action, resource);
          }
          return finish(scope);
        });
      } else {
        result = await finish(undefined);
      }
      return toResponse(result, info);
    } catch (err) {
      const res = errorResponse(err, info);
      const retry = (err as { retryAfter?: number }).retryAfter;
      if (retry) res.headers.set('retry-after', String(retry));
      return res;
    }
  };
}

/** No session required (health checks, token-based flows). Always rate limited by IP. */
export function definePublicRoute<
  P extends AnySchema | undefined = undefined,
  Q extends AnySchema | undefined = undefined,
  B extends AnySchema | undefined = undefined,
>(
  cfg: Base<P, Q, B> & {
    handler: (ctx: UserCtx<Infer<P>, Infer<Q>, Infer<B>>) => Promise<unknown>;
  },
): Handler {
  return async (req, routeCtx) => {
    const info = requestInfo(req);
    try {
      checkOrigin(req);
      await limit(cfg.rateLimit ?? { limit: 30, windowSec: 60 }, `ip:${info.ip ?? 'unknown'}:${req.nextUrl.pathname}`, info);
      const params = (cfg.params ? cfg.params.parse(await routeCtx.params) : undefined) as Infer<P>;
      const query = (cfg.query ? cfg.query.parse(parseQuery(req)) : undefined) as Infer<Q>;
      const body = (cfg.body ? cfg.body.parse(await readJson(req)) : undefined) as Infer<B>;
      const result = await cfg.handler({ req, userId: '', db: getDb(), params, query, body, info });
      return toResponse(result, info);
    } catch (err) {
      const res = errorResponse(err, info);
      const retry = (err as { retryAfter?: number }).retryAfter;
      if (retry) res.headers.set('retry-after', String(retry));
      return res;
    }
  };
}
