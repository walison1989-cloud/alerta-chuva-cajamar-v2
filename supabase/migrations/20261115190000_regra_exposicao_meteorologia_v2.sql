-- Motor 1.1.0 - regra v2, com protecao contra alarme por mera proximidade.
-- IMPORTANTE: aplicar após testar em projeto Supabase de homologação.
-- Esta migration não altera ocorrências/endereços/medições nem dispara avisos.
-- Antes de publicar a nova versão do frontend, aplicar a migration; caso
-- contrário o motor 1.1.0 rejeita a regra anterior (falha segura).
BEGIN;

-- Preserva toda a regra v1 e suas execuções: apenas despublica sua configuração.
UPDATE public.regras_avaliacao
   SET publicada = false
 WHERE publicada = true AND versao <> 'exp-2026.11-v2';

INSERT INTO public.regras_avaliacao (
  versao, motor_versao, titulo, descricao, parametros, aviso,
  publicada, vigente_de
) VALUES (
  'exp-2026.11-v2',
  '1.1.0',
  'Análise preventiva — exposição e chuva (experimental)',
  'Regra versionada que separa suscetibilidade territorial, chuva observada, previsão horária e exposição física. Não presume alagamento por proximidade e não afirma risco alto sem conectividade e terreno confirmado.',
  $json${
    "frescor_max_horas": 6,
    "raio_suscetibilidade_m": 500,
    "raio_estacoes_km": 30,
    "raio_preferencial_estacoes_km": 10,
    "limite_estacoes": 10,
    "pico_3h_critico_mm": 20,
    "faixas_observado_24h_mm": [
      {"nivel":0,"min":0,"max":0},
      {"nivel":1,"min":0.1,"max":10},
      {"nivel":2,"min":10.1,"max":30},
      {"nivel":3,"min":30.1,"max":null}
    ],
    "faixas_previsao_24h_mm": [
      {"nivel":0,"min":0,"max":0},
      {"nivel":1,"min":0.1,"max":10},
      {"nivel":2,"min":10.1,"max":30},
      {"nivel":3,"min":30.1,"max":null}
    ],
    "suscetibilidade_niveis": {"Alta":3,"Media":2,"Baixa":1,"Enxurrada":3},
    "regras": [
      {"id":"area_contida_chuva_relevante","min_suscetibilidade":2,"min_chuva":2,"nivel":"atencao_forte_experimental","aviso_area_nao_mapeada":false},
      {"id":"area_contida_com_chuva","min_suscetibilidade":1,"min_chuva":1,"nivel":"atencao_experimental","aviso_area_nao_mapeada":false},
      {"id":"chuva_extrema_regional_sem_area","min_suscetibilidade":0,"min_chuva":3,"nivel":"atencao_experimental","aviso_area_nao_mapeada":true}
    ],
    "limitacoes": [
      "Valores de faixas e 20 mm em 3 h são apenas limiares ilustrativos experimentais, NÃO calibrados para cada bacia de Cajamar.",
      "A carta de 2017 em escala 1:25.000 não caracteriza o nível de risco de um lote.",
      "Sem exposição topográfica e conectividade hidrológica confirmadas não é permitida classificação forte por imóvel.",
      "Sem chuva observada relevante não é permitida classificação forte só com previsão.",
      "Previsão horária em grade e leitura pluviométrica têm representatividade espacial distinta.",
      "A classificação não é probabilidade de alagamento nem alerta oficial."
    ]
  }$json$::jsonb,
  'Resultado experimental com incerteza. Não é probabilidade de alagamento, não é alerta oficial e não substitui a Defesa Civil (199).',
  true,
  now()
)
ON CONFLICT (versao) DO UPDATE
SET publicada = true
WHERE public.regras_avaliacao.motor_versao = '1.1.0';

-- Se existir uma regra v2 de versão incompatível, impedir publicação silenciosa.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.regras_avaliacao
    WHERE versao = 'exp-2026.11-v2' AND publicada = true AND motor_versao = '1.1.0'
  ) THEN
    RAISE EXCEPTION 'Regra v2 incompatível ou não publicada; migração cancelada';
  END IF;
END $$;
COMMIT;
