-- Experimental history consists of untrusted client declarations, never training labels or public alerts.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER TABLE public.execucoes_avaliacao
    ADD COLUMN IF NOT EXISTS natureza_registro TEXT NOT NULL DEFAULT 'declaracao_cliente',
    ADD COLUMN IF NOT EXISTS validado_servidor BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS hash_algoritmo TEXT NOT NULL DEFAULT 'cliente_sha256_nao_verificado';
ALTER TABLE public.execucoes_avaliacao
    ADD CONSTRAINT execucoes_sem_validacao_cientifica CHECK (validado_servidor IS FALSE),
    ADD CONSTRAINT execucoes_natureza_declaracao CHECK (natureza_registro = 'declaracao_cliente');
COMMENT ON TABLE public.execucoes_avaliacao IS 'Declarações pessoais do navegador. Não são resultados científicos validados, rótulos de treino ou autorização de envio.';
ALTER TABLE public.ocorrencias
    ADD COLUMN IF NOT EXISTS ocorrido_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS precisao_temporal TEXT NOT NULL DEFAULT 'desconhecida',
    ADD COLUMN IF NOT EXISTS fonte_temporal TEXT;
ALTER TABLE public.ocorrencias ADD CONSTRAINT ocorrencias_tempo_valido CHECK (
    precisao_temporal IN ('instante','dia','intervalo','desconhecida')
    AND (precisao_temporal = 'desconhecida' OR (ocorrido_em IS NOT NULL AND fonte_temporal IS NOT NULL))
);
COMMENT ON COLUMN public.ocorrencias.ocorrido_em IS 'Momento real relatado; nunca preenchido a partir de verificado_em ou criado_em. Legado permanece desconhecido.';
CREATE OR REPLACE FUNCTION public.registrar_avaliacao_preventiva(p_entrada JSONB)
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

    IF octet_length(p_entrada::text) > 131072 THEN
        RAISE EXCEPTION 'entrada_longa' USING ERRCODE = '22023';
    END IF;
    IF public.jsonb_contem_coordenadas(p_entrada) THEN
        RAISE EXCEPTION 'coordenadas_nao_permitidas' USING ERRCODE = '22023';
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

    -- Server digest attests stored content, not the scientific truth of a client calculation.
    p_entrada := jsonb_set(p_entrada, '{natureza_registro}', '"declaracao_cliente"'::jsonb);
    p_entrada := jsonb_set(p_entrada, '{validado_servidor}', 'false'::jsonb);
    v_hash := encode(extensions.digest((p_entrada - 'hash_entrada')::text, 'sha256'), 'hex');
    p_entrada := jsonb_set(p_entrada, '{hash_entrada}', to_jsonb(v_hash));
    INSERT INTO public.execucoes_avaliacao (
        hash_algoritmo,
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
        'sha256_jsonb_v1',
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
REVOKE ALL ON FUNCTION public.registrar_avaliacao_preventiva(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrar_avaliacao_preventiva(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
