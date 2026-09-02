-- Escaneia Patrimônio — permissões (gestor / recrutador / colaborador),
-- aprovação de acesso e recuperação. Roda DEPOIS do schema-v2.sql.
-- Só adiciona coisas, não apaga nada, e pode ser rodado de novo com segurança.

-- 1) Papel de cada pessoa e se já foi aprovada
alter table patrimonio_perfis add column if not exists role text not null default 'colaborador';
alter table patrimonio_perfis add column if not exists aprovado boolean not null default false;

alter table patrimonio_perfis drop constraint if exists patrimonio_perfis_role_check;
alter table patrimonio_perfis add constraint patrimonio_perfis_role_check
  check (role in ('gestor', 'recrutador', 'colaborador'));

-- Ninguém ganha acesso automático nessa migração — inclusive pessoas que já
-- tinham perfil aqui antes (de qualquer sistema que use esse mesmo projeto).
-- Depois de rodar isso, você mesmo vira gestor com o passo 2 do guia.

-- 2) Cadastro automático: toda conta nova entra como "colaborador" pendente
--    de aprovação. Ninguém entra sozinho como gestor ou recrutador.
create or replace function public.handle_new_patrimonio_user()
returns trigger as $$
begin
  insert into public.patrimonio_perfis (id, nome, email, role, aprovado)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    new.email,
    'colaborador',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 3) Nenhuma pessoa comum consegue alterar role/aprovado diretamente na
--    tabela (mesmo tendo login) — só através das funções abaixo, que
--    conferem quem está pedindo antes de fazer qualquer mudança.
revoke update on patrimonio_perfis from authenticated;

drop policy if exists "patrimonio_perfis_update_own" on patrimonio_perfis;

-- Aprova um colaborador pendente. Gestor aprova qualquer um; recrutador só
-- consegue aprovar quem já está com o papel "colaborador" (não pode
-- promover ninguém a recrutador/gestor).
create or replace function public.aprovar_usuario(usuario_id uuid)
returns void as $$
declare
  meu_role text;
  alvo_role text;
begin
  select role into meu_role from patrimonio_perfis where id = auth.uid() and aprovado = true;
  if meu_role not in ('gestor', 'recrutador') then
    raise exception 'Sem permissão para aprovar usuários.';
  end if;

  select role into alvo_role from patrimonio_perfis where id = usuario_id;
  if meu_role = 'recrutador' and alvo_role <> 'colaborador' then
    raise exception 'Recrutador só pode aprovar colaboradores.';
  end if;

  update patrimonio_perfis set aprovado = true where id = usuario_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Troca o papel de alguém (colaborador / recrutador / gestor). Só gestor
-- aprovado pode fazer isso. Promover já aprova automaticamente.
create or replace function public.promover_usuario(usuario_id uuid, novo_role text)
returns void as $$
declare
  meu_role text;
begin
  if novo_role not in ('gestor', 'recrutador', 'colaborador') then
    raise exception 'Papel inválido.';
  end if;

  select role into meu_role from patrimonio_perfis where id = auth.uid() and aprovado = true;
  if meu_role <> 'gestor' then
    raise exception 'Só um gestor pode alterar papéis.';
  end if;

  update patrimonio_perfis set role = novo_role, aprovado = true where id = usuario_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Revoga o acesso de alguém (sem apagar o histórico de itens cadastrados
-- por essa pessoa). Só gestor aprovado pode fazer isso, e nunca pode
-- zerar o último gestor aprovado do sistema — pra ninguém ficar trancado
-- pra fora sem querer.
create or replace function public.revogar_acesso(usuario_id uuid)
returns void as $$
declare
  meu_role text;
  total_gestores int;
  alvo_role text;
begin
  select role into meu_role from patrimonio_perfis where id = auth.uid() and aprovado = true;
  if meu_role <> 'gestor' then
    raise exception 'Só um gestor pode revogar acesso.';
  end if;

  select role into alvo_role from patrimonio_perfis where id = usuario_id;
  if alvo_role = 'gestor' then
    select count(*) into total_gestores from patrimonio_perfis where role = 'gestor' and aprovado = true;
    if total_gestores <= 1 then
      raise exception 'Não é possível remover o último gestor do sistema.';
    end if;
  end if;

  update patrimonio_perfis set aprovado = false where id = usuario_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Cada pessoa pode alterar só o próprio nome (não o papel nem a aprovação).
create or replace function public.atualizar_meu_nome(novo_nome text)
returns void as $$
begin
  update patrimonio_perfis set nome = novo_nome where id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.aprovar_usuario(uuid) to authenticated;
grant execute on function public.promover_usuario(uuid, text) to authenticated;
grant execute on function public.revogar_acesso(uuid) to authenticated;
grant execute on function public.atualizar_meu_nome(text) to authenticated;

-- 4) Marca de "duplicado" fica só na consulta feita pelo app (compara pelo
--    patrimonio_key já existente) — nenhuma tabela nova é necessária aqui.
