# Update CLAUDE.md

Atualiza a seção "Recent Commits" do CLAUDE.md com os últimos 5 commits do repositório.

## Como funciona

- Invoque com `/update-claude-md` (ou manualmente: `node scripts/update-claude-md.js`)
- O script lê os últimos 5 commits e atualiza a seção "## Recent Commits" no CLAUDE.md
- **Automático:** Um git hook `post-commit` chama isso automaticamente após cada `git commit`
- **Manual:** Se quiser forçar uma atualização sem commitar, rode o script diretamente

## Setup

O hook já foi criado em `.git/hooks/post-commit`. Se ele não estiver executável no seu sistema:

```bash
chmod +x .git/hooks/post-commit
```

## Comportamento

- Substitui a seção existente "## Recent Commits" se ela já existir
- Se não existir, insere antes de "## Contribution Approach" ou ao final do arquivo
- Silenciosamente ignora erros (não bloqueia commits por causa de falhas ao atualizar)
- Formato: `- **DATA** — MENSAGEM (HASH)`

## Exemplo

```
## Recent Commits

- **2026-07-07** — Ciclos de aulas + novo fluxo de chamada do professor (56784ee)
- **2026-07-06** — Corrige logo borrada no tema escuro (e02eda5)
```
