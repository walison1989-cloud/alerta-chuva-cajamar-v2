# Alerta de Chuva Cajamar — pacote completo para GitHub com Supabase existente

**Pacote:** código completo com tela simplificada de risco por endereço (v1.2), motor de decisão experimental 1.1.0, integração de terreno existente e preparação de notificações.

**Banco de dados:** **não é criado, restaurado, migrado ou apagado por este pacote**. O projeto foi preparado para apontar ao **mesmo projeto Supabase** já utilizado. O código não inclui dados reais dos moradores, rasters volumosos ou segredos. A compatibilidade com o banco remoto depende de confirmar as tabelas, funções, RLS e migrations já implantadas.

## Passo 1 — preparar o computador

Requer Node.js **24 ou 26** e npm, além de Git. Extraia o ZIP mantendo a pasta `alerta-de-chuva-cajamar`.

```powershell
cd "D:\alerta-de-chuva-cajamar"
cd frontend
npm ci
Copy-Item .env.example .env.local
```

Edite `frontend/.env.local` com os valores **do seu Supabase atual**:

```dotenv
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA_ANON_OU_PUBLISHABLE
VITE_ENABLE_EXPERIMENTAL_ANALYSIS=true
```

**Nunca use `service_role`, secret key, token pessoal ou senha no frontend.** Não faça commit de `.env.local`.

No Supabase Auth, verifique as URLs de redirecionamento de desenvolvimento `http://localhost:5173/entrar` e `http://localhost:5173/redefinir-senha`.

## Passo 2 — testar localmente

Ainda em `frontend`:

```powershell
npm run typecheck
npm test
npm run build
npm run dev
```

Abra a URL exibida no terminal (normalmente `http://localhost:5173`). Entre com um usuário de testes e verifique `/analise-preventiva`. Se alguma consulta estiver indisponível, o resultado deve indicar dados insuficientes — não ausência garantida de risco.

Para os testes Python opcionais, na pasta raiz, com ambiente Python configurado:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -c pytest.ini -q
node --test supabase/functions/tests/handlers.test.mjs
```

## Passo 3 — confirmar o Supabase existente antes de qualquer migration

No SQL Editor do **mesmo projeto Supabase**, execute o arquivo **somente leitura**:

`supabase/scripts/diagnostico_banco_existente_read_only.sql`

Esse diagnóstico identifica objetos importantes e a versão da regra. Verifique, especialmente:

- `public.terreno_motor2_no_ponto(latitude, longitude)` e o perfil de terreno de 5 m;
- `public.evidencias_avaliacao_no_ponto(...)`, `public.evidencias_avaliacao_do_morador(...)`, `public.montar_pacote_evidencias(...)`;
- `public.areas_suscetibilidade`, `public.estacoes`, `public.medicoes_chuva`, `public.vw_estacoes_publicas`;
- a regra publicada `exp-2026.11-v2`/motor `1.1.0`, exigida pelo frontend desta entrega.

A pasta `supabase/migrations` contém o **histórico completo do projeto** para referência e para ambientes novos. **NÃO execute todas essas migrations de novo no banco atual.** Se precisar aplicar apenas migrations pendentes, primeiro faça backup, verifique o histórico remoto e faça testes em homologação. Migrations aplicadas manualmente via SQL Editor podem não aparecer no histórico da CLI.

**Não use `supabase db reset`, `supabase db push`, `migration repair` ou scripts de importação diretamente no seu banco de produção sem comparação e revisão.**

## Passo 4 — GitHub: publicar tudo como um repositório NOVO

Crie um repositório **vazio** no GitHub (não marque inicialização com README) e use os comandos abaixo na raiz da pasta extraída:

```powershell
git init -b main
git add .
git status
git commit -m "feat: publicar projeto completo com motor de risco v1.2"
git remote add origin https://github.com/SEU-USUARIO/NOVO-REPOSITORIO.git
git push -u origin main
```

Antes do commit, confira se nenhuma variável privada aparece em `git status`. O `.gitignore` já exclui arquivos `.env*`, exceto exemplos.

### Para publicar no repositório existente

Não faça `git push --force` e não substitua a pasta `.git`. Faça clone limpo do repositório atual, crie uma branch, copie **somente os arquivos do pacote** para o clone, revise o diff, execute testes, faça commit e abra um Pull Request. O pacote não possui a pasta `.git`.

## Escopo e limitações do motor

- O motor cruza chuva observada, previsão e suscetibilidade; também consulta a RPC de terreno (`altitudeM`, `declividadeGraus`, `elevacaoRelativaM`).
- O terreno de 5 m e a elevação relativa **não** comprovam conectividade hidráulica entre imóvel e rio; não se deve inferir risco forte por proximidade de polígono.
- A regra é **experimental**, não calibrada com histórico de eventos para prever probabilidade percentual de alagamento. O resultado pode ser indeterminado.
- A atualização periódica do painel depende do navegador aberto; **não existe monitoramento contínuo independente no servidor nesta entrega**.
- O projeto contém uma Edge Function de entrega de e-mail/SMS, mas **o envio automático não está operacional**: depende de produtor de eventos no servidor, contatos verificados, provedor e confirmação. `ALERT_DELIVERY_ENABLED` deve permanecer `false`.
- O aplicativo **não substitui a Defesa Civil nem seus avisos oficiais**.

Documentação adicional: `docs/STATUS_RISCO_ENDERECO_E_NOTIFICACOES.md`, `docs/CORRECAO_MOTOR_PREVISAO_1_1.md`, `SECURITY.md` e `docs/PUBLICACAO.md`.

## Validações deste pacote

- Comparação de arquivos: nenhum dos 302 arquivos regulares do ZIP original foi omitido do pacote v1.2.
- Testes Python: **130 aprovados, 30 ignorados** no ambiente de montagem.
- Testes de handlers da Edge Function: **11 aprovados** no ambiente de montagem.
- Testes completos de frontend: **não executados neste ambiente**, que dispõe de Node 22; o projeto requer Node 24/26. Execute no seu Windows antes de publicar.
- Não houve acesso ao Supabase remoto, aplicação de migrations, envio real de alertas ou push ao GitHub na preparação deste pacote.


## Melhoria 1.4: três pluviômetros ao redor do endereço

O cálculo da tela `/analise-preventiva` agora utiliza a interpolação de **exatamente três estações CEMADEN** que envolvam o endereço. Dados das estações vêm da `vw_estacoes_publicas` **já existente**. A previsão Open-Meteo continua nas coordenadas do imóvel. O diagnóstico de terreno é preservado.

Veja `docs/TRIANGULACAO_MOTOR.md` para restrições de confiabilidade e testes. **Não execute migrations antigas de novo**: essa mudança não requer migration.
