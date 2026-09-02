import { createClient } from '@/lib/supabase/server';
import UsuariosClient from '@/components/UsuariosClient';

export const dynamic = 'force-dynamic';

export default async function UsuariosPage() {
  const supabase = createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: meuPerfil } = user
    ? await supabase.from('patrimonio_perfis').select('role').eq('id', user.id).maybeSingle()
    : { data: null as any };

  const { data: perfis } = await supabase
    .from('patrimonio_perfis')
    .select('id, nome, email, role, aprovado, criado_em')
    .order('criado_em', { ascending: true });

  const { data: registros } = await supabase.from('patrimonio_registros').select('user_id');
  const contagem: Record<string, number> = {};
  (registros || []).forEach((r: any) => {
    if (r.user_id) contagem[r.user_id] = (contagem[r.user_id] || 0) + 1;
  });

  return (
    <UsuariosClient
      perfis={perfis || []}
      contagem={contagem}
      meuId={user?.id || ''}
      meuRole={meuPerfil?.role || 'colaborador'}
    />
  );
}
