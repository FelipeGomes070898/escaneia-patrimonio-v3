-- Escaneia Patrimônio — importar a planilha oficial de levantamento que a
-- escola já tem (a mesma que sai do e-Estado, com Descrição, Tombamento,
-- Ambiente, Estado de conservação, Classificação etc.) pra servir de
-- consulta rápida na hora do levantamento, sem depender do site do governo
-- (que às vezes cai). Roda DEPOIS do schema-v9.sql. Só adiciona coisas,
-- não apaga nada.

create table if not exists patrimonio_planilha_itens (
  id uuid primary key default gen_random_uuid(),
  escola text not null,
  tombamento_key text not null,
  tombamento text,
  tombamento_antigo text,
  descricao text,
  ambiente text,
  estado_conservacao text,
  classificacao text,
  observacao text,
  importado_em timestamptz not null default now()
);

create index if not exists patrimonio_planilha_itens_escola_tombamento_idx
  on patrimonio_planilha_itens (escola, tombamento_key);

alter table patrimonio_planilha_itens enable row level security;

drop policy if exists "patrimonio_planilha_itens_select" on patrimonio_planilha_itens;
create policy "patrimonio_planilha_itens_select" on patrimonio_planilha_itens
  for select to authenticated using (true);

drop policy if exists "patrimonio_planilha_itens_insert" on patrimonio_planilha_itens;
create policy "patrimonio_planilha_itens_insert" on patrimonio_planilha_itens
  for insert to authenticated with check (true);

drop policy if exists "patrimonio_planilha_itens_delete" on patrimonio_planilha_itens;
create policy "patrimonio_planilha_itens_delete" on patrimonio_planilha_itens
  for delete to authenticated using (true);
