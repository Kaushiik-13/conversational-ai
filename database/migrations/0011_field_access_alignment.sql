UPDATE security.field_access_rules rule
SET access = CASE
    WHEN role.code = 'GLOBAL_ADMIN' THEN 'allow'
    ELSE 'omit'
END
FROM security.roles role
WHERE role.id = rule.role_id
  AND rule.resource_type = 'catalog.part'
  AND rule.field_name IN ('sourceSystem', 'sourceRecordId');

