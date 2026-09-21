import { levelFor, type Level, type Resource } from './matrix';
import { effectiveRole, type Actor } from './roles';

export type Action = 'read' | 'write' | 'send' | 'receive';

/** Facts about the specific record being accessed. Callers must derive these server-side. */
export interface ResourceContext {
  /** Owner / author / subject of the record. */
  ownerId?: string;
  /** Record was explicitly shared with the actor. */
  shared?: boolean;
  /** Record is published to players. */
  published?: boolean;
  /** Record is assigned to the actor. */
  assigned?: boolean;
  /** Actor holds an active, unrevoked, unexpired grant from the subject (wellness). */
  hasGrant?: boolean;
  /** For audit_log: the entry records an owner-only action (managers cannot see those). */
  ownerAction?: boolean;
}

function allows(level: Level, action: Action, actor: Actor, ctx: ResourceContext): boolean {
  switch (level) {
    case 'none':
      return false;
    case 'read':
      return action === 'read';
    case 'write':
      return action === 'read' || action === 'write';
    case 'own':
      return (action === 'read' || action === 'write') && ctx.ownerId === actor.userId;
    case 'grant':
      return action === 'read' && ctx.hasGrant === true;
    case 'shared':
      return action === 'read' && ctx.shared === true;
    case 'published':
      return action === 'read' && ctx.published === true;
    case 'assigned':
      return (action === 'read' || action === 'write') && ctx.assigned === true;
    case 'authored':
      return (action === 'read' || action === 'write') && ctx.ownerId === actor.userId;
    case 'send':
      return action === 'send' || action === 'receive';
    case 'receive':
      return action === 'receive';
  }
}

/**
 * The one policy decision point. Deny by default: unknown role, unknown resource, or a missing
 * context flag all evaluate to false.
 */
export function can(
  actor: Actor | null | undefined,
  action: Action,
  resource: Resource,
  ctx: ResourceContext = {},
): boolean {
  if (!actor) return false;
  const role = effectiveRole(actor);
  if (!role) return false;
  if (resource === 'audit_log' && role === 'manager' && ctx.ownerAction) return false;
  return allows(levelFor(role, resource), action, actor, ctx);
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(
    public readonly action: Action,
    public readonly resource: Resource,
  ) {
    super(`Forbidden: ${action} ${resource}`);
    this.name = 'ForbiddenError';
  }
}

export function assertCan(
  actor: Actor | null | undefined,
  action: Action,
  resource: Resource,
  ctx: ResourceContext = {},
): void {
  if (!can(actor, action, resource, ctx)) throw new ForbiddenError(action, resource);
}
