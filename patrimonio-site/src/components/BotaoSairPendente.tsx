'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function BotaoSairPendente() {
  const router = useRouter();
  const supabase = createClient();

  async function sair() {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <button
      onClick={sair}
      className="w-full rounded-full border border-border py-2.5 text-sm font-semibold hover:bg-surface-2"
    >
      Sair
    </button>
  );
}
