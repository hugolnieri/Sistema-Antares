-- ============================================================
-- APLICATIVO DE GESTÃO DOS POLOS DA ANTARES — SCHEMA COMPLETO
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABELAS
-- ------------------------------------------------------------

create table if not exists polos (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  slug          text not null unique,
  cep           text,
  logradouro    text,
  numero        text,
  complemento   text,
  bairro        text,
  cidade        text,
  estado        text,                        -- UF (2 letras)
  responsavel   text,
  contato       text,
  pix           text,
  observacoes   text,
  latitude      double precision,            -- localização para o mapa dos polos
  longitude     double precision,
  senha_hash    text,                        -- bcrypt via pgcrypto; nunca exposta ao cliente
  token_version int  not null default 1,     -- incrementa ao trocar senha -> invalida sessões antigas
  status        text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at    timestamptz not null default now()
);

create table if not exists professores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  contato     text,
  pix         text,
  status      text not null default 'disponivel' check (status in ('disponivel','ocupado')),
  ativo       boolean not null default true,
  observacoes text,
  created_at  timestamptz not null default now()
);

create table if not exists professor_polos (
  professor_id uuid not null references professores(id) on delete cascade,
  polo_id      uuid not null references polos(id) on delete cascade,
  primary key (professor_id, polo_id)
);

create table if not exists alunos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  contato     text,
  polo_id     uuid references polos(id) on delete set null,
  status      text not null default 'ativo' check (status in ('ativo','inativo')),
  observacoes text,
  created_at  timestamptz not null default now()
);

create table if not exists responsaveis (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  telefone    text,
  observacoes text,
  created_at  timestamptz not null default now()
);

create table if not exists aluno_responsaveis (
  aluno_id       uuid not null references alunos(id) on delete cascade,
  responsavel_id uuid not null references responsaveis(id) on delete cascade,
  parentesco     text,
  primary key (aluno_id, responsavel_id)
);

create table if not exists materiais (
  id           uuid primary key default gen_random_uuid(),
  numero_aula  int  not null unique check (numero_aula between 1 and 18),
  titulo       text not null,
  descricao    text,
  arquivo_path text,                         -- caminho no bucket 'materiais'
  status       text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at   timestamptz not null default now()
);

create table if not exists cronograma (
  id                  uuid primary key default gen_random_uuid(),
  polo_id             uuid not null references polos(id) on delete cascade,
  numero_aula         int  not null check (numero_aula between 1 and 18),
  data                date not null,
  professor_id        uuid references professores(id) on delete set null,
  observacoes         text,
  status              text not null default 'agendada' check (status in ('agendada','concluida','cancelada')),
  lembrete_dias_antes int,   -- ex.: 2 = lembrar 2 dias antes da aula
  lembrete_texto      text, -- ex.: "Organizar materiais"
  created_at          timestamptz not null default now()
);

create table if not exists historico_aulas (
  id                uuid primary key default gen_random_uuid(),
  polo_id           uuid not null references polos(id) on delete cascade,
  numero_aula       int  not null check (numero_aula between 1 and 18),
  professor_nome    text not null,             -- nomes concatenados (exibição)
  professores_nomes text[] not null default '{}', -- lista de professores da aula
  data_hora         timestamptz not null default now(),
  relatorio         text,
  criado_por        text not null default 'professor',
  created_at        timestamptz not null default now()
);

create table if not exists presencas (
  id           uuid primary key default gen_random_uuid(),
  historico_id uuid not null references historico_aulas(id) on delete cascade,
  aluno_id     uuid not null references alunos(id) on delete cascade,
  presente     boolean not null,
  unique (historico_id, aluno_id)
);

-- Alunos citados pelo professor na chamada mas que não estão cadastrados.
-- Viram sugestão de cadastro; o administrativo aprova (cria o aluno) ou recusa.
create table if not exists alunos_sugeridos (
  id           uuid primary key default gen_random_uuid(),
  polo_id      uuid not null references polos(id) on delete cascade,
  historico_id uuid references historico_aulas(id) on delete set null,
  nome         text not null,
  status       text not null default 'pendente' check (status in ('pendente','aprovado','recusado')),
  created_at   timestamptz not null default now()
);

-- Pedidos de contato: o professor, na chamada, solicita ao administrativo os
-- dados do responsável por um aluno. Vira notificação/pendência no admin.
create table if not exists solicitacoes_contato (
  id          uuid primary key default gen_random_uuid(),
  polo_id     uuid not null references polos(id) on delete cascade,
  aluno_id    uuid references alunos(id) on delete set null,
  aluno_nome  text not null,
  status      text not null default 'pendente' check (status in ('pendente','atendida')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_solicitacoes_status on solicitacoes_contato(status);

-- Fotos: o banco guarda só metadados. Arquivo fica no Storage
-- (e futuramente no SharePoint — use url_externa para isso).
create table if not exists fotos_aula (
  id           uuid primary key default gen_random_uuid(),
  historico_id uuid not null references historico_aulas(id) on delete cascade,
  polo_id      uuid not null references polos(id) on delete cascade,
  nome_arquivo text not null,
  arquivo_path text,                         -- caminho no bucket 'fotos-aulas'
  url_externa  text,                         -- reservado para SharePoint futuramente
  created_at   timestamptz not null default now()
);

create index if not exists idx_alunos_polo        on alunos(polo_id);
create index if not exists idx_historico_polo     on historico_aulas(polo_id);
create index if not exists idx_historico_data     on historico_aulas(data_hora);
create index if not exists idx_presencas_hist     on presencas(historico_id);
create index if not exists idx_presencas_aluno    on presencas(aluno_id);
create index if not exists idx_fotos_hist         on fotos_aula(historico_id);
create index if not exists idx_cronograma_data    on cronograma(data);

-- ------------------------------------------------------------
-- RLS: admin (authenticated) tem acesso total; anon não tem nada.
-- O professor acessa exclusivamente via Edge Function (service role).
-- ------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['polos','professores','professor_polos','alunos','responsaveis',
                           'aluno_responsaveis','materiais','cronograma','historico_aulas',
                           'presencas','fotos_aula','alunos_sugeridos','solicitacoes_contato']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists admin_all on %I', t);
    execute format(
      'create policy admin_all on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- A coluna senha_hash nunca deve chegar ao frontend do admin.
revoke select (senha_hash) on polos from authenticated;

-- ------------------------------------------------------------
-- FUNÇÕES DE SENHA DO POLO
-- ------------------------------------------------------------

-- Admin define/troca a senha do polo. Trocar a senha incrementa
-- token_version, invalidando todas as sessões antigas de professor.
create or replace function set_polo_password(p_polo_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Acesso negado';
  end if;
  if length(coalesce(p_password, '')) < 4 then
    raise exception 'A senha deve ter pelo menos 4 caracteres';
  end if;
  update polos
     set senha_hash    = crypt(p_password, gen_salt('bf')),
         token_version = token_version + 1
   where id = p_polo_id;
end $$;

revoke execute on function set_polo_password(uuid, text) from public, anon;
grant  execute on function set_polo_password(uuid, text) to authenticated;

-- Usada apenas pela Edge Function (service role) para validar login do professor.
create or replace function verify_polo_password(p_slug text, p_password text)
returns table (polo_id uuid, nome text, token_version int)
language sql security definer set search_path = public as $$
  select id, polos.nome, polos.token_version
    from polos
   where slug = p_slug
     and status = 'ativo'
     and senha_hash is not null
     and senha_hash = crypt(p_password, senha_hash);
$$;

revoke execute on function verify_polo_password(text, text) from public, anon, authenticated;
grant  execute on function verify_polo_password(text, text) to service_role;

-- ------------------------------------------------------------
-- STORAGE: buckets privados (acesso via URLs assinadas)
-- ------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('materiais', 'materiais', false), ('fotos-aulas', 'fotos-aulas', false)
on conflict (id) do nothing;

drop policy if exists admin_storage_all on storage.objects;
create policy admin_storage_all on storage.objects
  for all to authenticated
  using (bucket_id in ('materiais','fotos-aulas'))
  with check (bucket_id in ('materiais','fotos-aulas'));

-- ------------------------------------------------------------
-- PRONTO. Próximos passos (fora do SQL):
-- 1. Authentication -> Users -> "Add user": crie o usuário administrativo.
-- 2. Faça deploy da Edge Function 'polo' (veja README.md).
-- 3. Defina o secret POLO_TOKEN_SECRET na Edge Function.
-- ------------------------------------------------------------
