> **Atualização experimental v1.5:** consulte [`ATUALIZACAO_V1_5_PUSH_E_RISCO.md`](ATUALIZACAO_V1_5_PUSH_E_RISCO.md) para painel de chuva/risco e Web Push. Envio remoto permanece desligado até configuração e homologação.

# Alerta de Chuva Cajamar — MVP 0.3.0

**Novo repositório com o mesmo banco Supabase:** comece por [`INICIAR_AQUI.md`](INICIAR_AQUI.md). O pacote inclui o motor v1.2 do frontend (regra experimental 1.1.0), não executa migrations remotas e não envia alertas automaticamente.

Aplicativo informativo para Cajamar/SP: condições e previsão da Open-Meteo, mapa com estações CEMADEN sincronizadas, suscetibilidade oficial e endereço privado do morador. Não substitui os avisos da Defesa Civil. Não envia SMS, e-mail, push ou WhatsApp e não calcula probabilidade de alagamento.

O mapa inclui consulta complementar ao catálogo INMET, metadados históricos do
posto Ponunduva/SP Águas e referência à ANA com acesso pendente. Isso não integra
leituras recentes dessas três redes. Consulte `docs/REDES_PLUVIOMETRICAS.md`.

A triangulação espacial experimental TypeScript está ligada à página
`/analise-preventiva`; critérios e limites estão em
`docs/TRIANGULACAO_MOTOR.md`. Ela continua sem calibração, não é probabilidade e
não envia alertas. O módulo adicional Python é executável apenas localmente;
Vercel estática não o executa. Para falha de consulta de contatos, consulte
`docs/CONTATOS_DIAGNOSTICO.md` antes de alterar o banco remoto.

## Correção experimental do motor 1.1.0 (15/11/2026)

A classificação agora diferencia suscetibilidade **no ponto** de polígonos apenas
próximos. O acumulado observado e a previsão de 24 h permanecem separados; o
motor calcula também o pico previsto em janelas móveis de 3 h e 6 h. Sem
altimetria relativa e conectividade hidrológica **verificadas**, não emite
atenção forte por imóvel. Isso **não** transforma a regra em um modelo
hidráulico validado nem garante risco baixo quando não existe dado.

**Atenção à implantação:** o frontend 1.1.0 exige a regra publicada
`exp-2026.11-v2`/motor `1.1.0`. A migration correspondente é
`supabase/migrations/20261115190000_regra_exposicao_meteorologia_v2.sql`.
Aplicá-la **primeiro em homologação**; não altere o Supabase de produção sem
verificação. Instruções e limitações: `docs/CORRECAO_MOTOR_PREVISAO_1_1.md`.

## Executar o aplicativo

Requisitos: Node.js 24 ou 26, npm e um navegador atualizado.

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev -- --host 127.0.0.1
```

Abra o endereço mostrado pelo Vite. Sem Supabase configurado, clima e mapa base funcionam; a interface informa quando estações, conta e endereço estão indisponíveis. Nenhuma leitura é fabricada. Configure apenas URL e chave **anon/publishable** em `frontend/.env.local`; nunca use chave secreta ou service_role.

## Configurar Supabase em ambiente local

Requer Docker e Supabase CLI. Os comandos abaixo são exclusivamente locais:

```text
supabase start
supabase db reset --local
supabase test db
```

Todas as migrations devem ser aplicadas antes de expor o banco a usuários. As tabelas de suscetibilidade ficam vazias até a importação oficial; o app deve mostrar indisponibilidade, sem interpretar ausência de polígonos como ausência de suscetibilidade. Veja `supabase/README.md`.

## O que compõe o MVP

- Clima e previsão rotulados como saída de modelo; chuva CEMADEN rotulada como observação.
- Mapa base, estações sincronizadas e camada oficial de suscetibilidade, quando importada.
- Cadastro/login, recuperação de senha e endereço confirmado no mapa, protegido por RLS.
- Contatos pessoais e consentimento; sem envio externo. Alterar destino invalida sua verificação.
- Estados de indisponibilidade e cache municipal. Previsões do imóvel usam somente cache em memória; logout remove caches antigos com coordenadas.

Ocorrências novas e administração ainda não são produtos públicos; não aparecem nos menus. A análise experimental fica acessível por padrão, sempre rotulada como não oficial e sem envio de avisos; `VITE_ENABLE_EXPERIMENTAL_ANALYSIS=false` a oculta. Ela não é modelo calibrado. O frontend de produção não executa JSONP de terceiros.

## Qualidade e CI

```text
cd frontend
npm run typecheck
npm run lint
npm test
npm run build
cd ..
node --test supabase/functions/tests/handlers.test.mjs
python -m pip install -r requirements-dev.txt
python -m pytest -c pytest.ini -q
python scripts/verify_repo.py --tracked
```

A CI executa esses checks, `npm audit` e PostgreSQL/pgTAP em banco descartável. **A CI não faz deploy.** Os testes HTTP completos exigem sockets locais; testes geográficos com rasters são opcionais e marcados como ignorados quando os dados não estão instalados. Testes sintéticos de NoData e histórico continuam executando. A lista de versões Python foi fixada a partir do ambiente testado; a instalação limpa e advisories atuais são conferidos pela CI.

## Backend independente e pesquisa

O diretório `backend/` preserva o protótipo FastAPI. O React não o consome. Ele inicia sem sementes fictícias, exige token administrativo em operações sensíveis/consultas externas, não inventa coordenadas nem chuva e separa alertas de simulação. Veja `docs/BACKEND.md`. O motor 2.0 retorna percentual nulo enquanto não houver calibração validada. Não existe treinamento automático.

## Preparar publicação

Leia `docs/PUBLICACAO.md`, `docs/VALIDACAO_MVP.md` e `SECURITY.md`. Os segredos e bancos locais não devem entrar em commits. Configure o repositório GitHub e execute a CI antes de publicar o aplicativo. Este pacote não aplica alterações em Supabase remoto nem cria hospedagem.

Os dados geográficos grandes ficam separados do Git. Consulte `docs/DADOS.md`. Os materiais oficiais mantêm suas fontes e condições de uso; nenhum arquivo de origem foi declarado como criação deste projeto.
