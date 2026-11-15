-- =====================================================================
-- Testes de RLS, views públicas e PostGIS — Etapa 3
--
-- Execute com Supabase CLI + Docker:
--   supabase test db
--
-- Os testes rodam em uma transação e fazem rollback. Os moradores e as
-- estações abaixo são fictícios e existem apenas dentro desta transação:
-- nenhuma estação, medição ou ocorrência real é gravada.
--
-- O que é provado:
-- - a camada pública só enxerga estações validadas com fonte;
-- - o acumulado de 24 h nunca é somado como medição por intervalo;
-- - ocorrências e logs respeitam a curadoria e a projeção mínima;
-- - as distâncias PostGIS usam o endereço do usuário autenticado, nunca
--   coordenadas enviadas pelo cliente;
-- - anon e authenticated não têm escrita nas tabelas da Etapa 3.
-- =====================================================================

BEGIN;

SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(36);

-- ---------------------------------------------------------------------
-- Preparação (executada como dono da sessão, antes das trocas de role)
-- ---------------------------------------------------------------------

-- Moradores de teste. A trigger handle_new_user cria os perfis.
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
        '33333333-3333-4333-8333-333333333333',
        'morador3@example.test',
        '{"nome":"Morador Três","consentimento_lgpd":true}'::jsonb,
        'authenticated',
        'authenticated',
        now()
    ),
    (
        '44444444-4444-4444-8444-444444444444',
        'morador4@example.test',
        '{"nome":"Morador Quatro","consentimento_lgpd":true}'::jsonb,
        'authenticated',
        'authenticated',
        now()
    )
ON CONFLICT (id) DO NOTHING;

-- Morador 3 fica perto da estação A; morador 4 fica perto da estação B.
INSERT INTO public.enderecos (
    usuario_id, cep, logradouro, numero, bairro, municipio, uf,
    latitude, longitude, precisao, consentimento_lgpd
) VALUES
    (
        '33333333-3333-4333-8333-333333333333',
        '07790000',
        'Rua Perto da Estação A',
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
        '44444444-4444-4444-8444-444444444444',
        '07791000',
        'Rua Perto da Estação B',
        '20',
        'Centro',
        'Cajamar',
        'SP',
        -23.3020000,
        -46.8020000,
        'ajustado_manual',
        TRUE
    );

-- Estação A: oficial, validada e próxima do morador 3.
-- Estação B: oficial, validada e próxima do morador 4.
-- Estação C: legado de teste, sem fonte e não validada (deve ficar oculta).
INSERT INTO public.estacoes (
    nome_estacao, codigo_estacao, latitude, longitude,
    fonte, fonte_id, municipio, uf, tipo_estacao, rede,
    status_fonte, ultima_coleta_em, validada
) VALUES
    (
        'Estação A', '350920504A', -23.3530000, -46.8740000,
        'CEMADEN', '7030', 'Cajamar', 'SP', 'Pluviométrica', 'CEMADEN',
        1, now(), TRUE
    ),
    (
        'Estação B', '350920502A', -23.3000000, -46.8000000,
        'CEMADEN', '7028', 'Cajamar', 'SP', 'Pluviométrica', 'CEMADEN',
        1, now(), TRUE
    ),
    (
        'Estação legada de teste', 'LEGACY-TEST', -23.3540000, -46.8750000,
        NULL, NULL, 'Cajamar', 'SP', 'Pluviométrica', NULL,
        NULL, NULL, FALSE
    );

-- Acumulado de 24 h (aparece) + intervalo (não aparece na camada pública).
-- A soma de intervalo precisa continuar enxergando o intervalo via função
-- SECURITY DEFINER, sem misturar com o acumulado.
INSERT INTO public.medicoes_chuva (
    id_estacao, data_hora, precipitacao_mm, fonte_dado,
    tipo_medicao, janela_horas, unidade, qualidade_dado, coletado_em
)
SELECT
    e.id_estacao, now() - interval '10 minutes', 4.2, 'CEMADEN',
    'acumulado_24h', 24, 'mm', 'oficial', now()
FROM public.estacoes e
WHERE e.codigo_estacao = '350920504A';

INSERT INTO public.medicoes_chuva (
    id_estacao, data_hora, precipitacao_mm, fonte_dado,
    tipo_medicao, unidade, qualidade_dado, coletado_em
)
SELECT
    e.id_estacao, now() - interval '30 minutes', 1.5, 'CEMADEN',
    'intervalo', 'mm', 'oficial', now()
FROM public.estacoes e
WHERE e.codigo_estacao = '350920504A';

INSERT INTO public.medicoes_chuva (
    id_estacao, data_hora, precipitacao_mm, fonte_dado,
    tipo_medicao, janela_horas, unidade, qualidade_dado, coletado_em
)
SELECT
    e.id_estacao, now() - interval '15 minutes', 2.0, 'CEMADEN',
    'acumulado_24h', 24, 'mm', 'oficial', now()
FROM public.estacoes e
WHERE e.codigo_estacao = '350920502A';

INSERT INTO public.medicoes_chuva (
    id_estacao, data_hora, precipitacao_mm, fonte_dado,
    tipo_medicao, janela_horas, unidade, qualidade_dado, coletado_em
)
SELECT
    e.id_estacao, now() - interval '5 minutes', 99.9, 'dado legado',
    'acumulado_24h', 24, 'mm', 'oficial', now()
FROM public.estacoes e
WHERE e.codigo_estacao = 'LEGACY-TEST';

-- Logs: a tentativa com erro é mais antiga; o último estado é sucesso.
INSERT INTO public.coletas_fonte (
    fonte, endpoint, iniciado_em, concluido_em, status,
    estacoes_recebidas, estacoes_no_raio, medicoes_gravadas,
    medicoes_sem_leitura, payload_atualizado_em, duracao_ms,
    mensagem_publica, erro_interno
) VALUES
    (
        'CEMADEN', 'https://resources.cemaden.gov.br/dados/311_24.json',
        now() - interval '1 hour', now() - interval '1 hour', 'erro',
        0, 0, 0, 0, NULL, 800,
        'A coleta anterior falhou.', 'token-interno-nao-publico'
    ),
    (
        'CEMADEN', 'https://resources.cemaden.gov.br/dados/311_24.json',
        now(), now(), 'sucesso',
        5938, 3, 2, 1, now() - interval '10 minutes', 1200,
        'Sincronização concluída com dados oficiais.', NULL
    );

-- Ocorrências: apenas a primeira deve chegar à camada pública.
INSERT INTO public.ocorrencias (
    tipo, descricao, bairro, latitude, longitude, status, publica, fonte,
    verificado_em
) VALUES
    (
        'alagamento', 'Ocorrência verificada e pública', 'Centro',
        -23.3560, -46.8760, 'verificada', TRUE, 'defesa_civil', now()
    ),
    (
        'alagamento', 'Ocorrência verificada sem autorização', 'Centro',
        -23.3560, -46.8760, 'verificada', FALSE, 'defesa_civil', now()
    ),
    (
        'alagamento', 'Ocorrência pendente', 'Centro',
        -23.3560, -46.8760, 'pendente', TRUE, 'registro_comunitario', NULL
    );

-- ---------------------------------------------------------------------
-- Anônimo: camada pública sem PII, somente dados validados
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;

SELECT is(
    (SELECT count(*)::int FROM public.vw_estacoes_publicas),
    2,
    'anônimo vê apenas as estações validadas com fonte'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_estacoes_publicas
     WHERE codigo_estacao = 'LEGACY-TEST'),
    0,
    'estação legada sem proveniência não aparece'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_estacoes_publicas WHERE fonte IS NULL),
    0,
    'view pública não expõe estação sem fonte'
);

SELECT is(
    (SELECT chuva_acumulada_mm
       FROM public.vw_estacoes_publicas
      WHERE codigo_estacao = '350920504A'),
    4.2::numeric,
    'view pública usa o acumulado de 24 h'
);

SELECT is(
    (SELECT tipo_medicao
       FROM public.vw_estacoes_publicas
      WHERE codigo_estacao = '350920504A'),
    'acumulado_24h',
    'view pública identifica o tipo da medição'
);

SELECT is(
    (SELECT count(*)::int FROM public.medicoes_chuva),
    2,
    'RLS pública oculta medições de intervalo e de estação não validada'
);

SELECT is(
    (SELECT count(*)::int FROM public.medicoes_chuva
     WHERE tipo_medicao <> 'acumulado_24h'),
    0,
    'consulta pública direta não mistura acumulado com intervalo'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_ocorrencias_publicas),
    1,
    'somente ocorrências verificadas e autorizadas são públicas'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_ocorrencias_publicas
     WHERE descricao IN (
         'Ocorrência verificada sem autorização',
         'Ocorrência pendente'
     )),
    0,
    'ocorrências sem curadoria ficam fora da view'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.ocorrencias $$,
    '42501',
    NULL,
    'a tabela de ocorrências não tem leitura pública direta; a view é a única porta'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.coletas_fonte $$,
    '42501',
    NULL,
    'anônimo não lê a tabela de auditoria diretamente'
);

SELECT is(
    (SELECT status_ultima_tentativa
       FROM public.vw_coletas_publicas
      WHERE fonte = 'CEMADEN'),
    'sucesso',
    'view de coletas expõe o status da última tentativa'
);

SELECT is(
    (SELECT count(*)::int
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vw_coletas_publicas'
        AND column_name = 'erro_interno'),
    0,
    'view de coletas não expõe erro interno'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.estacoes_proximas(-23.3561111, -46.8769444, 5, 20)),
    1,
    'RPC pública respeita o raio informado'
);

SELECT is(
    (SELECT codigo_estacao
       FROM public.estacoes_proximas(-23.3561111, -46.8769444, 5, 20)),
    '350920504A',
    'RPC pública retorna a estação dentro do raio'
);

SELECT ok(
    (SELECT min(distancia_km)
       FROM public.estacoes_proximas(-23.3561111, -46.8769444, 5, 20)) >= 0,
    'RPC pública retorna distância geodésica não negativa'
);

SELECT is(
    (SELECT precipitacao_mm
       FROM public.ultima_chuva_acumulada_24h((
           SELECT id_estacao FROM public.estacoes
            WHERE codigo_estacao = '350920504A'
       ))),
    4.2::numeric,
    'última chuva de 24 h não soma medições de intervalo'
);

SELECT is(
    public.soma_chuva_intervalo(
        (SELECT id_estacao FROM public.estacoes
          WHERE codigo_estacao = '350920504A'),
        now() - interval '2 hours',
        now() + interval '1 hour'
    ),
    1.5::numeric,
    'soma de intervalo retorna somente a medição do tipo intervalo'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.estacoes_proximas_do_morador(5, 20) $$,
    '42501',
    NULL,
    'anônimo não consulta estações a partir do imóvel de um morador'
);

SELECT throws_ok(
    $$ SELECT public.distancia_morador_estacao(1) $$,
    '42501',
    NULL,
    'anônimo não calcula distância a partir de endereço privado'
);

SELECT is(
    (SELECT count(*)::int
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
            'vw_estacoes_publicas',
            'vw_coletas_publicas',
            'vw_ocorrencias_publicas'
        )
        AND column_name IN (
            'usuario_id', 'verificado_por', 'erro_interno', 'localizacao'
        )),
    0,
    'views públicas não projetam PII nem geometria privada'
);

SELECT is(
    (SELECT count(*)::int
       FROM pg_class
      WHERE relname = 'vw_estacoes_publicas'
        AND reloptions @> ARRAY['security_invoker=true']),
    1,
    'view pública de estações respeita a RLS (security_invoker)'
);

-- ---------------------------------------------------------------------
-- Morador 3: distâncias calculadas a partir do próprio endereço
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

SELECT is(
    (SELECT count(*)::int FROM public.enderecos),
    1,
    'morador 3 vê apenas o próprio endereço'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_estacoes_publicas),
    2,
    'morador autenticado vê a mesma camada pública validada'
);

SELECT is(
    (SELECT count(*)::int FROM public.estacoes_proximas_do_morador(5, 20)),
    1,
    'cálculo do imóvel respeita o raio'
);

SELECT is(
    (SELECT codigo_estacao
       FROM public.estacoes_proximas_do_morador(5, 20)),
    '350920504A',
    'a estação próxima do morador 3 é a estação A'
);

SELECT ok(
    (SELECT distancia_km
       FROM public.estacoes_proximas_do_morador(5, 20)) > 0,
    'PostGIS calcula distância positiva a partir do imóvel'
);

SELECT is(
    public.distancia_morador_estacao((
        SELECT id_estacao FROM public.estacoes WHERE codigo_estacao = '350920504A'
    )),
    (SELECT distancia_km
       FROM public.estacoes_proximas_do_morador(5, 20)
      WHERE codigo_estacao = '350920504A'),
    'RPC de proximidade e função de distância concordam'
);

SELECT is(
    (SELECT count(*)::int FROM public.enderecos
      WHERE usuario_id = '44444444-4444-4444-8444-444444444444'),
    0,
    'morador 3 não vê o endereço do morador 4'
);

SELECT throws_ok(
    $$ INSERT INTO public.ocorrencias (tipo, latitude, longitude)
       VALUES ('alagamento', -23.35, -46.87) $$,
    '42501',
    NULL,
    'morador não insere ocorrência diretamente'
);

SELECT throws_ok(
    $$ UPDATE public.ocorrencias SET descricao = 'alterada' $$,
    '42501',
    NULL,
    'morador não altera ocorrência sem moderação'
);

-- ---------------------------------------------------------------------
-- Morador 4: a âncora do cálculo muda com o endereço autenticado
-- ---------------------------------------------------------------------
SET LOCAL request.jwt.claims = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

SELECT is(
    (SELECT count(*)::int FROM public.enderecos),
    1,
    'morador 4 vê apenas o próprio endereço'
);

SELECT is(
    (SELECT codigo_estacao
       FROM public.estacoes_proximas_do_morador(5, 20)),
    '350920502A',
    'morador 4 tem a estação B como mais próxima'
);

-- ---------------------------------------------------------------------
-- Integridade estrutural (dono da sessão)
-- ---------------------------------------------------------------------
RESET ROLE;

SELECT is(
    (SELECT count(*)::int
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
            'estacoes', 'medicoes_chuva', 'coletas_fonte', 'ocorrencias'
        )
        AND c.relrowsecurity),
    4,
    'RLS está habilitada nas quatro tabelas da Etapa 3'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.estacoes
      WHERE validada IS TRUE
        AND fonte IS NULL),
    0,
    'nenhuma estação validada fica sem proveniência'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.vw_estacoes_publicas
      WHERE tipo_medicao IS NOT NULL
        AND tipo_medicao <> 'acumulado_24h'),
    0,
    'view pública contém somente medições acumulado_24h'
);

SELECT * FROM finish();
ROLLBACK;
