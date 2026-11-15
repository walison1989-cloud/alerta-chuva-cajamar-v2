-- =====================================================================
-- Alerta de Chuva Cajamar
-- Baseline idempotente do schema acadêmico já existente.
--
-- Esta migration NÃO recria nem apaga dados. Ela apenas garante que as
-- tabelas da apostila existam em um projeto Supabase novo e que as colunas
-- complementares de moradores estejam presentes. Em um banco que já contém
-- o schema, todas as instruções são no-op.
-- =====================================================================

-- No Supabase as extensões ficam no schema "extensions", que não é exposto
-- pelo PostgREST. Instalar PostGIS em "public" criaria também as tabelas
-- spatial_ref_sys/geometry_columns na API pública. O schema é criado porque
-- um PostgreSQL comum pode não tê-lo.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- O trigger de endereço executa ST_MakePoint/ST_SetSRID como o usuário
-- autenticado. Sem USAGE no schema, a resolução falha em um banco onde o
-- schema "extensions" não foi aberto pelo Supabase.
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- Inclui "extensions" no search_path para que GEOMETRY e ST_* sejam
-- resolvidos tanto localmente quanto no Supabase.
SET search_path = public, extensions;

-- 1. BAIRROS
CREATE TABLE IF NOT EXISTS public.bairros (
    id_bairro INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_bairro VARCHAR(100) NOT NULL,
    municipio VARCHAR(100) NOT NULL,
    geometria GEOMETRY(MULTIPOLYGON, 4326),
    UNIQUE (nome_bairro, municipio)
);

-- 2. ESTACOES
CREATE TABLE IF NOT EXISTS public.estacoes (
    id_estacao INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_estacao VARCHAR(150) NOT NULL,
    codigo_estacao VARCHAR(50) UNIQUE,
    id_bairro INTEGER REFERENCES public.bairros(id_bairro),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    localizacao GEOMETRY(POINT, 4326),
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
);

-- 3. MEDICOES_CHUVA
CREATE TABLE IF NOT EXISTS public.medicoes_chuva (
    id_medicao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_estacao INTEGER NOT NULL REFERENCES public.estacoes(id_estacao),
    data_hora TIMESTAMPTZ NOT NULL,
    precipitacao_mm NUMERIC(8, 2) NOT NULL,
    fonte_dado VARCHAR(100),
    data_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (precipitacao_mm >= 0),
    UNIQUE (id_estacao, data_hora)
);

-- 4. ALERTAS
CREATE TABLE IF NOT EXISTS public.alertas (
    id_alerta INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_bairro INTEGER NOT NULL REFERENCES public.bairros(id_bairro),
    nivel VARCHAR(20) NOT NULL,
    mensagem TEXT,
    data_emissao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'EMITIDO',
    CHECK (nivel IN ('ATENCAO', 'ALERTA', 'CRITICO')),
    CHECK (status IN ('EMITIDO', 'CANCELADO', 'RESOLVIDO'))
);

-- 5. CONTATOS_ALERTA (tabela original da apostila)
CREATE TABLE IF NOT EXISTS public.contatos_alerta (
    id_contato INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_bairro INTEGER REFERENCES public.bairros(id_bairro),
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(150),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    consentimento BOOLEAN NOT NULL DEFAULT FALSE,
    data_cadastro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (telefone IS NOT NULL OR email IS NOT NULL)
);

-- Colunas complementares da migração de moradores (idempotente).
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS endereco VARCHAR(255),
    ADD COLUMN IF NOT EXISTS numero VARCHAR(30),
    ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS localizacao GEOMETRY(POINT, 4326),
    ADD COLUMN IF NOT EXISTS bairro_detectado VARCHAR(100);

-- Índices originais.
CREATE INDEX IF NOT EXISTS idx_medicoes_estacao_data
    ON public.medicoes_chuva (id_estacao, data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_bairros_geometria
    ON public.bairros USING GIST (geometria);

CREATE INDEX IF NOT EXISTS idx_estacoes_localizacao
    ON public.estacoes USING GIST (localizacao);

CREATE INDEX IF NOT EXISTS idx_alertas_bairro
    ON public.alertas (id_bairro, data_emissao DESC);

CREATE INDEX IF NOT EXISTS idx_contatos_bairro
    ON public.contatos_alerta (id_bairro);

CREATE INDEX IF NOT EXISTS idx_contatos_localizacao
    ON public.contatos_alerta USING GIST (localizacao);
