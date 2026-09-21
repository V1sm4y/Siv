import { PageHeader } from '@/components/page-header';
import { loadOrgContext } from '@/server/shell';
import { SettingsClient } from './settings-client';

export const metadata = { title: 'Settings' };

export default async function SettingsPage({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const ctx = await loadOrgContext(slug);
  return (
    <>
      <PageHeader eyebrow="You" title="Settings" description="Preferences for you on this device." />
      <SettingsClient
        account={{ name: ctx.user.name, email: ctx.user.email, timezone: ctx.user.timezone, role: ctx.role }}
        guardian={ctx.guardian}
      />
    </>
  );
}
