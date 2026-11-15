-- =====================================================================
-- Alerta de Chuva Cajamar - PostgreSQL + PostGIS
-- Script de Criação do Banco de Dados - Referência Apostila Técnica
-- Autores: Walison Junior Eustaquio e Grupo de Extensão
-- =====================================================================

-- Habilitar a extensão PostGIS para funções e índices espaciais
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. TABELA BAIRROS
CREATE TABLE IF NOT EXISTS bairros (
    id_bairro INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_bairro VARCHAR(100) NOT NULL,
    municipio VARCHAR(100) NOT NULL,
    geometria GEOMETRY(MULTIPOLYGON, 4326),
    UNIQUE (nome_bairro, municipio)
);

-- 2. TABELA ESTACOES
CREATE TABLE IF NOT EXISTS estacoes (
    id_estacao INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome_estacao VARCHAR(150) NOT NULL,
    codigo_estacao VARCHAR(50) UNIQUE,
    id_bairro INTEGER REFERENCES bairros(id_bairro),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    localizacao GEOMETRY(POINT, 4326),
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    data_cadastro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180))
);

-- 3. TABELA MEDICOES_CHUVA
CREATE TABLE IF NOT EXISTS medicoes_chuva (
    id_medicao BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_estacao INTEGER NOT NULL REFERENCES estacoes(id_estacao),
    data_hora TIMESTAMPTZ NOT NULL,
    precipitacao_mm NUMERIC(8, 2) NOT NULL,
    fonte_dado VARCHAR(100),
    data_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (precipitacao_mm >= 0),
    UNIQUE (id_estacao, data_hora)
);

-- 4. TABELA ALERTAS
CREATE TABLE IF NOT EXISTS alertas (
    id_alerta INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_bairro INTEGER NOT NULL REFERENCES bairros(id_bairro),
    nivel VARCHAR(20) NOT NULL,
    mensagem TEXT,
    data_emissao TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'EMITIDO',
    CHECK (nivel IN ('ATENCAO', 'ALERTA', 'CRITICO')),
    CHECK (status IN ('EMITIDO', 'CANCELADO', 'RESOLVIDO'))
);

-- 5. TABELA CONTATOS_ALERTA (Original da apostila)
CREATE TABLE IF NOT EXISTS contatos_alerta (
    id_contato INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_bairro INTEGER REFERENCES bairros(id_bairro),
    nome VARCHAR(150) NOT NULL,
    telefone VARCHAR(20),
    email VARCHAR(150),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    consentimento BOOLEAN NOT NULL DEFAULT FALSE,
    data_cadastro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (telefone IS NOT NULL OR email IS NOT NULL)
);

-- ÍNDICES DE PERFORMANCE E ESPACIAIS
CREATE INDEX IF NOT EXISTS idx_medicoes_estacao_data
    ON medicoes_chuva (id_estacao, data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_bairros_geometria
    ON bairros USING GIST (geometria);

CREATE INDEX IF NOT EXISTS idx_estacoes_localizacao
    ON estacoes USING GIST (localizacao);

CREATE INDEX IF NOT EXISTS idx_alertas_bairro
    ON alertas (id_bairro, data_emissao DESC);

CREATE INDEX IF NOT EXISTS idx_contatos_bairro
    ON contatos_alerta (id_bairro);
