-- Field access rules for the system roles.
--
-- Migration 0010 inserts these rules, but it runs before 0001_reference_data
-- creates the roles, so a freshly built database ended up with no rules and
-- every role (administrators included) fell back to the function default of
-- "omit" for guarded fields. This seed creates the intended end state of
-- migrations 0010 and 0011:
--   costUsd, supplierStatus          allow: GLOBAL_ADMIN, ORG_ADMIN, ANALYST
--   sourceSystem, sourceRecordId     allow: GLOBAL_ADMIN
--   everything else guarded          omit
INSERT INTO security.field_access_rules (role_id, resource_type, field_name, access)
SELECT role.id,
       'catalog.part',
       field.field_name,
       CASE
           WHEN field.field_name IN ('costUsd', 'supplierStatus')
                AND role.code IN ('GLOBAL_ADMIN', 'ORG_ADMIN', 'ANALYST') THEN 'allow'
           WHEN field.field_name IN ('sourceSystem', 'sourceRecordId')
                AND role.code = 'GLOBAL_ADMIN' THEN 'allow'
           ELSE 'omit'
       END
FROM security.roles role
CROSS JOIN (VALUES
    ('costUsd'),
    ('supplierStatus'),
    ('sourceSystem'),
    ('sourceRecordId')
) field(field_name)
WHERE role.organization_id IS NULL
ON CONFLICT (role_id, resource_type, field_name) DO NOTHING;
