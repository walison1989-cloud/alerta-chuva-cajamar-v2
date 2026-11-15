-- =====================================================================
-- Verificação pós-migrations da Etapa 2
--
-- Execute no SQL Editor DEPOIS das três migrations. O script é somente
-- leitura. "BLOQUEADOR" indica que a Etapa 2 não está pronta; "AVISO"
-- indica um ponto para revisar; "OK" confirma a configuração esperada.
--
-- Este script NÃO cobre a Etapa 3. Depois de aplicar também as migrations
-- 20261106090000_etapa3_schema_fontes.sql e
-- 20261106091000_etapa3_rls_postgis.sql, execute:
--   supabase/scripts/verify_etapa3.sql
-- =====================================================================

DROP TABLE IF EXISTS pg_temp._etapa2_verify;

CREATE TEMP TABLE _etapa2_verify (
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
    v_expected INTEGER;
    v_actual TEXT;
    v_schema TEXT;
BEGIN
    -- 1. Tabelas e RLS ------------------------------------------------
    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname IN (
           'usuarios', 'enderecos', 'versoes_endereco', 'contatos_alerta',
           'bairros', 'estacoes', 'medicoes_chuva', 'alertas'
       );

    INSERT INTO _etapa2_verify VALUES (
        1,
        CASE WHEN v_count = 8 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Oito tabelas do domínio',
        format('Encontradas %s de 8.', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
       AND c.relname IN (
           'usuarios', 'enderecos', 'versoes_endereco', 'contatos_alerta',
           'bairros', 'estacoes', 'medicoes_chuva', 'alertas'
       );

    INSERT INTO _etapa2_verify VALUES (
        2,
        CASE WHEN v_count = 8 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'RLS habilitada nas oito tabelas',
        format('Com RLS: %s de 8.', v_count)
    );

    -- 2. Políticas ----------------------------------------------------
    SELECT count(*) INTO v_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN (
           'usuarios_select_proprio',
           'usuarios_update_proprio',
           'enderecos_select_proprio',
           'enderecos_insert_proprio',
           'enderecos_update_proprio',
           'enderecos_delete_proprio',
           'versoes_select_proprio',
           'contatos_select_proprio'
       );

    INSERT INTO _etapa2_verify VALUES (
        3,
        CASE WHEN v_count = 8 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Oito políticas RLS esperadas',
        format('Encontradas %s de 8.', v_count)
    );

    FOR r IN
        SELECT * FROM (VALUES
            ('usuarios_select_proprio', 'usuarios', 'SELECT'),
            ('usuarios_update_proprio', 'usuarios', 'UPDATE'),
            ('enderecos_select_proprio', 'enderecos', 'SELECT'),
            ('enderecos_insert_proprio', 'enderecos', 'INSERT'),
            ('enderecos_update_proprio', 'enderecos', 'UPDATE'),
            ('enderecos_delete_proprio', 'enderecos', 'DELETE'),
            ('versoes_select_proprio', 'versoes_endereco', 'SELECT'),
            ('contatos_select_proprio', 'contatos_alerta', 'SELECT')
        ) AS v(policy_name, table_name, command)
    LOOP
        SELECT count(*) INTO v_count
          FROM pg_policies
         WHERE schemaname = 'public'
           AND policyname = r.policy_name
           AND tablename = r.table_name
           AND cmd = r.command;

        IF v_count <> 1 THEN
            INSERT INTO _etapa2_verify VALUES (
                4,
                'BLOQUEADOR',
                format('Política %s', r.policy_name),
                format('Esperada 1 em %s/%s; encontradas %s.', r.table_name, r.command, v_count)
            );
        END IF;
    END LOOP;

    -- 3. Triggers -----------------------------------------------------
    v_failures := 0;
    FOR r IN
        SELECT * FROM (VALUES
            ('public', 'enderecos', 'trg_enderecos_sync'),
            ('public', 'enderecos', 'trg_enderecos_versionar'),
            ('public', 'usuarios', 'trg_usuarios_proteger'),
            ('auth', 'users', 'on_auth_user_created'),
            ('auth', 'users', 'on_auth_user_email_updated')
        ) AS v(schema_name, table_name, trigger_name)
    LOOP
        SELECT count(*) INTO v_count
          FROM information_schema.triggers
         WHERE trigger_schema = r.schema_name
           AND event_object_table = r.table_name
           AND trigger_name = r.trigger_name;

        IF v_count = 0 THEN
            v_failures := v_failures + 1;
            INSERT INTO _etapa2_verify VALUES (
                5,
                'BLOQUEADOR',
                format('Trigger %s', r.trigger_name),
                format('Ausente em %s.%s.', r.schema_name, r.table_name)
            );
        END IF;
    END LOOP;

    IF v_failures = 0 THEN
        INSERT INTO _etapa2_verify VALUES (
            5,
            'OK',
            'Triggers de sincronização, histórico, proteção e Auth',
            'Os cinco triggers esperados foram encontrados.'
        );
    END IF;

    -- 4. Extensões e PostGIS -----------------------------------------
    SELECT extnamespace::regnamespace::text
      INTO v_schema
      FROM pg_extension
     WHERE extname = 'postgis';

    INSERT INTO _etapa2_verify VALUES (
        6,
        CASE
            WHEN v_schema = 'extensions' THEN 'OK'
            WHEN v_schema = 'public' THEN 'AVISO'
            ELSE 'BLOQUEADOR'
        END,
        'Extensão PostGIS instalada',
        COALESCE(format('Schema %s.', v_schema), 'Não instalada.')
    );

    SELECT count(*) INTO v_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND udt_schema = 'extensions'
       AND udt_name = 'geometry';

    INSERT INTO _etapa2_verify VALUES (
        7,
        CASE WHEN v_count >= 5 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Colunas GEOMETRY no schema public',
        format('%s colunas encontradas; esperado ao menos 5 (bairros, estacoes, contatos_alerta, enderecos, versoes_endereco).', v_count)
    );

    SELECT count(*) INTO v_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname IN ('spatial_ref_sys', 'geometry_columns', 'geography_columns');

    INSERT INTO _etapa2_verify VALUES (
        8,
        CASE WHEN v_count = 0 THEN 'OK' ELSE 'AVISO' END,
        'Metadados PostGIS fora de public',
        CASE WHEN v_count = 0
             THEN 'Nenhum objeto PostGIS exposto em public.'
             ELSE 'Há metadados PostGIS em public; revise exposição via PostgREST.'
        END
    );

    -- 5. Grants -------------------------------------------------------
    v_failures := 0;
    FOR r IN
        SELECT * FROM (VALUES
            ('anon', 'usuarios'),
            ('anon', 'enderecos'),
            ('anon', 'versoes_endereco'),
            ('anon', 'contatos_alerta'),
            ('anon', 'bairros'),
            ('anon', 'estacoes'),
            ('anon', 'medicoes_chuva'),
            ('anon', 'alertas')
        ) AS v(role_name, table_name)
    LOOP
        SELECT count(*) INTO v_count
          FROM information_schema.role_table_grants
         WHERE grantee = r.role_name
           AND table_schema = 'public'
           AND table_name = r.table_name;

        IF v_count <> 0 THEN
            v_failures := v_failures + 1;
            INSERT INTO _etapa2_verify VALUES (
                9,
                'BLOQUEADOR',
                format('Privilégios de anon em %s', r.table_name),
                format('%s grant(s) encontrados; esperado nenhum.', v_count)
            );
        END IF;
    END LOOP;

    IF v_failures = 0 THEN
        INSERT INTO _etapa2_verify VALUES (
            9,
            'OK',
            'anon sem privilégios nas tabelas do domínio',
            'Nenhum grant direto para anon.'
        );
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
            ('authenticated', 'usuarios', 'SELECT'),
            ('authenticated', 'usuarios', 'UPDATE'),
            ('authenticated', 'enderecos', 'SELECT'),
            ('authenticated', 'enderecos', 'INSERT'),
            ('authenticated', 'enderecos', 'UPDATE'),
            ('authenticated', 'enderecos', 'DELETE'),
            ('authenticated', 'versoes_endereco', 'SELECT'),
            ('authenticated', 'contatos_alerta', 'SELECT')
        ) AS v(role_name, table_name, privilege_type)
    LOOP
        IF NOT has_table_privilege(r.role_name, format('public.%I', r.table_name), r.privilege_type) THEN
            v_failures := v_failures + 1;
            INSERT INTO _etapa2_verify VALUES (
                10,
                'BLOQUEADOR',
                format('Grant %s em %s', r.privilege_type, r.table_name),
                format('Ausente para %s.', r.role_name)
            );
        END IF;
    END LOOP;

    IF v_failures = 0 THEN
        INSERT INTO _etapa2_verify VALUES (
            10,
            'OK',
            'authenticated com os grants esperados',
            'SELECT/INSERT/UPDATE/DELETE conforme a matriz da Etapa 2.'
        );
    END IF;

    INSERT INTO _etapa2_verify VALUES (
        11,
        CASE WHEN has_table_privilege('authenticated', 'public.bairros', 'SELECT')
                  OR has_table_privilege('authenticated', 'public.estacoes', 'SELECT')
                  OR has_table_privilege('authenticated', 'public.medicoes_chuva', 'SELECT')
                  OR has_table_privilege('authenticated', 'public.alertas', 'SELECT')
             THEN 'BLOQUEADOR' ELSE 'OK' END,
        'Tabelas legadas sem acesso de authenticated',
        'Esperado nenhum grant até a curadoria da Etapa 3.'
    );

    -- 6. Funções ------------------------------------------------------
    v_failures := 0;
    FOR r IN
        SELECT * FROM (VALUES
            ('sync_endereco_localizacao'),
            ('versionar_endereco'),
            ('proteger_campos_usuario'),
            ('handle_new_user'),
            ('sync_usuario_email')
        ) AS v(function_name)
    LOOP
        SELECT count(*) INTO v_count
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname = r.function_name
           AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

        IF v_count <> 0 THEN
            v_failures := v_failures + 1;
            INSERT INTO _etapa2_verify VALUES (
                12,
                'AVISO',
                format('EXECUTE de authenticated em %s()', r.function_name),
                'Função de trigger ainda executável como RPC; revise o REVOKE.'
            );
        END IF;
    END LOOP;

    IF v_failures = 0 THEN
        INSERT INTO _etapa2_verify VALUES (
            12,
            'OK',
            'Funções de trigger não expostas como RPC',
            'authenticated não possui EXECUTE direto.'
        );
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'versionar_endereco'
       AND p.prosecdef;

    INSERT INTO _etapa2_verify VALUES (
        13,
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'versionar_endereco é SECURITY DEFINER',
        'Necessário para gravar o histórico sem conceder INSERT ao morador.'
    );

    SELECT count(*) INTO v_count
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = 'handle_new_user'
       AND p.prosecdef;

    INSERT INTO _etapa2_verify VALUES (
        14,
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'handle_new_user é SECURITY DEFINER',
        'Necessário para inserir o perfil durante o signup.'
    );

    -- 7. Constraints --------------------------------------------------
    v_failures := 0;
    FOR r IN
        SELECT * FROM (VALUES
            ('usuarios_papel_valido'),
            ('usuarios_consentimento_coerente'),
            ('enderecos_cep_formato'),
            ('enderecos_uf_formato'),
            ('enderecos_latitude_valida'),
            ('enderecos_longitude_valida'),
            ('enderecos_precisao_valida'),
            ('enderecos_consentimento_obrigatorio'),
            ('enderecos_campos_obrigatorios'),
            ('versoes_operacao_valida')
        ) AS v(constraint_name)
    LOOP
        SELECT count(*) INTO v_count
          FROM pg_constraint
         WHERE conname = r.constraint_name;

        IF v_count = 0 THEN
            v_failures := v_failures + 1;
            INSERT INTO _etapa2_verify VALUES (
                15,
                'BLOQUEADOR',
                format('Constraint %s', r.constraint_name),
                'Ausente.'
            );
        END IF;
    END LOOP;

    IF v_failures = 0 THEN
        INSERT INTO _etapa2_verify VALUES (
            15,
            'OK',
            'Constraints de validação e LGPD',
            'As dez constraints esperadas foram encontradas.'
        );
    END IF;

    SELECT count(*) INTO v_count
      FROM pg_constraint
     WHERE conrelid = 'public.enderecos'::regclass
       AND contype = 'u'
       AND conname = 'enderecos_usuario_id_key';

    INSERT INTO _etapa2_verify VALUES (
        16,
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'BLOQUEADOR' END,
        'Um endereço por morador',
        'Esperada a UNIQUE(enderecos.usuario_id).'
    );

    -- 8. Histórico imutável ------------------------------------------
    INSERT INTO _etapa2_verify VALUES (
        17,
        CASE
            WHEN has_table_privilege('authenticated', 'public.versoes_endereco', 'INSERT')
              OR has_table_privilege('authenticated', 'public.versoes_endereco', 'UPDATE')
              OR has_table_privilege('authenticated', 'public.versoes_endereco', 'DELETE')
            THEN 'BLOQUEADOR' ELSE 'OK'
        END,
        'Histórico somente leitura para o morador',
        'Esperado SELECT; nenhum INSERT/UPDATE/DELETE direto.'
    );
END;
$$;

SELECT ordem, severidade, verificacao, detalhe
  FROM _etapa2_verify
 ORDER BY ordem, verificacao;

DROP TABLE pg_temp._etapa2_verify;
