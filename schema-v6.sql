-- Escaneia Patrimônio — planilha de regularização. Roda DEPOIS do
-- schema-v5.sql. Só adiciona colunas novas, não apaga nada.

-- Onde o tombamento está registrado no sistema do governo (campo
-- "Departamento" do e-estado.ro.gov.br) — fica separado do "local", que é
-- onde a pessoa encontrou o bem de verdade durante o levantamento.
alter table patrimonio_registros add column if not exists departamento_governo text;

-- ID (no Google Drive) da foto do bem, guardada solta (além de já entrar
-- na ficha em PDF) pra poder aparecer dentro da planilha exportada.
alter table patrimonio_registros add column if not exists foto_item_drive_id text;
