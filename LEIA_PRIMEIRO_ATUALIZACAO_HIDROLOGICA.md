# Atualização integrada do Alerta de Chuva Cajamar — 16/11/2026

Esta atualização oferece triagem experimental hidrometeorológica segura, indicação de chuva atual na tela e preparação de calibração histórica.

## Já aplicado diretamente no Supabase
- Migration `triagem_hidrologica_servidor_v01` aplicada, com tabela `public.triagens_hidrologicas`, RLS de leitura própria e RPC de suscetibilidade restrita ao service_role.
- Edge Function `monitorar-hidrologia` publicada (status ACTIVE, versão 1). Não significa que foi executada com credencial nem homologada ponta a ponta.
- Nenhum envio de push ou evento de alagamento confirmado foi autorizado.

## O que precisa ser publicado no GitHub/Vercel
A integração do GitHub retornou 403 ao criar branch. Os arquivos de frontend NOVOS/ALTERADOS estão neste pacote, mas a Vercel ainda não os recebe automaticamente. Copiar os arquivos para o clone local, usar `git add .`, `git commit -m "feat: triagem hidrologica e chuva agora"` e `git push` para publicar. Não incluir segredos.

## ATENÇÃO: killswitches
No Supabase > Edge Functions > Secrets, defina:
- `MONITOR_HIDRO_ENABLED=false`
- `MONITOR_HIDRO_WRITE_ENABLED=false`
- `PUSH_FLOOD_ALERTS_ENABLED=false`
O monitor exige `PUSH_JOB_SECRET` existente, via cabeçalho `x-job-secret`. Não compartilhe o segredo.

## Teste funcional
1. Sem habilitar o monitor, faça POST para `/functions/v1/monitorar-hidrologia` com o header `x-job-secret` correto e `{}`. Esperado `enabled:false,processed:0,written:0,alertsSent:0`.
2. Depois configure `MONITOR_HIDRO_ENABLED=true` e mantenha `MONITOR_HIDRO_WRITE_ENABLED=false`; POST retorna totais sem gravar.
3. Após homologar chuva, classificação e privacidade, habilite escrita e teste `SELECT nivel,processos,chuva_agora_modelo,avaliado_em FROM public.triagens_hidrologicas ORDER BY avaliado_em DESC LIMIT 10`.
4. Guarde o segredo também no Supabase Vault como `monitor_hidro_job_secret`. Só depois execute o SQL `supabase/scripts/agendar_monitor_hidro.sql` para ativar o agendamento.
5. `PUSH_FLOOD_ALERTS_ENABLED` deve permanecer false até existir validação independente de conectividade, vazão e níveis de rio. Não há confirmação automática de inundação nesta atualização.

## Testes
- 8 testes de lógica do motor passaram em Node 22 (test runner embutido).
- 4 verificações de chuva atual passaram no Node.
- Não foi possível `npm ci`/`npm run build` do frontend: ambiente tem Node 22, projeto requer Node 24+, npm offline sem pacote `yallist`.
- Tentativa de baixar reanálise histórica Open-Meteo falhou por indisponibilidade de rede no host; NÃO houve calibração final de limiares.

## Aplicação manual da atualização (Windows PowerShell)
Extraia o ZIP de patch numa pasta temporária. Abra a pasta clonada do GitHub (por exemplo `D:\alerta-chuva-cajamar-v2`). Copie os caminhos do patch **preservando subpastas** (`frontend/src/..`, `supabase/...`, `docs/...`, `tools/...`). Depois execute no clone:

```powershell
cd D:\alerta-chuva-cajamar-v2
# Utilize Node >=24 para os testes de frontend
cd frontend
npm ci
npm run build
npm test
cd ..
git status
git add frontend supabase docs tools LEIA_PRIMEIRO_ATUALIZACAO_HIDROLOGICA.md
git commit -m "feat: monitoramento hidrologico experimental e chuva atual"
git push origin main
```

Se o push for recusado, não faça `--force`; reconcilie com a versão mais recente do GitHub. Verifique o deploy da Vercel antes de dizer que a interface mudou em produção.
