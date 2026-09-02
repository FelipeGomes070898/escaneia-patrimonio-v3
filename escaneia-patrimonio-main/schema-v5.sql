-- Escaneia Patrimônio — ficha em PDF por item. Roda DEPOIS do
-- schema-v4.sql. Só adiciona coluna nova, não apaga nada.

alter table patrimonio_registros add column if not exists documento_pdf_url text;
