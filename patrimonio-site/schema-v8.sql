-- Escaneia Patrimônio — itens sem etiqueta de tombamento (só com fotos) e
-- medidas do item (largura/altura/profundidade, digitadas à mão). Roda
-- DEPOIS do schema-v7.sql. Só adiciona colunas novas, não apaga nada.

-- Marca os registros cadastrados sem nenhum número de patrimônio (a
-- pessoa marcou "Este item não tem etiqueta/tombo" na tela de
-- Levantamento) — útil pra depois revisar/filtrar esses casos nos
-- Relatórios. Nesses registros o "patrimonio_key" recebe um valor próprio
-- (tipo "SEM-TOMBO-..."), então nunca fica vazio nem colide com outro.
alter table patrimonio_registros add column if not exists sem_tombo boolean not null default false;

-- Medidas opcionais do item, em centímetros.
alter table patrimonio_registros add column if not exists medida_largura_cm numeric;
alter table patrimonio_registros add column if not exists medida_altura_cm numeric;
alter table patrimonio_registros add column if not exists medida_profundidade_cm numeric;
