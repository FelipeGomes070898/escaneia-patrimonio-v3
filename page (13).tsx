'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro('E-mail ou senha incorretos.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  async function entrarComGoogle() {
    setErro('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setErro('Não foi possível entrar com Google agora.');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm bg-surface rounded-lg2 border border-border p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold">EP</div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">Escaneia Patrimônio</h1>
            <p className="text-xs text-muted uppercase tracking-wide">Levantamento de bens</p>
          </div>
        </div>

        <form onSubmit={entrar} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-muted">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="voce@exemplo.com"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted">Senha</label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1 w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="••••••••"
            />
          </div>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <div className="text-right -mt-1">
            <Link href="/recuperar-senha" className="text-xs text-accent font-semibold">
              Esqueci minha senha
            </Link>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="mt-2 w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm disabled:opacity-50"
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted">ou</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <button
          onClick={entrarComGoogle}
          className="w-full rounded-full border border-border py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          Entrar com Google
        </button>

        <p className="mt-6 text-center text-sm text-muted">
          Não tem conta?{' '}
          <Link href="/signup" className="text-accent font-semibold">
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
