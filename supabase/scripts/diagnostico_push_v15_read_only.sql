-- Execute ANTES da migration em Supabase SQL Editor. SOMENTE LEITURA.
-- Verifica se as estruturas já existem. Não exibe endpoints/assinaturas.
SELECT to_regclass('public.push_morador_assinaturas') AS assinaturas,
       to_regclass('public.push_morador_entregas') AS entregas,
       to_regclass('public.eventos_risco_servidor') AS eventos_confirmados_servidor;

SELECT n.nspname AS schema, c.relname AS tabela,
       c.relrowsecurity AS rls_habilitado
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public'
  AND c.relname IN ('push_morador_assinaturas','push_morador_entregas','eventos_risco_servidor')
ORDER BY c.relname;
