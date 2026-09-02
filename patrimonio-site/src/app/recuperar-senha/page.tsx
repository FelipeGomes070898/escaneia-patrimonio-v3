'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RecuperarSenhaPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`
    });
    setEnviando(false);
    if (error) {
      setErro('Não foi possível enviar o e-mail agora. Tente de novo em alguns minutos.');
      return;
    }
    setEnviado(true);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm bg-surface rounded-lg2 border border-border p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold">EP</div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">Escaneia Patrimônio</h1>
            <p className="text-xs text-muted uppercase tracking-wide">Recuperar acesso</p>
          </div>
        </div>

        {enviado ? (
          <p className="text-sm text-muted">
            Se esse e-mail estiver cadastrado, enviamos um link para redefinir a senha. Abra o e-mail e siga o link
            para criar uma senha nova.
          </p>
        ) : (
          <form onSubmit={enviar} className="flex flex-col gap-3">
            <p className="text-sm text-muted">
              Digite o e-mail da sua conta. Vamos enviar um link para você criar uma senha nova.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="voce@exemplo.com"
            />
            {erro && <p className="text-sm text-danger">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="mt-1 w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar link de recuperação'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted">
          <Link href="/login" className="text-accent font-semibold">
            Voltar para o login
          </Link>
        </p>
      </div>
    </div>
  );
}
