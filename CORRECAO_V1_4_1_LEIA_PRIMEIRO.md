# CORREÇÃO COMPLETA v1.4.1 — Falha de compilação Vercel

Projeto: https://github.com/walison1989-cloud/alerta-chuva-cajamar-v2
Commit que apresentou a falha: a814635
Erro: TS2305 em src/hooks/useAvaliacaoPreventiva.ts, export ausente de fetchTerrenoComDiagnosticoNoPonto.

## O que esta atualização contém

1. frontend/src/lib/avaliacaoPreventivaRepository.ts: restaura `diagnosticarRespostaTerreno`, `fetchTerrenoComDiagnosticoNoPonto` e compatibilidade de `fetchTerrenoNoPonto` com diagnóstico de falha / cobertura / permissão.
2. frontend/src/lib/avaliacaoPreventivaRepository.test.ts: testes específicos da leitura e do diagnóstico topográfico.

O código corresponde ao arquivo que já constava no ZIP completo v1.4, mas estava ausente no patch incremental usado para atualizar o GitHub. Os outros módulos v1.4 (triangulação, hook, interface) permanecem como estão.

## Como aplicar — recomendação: use o ZIP menor

1. Faça backup ou commit das suas alterações locais.
2. Extraia este arquivo para uma pasta temporária.
3. Copie a pasta `frontend` extraída SOBRE a pasta do repositório local `alerta-chuva-cajamar-v2`, preservando os caminhos internos. Isso substitui APENAS dois arquivos .ts e .test.ts.
4. No PowerShell, na raiz do seu repositório, execute:

```powershell
cd "D:\alerta-chuva-cajamar-v2"
git status
cd frontend
npm ci
npm run typecheck
npm test -- --run
npm run build
cd ..
git add frontend/src/lib/avaliacaoPreventivaRepository.ts frontend/src/lib/avaliacaoPreventivaRepository.test.ts
git commit -m "fix: restaura diagnostico de terreno no motor v1.4"
git push origin main
```

É necessário Node 24.x ou 26.x no computador. Se algum teste falhar, examine a mensagem antes do push. A Vercel deve ter Root Directory `frontend`.

## Restrição da validação

A sintaxe dos 173 arquivos TS/TSX do ZIP completo foi verificada sem erro, e a definição da função exportada foi conferida. NESTE AMBIENTE o npm ci não concluiu por indisponibilidade do registry/cache, e Node disponível é 22.16.0; por isso NÃO foi possível executar `tsc -b`, Vitest ou Vite build. A correção elimina a importação inexistente identificada no erro TS2305; o build final precisa ser validado na Vercel.

## Segurança / implantação

Não requer nenhuma migration, alteração de chaves Supabase, dados de moradores, RLS ou desligamento do projeto antigo. Não ativa push. Nunca use `npm audit fix --force` para corrigir o TS2305.
