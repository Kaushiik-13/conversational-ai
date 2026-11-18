CREATE FUNCTION app.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    NEW.updated_at = clock_timestamp();
    RETURN NEW;
END
$function$;

CREATE TRIGGER organizations_set_updated_at
    BEFORE UPDATE ON app.organizations
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER app_users_set_updated_at
    BEFORE UPDATE ON app.app_users
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER organization_memberships_set_updated_at
    BEFORE UPDATE ON app.organization_memberships
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER roles_set_updated_at
    BEFORE UPDATE ON security.roles
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER categories_set_updated_at
    BEFORE UPDATE ON catalog.categories
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

CREATE TRIGGER part_catalog_set_updated_at
    BEFORE UPDATE ON catalog.part_catalog
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

REVOKE ALL ON ALL TABLES IN SCHEMA app, catalog, security, audit FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA app, catalog, security, audit FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app, catalog, security, audit FROM PUBLIC;

GRANT USAGE ON SCHEMA app, catalog, security, audit TO automotive_runtime;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    app.organizations,
    app.app_users,
    app.user_credentials,
    app.user_sessions,
    app.organization_memberships,
    catalog.categories,
    catalog.part_catalog,
    catalog.part_categories,
    security.roles,
    security.permissions,
    security.role_permissions,
    security.organization_category_entitlements,
    security.user_scope_restrictions,
    security.field_access_rules
TO automotive_runtime;

GRANT SELECT, INSERT ON audit.audit_events TO automotive_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app, catalog, security, audit TO automotive_runtime;

ALTER DEFAULT PRIVILEGES IN SCHEMA app, catalog, security, audit
    REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app, catalog, security, audit
    REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app, catalog, security, audit
    REVOKE ALL ON FUNCTIONS FROM PUBLIC;

ALTER TABLE app.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE app.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.app_users FORCE ROW LEVEL SECURITY;
ALTER TABLE app.user_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_credentials FORCE ROW LEVEL SECURITY;
ALTER TABLE app.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.user_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE app.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.organization_memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE catalog.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.part_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.part_catalog FORCE ROW LEVEL SECURITY;
ALTER TABLE catalog.part_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog.part_categories FORCE ROW LEVEL SECURITY;

ALTER TABLE security.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.roles FORCE ROW LEVEL SECURITY;
ALTER TABLE security.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE security.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.role_permissions FORCE ROW LEVEL SECURITY;
ALTER TABLE security.organization_category_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.organization_category_entitlements FORCE ROW LEVEL SECURITY;
ALTER TABLE security.user_scope_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.user_scope_restrictions FORCE ROW LEVEL SECURITY;
ALTER TABLE security.field_access_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE security.field_access_rules FORCE ROW LEVEL SECURITY;

ALTER TABLE audit.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.audit_events FORCE ROW LEVEL SECURITY;
