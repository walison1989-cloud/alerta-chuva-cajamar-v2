# Aplicação do patch v1.5 (Windows / GitHub / Vercel)

O ZIP do **patch** tem caminhos relativos à raiz do repositório `alerta-chuva-cajamar-v2`. Não copie uma pasta `frontend` dentro de outra `frontend`.

1. Faça backup da sua cópia local, confira `git status` e crie uma branch de homologação.
2. Extraia o conteúdo do patch na raiz do repositório local, substituindo os arquivos indicados.
3. Rode, no **PowerShell**, após instalar Node 24+:

```powershell
cd "D:\alerta-chuva-cajamar-v2\frontend"
npm ci
npm run typecheck
npm run test
npm run build
cd ..
```

4. Se os testes passarem, faça commit da atualização e envie ao GitHub:

```powershell
git status
git add frontend supabase ATUALIZACAO_V1_5_PUSH_E_RISCO.md APLICAR_PATCH_V1_5.md README.md
git commit -m "feat: status por endereco e notificacoes push v1.5"
git push origin HEAD
```

5. **Não execute automaticamente migrations antigas do repositório.** A nova, somente se a estrutura ainda não existir e após revisão/backup, é `supabase/migrations/20261116010000_push_morador_mvp_v15.sql`.
6. Leia `ATUALIZACAO_V1_5_PUSH_E_RISCO.md` para chaves VAPID, secrets, Edge Function, agendamento e habilitação progressiva.

A publicação do frontend no GitHub/Vercel **não ativa os disparos**. É preciso criar VAPID, rodar a migration em homologação, publicar `push-alertas`, configurar um agendador com segredo e ativar explicitamente o envio.
