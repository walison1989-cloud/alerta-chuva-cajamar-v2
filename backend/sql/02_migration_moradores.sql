-- =====================================================================
-- Alerta de Chuva Cajamar - Migração Complementar
-- Objetivo: Suporte ao cadastro completo de moradores (endereço, CEP, coordenadas)
-- Preserva a tabela original 'contatos_alerta' da apostila, adicionando colunas.
-- =====================================================================

ALTER TABLE contatos_alerta
    ADD COLUMN IF NOT EXISTS endereco VARCHAR(255),
    ADD COLUMN IF NOT EXISTS numero VARCHAR(30),
    ADD COLUMN IF NOT EXISTS complemento VARCHAR(100),
    ADD COLUMN IF NOT EXISTS cep VARCHAR(10),
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS localizacao GEOMETRY(POINT, 4326),
    ADD COLUMN IF NOT EXISTS bairro_detectado VARCHAR(100);

-- Atualiza ponto geométrico automaticamente quando latitude/longitude forem informadas
CREATE INDEX IF NOT EXISTS idx_contatos_localizacao
    ON contatos_alerta USING GIST (localizacao);
