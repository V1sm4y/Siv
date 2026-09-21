const labels: Record<string, string> = {
  'org.create': 'Created the organisation',
  'team.create': 'Created a game container',
  'invite.create': 'Sent an invitation',
  'invite.accept': 'Accepted an invitation',
  'member.role_change': 'Changed a member’s role',
};
export const actionLabel = (a: string) => labels[a] ?? a;

/** "Mon 14 Sep" for a YYYY-MM-DD day key (rendered at noon UTC so no timezone can shift the date). */
export const dayLabel = (day: string) =>
  new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

export const shortTime = (d: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(d);

export const roleLabel = (r: string) => ({ owner: 'Owners', manager: 'Managers', member: 'Team members', guest: 'Guests' })[r] ?? r;
