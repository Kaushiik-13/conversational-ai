-- The deferred primary-assignment trigger executes this helper as the runtime
-- role at commit time. The helper remains non-public and is only executable by
-- the least-privileged application role inherited by automotive_app.
REVOKE ALL ON FUNCTION catalog.check_primary_assignment(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION catalog.check_primary_assignment(bigint) TO automotive_runtime;
