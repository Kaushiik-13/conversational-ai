-- Semantic models: the description of an organization's data that the
-- conversational planner and query compiler use. A model has immutable
-- versions; exactly one version per model is published (live).
--
-- organization_id NULL marks a platform template that every organization
-- without its own model uses (same convention as security.roles).

CREATE SCHEMA IF NOT EXISTS semantic AUTHORIZATION CURRENT_USER;
ALTER SCHEMA semantic OWNER TO CURRENT_USER;
REVOKE ALL ON SCHEMA semantic FROM PUBLIC;
GRANT USAGE ON SCHEMA semantic TO automotive_runtime;

CREATE TABLE semantic.models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES app.organizations (id),
    code text NOT NULL,
    name text NOT NULL,
    source_kind text NOT NULL DEFAULT 'application_database',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT models_scope_code_unique UNIQUE NULLS NOT DISTINCT (organization_id, code),
    CONSTRAINT models_code_format CHECK (code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT models_name_length CHECK (length(btrim(name)) BETWEEN 1 AND 160),
    CONSTRAINT models_source_kind_check CHECK (source_kind IN ('application_database', 'organization_database')),
    CONSTRAINT models_status_check CHECK (status IN ('active', 'disabled'))
);

CREATE TABLE semantic.model_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id uuid NOT NULL REFERENCES semantic.models (id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    status text NOT NULL DEFAULT 'draft',
    document jsonb NOT NULL,
    checksum text NOT NULL,
    created_by_user_id uuid REFERENCES app.app_users (id),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    published_at timestamptz,
    CONSTRAINT model_versions_number_unique UNIQUE (model_id, version_number),
    CONSTRAINT model_versions_number_positive CHECK (version_number > 0),
    CONSTRAINT model_versions_status_check CHECK (status IN ('draft', 'published', 'archived')),
    CONSTRAINT model_versions_document_object CHECK (jsonb_typeof(document) = 'object'),
    CONSTRAINT model_versions_document_schema_version CHECK ((document ->> 'schema_version') = '1'),
    CONSTRAINT model_versions_checksum_format CHECK (checksum ~ '^[0-9a-f]{64}$'),
    CONSTRAINT model_versions_published_has_timestamp CHECK (status <> 'published' OR published_at IS NOT NULL)
);

-- One live version per model.
CREATE UNIQUE INDEX model_versions_one_published_index
    ON semantic.model_versions (model_id)
    WHERE status = 'published';

CREATE INDEX models_organization_index ON semantic.models (organization_id);

-- Published versions are immutable: their document and checksum cannot change.
CREATE FUNCTION semantic.protect_published_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    IF OLD.status IN ('published', 'archived')
       AND (NEW.document IS DISTINCT FROM OLD.document
            OR NEW.checksum IS DISTINCT FROM OLD.checksum
            OR NEW.version_number IS DISTINCT FROM OLD.version_number
            OR NEW.model_id IS DISTINCT FROM OLD.model_id) THEN
        RAISE EXCEPTION 'Published model versions are immutable.'
            USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
        RAISE EXCEPTION 'An archived model version cannot be restored.'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$function$;

CREATE TRIGGER model_versions_protect_published
    BEFORE UPDATE ON semantic.model_versions
    FOR EACH ROW EXECUTE FUNCTION semantic.protect_published_version();

CREATE TRIGGER models_set_updated_at
    BEFORE UPDATE ON semantic.models
    FOR EACH ROW EXECUTE FUNCTION app.set_updated_at();

-- Privileges: the runtime role reads only. Models are written by the owner
-- role (seed script now, the model builder later through a controlled path).
REVOKE ALL ON semantic.models, semantic.model_versions FROM PUBLIC;
GRANT SELECT ON semantic.models, semantic.model_versions TO automotive_runtime;

ALTER TABLE semantic.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic.models FORCE ROW LEVEL SECURITY;
ALTER TABLE semantic.model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic.model_versions FORCE ROW LEVEL SECURITY;

-- A signed-in context sees the platform templates and its own organization's
-- models, and only the published versions of them.
CREATE POLICY models_current_context_select ON semantic.models
    FOR SELECT TO automotive_runtime
    USING (
        status = 'active'
        AND (
            organization_id IS NULL
            OR organization_id = security.authz_current_uuid('app.organization_id')
        )
    );

CREATE POLICY model_versions_published_select ON semantic.model_versions
    FOR SELECT TO automotive_runtime
    USING (
        status = 'published'
        AND EXISTS (
            SELECT 1
            FROM semantic.models model
            WHERE model.id = model_versions.model_id
              AND model.status = 'active'
              AND (
                  model.organization_id IS NULL
                  OR model.organization_id = security.authz_current_uuid('app.organization_id')
              )
        )
    );

-- Field access for any resource, generalising security.authz_field_access
-- (which is fixed to 'catalog.part'). Unknown rules deny by default, except
-- for catalog.part where the existing defaults apply.
CREATE FUNCTION security.authz_resource_field_access(
    requested_resource text,
    requested_field text
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, security
AS $function$
    SELECT COALESCE((
        SELECT rule.access
        FROM security.field_access_rules rule
        WHERE rule.role_id = security.authz_current_uuid('app.role_id')
          AND rule.resource_type = requested_resource
          AND rule.field_name = requested_field
    ), CASE
        WHEN requested_resource = 'catalog.part' THEN
            CASE
                WHEN requested_field IN ('costUsd', 'supplierStatus', 'sourceSystem', 'sourceRecordId')
                    THEN 'omit'
                ELSE 'allow'
            END
        ELSE 'omit'
    END)
$function$;

REVOKE ALL ON FUNCTION security.authz_resource_field_access(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION security.authz_resource_field_access(text, text) TO automotive_runtime;
