# Monitoramento hidrometeorológico experimental — versão 0.1.0

## O que foi efetivamente desenvolvido
- Visor separado de **chuva indicada agora** usando `current.precipitation`, `rain` e `weather_code` da Open-Meteo, com validade máxima de 30 minutos. Não chama chuva local confirmada.
- Triagem server-side por endereço com consentimento LGPD **e assinatura de aviso de alagamento ativa e consentida**, sem expor endereço em logs/respostas.
- Triangulação CEMADEN de acumulados de 24 h com regras de qualidade, frescor e cobertura espacial existentes no projeto.
- Busca PostGIS somente de polígonos oficiais que contêm o ponto (inundação ou enxurrada). Não considera proximidade como prova de risco.
- Comparação independente de chuva atual estimada, previsão 3h/24h e observação 24h. Registra classificação experimental, fontes e motivos. **Nunca registra alagamento confirmado**.
- Ferramenta de consulta **histórica MODELADA** Open-Meteo, por dias de reportagens, com limites de 1h, 3h, 6h, 24h. A série não é um registro CEMADEN.

## O que NÃO está disponível no município ou no sistema
- Não foram identificadas medições CEMADEN INDEPENDENTES de 15 min ou 1 h no banco; o que existe é um acumulado móvel de 24 h. Não subtrair leituras não sincronizadas como se fossem intensidade de precipitação local.
- Não há séries confiáveis de cota do Rio Juqueri/Ribeirão dos Cristais, vazão, conectividade hidrológica por endereço ou validação local de drenagem.
- Reportagens de 2022/2023/2025 descrevem eventos, mas números divulgados precisam ser confrontados com medições oficiais originais antes de ajustar limiares.
- Sem estas evidências, **nenhuma automação deve inserir `eventos_risco_servidor.confirmado_servidor=true`** e `PUSH_FLOOD_ALERTS_ENABLED` deve continuar `false`.

## Instalação (ordem)
1. Fazer backup e testar a migration `supabase/migrations/20261116060000_triagem_hidrologica_servidor_v01.sql` no projeto de homologação, depois aplicar na produção. Ela é aditiva, com RLS e RPC restrita a service_role.
2. Rodar `node --experimental-strip-types --test supabase/functions/tests/triagem-hidrologica.test.mjs` (Node 22+) e `npm test`/`npm run build` em `frontend` (Node 24+).
3. Publicar `monitorar-hidrologia` com `npx supabase functions deploy monitorar-hidrologia --no-verify-jwt --project-ref <projeto>`. A função exige `x-job-secret` e `PUSH_JOB_SECRET` (já usado pelo push).
4. Supabase Edge Function Secrets: `MONITOR_HIDRO_ENABLED=false`, `MONITOR_HIDRO_WRITE_ENABLED=false`. Esses bloqueios fazem deploy seguro, sem processar ou escrever.
5. Para testar acesso, chamar POST `/functions/v1/monitorar-hidrologia` com `x-job-secret`; espera-se `{enabled:false,processed:0,written:0,alertsSent:0}`.
6. Para teste protegido, mudar SOMENTE `MONITOR_HIDRO_ENABLED=true`, manter escrita false; POST retorna totais agregados, sem dados pessoais.
7. Após inspecionar a qualidade e permissões, mudar `MONITOR_HIDRO_WRITE_ENABLED=true`; rodar novamente; ver registros em `triagens_hidrologicas`. Cada janela de 15 minutos sobrescreve o mesmo par endereço/janela/versão (upsert idempotente).
8. Agendar em **Supabase Cron** POST a cada 15 minutos com cabeçalho `x-job-secret` obtido de **Vault**, nunca registrado no repositório. Não habilitar alarmes hidrológicos com base nessas triagens.
9. Publicar frontend em Vercel após `npm run build`; conferir UI no endereço cadastrado.

## Consultas de verificação
```sql
SELECT nivel,processos,chuva_agora_modelo,avaliado_em,
       evidencias->>'previsao_24h_mm' as previsao_mm,
       evidencias->>'chuva_observada_24h_mm' as chuva_observada_mm
FROM public.triagens_hidrologicas ORDER BY avaliado_em DESC LIMIT 20;

SELECT COUNT(*) AS total, COUNT(*) FILTER(WHERE risco_confirmado) AS confirmados
FROM public.triagens_hidrologicas;
```

## Calibração histórica
`node tools/calibrar-eventos-historicos.mjs` faz consultas históricas *modeladas* da Open-Meteo para as datas 2022-01-03, 2022-09-29 (controle divulgado como sem ocorrências), 2023-01-04, 2023-01-24, 2025-01-29, 2025-02-01 e 2026-10-25. Esses episódios são **hipóteses de validação**, não dados brutos verificados. Para calibração adequada, importar séries CEMADEN originais, localizar cada ocorrência com precisão e avaliar falsos positivos e antecedência do aviso.

## Premissas de segurança
- O único campo `risco_confirmado` da nova tabela tem constraint `CHECK (risco_confirmado=false)`.
- O módulo não chama serviço de push e não cria eventos de risco confirmados. Os alertas meteorológicos do módulo `push-alertas` continuam independentes.
- Os limiares usados (5 mm/24 h e 30 mm/24 h ou 20 mm/3 h) são *critérios experimentais de acompanhamento*, não gatilhos de evacuação.
- O servidor falha fechado se uma fonte não responde: sem dados NÃO vira “sem risco”.

## Agendamento via Vault, sem expor segredos
No Supabase Vault, crie um secret com nome `monitor_hidro_job_secret` e valor igual ao `PUSH_JOB_SECRET` configurado na função. **Não compartilhe esse valor em prints, chat, commits ou SQL público.** Após isso, execute `supabase/scripts/agendar_monitor_hidro.sql` pelo SQL Editor; o script se recusa a agendar se o segredo não existir. Deixe os killswitches false até a homologação. 

## Nota sobre esta entrega
O deploy da Edge Function e a criação do banco são operações remotas independentes dos arquivos locais. O frontend depende de publicação no GitHub/Vercel. Em ambiente Node 22 sem cache de dependências não foi possível rodar `npm ci`/build do frontend; execute CI com Node 24. A consulta histórica ao Archive da Open-Meteo depende de acesso externo, indisponível neste host durante esta revisão; ela não foi usada para ajustar limites. 
