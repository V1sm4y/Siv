-- Row-level security + runtime role privileges.
-- The runtime role `arena_app` is created by src/migrate.ts (nosuperuser, nobypassrls).
-- The migration/seed (admin) role owns the tables and bypasses RLS by design; request handlers never use it.

CREATE FUNCTION app_setting(name text) RETURNS text LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting(name, true), '') $$;
--> statement-breakpoint
CREATE FUNCTION app_org() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.org_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION app_user() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE guardian_consents ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE permission_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Memberships: visible inside the current org, or to the user they belong to (needed to resolve
-- "which orgs am I in" and to authorise before an org context exists).
CREATE POLICY tenant_memberships ON memberships
  USING (org_id = app_org() OR user_id = app_user())
  WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY tenant_organizations ON organizations
  USING (id = app_org() OR id IN (SELECT org_id FROM memberships WHERE user_id = app_user()))
  WITH CHECK (id = app_org());
--> statement-breakpoint
CREATE POLICY tenant_teams ON teams
  USING (org_id = app_org()) WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY tenant_team_memberships ON team_memberships
  USING (org_id = app_org() OR user_id = app_user())
  WITH CHECK (org_id = app_org());
--> statement-breakpoint
-- Invites: an invitee has no org yet; presenting the token hash reveals exactly that one row.
CREATE POLICY tenant_invites ON invites
  USING (org_id = app_org() OR token_hash = app_setting('app.invite_token_hash'))
  WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY tenant_audit_select ON audit_log FOR SELECT USING (org_id = app_org());
--> statement-breakpoint
CREATE POLICY tenant_audit_insert ON audit_log FOR INSERT WITH CHECK (org_id = app_org());
--> statement-breakpoint
CREATE POLICY own_consent ON consent_records
  USING (user_id = app_user()) WITH CHECK (user_id = app_user());
--> statement-breakpoint
CREATE POLICY guardian_access ON guardian_consents
  USING (player_user_id = app_user() OR token_hash = app_setting('app.guardian_token_hash'))
  WITH CHECK (player_user_id = app_user() OR token_hash = app_setting('app.guardian_token_hash'));
--> statement-breakpoint
CREATE POLICY tenant_grants ON permission_grants
  USING (org_id = app_org()) WITH CHECK (org_id = app_org());
--> statement-breakpoint

GRANT USAGE ON SCHEMA public TO arena_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO arena_app;
--> statement-breakpoint
-- Audit log is append-only for the runtime role.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM arena_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO arena_app;
