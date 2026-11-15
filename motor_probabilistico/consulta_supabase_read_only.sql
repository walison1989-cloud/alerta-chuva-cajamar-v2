-- =====================================================================
-- CONSULTA SOMENTE LEITURA — Diagnóstico de dados reais no Supabase
-- Motor Probabilístico de Alagamento 2.0
--
-- Execute no SQL Editor do Supabase (Project > SQL Editor).
-- NÃO modifica dados. Não insere, não atualiza, não apaga.
-- Não expõe credenciais. Não requer service_role.
-- =====================================================================

-- 1) ESTAÇÕES — contagem e período com dados de proveniência CEMADEN
SELECT
    'estacoes' AS tabela,
    COUNT(*) AS total_registros,
    COUNT(*) FILTER (WHERE fonte = 'CEMADEN') AS total_cemaden,
    COUNT(*) FILTER (WHERE validada = TRUE) AS total_validadas,
    MIN(ultima_coleta_em) AS primeira_coleta,
    MAX(ultima_coleta_em) AS ultima_coleta
FROM public.estacoes;

-- 2) MEDIÇÕES DE CHUVA — contagem, tipos e período
SELECT
    'medicoes_chuva' AS tabela,
    COUNT(*) AS total_registros,
    COUNT(*) FILTER (WHERE tipo_medicao = 'acumulado_24h') AS total_acumulado_24h,
    COUNT(*) FILTER (WHERE tipo_medicao = 'intervalo') AS total_intervalo,
    COUNT(*) FILTER (WHERE tipo_medicao IS NULL) AS total_sem_tipo,
    COUNT(*) FILTER (WHERE fonte_dado = 'CEMADEN') AS total_cemaden,
    MIN(data_hora) AS primeira_medicao,
    MAX(data_hora) AS ultima_medicao
FROM public.medicoes_chuva;

-- 3) OCORRÊNCIAS — contagem por tipo e status
SELECT
    'ocorrencias' AS tabela,
    COUNT(*) AS total_registros,
    COUNT(*) FILTER (WHERE tipo = 'alagamento') AS total_alagamento,
    COUNT(*) FILTER (WHERE tipo = 'transbordamento') AS total_transbordamento,
    COUNT(*) FILTER (WHERE tipo = 'deslizamento') AS total_deslizamento,
    COUNT(*) FILTER (WHERE tipo = 'outro') AS total_outro,
    COUNT(*) FILTER (WHERE status = 'verificada') AS total_verificadas,
    COUNT(*) FILTER (WHERE publica = TRUE) AS total_publicas,
    MIN(criado_em) AS primeira_ocorrencia,
    MAX(criado_em) AS ultima_ocorrencia
FROM public.ocorrencias;

-- 4) ÁREAS DE SUSCETIBILIDADE — contagem por tipo e classe
SELECT
    'areas_suscetibilidade' AS tabela,
    COUNT(*) AS total_areas,
    COUNT(*) FILTER (WHERE tipo = 'inundacao') AS total_inundacao,
    COUNT(*) FILTER (WHERE tipo = 'enxurrada') AS total_enxurrada,
    COUNT(*) FILTER (WHERE classe = 'Alta') AS total_alta,
    COUNT(*) FILTER (WHERE classe = 'Media') AS total_media,
    COUNT(*) FILTER (WHERE classe = 'Baixa') AS total_baixa,
    COUNT(*) FILTER (WHERE classe = 'Enxurrada') AS total_enxurrada_classe,
    SUM(area_ha) AS area_total_ha
FROM public.areas_suscetibilidade;

-- 5) RESULTADOS DE AVALIAÇÃO (Etapa 5.2) — contagem por nível
SELECT
    'resultados_avaliacao' AS tabela,
    COUNT(*) AS total_avaliacoes,
    COUNT(*) FILTER (WHERE nivel = 'dados_insuficientes') AS total_dados_insuficientes,
    COUNT(*) FILTER (WHERE nivel = 'sem_sinal_experimental') AS total_sem_sinal,
    COUNT(*) FILTER (WHERE nivel = 'atencao_experimental') AS total_atencao,
    COUNT(*) FILTER (WHERE nivel = 'atencao_forte_experimental') AS total_atencao_forte,
    MIN(gerado_em) AS primeira_avaliacao,
    MAX(gerado_em) AS ultima_avaliacao
FROM public.resultados_avaliacao;

-- 6) REGRAS EXPERIMENTAIS — verificação da regra exp-2026.11-v1
SELECT
    'regras_avaliacao' AS tabela,
    versao,
    motor_versao,
    publicada,
    vigente_de,
    vigente_ate
FROM public.regras_avaliacao
ORDER BY vigente_de DESC
LIMIT 5;

-- 7) EXECUÇÕES DE AVALIAÇÃO — auditoria da Etapa 5.2
SELECT
    'execucoes_avaliacao' AS tabela,
    COUNT(*) AS total_execucoes,
    COUNT(*) FILTER (WHERE status = 'concluida') AS total_concluidas,
    COUNT(*) FILTER (WHERE status = 'dados_insuficientes') AS total_insuficientes,
    COUNT(*) FILTER (WHERE status = 'erro') AS total_erro,
    MIN(iniciada_em) AS primeira_execucao,
    MAX(iniciada_em) AS ultima_execucao
FROM public.execucoes_avaliacao;

-- 8) EVIDÊNCIAS DE AVALIAÇÃO — tipos de fonte
SELECT
    'evidencias_avaliacao' AS tabela,
    COUNT(*) AS total_evidencias,
    tipo,
    fonte,
    COUNT(*) AS contagem_por_tipo_fonte
FROM public.evidencias_avaliacao
GROUP BY tipo, fonte
ORDER BY contagem_por_tipo_fonte DESC
LIMIT 20;

-- =====================================================================
-- FIM DA CONSULTA
-- =====================================================================
