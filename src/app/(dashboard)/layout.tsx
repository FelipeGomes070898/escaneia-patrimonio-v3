import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import Sidebar from '@/components/Sidebar';
import BotaoSairPendente from '@/components/BotaoSairPendente';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('patrimonio_perfis')
    .select('nome, role, aprovado')
    .eq('id', user.id)
    .maybeSingle();

  const nome = perfil?.nome || user.user_metadata?.nome || user.email?.split('@')[0] || 'Usuário';

  if (!perfil?.aprovado) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-sm bg-surface rounded-lg2 border border-border p-8 shadow-sm text-center">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold mx-auto mb-4">
            EP
          </div>
          <h1 className="font-display font-bold text-lg mb-2">Aguardando aprovação</h1>
          <p className="text-sm text-muted mb-6">
            Sua conta ({user.email}) ainda não foi aprovada por um gestor ou recrutador. Peça para alguém da equipe
            liberar seu acesso na tela de Usuários.
          </p>
          <BotaoSairPendente />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen md:flex bg-surface-2">
      <Sidebar nome={nome} email={user.email || ''} role={perfil.role} />
      <main className="flex-1 min-w-0 p-4 md:p-8">{children}</main>
    </div>
  );
}
