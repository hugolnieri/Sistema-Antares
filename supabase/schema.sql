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
  ciclo_atual   int  not null default 1,     -- avança quando a Aula 18 é registrada; libera 1-18 de novo
  status        text not null default 'ativo' check (status in ('ativo','inativo')),
  created_at    timestamptz not null default now()
);

create table if not exists professores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  contato     text,
  pix         text,
  status      text not null default 'ativo' check (status in ('ativo','inativo')),
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
  relatorio    text,                         -- relatório reutilizável da aula (enviado às famílias)
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
  lembrete_dias_antes int,   -- LEGADO: 1 lembrete só (migrado para a coluna lembretes)
  lembrete_texto      text, -- LEGADO: ver lembretes
  lembretes           jsonb not null default '[]', -- lista [{dias_antes, texto}] — vários lembretes por aula
  relatorio_lembrete_data date, -- se preenchida, lembra de enviar o relatório da aula nesse dia (ex.: aula sáb -> seg)
  created_at          timestamptz not null default now()
);

-- Migração para bancos já existentes (idempotente):
alter table cronograma add column if not exists lembretes jsonb not null default '[]';
update cronograma
   set lembretes = jsonb_build_array(jsonb_build_object('dias_antes', lembrete_dias_antes, 'texto', coalesce(lembrete_texto, '')))
 where lembrete_dias_antes is not null
   and (lembretes is null or lembretes = '[]'::jsonb);

create table if not exists historico_aulas (
  id                uuid primary key default gen_random_uuid(),
  polo_id           uuid not null references polos(id) on delete cascade,
  numero_aula       int  not null check (numero_aula between 1 and 18),
  ciclo             int  not null default 1,  -- em qual ciclo do polo essa aula foi dada
  professor_nome    text not null,             -- nomes concatenados (exibição)
  professores_nomes text[] not null default '{}', -- lista de professores da aula
  data_hora         timestamptz not null default now(),
  relatorio         text,
  criado_por        text not null default 'professor',
  created_at        timestamptz not null default now(),
  unique (polo_id, ciclo, numero_aula)
);

create table if not exists presencas (
  id           uuid primary key default gen_random_uuid(),
  historico_id uuid not null references historico_aulas(id) on delete cascade,
  aluno_id     uuid references alunos(id) on delete set null, -- vira null se o aluno for excluído
  aluno_nome   text,                                          -- nome gravado na chamada: preserva o histórico após a exclusão
  presente     boolean not null,
  unique (historico_id, aluno_id)
);

-- Migração para bancos já existentes: preserva o histórico ao excluir alunos.
alter table presencas add column if not exists aluno_nome text;
update presencas p set aluno_nome = a.nome
  from alunos a where p.aluno_id = a.id and p.aluno_nome is null;
alter table presencas alter column aluno_id drop not null;
do $$
begin
  alter table presencas drop constraint if exists presencas_aluno_id_fkey;
  alter table presencas add constraint presencas_aluno_id_fkey
    foreign key (aluno_id) references alunos(id) on delete set null;
exception when others then null;
end $$;

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
  motivo      text,
  status      text not null default 'pendente' check (status in ('pendente','atendida')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_solicitacoes_status on solicitacoes_contato(status);

-- Registro de auditoria: o que cada usuário (admin ou professor) fez no sistema.
create table if not exists logs (
  id          uuid primary key default gen_random_uuid(),
  ator        text not null,                 -- e-mail do admin, "Professor · <polo>" ou "Sistema"
  ator_tipo   text not null default 'admin' check (ator_tipo in ('admin','professor','sistema')),
  acao        text not null,                 -- criar | editar | excluir | login | chamada | fotos | ...
  entidade    text not null,                 -- polo | professor | aluno | responsavel | material | cronograma | chamada | sessao
  entidade_id text,
  descricao   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_logs_created on logs(created_at desc);

-- Configurações gerais do sistema (chave/valor) — tela /admin/configuracoes.
-- 'contato_antares' = WhatsApp do responsável do colégio Antares, destino das
-- consultas de responsáveis feitas pelos professores na chamada.
create table if not exists configuracoes (
  chave      text primary key,
  valor      text,
  created_at timestamptz not null default now()
);

-- Controle de acesso do admin — ALLOWLIST: só entram no sistema o admin
-- master (configuracoes.admin_master) e os e-mails desta tabela.
-- permissoes = { "polos": "editar" | "ver" | "nenhum", ... }.
create table if not exists permissoes_usuarios (
  email      text primary key,               -- sempre minúsculo
  permissoes jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Segredos do servidor (token HMAC do professor, credenciais Microsoft
-- Graph, bootstrap). RLS ligada SEM policies: só a service role acessa.
-- Chaves usadas: polo_token_secret, bootstrap_token (apagada após o uso),
-- ms_tenant_id, ms_client_id, ms_client_secret, ms_site_url (Graph).
create table if not exists segredos (
  chave      text primary key,
  valor      text,
  created_at timestamptz not null default now()
);

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
-- SEGURANÇA (allowlist): só entra quem for o admin master ou estiver em
-- permissoes_usuarios. RLS nega tudo aos demais, mesmo autenticados; um
-- trigger em auth.users impede contas fora da lista; o professor acessa
-- exclusivamente via Edge Function (service role).
-- Aplicado no projeto real via migrações (schema_inicial +
-- seguranca_allowlist_rls). Este arquivo é o espelho de referência.
-- ------------------------------------------------------------

-- Usuário logado está autorizado a usar o sistema?
create or replace function public.acesso_permitido()
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(auth.jwt() ->> 'email', '') = '' then false
    when lower(auth.jwt() ->> 'email') =
         (select lower(valor) from configuracoes where chave = 'admin_master') then true
    else exists (
      select 1 from permissoes_usuarios p
       where lower(p.email) = lower(auth.jwt() ->> 'email')
    )
  end;
$$;
revoke execute on function public.acesso_permitido() from public, anon;
grant execute on function public.acesso_permitido() to authenticated;

-- Usuário logado pode EDITAR o menu? Master: sempre. Listado: conforme
-- permissoes (chave ausente = 'editar'). Fora da lista: nunca.
create or replace function public.pode_editar_menu(p_menu text)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when coalesce(auth.jwt() ->> 'email', '') = '' then false
    when lower(auth.jwt() ->> 'email') =
         (select lower(valor) from configuracoes where chave = 'admin_master') then true
    else coalesce((
      select coalesce(p.permissoes->>p_menu, 'editar') = 'editar'
        from permissoes_usuarios p
       where lower(p.email) = lower(auth.jwt() ->> 'email')
    ), false)
  end;
$$;
revoke execute on function public.pode_editar_menu(text) from public, anon;
grant execute on function public.pode_editar_menu(text) to authenticated;

-- Permissões do PRÓPRIO usuário logado — o front chama no carregamento.
create or replace function public.minha_permissao()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_master text;
  v_perm   jsonb;
begin
  if v_email = '' then
    return jsonb_build_object('permitido', false, 'master', false, 'permissoes', null);
  end if;
  select lower(valor) into v_master from configuracoes where chave = 'admin_master';
  if v_email = coalesce(v_master, '') then
    return jsonb_build_object('permitido', true, 'master', true, 'permissoes', null);
  end if;
  select permissoes into v_perm from permissoes_usuarios where lower(email) = v_email;
  if v_perm is null then
    return jsonb_build_object('permitido', false, 'master', false, 'permissoes', null);
  end if;
  return jsonb_build_object('permitido', true, 'master', false, 'permissoes', v_perm);
end $$;
revoke execute on function public.minha_permissao() from public, anon;
grant execute on function public.minha_permissao() to authenticated;

-- Lookup de usuário do Auth por e-mail — exclusivo da service role.
create or replace function public.auth_user_id_por_email(p_email text)
returns uuid
language sql stable security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.auth_user_id_por_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_por_email(text) to service_role;

-- Trigger: bloqueia a criação de conta no Auth fora da allowlist.
create or replace function public.bloquear_usuario_nao_permitido()
returns trigger
language plpgsql security definer set search_path = public as $$
declare v_master text;
begin
  select lower(valor) into v_master from configuracoes where chave = 'admin_master';
  if lower(coalesce(new.email, '')) = coalesce(v_master, '') then
    return new;
  end if;
  if exists (select 1 from permissoes_usuarios p where lower(p.email) = lower(coalesce(new.email, ''))) then
    return new;
  end if;
  raise exception 'Cadastro não permitido. Fale com o administrador do sistema.';
end $$;

revoke execute on function public.bloquear_usuario_nao_permitido() from public, anon, authenticated;

drop trigger if exists trg_bloquear_signup on auth.users;
create trigger trg_bloquear_signup
  before insert on auth.users
  for each row execute function public.bloquear_usuario_nao_permitido();

do $$
declare par text[];
begin
  -- [tabela, menu que controla a gravação]
  foreach par slice 1 in array array[
    ['polos','polos'],
    ['professores','professores'],
    ['professor_polos','professores'],
    ['alunos','alunos'],
    ['aluno_responsaveis','alunos'],
    ['alunos_sugeridos','alunos'],
    ['responsaveis','responsaveis'],
    ['materiais','materiais'],
    ['cronograma','cronograma'],
    ['historico_aulas','historico'],
    ['presencas','historico'],
    ['fotos_aula','historico'],
    ['solicitacoes_contato','dashboard'],
    ['configuracoes','configuracoes'],
    ['permissoes_usuarios','configuracoes']
  ]
  loop
    execute format('alter table %I enable row level security', par[1]);
    execute format('drop policy if exists admin_all on %I', par[1]);
    execute format('drop policy if exists admin_select on %I', par[1]);
    execute format('drop policy if exists admin_insert on %I', par[1]);
    execute format('drop policy if exists admin_update on %I', par[1]);
    execute format('drop policy if exists admin_delete on %I', par[1]);
    execute format(
      'create policy admin_select on %I for select to authenticated using (acesso_permitido())', par[1]);
    execute format(
      'create policy admin_insert on %I for insert to authenticated with check (pode_editar_menu(%L))',
      par[1], par[2]);
    execute format(
      'create policy admin_update on %I for update to authenticated using (pode_editar_menu(%L)) with check (pode_editar_menu(%L))',
      par[1], par[2], par[2]);
    execute format(
      'create policy admin_delete on %I for delete to authenticated using (pode_editar_menu(%L))',
      par[1], par[2]);
  end loop;
end $$;

-- Logs: quem está na lista lê e registra; ninguém edita nem apaga.
alter table logs enable row level security;
drop policy if exists admin_all on logs;
drop policy if exists logs_select on logs;
drop policy if exists logs_insert on logs;
create policy logs_select on logs for select to authenticated using (acesso_permitido());
create policy logs_insert on logs for insert to authenticated with check (acesso_permitido());

-- Segredos: RLS sem policies + revoke — só a service role acessa.
alter table segredos enable row level security;
revoke all on segredos from anon, authenticated;

-- senha_hash e token_version dos polos nunca chegam ao navegador e não
-- podem ser alterados diretamente (só via set_polo_password).
revoke select, update on polos from anon, authenticated;
grant select (id, nome, slug, cep, logradouro, numero, complemento, bairro,
              cidade, estado, responsavel, contato, pix, observacoes,
              latitude, longitude, ciclo_atual, status, created_at)
  on polos to authenticated;
grant update (nome, slug, cep, logradouro, numero, complemento, bairro,
              cidade, estado, responsavel, contato, pix, observacoes,
              latitude, longitude, ciclo_atual, status)
  on polos to authenticated;
grant insert, delete on polos to authenticated;

-- ------------------------------------------------------------
-- FUNÇÕES DE SENHA DO POLO
-- ------------------------------------------------------------

-- Admin define/troca a senha do polo. Trocar a senha incrementa
-- token_version, invalidando todas as sessões antigas de professor.
create or replace function set_polo_password(p_polo_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.role() <> 'authenticated' then
    raise exception 'Acesso negado';
  end if;
  -- Controle de acesso: trocar senha de polo exige permissão de edição em Polos.
  if not pode_editar_menu('polos') then
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
language sql security definer set search_path = public, extensions as $$
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
drop policy if exists admin_storage_select on storage.objects;
drop policy if exists admin_storage_insert on storage.objects;
drop policy if exists admin_storage_update on storage.objects;
drop policy if exists admin_storage_delete on storage.objects;
create policy admin_storage_select on storage.objects
  for select to authenticated
  using (bucket_id in ('materiais','fotos-aulas') and acesso_permitido());
-- Upload/alteração de arquivos segue o controle de acesso por menu:
create policy admin_storage_insert on storage.objects
  for insert to authenticated
  with check (
    (bucket_id = 'materiais'   and pode_editar_menu('materiais'))
    or (bucket_id = 'fotos-aulas' and pode_editar_menu('historico'))
  );
create policy admin_storage_update on storage.objects
  for update to authenticated
  using (
    (bucket_id = 'materiais'   and pode_editar_menu('materiais'))
    or (bucket_id = 'fotos-aulas' and pode_editar_menu('historico'))
  )
  with check (
    (bucket_id = 'materiais'   and pode_editar_menu('materiais'))
    or (bucket_id = 'fotos-aulas' and pode_editar_menu('historico'))
  );
create policy admin_storage_delete on storage.objects
  for delete to authenticated
  using (
    (bucket_id = 'materiais'   and pode_editar_menu('materiais'))
    or (bucket_id = 'fotos-aulas' and pode_editar_menu('historico'))
  );

-- ------------------------------------------------------------
-- PRONTO. Provisionamento do projeto real (já feito em 2026-07):
-- 1. Seeds (via SQL, fora da migração): configuracoes.admin_master,
--    segredos.polo_token_secret (aleatório) e segredos.bootstrap_token.
-- 2. Deploy das Edge Functions 'polo' e 'admin-usuarios'.
-- 3. Bootstrap do admin master via admin-usuarios { action: 'bootstrap' }
--    (o bootstrap_token é apagado após o primeiro uso).
-- 4. Novos usuários: adicionados em /admin/configuracoes — a conta é criada
--    com a senha padrão e o próprio usuário troca depois (avatar > senha).
-- 5. Microsoft Graph (fotos no SharePoint): preencher em segredos as chaves
--    ms_tenant_id, ms_client_id, ms_client_secret, ms_site_url.
-- ------------------------------------------------------------
