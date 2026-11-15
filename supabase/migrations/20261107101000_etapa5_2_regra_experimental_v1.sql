-- =====================================================================
-- Etapa 5.2 — regra experimental v1
--
-- Esta migration apenas insere a configuração versionada da regra
-- `exp-2026.11-v1`. Ela é idempotente: se a versão já existir, nada muda.
--
-- A regra NÃO é critério oficial. Os limiares são faixas experimentais de
-- acumulado de 24 h e de previsão, usadas para leitura preventiva. A
-- probabilidade de precipitação da Open-Meteo é apenas contexto e NÃO entra
-- na classificação.
--
-- O motor TypeScript (`MOTOR_VERSAO = 1.0.0`) interpreta `parametros`.
-- Se a versão do motor ou a estrutura não forem compatíveis, o resultado
-- será "Dados insuficientes" — nunca uma classificação improvisada.
-- =====================================================================

INSERT INTO public.regras_avaliacao (
    versao,
    motor_versao,
    titulo,
    descricao,
    parametros,
    aviso,
    publicada,
    vigente_de
) VALUES (
    'exp-2026.11-v1',
    '1.0.0',
    'Análise preventiva experimental — versão 1',
    'Regra experimental que combina suscetibilidade oficial do terreno, chuva observada em 24 h e previsão de chuva para as próximas 24 h. A chuva entra como a maior magnitude entre as duas janelas de 24 h, sem soma. Não é alerta oficial e não estima probabilidade de alagamento.',
    $json$
    {
      "frescor_max_horas": 6,
      "raio_suscetibilidade_m": 500,
      "raio_estacoes_km": 30,
      "raio_preferencial_estacoes_km": 10,
      "limite_estacoes": 10,
      "faixas_observado_24h_mm": [
        { "nivel": 0, "min": 0, "max": 0 },
        { "nivel": 1, "min": 0.1, "max": 10 },
        { "nivel": 2, "min": 10.1, "max": 30 },
        { "nivel": 3, "min": 30.1, "max": null }
      ],
      "faixas_previsao_24h_mm": [
        { "nivel": 0, "min": 0, "max": 0 },
        { "nivel": 1, "min": 0.1, "max": 10 },
        { "nivel": 2, "min": 10.1, "max": 30 },
        { "nivel": 3, "min": 30.1, "max": null }
      ],
      "suscetibilidade_niveis": {
        "Alta": 3,
        "Media": 2,
        "Baixa": 1,
        "Enxurrada": 3
      },
      "regras": [
        {
          "id": "suscetibilidade_alta_chuva_moderada_ou_mais",
          "min_suscetibilidade": 2,
          "min_chuva": 2,
          "nivel": "atencao_forte_experimental",
          "aviso_area_nao_mapeada": false
        },
        {
          "id": "suscetibilidade_alta_qualquer_chuva",
          "min_suscetibilidade": 2,
          "min_chuva": 1,
          "nivel": "atencao_experimental",
          "aviso_area_nao_mapeada": false
        },
        {
          "id": "suscetibilidade_media_ou_baixa_chuva_moderada",
          "min_suscetibilidade": 1,
          "min_chuva": 2,
          "nivel": "atencao_experimental",
          "aviso_area_nao_mapeada": false
        },
        {
          "id": "chuva_forte_sem_area_mapeada",
          "min_suscetibilidade": 0,
          "min_chuva": 3,
          "nivel": "atencao_experimental",
          "aviso_area_nao_mapeada": true
        }
      ],
      "limitacoes": [
        "A classificação é experimental e não representa probabilidade de alagamento.",
        "Chuva observada é acumulado de 24 h; não é intensidade mm/h.",
        "A previsão Open-Meteo é modelada e não é medição local.",
        "A dimensão de chuva usa a maior magnitude entre o acumulado observado das 24 h passadas e a previsão para as próximas 24 h; os valores não são somados e não representam um total de 48 h.",
        "A carta de suscetibilidade é de 2017, escala 1:25.000, e não reage à chuva do momento.",
        "A ausência de polígono no raio consultado não significa ausência de risco.",
        "A regra ainda não passou por calibração hidrológica."
      ]
    }
    $json$::jsonb,
    'Resultado experimental para leitura preventiva. Não é alerta oficial, não é probabilidade de alagamento e não substitui a Defesa Civil (199).',
    TRUE,
    now()
)
ON CONFLICT (versao) DO NOTHING;

COMMENT ON TABLE public.regras_avaliacao IS
    'Regras experimentais versionadas do motor de análise preventiva. A versão 1 é a regra publicada inicial.';
