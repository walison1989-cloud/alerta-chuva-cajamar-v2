-- =====================================================================
-- Etapa 2 — RLS, grants e isolamento de dados pessoais
--
-- Princípio: negar por padrão.
-- - Morador lê/edita somente o próprio perfil e o próprio endereço.
-- - Histórico é somente leitura para o morador; quem escreve é a trigger.
-- - Tabelas legadas (bairros, estações, medições, alertas) ficam sem
--   políticas públicas nesta etapa para não expor dados de teste como se
--   fossem oficiais. A Etapa 3 adicionará views/políticas curadas.
-- - contatos_alerta contém PII e não é acessível por anon.
-- =====================================================================

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enderecos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.versoes_endereco ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos_alerta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bairros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.estacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicoes_chuva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- USUÁRIOS
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS usuarios_select_proprio ON public.usuarios;
CREATE POLICY usuarios_select_proprio
ON public.usuarios
FOR SELECT
TO authenticated
USING (id = auth.uid());

DROP POLICY IF EXISTS usuarios_update_proprio ON public.usuarios;
CREATE POLICY usuarios_update_proprio
ON public.usuarios
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- Sem política de INSERT: o perfil é criado pela trigger handle_new_user().
-- Sem política de DELETE: a exclusão da conta ocorre via Auth/Edge Function.

-- ---------------------------------------------------------------------
-- ENDEREÇOS
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS enderecos_select_proprio ON public.enderecos;
CREATE POLICY enderecos_select_proprio
ON public.enderecos
FOR SELECT
TO authenticated
USING (usuario_id = auth.uid());

DROP POLICY IF EXISTS enderecos_insert_proprio ON public.enderecos;
CREATE POLICY enderecos_insert_proprio
ON public.enderecos
FOR INSERT
TO authenticated
WITH CHECK (
    usuario_id = auth.uid()
    AND consentimento_lgpd IS TRUE
);

DROP POLICY IF EXISTS enderecos_update_proprio ON public.enderecos;
CREATE POLICY enderecos_update_proprio
ON public.enderecos
FOR UPDATE
TO authenticated
USING (usuario_id = auth.uid())
WITH CHECK (
    usuario_id = auth.uid()
    AND consentimento_lgpd IS TRUE
);

DROP POLICY IF EXISTS enderecos_delete_proprio ON public.enderecos;
CREATE POLICY enderecos_delete_proprio
ON public.enderecos
FOR DELETE
TO authenticated
USING (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- VERSÕES DO ENDEREÇO
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS versoes_select_proprio ON public.versoes_endereco;
CREATE POLICY versoes_select_proprio
ON public.versoes_endereco
FOR SELECT
TO authenticated
USING (usuario_id = auth.uid());

-- Sem INSERT/UPDATE/DELETE para clientes: a trigger SECURITY DEFINER grava
-- o histórico e ele deve permanecer imutável para o morador.

-- ---------------------------------------------------------------------
-- CONTATOS DE ALERTA (legado com PII)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS contatos_select_proprio ON public.contatos_alerta;
CREATE POLICY contatos_select_proprio
ON public.contatos_alerta
FOR SELECT
TO authenticated
USING (usuario_id = auth.uid());

-- ---------------------------------------------------------------------
-- GRANTS
-- ---------------------------------------------------------------------
REVOKE ALL ON public.usuarios FROM anon;
REVOKE ALL ON public.enderecos FROM anon;
REVOKE ALL ON public.versoes_endereco FROM anon;
REVOKE ALL ON public.contatos_alerta FROM anon;

REVOKE ALL ON public.usuarios FROM authenticated;
REVOKE ALL ON public.enderecos FROM authenticated;
REVOKE ALL ON public.versoes_endereco FROM authenticated;
REVOKE ALL ON public.contatos_alerta FROM authenticated;

GRANT SELECT, UPDATE ON public.usuarios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.enderecos TO authenticated;
GRANT SELECT ON public.versoes_endereco TO authenticated;
GRANT SELECT ON public.contatos_alerta TO authenticated;

-- Tabelas legadas sem acesso público até curadoria da Etapa 3.
REVOKE ALL ON public.bairros FROM anon, authenticated;
REVOKE ALL ON public.estacoes FROM anon, authenticated;
REVOKE ALL ON public.medicoes_chuva FROM anon, authenticated;
REVOKE ALL ON public.alertas FROM anon, authenticated;

-- Funções de trigger não são RPC. O PostgREST expõe funções do schema
-- público; retirar EXECUTE de PUBLIC evita uma superfície desnecessária.
REVOKE EXECUTE ON FUNCTION public.sync_endereco_localizacao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.versionar_endereco() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.proteger_campos_usuario() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_usuario_email() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.usuarios IS
    'Perfil do morador vinculado 1:1 a auth.users. RLS: leitura/edição apenas do próprio registro.';
COMMENT ON TABLE public.enderecos IS
    'Endereço principal do morador com ponto PostGIS SRID 4326. RLS: somente o proprietário.';
COMMENT ON TABLE public.versoes_endereco IS
    'Histórico imutável de endereços, preenchido por trigger SECURITY DEFINER.';
COMMENT ON COLUMN public.enderecos.precisao IS
    'geocodificado = ponto aproximado obtido por geocodificador; ajustado_manual = morador moveu o marcador.';
COMMENT ON COLUMN public.enderecos.geocoding_fonte IS
    'Provedor ou endpoint usado na geocodificação. Não implica precisão de imóvel.';

NOTIFY pgrst, 'reload schema';
