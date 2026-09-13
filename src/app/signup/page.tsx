'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignupPage() {
  const router = useRouter();
  const supabase = createClient();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: { nome },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    setCarregando(false);
    if (error) {
      setErro(
        error.message.includes('already registered')
          ? 'Este e-mail já está cadastrado.'
          : 'Não foi possível criar a conta agora.'
      );
      return;
    }
    // Se a confirmação de e-mail estiver desligada no Supabase, já vem com sessão ativa.
    if (data.session) {
      router.push('/dashboard');
      router.refresh();
      return;
    }
    setSucesso(true);
  }

  async function entrarComGoogle() {
    setErro('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setErro('Não foi possível continuar com Google agora.');
  }

  if (sucesso) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-sm bg-surface rounded-lg2 border border-border p-8 shadow-sm text-center">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold mx-auto mb-4">
            EP
          </div>
          <h1 className="font-display font-bold text-lg mb-2">Conta criada!</h1>
          <p className="text-sm text-muted mb-6">
            Enviamos um e-mail de confirmação para <strong>{email}</strong>. Abra o link para ativar sua conta e depois
            volte para entrar. Depois de confirmar, um gestor ou recrutador ainda precisa aprovar seu acesso antes de
            você conseguir usar o sistema.
          </p>
          <Link
            href="/login"
            className="inline-block w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm"
          >
            Ir para o login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm bg-surface rounded-lg2 border border-border p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold">EP</div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">Escaneia Patrimônio</h1>
            <p className="text-xs text-muted uppercase tracking-wide">Criar conta</p>
          </div>
        </div>

        <form onSubmit={cadastrar} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-semibold text-muted">Nome</label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              placeholder="Seu nome"
            />
          </div>
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
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          {erro && <p className="text-sm text-danger">{erro}</p>}

          <button
            type="submit"
            disabled={carregando}
            className="mt-2 w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm disabled:opacity-50"
          >
            {carregando ? 'Criando conta…' : 'Criar conta'}
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
          Continuar com Google
        </button>

        <p className="mt-6 text-center text-sm text-muted">
          Já tem conta?{' '}
          <Link href="/login" className="text-accent font-semibold">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
