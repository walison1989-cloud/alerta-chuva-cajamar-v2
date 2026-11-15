# Publicar código e preparar o MVP

1. Crie no GitHub um repositório vazio com a visibilidade desejada; não envie o ZIP original.
2. Use a pasta de fontes limpa entregue. Se não houver histórico Git, `git init -b main`, revise `git status`, execute `git add .` e `python scripts/verify_repo.py --tracked`.
3. Execute os testes e faça o commit com sua identidade Git configurada. Adicione o endereço real do repositório como origin e use `git push -u origin main`.
4. Aguarde os três jobs da CI: frontend/dependências, Python/HTTP e banco/RLS. Corrija qualquer falha antes de tratar a versão como publicada. Não há deploy automático.
5. Em homologação: configurar Supabase, importar cartografia oficial, configurar coleta, origens, SMTP/Redirect URLs, acesso privado e domínio HTTPS; exercitar login, confirmação de e-mail, recuperação de senha, logout, troca A/B, endereço e consentimento.
6. Somente após a validação em homologação, configurar a hospedagem web (`frontend`, saída `dist`) e repetir os fluxos. A análise experimental permanece desativada e não envia notificações.

Não versionar `.env*` locais, `env.local`, bancos de moradores, rasters, node_modules, venv, builds ou logs. O script de verificação verifica o conteúdo selecionado para commit e não imprime valores de credenciais. Dependências Python e ações de CI ainda devem receber auditoria contínua; Dependabot está configurado.

Este documento prepara os passos, sem criar conta/repositório remoto ou aplicar migrations. Configure o canal privado de suporte e de relatos de segurança do responsável antes de receber usuários reais. Não use issues públicas para solicitar exclusão de dados pessoais.
