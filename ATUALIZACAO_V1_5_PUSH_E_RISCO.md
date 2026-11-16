# Alerta de Chuva Cajamar v1.5 — situação do endereço e notificações Web Push

## O que muda

- A tela do endereço separa **situação meteorológica** de **risco de alagamento**.
- Chuva observada por 3 estações + previsão Open-Meteo passam a produzir respostas úteis mesmo quando a conectividade hidrológica não foi comprovada.
- O bloqueio antigo da RPC de terreno **não é recriado**. O frontend continua consultando `terreno_motor2_no_ponto`.
- Uma previsão de chuva NÃO é um alerta confirmado de inundação. Nenhuma mensagem pode prometer "sem possibilidade de alagamento".
- Um morador autenticado com endereço cadastrado pode consentir com **push** de chuva fraca/moderada, chuva forte e eventos de alagamento verificados. Cadastro só funciona quando a chave pública VAPID está configurada.
- A Edge Function `push-alertas` consulta a Open-Meteo por endereço, lê a rede CEMADEN do Supabase e deduplica entregas por dispositivo/evento.
- A categoria **alagamento** é **desativada por padrão** até haver evento `eventos_risco_servidor.confirmado_servidor=true`, gerado por processo confiável no servidor. Não se aceita um resultado enviado pelo React como prova de risco.

## Critérios experimentais para comunicar chuva

| Condição com dados atuais | Na tela | Push opcional |
| --- | --- | --- |
| < 5 mm previstos em 24h, pico 3h < 5 mm, chuva interpolada < 5 mm | Sem sinais meteorológicos relevantes, nunca "imóvel seguro" | Nenhum |
| Previsão >= 5 mm/24h ou pico 3h >= 5 mm ou observada >= 5 mm | Chuva prevista — acompanhamento | `chuva_fraca`, se consentido |
| Previsão >= 30 mm/24h ou pico 3h >= 20 mm ou observada >= 30 mm | Chuva forte — atenção | `chuva_forte`, se consentido |
| Evento hidrológico server-side confirmado e válido, com consentimento | Indícios de risco de alagamento | `alagamento`, apenas se `PUSH_FLOOD_ALERTS_ENABLED=true` |
| Previsão ou rede inválidas | Avaliação incompleta | Não enviar alerta automático com base em dado faltante |

Estes números são limites de apresentação *experimentais* e **não foram calibrados por bacia ou validado em retrospectiva para Cajamar**. Não são previsão probabilística de inundação. A medição observada (24h passadas) e a previsão (24h futuras) nunca são somadas.

## Instalação (você executa, não foi alterado seu Supabase remoto)

1. Crie uma **branch de homologação** do GitHub e faça backup do banco Supabase. Extraia o patch na raiz da cópia local `alerta-chuva-cajamar-v2`, substituindo os caminhos relativos. **Não execute as migrations antigas**.
2. Execute o diagnóstico somente-leitura `supabase/scripts/diagnostico_push_v15_read_only.sql` no SQL Editor. Verifique se as novas tabelas ainda não existem.
3. Revise e execute **somente** `supabase/migrations/20261116010000_push_morador_mvp_v15.sql` em homologação; confirme RLS, permissões e compatibilidade com sua base atual antes da produção. Esta migration cria as tabelas `push_morador_assinaturas` e `push_morador_entregas`. Não executa notificações.
4. Na máquina local, gere chaves VAPID com `npx web-push generate-vapid-keys`. **Nunca publique a chave privada em GitHub, Vercel ou no frontend.** Guarde-a em Secrets do Supabase.
5. Vercel > projeto > Settings > Environment Variables: configure **`VITE_WEB_PUSH_PUBLIC_KEY`** com a chave pública VAPID, somente essa. Mantenha sua URL Supabase sem `/rest/v1`. Faça Redeploy para incorporar a nova variável.
6. Supabase > Edge Functions > Secrets: configure `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (por exemplo `mailto:contato@seudominio.com`), `PUSH_JOB_SECRET` (valor aleatório de 32+ bytes), `PUSH_ALERTS_ENABLED=false` e `PUSH_FLOOD_ALERTS_ENABLED=false`. **Não cole seus segredos no chat**.
7. Publique `push-alertas` com Supabase CLI: `npx supabase functions deploy push-alertas --no-verify-jwt`. A função valida **`x-job-secret`** antes de processar a requisição. A chave secreta do serviço SUPABASE_SERVICE_ROLE_KEY deve ficar só na Edge Function.
8. Em browser compatível, faça login > `/analise-preventiva` > confirme endereço > clique **Ativar notificações push** e aceite a permissão. Em iPhone/iPad, Web Push exige o web app instalado na tela inicial e versão compatível do iOS.
9. Após validar em homologação com conta e dispositivo de teste, configure uma tarefa HTTP no Supabase Cron/agendador de sua confiança: `POST https://SEU-PROJETO.supabase.co/functions/v1/push-alertas`, cabeçalho `x-job-secret: SEU_SEGREDO`, corpo `{}`, intervalo sugerido de **30 minutos**. Armazene a credencial em Vault/secret manager, **não em SQL ou arquivos versionados**. Use logs privados para monitorar falhas.
10. Só após os testes, habilite `PUSH_ALERTS_ENABLED=true` no Supabase e execute o job. Por segurança, **mantenha `PUSH_FLOOD_ALERTS_ENABLED=false`** até validar o processo que cria `eventos_risco_servidor` com evidências auditáveis.

## Como verificar

- Painel: com 0,8 mm observados + 18,5 mm previstos, deve mostrar **Chuva prevista: acompanhamento**, e **não** risco de alagamento confirmado.
- Painel: 0,3 mm observados + 0,8 mm previstos deve mostrar **Sem sinais meteorológicos relevantes** sem prometer segurança do imóvel.
- Painel: chuva forte sem exposição verificada deve mostrar **Chuva forte: atenção** com **risco do imóvel não confirmado**.
- Dispositivo: confirme consentimento, registro da assinatura e aplicação da RLS. Só o morador pode ver/editar a própria assinatura.
- Agendador: job desligado retorna `{ "enabled": false }` sem enviar; job ligado retorna `processed/sent/failed/skipped` (contagens, nunca endpoints).
- Anti-spam: eventos de chuva fraca são deduplicados em janelas de 6h; chuva forte, 2h; alagamento, por evento validado. Uma falha de envio não é repetida automaticamente, para evitar duplicação incerta.
- Privacidade: nenhuma coordenada, nome, rua, endpoint ou chave privada é colocada no texto do push.
- Na configuração atual, o job possui um limite **explícito de 100 dispositivos ativos**. Não o habilite para uma base maior sem integrar fila e processamento paginado.

## Limitações importantes

- **Não é sistema oficial de alerta nem serviço de emergência.** Em ameaça iminente, seguir a Defesa Civil e ligar 199.
- A triangulação espacial não capta plenamente pancadas convectivas locais nem demonstra conectividade hidráulica.
- O motor no frontend não pode servir como fonte de verdade para alertas remotos de risco. Esta atualização não implementa um motor hidrológico servidor calibrado para gerar `eventos_risco_servidor`; ela **prepara e condiciona** o envio de tal categoria.
- Não foi realizado deploy remoto, nem migrations aplicadas, nem notificações enviadas. O navegador/OS pode atrasar ou bloquear push mesmo após cadastramento.
- Os testes do núcleo e a verificação de sintaxe não substituem build completo Vite/TypeScript com Node 24+ e testes de navegador/Edge Function em homologação.
