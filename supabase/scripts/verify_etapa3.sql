-- =====================================================================
-- Verificação pós-migrations da Etapa 3
--
-- Execute no SQL Editor do Supabase DEPOIS de aplicar:
--   20261106090000_etapa3_schema_fontes.sql
--   20261106091000_etapa3_rls_postgis.sql
--
-- O script é somente leitura. "BLOQUEADOR" indica que a Etapa 3 não está
-- pronta para o frontend; "AVISO" pede revisão; "OK" confirma o esperado.
-- =====================================================================

DROP TABLE IF EXISTS pg_temp._etapa3_verify;

CREATE TEMP TABLE _etapa3_verify (
    ordem INTEGER,
    severidade TEXT NOT NULL,
    verificacao TEXT NOT NULL,
    detalhe TEXT NOT NULL
);

DO $$
DECLARE
    r RECORD;
    v_count INTEGER;
    v_failures INTEGER;
    v_value TEXT;
BEGIN
    -- 1. Colunas de proveniência --------------------------------------
    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'estacoes'
       AND column_name IN (
           'fonte', 'fonte_id', 'municipio', 'uf', 'tipo_estacao', 'rede',
           'status_fonte', 'ultima_coleta_em', 'validada', 'metadados'
       );

    INSERT INTO _etapa3_verify VALUES (
        1,
        CASE WHEN v_count = 10 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Colunas de proveniência em estacoes',
        format('Encontradas %s de 10 colunas esperadas.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'medicoes_chuva'
       AND column_name IN (
           'tipo_medicao', 'janela_horas', 'unidade', 'qualidade_dado',
           'coletado_em'
       );

    INSERT INTO _etapa3_verify VALUES (
        2,
        CASE WHEN v_count = 5 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Colunas de tipo e qualidade em medicoes_chuva',
        format('Encontradas %s de 5 colunas esperadas.', v_count)
    );

    -- 2. Tabelas, views e funções -------------------------------------
    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname IN ('coletas_fonte', 'ocorrencias');

    INSERT INTO _etapa3_verify VALUES (
        3,
        CASE WHEN v_count = 2 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Tabelas coletas_fonte e ocorrencias',
        format('Encontradas %s de 2 tabelas esperadas.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'v'
       AND c.relname IN (
           'vw_estacoes_publicas', 'vw_coletas_publicas',
           'vw_ocorrencias_publicas'
       );

    INSERT INTO _etapa3_verify VALUES (
        4,
        CASE WHEN v_count = 3 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Views públicas da Etapa 3',
        format('Encontradas %s de 3 views esperadas.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
           'estacoes_proximas', 'estacoes_proximas_do_morador',
           'distancia_morador_estacao', 'ultima_chuva_acumulada_24h',
           'soma_chuva_intervalo'
       );

    INSERT INTO _etapa3_verify VALUES (
        5,
        CASE WHEN v_count = 5 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Funções PostGIS e de leitura',
        format('Encontradas %s de 5 funções esperadas.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND NOT t.tgisinternal
       AND t.tgname IN (
           'trg_estacoes_sync_localizacao', 'trg_ocorrencias_sync_localizacao'
       );

    INSERT INTO _etapa3_verify VALUES (
        6,
        CASE WHEN v_count = 2 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Triggers de sincronização PostGIS',
        format('Encontrados %s de 2 triggers esperados.', v_count)
    );

    -- 3. RLS e políticas ----------------------------------------------
    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN (
           'estacoes', 'medicoes_chuva', 'coletas_fonte', 'ocorrencias'
       )
       AND c.relrowsecurity;

    INSERT INTO _etapa3_verify VALUES (
        7,
        CASE WHEN v_count = 4 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'RLS habilitada nas tabelas da Etapa 3',
        format('%s de 4 tabelas com RLS.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN (
           'estacoes_select_publicas', 'medicoes_select_publicas',
           'ocorrencias_select_publicas'
       );

    INSERT INTO _etapa3_verify VALUES (
        8,
        CASE WHEN v_count = 3 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Políticas públicas de leitura',
        format('Encontradas %s de 3 políticas esperadas.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'ux_estacoes_fonte_id';

    INSERT INTO _etapa3_verify VALUES (
        9,
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Índice único de estação por fonte',
        'Esperado ux_estacoes_fonte_id.'
    );

    -- 4. Grants e exposição mínima ------------------------------------
    INSERT INTO _etapa3_verify VALUES (
        10,
        CASE
            WHEN has_table_privilege('anon', 'public.vw_estacoes_publicas', 'SELECT')
            THEN 'OK' ELSE 'BLOQUEADOR'
        END,
        'Anônimo lê a view pública de estações',
        'Esperado GRANT SELECT em vw_estacoes_publicas.'
    );

    INSERT INTO _etapa3_verify VALUES (
        11,
        CASE
            WHEN has_table_privilege('anon', 'public.coletas_fonte', 'SELECT')
              OR has_table_privilege('anon', 'public.ocorrencias', 'SELECT')
            THEN 'BLOQUEADOR' ELSE 'OK'
        END,
        'Anônimo não lê tabelas de auditoria/curadoria diretamente',
        'Esperado acesso apenas por vw_coletas_publicas e vw_ocorrencias_publicas.'
    );

    INSERT INTO _etapa3_verify VALUES (
        12,
        CASE
            WHEN has_function_privilege(
                'anon',
                'public.estacoes_proximas(double precision,double precision,double precision,integer)',
                'EXECUTE'
            ) THEN 'OK' ELSE 'BLOQUEADOR'
        END,
        'Anônimo consulta estações próximas',
        'Esperado EXECUTE em estacoes_proximas.'
    );

    INSERT INTO _etapa3_verify VALUES (
        13,
        CASE
            WHEN has_function_privilege(
                'anon',
                'public.estacoes_proximas_do_morador(double precision,integer)',
                'EXECUTE'
            ) THEN 'BLOQUEADOR' ELSE 'OK'
        END,
        'Anônimo não consulta o imóvel de morador',
        'Esperado EXECUTE apenas para authenticated.'
    );

    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name IN (
           'vw_estacoes_publicas', 'vw_coletas_publicas',
           'vw_ocorrencias_publicas'
       )
       AND column_name IN (
           'usuario_id', 'verificado_por', 'erro_interno', 'localizacao'
       );

    INSERT INTO _etapa3_verify VALUES (
        14,
        CASE WHEN v_count = 0 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Views públicas sem PII ou geometria privada',
        format('Encontradas %s colunas sensíveis nas views públicas.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_class
     WHERE relname = 'vw_estacoes_publicas'
       AND reloptions @> ARRAY['security_invoker=true'];

    INSERT INTO _etapa3_verify VALUES (
        15,
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'AVISO' END,
        'vw_estacoes_publicas respeita a RLS',
        'Esperado security_invoker=true.'
    );

    SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'soma_chuva_intervalo'
       AND p.prosecdef;

    INSERT INTO _etapa3_verify VALUES (
        16,
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Soma de intervalo lê dados além da RLS de acumulado',
        'Esperado SECURITY DEFINER somente na função de soma, com validação de estação pública.'
    );

    -- 5. Integridade dos dados públicos -------------------------------
    SELECT count(*) INTO v_count
      FROM public.estacoes
     WHERE validada IS TRUE
       AND fonte IS NULL;

    INSERT INTO _etapa3_verify VALUES (
        17,
        CASE WHEN v_count = 0 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Nenhuma estação validada sem fonte',
        format('%s estação(ões) validada(s) sem proveniência.', v_count)
    );

    IF to_regclass('public.vw_estacoes_publicas') IS NOT NULL THEN
        EXECUTE $q$
            SELECT count(*)
              FROM public.vw_estacoes_publicas
             WHERE tem_leitura IS TRUE
               AND tipo_medicao IS DISTINCT FROM 'acumulado_24h'
        $q$ INTO v_count;

        INSERT INTO _etapa3_verify VALUES (
            18,
            CASE WHEN v_count = 0 THEN 'OK' ELSE 'BLOQUEADOR' END,
            'View pública não mistura acumulado com intervalo',
            format('%s leitura(s) de tipo divergente na view.', v_count)
        );

        EXECUTE $q$
            SELECT count(*)
              FROM public.vw_estacoes_publicas
             WHERE fonte IS NULL OR latitude IS NULL OR longitude IS NULL
        $q$ INTO v_count;

        INSERT INTO _etapa3_verify VALUES (
            19,
            CASE WHEN v_count = 0 THEN 'OK' ELSE 'BLOQUEADOR' END,
            'View pública sem estação sem fonte ou coordenada',
            format('%s linha(s) inválida(s) exposta(s).', v_count)
        );
    ELSE
        INSERT INTO _etapa3_verify VALUES (
            18, 'BLOQUEADOR', 'View pública de estações ausente',
            'Não foi possível verificar a separação de tipos.'
        );
        INSERT INTO _etapa3_verify VALUES (
            19, 'BLOQUEADOR', 'View pública de estações ausente',
            'Não foi possível verificar coordenadas públicas.'
        );
    END IF;

    -- 6. Funções executam sem erro ------------------------------------
    BEGIN
        EXECUTE $q$
            SELECT count(*)::text
              FROM public.estacoes_proximas(-23.3561111, -46.8769444, 30, 20)
        $q$ INTO v_value;

        INSERT INTO _etapa3_verify VALUES (
            20, 'OK', 'estacoes_proximas executa',
            format('Retornou %s estação(ões) no raio de 30 km.', v_value)
        );
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _etapa3_verify VALUES (
            20, 'BLOQUEADOR', 'estacoes_proximas executa',
            SQLERRM
        );
    END;

    BEGIN
        EXECUTE $q$
            SELECT count(*)::text
              FROM public.vw_coletas_publicas
        $q$ INTO v_value;

        INSERT INTO _etapa3_verify VALUES (
            21, 'OK', 'vw_coletas_publicas consultável',
            format('%s fonte(s) com status público.', v_value)
        );
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _etapa3_verify VALUES (
            21, 'AVISO', 'vw_coletas_publicas consultável',
            SQLERRM
        );
    END;

    SELECT count(*) INTO v_count
      FROM pg_constraint
     WHERE conname IN (
         'estacoes_uf_formato', 'estacoes_validada_exige_fonte',
         'medicoes_tipo_medicao_valido', 'medicoes_janela_valida',
         'medicoes_acumulado_exige_janela', 'medicoes_unidade_valida',
         'medicoes_qualidade_valida'
     );

    INSERT INTO _etapa3_verify VALUES (
        22,
        CASE WHEN v_count = 7 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Constraints de proveniência e tipo',
        format('Encontradas %s de 7 constraints esperadas.', v_count)
    );
END;
$$;

SELECT ordem, severidade, verificacao, detalhe
  FROM _etapa3_verify
 ORDER BY ordem;

DROP TABLE pg_temp._etapa3_verify;
