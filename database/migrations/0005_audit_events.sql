CREATE TABLE audit.audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    request_id uuid NOT NULL,
    actor_user_id uuid REFERENCES app.app_users (id),
    organization_id uuid REFERENCES app.organizations (id),
    session_id uuid REFERENCES app.user_sessions (id),
    action text NOT NULL,
    decision text NOT NULL,
    resource_type text,
    resource_id text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT audit_events_action_length CHECK (length(btrim(action)) BETWEEN 1 AND 160),
    CONSTRAINT audit_events_decision_check CHECK (decision IN ('allow', 'deny', 'error')),
    CONSTRAINT audit_events_resource_type_length CHECK (resource_type IS NULL OR length(resource_type) BETWEEN 1 AND 120),
    CONSTRAINT audit_events_resource_id_length CHECK (resource_id IS NULL OR length(resource_id) BETWEEN 1 AND 300),
    CONSTRAINT audit_events_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT audit_events_metadata_size CHECK (octet_length(metadata::text) <= 16384)
);

CREATE INDEX audit_events_occurred_index ON audit.audit_events (occurred_at DESC, id DESC);
CREATE INDEX audit_events_organization_index ON audit.audit_events (organization_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_actor_index ON audit.audit_events (actor_user_id, occurred_at DESC, id DESC);
CREATE INDEX audit_events_request_index ON audit.audit_events (request_id);
CREATE INDEX audit_events_action_decision_index ON audit.audit_events (action, decision, occurred_at DESC);
