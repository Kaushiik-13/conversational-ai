-- Migration 0024 introduced empty-query predicates inside dynamic SQL.
-- Preserve the doubled quotes required by that nested SQL string.
DO $migration$
DECLARE
    function_signature regprocedure;
    current_definition text;
    updated_definition text;
BEGIN
    FOREACH function_signature IN ARRAY ARRAY[
        'catalog.search_visible_facet(text,jsonb,text)'::regprocedure,
        'catalog.search_visible_items(text,jsonb,text,text,text,bigint,integer)'::regprocedure
    ]
    LOOP
        SELECT pg_get_functiondef(function_signature)
          INTO current_definition;

        updated_definition := replace(
            current_definition,
            $find$$7 = ''$find$,
            $replacement$$7 = ''''$replacement$
        );

        IF updated_definition = current_definition THEN
            RAISE EXCEPTION 'dynamic SQL quote repair did not change function %', function_signature;
        END IF;

        EXECUTE updated_definition;
    END LOOP;
END
$migration$;
