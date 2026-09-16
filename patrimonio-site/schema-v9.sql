-- Escaneia Patrimônio — levantamento organizado por escola/unidade. Roda
-- DEPOIS do schema-v8.sql. Só adiciona coisas, não apaga nada.

-- 1) Lista de escolas/unidades configurável, do mesmo jeito que já existe
--    pra "patrimonio_salas" (locais/salas) — todo mundo da equipe vê e
--    pode adicionar uma nova na hora, sem precisar de um gestor cadastrar
--    antes.
create table if not exists patrimonio_escolas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

alter table patrimonio_escolas enable row level security;

drop policy if exists "patrimonio_escolas_select" on patrimonio_escolas;
create policy "patrimonio_escolas_select" on patrimonio_escolas
  for select to authenticated using (true);

drop policy if exists "patrimonio_escolas_insert" on patrimonio_escolas;
create policy "patrimonio_escolas_insert" on patrimonio_escolas
  for insert to authenticated with check (true);

drop policy if exists "patrimonio_escolas_delete" on patrimonio_escolas;
create policy "patrimonio_escolas_delete" on patrimonio_escolas
  for delete to authenticated using (true);

-- 2) Cada registro guarda de qual escola/unidade ele é — assim dá pra
--    filtrar e exportar a planilha só daquela escola, sem precisar
--    catar linha por linha depois.
alter table patrimonio_registros add column if not exists escola text;
