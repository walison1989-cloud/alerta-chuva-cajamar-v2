# Interface simples por endereço + preparação de notificações — 15/11/2026

## O que muda

- `/analise-preventiva` apresenta o resultado principal **Indícios de risco**, **Sem indícios no momento** ou **Não foi possível determinar**. O terceiro estado é indispensável: ausência de dados NÃO significa ausência de alagamento. Não existe percentual de probabilidade calibrado.
- Mostra apenas o essencial (endereço, precipitação observada, previsão 24 h, elevação relativa e exposição física). Não classifica risco por distância de uma área suscetível.
- A página já atualiza periodicamente **com navegador aberto**; não é monitoramento 24 h no backend.
- O frontend consulta a RPC existente `public.terreno_motor2_no_ponto(p_latitude, p_longitude)` após carregar o endereço do morador. Ela retorna `altitudeM`, `declividadeGraus`, `elevacaoRelativaM` e `qualidade`.
- **Importante:** o MDT ativo de 5 m e a elevação relativa na janela de 155 m não fornecem conectividade hidráulica. O código mantém `conectividadeHidrologica=desconhecida` caso não venha explicitamente de fonte validada. A classe do modelo não é uma probabilidade calibrada de inundação.

## E-mail e celular: estágio exato

O projeto original permite cadastrar `contatos_alerta`, mas **a verificação de e-mail/telefone e o cálculo do risco no servidor ainda não estão integrados ao envio real**. Não há envio automático em produção.

Foram adicionados elementos **preparatórios**, desligados por padrão:

- Migration `20261115220000_envio_alertas_verificados.sql`: tabela de eventos gerados pelo servidor, tabela de entregas, deduplicação por evento/contato/canal, RLS e função reservadora que respeita `ativo`, `consentimento`, `revogado_em`, `verificado_em`, `canal_email` e `canal_sms`.
- Edge Function `enviar-alertas-risco`: entrega e-mail via Resend ou SMS via Twilio **somente se** houver um evento inserido por processo `service_role`, `confirmado_servidor=true`, ainda vigente, e o contato estiver verificado. Exige autenticação do job (`x-job-secret`) e `ALERT_DELIVERY_ENABLED=true`. Não aceita destinatário ou nível de risco do navegador.
- O envio não é acionado por `atencao_experimental` do frontend. Os resultados da Etapa 5.2 são calculados no browser e não são prova de risco suficiente para disparo externo.

## O que precisa acontecer para ativar de verdade

1. Homologar a migration separadamente; inspecionar RLS/permissões e esquema real no Supabase antes da aplicação.
2. Implementar/validar o produtor de eventos **exclusivamente no servidor**, alimentado com os dados reais `estacoes`, `medicoes_chuva`, suscetibilidade e `terreno_motor2_no_ponto`, hidrologia e limites locais auditados. Somente esse processo pode marcar `confirmado_servidor=true`. **Este produtor ainda não está neste pacote.**
3. Implantar verificação dos contatos (código por e-mail ou SMS). `verificado_em` não deve ser preenchido por usuários autenticados.
4. Configurar o provedor (Resend: `RESEND_API_KEY`, `ALERT_FROM_EMAIL`; Twilio SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`). Não colocar segredos em variáveis `VITE_*` nem fazer commit de `.env`.
5. Configurar segredos do servidor `RISK_ALERT_JOB_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Configurar chamada agendada POST à função com header `x-job-secret` no backend. Antes de tudo, manter `ALERT_DELIVERY_ENABLED=false`.
6. Testar consentimento, revogação, duplicidade, falha do provedor, endpoint offline, relógios, falsos positivos e atraso do dado, inicialmente com destinatários de homologação.
7. Só depois de calibrar o motor e validar os alertas, definir o critério operacional e habilitar `ALERT_DELIVERY_ENABLED=true` em homologação; produção exige revisão específica.

**Atenção:** o banco informado em conversa já possui funções `iniciar_lote_motor2`, `reservar_email_motor2`, `destinatarios_motor2`, etc., mas o código/contrato completo dessas funções não está no ZIP. Não alteramos essas funções existentes e não assumimos que elas implementam envio real. Antes de ativar, escolher **uma** fila de entrega e evitar duplicações com Motor2.

## Testes e limitações

- Checagem de tipos isolada dos arquivos TypeScript não-React: passou (`tsc` no subconjunto do motor, parser e status).
- Testes diretos em Node para a decisão de risco e o formato da RPC de terreno: passaram.
- Testes Vitest foram adicionados mas não foram executados neste host: Node 22.16 e cache npm insuficiente, enquanto o projeto pede Node 24+.
- A migration e Edge Function não foram testadas contra banco remoto, nem implantadas, nem enviaram mensagens reais.

## GitHub (você fará)

Extraia o ZIP em uma cópia limpa do repositório, revise `git diff`, aplique apenas após testes em homologação e use branch/PR. Não envie arquivos `.env` ou credenciais.
