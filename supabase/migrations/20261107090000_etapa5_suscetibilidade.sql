-- =====================================================================
-- Etapa 5 — suscetibilidade oficial a inundação e enxurrada (SGB/CPRM + IPT)
--
-- Fonte: Carta de suscetibilidade a movimentos gravitacionais de massa e
-- inundações: município de Cajamar, SP. CPRM/SGB e IPT, 2017, escala 1:25.000.
-- Item: https://rigeo.sgb.gov.br/items/ffa6864e-5fbd-4e3e-a1bd-28d22fe50cf4
--
-- Escopo desta migration:
-- - armazenar os metadados de proveniência da cartografia;
-- - armazenar somente os polígonos oficiais de INUNDAÇÃO e ENXURRADA,
--   separados dos movimentos gravitacionais de massa (deslizamento/rastejo);
-- - expor uma camada pública sem dados pessoais e funções espaciais que
--   respondem por um ponto informado ou pelo imóvel do morador autenticado.
--
-- Princípios:
-- - nenhuma geometria é inventada, simplificada ou inferida;
-- - a classe de suscetibilidade NÃO é previsão de alagamento nem alerta;
-- - o endereço do morador continua privado: as funções autenticadas usam
--   auth.uid() e nunca devolvem coordenadas pessoais;
-- - as tabelas-base não têm SELECT direto para anon/authenticated; a única
--   porta pública são as views e as funções explicitamente concedidas.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

SET search_path = public, extensions;
SET lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 1. METADADOS DA CARTOGRAFIA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cartografias_suscetibilidade (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    titulo TEXT NOT NULL,
    fonte TEXT NOT NULL,
    editor TEXT NOT NULL,
    municipio TEXT NOT NULL,
    uf CHAR(2) NOT NULL,
    escala TEXT NOT NULL,
    ano_publicacao SMALLINT,
    mes_publicacao SMALLINT,
    url_item TEXT NOT NULL,
    url_download TEXT,
    licenca TEXT,
    srid_origem INTEGER NOT NULL,
    srid_destino INTEGER NOT NULL DEFAULT 4326,
    arquivo_origem TEXT NOT NULL,
    hash_arquivo_sha256 TEXT,
    publicada BOOLEAN NOT NULL DEFAULT FALSE,
    importado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT cartografias_suscetibilidade_uf_formato
        CHECK (uf ~ '^[A-Z]{2}$'),
    CONSTRAINT cartografias_suscetibilidade_srid_valido
        CHECK (srid_origem > 0 AND srid_destino = 4326),
    CONSTRAINT cartografias_suscetibilidade_mes_valido
        CHECK (mes_publicacao IS NULL OR mes_publicacao BETWEEN 1 AND 12),
    CONSTRAINT cartografias_suscetibilidade_publicada_com_proveniencia
        CHECK (
            publicada IS FALSE
            OR (hash_arquivo_sha256 IS NOT NULL AND arquivo_origem IS NOT NULL)
        )
);

COMMENT ON TABLE public.cartografias_suscetibilidade IS
    'Metadados de proveniência das cartas oficiais de suscetibilidade. A publicação é explícita.';
COMMENT ON COLUMN public.cartografias_suscetibilidade.slug IS
    'Identificador estável usado pelo importador para atualizar a mesma cartografia sem duplicar feições.';
COMMENT ON COLUMN public.cartografias_suscetibilidade.publicada IS
    'Só cartografias com publicada=true aparecem nas views e funções públicas.';
COMMENT ON COLUMN public.cartografias_suscetibilidade.hash_arquivo_sha256 IS
    'SHA-256 do pacote oficial (ou da composição dos arquivos de origem) usado na importação.';
COMMENT ON COLUMN public.cartografias_suscetibilidade.metadados IS
    'Metadados não pessoais: citação, classes, contagens, CRS, arquivos não importados e observações.';

-- ---------------------------------------------------------------------
-- 2. POLÍGONOS DE INUNDAÇÃO E ENXURRADA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.areas_suscetibilidade (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    cartografia_id BIGINT NOT NULL
        REFERENCES public.cartografias_suscetibilidade(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    classe TEXT NOT NULL,
    classe_ordem SMALLINT,
    processo TEXT NOT NULL,
    fonte_id TEXT,
    ordem_origem INTEGER NOT NULL,
    area_ha NUMERIC(18, 8) NOT NULL,
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT areas_suscetibilidade_tipo_valido
        CHECK (tipo IN ('inundacao', 'enxurrada')),
    CONSTRAINT areas_suscetibilidade_classe_coerente
        CHECK (
            (
                tipo = 'inundacao'
                AND classe IN ('Alta', 'Media', 'Baixa')
                AND classe_ordem IN (1, 2, 3)
                AND (
                    (classe = 'Alta' AND classe_ordem = 3)
                    OR (classe = 'Media' AND classe_ordem = 2)
                    OR (classe = 'Baixa' AND classe_ordem = 1)
                )
            )
            OR (
                tipo = 'enxurrada'
                AND classe = 'Enxurrada'
                AND classe_ordem IS NULL
            )
        ),
    CONSTRAINT areas_suscetibilidade_ordem_positiva
        CHECK (ordem_origem > 0),
    CONSTRAINT areas_suscetibilidade_area_positiva
        CHECK (area_ha > 0),
    CONSTRAINT areas_suscetibilidade_processo_preenchido
        CHECK (char_length(btrim(processo)) > 0),
    CONSTRAINT areas_suscetibilidade_srid_4326
        CHECK (ST_SRID(geom) = 4326),
    CONSTRAINT areas_suscetibilidade_geom_valida
        CHECK (ST_IsValid(geom)),
    CONSTRAINT areas_suscetibilidade_geom_nao_vazia
        CHECK (NOT ST_IsEmpty(geom)),
    CONSTRAINT areas_suscetibilidade_ordem_unica
        UNIQUE (cartografia_id, tipo, ordem_origem)
);

CREATE INDEX IF NOT EXISTS idx_areas_suscetibilidade_geom
    ON public.areas_suscetibilidade USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_areas_suscetibilidade_cartografia_tipo
    ON public.areas_suscetibilidade (cartografia_id, tipo, classe_ordem DESC);

COMMENT ON TABLE public.areas_suscetibilidade IS
    'Polígonos oficiais de suscetibilidade a inundação e enxurrada. Não contém deslizamento/rastejo.';
COMMENT ON COLUMN public.areas_suscetibilidade.tipo IS
    'inundacao = polígonos da carta de inundação; enxurrada = polígonos da camada de enxurradas.';
COMMENT ON COLUMN public.areas_suscetibilidade.classe IS
    'Classe original da fonte. Inundação: Alta, Media ou Baixa. Enxurrada: Enxurrada (sem grau na fonte).';
COMMENT ON COLUMN public.areas_suscetibilidade.classe_ordem IS
    '3=Alta, 2=Media, 1=Baixa para inundação; NULL para enxurrada, que não tem grau na fonte.';
COMMENT ON COLUMN public.areas_suscetibilidade.area_ha IS
    'Área calculada no PostGIS a partir da geometria oficial em SRID 4326, em hectares. A precisão de 8 casas preserva recortes oficiais muito pequenos (a menor feição da fonte tem ~0,30 m²).';
COMMENT ON COLUMN public.areas_suscetibilidade.geom IS
    'MultiPolygon oficial em WGS 84 (SRID 4326), transformado de SIRGAS 2000 / UTM 23S.';

-- ---------------------------------------------------------------------
-- 3. VIEWS PÚBLICAS (sem dados pessoais)
-- ---------------------------------------------------------------------
DROP VIEW IF EXISTS public.vw_areas_suscetibilidade_publicas CASCADE;
DROP VIEW IF EXISTS public.vw_cartografias_suscetibilidade_publicas CASCADE;

CREATE VIEW public.vw_cartografias_suscetibilidade_publicas
WITH (security_invoker = false) AS
SELECT
    c.id,
    c.slug,
    c.titulo,
    c.fonte,
    c.editor,
    c.municipio,
    c.uf::text AS uf,
    c.escala,
    c.ano_publicacao,
    c.mes_publicacao,
    c.url_item,
    c.url_download,
    c.licenca,
    c.srid_origem,
    c.srid_destino,
    c.importado_em,
    c.metadados,
    COALESCE(a.total_inundacao, 0)::integer AS total_inundacao,
    COALESCE(a.total_enxurrada, 0)::integer AS total_enxurrada,
    COALESCE(a.area_ha_inundacao, 0)::numeric AS area_ha_inundacao,
    COALESCE(a.area_ha_enxurrada, 0)::numeric AS area_ha_enxurrada
FROM public.cartografias_suscetibilidade AS c
LEFT JOIN LATERAL (
    SELECT
        count(*) FILTER (WHERE area.tipo = 'inundacao') AS total_inundacao,
        count(*) FILTER (WHERE area.tipo = 'enxurrada') AS total_enxurrada,
        sum(area.area_ha) FILTER (WHERE area.tipo = 'inundacao') AS area_ha_inundacao,
        sum(area.area_ha) FILTER (WHERE area.tipo = 'enxurrada') AS area_ha_enxurrada
    FROM public.areas_suscetibilidade AS area
    WHERE area.cartografia_id = c.id
) AS a ON TRUE
WHERE c.publicada IS TRUE;

COMMENT ON VIEW public.vw_cartografias_suscetibilidade_publicas IS
    'Metadados públicos da carta publicada, com contagens e áreas calculadas no PostGIS.';

CREATE VIEW public.vw_areas_suscetibilidade_publicas
WITH (security_invoker = false) AS
SELECT
    a.id,
    c.slug AS cartografia_slug,
    a.tipo,
    a.classe,
    a.classe_ordem,
    a.processo,
    a.fonte_id,
    a.ordem_origem,
    a.area_ha,
    ST_AsGeoJSON(a.geom, 6)::jsonb AS geojson
FROM public.areas_suscetibilidade AS a
JOIN public.cartografias_suscetibilidade AS c
  ON c.id = a.cartografia_id
WHERE c.publicada IS TRUE;

COMMENT ON VIEW public.vw_areas_suscetibilidade_publicas IS
    'Feições públicas de inundação/enxurrada em GeoJSON. Não expõe endereços nem usuários.';

-- ---------------------------------------------------------------------
-- 4. CONSULTAS ESPACIAIS
-- ---------------------------------------------------------------------

-- Ponto arbitrário (por exemplo, um clique no mapa). Não persiste nem devolve
-- coordenadas pessoais. p_raio_m = 0 significa "apenas polígonos que contêm".
DROP FUNCTION IF EXISTS public.areas_suscetibilidade_no_ponto(double precision, double precision, double precision, integer);

CREATE FUNCTION public.areas_suscetibilidade_no_ponto(
    p_latitude double precision,
    p_longitude double precision,
    p_raio_m double precision DEFAULT 0,
    p_limite integer DEFAULT 50
)
RETURNS TABLE (
    id BIGINT,
    cartografia_slug TEXT,
    tipo TEXT,
    classe TEXT,
    classe_ordem SMALLINT,
    processo TEXT,
    area_ha NUMERIC,
    contem_ponto BOOLEAN,
    distancia_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
WITH ponto AS (
    SELECT
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326) AS geom,
        ST_SetSRID(ST_MakePoint(p_longitude, p_latitude), 4326)::geography AS g
    WHERE p_latitude BETWEEN -90 AND 90
      AND p_longitude BETWEEN -180 AND 180
      AND p_raio_m IS NOT NULL
      AND p_raio_m >= 0
      AND p_limite IS NOT NULL
      AND p_limite > 0
)
SELECT
    a.id,
    c.slug,
    a.tipo,
    a.classe,
    a.classe_ordem,
    a.processo,
    a.area_ha,
    ST_Covers(a.geom, p.geom) AS contem_ponto,
    round(ST_Distance(a.geom::geography, p.g)::numeric, 1)::double precision AS distancia_m
FROM public.areas_suscetibilidade AS a
JOIN public.cartografias_suscetibilidade AS c
  ON c.id = a.cartografia_id
CROSS JOIN ponto AS p
WHERE c.publicada IS TRUE
  AND (
      (p_raio_m = 0 AND ST_Covers(a.geom, p.geom))
      OR (
          p_raio_m > 0
          AND ST_DWithin(
              a.geom::geography,
              p.g,
              LEAST(GREATEST(p_raio_m, 1), 10000)
          )
      )
  )
ORDER BY
    contem_ponto DESC,
    classe_ordem DESC NULLS LAST,
    distancia_m ASC,
    tipo ASC,
    id ASC
LIMIT LEAST(GREATEST(p_limite, 1), 100);
$$;

COMMENT ON FUNCTION public.areas_suscetibilidade_no_ponto(double precision, double precision, double precision, integer) IS
    'Áreas oficiais que contêm ou estão a até p_raio_m de um ponto. Não persiste coordenadas nem expõe dados pessoais.';

-- Mesma consulta, ancorada no endereço privado do usuário. Não recebe
-- coordenadas do cliente e não devolve a localização do imóvel.
DROP FUNCTION IF EXISTS public.areas_suscetibilidade_do_morador(double precision, integer);

CREATE FUNCTION public.areas_suscetibilidade_do_morador(
    p_raio_m double precision DEFAULT 500,
    p_limite integer DEFAULT 20
)
RETURNS TABLE (
    id BIGINT,
    cartografia_slug TEXT,
    tipo TEXT,
    classe TEXT,
    classe_ordem SMALLINT,
    processo TEXT,
    area_ha NUMERIC,
    contem_ponto BOOLEAN,
    distancia_m DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
WITH meu_endereco AS (
    SELECT e.localizacao
    FROM public.enderecos AS e
    WHERE e.usuario_id = auth.uid()
      AND e.localizacao IS NOT NULL
      AND p_raio_m IS NOT NULL
      AND p_raio_m >= 0
      AND p_limite IS NOT NULL
      AND p_limite > 0
    LIMIT 1
)
SELECT
    a.id,
    c.slug,
    a.tipo,
    a.classe,
    a.classe_ordem,
    a.processo,
    a.area_ha,
    ST_Covers(a.geom, e.localizacao) AS contem_ponto,
    round(ST_Distance(a.geom::geography, e.localizacao::geography)::numeric, 1)::double precision AS distancia_m
FROM public.areas_suscetibilidade AS a
JOIN public.cartografias_suscetibilidade AS c
  ON c.id = a.cartografia_id
CROSS JOIN meu_endereco AS e
WHERE c.publicada IS TRUE
  AND (
      (p_raio_m = 0 AND ST_Covers(a.geom, e.localizacao))
      OR (
          p_raio_m > 0
          AND ST_DWithin(
              a.geom::geography,
              e.localizacao::geography,
              LEAST(GREATEST(p_raio_m, 1), 10000)
          )
      )
  )
ORDER BY
    contem_ponto DESC,
    classe_ordem DESC NULLS LAST,
    distancia_m ASC,
    tipo ASC,
    id ASC
LIMIT LEAST(GREATEST(p_limite, 1), 100);
$$;

COMMENT ON FUNCTION public.areas_suscetibilidade_do_morador(double precision, integer) IS
    'Áreas oficiais que contêm ou estão próximas do imóvel do próprio usuário. Usa auth.uid(); não aceita coordenadas do cliente.';

-- ---------------------------------------------------------------------
-- 5. RLS — defesa em profundidade
-- ---------------------------------------------------------------------
ALTER TABLE public.cartografias_suscetibilidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas_suscetibilidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cartografias_suscetibilidade_select_publicas
    ON public.cartografias_suscetibilidade;
CREATE POLICY cartografias_suscetibilidade_select_publicas
ON public.cartografias_suscetibilidade
FOR SELECT
TO anon, authenticated
USING (publicada IS TRUE);

DROP POLICY IF EXISTS areas_suscetibilidade_select_publicas
    ON public.areas_suscetibilidade;
CREATE POLICY areas_suscetibilidade_select_publicas
ON public.areas_suscetibilidade
FOR SELECT
TO anon, authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.cartografias_suscetibilidade AS c
        WHERE c.id = areas_suscetibilidade.cartografia_id
          AND c.publicada IS TRUE
    )
);

-- ---------------------------------------------------------------------
-- 6. GRANTS
-- ---------------------------------------------------------------------
REVOKE ALL ON public.cartografias_suscetibilidade FROM anon, authenticated;
REVOKE ALL ON public.areas_suscetibilidade FROM anon, authenticated;

GRANT SELECT ON public.vw_cartografias_suscetibilidade_publicas
    TO anon, authenticated;
GRANT SELECT ON public.vw_areas_suscetibilidade_publicas
    TO anon, authenticated;

REVOKE ALL ON FUNCTION public.areas_suscetibilidade_no_ponto(double precision, double precision, double precision, integer)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.areas_suscetibilidade_do_morador(double precision, integer)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.areas_suscetibilidade_no_ponto(double precision, double precision, double precision, integer)
    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.areas_suscetibilidade_do_morador(double precision, integer)
    TO authenticated;

NOTIFY pgrst, 'reload schema';
