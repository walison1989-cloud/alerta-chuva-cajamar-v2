-- Estrutura de entrega de alertas. NÃO infere risco por si própria.
-- Somente um processo server-side com evidências validadas pode inserir eventos.
-- Não executar em produção sem homologação e aprovação das regras do motor.
BEGIN;

CREATE TABLE IF NOT EXISTS public.eventos_risco_servidor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endereco_id uuid NOT NULL REFERENCES public.enderecos(id) ON DELETE CASCADE,
  janela_inicio timestamptz NOT NULL,
  confirmado_servidor boolean NOT NULL DEFAULT false,
  regra_versao text NOT NULL,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL,
  UNIQUE (endereco_id, regra_versao, janela_inicio),
  CHECK (expira_em > criado_em AND expira_em <= criado_em + interval '2 hours'),
  CHECK (jsonb_typeof(evidencias) = 'object')
);

CREATE TABLE IF NOT EXISTS public.entregas_alerta_risco (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.eventos_risco_servidor(id) ON DELETE CASCADE,
  contato_id integer NOT NULL REFERENCES public.contatos_alerta(id_contato) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('email','sms')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','processando','enviado','erro')),
  tentativas smallint NOT NULL DEFAULT 0,
  reservado_em timestamptz,
  enviado_em timestamptz,
  ultimo_erro text,
  UNIQUE (evento_id, contato_id, canal)
);

CREATE INDEX IF NOT EXISTS idx_eventos_risco_ativos
 ON public.eventos_risco_servidor (expira_em, criado_em)
 WHERE confirmado_servidor = true;
CREATE INDEX IF NOT EXISTS idx_entregas_alerta_pendentes
 ON public.entregas_alerta_risco (status, reservado_em);

ALTER TABLE public.eventos_risco_servidor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entregas_alerta_risco ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.eventos_risco_servidor FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.entregas_alerta_risco FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.eventos_risco_servidor TO service_role;
GRANT ALL ON public.entregas_alerta_risco TO service_role;

-- Evita emails e SMS repetidos por tentativas concorrentes. O envio é
-- idempotente por evento/contato/canal; renovação de evento exige nova janela.
CREATE OR REPLACE FUNCTION public.reservar_entregas_risco(p_limite integer DEFAULT 20)
RETURNS TABLE(entrega_id uuid, canal text, destino text, evento_id uuid, regra_versao text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO pg_catalog, public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_obrigatoria' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.entregas_alerta_risco (evento_id, contato_id, canal)
  SELECT e.id, c.id_contato, 'email'
  FROM public.eventos_risco_servidor e
  JOIN public.contatos_alerta c ON c.usuario_id=e.usuario_id
    AND c.endereco_id=e.endereco_id
  WHERE e.confirmado_servidor = true
    AND e.expira_em > now() AND e.criado_em >= now()-interval '2 hours'
    AND c.ativo = true AND c.consentimento = true AND c.revogado_em IS NULL
    AND c.verificado_em IS NOT NULL AND c.canal_email = true
    AND c.email IS NOT NULL AND btrim(c.email) <> ''
  ON CONFLICT DO NOTHING;

  INSERT INTO public.entregas_alerta_risco (evento_id, contato_id, canal)
  SELECT e.id, c.id_contato, 'sms'
  FROM public.eventos_risco_servidor e
  JOIN public.contatos_alerta c ON c.usuario_id=e.usuario_id
    AND c.endereco_id=e.endereco_id
  WHERE e.confirmado_servidor = true
    AND e.expira_em > now() AND e.criado_em >= now()-interval '2 hours'
    AND c.ativo = true AND c.consentimento = true AND c.revogado_em IS NULL
    AND c.verificado_em IS NOT NULL AND c.canal_sms = true
    AND c.telefone ~ '^[0-9]{10,11}$'
  ON CONFLICT DO NOTHING;

  RETURN QUERY
  WITH claimed AS (
    SELECT d.id FROM public.entregas_alerta_risco d
    JOIN public.eventos_risco_servidor e ON e.id=d.evento_id
    JOIN public.contatos_alerta c ON c.id_contato=d.contato_id
    WHERE d.status='pendente' AND d.tentativas=0
      AND e.confirmado_servidor AND e.expira_em > now()
      AND c.ativo AND c.consentimento AND c.revogado_em IS NULL
      AND c.verificado_em IS NOT NULL
      AND ((d.canal='email' AND c.canal_email AND c.email IS NOT NULL)
        OR (d.canal='sms' AND c.canal_sms AND c.telefone ~ '^[0-9]{10,11}$'))
    ORDER BY e.criado_em, d.id
    LIMIT greatest(1, least(coalesce(p_limite,20), 100))
    FOR UPDATE OF d SKIP LOCKED
  ), updated AS (
    UPDATE public.entregas_alerta_risco d
    SET status='processando', reservado_em=now(), tentativas=tentativas+1
    FROM claimed WHERE d.id=claimed.id
    RETURNING d.id, d.canal, d.contato_id, d.evento_id
  )
  SELECT u.id, u.canal,
    CASE WHEN u.canal='email' THEN c.email::text ELSE c.telefone::text END,
    u.evento_id, e.regra_versao
  FROM updated u
  JOIN public.contatos_alerta c ON c.id_contato=u.contato_id
  JOIN public.eventos_risco_servidor e ON e.id=u.evento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.reservar_entregas_risco(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_entregas_risco(integer) TO service_role;

COMMENT ON TABLE public.eventos_risco_servidor IS 'Somente avaliação hidrometeorológica efetuada e confirmada no servidor pode gerar um evento; avaliações enviadas pelo navegador não são suficientes.';
COMMIT;
