-- =====================================================================
-- Etapa 6 — Cadastro de contatos do morador (Fase 2)
--
-- Adiciona colunas à tabela existente `contatos_alerta` para suportar:
--   - celular brasileiro com DDD (normalizado, validado)
--   - e-mail com confirmação
--   - preferências independentes por canal (interno, e-mail, SMS)
--   - consentimento explícito, revogável e auditável (versão + data)
--   - controle de duplicidade (mesmo telefone/e-mail por usuário)
--   - associação ao endereço cadastrado do morador (FK para enderecos.id)
--     com validação de que o endereço pertence ao mesmo usuário
--   - proteção de verificado_em / revogado_em / data_cadastro /
--     usuario_id / id_contato contra manipulação pelo cliente
--   - auditoria de revogação de consentimento
--   - canais externos (e-mail/SMS) só ativos quando o contato verificado
--
-- Compatibilidade:
--   * A tabela legada usa `id_contato` (identity), `id_bairro`, `nome`,
--     `telefone`, `email`, `ativo`, `consentimento`, `data_cadastro`.
--   * `usuario_id` foi adicionado pela Etapa 2 e permanece anulável para
--     registros legados sem morador vinculado.
--   * A migration é aditiva e idempotente: pode ser reaplicada em um banco
--     que já a recebeu.
--
-- Não recria nem remove tabelas existentes. Não altera o motor
-- experimental, nem a coleta Cemaden, nem as 307 áreas oficiais.
-- Não executa no banco hospedado sem autorização explícita.
-- =====================================================================

SET search_path = public, extensions;

-- ---------------------------------------------------------------------
-- 1. COLUNAS NOVAS (antes de qualquer UPDATE de normalização)
-- ---------------------------------------------------------------------

-- Tipo do contato: celular, e-mail ou outro.
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS tipo_contato VARCHAR(20);

-- Referência ao endereço cadastrado do morador (evita cópia desatualizada).
-- É NULL quando o contato não está vinculado a um endereço específico.
-- O pertencimento ao usuário é validado por trigger (abaixo).
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS endereco_id UUID;

-- Data/hora em que o contato foi verificado (nulo = não verificado).
-- Só pode ser preenchido por processo confiável (service_role), nunca pelo
-- cliente autenticado.
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS verificado_em TIMESTAMPTZ;

-- Versão do texto de consentimento aceito pelo morador.
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS versao_consentimento VARCHAR(20) DEFAULT '1.0';

-- Data/hora em que o consentimento foi revogado (nulo = ativo).
-- Preenchida pelo servidor na transição TRUE -> FALSE.
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS revogado_em TIMESTAMPTZ;

-- Preferências independentes de recebimento por canal.
-- Padrão: todas desativadas. O morador escolhe explicitamente.
ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS canal_interno BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS canal_email BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.contatos_alerta
    ADD COLUMN IF NOT EXISTS canal_sms BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- 2. NORMALIZAÇÃO DOS REGISTROS LEGADOS
-- ---------------------------------------------------------------------
-- Executada somente depois que as colunas existem. Não altera dados que já
-- estejam coerentes.

-- Versões vazias não são versões válidas.
UPDATE public.contatos_alerta
SET versao_consentimento = NULL
WHERE versao_consentimento IS NOT NULL
  AND btrim(versao_consentimento) = '';

-- Todo consentimento ativo precisa de uma versão auditável.
UPDATE public.contatos_alerta
SET versao_consentimento = '1.0'
WHERE consentimento = TRUE
  AND versao_consentimento IS NULL;

-- Sem consentimento, nenhum canal pode permanecer ativo.
UPDATE public.contatos_alerta
SET canal_interno = FALSE,
    canal_email = FALSE,
    canal_sms = FALSE
WHERE consentimento IS NOT TRUE
  AND (canal_interno OR canal_email OR canal_sms);

-- Canais externos exigem contato verificado. Registros legados (sem
-- verificação) permanecem com canais externos desligados.
UPDATE public.contatos_alerta
SET canal_email = FALSE,
    canal_sms = FALSE
WHERE verificado_em IS NULL
  AND (canal_email OR canal_sms);

-- ---------------------------------------------------------------------
-- 3. CHAVE ESTRANGEIRA PARA enderecos
-- ---------------------------------------------------------------------
-- FK simples para enderecos.id. O pertencimento ao mesmo usuário é
-- validado pela trigger `validar_contato_endereco_mesmo_usuario`.
-- A criação é idempotente para permitir reaplicação da migration.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_contatos_endereco_id'
          AND conrelid = 'public.contatos_alerta'::regclass
    ) THEN
        ALTER TABLE public.contatos_alerta
            ADD CONSTRAINT fk_contatos_endereco_id
            FOREIGN KEY (endereco_id) REFERENCES public.enderecos(id)
            ON DELETE SET NULL
            NOT VALID;
    END IF;
END;
$$;

-- ---------------------------------------------------------------------
-- 4. CONSTRAINTS DE VALIDAÇÃO
-- ---------------------------------------------------------------------
-- Helper temporário: ADD CONSTRAINT não aceita IF NOT EXISTS, portanto
-- checamos pg_constraint para manter a migration reaplicável.
CREATE OR REPLACE FUNCTION pg_temp.adicionar_constraint_se_ausente(
    p_nome TEXT,
    p_definicao TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = p_nome
          AND conrelid = 'public.contatos_alerta'::regclass
    ) THEN
        EXECUTE format(
            'ALTER TABLE public.contatos_alerta ADD CONSTRAINT %I %s',
            p_nome,
            p_definicao
        );
    END IF;
END;
$$;

-- Tipo de contato deve ser um dos valores permitidos, quando preenchido.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_tipo_contato_valido',
    $check$CHECK (tipo_contato IS NULL OR tipo_contato IN ('celular', 'email', 'outro')) NOT VALID$check$
);

-- Celular: quando tipo_contato = 'celular', telefone é obrigatório e deve
-- conter DDD + número (10 ou 11 dígitos, apenas números).
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_celular_obrigatorio_quando_tipo_celular',
    $check$CHECK (
        tipo_contato IS DISTINCT FROM 'celular'
        OR (
            telefone IS NOT NULL
            AND telefone ~ '^[0-9]{10,11}$'
        )
    ) NOT VALID$check$
);

-- E-mail: quando tipo_contato = 'email', e-mail é obrigatório e deve ter
-- formato mínimo válido.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_email_obrigatorio_quando_tipo_email',
    $check$CHECK (
        tipo_contato IS DISTINCT FROM 'email'
        OR (
            email IS NOT NULL
            AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
        )
    ) NOT VALID$check$
);

-- Pelo menos um meio de contato deve estar preenchido.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_pelo_menos_um_meio',
    $check$CHECK (telefone IS NOT NULL OR email IS NOT NULL) NOT VALID$check$
);

-- Consentimento coerente: se verdadeiro, deve ter versão.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_consentimento_coerente',
    $check$CHECK (
        consentimento = FALSE
        OR versao_consentimento IS NOT NULL
    ) NOT VALID$check$
);

-- Se consentimento é falso, nenhum canal pode estar ativo.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_sem_consentimento_sem_canais',
    $check$CHECK (
        consentimento = TRUE
        OR (
            canal_interno = FALSE
            AND canal_email = FALSE
            AND canal_sms = FALSE
        )
    ) NOT VALID$check$
);

-- Canais externos só podem estar ativos se o contato estiver verificado.
-- A implicação é escrita de forma explícita: NÃO (e-mail ou SMS) OU
-- verificado. O operador `=>` não existe em PostgreSQL.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_canais_somente_se_verificado',
    $check$CHECK (
        NOT (canal_email OR canal_sms)
        OR verificado_em IS NOT NULL
    ) NOT VALID$check$
);

-- Versão do consentimento não pode ser vazia quando preenchida.
SELECT pg_temp.adicionar_constraint_se_ausente(
    'contatos_versao_consentimento_nao_vazia',
    $check$CHECK (
        versao_consentimento IS NULL
        OR char_length(btrim(versao_consentimento)) > 0
    ) NOT VALID$check$
);

-- Valida as constraints contra os dados existentes após a normalização.
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_tipo_contato_valido;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_celular_obrigatorio_quando_tipo_celular;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_email_obrigatorio_quando_tipo_email;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_pelo_menos_um_meio;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_consentimento_coerente;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_sem_consentimento_sem_canais;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_canais_somente_se_verificado;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT contatos_versao_consentimento_nao_vazia;
ALTER TABLE public.contatos_alerta
    VALIDATE CONSTRAINT fk_contatos_endereco_id;

-- ---------------------------------------------------------------------
-- 5. ÍNDICES
-- ---------------------------------------------------------------------

-- Busca rápida dos contatos do próprio usuário.
CREATE INDEX IF NOT EXISTS idx_contatos_usuario_tipo
    ON public.contatos_alerta (usuario_id, tipo_contato);

-- Evita duplicidade de mesmo telefone para o mesmo usuário.
CREATE UNIQUE INDEX IF NOT EXISTS ux_contatos_usuario_telefone
    ON public.contatos_alerta (usuario_id, telefone)
    WHERE telefone IS NOT NULL;

-- Evita duplicidade de mesmo e-mail para o mesmo usuário (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS ux_contatos_usuario_email
    ON public.contatos_alerta (usuario_id, lower(email))
    WHERE email IS NOT NULL;

-- Consulta por contatos não verificados (fluxo de confirmação futura).
CREATE INDEX IF NOT EXISTS idx_contatos_nao_verificados
    ON public.contatos_alerta (usuario_id, verificado_em)
    WHERE verificado_em IS NULL;

-- Consulta por contatos com consentimento ativo (notificações).
CREATE INDEX IF NOT EXISTS idx_contatos_consentimento_ativo
    ON public.contatos_alerta (usuario_id, consentimento, revogado_em)
    WHERE consentimento = TRUE AND revogado_em IS NULL;

-- Índice na FK para endereços.
CREATE INDEX IF NOT EXISTS idx_contatos_endereco_id
    ON public.contatos_alerta (endereco_id);

-- Consulta de contatos verificados por canal externo.
CREATE INDEX IF NOT EXISTS idx_contatos_verificados_canal
    ON public.contatos_alerta (canal_email, canal_sms, verificado_em)
    WHERE verificado_em IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6. TRIGGERS DE SEGURANÇA
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 6.1 Endereço só pode referenciar endereço do mesmo usuário
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validar_contato_endereco_mesmo_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_endereco_usuario_id UUID;
BEGIN
    -- Sem vínculo de endereço, nada a validar (compatibilidade legada).
    IF NEW.endereco_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Um contato vinculado a endereço precisa de proprietário para que o
    -- vínculo possa ser verificado. Não aceitamos endereço "órfão".
    IF NEW.usuario_id IS NULL THEN
        RAISE EXCEPTION
            'Contato com endereco_id exige usuario_id preenchido.'
            USING ERRCODE = '23502';
    END IF;

    SELECT e.usuario_id
    INTO v_endereco_usuario_id
    FROM public.enderecos AS e
    WHERE e.id = NEW.endereco_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Endereço referenciado não existe.'
            USING ERRCODE = '23503';
    END IF;

    -- O endereço deve pertencer ao mesmo usuário do contato. Isso vale
    -- também quando apenas o proprietário muda em um UPDATE.
    IF v_endereco_usuario_id IS DISTINCT FROM NEW.usuario_id THEN
        RAISE EXCEPTION
            'O endereço referenciado não pertence ao mesmo usuário do contato.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contatos_validar_endereco_insert
    ON public.contatos_alerta;
CREATE TRIGGER trg_contatos_validar_endereco_insert
BEFORE INSERT ON public.contatos_alerta
FOR EACH ROW
EXECUTE FUNCTION public.validar_contato_endereco_mesmo_usuario();

DROP TRIGGER IF EXISTS trg_contatos_validar_endereco_update
    ON public.contatos_alerta;
CREATE TRIGGER trg_contatos_validar_endereco_update
BEFORE UPDATE ON public.contatos_alerta
FOR EACH ROW
EXECUTE FUNCTION public.validar_contato_endereco_mesmo_usuario();

REVOKE EXECUTE ON FUNCTION public.validar_contato_endereco_mesmo_usuario()
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6.2 Proteção de campos sensíveis — INSERT
-- ---------------------------------------------------------------------
-- Em INSERT não existe OLD. Regras específicas:
--   * cliente não define verificado_em / revogado_em;
--   * data_cadastro é sempre do servidor;
--   * id_contato é gerado pela identity (GENERATED ALWAYS) e não pode ser
--     informado pelo cliente.
CREATE OR REPLACE FUNCTION public.proteger_contato_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    -- service_role e conexões administrativas podem criar contatos já
    -- verificados (ex.: importação/Edge Function confiável).
    IF auth.role() = 'service_role'
       OR current_user IN ('postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF NEW.verificado_em IS NOT NULL THEN
        RAISE EXCEPTION
            'O campo verificado_em não pode ser definido pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.revogado_em IS NOT NULL THEN
        RAISE EXCEPTION
            'O campo revogado_em não pode ser definido pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    NEW.data_cadastro := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contatos_proteger_insert
    ON public.contatos_alerta;
CREATE TRIGGER trg_contatos_proteger_insert
BEFORE INSERT ON public.contatos_alerta
FOR EACH ROW
EXECUTE FUNCTION public.proteger_contato_insert();

REVOKE EXECUTE ON FUNCTION public.proteger_contato_insert()
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 6.3 Proteção de campos sensíveis — UPDATE
-- ---------------------------------------------------------------------
-- Em UPDATE:
--   * cliente não altera verificado_em, revogado_em, usuario_id,
--     id_contato nem data_cadastro;
--   * a revogação (TRUE -> FALSE) preenche revogado_em = now();
--   * o novo consentimento (FALSE -> TRUE) limpa revogado_em.
CREATE OR REPLACE FUNCTION public.proteger_contato_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF auth.role() = 'service_role'
       OR current_user IN ('postgres', 'supabase_admin') THEN
        RETURN NEW;
    END IF;

    IF NEW.verificado_em IS DISTINCT FROM OLD.verificado_em THEN
        RAISE EXCEPTION
            'O campo verificado_em não pode ser alterado pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.revogado_em IS DISTINCT FROM OLD.revogado_em THEN
        RAISE EXCEPTION
            'O campo revogado_em não pode ser definido pelo cliente.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.usuario_id IS DISTINCT FROM OLD.usuario_id THEN
        RAISE EXCEPTION
            'O campo usuario_id não pode ser alterado.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.id_contato IS DISTINCT FROM OLD.id_contato THEN
        RAISE EXCEPTION
            'O campo id_contato não pode ser alterado.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.data_cadastro IS DISTINCT FROM OLD.data_cadastro THEN
        RAISE EXCEPTION
            'O campo data_cadastro não pode ser alterado.'
            USING ERRCODE = '42501';
    END IF;

    -- Auditoria derivada da transição de consentimento, nunca aceita do
    -- cliente. O cliente não pode forjar revogado_em (checado acima).
    IF NEW.consentimento = TRUE AND OLD.consentimento IS NOT TRUE THEN
        NEW.revogado_em := NULL;
    ELSIF NEW.consentimento IS NOT TRUE AND OLD.consentimento = TRUE THEN
        NEW.revogado_em := now();
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contatos_proteger_update
    ON public.contatos_alerta;
CREATE TRIGGER trg_contatos_proteger_update
BEFORE UPDATE ON public.contatos_alerta
FOR EACH ROW
EXECUTE FUNCTION public.proteger_contato_update();

REVOKE EXECUTE ON FUNCTION public.proteger_contato_update()
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. RLS E GRANTS (preserva o isolamento da Etapa 2)
-- ---------------------------------------------------------------------

ALTER TABLE public.contatos_alerta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contatos_select_proprio ON public.contatos_alerta;
CREATE POLICY contatos_select_proprio
ON public.contatos_alerta
FOR SELECT
TO authenticated
USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS contatos_insert_proprio ON public.contatos_alerta;
CREATE POLICY contatos_insert_proprio
ON public.contatos_alerta
FOR INSERT
TO authenticated
WITH CHECK (
    usuario_id = auth.uid()
    AND (
        consentimento = FALSE
        OR versao_consentimento IS NOT NULL
    )
);

DROP POLICY IF EXISTS contatos_update_proprio ON public.contatos_alerta;
CREATE POLICY contatos_update_proprio
ON public.contatos_alerta
FOR UPDATE
TO authenticated
USING (usuario_id = auth.uid())
WITH CHECK (
    usuario_id = auth.uid()
    AND (
        consentimento = FALSE
        OR versao_consentimento IS NOT NULL
    )
);

DROP POLICY IF EXISTS contatos_delete_proprio ON public.contatos_alerta;
CREATE POLICY contatos_delete_proprio
ON public.contatos_alerta
FOR DELETE
TO authenticated
USING (usuario_id = auth.uid());

-- anon não tem acesso direto à tabela (contém PII).
REVOKE ALL ON public.contatos_alerta FROM anon;
REVOKE ALL ON public.contatos_alerta FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos_alerta TO authenticated;

-- ---------------------------------------------------------------------
-- 8. DOCUMENTAÇÃO DO SCHEMA
-- ---------------------------------------------------------------------

COMMENT ON TABLE public.contatos_alerta IS
    'Contatos do morador para notificações preventivas. Contém PII: RLS restringe ao próprio usuário. Colunas da Etapa 6: tipo_contato, endereco_id (FK para enderecos com validação de mesmo usuário), verificado_em (protegido contra cliente), versao_consentimento, revogado_em (auditoria), canal_interno, canal_email, canal_sms (padrão: false; externos só ativos se verificado).';
COMMENT ON COLUMN public.contatos_alerta.tipo_contato IS
    'Tipo do meio de contato: celular, email ou outro.';
COMMENT ON COLUMN public.contatos_alerta.endereco_id IS
    'Referência ao endereço cadastrado do morador (public.enderecos.id). Trigger garante que pertence ao mesmo usuario_id. NULL quando não vinculado.';
COMMENT ON COLUMN public.contatos_alerta.verificado_em IS
    'Data/hora da verificação do contato. Nulo = não verificado. Só pode ser preenchido por service_role (processo confiável).';
COMMENT ON COLUMN public.contatos_alerta.versao_consentimento IS
    'Versão do texto de consentimento aceito pelo morador.';
COMMENT ON COLUMN public.contatos_alerta.revogado_em IS
    'Data/hora em que o consentimento foi revogado. Nulo = consentimento ativo. Preenchido pelo servidor na transição TRUE -> FALSE.';
COMMENT ON COLUMN public.contatos_alerta.canal_interno IS
    'Preferência de recebimento de notificações internas no app. Padrão: false.';
COMMENT ON COLUMN public.contatos_alerta.canal_email IS
    'Preferência de recebimento de notificações por e-mail. Padrão: false. Só ativo se verificado_em IS NOT NULL.';
COMMENT ON COLUMN public.contatos_alerta.canal_sms IS
    'Preferência de recebimento de notificações por SMS. Padrão: false. Só ativo se verificado_em IS NOT NULL.';

NOTIFY pgrst, 'reload schema';
