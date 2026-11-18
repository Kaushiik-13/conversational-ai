CREATE TABLE audit.data_generation_jobs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    generator_version text NOT NULL,
    seed text NOT NULL,
    target_rows integer NOT NULL,
    batch_size integer NOT NULL,
    completed_rows integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'running',
    error_message text,
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT data_generation_jobs_version_seed_unique
        UNIQUE (generator_version, seed),
    CONSTRAINT data_generation_jobs_target_positive CHECK (target_rows > 0),
    CONSTRAINT data_generation_jobs_batch_positive CHECK (batch_size > 0),
    CONSTRAINT data_generation_jobs_completed_range
        CHECK (completed_rows BETWEEN 0 AND target_rows),
    CONSTRAINT data_generation_jobs_status_check
        CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    CONSTRAINT data_generation_jobs_error_length
        CHECK (error_message IS NULL OR length(error_message) <= 2000)
);

CREATE INDEX data_generation_jobs_status_index
    ON audit.data_generation_jobs (status);

ALTER TABLE audit.data_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.data_generation_jobs FORCE ROW LEVEL SECURITY;

-- The table is administrative and belongs to the migration owner only. No
-- grants are made to automotive_runtime; default-deny remains in force.