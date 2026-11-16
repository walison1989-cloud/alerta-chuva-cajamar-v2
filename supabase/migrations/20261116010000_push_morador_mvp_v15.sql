-- Alerta Cajamar v1.5 — cadastro de dispositivos Web Push, consentimento explícito
-- e deduplicação de entregas. Aditivo: não altera regras antigas, terreno,
-- endereços ou dados pluviométricos. Teste em homologação antes da produção.
BEGIN;

CREATE TABLE IF NOT EXISTS public.push_morador_assinaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endereco_id uuid NOT NULL REFERENCES public.enderecos(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  consentimento boolean NOT NULL DEFAULT false,
  chuva_fraca boolean NOT NULL DEFAULT true,
  chuva_forte boolean NOT NULL DEFAULT true,
  alagamento boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_endpoint_https CHECK (endpoint ~ '^https://[^[:space:]]+$' AND length(endpoint) <= 2048),
  CONSTRAINT push_chaves_validas CHECK (length(p256dh) BETWEEN 40 AND 240 AND length(auth) BETWEEN 12 AND 240),
  CONSTRAINT push_consentimento_ativo CHECK (NOT ativo OR consentimento)
);

CREATE INDEX IF NOT EXISTS idx_push_assinaturas_ativas
  ON public.push_morador_assinaturas (usuario_id, endereco_id)
  WHERE ativo AND consentimento;

CREATE TABLE IF NOT EXISTS public.push_morador_entregas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assinatura_id uuid NOT NULL REFERENCES public.push_morador_assinaturas(id) ON DELETE CASCADE,
  chave_evento text NOT NULL,
  categoria text NOT NULL CHECK (categoria IN ('chuva_fraca','chuva_forte','alagamento')),
  status text NOT NULL DEFAULT 'reservado' CHECK (status IN ('reservado','enviado','erro')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz,
  http_status integer,
  UNIQUE (assinatura_id, chave_evento),
  CHECK (length(chave_evento) BETWEEN 1 AND 150)
);

CREATE INDEX IF NOT EXISTS idx_push_entregas_data ON public.push_morador_entregas (criado_em DESC);

ALTER TABLE public.push_morador_assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_morador_entregas ENABLE ROW LEVEL SECURITY;

-- Usuário gerencia somente seus próprios dispositivos; o endereço deve
-- pertencer à mesma conta. NUNCA expor endpoint a outro morador.
DROP POLICY IF EXISTS push_assinaturas_proprio_select ON public.push_morador_assinaturas;
CREATE POLICY push_assinaturas_proprio_select
  ON public.push_morador_assinaturas FOR SELECT TO authenticated
  USING (usuario_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS push_assinaturas_proprio_insert ON public.push_morador_assinaturas;
CREATE POLICY push_assinaturas_proprio_insert
  ON public.push_morador_assinaturas FOR INSERT TO authenticated
  WITH CHECK (
    usuario_id = (SELECT auth.uid()) AND
    EXISTS (SELECT 1 FROM public.enderecos e WHERE e.id = endereco_id AND e.usuario_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS push_assinaturas_proprio_update ON public.push_morador_assinaturas;
CREATE POLICY push_assinaturas_proprio_update
  ON public.push_morador_assinaturas FOR UPDATE TO authenticated
  USING (usuario_id = (SELECT auth.uid()))
  WITH CHECK (
    usuario_id = (SELECT auth.uid()) AND
    EXISTS (SELECT 1 FROM public.enderecos e WHERE e.id = endereco_id AND e.usuario_id = (SELECT auth.uid()))
  );
DROP POLICY IF EXISTS push_assinaturas_proprio_delete ON public.push_morador_assinaturas;
CREATE POLICY push_assinaturas_proprio_delete
  ON public.push_morador_assinaturas FOR DELETE TO authenticated
  USING (usuario_id = (SELECT auth.uid()));

REVOKE ALL ON public.push_morador_assinaturas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_morador_assinaturas TO authenticated;
GRANT ALL ON public.push_morador_assinaturas TO service_role;
REVOKE ALL ON public.push_morador_entregas FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_morador_entregas TO service_role;

COMMENT ON TABLE public.push_morador_assinaturas IS
  'Dispositivos consentidos. Endpoint e chaves privadas da assinatura restritos ao morador e ao serviço; NÃO são a chave VAPID privada.';
COMMENT ON TABLE public.push_morador_entregas IS
  'Tentativas de envio feitas pelo servidor com chave de idempotência para evitar notificações repetidas.';
COMMIT;
