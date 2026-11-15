-- Requires the additive audit migration in an isolated Supabase database.
BEGIN;
SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(5);
SELECT is(public.jsonb_contem_coordenadas('{"metadados":{"nested":[{"latitude":-23.3}]}}'), true, 'nested coordinate rejected');
SELECT is(public.jsonb_contem_coordenadas('{"resultado":{"motivos":[{"coordinates":[1,2]}]}}'), true, 'coordinate arrays rejected');
SELECT is(public.jsonb_contem_coordenadas('{"detalhes":{"LAT":1}}'), true, 'case insensitive key');
SELECT is(public.jsonb_contem_coordenadas('{"origem":"imovel","metadados":{"app":"teste"}}'), false, 'normal payload allowed');
SELECT ok(NOT has_function_privilege('anon', 'public.jsonb_contem_coordenadas(jsonb)', 'EXECUTE'), 'helper not exposed anonymously');
SELECT * FROM finish();
ROLLBACK;
