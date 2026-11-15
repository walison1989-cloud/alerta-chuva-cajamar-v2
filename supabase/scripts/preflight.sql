-- =====================================================================
-- Pré-voo da Etapa 2 no Supabase
--
-- Execute no SQL Editor ANTES das migrations. O script é somente leitura:
-- ele não cria, altera ou apaga dados de negócio. O resultado aponta
-- bloqueadores (schema acadêmico incompatível) e avisos (estado a revisar).
-- =====================================================================

DROP TABLE IF EXISTS pg_temp._etapa2_preflight;

CREATE TEMP TABLE _etapa2_preflight (
    ordem INTEGER,
    severidade TEXT NOT NULL,
    verificacao TEXT NOT NULL,
    detalhe TEXT NOT NULL
);

DO $$
DECLARE
    r RECORD;
    v_type TEXT;
    v_schema TEXT;
    v_found BOOLEAN;
BEGIN
    -- 1. Pré-requisitos do Supabase -------------------------------------
    INSERT INTO _etapa2_preflight VALUES (
        1,
        CASE WHEN to_regclass('auth.users') IS NULL THEN 'BLOQUEADOR' ELSE 'OK' END,
        'Schema auth.users do Supabase',
        CASE WHEN to_regclass('auth.users') IS NULL
             THEN 'Não encontrado. Use um projeto Supabase, não um PostgreSQL vazio.'
             ELSE 'Encontrado.'
        END
    );

    FOR r IN
        SELECT nome FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS v(nome)
    LOOP
        INSERT INTO _etapa2_preflight VALUES (
            2,
            CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.nome)
                 THEN 'OK' ELSE 'BLOQUEADOR' END,
            format('Role %s', r.nome),
            CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.nome)
                 THEN 'Existe.' ELSE 'Role ausente; este não parece ser um banco Supabase.'
            END
        );
    END LOOP;

    FOR r IN
        SELECT nome FROM (VALUES ('postgis'), ('pgcrypto')) AS v(nome)
    LOOP
        INSERT INTO _etapa2_preflight VALUES (
            3,
            CASE WHEN EXISTS (
                SELECT 1 FROM pg_available_extensions WHERE name = r.nome
            ) THEN 'OK' ELSE 'BLOQUEADOR' END,
            format('Extensão %s disponível', r.nome),
            COALESCE((
                SELECT format('default_version=%s, installed_version=%s',
                              default_version, COALESCE(installed_version, 'não instalada'))
                FROM pg_available_extensions
                WHERE name = r.nome
            ), 'Não disponível neste servidor.')
        );
    END LOOP;

    INSERT INTO _etapa2_preflight VALUES (
        4,
        CASE WHEN EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgtap')
             THEN 'OK' ELSE 'AVISO' END,
        'Extensão pgtap disponível para os testes SQL',
        CASE WHEN EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgtap')
             THEN 'Disponível.'
             ELSE 'Ausente. Os testes pgTAP não poderão rodar com "supabase test db".'
        END
    );

    -- 2. PostGIS: schema public x extensions ----------------------------
    SELECT extnamespace::regnamespace::text
      INTO v_schema
      FROM pg_extension
     WHERE extname = 'postgis';

    INSERT INTO _etapa2_preflight VALUES (
        5,
        CASE
            WHEN v_schema IS NULL THEN 'AVISO'
            WHEN v_schema = 'public' THEN 'AVISO'
            ELSE 'OK'
        END,
        'Schema da extensão PostGIS',
        CASE
            WHEN v_schema IS NULL THEN 'PostGIS ainda não instalado; as migrations instalam em extensions.'
            WHEN v_schema = 'public' THEN
                'PostGIS está em public. As migrations não movem a extensão; revise se spatial_ref_sys/geometry_columns estão expostos pelo PostgREST.'
            ELSE format('PostGIS está em %s.', v_schema)
        END
    );

    -- 3. Tabelas e colunas-chave do schema acadêmico -------------------
    FOR r IN
        SELECT * FROM (VALUES
            ('bairros', 'id_bairro', 'int4'),
            ('bairros', 'nome_bairro', 'varchar'),
            ('bairros', 'municipio', 'varchar'),
            ('bairros', 'geometria', 'geometry'),
            ('estacoes', 'id_estacao', 'int4'),
            ('estacoes', 'id_bairro', 'int4'),
            ('estacoes', 'latitude', 'float8'),
            ('estacoes', 'longitude', 'float8'),
            ('estacoes', 'localizacao', 'geometry'),
            ('medicoes_chuva', 'id_medicao', 'int8'),
            ('medicoes_chuva', 'id_estacao', 'int4'),
            ('medicoes_chuva', 'precipitacao_mm', 'numeric'),
            ('alertas', 'id_alerta', 'int4'),
            ('alertas', 'id_bairro', 'int4'),
            ('contatos_alerta', 'id_contato', 'int4'),
            ('contatos_alerta', 'id_bairro', 'int4'),
            ('contatos_alerta', 'endereco', 'varchar'),
            ('contatos_alerta', 'numero', 'varchar'),
            ('contatos_alerta', 'cep', 'varchar'),
            ('contatos_alerta', 'latitude', 'float8'),
            ('contatos_alerta', 'longitude', 'float8'),
            ('contatos_alerta', 'localizacao', 'geometry'),
            ('contatos_alerta', 'bairro_detectado', 'varchar')
        ) AS v(tabela, coluna, tipo_esperado)
    LOOP
        CONTINUE WHEN to_regclass(format('public.%I', r.tabela)) IS NULL;

        SELECT c.udt_name
          INTO v_type
          FROM information_schema.columns AS c
         WHERE c.table_schema = 'public'
           AND c.table_name = r.tabela
           AND c.column_name = r.coluna;

        IF NOT FOUND THEN
            INSERT INTO _etapa2_preflight VALUES (
                6,
                CASE WHEN r.coluna IN ('id_bairro', 'id_estacao', 'id_contato', 'id_alerta', 'id_medicao')
                     THEN 'BLOQUEADOR' ELSE 'AVISO' END,
                format('%s.%s', r.tabela, r.coluna),
                format('Coluna ausente; esperado %s.', r.tipo_esperado)
            );
        ELSIF v_type <> r.tipo_esperado THEN
            INSERT INTO _etapa2_preflight VALUES (
                6,
                'BLOQUEADOR',
                format('%s.%s', r.tabela, r.coluna),
                format('Tipo %s; esperado %s. A baseline não altera colunas existentes.', v_type, r.tipo_esperado)
            );
        END IF;
    END LOOP;

    -- 4. Vínculo legado opcional ---------------------------------------
    SELECT udt_name
      INTO v_type
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'contatos_alerta'
       AND column_name = 'usuario_id';

    IF FOUND AND v_type <> 'uuid' THEN
        INSERT INTO _etapa2_preflight VALUES (
            7,
            'BLOQUEADOR',
            'contatos_alerta.usuario_id',
            format('Tipo %s; a Etapa 2 espera uuid com FK para public.usuarios.', v_type)
        );
    ELSE
        INSERT INTO _etapa2_preflight VALUES (
            7,
            'OK',
            'contatos_alerta.usuario_id',
            CASE WHEN FOUND
                 THEN 'Já existe como uuid; a migration só garante o índice.'
                 ELSE 'Ainda não existe; a migration adiciona uuid + FK.'
            END
        );
    END IF;

    -- 5. Tabelas da Etapa 2 já existentes ------------------------------
    FOR r IN
        SELECT * FROM (VALUES
            ('usuarios', 'id', 'uuid'),
            ('enderecos', 'id', 'uuid'),
            ('enderecos', 'usuario_id', 'uuid'),
            ('enderecos', 'consentimento_lgpd', 'bool'),
            ('versoes_endereco', 'endereco_id', 'uuid'),
            ('versoes_endereco', 'usuario_id', 'uuid')
        ) AS v(tabela, coluna, tipo_esperado)
    LOOP
        CONTINUE WHEN to_regclass(format('public.%I', r.tabela)) IS NULL;

        SELECT c.udt_name
          INTO v_type
          FROM information_schema.columns AS c
         WHERE c.table_schema = 'public'
           AND c.table_name = r.tabela
           AND c.column_name = r.coluna;

        IF NOT FOUND OR v_type <> r.tipo_esperado THEN
            INSERT INTO _etapa2_preflight VALUES (
                8,
                'BLOQUEADOR',
                format('%s.%s', r.tabela, r.coluna),
                format('Estado %s; esperado %s. Revise a aplicação parcial anterior antes de reaplicar.',
                       COALESCE(v_type, 'ausente'), r.tipo_esperado)
            );
        END IF;
    END LOOP;

    -- 6. Triggers existentes -------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'auth.users'::regclass
           AND tgname = 'on_auth_user_created'
           AND NOT tgisinternal
    ) INTO v_found;

    INSERT INTO _etapa2_preflight VALUES (
        9,
        CASE WHEN v_found THEN 'AVISO' ELSE 'OK' END,
        'Trigger on_auth_user_created em auth.users',
        CASE WHEN v_found
             THEN 'Já existe. A migration substitui função e trigger com DROP/CREATE.'
             ELSE 'Não existe; será criado.'
        END
    );
END;
$$;

SELECT ordem, severidade, verificacao, detalhe
  FROM _etapa2_preflight
 ORDER BY ordem, verificacao;

DROP TABLE pg_temp._etapa2_preflight;
