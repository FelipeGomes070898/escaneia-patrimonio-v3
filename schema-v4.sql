-- Escaneia Patrimônio — fotos no Google Drive. Roda DEPOIS do
-- schema-v3.sql. Só adiciona colunas novas, não apaga nada (inclusive a
-- coluna antiga foto_url continua existindo, só não é mais usada).

alter table patrimonio_registros add column if not exists foto_tombo_url text;
alter table patrimonio_registros add column if not exists foto_item_url text;
