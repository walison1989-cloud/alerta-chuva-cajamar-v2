# Protótipo FastAPI independente

O MVP público usa frontend + Supabase. Não publique esse backend como uma API de moradores. O token administrativo é de servidor, não pode ir para variável VITE_ nem para usuários finais.

```text
python -m venv .venv
# Ative o ambiente conforme o sistema operacional.
python -m pip install -r requirements.txt
python -m uvicorn main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Copie `backend/.env.example` para configuração local privada. Por padrão o banco SQLite inicia vazio. `LEGACY_SEED_DEMO=true` insere explicitamente os bairros/estações/chuva de exemplo. Esses registros são fictícios e não se misturam ao Supabase. Sementes não estão habilitadas em produção.

Defina LEGACY_ADMIN_TOKEN para endpoints de moradores, mapa privado, configuração, simulação e serviços externos; sem ele, essas operações retornam 503. Use Authorization: Bearer no cliente administrativo local. Todas as coordenadas de cadastro precisam ser explicitamente informadas e confirmadas; não há fallback automático por CEP ou primeiro bairro.

A configuração valida atenção < alerta < crítico antes de persistir. A persistência permite recarregar parâmetros entre processos, mas a operação acadêmica recomendada é um único worker local. A limpeza só resolve alertas identificados como SIMULACAO com ID de execução; registros antigos desconhecidos são preservados. Simular não envia mensagens.

SQLite recebe upgrade aditivo das duas colunas de origem do alerta. Para a base PostgreSQL **independente**, aplicar manualmente `backend/sql/04_mvp_legado_local.sql` após backup e revisão; não executar no Supabase. O backend legado PostgreSQL não foi validado neste ambiente e não integra o escopo de publicação do MVP.

A rota administrativa `/api/experimental/terreno` é desabilitada por padrão. Para pesquisa local, instale requirements-geo.txt, os dados de terreno e configure ENABLE_EXPERIMENTAL_TERRAIN=true. Ela chama a integração Python 2.0 e retorna percentual nulo; não estima risco calibrado. Chuva informada na requisição é uma entrada do pesquisador, não evidência histórica validada. O contrato histórico exige fontes, tipo/unidade, coordenadas da estação, disponibilidade, data do evento com fuso e emissão/janela da previsão; dados insuficientes são rejeitados para cruzamento.
