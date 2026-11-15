-- Local audit proposal. Apply only after isolated PostgreSQL/pgTAP validation.
-- No remote operation is performed by preparing this migration.
CREATE OR REPLACE FUNCTION public.jsonb_contem_coordenadas(p_value JSONB)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE v_key TEXT; v_child JSONB;
BEGIN
    IF jsonb_typeof(p_value) = 'object' THEN
        FOR v_key, v_child IN SELECT key, value FROM jsonb_each(p_value) LOOP
            IF lower(v_key) IN ('latitude', 'longitude', 'localizacao', 'coordinates', 'lat', 'lon', 'lng')
               OR public.jsonb_contem_coordenadas(v_child) THEN
                RETURN TRUE;
            END IF;
        END LOOP;
    ELSIF jsonb_typeof(p_value) = 'array' THEN
        FOR v_child IN SELECT value FROM jsonb_array_elements(p_value) LOOP
            IF public.jsonb_contem_coordenadas(v_child) THEN RETURN TRUE; END IF;
        END LOOP;
    END IF;
    RETURN FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.jsonb_contem_coordenadas(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.proteger_contato_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.role() = 'service_role'
       OR current_user IN ('postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF NEW.verificado_em IS DISTINCT FROM OLD.verificado_em THEN
        RAISE EXCEPTION
            'O campo verificado_em não pode ser alterado pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.revogado_em IS DISTINCT FROM OLD.revogado_em THEN
        RAISE EXCEPTION
            'O campo revogado_em não pode ser definido pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
        RAISE EXCEPTION
            'O campo usuario_id não pode ser alterado.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.id_contato IS DISTINCT FROM OLD.id_contato THEN
        RAISE EXCEPTION
            'O campo id_contato não pode ser alterado.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.data_cadastro IS DISTINCT FROM OLD.data_cadastro THEN
        RAISE EXCEPTION
            'O campo data_cadastro não pode ser alterado.'
            USING ERRCODE = '42501';
    END IF;

    -- Verification is tied to the destination, not the row identity.
    IF NEW.telefone IS DISTINCT FROM OLD.telefone
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.tipo_contato IS DISTINCT FROM OLD.tipo_contato THEN
        NEW.verificado_em := NULL;
        NEW.canal_email := FALSE;
        NEW.canal_sms := FALSE;
    END IF;

    -- Auditoria derivada da transição de consentimento, nunca aceita do
    -- cliente. O cliente não pode forjar revogado_em (checado acima).
    IF NEW.consentimento = TRUE AND OLD.consentimento IS NOT TRUE THEN
        NEW.revogado_em := NULL;
    ELSIF NEW.consentimento IS NOT TRUE AND OLD.consentimento = TRUE THEN
        NEW.revogado_em := now();
    END IF;

    RETURN NEW;
END;
$$;
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
NOTIFY pgrst, 'reload schema';
