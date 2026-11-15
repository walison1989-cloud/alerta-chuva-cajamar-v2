-- Diagnóstico SOMENTE LEITURA para usar o banco Supabase já existente.
-- Não cria, altera nem apaga objetos. Execute no SQL Editor da conta responsável.

-- 1. Objetos exigidos pelo frontend v1.2.
WITH required_objects(nome, tipo) AS (
  VALUES
    ('public.areas_suscetibilidade', 'tabela'),
    ('public.estacoes', 'tabela'),
    ('public.medicoes_chuva', 'tabela'),
    ('public.vw_estacoes_publicas', 'view'),
    ('public.terreno_motor2_perfis', 'tabela'),
    ('public.terreno_motor2_blocos', 'tabela'),
    ('public.regras_avaliacao', 'tabela'),
    ('public.contatos_alerta', 'tabela')
)
SELECT nome, tipo, to_regclass(nome) IS NOT NULL AS existe
FROM required_objects ORDER BY nome;

-- 2. Funções de avaliação/altimetria disponíveis.
SELECT n.nspname AS esquema,
       p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       pg_get_function_result(p.oid) AS retorno
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'terreno_motor2_no_ponto',
    'montar_pacote_evidencias',
    'evidencias_avaliacao_no_ponto',
    'evidencias_avaliacao_do_morador',
    'registrar_avaliacao_preventiva',
    'historico_avaliacoes_preventivas'
  )
ORDER BY funcao;

-- 3. Perfis de terreno carregados; não expõe o conteúdo do raster.
-- Execute apenas caso terreno_motor2_perfis e terreno_motor2_blocos existam.
SELECT p.id, p.ativo,
       p.perfil->>'resolucao_m' AS resolucao_m,
       p.perfil->>'formato' AS formato,
       p.perfil->>'blocos_esperados' AS blocos_esperados,
       COUNT(b.perfil_id) AS blocos_presentes
FROM public.terreno_motor2_perfis p
LEFT JOIN public.terreno_motor2_blocos b ON b.perfil_id = p.id
GROUP BY p.id, p.ativo, p.perfil
ORDER BY p.ativo DESC, p.id;

-- 4. Regra de avaliação publicada; execute apenas caso regras_avaliacao exista.
SELECT versao, motor_versao, publicada
FROM public.regras_avaliacao
WHERE versao = 'exp-2026.11-v2';

-- 5. Histórico de migrations, se presente no banco; habilite a linha abaixo
-- somente se você confirmar acesso à tabela:
-- SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
