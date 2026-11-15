# Frontend MVP

React, TypeScript, Vite, Leaflet e Supabase. Consulte o README da raiz para execução e escopo.

Use Node 24/26 e `npm ci`. Configure `.env.local` a partir de `.env.example`. Sem Supabase, o app informa quais recursos dependem da configuração e mantém clima/mapa base. Scripts: `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.

Flags padrão: `VITE_ENABLE_EXPERIMENTAL_ANALYSIS=true` (análise exploratória, com aviso persistente; `false` a oculta) e `VITE_ENABLE_CEMADEN_LIVE_FALLBACK=false`. JSONP só pode ser habilitado em desenvolvimento e não é executado no build de produção. O histórico experimental é declaração do cliente, nunca cálculo científico validado.

Na Vercel, use raiz `frontend`, comando `npm ci && npm run build` e saída `dist`. Configure URL/chave pública do Supabase, Redirect URLs do Auth e origens da Edge Function para o domínio HTTPS. `vercel.json` inclui CSP, bloqueio de frames e cabeçalhos de privacidade. Se usar domínio customizado de Supabase ou fontes diferentes, revise a CSP de forma restrita.

Não há pipeline de deploy neste repositório. Conta e recuperação de e-mail devem ser testadas em homologação antes de abrir cadastros. O backend FastAPI não é necessário e não é encaminhado pelo Vite.
