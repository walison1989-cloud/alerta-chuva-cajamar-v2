# Segurança

Não abra issues públicas com senhas, tokens, endereços, contatos ou detalhes exploráveis. Use o canal privado do responsável pelo repositório. Habilite private vulnerability reporting nas configurações do GitHub antes de receber relatos.

Todas as tabelas pessoais exigem RLS. Nunca use service_role no frontend. Exemplos de ambiente são públicos; arquivos locais, bancos, rasters, dependências e builds ficam fora do Git.

O MVP não emite avisos públicos e não estima probabilidade de alagamento. A análise opcional é experimental; seu histórico é uma declaração do navegador, com digest de conteúdo calculado no servidor. Esse digest não autentica o resultado científico, e esses registros não são rótulos de treinamento.

Antes da abertura pública: a CI precisa passar, incluindo PostgreSQL/pgTAP e auditoria de dependências; validar Auth/recuperação de e-mail em homologação com domínio HTTPS; configurar as origens autorizadas e o canal de suporte do responsável. Não há garantia de segurança baseada apenas em testes unitários.
