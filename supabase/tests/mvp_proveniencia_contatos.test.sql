BEGIN;
SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

INSERT INTO auth.users(id,email,raw_user_meta_data,aud,role,email_confirmed_at) VALUES
('a0000000-0000-4000-8000-000000000001','mvp-a@example.test','{"nome":"MVP A","consentimento_lgpd":true}','authenticated','authenticated',now()),
('a0000000-0000-4000-8000-000000000002','mvp-b@example.test','{"nome":"MVP B","consentimento_lgpd":true}','authenticated','authenticated',now());

INSERT INTO public.contatos_alerta(usuario_id,nome,tipo_contato,email,consentimento,verificado_em,canal_email)
VALUES('a0000000-0000-4000-8000-000000000001','MVP A','email','original@example.test',true,now(),true);

-- Ensure the existing version is valid regardless of the runner's wall-clock date.
UPDATE public.regras_avaliacao SET vigente_de=now()-interval '1 day', vigente_ate=NULL
WHERE versao='exp-2026.11-v1';
CREATE TEMP TABLE mvp_payload(value JSONB);
INSERT INTO mvp_payload VALUES('{
  "origem":"regiao","regra_versao":"exp-2026.11-v1","motor_versao":"1.0.0",
  "hash_entrada":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "evidencias":[],"resultado":{"nivel":"atencao_experimental","nivel_ordem":2,
  "titulo":"Fixture","resumo":"Declaração de teste","explicacao":"Cálculo de cliente não validado"}
}');
GRANT SELECT ON mvp_payload TO authenticated;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims='{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT lives_ok($$ UPDATE public.contatos_alerta SET email='novo@example.test' WHERE usuario_id=auth.uid() $$,'owner may change destination');
SELECT is((SELECT verificado_em FROM public.contatos_alerta WHERE usuario_id=auth.uid()),NULL::timestamptz,'destination change clears verification');
SELECT is((SELECT canal_email FROM public.contatos_alerta WHERE usuario_id=auth.uid()),false,'destination change disables external channel');
SELECT throws_ok($$ UPDATE public.contatos_alerta SET verificado_em=now() WHERE usuario_id=auth.uid() $$,'42501',NULL,'user cannot verify contact');
SELECT throws_ok($$ UPDATE public.contatos_alerta SET usuario_id='a0000000-0000-4000-8000-000000000002' WHERE usuario_id=auth.uid() $$,'42501',NULL,'ownership is immutable');
SELECT lives_ok($$ SELECT public.registrar_avaliacao_preventiva(value) FROM mvp_payload $$,'client declaration can be stored');
SELECT is((SELECT count(*)::integer FROM public.historico_avaliacoes_preventivas()),1,'owner sees own declaration');
SELECT throws_ok($$ SELECT public.registrar_avaliacao_preventiva(value || '{"metadados":{"nested":[{"latitude":-23}]}}') FROM mvp_payload $$,'22023',NULL,'nested coordinate rejected by RPC');
SELECT ok((SELECT bool_and(public.consumir_cota_geocodificacao()) FROM generate_series(1,10)),'first ten user requests allowed');
SELECT is(public.consumir_cota_geocodificacao(),false,'eleventh request rejected by distributed quota');

SET LOCAL request.jwt.claims='{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}';
SELECT is((SELECT count(*)::integer FROM public.contatos_alerta),0,'B cannot read contact A');
SELECT is((SELECT count(*)::integer FROM public.historico_avaliacoes_preventivas()),0,'B cannot read history A');
SELECT is(public.consumir_cota_geocodificacao(),true,'B has independent user quota');

RESET ROLE;
SELECT is((SELECT natureza_registro FROM public.execucoes_avaliacao WHERE usuario_id='a0000000-0000-4000-8000-000000000001'),'declaracao_cliente','history is explicitly a client declaration');
SELECT is((SELECT validado_servidor FROM public.execucoes_avaliacao WHERE usuario_id='a0000000-0000-4000-8000-000000000001'),false,'history is never scientifically validated by this RPC');
SELECT is((SELECT hash_algoritmo FROM public.execucoes_avaliacao WHERE usuario_id='a0000000-0000-4000-8000-000000000001'),'sha256_jsonb_v1','server digest algorithm is recorded');
SELECT is((SELECT hash_entrada FROM public.execucoes_avaliacao WHERE usuario_id='a0000000-0000-4000-8000-000000000001'),
 (SELECT encode(extensions.digest((entrada-'hash_entrada')::text,'sha256'),'hex') FROM public.execucoes_avaliacao WHERE usuario_id='a0000000-0000-4000-8000-000000000001'),'server digest matches actual stored payload');
SELECT ok(NOT has_function_privilege('anon','public.consumir_cota_geocodificacao()','EXECUTE'),'quota RPC unavailable to anon');
SELECT ok(NOT has_table_privilege('authenticated','public.cotas_geocodificacao','SELECT'),'quota counters private');
SELECT ok(EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='ocorrencias' AND column_name='ocorrido_em'),'occurrence timestamp is separate from verification');
SELECT * FROM finish();
ROLLBACK;
