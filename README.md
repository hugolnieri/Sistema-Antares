# Aplicativo de Gestão dos Polos da Antares

Sistema web para controlar polos, professores, alunos, chamadas, aulas,
relatórios, materiais didáticos, fotos e histórico das aulas.

- **Área administrativa** (`/admin`): login com e-mail e senha (Supabase Auth),
  acesso completo a polos, professores, alunos, responsáveis, cronograma,
  materiais e histórico.
- **Área do professor** (`/professor/polo/:slug`): sem cadastro. O professor
  recebe o link do polo, digita a senha do polo e cai direto na chamada.

**Stack:** React + Vite + TypeScript + Tailwind CSS + Supabase
(Auth, Postgres, Storage e Edge Functions).

---

## Modo demonstração (rodar sem Supabase)

Sem `.env` configurado, o app entra automaticamente em **modo demonstração**:
um banco fictício (polos, professores, alunos, responsáveis, histórico,
materiais) roda inteiro no navegador, persistido no `localStorage`.

```
npm install
npm run dev
```

- **Admin:** `http://localhost:5173/admin/login` — entre com **qualquer
  e-mail e senha**.
- **Professor:** `http://localhost:5173/professor/polo/jardim-santa-maria` —
  senha **1234** (também existem `centro` e `vila-nova`).
- Tudo funciona de verdade na demo: CRUDs, chamada, fotos, troca de senha do
  polo (derruba a sessão do professor), filtros e histórico.
- Para zerar os dados de exemplo: `antaresResetDemo()` no console do navegador.

Quando o `.env` for preenchido com o Supabase real, a demo desliga sozinha —
nenhuma tela muda.

## 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta (ou entre).
2. Clique em **New project**, escolha nome (ex.: `antares-polos`), senha do
   banco e região (`South America (São Paulo)` é a mais próxima).
3. Aguarde o projeto ficar pronto (1–2 minutos).

## 2. Rodar o schema SQL

1. No painel do Supabase, abra **SQL Editor**.
2. Copie **todo** o conteúdo de [`supabase/schema.sql`](supabase/schema.sql),
   cole e clique em **Run**.
3. Isso cria as tabelas, políticas de segurança (RLS), funções de senha do polo
   e os buckets de arquivos (`materiais` e `fotos-aulas`).

## 3. Criar o usuário administrativo

1. No painel, vá em **Authentication → Users → Add user → Create new user**.
2. Informe o e-mail e a senha do administrador.
3. Marque **Auto Confirm User**.

## 4. Fazer deploy da Edge Function `polo`

A área do professor inteira passa por esta função (a senha do polo nunca é
validada no navegador).

1. Instale a CLI do Supabase: `npm install -g supabase`
2. Faça login: `supabase login`
3. Na pasta do projeto, vincule ao seu projeto (o `project-ref` está na URL do
   painel):

   ```
   supabase link --project-ref SEU_PROJECT_REF
   ```

4. Defina o secret que assina os tokens de sessão do professor (use um valor
   longo e aleatório):

   ```
   supabase secrets set POLO_TOKEN_SECRET=um-valor-bem-longo-e-aleatorio
   ```

5. Publique a função:

   ```
   supabase functions deploy polo
   ```

## 5. Configurar o frontend

1. Copie `.env.example` para `.env`.
2. No painel do Supabase, em **Project Settings → API**, copie a **URL** e a
   **anon public key** para o `.env`:

   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

3. Instale e rode:

   ```
   npm install
   npm run dev
   ```

4. Abra `http://localhost:5173/admin/login` e entre com o usuário criado no
   passo 3.

## 6. Fluxo de uso

1. **Admin** cria um polo em *Polos* → o sistema gera o link estável
   (`/professor/polo/nome-do-polo`).
2. **Admin** clica em **Senha** e define a senha do polo.
   Trocar a senha invalida imediatamente as sessões antigas de professor —
   o link continua o mesmo.
3. **Admin** cadastra alunos (vinculando ao polo), responsáveis (vinculando
   aos alunos), professores e os PDFs das 18 aulas em *Materiais*.
4. **Admin** copia o link do polo e envia ao professor.
5. **Professor** abre o link, digita a senha, escolhe a aula (1–18), marca
   presença, consulta responsáveis se precisar, escreve observações e
   relatório, anexa fotos e salva.
6. O registro aparece em *Histórico* no painel administrativo.

## Segurança — como funciona

- A senha do polo é armazenada com **bcrypt** (pgcrypto) e validada apenas no
  servidor (Edge Function + função SQL `security definer`).
- O professor recebe um **token HMAC com validade de 12h** que carrega a
  versão da senha do polo; trocar a senha invalida todos os tokens antigos.
- **RLS**: usuários anônimos não têm acesso a nenhuma tabela. Todo o acesso do
  professor passa pela Edge Function, que filtra tudo pelo polo da sessão.
- Uploads da chamada aceitam **apenas imagens, até 5 MB cada, máximo 10 por
  chamada**. Os buckets são privados; o acesso é por URL assinada.
- O banco guarda apenas **metadados** das fotos (nome, caminho, vínculo). A
  coluna `url_externa` em `fotos_aula` já deixa o caminho pronto para migrar o
  armazenamento para o **SharePoint** futuramente.

## Deploy do frontend

Qualquer hospedagem de SPA funciona (Vercel, Netlify, Cloudflare Pages):

```
npm run build   # gera dist/
```

Configure as variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` na
hospedagem e um *rewrite* de todas as rotas para `index.html` (SPA fallback).

## Estrutura do projeto

```
supabase/
  schema.sql              # schema completo (rodar no SQL Editor)
  functions/polo/         # Edge Function da área do professor
src/
  lib/                    # client Supabase, tipos, status map, API do professor
  components/             # shell admin, DataTable, modais, toasts, badges
  pages/admin/            # login, dashboard, CRUDs, cronograma, histórico
  pages/professor/        # senha do polo, chamada, materiais, confirmação
```
