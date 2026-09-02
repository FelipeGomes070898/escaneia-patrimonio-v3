create table if not exists patrimonio_perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  email text,
  criado_em timestamptz not null default now()
);

alter table patrimonio_perfis enable row level security;

drop policy if exists "patrimonio_perfis_select" on patrimonio_perfis;
create policy "patrimonio_perfis_select" on patrimonio_perfis
  for select to authenticated using (true);

drop policy if exists "patrimonio_perfis_update_own" on patrimonio_perfis;
create policy "patrimonio_perfis_update_own" on patrimonio_perfis
  for update to authenticated using (auth.uid() = id);

create or replace function public.handle_new_patrimonio_user()
returns trigger as $$
begin
  insert into public.patrimonio_perfis (id, nome, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created_patrimonio on auth.users;
create trigger on_auth_user_created_patrimonio
  after insert on auth.users
  for each row execute procedure public.handle_new_patrimonio_user();

insert into patrimonio_perfis (id, nome, email)
select id, coalesce(raw_user_meta_data->>'nome', split_part(email, '@', 1)), email
from auth.users
on conflict (id) do nothing;

create table if not exists patrimonio_registros (
  id uuid primary key default gen_random_uuid(),
  tipo text,
  patrimonio text,
  patrimonio_key text,
  descricao text,
  local text,
  link text,
  dispositivo text,
  foto_url text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz,
  user_id uuid references auth.users(id),
  criado_por_nome text
);

alter table patrimonio_registros add column if not exists user_id uuid references auth.users(id);
alter table patrimonio_registros add column if not exists criado_por_nome text;

create table if not exists patrimonio_salas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

insert into patrimonio_salas (nome) values
  ('Recepção'), ('Sala 1'), ('Sala 2'), ('Diretoria'), ('Almoxarifado')
on conflict (nome) do nothing;

alter table patrimonio_salas enable row level security;

drop policy if exists "patrimonio_salas_select" on patrimonio_salas;
create policy "patrimonio_salas_select" on patrimonio_salas
  for select to authenticated using (true);

drop policy if exists "patrimonio_salas_insert" on patrimonio_salas;
create policy "patrimonio_salas_insert" on patrimonio_salas
  for insert to authenticated with check (true);

drop policy if exists "patrimonio_salas_delete" on patrimonio_salas;
create policy "patrimonio_salas_delete" on patrimonio_salas
  for delete to authenticated using (true);

alter table patrimonio_registros enable row level security;

drop policy if exists "patrimonio_registros_select" on patrimonio_registros;
drop policy if exists "patrimonio_registros_insert" on patrimonio_registros;
drop policy if exists "patrimonio_registros_update" on patrimonio_registros;
drop policy if exists "patrimonio_registros_delete" on patrimonio_registros;

create policy "patrimonio_registros_select" on patrimonio_registros
  for select to authenticated using (true);
create policy "patrimonio_registros_insert" on patrimonio_registros
  for insert to authenticated with check (true);
create policy "patrimonio_registros_update" on patrimonio_registros
  for update to authenticated using (true);
create policy "patrimonio_registros_delete" on patrimonio_registros
  for delete to authenticated using (true);
