'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RedefinirSenhaPage() {
  const supabase = createClient();
  const router = useRouter();
  const [pronto, setPronto] = useState(false);
  const [senha1, setSenha1] = useState('');
  const [senha2, setSenha2] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setPronto(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setPronto(true);
    });
    return () => listener.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (senha1.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (senha1 !== senha2) {
      setErro('As senhas não são iguais.');
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha1 });
    setSalvando(false);
    if (error) {
      setErro('Não foi possível trocar a senha. Peça um novo link em "Esqueci minha senha".');
      return;
    }
    setOk(true);
    setTimeout(() => {
      router.push('/dashboard');
      router.refresh();
    }, 1500);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-2 px-4">
      <div className="w-full max-w-sm bg-surface rounded-lg2 border border-border p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-md bg-accent flex items-center justify-center text-white font-bold">EP</div>
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">Escaneia Patrimônio</h1>
            <p className="text-xs text-muted uppercase tracking-wide">Criar nova senha</p>
          </div>
        </div>

        {!pronto && (
          <p className="text-sm text-muted">
            Abra essa página a partir do link que chegou no seu e-mail. Se o link expirou, peça um novo em "Esqueci
            minha senha" na tela de login.
          </p>
        )}

        {pronto && !ok && (
          <form onSubmit={salvar} className="flex flex-col gap-3">
            <input
              type="password"
              required
              value={senha1}
              onChange={(e) => setSenha1(e.target.value)}
              placeholder="Nova senha (mínimo 6 caracteres)"
              className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <input
              type="password"
              required
              value={senha2}
              onChange={(e) => setSenha2(e.target.value)}
              placeholder="Confirme a nova senha"
              className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {erro && <p className="text-sm text-danger">{erro}</p>}
            <button
              type="submit"
              disabled={salvando}
              className="mt-1 w-full rounded-full bg-accent text-white font-semibold py-2.5 text-sm disabled:opacity-50"
            >
              {salvando ? 'Salvando…' : 'Salvar nova senha'}
            </button>
          </form>
        )}

        {ok && <p className="text-sm text-ok">Senha alterada! Entrando…</p>}
      </div>
    </div>
  );
}
