-- Compatível com a view já existente: não remove, reordena nem troca colunas antigas.
-- O browser e as Edge Functions recebem APENAS estações ativas e validadas.
-- Colunas acrescentadas ao FINAL para permitir verificação independente.
CREATE OR REPLACE VIEW public.vw_estacoes_publicas
WITH (security_invoker = true) AS
SELECT
    e.id_estacao,
    e.nome_estacao,
    e.codigo_estacao,
    e.latitude,
    e.longitude,
    e.fonte,
    e.fonte_id,
    e.municipio,
    e.uf,
    e.tipo_estacao,
    e.rede,
    e.status_fonte,
    e.ultima_coleta_em,
    m.data_hora AS ultima_leitura_em,
    m.precipitacao_mm AS chuva_acumulada_mm,
    m.tipo_medicao,
    m.janela_horas,
    m.unidade,
    m.qualidade_dado,
    m.fonte_dado,
    m.coletado_em AS medicao_coletada_em,
    m.id_medicao IS NOT NULL AS tem_leitura,
    e.ativa,
    e.validada
FROM public.estacoes e
LEFT JOIN LATERAL (
    SELECT m1.id_medicao, m1.id_estacao, m1.data_hora,
           m1.precipitacao_mm, m1.fonte_dado, m1.data_registro,
           m1.tipo_medicao, m1.janela_horas, m1.unidade,
           m1.qualidade_dado, m1.coletado_em
    FROM public.medicoes_chuva m1
    WHERE m1.id_estacao = e.id_estacao
      AND m1.tipo_medicao = 'acumulado_24h'
    ORDER BY m1.data_hora DESC, m1.id_medicao DESC
    LIMIT 1
) m ON TRUE
WHERE e.ativa IS TRUE
  AND e.validada IS TRUE
  AND e.fonte IS NOT NULL
  AND e.latitude IS NOT NULL
  AND e.longitude IS NOT NULL;

COMMENT ON VIEW public.vw_estacoes_publicas IS
'Camada de estações ATIVAS e VALIDADAS. Leituras com atraso, janela incompatível ou qualidade ruim são descartadas pelo motor de triangulação GPS.';
