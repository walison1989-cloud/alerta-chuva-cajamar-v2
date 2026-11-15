-- =====================================================================
-- Etapa 2 — Supabase Auth, moradores e endereços
--
-- Aditivo: cria usuários vinculados a auth.users, um endereço por morador,
-- histórico imutável de versões e validações/índices espaciais.
-- Não remove tabelas, colunas ou dados existentes.
-- =====================================================================

-- Mantém as extensões fora do schema exposto pelo PostgREST.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

SET search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. USUÁRIOS (perfil público mínimo do morador)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL DEFAULT '',
    nome TEXT NOT NULL DEFAULT '',
    telefone TEXT,
    papel TEXT NOT NULL DEFAULT 'morador',
    consentimento_lgpd BOOLEAN NOT NULL DEFAULT FALSE,
    consentimento_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT usuarios_papel_valido CHECK (papel IN ('morador', 'admin')),
    CONSTRAINT usuarios_nome_tamanho CHECK (char_length(nome) <= 150),
    CONSTRAINT usuarios_telefone_tamanho CHECK (telefone IS NULL OR char_length(telefone) <= 30),
    CONSTRAINT usuarios_consentimento_coerente CHECK (
        consentimento_lgpd = FALSE OR consentimento_em IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON public.usuarios (lower(email));

-- ---------------------------------------------------------------------
-- 2. ENDEREÇOS (um endereço principal por morador)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.enderecos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE CASCADE,
    cep VARCHAR(8) NOT NULL,
    logradouro VARCHAR(255) NOT NULL,
    numero VARCHAR(30) NOT NULL,
    bairro VARCHAR(120) NOT NULL,
    complemento VARCHAR(120),
    municipio VARCHAR(120) NOT NULL DEFAULT 'Cajamar',
    uf CHAR(2) NOT NULL DEFAULT 'SP',
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    localizacao GEOMETRY(POINT, 4326),
    precisao VARCHAR(24) NOT NULL DEFAULT 'ajustado_manual',
    geocoding_fonte VARCHAR(100),
    geocoding_label TEXT,
    consentimento_lgpd BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT enderecos_cep_formato CHECK (cep ~ '^[0-9]{8}$'),
    CONSTRAINT enderecos_uf_formato CHECK (uf ~ '^[A-Z]{2}$'),
    CONSTRAINT enderecos_latitude_valida CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT enderecos_longitude_valida CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT enderecos_precisao_valida CHECK (precisao IN ('geocodificado', 'ajustado_manual')),
    CONSTRAINT enderecos_consentimento_obrigatorio CHECK (consentimento_lgpd IS TRUE),
    CONSTRAINT enderecos_campos_obrigatorios CHECK (
        char_length(btrim(logradouro)) >= 2
        AND char_length(btrim(numero)) >= 1
        AND char_length(btrim(bairro)) >= 2
        AND char_length(btrim(municipio)) >= 2
    )
);

CREATE INDEX IF NOT EXISTS idx_enderecos_localizacao
    ON public.enderecos USING GIST (localizacao);

CREATE INDEX IF NOT EXISTS idx_enderecos_municipio_bairro
    ON public.enderecos (municipio, bairro);

-- ---------------------------------------------------------------------
-- 3. VERSÕES DO ENDEREÇO (histórico imutável, preenchido por trigger)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.versoes_endereco (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endereco_id UUID NOT NULL REFERENCES public.enderecos(id) ON DELETE CASCADE,
    usuario_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
    operacao VARCHAR(10) NOT NULL,
    cep VARCHAR(8),
    logradouro VARCHAR(255),
    numero VARCHAR(30),
    bairro VARCHAR(120),
    complemento VARCHAR(120),
    municipio VARCHAR(120),
    uf CHAR(2),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    localizacao GEOMETRY(POINT, 4326),
    precisao VARCHAR(24),
    geocoding_fonte VARCHAR(100),
    consentimento_lgpd BOOLEAN,
    alterado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    alterado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    CONSTRAINT versoes_operacao_valida CHECK (operacao IN ('INSERT', 'UPDATE'))
);

CREATE INDEX IF NOT EXISTS idx_versoes_endereco_endereco
    ON public.versoes_endereco (endereco_id, alterado_em DESC);

CREATE INDEX IF NOT EXISTS idx_versoes_endereco_usuario
    ON public.versoes_endereco (usuario_id, alterado_em DESC);

-- ---------------------------------------------------------------------
-- 4. VÍNCULO OPCIONAL COM A TABELA LEGADA DE CONTATOS
-- ---------------------------------------------------------------------
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contatos_usuario
    ON public.contatos_alerta (usuario_id);

-- ---------------------------------------------------------------------
-- 5. FUNÇÕES E TRIGGERS
-- ---------------------------------------------------------------------

-- Sincroniza o ponto PostGIS e o updated_at a partir de latitude/longitude.
CREATE OR REPLACE FUNCTION public.sync_endereco_localizacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
    IF NEW.latitude IS NULL OR NEW.longitude IS NULL THEN
        NEW.localizacao := NULL;
    ELSE
        NEW.localizacao := ST_SetSRID(
            ST_MakePoint(NEW.longitude, NEW.latitude),
            4326
        );
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enderecos_sync ON public.enderecos;
CREATE TRIGGER trg_enderecos_sync
BEFORE INSERT OR UPDATE ON public.enderecos
FOR EACH ROW
EXECUTE FUNCTION public.sync_endereco_localizacao();

-- Registra uma versão a cada criação/atualização de endereço.
CREATE OR REPLACE FUNCTION public.versionar_endereco()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.versoes_endereco (
        endereco_id,
        usuario_id,
        operacao,
        cep,
        logradouro,
        numero,
        bairro,
        complemento,
        municipio,
        uf,
        latitude,
        longitude,
        localizacao,
        precisao,
        geocoding_fonte,
        consentimento_lgpd,
        alterado_em,
        alterado_por
    ) VALUES (
        NEW.id,
        NEW.usuario_id,
        TG_OP,
        NEW.cep,
        NEW.logradouro,
        NEW.numero,
        NEW.bairro,
        NEW.complemento,
        NEW.municipio,
        NEW.uf,
        NEW.latitude,
        NEW.longitude,
        NEW.localizacao,
        NEW.precisao,
        NEW.geocoding_fonte,
        NEW.consentimento_lgpd,
        now(),
        auth.uid()
    );

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enderecos_versionar ON public.enderecos;
CREATE TRIGGER trg_enderecos_versionar
AFTER INSERT OR UPDATE ON public.enderecos
FOR EACH ROW
EXECUTE FUNCTION public.versionar_endereco();

-- Protege campos que o morador não pode alterar diretamente.
CREATE OR REPLACE FUNCTION public.proteger_campos_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- service_role e conexões administrativas diretas podem sincronizar
    -- campos internos. O cliente autenticado via PostgREST não passa aqui.
    IF auth.role() = 'service_role'
       OR current_user IN ('postgres', 'supabase_admin') THEN
        NEW.updated_at := now();
        RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.papel IS DISTINCT FROM OLD.papel
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Campos protegidos do usuário não podem ser alterados pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    -- A data do consentimento é derivada da transição, nunca aceita do
    -- cliente. Assim o morador não consegue retroagir nem forjar a auditoria.
    IF NEW.consentimento_lgpd IS DISTINCT FROM OLD.consentimento_lgpd THEN
        NEW.consentimento_em := CASE
            WHEN NEW.consentimento_lgpd THEN now()
            ELSE NULL
        END;
    ELSE
        NEW.consentimento_em := OLD.consentimento_em;
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_usuarios_proteger ON public.usuarios;
CREATE TRIGGER trg_usuarios_proteger
BEFORE UPDATE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION public.proteger_campos_usuario();

-- Cria o perfil do morador quando o Supabase Auth cria auth.users.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    consentimento BOOLEAN;
    nome_meta TEXT;
BEGIN
    consentimento := COALESCE(
        (NEW.raw_user_meta_data ->> 'consentimento_lgpd')::BOOLEAN,
        FALSE
    );
    nome_meta := COALESCE(NEW.raw_user_meta_data ->> 'nome', '');

    INSERT INTO public.usuarios (
        id,
        email,
        nome,
        consentimento_lgpd,
        consentimento_em
    ) VALUES (
        NEW.id,
        COALESCE(NEW.email, ''),
        btrim(nome_meta),
        consentimento,
        CASE WHEN consentimento THEN now() ELSE NULL END
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        nome = COALESCE(NULLIF(EXCLUDED.nome, ''), public.usuarios.nome),
        updated_at = now();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Mantém o e-mail do perfil sincronizado quando o Auth altera o e-mail.
CREATE OR REPLACE FUNCTION public.sync_usuario_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE public.usuarios
    SET email = COALESCE(NEW.email, ''),
        updated_at = now()
    WHERE id = NEW.id;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
WHEN (OLD.email IS DISTINCT FROM NEW.email)
EXECUTE FUNCTION public.sync_usuario_email();

-- Preenche perfis para usuários criados antes desta migration.
INSERT INTO public.usuarios (id, email, nome, created_at)
SELECT
    u.id,
    COALESCE(u.email, ''),
    btrim(COALESCE(u.raw_user_meta_data ->> 'nome', '')),
    COALESCE(u.created_at, now())
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

-- Recarrega o cache de schema do PostgREST.
NOTIFY pgrst, 'reload schema';
