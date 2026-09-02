-- Escaneia Patrimônio — atualização do schema (site novo em Next.js)
-- Só ADICIONA coisas: não apaga nem altera nada do Radar de Investimentos,
-- nem apaga dados já salvos em patrimonio_registros. Pode rodar com
-- segurança quantas vezes quiser (tudo usa "if not exists" / "on conflict").

-- 1) Perfis: nome de cada pessoa da equipe, ligado ao login (auth.users)
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

-- Cria o perfil automaticamente quando alguém se cadastra
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

-- Preenche perfis de quem já tinha conta antes dessa tabela existir
insert into patrimonio_perfis (id, nome, email)
select id, coalesce(raw_user_meta_data->>'nome', split_part(email, '@', 1)), email
from auth.users
on conflict (id) do nothing;

-- 2) Quem cadastrou cada bem (pra tela de Usuários/relatórios)
alter table patrimonio_registros add column if not exists user_id uuid references auth.users(id);
alter table patrimonio_registros add column if not exists criado_por_nome text;

-- 3) Lista de salas/locais configurável (em vez de fixa no código)
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

-- 4) Agora que existe login de verdade, troca as regras de acesso de
--    patrimonio_registros e das fotos: só pra quem está logado (a
--    equipe toda continua vendo os mesmos dados, só não fica mais aberto
--    pra qualquer pessoa da internet sem login).
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

drop policy if exists "patrimonio_fotos_select" on storage.objects;
drop policy if exists "patrimonio_fotos_insert" on storage.objects;
drop policy if exists "patrimonio_fotos_update" on storage.objects;
drop policy if exists "patrimonio_fotos_delete" on storage.objects;

create policy "patrimonio_fotos_select" on storage.objects
  for select to authenticated using (bucket_id = 'patrimonio-fotos');
create policy "patrimonio_fotos_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'patrimonio-fotos');
create policy "patrimonio_fotos_update" on storage.objects
  for update to authenticated using (bucket_id = 'patrimonio-fotos');
create policy "patrimonio_fotos_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'patrimonio-fotos');
