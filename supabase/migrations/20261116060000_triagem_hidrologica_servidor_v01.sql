-- Triagem meteorológica experimental por endereço com consentimento; SEM gerar alerta de alagamento.
-- Não altera regras v1/v2 nem eventos_risco_servidor. Aplicar apenas após homologação.
BEGIN;
CREATE TABLE IF NOT EXISTS public.triagens_hidrologicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endereco_id uuid NOT NULL REFERENCES public.enderecos(id) ON DELETE CASCADE,
  janela_inicio timestamptz NOT NULL,
  versao text NOT NULL,
  nivel text NOT NULL CHECK(nivel IN ('dados_insuficientes','sem_sinal_meteorologico','atencao_meteorologica','atencao_experimental')),
  processos jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(processos)='array'),
  chuva_agora_modelo boolean,
  risco_confirmado boolean NOT NULL DEFAULT false CHECK (risco_confirmado=false),
  evidencias jsonb NOT NULL CHECK (jsonb_typeof(evidencias)='object'
    AND NOT(evidencias ?| array['latitude','longitude','localizacao','logradouro','numero'])),
  avaliado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endereco_id, janela_inicio, versao)
);
CREATE INDEX IF NOT EXISTS idx_triagens_usuario_data ON public.triagens_hidrologicas (usuario_id, avaliado_em DESC);
CREATE INDEX IF NOT EXISTS idx_triagens_nivel ON public.triagens_hidrologicas (nivel, avaliado_em DESC);
ALTER TABLE public.triagens_hidrologicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.triagens_hidrologicas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.triagens_hidrologicas TO authenticated;
GRANT ALL ON public.triagens_hidrologicas TO service_role;
DROP POLICY IF EXISTS triagem_select_propria ON public.triagens_hidrologicas;
CREATE POLICY triagem_select_propria ON public.triagens_hidrologicas
 FOR SELECT TO authenticated USING (usuario_id=(SELECT auth.uid()));

-- Retorna APENAS polígonos que contêm exatamente o ponto, nunca uma área vizinha.
-- Útil exclusivamente ao serviço backend autenticado com service_role.
CREATE OR REPLACE FUNCTION public.triagem_suscetibilidade_no_ponto(
  p_latitude double precision, p_longitude double precision)
RETURNS TABLE(tipo text,classe text,area_id bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,extensions
AS $f$
  SELECT s.tipo, s.classe, s.id
  FROM public.areas_suscetibilidade s
  WHERE p_latitude BETWEEN -90 AND 90 AND p_longitude BETWEEN -180 AND 180
    AND s.geom IS NOT NULL
    AND extensions.ST_Covers(s.geom, extensions.ST_SetSRID(extensions.ST_MakePoint(p_longitude,p_latitude),4326))
  ORDER BY s.classe_ordem DESC NULLS LAST, s.id ASC
  LIMIT 15
$f$;
REVOKE ALL ON FUNCTION public.triagem_suscetibilidade_no_ponto(double precision,double precision) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.triagem_suscetibilidade_no_ponto(double precision,double precision) TO service_role;
COMMIT;
