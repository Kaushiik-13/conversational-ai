-- The taxonomy contains more than fifty categories. Keep facet responses
-- bounded, but large enough to return every category in the agreed taxonomy.
DO $migration$
DECLARE
    current_definition text;
    expanded_definition text;
BEGIN
    SELECT pg_get_functiondef(
        'catalog.search_visible_facet(text,jsonb,text)'::regprocedure
    )
    INTO current_definition;

    expanded_definition := replace(current_definition, 'LIMIT 50', 'LIMIT 200');
    IF expanded_definition = current_definition THEN
        RAISE EXCEPTION 'search_visible_facet no longer contains the expected bounded limit';
    END IF;

    EXECUTE expanded_definition;
END
$migration$;

COMMENT ON FUNCTION catalog.search_visible_facet(text, jsonb, text) IS
    'Returns up to 200 authorization-scoped values and counts for one search facet.';
