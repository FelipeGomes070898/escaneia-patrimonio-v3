-- Escaneia Patrimônio — schema no Supabase (mesmo projeto do Radar de
-- Investimentos). Cole tudo isso no SQL Editor do Supabase e rode
-- (Run). Cria a tabela dos registros, com nome próprio (prefixo
-- "patrimonio_") pra não misturar com as tabelas do outro sistema.

create table if not exists patrimonio_registros (
  id text primary key,
  tipo text,
  patrimonio text,
  patrimonio_key text,
  descricao text,
  local text,
  link text,
  criado_em text,
  atualizado_em text,
  dispositivo text,
  foto_url text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_patrimonio_registros_patrimonio_key
  on patrimonio_registros (patrimonio_key);
create index if not exists idx_patrimonio_registros_atualizado_em
  on patrimonio_registros (atualizado_em);

-- Segurança em nível de linha (RLS): a tabela não é uma ferramenta
-- pública de internet (só quem tem o link do app usa), então liberamos
-- leitura e escrita geral — sem exigir login, pra não travar o pessoal
-- em campo. Isso é equivalente ao que já era feito antes no Cloudflare.
alter table patrimonio_registros enable row level security;

drop policy if exists "patrimonio_registros_select" on patrimonio_registros;
create policy "patrimonio_registros_select"
  on patrimonio_registros for select
  using (true);

drop policy if exists "patrimonio_registros_insert" on patrimonio_registros;
create policy "patrimonio_registros_insert"
  on patrimonio_registros for insert
  with check (true);

drop policy if exists "patrimonio_registros_update" on patrimonio_registros;
create policy "patrimonio_registros_update"
  on patrimonio_registros for update
  using (true);

drop policy if exists "patrimonio_registros_delete" on patrimonio_registros;
create policy "patrimonio_registros_delete"
  on patrimonio_registros for delete
  using (true);

-- Liga o Realtime nessa tabela — é isso que permite outro aparelho ver um
-- registro novo na hora, sem precisar recarregar a página.
alter publication supabase_realtime add table patrimonio_registros;

-- Storage: cria o "bucket" (pasta) onde as fotos ficam guardadas.
-- Marcado como público pra qualquer aparelho conseguir exibir a foto
-- direto pelo link, sem precisar de login.
insert into storage.buckets (id, name, public)
values ('patrimonio-fotos', 'patrimonio-fotos', true)
on conflict (id) do nothing;

drop policy if exists "patrimonio_fotos_select" on storage.objects;
create policy "patrimonio_fotos_select"
  on storage.objects for select
  using (bucket_id = 'patrimonio-fotos');

drop policy if exists "patrimonio_fotos_insert" on storage.objects;
create policy "patrimonio_fotos_insert"
  on storage.objects for insert
  with check (bucket_id = 'patrimonio-fotos');

drop policy if exists "patrimonio_fotos_update" on storage.objects;
create policy "patrimonio_fotos_update"
  on storage.objects for update
  using (bucket_id = 'patrimonio-fotos');

drop policy if exists "patrimonio_fotos_delete" on storage.objects;
create policy "patrimonio_fotos_delete"
  on storage.objects for delete
  using (bucket_id = 'patrimonio-fotos');
