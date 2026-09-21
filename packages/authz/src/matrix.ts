import type { Role } from './roles';

/**
 * Access levels. This file is the single source of truth: docs/PLAN.md §4 is derived from it and
 * the generated test suite (matrix.test.ts) asserts every cell.
 *
 *  none      no access
 *  read      read
 *  write     read + write
 *  own       read + write, only on records the actor owns (ctx.ownerId === actor.userId)
 *  grant     read only, and only with an active explicit grant (ctx.hasGrant)
 *  shared    read only, only on resources explicitly shared with the actor (ctx.shared)
 *  published read only, only once published (ctx.published)
 *  assigned  read + write, only on items assigned to the actor (ctx.assigned)
 *  authored  write on own authored records; read own authored records (ctx.ownerId)
 *  send      may send; also sees what is sent (live guidance)
 *  receive   may receive only (live guidance)
 */
export type Level =
  | 'none'
  | 'read'
  | 'write'
  | 'own'
  | 'grant'
  | 'shared'
  | 'published'
  | 'assigned'
  | 'authored'
  | 'send'
  | 'receive';

export const RESOURCES = [
  'org_settings',
  'billing',
  'members',
  'contracts',
  'payments',
  'roster',
  'roster_private',
  'chat',
  'schedule',
  'availability',
  'practice',
  'tasks',
  'analytics',
  'scouting',
  'strats',
  'vod',
  'vod_comment',
  'live_guidance',
  'one_on_one',
  'wellness',
  'recruitment',
  'sponsors',
  'audit_log',
] as const;
export type Resource = (typeof RESOURCES)[number];

type Row = readonly [owner: Level, manager: Level, coach: Level, analyst: Level, player: Level, staff: Level, guest: Level];

// Column order: owner, manager, coach, analyst, player, staff, guest
export const MATRIX: Record<Resource, Row> = {
  org_settings:   ['write', 'write', 'none', 'none', 'none', 'none', 'none'],
  billing:        ['write', 'none',  'none', 'none', 'none', 'none', 'none'],
  members:        ['write', 'write', 'none', 'none', 'none', 'none', 'none'],
  contracts:      ['write', 'write', 'none', 'none', 'none', 'none', 'none'],
  payments:       ['write', 'write', 'none', 'none', 'none', 'none', 'none'],
  roster:         ['write', 'write', 'read', 'read', 'read', 'read', 'shared'],
  roster_private: ['write', 'write', 'none', 'none', 'own',  'none', 'none'],
  chat:           ['write', 'write', 'write', 'write', 'write', 'write', 'read'],
  schedule:       ['write', 'write', 'write', 'read', 'read',  'read', 'none'],
  availability:   ['write', 'write', 'read', 'read', 'own',   'read', 'none'],
  practice:       ['write', 'write', 'write', 'read', 'read',  'read', 'none'],
  tasks:          ['write', 'write', 'write', 'write', 'own',  'own',  'none'],
  analytics:      ['write', 'read',  'write', 'write', 'read', 'none', 'shared'],
  scouting:       ['write', 'read',  'write', 'write', 'published', 'none', 'none'],
  strats:         ['write', 'read',  'write', 'write', 'read', 'none', 'shared'],
  vod:            ['write', 'read',  'write', 'write', 'read', 'none', 'none'],
  vod_comment:    ['write', 'read',  'write', 'write', 'assigned', 'none', 'none'],
  live_guidance:  ['send',  'none',  'send',  'send',  'receive', 'none', 'none'],
  one_on_one:     ['none',  'none',  'authored', 'none', 'shared', 'none', 'none'],
  wellness:       ['none',  'none',  'grant', 'grant', 'own',  'grant', 'none'],
  recruitment:    ['write', 'write', 'read',  'write', 'none', 'none', 'none'],
  sponsors:       ['write', 'write', 'read',  'none',  'none', 'read', 'shared'],
  audit_log:      ['read',  'read',  'none',  'none',  'none', 'none', 'none'],
};

export const ROLE_COLUMNS: readonly Role[] = ['owner', 'manager', 'coach', 'analyst', 'player', 'staff', 'guest'];

export function levelFor(role: Role, resource: Resource): Level {
  const idx = ROLE_COLUMNS.indexOf(role);
  // Optional chaining keeps unknown resources (from untyped callers) deny-by-default.
  return (MATRIX as Partial<Record<string, Row>>)[resource]?.[idx] ?? 'none';
}
