-- =====================================================================
-- Etapa 5.2 — motor experimental de análise preventiva de alagamentos
--
-- Esta migration é ADITIVA. Ela não altera tabelas, views ou funções das
-- Etapas 2 a 5.1. Cria apenas:
--   - regras_avaliacao          (regras experimentais versionadas)
--   - execucoes_avaliacao       (auditoria de cada avaliação registrada)
--   - evidencias_avaliacao      (fontes e valores usados na avaliação)
--   - resultados_avaliacao      (classificação explicável)
--   - previas_notificacao       (prévia interna, sem envio)
--
-- Princípios:
--   - a avaliação é EXPERIMENTAL: não é alerta oficial, não é probabilidade
--     de alagamento e não substitui a Defesa Civil;
--   - chuva observada (CEMADEN, acumulado_24h) e previsão (Open-Meteo) são
--     dimensões separadas e identificadas como tal;
--   - nenhuma coordenada residencial é gravada nas tabelas novas;
--   - a persistência só ocorre para usuário autenticado;
--   - as tabelas-base não têm SELECT direto para anon/authenticated: as
--     únicas portas são as RPCs e a view pública de regras;
--   - o projeto concede EXECUTE a anon por ALTER DEFAULT PRIVILEGES, então
--     toda função nova é revogada explicitamente antes dos grants.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

SET search_path = public, extensions;
SET lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 1. REGRAS EXPERIMENTAIS VERSIONADAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.regras_avaliacao (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    versao TEXT NOT NULL UNIQUE,
    motor_versao TEXT NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    parametros JSONB NOT NULL,
    aviso TEXT NOT NULL,
    publicada BOOLEAN NOT NULL DEFAULT FALSE,
    vigente_de TIMESTAMPTZ NOT NULL DEFAULT now(),
    vigente_ate TIMESTAMPTZ,
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT regras_avaliacao_versao_formato
        CHECK (versao ~ '^[a-z0-9][a-z0-9._-]{2,49}$'),
    CONSTRAINT regras_avaliacao_motor_versao_formato
        CHECK (motor_versao ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
    CONSTRAINT regras_avaliacao_titulo_preenchido
        CHECK (char_length(btrim(titulo)) > 0),
    CONSTRAINT regras_avaliacao_descricao_preenchida
        CHECK (char_length(btrim(descricao)) >= 20),
    CONSTRAINT regras_avaliacao_aviso_preenchido
        CHECK (char_length(btrim(aviso)) >= 40),
    CONSTRAINT regras_avaliacao_parametros_objeto
        CHECK (jsonb_typeof(parametros) = 'object'),
    CONSTRAINT regras_avaliacao_parametros_estrutura
        CHECK (
            jsonb_typeof(parametros->'regras') = 'array'
            AND jsonb_array_length(parametros->'regras') > 0
            AND jsonb_typeof(parametros->'faixas_observado_24h_mm') = 'array'
            AND jsonb_typeof(parametros->'faixas_previsao_24h_mm') = 'array'
        ),
    CONSTRAINT regras_avaliacao_vigencia
        CHECK (vigente_ate IS NULL OR vigente_ate > vigente_de)
);

-- No máximo uma regra publicada por vez. O histórico permanece com
-- publicada = false e pode ser consultado pela administração.
CREATE UNIQUE INDEX IF NOT EXISTS ux_regras_avaliacao_uma_publicada
    ON public.regras_avaliacao (publicada)
    WHERE publicada IS TRUE;

CREATE INDEX IF NOT EXISTS idx_regras_avaliacao_vigencia
    ON public.regras_avaliacao (publicada, vigente_de DESC, vigente_ate DESC);

COMMENT ON TABLE public.regras_avaliacao IS
    'Regras experimentais versionadas do motor de análise preventiva. Não são critérios oficiais.';
COMMENT ON COLUMN public.regras_avaliacao.versao IS
    'Versão da configuração da regra (ex.: exp-2026.11-v1).';
COMMENT ON COLUMN public.regras_avaliacao.motor_versao IS
    'Versão do código do motor que interpreta esta configuração.';
COMMENT ON COLUMN public.regras_avaliacao.parametros IS
    'Faixas, raios, limites de frescor e matriz de regras. Não contém dados pessoais.';
COMMENT ON COLUMN public.regras_avaliacao.publicada IS
    'Somente uma regra publicada por vez; a view pública só expõe a regra vigente.';

-- ---------------------------------------------------------------------
-- 2. EXECUÇÕES, EVIDÊNCIAS E RESULTADOS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.execucoes_avaliacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    regra_id BIGINT NOT NULL REFERENCES public.regras_avaliacao(id),
    regra_versao TEXT NOT NULL,
    motor_versao TEXT NOT NULL,
    origem TEXT NOT NULL,
    municipio TEXT,
    bairro TEXT,
    regiao TEXT,
    status TEXT NOT NULL,
    hash_entrada TEXT NOT NULL,
    entrada JSONB NOT NULL,
    iniciada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    concluida_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT execucoes_origem_valida
        CHECK (origem IN ('imovel', 'regiao')),
    CONSTRAINT execucoes_status_valido
        CHECK (status IN ('concluida', 'dados_insuficientes', 'erro')),
    CONSTRAINT execucoes_hash_formato
        CHECK (hash_entrada ~ '^[0-9a-f]{64}$'),
    CONSTRAINT execucoes_entrada_objeto
        CHECK (jsonb_typeof(entrada) = 'object'),
    CONSTRAINT execucoes_metadados_objeto
        CHECK (jsonb_typeof(metadados) = 'object'),
    CONSTRAINT execucoes_concluida_depois
        CHECK (concluida_em >= iniciada_em),
    CONSTRAINT execucoes_sem_coordenadas
        CHECK (
            NOT (entrada ? 'latitude')
            AND NOT (entrada ? 'longitude')
            AND NOT (entrada ? 'localizacao')
            AND NOT (metadados ? 'latitude')
            AND NOT (metadados ? 'longitude')
            AND NOT (metadados ? 'localizacao')
        )
);

CREATE INDEX IF NOT EXISTS idx_execucoes_avaliacao_usuario
    ON public.execucoes_avaliacao (usuario_id, iniciada_em DESC);
CREATE INDEX IF NOT EXISTS idx_execucoes_avaliacao_regra
    ON public.execucoes_avaliacao (regra_id, iniciada_em DESC);
CREATE INDEX IF NOT EXISTS idx_execucoes_avaliacao_data
    ON public.execucoes_avaliacao (iniciada_em DESC);

COMMENT ON TABLE public.execucoes_avaliacao IS
    'Auditoria das avaliações experimentais registradas por usuários autenticados. Não contém coordenadas.';
COMMENT ON COLUMN public.execucoes_avaliacao.entrada IS
    'Payload canônico da avaliação (sem coordenadas), para reprodução e auditoria.';
COMMENT ON COLUMN public.execucoes_avaliacao.hash_entrada IS
    'SHA-256 hexadecimal do payload canônico, calculado no cliente.';

CREATE TABLE IF NOT EXISTS public.evidencias_avaliacao (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    execucao_id UUID NOT NULL
        REFERENCES public.execucoes_avaliacao(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    fonte TEXT NOT NULL,
    referencia_id TEXT,
    rotulo TEXT NOT NULL,
    valor_num NUMERIC,
    valor_texto TEXT,
    unidade TEXT,
    distancia_m NUMERIC,
    contido BOOLEAN,
    medido_em TIMESTAMPTZ,
    coletado_em TIMESTAMPTZ,
    qualidade TEXT,
    desatualizado BOOLEAN NOT NULL DEFAULT FALSE,
    detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT evidencias_tipo_valido
        CHECK (tipo IN (
            'suscetibilidade',
            'chuva_observada',
            'previsao',
            'qualidade_dado',
            'ocorrencia',
            'localizacao'
        )),
    CONSTRAINT evidencias_valor_presente
        CHECK (valor_num IS NOT NULL OR valor_texto IS NOT NULL),
    CONSTRAINT evidencias_fonte_preenchida
        CHECK (char_length(btrim(fonte)) > 0 AND char_length(fonte) <= 100),
    CONSTRAINT evidencias_rotulo_preenchido
        CHECK (char_length(btrim(rotulo)) > 0 AND char_length(rotulo) <= 300),
    CONSTRAINT evidencias_distancia_nao_negativa
        CHECK (distancia_m IS NULL OR distancia_m >= 0),
    CONSTRAINT evidencias_valor_num_valido
        CHECK (valor_num IS NULL OR valor_num = valor_num),
    CONSTRAINT evidencias_detalhes_objeto
        CHECK (jsonb_typeof(detalhes) = 'object'),
    CONSTRAINT evidencias_sem_coordenadas
        CHECK (
            NOT (detalhes ? 'latitude')
            AND NOT (detalhes ? 'longitude')
            AND NOT (detalhes ? 'localizacao')
        )
);

CREATE INDEX IF NOT EXISTS idx_evidencias_avaliacao_execucao
    ON public.evidencias_avaliacao (execucao_id, tipo);
CREATE INDEX IF NOT EXISTS idx_evidencias_avaliacao_tipo_data
    ON public.evidencias_avaliacao (tipo, medido_em DESC);

COMMENT ON TABLE public.evidencias_avaliacao IS
    'Evidências normalizadas de cada avaliação: suscetibilidade, chuva observada, previsão, qualidade, ocorrências e localização.';
COMMENT ON COLUMN public.evidencias_avaliacao.medido_em IS
    'Horário informado pela fonte (ex.: data_hora do CEMADEN ou referência da previsão).';
COMMENT ON COLUMN public.evidencias_avaliacao.coletado_em IS
    'Horário em que o dado foi coletado/consultado.';
COMMENT ON COLUMN public.evidencias_avaliacao.desatualizado IS
    'Marca de frescor; não é limite de risco.';

CREATE TABLE IF NOT EXISTS public.resultados_avaliacao (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    execucao_id UUID NOT NULL UNIQUE
        REFERENCES public.execucoes_avaliacao(id) ON DELETE CASCADE,
    nivel TEXT NOT NULL,
    nivel_ordem SMALLINT NOT NULL,
    titulo TEXT NOT NULL,
    resumo TEXT NOT NULL,
    explicacao TEXT NOT NULL,
    motivos JSONB NOT NULL DEFAULT '[]'::jsonb,
    dados_ausentes JSONB NOT NULL DEFAULT '[]'::jsonb,
    dados_desatualizados JSONB NOT NULL DEFAULT '[]'::jsonb,
    limitacoes JSONB NOT NULL DEFAULT '[]'::jsonb,
    gerado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT resultados_nivel_valido
        CHECK (nivel IN (
            'dados_insuficientes',
            'sem_sinal_experimental',
            'atencao_experimental',
            'atencao_forte_experimental'
        )),
    CONSTRAINT resultados_nivel_ordem_coerente
        CHECK (
            (nivel = 'dados_insuficientes' AND nivel_ordem = 0)
            OR (nivel = 'sem_sinal_experimental' AND nivel_ordem = 1)
            OR (nivel = 'atencao_experimental' AND nivel_ordem = 2)
            OR (nivel = 'atencao_forte_experimental' AND nivel_ordem = 3)
        ),
    CONSTRAINT resultados_titulo_preenchido
        CHECK (char_length(btrim(titulo)) > 0 AND char_length(titulo) <= 300),
    CONSTRAINT resultados_resumo_preenchido
        CHECK (char_length(btrim(resumo)) > 0 AND char_length(resumo) <= 2000),
    CONSTRAINT resultados_explicacao_preenchida
        CHECK (char_length(btrim(explicacao)) > 0 AND char_length(explicacao) <= 8000),
    CONSTRAINT resultados_motivos_array
        CHECK (jsonb_typeof(motivos) = 'array' AND jsonb_array_length(motivos) <= 50),
    CONSTRAINT resultados_ausentes_array
        CHECK (jsonb_typeof(dados_ausentes) = 'array' AND jsonb_array_length(dados_ausentes) <= 50),
    CONSTRAINT resultados_desatualizados_array
        CHECK (jsonb_typeof(dados_desatualizados) = 'array' AND jsonb_array_length(dados_desatualizados) <= 50),
    CONSTRAINT resultados_limitacoes_array
        CHECK (jsonb_typeof(limitacoes) = 'array' AND jsonb_array_length(limitacoes) <= 30)
);

CREATE INDEX IF NOT EXISTS idx_resultados_avaliacao_nivel
    ON public.resultados_avaliacao (nivel, gerado_em DESC);

COMMENT ON TABLE public.resultados_avaliacao IS
    'Resultado explicável de uma avaliação. nivel_ordem serve apenas para ordenação; não é probabilidade.';
COMMENT ON COLUMN public.resultados_avaliacao.nivel_ordem IS
    '0=dados insuficientes; 1=sem sinal; 2=atenção experimental; 3=atenção forte experimental.';

-- ---------------------------------------------------------------------
-- 3. PRÉVIA INTERNA DE NOTIFICAÇÃO (SEM ENVIO)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.previas_notificacao (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    execucao_id UUID NOT NULL
        REFERENCES public.execucoes_avaliacao(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    canal TEXT NOT NULL DEFAULT 'interno',
    titulo TEXT NOT NULL,
    corpo TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'previa',
    criada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT previas_canal_interno
        CHECK (canal = 'interno'),
    CONSTRAINT previas_status_valido
        CHECK (status IN ('previa', 'descartada')),
    CONSTRAINT previas_titulo_preenchido
        CHECK (char_length(btrim(titulo)) > 0 AND char_length(titulo) <= 200),
    CONSTRAINT previas_corpo_preenchido
        CHECK (char_length(btrim(corpo)) > 0 AND char_length(corpo) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_previas_notificacao_usuario
    ON public.previas_notificacao (usuario_id, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_previas_notificacao_execucao
    ON public.previas_notificacao (execucao_id);

COMMENT ON TABLE public.previas_notificacao IS
    'Prévia interna de aviso para testes. Não há canal externo, destinatário de e-mail/telefone nem função de envio.';
COMMENT ON COLUMN public.previas_notificacao.canal IS
    'Somente interno. Qualquer envio público exige nova etapa, consentimento e calibração.';

-- ---------------------------------------------------------------------
-- 4. VIEW PÚBLICA DA REGRA VIGENTE
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_regras_avaliacao_publicas;

CREATE VIEW public.vw_regras_avaliacao_publicas
WITH (security_invoker = false) AS
SELECT
    id,
    versao,
    motor_versao,
    titulo,
    descricao,
    parametros,
    aviso,
    vigente_de,
    vigente_ate,
    criada_em
FROM public.regras_avaliacao
WHERE publicada IS TRUE
  AND vigente_de <= now()
  AND (vigente_ate IS NULL OR vigente_ate > now());

COMMENT ON VIEW public.vw_regras_avaliacao_publicas IS
    'Regra experimental publicada e vigente. Não contém dados pessoais.';

-- ---------------------------------------------------------------------
-- 5. PACOTE DE EVIDÊNCIAS (função interna, NÃO exposta como RPC)
-- ---------------------------------------------------------------------
-- Recebe coordenadas apenas para calcular distâncias no PostGIS. Nunca
-- devolve coordenadas. É chamada pelas duas RPCs de evidências.
DROP FUNCTION IF EXISTS public.montar_pacote_evidencias(
    double precision, double precision, double precision, double precision, integer
);

CREATE FUNCTION public.montar_pacote_evidencias(
    p_latitude double precision,
    p_longitude double precision,
    p_raio_suscetibilidade_m double precision DEFAULT 500,
    p_raio_estacoes_km double precision DEFAULT 30,
    p_limite_estacoes integer DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_ponto GEOMETRY;
    v_g GEOGRAPHY;
    v_raio_susc NUMERIC;
    v_raio_est NUMERIC;
    v_limite INTEGER;
    v_cartografia JSONB;
    v_areas JSONB;
    v_estacoes JSONB;
    v_coleta JSONB;
    v_ocorrencias JSONB;
    v_resumo JSONB;
    v_referencia JSONB;
BEGIN
    v_raio_susc := LEAST(GREATEST(COALESCE(p_raio_suscetibilidade_m, 500), 0), 10000);
    v_raio_est := LEAST(GREATEST(COALESCE(p_raio_estacoes_km, 30), 0.1), 100);
    v_limite := LEAST(GREATEST(COALESCE(p_limite_estacoes, 10), 1), 50);

    IF p_latitude IS NULL OR p_longitude IS NULL
       OR p_latitude NOT BETWEEN -90 AND 90
       OR p_longitude NOT BETWEEN -180 AND 180 THEN
        RETURN jsonb_build_object(
            'localizacao_valida', false,
            'cartografia', NULL,
            'suscetibilidade_disponivel', false,
            'suscetibilidade', '[]'::jsonb,
            'estacoes', '[]'::jsonb,
            'resumo_chuva', '{}'::jsonb,
            'coleta', NULL,
            'ocorrencias', '[]'::jsonb,
            'gerado_em', now()
        );
    END IF;

    v_ponto := ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326);
    v_g := v_ponto::geography;

    SELECT jsonb_build_object(
        'id', c.id,
        'slug', c.slug,
        'titulo', c.titulo,
        'fonte', c.fonte,
        'editor', c.editor,
        'escala', c.escala,
        'ano_publicacao', c.ano_publicacao,
        'url_item', c.url_item
    )
    INTO v_cartografia
    FROM public.vw_cartografias_suscetibilidade_publicas AS c
    LIMIT 1;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', a.id,
                'cartografia_slug', a.cartografia_slug,
                'tipo', a.tipo,
                'classe', a.classe,
                'classe_ordem', a.classe_ordem,
                'processo', a.processo,
                'area_ha', a.area_ha,
                'contem_ponto', a.contem_ponto,
                'distancia_m', a.distancia_m
            )
            ORDER BY a.contem_ponto DESC, a.classe_ordem DESC NULLS LAST, a.distancia_m ASC
        ),
        '[]'::jsonb
    )
    INTO v_areas
    FROM public.areas_suscetibilidade_no_ponto(
        p_latitude,
        p_longitude,
        v_raio_susc,
        50
    ) AS a;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id_estacao', s.id_estacao,
                'nome', s.nome_estacao,
                'codigo', s.codigo_estacao,
                'municipio', s.municipio,
                'distancia_km', s.distancia_km,
                'chuva_24h_mm', s.chuva_acumulada_mm,
                'data_hora', s.ultima_leitura_em,
                'coletado_em', s.medicao_coletada_em,
                'tipo_medicao', s.tipo_medicao,
                'janela_horas', s.janela_horas,
                'qualidade', s.qualidade_dado,
                'fonte', s.fonte,
                'tem_leitura', s.tem_leitura,
                'idade_horas', CASE
                    WHEN s.ultima_leitura_em IS NULL THEN NULL
                    ELSE round(EXTRACT(EPOCH FROM (now() - s.ultima_leitura_em)) / 3600.0, 2)
                END,
                'desatualizada', CASE
                    WHEN s.ultima_leitura_em IS NULL THEN true
                    ELSE (now() - s.ultima_leitura_em) > interval '6 hours'
                END
            )
            ORDER BY s.distancia_km ASC
        ),
        '[]'::jsonb
    )
    INTO v_estacoes
    FROM public.estacoes_proximas(
        p_latitude,
        p_longitude,
        v_raio_est,
        v_limite
    ) AS s;

    SELECT jsonb_build_object(
        'fonte', c.fonte,
        'status', c.status_ultima_tentativa,
        'ultima_tentativa_em', c.ultima_tentativa_em,
        'ultima_conclusao_em', c.ultima_conclusao_em,
        'ultimo_sucesso_em', c.ultimo_sucesso_em,
        'payload_atualizado_em', c.payload_atualizado_em,
        'estacoes_no_raio', c.estacoes_no_raio,
        'medicoes_gravadas', c.medicoes_gravadas,
        'mensagem_publica', c.mensagem_publica,
        'idade_payload_horas', CASE
            WHEN c.payload_atualizado_em IS NULL THEN NULL
            ELSE round(EXTRACT(EPOCH FROM (now() - c.payload_atualizado_em)) / 3600.0, 2)
        END
    )
    INTO v_coleta
    FROM public.vw_coletas_publicas AS c
    WHERE c.fonte = 'CEMADEN'
    LIMIT 1;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'tipo', o.tipo,
                'descricao', o.descricao,
                'bairro', o.bairro,
                'verificado_em', o.verificado_em,
                'distancia_m', round(
                    ST_Distance(
                        ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
                        v_g
                    )::numeric,
                    1
                )
            )
            ORDER BY o.verificado_em DESC
        ),
        '[]'::jsonb
    )
    INTO v_ocorrencias
    FROM public.vw_ocorrencias_publicas AS o
    WHERE o.verificado_em >= now() - interval '7 days'
      AND ST_DWithin(
          ST_SetSRID(ST_MakePoint(o.longitude, o.latitude), 4326)::geography,
          v_g,
          v_raio_est * 1000
      );

    WITH est AS (
        SELECT *
        FROM jsonb_to_recordset(v_estacoes) AS x(
            chuva_24h_mm NUMERIC,
            distancia_km DOUBLE PRECISION,
            tem_leitura BOOLEAN,
            desatualizada BOOLEAN,
            data_hora TIMESTAMPTZ
        )
    )
    SELECT jsonb_build_object(
        'total_estacoes', count(*),
        'com_leitura', count(*) FILTER (
            WHERE tem_leitura AND chuva_24h_mm IS NOT NULL
        ),
        'frescas', count(*) FILTER (
            WHERE tem_leitura AND chuva_24h_mm IS NOT NULL AND NOT desatualizada
        ),
        'frescas_ate_10km', count(*) FILTER (
            WHERE tem_leitura AND chuva_24h_mm IS NOT NULL
              AND NOT desatualizada AND distancia_km <= 10
        ),
        'max_24h_mm', max(chuva_24h_mm) FILTER (
            WHERE tem_leitura AND chuva_24h_mm IS NOT NULL AND NOT desatualizada
        ),
        'max_ate_10km_mm', max(chuva_24h_mm) FILTER (
            WHERE tem_leitura AND chuva_24h_mm IS NOT NULL
              AND NOT desatualizada AND distancia_km <= 10
        ),
        'mediana_24h_mm', percentile_cont(0.5) WITHIN GROUP (ORDER BY chuva_24h_mm) FILTER (
            WHERE tem_leitura AND chuva_24h_mm IS NOT NULL AND NOT desatualizada
        )
    )
    INTO v_resumo
    FROM est;

    SELECT jsonb_build_object(
        'codigo', x.codigo,
        'nome', x.nome,
        'distancia_km', x.distancia_km,
        'chuva_24h_mm', x.chuva_24h_mm,
        'data_hora', x.data_hora
    )
    INTO v_referencia
    FROM jsonb_to_recordset(v_estacoes) AS x(
        codigo TEXT,
        nome TEXT,
        distancia_km DOUBLE PRECISION,
        chuva_24h_mm NUMERIC,
        data_hora TIMESTAMPTZ,
        tem_leitura BOOLEAN,
        desatualizada BOOLEAN
    )
    WHERE x.tem_leitura IS TRUE
      AND x.chuva_24h_mm IS NOT NULL
      AND x.desatualizada IS FALSE
    ORDER BY x.distancia_km ASC
    LIMIT 1;

    RETURN jsonb_build_object(
        'localizacao_valida', true,
        'cartografia', v_cartografia,
        'suscetibilidade_disponivel', v_cartografia IS NOT NULL,
        'suscetibilidade', v_areas,
        'estacoes', v_estacoes,
        'resumo_chuva', COALESCE(v_resumo, '{}'::jsonb)
            || jsonb_build_object('estacao_referencia', v_referencia),
        'coleta', v_coleta,
        'ocorrencias', v_ocorrencias,
        'gerado_em', now()
    );
END;
$$;

COMMENT ON FUNCTION public.montar_pacote_evidencias(
    double precision, double precision, double precision, double precision, integer
) IS
    'Função interna: monta evidências espaciais e pluviométricas sem devolver coordenadas. Não é RPC pública.';

-- ---------------------------------------------------------------------
-- 6. RPC DE EVIDÊNCIAS DO MORADOR (auth.uid())
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.evidencias_avaliacao_do_morador(
    double precision, double precision, integer
);

CREATE FUNCTION public.evidencias_avaliacao_do_morador(
    p_raio_suscetibilidade_m double precision DEFAULT 500,
    p_raio_estacoes_km double precision DEFAULT 30,
    p_limite_estacoes integer DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_endereco RECORD;
    v_pacote JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'autenticacao_obrigatoria' USING ERRCODE = '42501';
    END IF;

    SELECT
        e.municipio,
        e.bairro,
        e.precisao,
        e.localizacao
    INTO v_endereco
    FROM public.enderecos AS e
    WHERE e.usuario_id = auth.uid()
    LIMIT 1;

    IF v_endereco.localizacao IS NULL THEN
        RETURN jsonb_build_object(
            'tem_endereco', false,
            'localizacao_valida', false,
            'municipio', NULL,
            'bairro', NULL,
            'precisao', NULL,
            'cartografia', NULL,
            'suscetibilidade_disponivel', false,
            'suscetibilidade', '[]'::jsonb,
            'estacoes', '[]'::jsonb,
            'resumo_chuva', '{}'::jsonb,
            'coleta', NULL,
            'ocorrencias', '[]'::jsonb,
            'gerado_em', now()
        );
    END IF;

    v_pacote := public.montar_pacote_evidencias(
        ST_Y(v_endereco.localizacao),
        ST_X(v_endereco.localizacao),
        p_raio_suscetibilidade_m,
        p_raio_estacoes_km,
        p_limite_estacoes
    );

    RETURN v_pacote || jsonb_build_object(
        'tem_endereco', true,
        'municipio', v_endereco.municipio,
        'bairro', v_endereco.bairro,
        'precisao', v_endereco.precisao
    );
END;
$$;

COMMENT ON FUNCTION public.evidencias_avaliacao_do_morador(
    double precision, double precision, integer
) IS
    'Evidências ancoradas no endereço privado do usuário autenticado. Não recebe nem devolve coordenadas.';

-- ---------------------------------------------------------------------
-- 7. RPC DE EVIDÊNCIAS POR PONTO/REGIÃO (pública, sem persistência)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.evidencias_avaliacao_no_ponto(
    double precision, double precision, double precision, double precision, integer
);

CREATE FUNCTION public.evidencias_avaliacao_no_ponto(
    p_latitude double precision,
    p_longitude double precision,
    p_raio_suscetibilidade_m double precision DEFAULT 500,
    p_raio_estacoes_km double precision DEFAULT 30,
    p_limite_estacoes integer DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_pacote JSONB;
BEGIN
    v_pacote := public.montar_pacote_evidencias(
        p_latitude,
        p_longitude,
        p_raio_suscetibilidade_m,
        p_raio_estacoes_km,
        p_limite_estacoes
    );

    RETURN v_pacote || jsonb_build_object(
        'tem_endereco', false,
        'municipio', NULL,
        'bairro', NULL,
        'precisao', NULL
    );
END;
$$;

COMMENT ON FUNCTION public.evidencias_avaliacao_no_ponto(
    double precision, double precision, double precision, double precision, integer
) IS
    'Evidências para uma coordenada ou região de referência. Não persiste o ponto e não devolve coordenadas.';

-- ---------------------------------------------------------------------
-- 8. REGISTRO AUDITÁVEL DA AVALIAÇÃO
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_avaliacao_preventiva(jsonb);

CREATE FUNCTION public.registrar_avaliacao_preventiva(p_entrada JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_usuario UUID := auth.uid();
    v_regra_id BIGINT;
    v_regra_versao TEXT;
    v_motor_versao TEXT;
    v_origem TEXT;
    v_hash TEXT;
    v_resultado JSONB;
    v_nivel TEXT;
    v_ordem SMALLINT;
    v_ordem_declarada SMALLINT;
    v_execucao_id UUID;
    v_tem_endereco BOOLEAN;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'autenticacao_obrigatoria' USING ERRCODE = '42501';
    END IF;

    IF p_entrada IS NULL OR jsonb_typeof(p_entrada) <> 'object' THEN
        RAISE EXCEPTION 'entrada_invalida' USING ERRCODE = '22023';
    END IF;

    IF p_entrada ? 'latitude'
       OR p_entrada ? 'longitude'
       OR p_entrada ? 'localizacao' THEN
        RAISE EXCEPTION 'coordenadas_nao_permitidas' USING ERRCODE = '22023';
    END IF;

    v_regra_versao := nullif(btrim(p_entrada->>'regra_versao'), '');
    v_motor_versao := nullif(btrim(p_entrada->>'motor_versao'), '');
    v_origem := nullif(btrim(p_entrada->>'origem'), '');
    v_hash := nullif(btrim(p_entrada->>'hash_entrada'), '');
    v_resultado := p_entrada->'resultado';

    IF v_regra_versao IS NULL
       OR v_motor_versao IS NULL
       OR v_origem IS NULL
       OR v_hash IS NULL
       OR v_resultado IS NULL
       OR jsonb_typeof(v_resultado) <> 'object' THEN
        RAISE EXCEPTION 'entrada_incompleta' USING ERRCODE = '22023';
    END IF;

    IF v_origem NOT IN ('imovel', 'regiao') THEN
        RAISE EXCEPTION 'origem_invalida' USING ERRCODE = '22023';
    END IF;

    IF v_hash !~ '^[0-9a-f]{64}$' THEN
        RAISE EXCEPTION 'hash_invalido' USING ERRCODE = '22023';
    END IF;

    IF v_origem = 'imovel' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.enderecos AS e
            WHERE e.usuario_id = v_usuario
              AND e.localizacao IS NOT NULL
        )
        INTO v_tem_endereco;

        IF NOT v_tem_endereco THEN
            RAISE EXCEPTION 'endereco_obrigatorio' USING ERRCODE = '22023';
        END IF;
    END IF;

    SELECT r.id
    INTO v_regra_id
    FROM public.regras_avaliacao AS r
    WHERE r.versao = v_regra_versao
      AND r.motor_versao = v_motor_versao
      AND r.publicada IS TRUE
      AND r.vigente_de <= now()
      AND (r.vigente_ate IS NULL OR r.vigente_ate > now())
    LIMIT 1;

    IF v_regra_id IS NULL THEN
        RAISE EXCEPTION 'regra_nao_publicada' USING ERRCODE = '22023';
    END IF;

    v_nivel := nullif(btrim(v_resultado->>'nivel'), '');
    v_ordem_declarada := nullif(v_resultado->>'nivel_ordem', '')::smallint;
    v_ordem := CASE v_nivel
        WHEN 'dados_insuficientes' THEN 0
        WHEN 'sem_sinal_experimental' THEN 1
        WHEN 'atencao_experimental' THEN 2
        WHEN 'atencao_forte_experimental' THEN 3
        ELSE NULL
    END;

    IF v_nivel IS NULL
       OR v_ordem IS NULL
       OR v_ordem_declarada IS DISTINCT FROM v_ordem THEN
        RAISE EXCEPTION 'nivel_invalido' USING ERRCODE = '22023';
    END IF;

    IF nullif(btrim(v_resultado->>'titulo'), '') IS NULL
       OR nullif(btrim(v_resultado->>'resumo'), '') IS NULL
       OR nullif(btrim(v_resultado->>'explicacao'), '') IS NULL THEN
        RAISE EXCEPTION 'resultado_incompleto' USING ERRCODE = '22023';
    END IF;

    IF char_length(v_resultado->>'titulo') > 300
       OR char_length(v_resultado->>'resumo') > 2000
       OR char_length(v_resultado->>'explicacao') > 8000 THEN
        RAISE EXCEPTION 'resultado_longo' USING ERRCODE = '22023';
    END IF;

    IF jsonb_typeof(COALESCE(v_resultado->'motivos', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_resultado->'motivos', '[]'::jsonb)) > 50
       OR jsonb_typeof(COALESCE(v_resultado->'dados_ausentes', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_resultado->'dados_ausentes', '[]'::jsonb)) > 50
       OR jsonb_typeof(COALESCE(v_resultado->'dados_desatualizados', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_resultado->'dados_desatualizados', '[]'::jsonb)) > 50
       OR jsonb_typeof(COALESCE(v_resultado->'limitacoes', '[]'::jsonb)) <> 'array'
       OR jsonb_array_length(COALESCE(v_resultado->'limitacoes', '[]'::jsonb)) > 30 THEN
        RAISE EXCEPTION 'resultado_estrutura_invalida' USING ERRCODE = '22023';
    END IF;

    IF p_entrada->'evidencias' IS NOT NULL
       AND jsonb_typeof(p_entrada->'evidencias') <> 'array' THEN
        RAISE EXCEPTION 'evidencias_invalidas' USING ERRCODE = '22023';
    END IF;

    IF jsonb_array_length(COALESCE(p_entrada->'evidencias', '[]'::jsonb)) > 200 THEN
        RAISE EXCEPTION 'evidencias_demais' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(p_entrada->'evidencias', '[]'::jsonb)) AS e
        WHERE e ? 'latitude'
           OR e ? 'longitude'
           OR e ? 'localizacao'
           OR (
               jsonb_typeof(e->'detalhes') = 'object'
               AND (
                   (e->'detalhes') ? 'latitude'
                   OR (e->'detalhes') ? 'longitude'
                   OR (e->'detalhes') ? 'localizacao'
               )
           )
    ) THEN
        RAISE EXCEPTION 'coordenadas_nao_permitidas' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(p_entrada->'evidencias', '[]'::jsonb)) AS e
        WHERE COALESCE(e->>'tipo', '') NOT IN (
            'suscetibilidade',
            'chuva_observada',
            'previsao',
            'qualidade_dado',
            'ocorrencia',
            'localizacao'
        )
    ) THEN
        RAISE EXCEPTION 'tipo_evidencia_invalido' USING ERRCODE = '22023';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(p_entrada->'evidencias', '[]'::jsonb)) AS e
        WHERE COALESCE(btrim(e->>'fonte'), '') = ''
           OR COALESCE(btrim(e->>'rotulo'), '') = ''
           OR COALESCE(e->>'valor_num', e->>'valor_texto') IS NULL
    ) THEN
        RAISE EXCEPTION 'evidencia_incompleta' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.execucoes_avaliacao (
        usuario_id,
        regra_id,
        regra_versao,
        motor_versao,
        origem,
        municipio,
        bairro,
        regiao,
        status,
        hash_entrada,
        entrada,
        metadados
    ) VALUES (
        v_usuario,
        v_regra_id,
        v_regra_versao,
        v_motor_versao,
        v_origem,
        nullif(btrim(p_entrada->>'municipio'), ''),
        nullif(btrim(p_entrada->>'bairro'), ''),
        nullif(btrim(p_entrada->>'regiao'), ''),
        CASE
            WHEN v_nivel = 'dados_insuficientes' THEN 'dados_insuficientes'
            ELSE 'concluida'
        END,
        v_hash,
        p_entrada,
        CASE
            WHEN jsonb_typeof(p_entrada->'metadados') = 'object' THEN p_entrada->'metadados'
            ELSE '{}'::jsonb
        END
    )
    RETURNING id INTO v_execucao_id;

    INSERT INTO public.evidencias_avaliacao (
        execucao_id,
        tipo,
        fonte,
        referencia_id,
        rotulo,
        valor_num,
        valor_texto,
        unidade,
        distancia_m,
        contido,
        medido_em,
        coletado_em,
        qualidade,
        desatualizado,
        detalhes
    )
    SELECT
        v_execucao_id,
        e.tipo,
        e.fonte,
        e.referencia_id,
        e.rotulo,
        e.valor_num,
        e.valor_texto,
        e.unidade,
        e.distancia_m,
        e.contido,
        e.medido_em,
        e.coletado_em,
        e.qualidade,
        COALESCE(e.desatualizado, false),
        COALESCE(e.detalhes, '{}'::jsonb)
    FROM jsonb_to_recordset(COALESCE(p_entrada->'evidencias', '[]'::jsonb)) AS e(
        tipo TEXT,
        fonte TEXT,
        referencia_id TEXT,
        rotulo TEXT,
        valor_num NUMERIC,
        valor_texto TEXT,
        unidade TEXT,
        distancia_m NUMERIC,
        contido BOOLEAN,
        medido_em TIMESTAMPTZ,
        coletado_em TIMESTAMPTZ,
        qualidade TEXT,
        desatualizado BOOLEAN,
        detalhes JSONB
    );

    INSERT INTO public.resultados_avaliacao (
        execucao_id,
        nivel,
        nivel_ordem,
        titulo,
        resumo,
        explicacao,
        motivos,
        dados_ausentes,
        dados_desatualizados,
        limitacoes
    ) VALUES (
        v_execucao_id,
        v_nivel,
        v_ordem,
        v_resultado->>'titulo',
        v_resultado->>'resumo',
        v_resultado->>'explicacao',
        COALESCE(v_resultado->'motivos', '[]'::jsonb),
        COALESCE(v_resultado->'dados_ausentes', '[]'::jsonb),
        COALESCE(v_resultado->'dados_desatualizados', '[]'::jsonb),
        COALESCE(v_resultado->'limitacoes', '[]'::jsonb)
    );

    RETURN v_execucao_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_avaliacao_preventiva(jsonb) IS
    'Registra uma avaliação experimental do próprio usuário. Valida a regra vigente, o nível, o hash e a ausência de coordenadas.';

-- ---------------------------------------------------------------------
-- 9. HISTÓRICO DO MORADOR
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.historico_avaliacoes_preventivas(integer);

CREATE FUNCTION public.historico_avaliacoes_preventivas(p_limite integer DEFAULT 20)
RETURNS TABLE (
    id UUID,
    iniciada_em TIMESTAMPTZ,
    origem TEXT,
    municipio TEXT,
    bairro TEXT,
    regiao TEXT,
    regra_versao TEXT,
    motor_versao TEXT,
    nivel TEXT,
    nivel_ordem SMALLINT,
    titulo TEXT,
    resumo TEXT,
    motivos JSONB,
    dados_ausentes JSONB,
    dados_desatualizados JSONB,
    total_evidencias INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
    SELECT
        e.id,
        e.iniciada_em,
        e.origem,
        e.municipio,
        e.bairro,
        e.regiao,
        e.regra_versao,
        e.motor_versao,
        r.nivel,
        r.nivel_ordem,
        r.titulo,
        r.resumo,
        r.motivos,
        r.dados_ausentes,
        r.dados_desatualizados,
        (
            SELECT count(*)::integer
            FROM public.evidencias_avaliacao AS ev
            WHERE ev.execucao_id = e.id
        ) AS total_evidencias
    FROM public.execucoes_avaliacao AS e
    JOIN public.resultados_avaliacao AS r
      ON r.execucao_id = e.id
    WHERE e.usuario_id = auth.uid()
    ORDER BY e.iniciada_em DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limite, 20), 1), 50);
$$;

COMMENT ON FUNCTION public.historico_avaliacoes_preventivas(integer) IS
    'Histórico das avaliações do próprio usuário. Não expõe dados de outros moradores.';

-- ---------------------------------------------------------------------
-- 10. PRÉVIA INTERNA DE NOTIFICAÇÃO
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.criar_previa_notificacao_interna(uuid);

CREATE FUNCTION public.criar_previa_notificacao_interna(p_execucao_id UUID)
RETURNS TABLE (
    id BIGINT,
    titulo TEXT,
    corpo TEXT,
    criada_em TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_usuario UUID := auth.uid();
    v_exec RECORD;
    v_titulo TEXT;
    v_corpo TEXT;
    v_id BIGINT;
    v_agora TIMESTAMPTZ := now();
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'autenticacao_obrigatoria' USING ERRCODE = '42501';
    END IF;

    SELECT
        e.id,
        e.iniciada_em,
        e.origem,
        e.municipio,
        e.bairro,
        e.regiao,
        r.nivel,
        r.titulo AS resultado_titulo,
        r.resumo
    INTO v_exec
    FROM public.execucoes_avaliacao AS e
    JOIN public.resultados_avaliacao AS r
      ON r.execucao_id = e.id
    WHERE e.id = p_execucao_id
      AND e.usuario_id = v_usuario;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'execucao_nao_encontrada' USING ERRCODE = '42501';
    END IF;

    v_titulo := left(
        'Prévia interna — ' || COALESCE(v_exec.resultado_titulo, v_exec.nivel),
        200
    );

    v_corpo := left(
        format(
            'Prévia interna, não enviada. Avaliação experimental de %s em %s. Nível: %s. %s Esta mensagem não é alerta oficial e não substitui a Defesa Civil (199).',
            COALESCE(
                NULLIF(v_exec.bairro, ''),
                NULLIF(v_exec.municipio, ''),
                NULLIF(v_exec.regiao, ''),
                'região analisada'
            ),
            to_char(v_exec.iniciada_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
            v_exec.nivel,
            COALESCE(v_exec.resumo, '')
        ),
        2000
    );

    INSERT INTO public.previas_notificacao (
        execucao_id,
        usuario_id,
        canal,
        titulo,
        corpo,
        status,
        criada_em
    ) VALUES (
        p_execucao_id,
        v_usuario,
        'interno',
        v_titulo,
        v_corpo,
        'previa',
        v_agora
    )
    RETURNING previas_notificacao.id INTO v_id;

    RETURN QUERY SELECT v_id, v_titulo, v_corpo, v_agora;
END;
$$;

COMMENT ON FUNCTION public.criar_previa_notificacao_interna(uuid) IS
    'Cria uma prévia interna do próprio usuário. Não envia e-mail, SMS, push ou qualquer mensagem externa.';

-- ---------------------------------------------------------------------
-- 11. RLS — defesa em profundidade
-- ---------------------------------------------------------------------
ALTER TABLE public.regras_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.execucoes_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidencias_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resultados_avaliacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.previas_notificacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regras_avaliacao_select_publicas
    ON public.regras_avaliacao;
CREATE POLICY regras_avaliacao_select_publicas
ON public.regras_avaliacao
FOR SELECT
TO anon, authenticated
USING (
    publicada IS TRUE
    AND vigente_de <= now()
    AND (vigente_ate IS NULL OR vigente_ate > now())
);

DROP POLICY IF EXISTS execucoes_avaliacao_select_proprio
    ON public.execucoes_avaliacao;
CREATE POLICY execucoes_avaliacao_select_proprio
ON public.execucoes_avaliacao
FOR SELECT
TO authenticated
USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS evidencias_avaliacao_select_proprio
    ON public.evidencias_avaliacao;
CREATE POLICY evidencias_avaliacao_select_proprio
ON public.evidencias_avaliacao
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.execucoes_avaliacao AS e
        WHERE e.id = evidencias_avaliacao.execucao_id
          AND e.usuario_id = auth.uid()
    )
);

DROP POLICY IF EXISTS resultados_avaliacao_select_proprio
    ON public.resultados_avaliacao;
CREATE POLICY resultados_avaliacao_select_proprio
ON public.resultados_avaliacao
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.execucoes_avaliacao AS e
        WHERE e.id = resultados_avaliacao.execucao_id
          AND e.usuario_id = auth.uid()
    )
);

DROP POLICY IF EXISTS previas_notificacao_select_proprio
    ON public.previas_notificacao;
CREATE POLICY previas_notificacao_select_proprio
ON public.previas_notificacao
FOR SELECT
TO authenticated
USING (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- 12. GRANTS
-- ---------------------------------------------------------------------
REVOKE ALL ON public.regras_avaliacao FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.execucoes_avaliacao FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.evidencias_avaliacao FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.resultados_avaliacao FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.previas_notificacao FROM PUBLIC, anon, authenticated;

-- As sequências IDENTITY não são expostas pelo PostgREST, mas o
-- ALTER DEFAULT PRIVILEGES do projeto concede USAGE/UPDATE a anon e
-- authenticated. Revogar explicitamente elimina esse privilégio residual.
REVOKE ALL ON SEQUENCE public.regras_avaliacao_id_seq
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.evidencias_avaliacao_id_seq
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.resultados_avaliacao_id_seq
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.previas_notificacao_id_seq
    FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.vw_regras_avaliacao_publicas
    TO anon, authenticated;

REVOKE ALL ON FUNCTION public.montar_pacote_evidencias(
    double precision, double precision, double precision, double precision, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evidencias_avaliacao_do_morador(
    double precision, double precision, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evidencias_avaliacao_no_ponto(
    double precision, double precision, double precision, double precision, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_avaliacao_preventiva(jsonb)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.historico_avaliacoes_preventivas(integer)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.criar_previa_notificacao_interna(uuid)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.evidencias_avaliacao_no_ponto(
    double precision, double precision, double precision, double precision, integer
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.evidencias_avaliacao_do_morador(
    double precision, double precision, integer
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.registrar_avaliacao_preventiva(jsonb)
    TO authenticated;

GRANT EXECUTE ON FUNCTION public.historico_avaliacoes_preventivas(integer)
    TO authenticated;

GRANT EXECUTE ON FUNCTION public.criar_previa_notificacao_interna(uuid)
    TO authenticated;

NOTIFY pgrst, 'reload schema';
