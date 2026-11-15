-- =====================================================================
-- Testes de RLS — Etapa 2
--
-- Execute com Supabase CLI + Docker:
--   supabase test db
--
-- Os testes rodam em uma transação e fazem rollback. Eles usam dois
-- usuários fictícios apenas para provar o isolamento; nenhum dado real é
-- gravado.
-- =====================================================================

BEGIN;

-- O Supabase instala extensões em "extensions".
SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(22);

-- Usuários de teste no Auth. A trigger handle_new_user cria os perfis.
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

-- Endereços iniciais dos dois moradores, criados como administrador.
INSERT INTO public.enderecos (
    usuario_id, cep, logradouro, numero, bairro, municipio, uf,
    latitude, longitude, precisao, consentimento_lgpd
) VALUES
    (
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
        '22222222-2222-4222-8222-222222222222',
        '07750100',
        'Rua Dois',
        '20',
        'Centro',
        'Cajamar',
        'SP',
        -23.3500000,
        -46.8700000,
        'geocodificado',
        TRUE
    );

-- ---------------------------------------------------------------------
-- Morador 1
-- ---------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

SELECT is(
    (SELECT count(*)::int FROM public.usuarios),
    1,
    'morador 1 vê apenas o próprio perfil'
);

SELECT is(
    (SELECT count(*)::int FROM public.enderecos),
    1,
    'morador 1 vê apenas o próprio endereço'
);

SELECT is(
    (SELECT count(*)::int FROM public.versoes_endereco),
    1,
    'morador 1 vê apenas a versão inicial do próprio endereço'
);

SELECT lives_ok(
    $$ UPDATE public.enderecos SET numero = '11' WHERE usuario_id = auth.uid() $$,
    'morador 1 atualiza o próprio endereço'
);

SELECT is(
    (SELECT count(*)::int FROM public.versoes_endereco),
    2,
    'a atualização gerou uma segunda versão'
);

-- A trigger grava POINT(longitude latitude): X é longitude e Y é latitude.
-- Trocar a ordem criaria um ponto no lugar errado sem erro de banco.
SELECT is(
    (
        SELECT round(ST_X(localizacao)::numeric, 6)
        FROM public.enderecos
        WHERE usuario_id = auth.uid()
    ),
    -46.876944::numeric,
    'localizacao guarda a longitude em ST_X'
);

SELECT is(
    (
        SELECT round(ST_Y(localizacao)::numeric, 6)
        FROM public.enderecos
        WHERE usuario_id = auth.uid()
    ),
    -23.356111::numeric,
    'localizacao guarda a latitude em ST_Y'
);

SELECT is(
    (
        SELECT ST_SRID(localizacao)::int
        FROM public.enderecos
        WHERE usuario_id = auth.uid()
    ),
    4326,
    'localizacao usa SRID 4326'
);

SELECT is(
    (
        SELECT
            round(ST_X(localizacao)::numeric, 6)::text
            || '/' || round(ST_Y(localizacao)::numeric, 6)::text
        FROM public.versoes_endereco
        WHERE usuario_id = auth.uid()
        ORDER BY id DESC
        LIMIT 1
    ),
    '-46.876944/-23.356111',
    'histórico registra a geometria atualizada na mesma ordem'
);

SELECT throws_ok(
    $$ UPDATE public.usuarios SET papel = 'admin' WHERE id = auth.uid() $$,
    '42501',
    NULL,
    'morador não pode elevar o próprio papel para admin'
);

SELECT throws_ok(
    $$ INSERT INTO public.enderecos (
        usuario_id, cep, logradouro, numero, bairro, municipio, uf,
        latitude, longitude, precisao, consentimento_lgpd
    ) VALUES (
        '22222222-2222-4222-8222-222222222222',
        '07750000', 'Rua Alheia', '30', 'Centro', 'Cajamar', 'SP',
        -23.3561111, -46.8769444, 'ajustado_manual', TRUE
    ) $$,
    '42501',
    NULL,
    'morador não pode inserir endereço para outro usuário'
);

SELECT is(
    (SELECT count(*)::int FROM public.enderecos
     WHERE usuario_id = '22222222-2222-4222-8222-222222222222'),
    0,
    'morador 1 não enxerga o endereço do morador 2'
);

-- PostgreSQL requires a data-modifying CTE on the top-level statement.
WITH alterado AS (
    UPDATE public.enderecos
    SET numero = '99'
    WHERE usuario_id = '22222222-2222-4222-8222-222222222222'
    RETURNING 1
)
SELECT is(
    (SELECT count(*)::int FROM alterado),
    0,
    'morador 1 não altera o endereço do morador 2'
);

WITH removido AS (
    DELETE FROM public.enderecos
    WHERE usuario_id = '22222222-2222-4222-8222-222222222222'
    RETURNING 1
)
SELECT is(
    (SELECT count(*)::int FROM removido),
    0,
    'morador 1 não remove o endereço do morador 2'
);

-- ---------------------------------------------------------------------
-- Morador 2
-- ---------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

SELECT is(
    (SELECT count(*)::int FROM public.usuarios),
    1,
    'morador 2 vê apenas o próprio perfil'
);

SELECT is(
    (SELECT count(*)::int FROM public.enderecos),
    1,
    'morador 2 vê apenas o próprio endereço'
);

SELECT is(
    (SELECT count(*)::int FROM public.versoes_endereco),
    1,
    'morador 2 vê apenas o próprio histórico'
);

SELECT is(
    (SELECT count(*)::int FROM public.enderecos
     WHERE usuario_id = '11111111-1111-4111-8111-111111111111'),
    0,
    'morador 2 não vê o endereço do morador 1'
);

SELECT is(
    (SELECT count(*)::int FROM public.versoes_endereco
     WHERE usuario_id = '11111111-1111-4111-8111-111111111111'),
    0,
    'morador 2 não vê o histórico do morador 1'
);

SELECT is(
    (SELECT count(*)::int FROM public.contatos_alerta),
    0,
    'morador 2 não vê contatos de alerta sem vínculo'
);

-- ---------------------------------------------------------------------
-- Anônimo
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;

SELECT throws_ok(
    $$ SELECT count(*) FROM public.enderecos $$,
    '42501',
    NULL,
    'anônimo não tem acesso direto à tabela de endereços'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.bairros $$,
    '42501',
    NULL,
    'anônimo não tem acesso direto às tabelas legadas'
);

-- finish() precisa rodar novamente como o dono da sessão de teste.
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
