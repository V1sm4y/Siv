import { ShellFrame } from '@/components/shell/shell-frame';
import { loadOrgContext } from '@/server/shell';

export const dynamic = 'force-dynamic';

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const ctx = await loadOrgContext(org);
  const { memberCount: _m, ...data } = ctx;
  return <ShellFrame data={data}>{children}</ShellFrame>;
}
