-- =====================================================================
-- Etapa 3 — proveniência das estações, coletas e ocorrências
--
-- Aditivo e idempotente. Não apaga dados, não renomeia colunas e não
-- transforma as estações de teste do backend legado em estações oficiais:
-- a exposição pública só acontece quando `fonte` existe e `validada = true`
-- (ver migration de RLS).
--
-- Medições legadas NÃO são rotuladas em massa como 'intervalo': o feed do
-- CEMADEN é acumulado de 24 h e um DEFAULT 'intervalo' criaria dados
-- semanticamente errados. O legado sem evidência fica NULL (desconhecido),
-- fora da API pública e fora de soma_chuva_intervalo, e é apenas contado
-- por um NOTICE para classificação manual posterior.
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

SET search_path = public, extensions;

-- DDL em tabelas em uso deve falhar rápido em vez de bloquear a aplicação.
-- Se o lock não vier em 10 s, o script inteiro é revertido e pode ser
-- reexecutado com segurança.
SET lock_timeout = '10s';

-- ---------------------------------------------------------------------
-- 1. ESTAÇÕES — proveniência e validação
-- ---------------------------------------------------------------------
ALTER TABLE public.estacoes
    ADD COLUMN IF NOT EXISTS fonte TEXT,
    ADD COLUMN IF NOT EXISTS fonte_id TEXT,
    ADD COLUMN IF NOT EXISTS municipio TEXT,
    ADD COLUMN IF NOT EXISTS uf CHAR(2),
    ADD COLUMN IF NOT EXISTS tipo_estacao TEXT,
    ADD COLUMN IF NOT EXISTS rede TEXT,
    ADD COLUMN IF NOT EXISTS status_fonte INTEGER,
    ADD COLUMN IF NOT EXISTS ultima_coleta_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS validada BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS metadados JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'estacoes_uf_formato'
          AND conrelid = 'public.estacoes'::regclass
    ) THEN
        ALTER TABLE public.estacoes
            ADD CONSTRAINT estacoes_uf_formato
            CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'estacoes_validada_exige_fonte'
          AND conrelid = 'public.estacoes'::regclass
    ) THEN
        ALTER TABLE public.estacoes
            ADD CONSTRAINT estacoes_validada_exige_fonte
            CHECK (validada IS FALSE OR fonte IS NOT NULL);
    END IF;
END;
$$;

COMMENT ON COLUMN public.estacoes.fonte IS
    'Rede/fonte oficial da estação (ex.: CEMADEN). NULL em dados legados de teste.';
COMMENT ON COLUMN public.estacoes.fonte_id IS
    'Identificador da estação na fonte externa, quando existir.';
COMMENT ON COLUMN public.estacoes.validada IS
    'Só estações com validação explícita do conector aparecem nas views públicas.';
COMMENT ON COLUMN public.estacoes.metadados IS
    'Metadados não pessoais da fonte (rede, tipo, códigos e status informado).';

-- O cliente nunca envia a coluna PostGIS; o conector envia latitude/longitude
-- e a trigger mantém a geometria coerente. A ordem é POINT(longitude latitude).
CREATE OR REPLACE FUNCTION public.sync_estacao_localizacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.localizacao := ST_SetSRID(
            ST_MakePoint(NEW.longitude, NEW.latitude),
            4326
        );
    ELSE
        NEW.localizacao := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estacoes_sync_localizacao ON public.estacoes;
CREATE TRIGGER trg_estacoes_sync_localizacao
BEFORE INSERT OR UPDATE OF latitude, longitude
ON public.estacoes
FOR EACH ROW
EXECUTE FUNCTION public.sync_estacao_localizacao();

-- ---------------------------------------------------------------------
-- 2. MEDIÇÕES — tipo explícito para nunca somar acumulado com intervalo
-- ---------------------------------------------------------------------
-- IMPORTANTE: `tipo_medicao` é intencionalmente NULLABLE e SEM DEFAULT.
--
-- O feed do CEMADEN (311_24) é acumulado de 24 h. Um DEFAULT 'intervalo'
-- rotularia errado todo o histórico legado e o trataria como chuva "do
-- período", que soma_chuva_intervalo poderia somar. Com NULL:
--   - o legado não classificado não aparece na API pública;
--   - não entra em soma_chuva_intervalo (que filtra 'intervalo');
--   - permanece intacto para classificação manual posterior.
-- Novos registros devem informar o tipo explicitamente no INSERT.
ALTER TABLE public.medicoes_chuva
    ADD COLUMN IF NOT EXISTS tipo_medicao TEXT,
    ADD COLUMN IF NOT EXISTS janela_horas SMALLINT,
    ADD COLUMN IF NOT EXISTS unidade TEXT NOT NULL DEFAULT 'mm',
    ADD COLUMN IF NOT EXISTS qualidade_dado TEXT,
    ADD COLUMN IF NOT EXISTS coletado_em TIMESTAMPTZ;

-- Defensivo: se uma versão anterior deste arquivo já tiver sido aplicada,
-- remove o DEFAULT perigoso e o NOT NULL. Não altera nenhuma linha.
ALTER TABLE public.medicoes_chuva
    ALTER COLUMN tipo_medicao DROP DEFAULT,
    ALTER COLUMN tipo_medicao DROP NOT NULL;

-- Classificação do legado SOMENTE quando o próprio dado traz evidência.
-- 1) Leituras horárias de teste/simulação do backend antigo.
UPDATE public.medicoes_chuva
   SET tipo_medicao = 'intervalo'
 WHERE tipo_medicao IS NULL
   AND fonte_dado IN ('DADO_TESTE', 'SIMULACAO_CHUVA_INTENSA');

-- 2) Registros explicitamente marcados como CEMADEN são acumulado de 24 h.
UPDATE public.medicoes_chuva
   SET tipo_medicao = 'acumulado_24h',
       janela_horas = COALESCE(janela_horas, 24)
 WHERE tipo_medicao IS NULL
   AND fonte_dado ILIKE '%CEMADEN%';

-- 3) Qualquer outra linha permanece NULL (desconhecida) e é apenas contada.
DO $$
DECLARE
    v_total BIGINT;
    v_sem_tipo BIGINT;
BEGIN
    SELECT count(*) INTO v_total FROM public.medicoes_chuva;
    SELECT count(*) INTO v_sem_tipo
      FROM public.medicoes_chuva
     WHERE tipo_medicao IS NULL;
    RAISE NOTICE
        'medicoes_chuva: % linha(s); % sem tipo_medicao (legado desconhecido, oculto da API pública).',
        v_total, v_sem_tipo;
END;
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medicoes_tipo_medicao_valido'
          AND conrelid = 'public.medicoes_chuva'::regclass
    ) THEN
        ALTER TABLE public.medicoes_chuva
            ADD CONSTRAINT medicoes_tipo_medicao_valido
            CHECK (
                tipo_medicao IS NULL
                OR tipo_medicao IN ('intervalo', 'acumulado_24h')
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medicoes_janela_valida'
          AND conrelid = 'public.medicoes_chuva'::regclass
    ) THEN
        ALTER TABLE public.medicoes_chuva
            ADD CONSTRAINT medicoes_janela_valida
            CHECK (janela_horas IS NULL OR janela_horas BETWEEN 1 AND 168);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medicoes_acumulado_exige_janela'
          AND conrelid = 'public.medicoes_chuva'::regclass
    ) THEN
        ALTER TABLE public.medicoes_chuva
            ADD CONSTRAINT medicoes_acumulado_exige_janela
            CHECK (
                tipo_medicao IS DISTINCT FROM 'acumulado_24h'
                OR (janela_horas IS NOT NULL AND janela_horas > 0)
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medicoes_unidade_valida'
          AND conrelid = 'public.medicoes_chuva'::regclass
    ) THEN
        ALTER TABLE public.medicoes_chuva
            ADD CONSTRAINT medicoes_unidade_valida
            CHECK (unidade = 'mm');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'medicoes_qualidade_valida'
          AND conrelid = 'public.medicoes_chuva'::regclass
    ) THEN
        ALTER TABLE public.medicoes_chuva
            ADD CONSTRAINT medicoes_qualidade_valida
            CHECK (
                qualidade_dado IS NULL
                OR qualidade_dado IN ('oficial', 'preliminar', 'suspeita')
            );
    END IF;
END;
$$;

COMMENT ON COLUMN public.medicoes_chuva.tipo_medicao IS
    'intervalo = chuva do período; acumulado_24h = acumulado informado pela fonte; NULL = legado não classificado. NULL nunca é somado nem exposto publicamente.';
COMMENT ON COLUMN public.medicoes_chuva.janela_horas IS
    'Janela do acumulado, em horas. O valor do CEMADEN em 311_24 é tratado como 24 h.';
COMMENT ON COLUMN public.medicoes_chuva.qualidade_dado IS
    'oficial, preliminar ou suspeita. NULL em dados legados sem proveniência.';
COMMENT ON COLUMN public.medicoes_chuva.coletado_em IS
    'Instante em que o conector recebeu o dado, separado do horário da fonte.';

-- ---------------------------------------------------------------------
-- 3. COLETAS DA FONTE — trilha de atualização e falhas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coletas_fonte (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    fonte TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    concluido_em TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'em_andamento',
    estacoes_recebidas INTEGER,
    estacoes_no_raio INTEGER,
    medicoes_gravadas INTEGER,
    medicoes_sem_leitura INTEGER,
    payload_atualizado_em TIMESTAMPTZ,
    duracao_ms INTEGER,
    mensagem_publica TEXT,
    erro_interno TEXT,
    metadados JSONB NOT NULL DEFAULT '{}'::jsonb,
    CHECK (status IN ('em_andamento', 'sucesso', 'parcial', 'erro')),
    CHECK (duracao_ms IS NULL OR duracao_ms >= 0),
    CHECK (estacoes_recebidas IS NULL OR estacoes_recebidas >= 0),
    CHECK (estacoes_no_raio IS NULL OR estacoes_no_raio >= 0),
    CHECK (medicoes_gravadas IS NULL OR medicoes_gravadas >= 0),
    CHECK (medicoes_sem_leitura IS NULL OR medicoes_sem_leitura >= 0)
);

COMMENT ON TABLE public.coletas_fonte IS
    'Auditoria não pessoal de cada sincronização. A view pública expõe apenas status, horários e contagens.';
COMMENT ON COLUMN public.coletas_fonte.erro_interno IS
    'Diagnóstico interno; não é exposto em vw_coletas_publicas.';
COMMENT ON COLUMN public.coletas_fonte.mensagem_publica IS
    'Mensagem curta e sem segredos para a interface.';

-- ---------------------------------------------------------------------
-- 4. OCORRÊNCIAS — estrutura preparada para a Etapa 4
-- ---------------------------------------------------------------------
-- A tabela é criada agora porque a camada pública precisa de uma fonte
-- curada. Não há política de INSERT pública: o envio de ocorrências entra
-- na Etapa 4, com moderação. Nenhuma linha fictícia é inserida aqui.
CREATE TABLE IF NOT EXISTS public.ocorrencias (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo TEXT NOT NULL,
    descricao TEXT,
    bairro TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    localizacao GEOMETRY(POINT, 4326),
    status TEXT NOT NULL DEFAULT 'pendente',
    publica BOOLEAN NOT NULL DEFAULT FALSE,
    fonte TEXT NOT NULL DEFAULT 'registro_comunitario',
    verificado_em TIMESTAMPTZ,
    verificado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (tipo IN ('alagamento', 'transbordamento', 'deslizamento', 'outro')),
    CHECK (status IN ('pendente', 'verificada', 'rejeitada')),
    CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
    CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
    CHECK (descricao IS NULL OR char_length(descricao) <= 1000)
);

COMMENT ON TABLE public.ocorrencias IS
    'Ocorrências comunitárias. Somente status=verificada e publica=true aparecem na camada pública; dados pessoais nunca são expostos.';
COMMENT ON COLUMN public.ocorrencias.publica IS
    'Curadoria explícita: o registro só entra na camada pública após verificação e autorização.';

CREATE OR REPLACE FUNCTION public.sync_ocorrencia_localizacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.localizacao := ST_SetSRID(
            ST_MakePoint(NEW.longitude, NEW.latitude),
            4326
        );
    ELSE
        NEW.localizacao := NULL;
    END IF;
    NEW.atualizado_em := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ocorrencias_sync_localizacao ON public.ocorrencias;
CREATE TRIGGER trg_ocorrencias_sync_localizacao
BEFORE INSERT OR UPDATE OF latitude, longitude
ON public.ocorrencias
FOR EACH ROW
EXECUTE FUNCTION public.sync_ocorrencia_localizacao();

-- ---------------------------------------------------------------------
-- 5. ÍNDICES
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_estacoes_fonte_id
    ON public.estacoes (fonte, fonte_id)
    WHERE fonte IS NOT NULL AND fonte_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estacoes_fonte_validada
    ON public.estacoes (fonte, validada);

CREATE INDEX IF NOT EXISTS idx_medicoes_estacao_tipo_data
    ON public.medicoes_chuva (id_estacao, tipo_medicao, data_hora DESC);

CREATE INDEX IF NOT EXISTS idx_coletas_fonte_iniciado
    ON public.coletas_fonte (fonte, iniciado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_status_publica
    ON public.ocorrencias (status, publica, criado_em DESC);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_localizacao
    ON public.ocorrencias USING GIST (localizacao);

-- Funções de trigger não são RPC.
REVOKE ALL ON FUNCTION public.sync_estacao_localizacao()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_ocorrencia_localizacao()
    FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
