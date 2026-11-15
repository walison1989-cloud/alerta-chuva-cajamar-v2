-- =====================================================================
-- Alerta de Chuva Cajamar - Seeds e Carga Inicial
-- Carga dos 3 bairros prioritários com polígonos reais PostGIS,
-- 3 estações meteorológicas oficiais do projeto e medições DADO_TESTE.
-- =====================================================================

-- 1. Inserir bairros com polígonos representativos de Cajamar (SRID 4326)
INSERT INTO bairros (nome_bairro, municipio, geometria)
VALUES
(
    'Polvilho',
    'Cajamar',
    ST_Multi(ST_GeomFromText('POLYGON((
        -46.8600 -23.4400,
        -46.8150 -23.4400,
        -46.8150 -23.3950,
        -46.8600 -23.3950,
        -46.8600 -23.4400
    ))', 4326))
),
(
    'Jordanesia',
    'Cajamar',
    ST_Multi(ST_GeomFromText('POLYGON((
        -46.8900 -23.3450,
        -46.8350 -23.3450,
        -46.8350 -23.3000,
        -46.8900 -23.3000,
        -46.8900 -23.3450
    ))', 4326))
),
(
    'Anhanguera',
    'Cajamar',
    ST_Multi(ST_GeomFromText('POLYGON((
        -46.9200 -23.3950,
        -46.8500 -23.3950,
        -46.8500 -23.3450,
        -46.9200 -23.3450,
        -46.9200 -23.3950
    ))', 4326))
)
ON CONFLICT (nome_bairro, municipio) DO NOTHING;

-- 2. Inserir Estações de Monitoramento do Projeto (conforme apostila cap. 11)
INSERT INTO estacoes (nome_estacao, codigo_estacao, id_bairro, latitude, longitude, ativa)
VALUES
    ('Estação Anhanguera 01', 'EA01', (SELECT id_bairro FROM bairros WHERE nome_bairro = 'Anhanguera' LIMIT 1), -23.3560, -46.8760, TRUE),
    ('Estação Jordanésia 01', 'EJ01', (SELECT id_bairro FROM bairros WHERE nome_bairro = 'Jordanesia' LIMIT 1), -23.3300, -46.8650, TRUE),
    ('Estação Polvilho 01', 'EP01', (SELECT id_bairro FROM bairros WHERE nome_bairro = 'Polvilho' LIMIT 1), -23.4150, -46.8350, TRUE)
ON CONFLICT (codigo_estacao) DO UPDATE
SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, id_bairro = EXCLUDED.id_bairro;

-- Atualizar geometria da coluna localizacao a partir de longitude e latitude (conforme cap. 11)
UPDATE estacoes
SET localizacao = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE localizacao IS NULL;

-- 3. Inserir medições de teste (conforme capítulo 13 da apostila)
INSERT INTO medicoes_chuva (id_estacao, data_hora, precipitacao_mm, fonte_dado)
VALUES
    -- Anhanguera 01 (EA01)
    ((SELECT id_estacao FROM estacoes WHERE codigo_estacao = 'EA01'), '2026-10-25 08:00:00-03', 12.50, 'DADO_TESTE'),
    ((SELECT id_estacao FROM estacoes WHERE codigo_estacao = 'EA01'), '2026-10-25 09:00:00-03', 18.00, 'DADO_TESTE'),
    -- Jordanésia 01 (EJ01)
    ((SELECT id_estacao FROM estacoes WHERE codigo_estacao = 'EJ01'), '2026-10-25 08:00:00-03', 5.00, 'DADO_TESTE'),
    ((SELECT id_estacao FROM estacoes WHERE codigo_estacao = 'EJ01'), '2026-10-25 09:00:00-03', 22.00, 'DADO_TESTE'),
    -- Polvilho 01 (EP01)
    ((SELECT id_estacao FROM estacoes WHERE codigo_estacao = 'EP01'), '2026-10-25 08:00:00-03', 8.50, 'DADO_TESTE'),
    ((SELECT id_estacao FROM estacoes WHERE codigo_estacao = 'EP01'), '2026-10-25 09:00:00-03', 15.00, 'DADO_TESTE')
ON CONFLICT (id_estacao, data_hora) DO NOTHING;
