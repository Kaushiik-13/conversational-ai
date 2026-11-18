-- Allow an authenticated caller to browse its complete authorized scope when
-- the search text is empty. Authorization and every structured filter remain
-- enforced; only the BM25 text predicate is skipped.
DO $migration$
DECLARE
    function_signature regprocedure;
    current_definition text;
    updated_definition text;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'catalog.search_visible_count(text,jsonb)'::regprocedure,
        'catalog.search_visible_facet(text,jsonb,text)'::regprocedure,
        'catalog.search_visible_items(text,jsonb,text,text,text,bigint,integer)'::regprocedure
    ]
    LOOP
        SELECT pg_get_functiondef(function_signature)
          INTO current_definition;

        updated_definition := replace(
            current_definition,
            'length(btrim(search_query)) NOT BETWEEN 1 AND 300',
            'length(btrim(search_query)) NOT BETWEEN 0 AND 300'
        );
        updated_definition := replace(
            updated_definition,
            'AND (part.part_number ||| $7 OR part.part_name ||| $7 OR part.description ||| $7)',
            'AND ($7 = '''' OR part.part_number ||| $7 OR part.part_name ||| $7 OR part.description ||| $7)'
        );
        updated_definition := replace(
            updated_definition,
            'part.part_number ||| search_query',
            'search_query = '''' OR part.part_number ||| search_query'
        );
        updated_definition := replace(
            updated_definition,
            'pdb.score(part.id) AS score',
            'CASE WHEN $7 = '''' THEN 0::real ELSE pdb.score(part.id) END AS score'
        );

        IF updated_definition = current_definition THEN
            RAISE EXCEPTION 'browse-all migration did not change function %', function_signature;
        END IF;

        EXECUTE updated_definition;
    END LOOP;
END
$migration$;

COMMENT ON FUNCTION catalog.search_visible_count(text, jsonb) IS
    'Returns the exact authorized result count; empty search text browses the caller visible scope.';
COMMENT ON FUNCTION catalog.search_visible_facet(text, jsonb, text) IS
    'Returns up to 200 authorization-scoped facet counts; empty search text browses the caller visible scope.';
COMMENT ON FUNCTION catalog.search_visible_items(text, jsonb, text, text, text, bigint, integer) IS
    'Returns an authorized keyset page; empty search text browses the caller visible scope.';
