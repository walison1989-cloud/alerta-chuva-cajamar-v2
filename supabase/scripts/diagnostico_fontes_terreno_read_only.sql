-- Diagnóstico somente leitura: identifica objetos já existentes no Supabase.
-- Não altera schemas, privilégios, configurações, dados ou políticas de segurança.
-- Execute no SQL Editor, preferencialmente em homologação.
-- NÃO compartilhe amostras de coordenadas/endereço ou outras informações pessoais.

-- 1. Objetos com nomes topográficos/hidrológicos relevantes.
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema','auth','storage')
  AND (table_name ILIKE '%altimetr%' OR table_name ILIKE '%altitude%'
       OR table_name ILIKE '%terreno%' OR table_name ILIKE '%elevac%'
       OR table_name ILIKE '%decliv%' OR table_name ILIKE '%hidro%'
       OR table_name ILIKE '%bacia%' OR table_name ILIKE '%mdt%')
ORDER BY 1,2;

-- 2. Colunas potencialmente relevantes (sem consultar dados).
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog','information_schema','auth','storage')
  AND (column_name ILIKE '%altimetr%' OR column_name ILIKE '%altitude%'
       OR column_name ILIKE '%terreno%' OR column_name ILIKE '%elevac%'
       OR column_name ILIKE '%decliv%' OR column_name ILIKE '%hidro%'
       OR column_name ILIKE '%bacia%' OR column_name ILIKE '%cota%'
       OR column_name ILIKE '%slope%' OR column_name ILIKE '%geom%')
ORDER BY 1,2,3;

-- 3. Funções e RPCs espaciais existentes (somente assinaturas).
SELECT n.nspname AS schema, p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid) AS retorno
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema','auth','storage','extensions')
  AND (p.proname ILIKE '%terreno%' OR p.proname ILIKE '%altimetr%'
       OR p.proname ILIKE '%altitude%' OR p.proname ILIKE '%elevac%'
       OR p.proname ILIKE '%hidro%' OR p.proname ILIKE '%bacia%'
       OR p.proname ILIKE '%evidencias_avaliacao%')
ORDER BY 1,2;

-- 4. Objetos da rede pluviométrica: verifique que continuam disponíveis.
SELECT to_regclass('public.estacoes') AS estacoes,
       to_regclass('public.medicoes_chuva') AS medicoes_chuva,
       to_regclass('public.vw_estacoes_publicas') AS vw_estacoes_publicas;
