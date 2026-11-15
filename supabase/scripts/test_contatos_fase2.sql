-- =====================================================================
-- TESTE SQL — Fase 2: Cadastro de Contatos do Morador
--
-- Valida a migration 20261107200000_etapa6_contatos_morador.sql em um
-- PostgreSQL com o schema Supabase (auth.uid/auth.role, auth.users) e
-- PostGIS. NÃO executa no banco hospedado.
--
-- Execute localmente com Supabase CLI:
--   supabase test db
-- ou, em um PostgreSQL local preparado:
--   psql -v ON_ERROR_STOP=1 -f supabase/scripts/test_contatos_fase2.sql
--
-- Regras do teste:
--   * UUIDs válidos;
--   * colunas reais da tabela legada (`id_contato`, sem `id`/`updated_at`);
--   * simulação de papel com SET LOCAL ROLE authenticated + JWT;
--   * toda proteção é verificada por SQLSTATE específico, não por
--     "qualquer erro" nem por NOTICE de sucesso auto-declarado.
--
-- O script roda em uma transação e termina com ROLLBACK: nenhum dado de
-- teste é persistido.
-- =====================================================================

BEGIN;

SET search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 0. FIXTURES (executadas como administrador, antes do SET ROLE)
-- ---------------------------------------------------------------------

-- Usuários fictícios. Se o Supabase estiver presente, a trigger
-- handle_new_user cria os perfis; o INSERT abaixo garante o perfil mesmo
-- em um banco onde apenas as migrations de schema foram aplicadas.
INSERT INTO auth.users (
    id,
    email,
    raw_user_meta_data,
    aud,
    role,
    email_confirmed_at
)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        'morador1@example.test',
        '{"nome":"Morador Um","consentimento_lgpd":true}'::jsonb,
        'authenticated',
        'authenticated',
        now()
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'morador2@example.test',
        '{"nome":"Morador Dois","consentimento_lgpd":true}'::jsonb,
        'authenticated',
        'authenticated',
        now()
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.usuarios (
    id, email, nome, papel, consentimento_lgpd, consentimento_em
)
VALUES
    (
        '11111111-1111-4111-8111-111111111111',
        'morador1@example.test',
        'Morador Um',
        'morador',
        TRUE,
        now()
    ),
    (
        '22222222-2222-4222-8222-222222222222',
        'morador2@example.test',
        'Morador Dois',
        'morador',
        TRUE,
        now()
    )
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    nome = EXCLUDED.nome,
    consentimento_lgpd = TRUE,
    consentimento_em = now();

-- Endereços com UUIDs fixos, um por morador.
DELETE FROM public.contatos_alerta
WHERE usuario_id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
);

DELETE FROM public.enderecos
WHERE usuario_id IN (
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222'
);

INSERT INTO public.enderecos (
    id,
    usuario_id,
    cep,
    logradouro,
    numero,
    bairro,
    municipio,
    uf,
    latitude,
    longitude,
    precisao,
    consentimento_lgpd
)
VALUES
    (
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        '11111111-1111-4111-8111-111111111111',
        '07750000',
        'Rua de Teste',
        '10',
        'Centro',
        'Cajamar',
        'SP',
        -23.3561111,
        -46.8769444,
        'ajustado_manual',
        TRUE
    ),
    (
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        '22222222-2222-4222-8222-222222222222',
        '07750100',
        'Rua Dois',
        '20',
        'Centro',
        'Cajamar',
        'SP',
        -23.3500000,
        -46.8700000,
        'ajustado_manual',
        TRUE
    );

-- ---------------------------------------------------------------------
-- 1. MORADOR 1 — INSERT VÁLIDO E PROTEÇÕES DE INSERT
-- ---------------------------------------------------------------------

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- 1.1 Insert válido com endereço do próprio usuário.
INSERT INTO public.contatos_alerta (
    usuario_id, endereco_id, nome, tipo_contato, telefone, email,
    ativo, consentimento, versao_consentimento,
    canal_interno, canal_email, canal_sms
) VALUES (
    '11111111-1111-4111-8111-111111111111',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'João Silva',
    'celular',
    '11999999999',
    NULL,
    TRUE,
    TRUE,
    '1.0',
    TRUE,
    FALSE,
    FALSE
);

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*)::int INTO v_count
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'FALHA: insert válido não criou exatamente 1 contato (encontrado %).',
            v_count;
    END IF;
END;
$$;

-- 1.2 Cliente não pode definir verificado_em no INSERT (42501).
DO $$
BEGIN
    BEGIN
        INSERT INTO public.contatos_alerta (
            usuario_id, nome, tipo_contato, telefone, email,
            ativo, consentimento, versao_consentimento,
            canal_interno, canal_email, canal_sms, verificado_em
        ) VALUES (
            '11111111-1111-4111-8111-111111111111',
            'Contato Verificado',
            'celular',
            '11977776666',
            NULL,
            TRUE,
            TRUE,
            '1.0',
            TRUE,
            FALSE,
            FALSE,
            now()
        );
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: verificado_em no INSERT gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF EXISTS (
        SELECT 1 FROM public.contatos_alerta
        WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
          AND telefone = '11977776666'
    ) THEN
        RAISE EXCEPTION
            'FALHA: INSERT com verificado_em foi aceito.';
    END IF;
END;
$$;

-- 1.3 Cliente não pode definir revogado_em no INSERT (42501).
DO $$
BEGIN
    BEGIN
        INSERT INTO public.contatos_alerta (
            usuario_id, nome, tipo_contato, telefone, email,
            ativo, consentimento, versao_consentimento,
            canal_interno, canal_email, canal_sms, revogado_em
        ) VALUES (
            '11111111-1111-4111-8111-111111111111',
            'Contato Revogado',
            'celular',
            '11966665555',
            NULL,
            TRUE,
            FALSE,
            '1.0',
            FALSE,
            FALSE,
            FALSE,
            now()
        );
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: revogado_em no INSERT gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF EXISTS (
        SELECT 1 FROM public.contatos_alerta
        WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
          AND telefone = '11966665555'
    ) THEN
        RAISE EXCEPTION
            'FALHA: INSERT com revogado_em foi aceito.';
    END IF;
END;
$$;

-- 1.4 Endereço de outro usuário deve ser bloqueado (42501).
DO $$
BEGIN
    BEGIN
        INSERT INTO public.contatos_alerta (
            usuario_id, endereco_id, nome, tipo_contato, telefone, email,
            ativo, consentimento, versao_consentimento,
            canal_interno, canal_email, canal_sms
        ) VALUES (
            '11111111-1111-4111-8111-111111111111',
            'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            'Contato Endereço Alheio',
            'celular',
            '11955554444',
            NULL,
            TRUE,
            TRUE,
            '1.0',
            TRUE,
            FALSE,
            FALSE
        );
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: endereço de outro usuário gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF EXISTS (
        SELECT 1 FROM public.contatos_alerta
        WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
          AND telefone = '11955554444'
    ) THEN
        RAISE EXCEPTION
            'FALHA: INSERT com endereço de outro usuário foi aceito.';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 2. MORADOR 2 — ISOLAMENTO POR RLS
-- ---------------------------------------------------------------------

SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- 2.1 Não vê contatos do morador 1.
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT count(*)::int INTO v_count
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111';

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'FALHA: morador 2 viu % contato(s) do morador 1.',
            v_count;
    END IF;
END;
$$;

-- 2.2 Não atualiza contato do morador 1 (0 linhas afetadas).
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE public.contatos_alerta
    SET nome = 'Invadido'
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'FALHA: morador 2 atualizou % contato(s) do morador 1.',
            v_count;
    END IF;
END;
$$;

-- 2.3 Não exclui contato do morador 1 (0 linhas afetadas).
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count <> 0 THEN
        RAISE EXCEPTION
            'FALHA: morador 2 excluiu % contato(s) do morador 1.',
            v_count;
    END IF;
END;
$$;

-- 2.4 Não insere contato em nome do morador 1 (42501).
DO $$
BEGIN
    BEGIN
        INSERT INTO public.contatos_alerta (
            usuario_id, nome, tipo_contato, telefone, email,
            ativo, consentimento, versao_consentimento,
            canal_interno, canal_email, canal_sms
        ) VALUES (
            '11111111-1111-4111-8111-111111111111',
            'Contato Forjado',
            'celular',
            '11944443333',
            NULL,
            TRUE,
            TRUE,
            '1.0',
            TRUE,
            FALSE,
            FALSE
        );
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501 (RLS WITH CHECK)
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: insert em nome de outro usuário gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF EXISTS (
        SELECT 1 FROM public.contatos_alerta
        WHERE telefone = '11944443333'
    ) THEN
        RAISE EXCEPTION
            'FALHA: insert em nome de outro usuário foi aceito.';
    END IF;
END;
$$;

-- 2.5 Não vincula o endereço do morador 1 ao próprio contato (42501).
DO $$
BEGIN
    BEGIN
        INSERT INTO public.contatos_alerta (
            usuario_id, endereco_id, nome, tipo_contato, telefone, email,
            ativo, consentimento, versao_consentimento,
            canal_interno, canal_email, canal_sms
        ) VALUES (
            '22222222-2222-4222-8222-222222222222',
            'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'Contato Endereço Alheio 2',
            'celular',
            '11933332222',
            NULL,
            TRUE,
            TRUE,
            '1.0',
            TRUE,
            FALSE,
            FALSE
        );
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: vínculo com endereço alheio gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF EXISTS (
        SELECT 1 FROM public.contatos_alerta
        WHERE telefone = '11933332222'
    ) THEN
        RAISE EXCEPTION
            'FALHA: vínculo com endereço alheio foi aceito.';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 3. MORADOR 1 — PROTEÇÕES DE UPDATE E CONSTRAINTS
-- ---------------------------------------------------------------------

SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- 3.1 Não altera verificado_em (42501).
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET verificado_em = now()
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: verificado_em no UPDATE gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF (SELECT verificado_em FROM public.contatos_alerta WHERE id_contato = v_id) IS NOT NULL THEN
        RAISE EXCEPTION
            'FALHA: verificado_em foi alterado pelo cliente.';
    END IF;
END;
$$;

-- 3.2 Não altera revogado_em (42501).
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET revogado_em = now()
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: revogado_em no UPDATE gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF (SELECT revogado_em FROM public.contatos_alerta WHERE id_contato = v_id) IS NOT NULL THEN
        RAISE EXCEPTION
            'FALHA: revogado_em foi definido pelo cliente.';
    END IF;
END;
$$;

-- 3.3 Não altera usuario_id (42501).
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET usuario_id = '22222222-2222-4222-8222-222222222222'
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: usuario_id no UPDATE gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF (SELECT usuario_id FROM public.contatos_alerta WHERE id_contato = v_id)
       <> '11111111-1111-4111-8111-111111111111'::uuid THEN
        RAISE EXCEPTION
            'FALHA: usuario_id foi alterado pelo cliente.';
    END IF;
END;
$$;

-- 3.4 Não altera data_cadastro (42501).
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET data_cadastro = now() + interval '1 day'
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: SQLSTATE 42501
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: data_cadastro no UPDATE gerou SQLSTATE % (%), esperava 42501.',
                SQLSTATE, SQLERRM;
    END;
END;
$$;

-- 3.5 Não altera id_contato.
-- O PostgreSQL já bloqueia UPDATE em coluna GENERATED ALWAYS AS IDENTITY
-- com SQLSTATE 428C9 antes da trigger. A trigger mantém a checagem como
-- defesa em profundidade caso o tipo da coluna mude no futuro.
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET id_contato = v_id + 100000
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN SQLSTATE '428C9' THEN
            NULL; -- esperado: coluna identity só aceita DEFAULT
        WHEN insufficient_privilege THEN
            NULL; -- defesa em profundidade da trigger
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: id_contato no UPDATE gerou SQLSTATE % (%), esperava 428C9 ou 42501.',
                SQLSTATE, SQLERRM;
    END;

    IF (SELECT id_contato FROM public.contatos_alerta WHERE id_contato = v_id)
       IS DISTINCT FROM v_id THEN
        RAISE EXCEPTION
            'FALHA: id_contato foi alterado pelo cliente.';
    END IF;
END;
$$;

-- 3.6 Canal externo sem verificação deve falhar (23514).
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET canal_email = TRUE
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN check_violation THEN
            NULL; -- esperado: SQLSTATE 23514
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: canal_email sem verificação gerou SQLSTATE % (%), esperava 23514.',
                SQLSTATE, SQLERRM;
    END;

    IF (SELECT canal_email FROM public.contatos_alerta WHERE id_contato = v_id) THEN
        RAISE EXCEPTION
            'FALHA: canal_email foi ativado sem verificação.';
    END IF;
END;
$$;

-- 3.7 Consentimento falso com canal ativo deve falhar (23514).
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET consentimento = FALSE
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN check_violation THEN
            NULL; -- esperado: SQLSTATE 23514
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: consentimento falso com canal ativo gerou SQLSTATE % (%), esperava 23514.',
                SQLSTATE, SQLERRM;
    END;
END;
$$;

-- 3.8 Consentimento ativo sem versão deve falhar.
-- Duas camadas protegem o mesmo invariante: a política RLS WITH CHECK
-- (42501) e a constraint contatos_consentimento_coerente (23514). Ambas
-- são específicas; qualquer outro SQLSTATE é falha do teste.
DO $$
DECLARE
    v_id BIGINT;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    BEGIN
        UPDATE public.contatos_alerta
        SET versao_consentimento = NULL
        WHERE id_contato = v_id;
    EXCEPTION
        WHEN insufficient_privilege THEN
            NULL; -- esperado: RLS WITH CHECK (42501)
        WHEN check_violation THEN
            NULL; -- esperado: constraint (23514)
        WHEN OTHERS THEN
            RAISE EXCEPTION
                'FALHA: consentimento sem versão gerou SQLSTATE % (%), esperava 42501 ou 23514.',
                SQLSTATE, SQLERRM;
    END;

    IF (SELECT versao_consentimento FROM public.contatos_alerta WHERE id_contato = v_id)
       IS NULL THEN
        RAISE EXCEPTION
            'FALHA: versão do consentimento foi removida pelo cliente.';
    END IF;
END;
$$;

-- 3.9 Revogação válida preenche revogado_em automaticamente.
DO $$
DECLARE
    v_id BIGINT;
    v_revogado_em TIMESTAMPTZ;
    v_consentimento BOOLEAN;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    UPDATE public.contatos_alerta
    SET consentimento = FALSE,
        canal_interno = FALSE,
        canal_email = FALSE,
        canal_sms = FALSE
    WHERE id_contato = v_id;

    SELECT revogado_em, consentimento
    INTO v_revogado_em, v_consentimento
    FROM public.contatos_alerta
    WHERE id_contato = v_id;

    IF v_consentimento IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION
            'FALHA: consentimento não foi revogado.';
    END IF;

    IF v_revogado_em IS NULL THEN
        RAISE EXCEPTION
            'FALHA: revogado_em não foi preenchido na revogação.';
    END IF;
END;
$$;

-- 3.10 Reativação válida limpa revogado_em.
DO $$
DECLARE
    v_id BIGINT;
    v_revogado_em TIMESTAMPTZ;
    v_consentimento BOOLEAN;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    UPDATE public.contatos_alerta
    SET consentimento = TRUE,
        versao_consentimento = '1.0'
    WHERE id_contato = v_id;

    SELECT revogado_em, consentimento
    INTO v_revogado_em, v_consentimento
    FROM public.contatos_alerta
    WHERE id_contato = v_id;

    IF v_consentimento IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION
            'FALHA: consentimento não foi reativado.';
    END IF;

    IF v_revogado_em IS NOT NULL THEN
        RAISE EXCEPTION
            'FALHA: revogado_em não foi limpo na reativação.';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. COMPATIBILIDADE COM REGISTRO LEGADO
-- ---------------------------------------------------------------------

-- Registro no formato antigo: sem tipo_contato, sem endereço, sem canais.
INSERT INTO public.contatos_alerta (
    usuario_id, nome, telefone, ativo, consentimento
) VALUES (
    '11111111-1111-4111-8111-111111111111',
    'Contato Legado Antigo',
    '11922221111',
    TRUE,
    FALSE
);

DO $$
DECLARE
    v_tipo VARCHAR(20);
    v_canal_interno BOOLEAN;
    v_canal_email BOOLEAN;
    v_canal_sms BOOLEAN;
BEGIN
    SELECT tipo_contato, canal_interno, canal_email, canal_sms
    INTO v_tipo, v_canal_interno, v_canal_email, v_canal_sms
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11922221111';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FALHA: registro legado não foi aceito.';
    END IF;

    IF v_tipo IS NOT NULL THEN
        RAISE EXCEPTION 'FALHA: registro legado recebeu tipo_contato inesperado (%).', v_tipo;
    END IF;

    IF v_canal_interno OR v_canal_email OR v_canal_sms THEN
        RAISE EXCEPTION 'FALHA: registro legado recebeu canais ativos.';
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 5. EXCLUSÃO DO PRÓPRIO CONTATO
-- ---------------------------------------------------------------------

DO $$
DECLARE
    v_id BIGINT;
    v_count INTEGER;
BEGIN
    SELECT id_contato INTO STRICT v_id
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11922221111';

    DELETE FROM public.contatos_alerta WHERE id_contato = v_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count <> 1 THEN
        RAISE EXCEPTION
            'FALHA: exclusão do próprio contato afetou % linha(s), esperava 1.',
            v_count;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 6. SERVIÇO CONFIÁVEL PODE VERIFICAR O CONTATO
-- ---------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';

UPDATE public.contatos_alerta
SET verificado_em = now()
WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
  AND telefone = '11999999999';

DO $$
DECLARE
    v_verificado_em TIMESTAMPTZ;
BEGIN
    SELECT verificado_em INTO v_verificado_em
    FROM public.contatos_alerta
    WHERE usuario_id = '11111111-1111-4111-8111-111111111111'
      AND telefone = '11999999999';

    IF v_verificado_em IS NULL THEN
        RAISE EXCEPTION
            'FALHA: service_role não conseguiu verificar o contato.';
    END IF;
END;
$$;

RESET ROLE;

-- ---------------------------------------------------------------------
-- 7. FIM — rollback de todos os dados de teste
-- ---------------------------------------------------------------------

SELECT 'TODOS OS TESTES DE CONTATOS PASSARAM' AS resultado;

ROLLBACK;
