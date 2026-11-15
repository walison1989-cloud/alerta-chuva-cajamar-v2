-- =====================================================================
-- Etapa 3 — views públicas, consultas PostGIS e RLS
--
-- Princípios:
-- - A camada pública só enxerga estações explicitamente validadas e
--   medições do tipo acumulado_24h. Dados legados de teste ficam ocultos.
-- - O endereço do morador continua privado. As funções autenticadas usam
--   auth.uid() e a RLS de `enderecos`; nenhuma coordenada pessoal volta em
--   uma consulta pública.
-- - Acumulado de 24 h nunca é somado como se fosse medição por intervalo.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

SET search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. FUNÇÕES E VIEWS (recriação idempotente)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.estacoes_proximas(double precision, double precision, double precision, integer);
DROP FUNCTION IF EXISTS public.estacoes_proximas_do_morador(double precision, integer);
DROP FUNCTION IF EXISTS public.distancia_morador_estacao(integer);
DROP FUNCTION IF EXISTS public.ultima_chuva_acumulada_24h(integer);
DROP FUNCTION IF EXISTS public.soma_chuva_intervalo(integer, timestamptz, timestamptz);

DROP VIEW IF EXISTS public.vw_estacoes_publicas CASCADE;
DROP VIEW IF EXISTS public.vw_coletas_publicas CASCADE;
DROP VIEW IF EXISTS public.vw_ocorrencias_publicas CASCADE;

-- Estações validadas + última leitura acumulada de 24 h. A view é
-- security_invoker: a RLS das tabelas continua valendo para anon/auth.
CREATE VIEW public.vw_estacoes_publicas
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
    (m.id_medicao IS NOT NULL) AS tem_leitura
FROM public.estacoes e
LEFT JOIN LATERAL (
    SELECT m.*
    FROM public.medicoes_chuva m
    WHERE m.id_estacao = e.id_estacao
      AND m.tipo_medicao = 'acumulado_24h'
    ORDER BY m.data_hora DESC, m.id_medicao DESC
    LIMIT 1
) m ON TRUE
WHERE e.validada IS TRUE
  AND e.fonte IS NOT NULL
  AND e.latitude IS NOT NULL
  AND e.longitude IS NOT NULL;

COMMENT ON VIEW public.vw_estacoes_publicas IS
    'Estações oficiais validadas e a última leitura acumulada de 24 h. Não contém dados pessoais.';

-- Status não pessoal da última sincronização. A view é security definer
-- (padrão) para ler coletas_fonte sem conceder a tabela-base ao público;
-- apenas colunas seguras são projetadas (erro_interno fica de fora).
CREATE VIEW public.vw_coletas_publicas
WITH (security_invoker = false) AS
SELECT
    f.fonte,
    a.status AS status_ultima_tentativa,
    a.iniciado_em AS ultima_tentativa_em,
    a.concluido_em AS ultima_conclusao_em,
    a.payload_atualizado_em,
    a.estacoes_recebidas,
    a.estacoes_no_raio,
    a.medicoes_gravadas,
    a.medicoes_sem_leitura,
    a.duracao_ms,
    a.mensagem_publica,
    s.concluido_em AS ultimo_sucesso_em
FROM (SELECT DISTINCT fonte FROM public.coletas_fonte) f
LEFT JOIN LATERAL (
    SELECT c.*
    FROM public.coletas_fonte c
    WHERE c.fonte = f.fonte
    ORDER BY c.iniciado_em DESC, c.id DESC
    LIMIT 1
) a ON TRUE
LEFT JOIN LATERAL (
    SELECT c.*
    FROM public.coletas_fonte c
    WHERE c.fonte = f.fonte
      AND c.status IN ('sucesso', 'parcial')
    ORDER BY c.iniciado_em DESC, c.id DESC
    LIMIT 1
) s ON TRUE;

COMMENT ON VIEW public.vw_coletas_publicas IS
    'Última tentativa e último sucesso por fonte. Não expõe erro_interno nem segredos.';

-- Ocorrências verificadas e explicitamente públicas. Não expõe usuario_id,
-- endereço, telefone ou qualquer dado pessoal.
CREATE VIEW public.vw_ocorrencias_publicas
WITH (security_invoker = false) AS
SELECT
    id,
    tipo,
    descricao,
    bairro,
    latitude,
    longitude,
    fonte,
    verificado_em,
    criado_em
FROM public.ocorrencias
WHERE status = 'verificada'
  AND publica IS TRUE
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

COMMENT ON VIEW public.vw_ocorrencias_publicas IS
    'Somente ocorrências verificadas, públicas e com ponto. Sem PII.';

-- ---------------------------------------------------------------------
-- 2. CONSULTAS POSTGIS
-- ---------------------------------------------------------------------
CREATE FUNCTION public.estacoes_proximas(
    p_latitude double precision,
    p_longitude double precision,
    p_raio_km double precision DEFAULT 30,
    p_limite integer DEFAULT 20
)
RETURNS TABLE (
    id_estacao integer,
    nome_estacao text,
    codigo_estacao text,
    latitude double precision,
    longitude double precision,
    fonte text,
    fonte_id text,
    municipio text,
    uf text,
    tipo_estacao text,
    rede text,
    status_fonte integer,
    ultima_coleta_em timestamptz,
    ultima_leitura_em timestamptz,
    chuva_acumulada_mm numeric,
    tipo_medicao text,
    janela_horas smallint,
    unidade text,
    qualidade_dado text,
    fonte_dado text,
    medicao_coletada_em timestamptz,
    tem_leitura boolean,
    distancia_km double precision
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
WITH ponto AS (
    SELECT ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography AS g
    WHERE p_latitude BETWEEN -90 AND 90
      AND p_longitude BETWEEN -180 AND 180
      AND p_raio_km IS NOT NULL
      AND p_raio_km > 0
      AND p_limite IS NOT NULL
      AND p_limite > 0
)
SELECT
    v.id_estacao,
    v.nome_estacao,
    v.codigo_estacao,
    v.latitude,
    v.longitude,
    v.fonte,
    v.fonte_id,
    v.municipio,
    v.uf::text,
    v.tipo_estacao,
    v.rede,
    v.status_fonte,
    v.ultima_coleta_em,
    v.ultima_leitura_em,
    v.chuva_acumulada_mm,
    v.tipo_medicao,
    v.janela_horas,
    v.unidade,
    v.qualidade_dado,
    v.fonte_dado,
    v.medicao_coletada_em,
    v.tem_leitura,
    round((
        ST_Distance(
            ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
            p.g
        ) / 1000
    )::numeric, 2)::double precision AS distancia_km
FROM public.vw_estacoes_publicas v
CROSS JOIN ponto p
WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
    p.g,
    LEAST(GREATEST(p_raio_km, 0.1), 100) * 1000
)
ORDER BY distancia_km ASC
LIMIT LEAST(GREATEST(p_limite, 1), 50);
$$;

COMMENT ON FUNCTION public.estacoes_proximas(double precision, double precision, double precision, integer) IS
    'Estações públicas dentro do raio, ordenadas por distância geodésica (PostGIS geography).';

-- Mesma consulta, mas ancorada no endereço privado do usuário autenticado.
-- Não recebe coordenadas do cliente: usa auth.uid() + RLS de enderecos.
CREATE FUNCTION public.estacoes_proximas_do_morador(
    p_raio_km double precision DEFAULT 30,
    p_limite integer DEFAULT 20
)
RETURNS TABLE (
    id_estacao integer,
    nome_estacao text,
    codigo_estacao text,
    latitude double precision,
    longitude double precision,
    fonte text,
    fonte_id text,
    municipio text,
    uf text,
    tipo_estacao text,
    rede text,
    status_fonte integer,
    ultima_coleta_em timestamptz,
    ultima_leitura_em timestamptz,
    chuva_acumulada_mm numeric,
    tipo_medicao text,
    janela_horas smallint,
    unidade text,
    qualidade_dado text,
    fonte_dado text,
    medicao_coletada_em timestamptz,
    tem_leitura boolean,
    distancia_km double precision
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
WITH meu_endereco AS (
    SELECT e.localizacao
    FROM public.enderecos e
    WHERE e.usuario_id = auth.uid()
      AND e.localizacao IS NOT NULL
      AND p_raio_km IS NOT NULL
      AND p_raio_km > 0
      AND p_limite IS NOT NULL
      AND p_limite > 0
    LIMIT 1
)
SELECT
    v.id_estacao,
    v.nome_estacao,
    v.codigo_estacao,
    v.latitude,
    v.longitude,
    v.fonte,
    v.fonte_id,
    v.municipio,
    v.uf::text,
    v.tipo_estacao,
    v.rede,
    v.status_fonte,
    v.ultima_coleta_em,
    v.ultima_leitura_em,
    v.chuva_acumulada_mm,
    v.tipo_medicao,
    v.janela_horas,
    v.unidade,
    v.qualidade_dado,
    v.fonte_dado,
    v.medicao_coletada_em,
    v.tem_leitura,
    round((
        ST_Distance(
            ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
            e.localizacao::geography
        ) / 1000
    )::numeric, 2)::double precision AS distancia_km
FROM public.vw_estacoes_publicas v
CROSS JOIN meu_endereco e
WHERE ST_DWithin(
    ST_SetSRID(ST_MakePoint(v.longitude, v.latitude), 4326)::geography,
    e.localizacao::geography,
    LEAST(GREATEST(p_raio_km, 0.1), 100) * 1000
)
ORDER BY distancia_km ASC
LIMIT LEAST(GREATEST(p_limite, 1), 50);
$$;

COMMENT ON FUNCTION public.estacoes_proximas_do_morador(double precision, integer) IS
    'Estações próximas do imóvel do próprio usuário. Usa auth.uid(); não aceita coordenadas pessoais do cliente.';

CREATE FUNCTION public.distancia_morador_estacao(p_id_estacao integer)
RETURNS double precision
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
SELECT round((
    ST_Distance(
        e.localizacao::geography,
        ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326)::geography
    ) / 1000
)::numeric, 2)::double precision
FROM public.enderecos e
JOIN public.estacoes s
  ON s.id_estacao = p_id_estacao
 AND s.validada IS TRUE
WHERE e.usuario_id = auth.uid()
  AND e.localizacao IS NOT NULL
LIMIT 1;
$$;

COMMENT ON FUNCTION public.distancia_morador_estacao(integer) IS
    'Distância geodésica em km entre o imóvel do usuário e uma estação pública.';

CREATE FUNCTION public.ultima_chuva_acumulada_24h(p_id_estacao integer)
RETURNS TABLE (
    data_hora timestamptz,
    precipitacao_mm numeric,
    janela_horas smallint,
    qualidade_dado text,
    fonte_dado text
)
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
SELECT
    m.data_hora,
    m.precipitacao_mm,
    m.janela_horas,
    m.qualidade_dado,
    m.fonte_dado
FROM public.medicoes_chuva m
WHERE m.id_estacao = p_id_estacao
  AND m.tipo_medicao = 'acumulado_24h'
ORDER BY m.data_hora DESC, m.id_medicao DESC
LIMIT 1;
$$;

COMMENT ON FUNCTION public.ultima_chuva_acumulada_24h(integer) IS
    'Último acumulado de 24 h da estação. Não soma medições de intervalo.';

-- SECURITY DEFINER porque a RLS pública de medicoes_chuva expõe apenas
-- acumulado_24h. Sem isso, a soma de intervalo voltaria NULL para o cliente.
-- A função valida explicitamente que a estação é pública e nunca soma outro
-- tipo de medição.
CREATE FUNCTION public.soma_chuva_intervalo(
    p_id_estacao integer,
    p_inicio timestamptz,
    p_fim timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
SELECT sum(m.precipitacao_mm)
FROM public.medicoes_chuva m
JOIN public.estacoes e
  ON e.id_estacao = m.id_estacao
 AND e.validada IS TRUE
 AND e.fonte IS NOT NULL
WHERE m.id_estacao = p_id_estacao
  AND m.tipo_medicao = 'intervalo'
  AND m.data_hora >= p_inicio
  AND m.data_hora < p_fim
  AND p_inicio < p_fim;
$$;

COMMENT ON FUNCTION public.soma_chuva_intervalo(integer, timestamptz, timestamptz) IS
    'Soma somente medições por intervalo de estação pública no período. Nunca inclui acumulado_24h.';

-- ---------------------------------------------------------------------
-- 3. RLS — leitura pública apenas de dados não pessoais e validados
-- ---------------------------------------------------------------------
ALTER TABLE public.estacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes_chuva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coletas_fonte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS estacoes_select_publicas ON public.estacoes;
CREATE POLICY estacoes_select_publicas
ON public.estacoes
FOR SELECT
TO anon, authenticated
USING (validada IS TRUE AND fonte IS NOT NULL);

DROP POLICY IF EXISTS medicoes_select_publicas ON public.medicoes_chuva;
CREATE POLICY medicoes_select_publicas
ON public.medicoes_chuva
FOR SELECT
TO anon, authenticated
USING (
    tipo_medicao = 'acumulado_24h'
    AND EXISTS (
        SELECT 1
        FROM public.estacoes e
        WHERE e.id_estacao = medicoes_chuva.id_estacao
          AND e.validada IS TRUE
          AND e.fonte IS NOT NULL
    )
);

-- A view de coletas é a única porta pública para o log. A tabela-base
-- permanece sem grant para anon/authenticated.
DROP POLICY IF EXISTS coletas_sem_acesso_publico ON public.coletas_fonte;

-- Ocorrências: a view filtra a curadoria. A política documenta a regra e
-- permite uma futura exposição direta sem abrir registros pendentes.
DROP POLICY IF EXISTS ocorrencias_select_publicas ON public.ocorrencias;
CREATE POLICY ocorrencias_select_publicas
ON public.ocorrencias
FOR SELECT
TO anon, authenticated
USING (status = 'verificada' AND publica IS TRUE);

-- ---------------------------------------------------------------------
-- 4. GRANTS
-- ---------------------------------------------------------------------
REVOKE ALL ON public.estacoes FROM anon, authenticated;
REVOKE ALL ON public.medicoes_chuva FROM anon, authenticated;
REVOKE ALL ON public.coletas_fonte FROM anon, authenticated;
REVOKE ALL ON public.ocorrencias FROM anon, authenticated;

GRANT SELECT ON public.estacoes TO anon, authenticated;
GRANT SELECT ON public.medicoes_chuva TO anon, authenticated;

GRANT SELECT ON public.vw_estacoes_publicas TO anon, authenticated;
GRANT SELECT ON public.vw_coletas_publicas TO anon, authenticated;
GRANT SELECT ON public.vw_ocorrencias_publicas TO anon, authenticated;

REVOKE ALL ON FUNCTION public.estacoes_proximas(double precision, double precision, double precision, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estacoes_proximas_do_morador(double precision, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.distancia_morador_estacao(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ultima_chuva_acumulada_24h(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.soma_chuva_intervalo(integer, timestamptz, timestamptz) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.estacoes_proximas(double precision, double precision, double precision, integer)
    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.estacoes_proximas_do_morador(double precision, integer)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.distancia_morador_estacao(integer)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.ultima_chuva_acumulada_24h(integer)
    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.soma_chuva_intervalo(integer, timestamptz, timestamptz)
    TO anon, authenticated;

COMMENT ON TABLE public.estacoes IS
    'Estações com proveniência. A RLS pública expõe somente validada=true e fonte preenchida.';
COMMENT ON TABLE public.medicoes_chuva IS
    'Medições com tipo explícito. A RLS pública expõe somente acumulado_24h de estações validadas.';
COMMENT ON TABLE public.coletas_fonte IS
    'Auditoria de sincronização. Sem acesso direto público; usar vw_coletas_publicas.';

NOTIFY pgrst, 'reload schema';
