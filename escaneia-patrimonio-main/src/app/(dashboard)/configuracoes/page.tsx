import { createClient } from '@/lib/supabase/server';
import ConfiguracoesClient from '@/components/ConfiguracoesClient';

export const dynamic = 'force-dynamic';

export default async function ConfiguracoesPage() {
  const supabase = createClient();
  const { data: salas } = await supabase.from('patrimonio_salas').select('nome').order('nome');

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: perfil } = user
    ? await supabase.from('patrimonio_perfis').select('nome').eq('id', user.id).maybeSingle()
    : { data: null as any };

  return (
    <ConfiguracoesClient
      salasIniciais={(salas || []).map((s: any) => s.nome)}
      nomeAtual={perfil?.nome || user?.email?.split('@')[0] || ''}
    />
  );
}
