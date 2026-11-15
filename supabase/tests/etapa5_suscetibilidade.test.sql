-- =====================================================================
-- Testes de suscetibilidade oficial, PostGIS e RLS — Etapa 5
--
-- Execute com Supabase CLI + Docker:
--   supabase test db
--
-- Os testes rodam em uma transação e fazem rollback. A cartografia e as
-- geometrias abaixo são fictícias e servem apenas para provar:
-- - a camada pública só mostra a cartografia explicitamente publicada;
-- - as geometrias são MultiPolygon em SRID 4326 e passam nas constraints;
-- - a consulta por ponto funciona para anon sem revelar dados pessoais;
-- - a consulta do imóvel usa auth.uid() e não devolve coordenadas;
-- - anon e authenticated não leem as tabelas-base diretamente;
-- - classes, áreas e ordens incoerentes são rejeitadas.
-- =====================================================================

BEGIN;

SET search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(32);

-- ---------------------------------------------------------------------
-- Preparação (dono da sessão): metadados e polígonos fictícios
-- ---------------------------------------------------------------------
INSERT INTO public.cartografias_suscetibilidade (
    slug,
    titulo,
    fonte,
    editor,
    municipio,
    uf,
    escala,
    ano_publicacao,
    mes_publicacao,
    url_item,
    licenca,
    srid_origem,
    srid_destino,
    arquivo_origem,
    hash_arquivo_sha256,
    publicada,
    metadados
) VALUES
    (
        'teste-etapa5-publicada',
        'Carta fictícia publicada para teste',
        'SGB/CPRM e IPT',
        'CPRM; IPT',
        'Cajamar',
        'SP',
        '1:25.000',
        2017,
        6,
        'https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4',
        'Acesso aberto',
        31983,
        4326,
        'teste.zip',
        'hash-de-teste',
        TRUE,
        '{"observacoes":"fixture de teste"}'::jsonb
    ),
    (
        'teste-etapa5-nao-publicada',
        'Carta fictícia não publicada para teste',
        'SGB/CPRM e IPT',
        'CPRM; IPT',
        'Cajamar',
        'SP',
        '1:25.000',
        2017,
        6,
        'https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4',
        'Acesso aberto',
        31983,
        4326,
        'teste.zip',
        'hash-de-teste',
        FALSE,
        '{}'::jsonb
    );

INSERT INTO public.areas_suscetibilidade (
    cartografia_id, tipo, classe, classe_ordem, processo, fonte_id,
    ordem_origem, area_ha, metadados, geom
)
SELECT
    c.id, 'inundacao', 'Alta', 3,
    'Inundação, alagamento e assoreamento', '1', 1, 1.25,
    '{"teste":true}'::jsonb,
    ST_GeomFromText(
        'MULTIPOLYGON(((-46.88 -23.37,-46.86 -23.37,-46.86 -23.35,-46.88 -23.35,-46.88 -23.37)))',
        4326
    )
FROM public.cartografias_suscetibilidade AS c
WHERE c.slug = 'teste-etapa5-publicada';

INSERT INTO public.areas_suscetibilidade (
    cartografia_id, tipo, classe, classe_ordem, processo, fonte_id,
    ordem_origem, area_ha, metadados, geom
)
SELECT
    c.id, 'enxurrada', 'Enxurrada', NULL,
    'Enxurrada', '2', 1, 0.5,
    '{}'::jsonb,
    ST_GeomFromText(
        'MULTIPOLYGON(((-46.60 -23.20,-46.59 -23.20,-46.59 -23.19,-46.60 -23.19,-46.60 -23.20)))',
        4326
    )
FROM public.cartografias_suscetibilidade AS c
WHERE c.slug = 'teste-etapa5-publicada';

INSERT INTO public.areas_suscetibilidade (
    cartografia_id, tipo, classe, classe_ordem, processo, fonte_id,
    ordem_origem, area_ha, metadados, geom
)
SELECT
    c.id, 'inundacao', 'Baixa', 1,
    'Inundação, alagamento e assoreamento', '3', 1, 900,
    '{}'::jsonb,
    ST_GeomFromText(
        'MULTIPOLYGON(((-46.70 -23.30,-46.69 -23.30,-46.69 -23.29,-46.70 -23.29,-46.70 -23.30)))',
        4326
    )
FROM public.cartografias_suscetibilidade AS c
WHERE c.slug = 'teste-etapa5-nao-publicada';

-- ---------------------------------------------------------------------
-- Anônimo: camada pública sem PII e consulta por ponto
-- ---------------------------------------------------------------------
RESET ROLE;
SET LOCAL ROLE anon;

SELECT is(
    (SELECT count(*)::int FROM public.vw_areas_suscetibilidade_publicas),
    2,
    'anônimo vê somente as feições da cartografia publicada'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_cartografias_suscetibilidade_publicas),
    1,
    'anônimo vê somente a cartografia publicada'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.vw_cartografias_suscetibilidade_publicas
      WHERE slug = 'teste-etapa5-nao-publicada'),
    0,
    'cartografia não publicada fica fora da view'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.vw_areas_suscetibilidade_publicas
      WHERE geojson->>'type' = 'MultiPolygon'),
    2,
    'view pública entrega todas as geometrias como MultiPolygon'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.areas_suscetibilidade_no_ponto(-23.36, -46.87, 0, 50)),
    1,
    'consulta por ponto encontra apenas a área que contém o ponto'
);

SELECT is(
    (SELECT contem_ponto
       FROM public.areas_suscetibilidade_no_ponto(-23.36, -46.87, 0, 50)),
    TRUE,
    'consulta por ponto marca contem_ponto'
);

SELECT is(
    (SELECT distancia_m
       FROM public.areas_suscetibilidade_no_ponto(-23.36, -46.87, 0, 50)),
    0::double precision,
    'distância é zero quando o ponto está dentro do polígono'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.areas_suscetibilidade_no_ponto(-23.25, -46.65, 0, 50)),
    0,
    'consulta por ponto fora das áreas não retorna feições'
);

SELECT throws_ok(
    $$ SELECT * FROM public.areas_suscetibilidade_do_morador(0, 20) $$,
    '42501',
    NULL,
    'anônimo não consulta a suscetibilidade de um imóvel'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.areas_suscetibilidade $$,
    '42501',
    NULL,
    'anônimo não lê a tabela-base de áreas diretamente'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.cartografias_suscetibilidade $$,
    '42501',
    NULL,
    'anônimo não lê a tabela-base de metadados diretamente'
);

SELECT is(
    (SELECT count(*)::int
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vw_areas_suscetibilidade_publicas'
        AND column_name IN (
            'usuario_id', 'localizacao', 'logradouro', 'numero'
        )),
    0,
    'view pública de áreas não projeta PII nem geometria privada'
);

SELECT is(
    (SELECT total_inundacao
       FROM public.vw_cartografias_suscetibilidade_publicas),
    1,
    'view de metadados conta os polígonos de inundação publicados'
);

SELECT is(
    (SELECT total_enxurrada
       FROM public.vw_cartografias_suscetibilidade_publicas),
    1,
    'view de metadados conta os polígonos de enxurrada publicados'
);

SELECT ok(
    (SELECT area_ha_inundacao > 0
       FROM public.vw_cartografias_suscetibilidade_publicas),
    'view de metadados calcula área de inundação positiva'
);

-- ---------------------------------------------------------------------
-- Morador: consulta ancorada em auth.uid()
-- ---------------------------------------------------------------------
RESET ROLE;

INSERT INTO auth.users (
    id, email, raw_user_meta_data, aud, role, email_confirmed_at
) VALUES (
    '55555555-5555-4555-8555-555555555555',
    'suscetibilidade@example.test',
    '{"nome":"Morador Suscetibilidade","consentimento_lgpd":true}'::jsonb,
    'authenticated',
    'authenticated',
    now()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.enderecos (
    usuario_id, cep, logradouro, numero, bairro, municipio, uf,
    latitude, longitude, precisao, consentimento_lgpd
) VALUES (
    '55555555-5555-4555-8555-555555555555',
    '07790000',
    'Rua dentro do polígono de teste',
    '10',
    'Centro',
    'Cajamar',
    'SP',
    -23.36,
    -46.87,
    'ajustado_manual',
    TRUE
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';

SELECT is(
    (SELECT count(*)::int
       FROM public.areas_suscetibilidade_do_morador(0, 20)),
    1,
    'morador encontra a área oficial que contém o próprio imóvel'
);

SELECT is(
    (SELECT contem_ponto
       FROM public.areas_suscetibilidade_do_morador(0, 20)),
    TRUE,
    'consulta do morador marca contem_ponto'
);

SELECT ok(
    position(
        'latitude' IN pg_get_function_result(
            'public.areas_suscetibilidade_do_morador(double precision,integer)'::regprocedure
        )
    ) = 0
    AND position(
        'longitude' IN pg_get_function_result(
            'public.areas_suscetibilidade_do_morador(double precision,integer)'::regprocedure
        )
    ) = 0,
    'consulta do morador não devolve coordenadas pessoais'
);

SELECT is(
    (SELECT count(*)::int FROM public.vw_areas_suscetibilidade_publicas),
    2,
    'morador autenticado vê a mesma camada pública'
);

SELECT throws_ok(
    $$ SELECT count(*) FROM public.areas_suscetibilidade $$,
    '42501',
    NULL,
    'morador autenticado não lê a tabela-base de áreas diretamente'
);

-- ---------------------------------------------------------------------
-- Integridade estrutural e constraints (dono da sessão)
-- ---------------------------------------------------------------------
RESET ROLE;

SELECT is(
    (SELECT count(*)::int
       FROM public.areas_suscetibilidade
      WHERE ST_SRID(geom) = 4326),
    3,
    'todas as geometrias de teste estão em SRID 4326'
);

SELECT is(
    (SELECT count(*)::int
       FROM public.areas_suscetibilidade
      WHERE ST_IsValid(geom)),
    3,
    'todas as geometrias de teste são válidas'
);

SELECT is(
    (SELECT count(*)::int
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN (
            'cartografias_suscetibilidade', 'areas_suscetibilidade'
        )
        AND c.relrowsecurity),
    2,
    'RLS está habilitada nas duas tabelas da Etapa 5'
);

SELECT throws_ok(
    $$
    INSERT INTO public.areas_suscetibilidade (
        cartografia_id, tipo, classe, classe_ordem, processo,
        ordem_origem, area_ha, geom
    )
    SELECT
        c.id, 'inundacao', 'Alta', 3, 'Teste', 2, 1,
        ST_GeomFromText(
            'MULTIPOLYGON(((-46.88 -23.37,-46.86 -23.35,-46.86 -23.37,-46.88 -23.35,-46.88 -23.37)))',
            4326
        )
    FROM public.cartografias_suscetibilidade AS c
    WHERE c.slug = 'teste-etapa5-publicada'
    $$,
    '23514',
    NULL,
    'geometria inválida é rejeitada pela constraint'
);

SELECT throws_ok(
    $$
    INSERT INTO public.areas_suscetibilidade (
        cartografia_id, tipo, classe, classe_ordem, processo,
        ordem_origem, area_ha, geom
    )
    SELECT
        c.id, 'inundacao', 'Alta', 1, 'Teste', 3, 1,
        ST_GeomFromText(
            'MULTIPOLYGON(((-46.80 -23.40,-46.79 -23.40,-46.79 -23.39,-46.80 -23.39,-46.80 -23.40)))',
            4326
        )
    FROM public.cartografias_suscetibilidade AS c
    WHERE c.slug = 'teste-etapa5-publicada'
    $$,
    '23514',
    NULL,
    'classe incoerente com a ordem é rejeitada'
);

SELECT throws_ok(
    $$
    INSERT INTO public.areas_suscetibilidade (
        cartografia_id, tipo, classe, classe_ordem, processo,
        ordem_origem, area_ha, geom
    )
    SELECT
        c.id, 'inundacao', 'Baixa', 1, 'Teste', 4, 0,
        ST_GeomFromText(
            'MULTIPOLYGON(((-46.80 -23.40,-46.79 -23.40,-46.79 -23.39,-46.80 -23.39,-46.80 -23.40)))',
            4326
        )
    FROM public.cartografias_suscetibilidade AS c
    WHERE c.slug = 'teste-etapa5-publicada'
    $$,
    '23514',
    NULL,
    'área zero é rejeitada'
);

SELECT throws_ok(
    $$
    INSERT INTO public.areas_suscetibilidade (
        cartografia_id, tipo, classe, classe_ordem, processo,
        ordem_origem, area_ha, geom
    )
    SELECT
        c.id, 'inundacao', 'Alta', 3, 'Teste', 1, 2,
        ST_GeomFromText(
            'MULTIPOLYGON(((-46.80 -23.40,-46.79 -23.40,-46.79 -23.39,-46.80 -23.39,-46.80 -23.40)))',
            4326
        )
    FROM public.cartografias_suscetibilidade AS c
    WHERE c.slug = 'teste-etapa5-publicada'
    $$,
    '23505',
    NULL,
    'ordem de origem duplicada na mesma cartografia é rejeitada'
);

SELECT throws_ok(
    $$
    INSERT INTO public.cartografias_suscetibilidade (
        slug, titulo, fonte, editor, municipio, uf, escala,
        url_item, srid_origem, srid_destino, arquivo_origem,
        hash_arquivo_sha256, publicada
    ) VALUES (
        'teste-etapa5-sem-hash', 'Teste', 'SGB/CPRM', 'IPT', 'Cajamar',
        'SP', '1:25.000', 'https://example.test', 31983, 4326,
        'teste.zip', NULL, TRUE
    )
    $$,
    '23514',
    NULL,
    'cartografia publicada sem hash de origem é rejeitada'
);

SELECT is(
    (SELECT count(*)::int
       FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN (
            'areas_suscetibilidade_no_ponto',
            'areas_suscetibilidade_do_morador'
        )
        AND p.prosecdef),
    2,
    'as duas consultas espaciais são SECURITY DEFINER com filtro explícito'
);

SELECT is(
    (SELECT count(*)::int
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'vw_cartografias_suscetibilidade_publicas'
        AND column_name IN ('usuario_id', 'localizacao', 'logradouro')),
    0,
    'view de metadados não projeta PII'
);

SELECT throws_ok(
    $$
    INSERT INTO public.areas_suscetibilidade (
        cartografia_id, tipo, classe, classe_ordem, processo,
        ordem_origem, area_ha, geom
    )
    SELECT
        c.id, 'deslizamento', 'Alta', 3, 'Teste', 5, 1,
        ST_GeomFromText(
            'MULTIPOLYGON(((-46.80 -23.40,-46.79 -23.40,-46.79 -23.39,-46.80 -23.39,-46.80 -23.40)))',
            4326
        )
    FROM public.cartografias_suscetibilidade AS c
    WHERE c.slug = 'teste-etapa5-publicada'
    $$,
    '23514',
    NULL,
    'somente inundação e enxurrada podem ser importadas nesta camada'
);

SELECT throws_ok(
    $$
    INSERT INTO public.areas_suscetibilidade (
        cartografia_id, tipo, classe, classe_ordem, processo,
        ordem_origem, area_ha, geom
    )
    SELECT
        c.id, 'enxurrada', 'Alta', NULL, 'Teste', 6, 1,
        ST_GeomFromText(
            'MULTIPOLYGON(((-46.80 -23.40,-46.79 -23.40,-46.79 -23.39,-46.80 -23.39,-46.80 -23.40)))',
            4326
        )
    FROM public.cartografias_suscetibilidade AS c
    WHERE c.slug = 'teste-etapa5-publicada'
    $$,
    '23514',
    NULL,
    'enxurrada não aceita a classe Alta da camada de inundação'
);

SELECT * FROM finish();
ROLLBACK;
