-- Escaneia Patrimônio — fotos guardadas direto no Supabase (sem precisar
-- do Google Drive configurado). Cria o "bucket" de arquivos, se ainda não
-- existir. As permissões de quem pode enviar/ver já foram criadas no
-- schema-v2.sql (política em cima de storage.objects pro bucket
-- "patrimonio-fotos"), então aqui só falta o bucket em si.

insert into storage.buckets (id, name, public)
values ('patrimonio-fotos', 'patrimonio-fotos', true)
on conflict (id) do nothing;
