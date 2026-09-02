'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ConfiguracoesClient({
  salasIniciais,
  nomeAtual
}: {
  salasIniciais: string[];
  nomeAtual: string;
}) {
  const supabase = createClient();
  const [salas, setSalas] = useState<string[]>(salasIniciais);
  const [nova, setNova] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const [nome, setNome] = useState(nomeAtual);
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [mensagemNome, setMensagemNome] = useState('');

  const [senha1, setSenha1] = useState('');
  const [senha2, setSenha2] = useState('');
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [mensagemSenha, setMensagemSenha] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  async function salvarNome() {
    if (!nome.trim()) return;
    setSalvandoNome(true);
    setMensagemNome('');
    const { error } = await supabase.rpc('atualizar_meu_nome', { novo_nome: nome.trim() });
    setSalvandoNome(false);
    setMensagemNome(error ? 'Não foi possível salvar o nome.' : 'Nome atualizado!');
  }

  async function trocarSenha(e: React.FormEvent) {
    e.preventDefault();
    setMensagemSenha(null);
    if (senha1.length < 6) {
      setMensagemSenha({ tipo: 'erro', texto: 'A senha precisa ter pelo menos 6 caracteres.' });
      return;
    }
    if (senha1 !== senha2) {
      setMensagemSenha({ tipo: 'erro', texto: 'As senhas não são iguais.' });
      return;
    }
    setSalvandoSenha(true);
    const { error } = await supabase.auth.updateUser({ password: senha1 });
    setSalvandoSenha(false);
    if (error) {
      setMensagemSenha({ tipo: 'erro', texto: 'Não foi possível trocar a senha. Tente novamente.' });
      return;
    }
    setMensagemSenha({ tipo: 'ok', texto: 'Senha alterada com sucesso!' });
    setSenha1('');
    setSenha2('');
  }

  async function adicionar() {
    const nome = nova.trim();
    if (!nome) return;
    if (salas.includes(nome)) {
      setErro('Esse local já existe.');
      return;
    }
    setSalvando(true);
    setErro('');
    const { error } = await supabase.from('patrimonio_salas').insert({ nome });
    setSalvando(false);
    if (error) {
      setErro('Não foi possível adicionar. Tente novamente.');
      return;
    }
    setSalas((prev) => [...prev, nome].sort());
    setNova('');
  }

  async function remover(nome: string) {
    if (!confirm(`Remover o local "${nome}"? Isso não apaga os bens já cadastrados nele.`)) return;
    const { error } = await supabase.from('patrimonio_salas').delete().eq('nome', nome);
    if (!error) setSalas((prev) => prev.filter((s) => s !== nome));
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-display font-bold text-2xl">Configurações</h1>
        <p className="text-sm text-muted mt-1">Gerencie os locais/salas usados no levantamento.</p>
      </div>

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <h2 className="font-display font-bold text-base mb-3">Locais cadastrados</h2>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && adicionar()}
            placeholder="Nome do novo local"
            className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={adicionar}
            disabled={salvando}
            className="rounded-md2 bg-accent text-white px-4 py-2 text-sm font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            Adicionar
          </button>
        </div>
        {erro && <p className="text-xs text-danger mb-3">{erro}</p>}

        <div className="flex flex-col divide-y divide-border">
          {salas.map((s) => (
            <div key={s} className="flex items-center justify-between py-2.5">
              <span className="text-sm">{s}</span>
              <button onClick={() => remover(s)} className="text-xs font-semibold text-danger hover:underline">
                Remover
              </button>
            </div>
          ))}
          {salas.length === 0 && <p className="text-sm text-muted py-4">Nenhum local cadastrado.</p>}
        </div>
      </div>

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <h2 className="font-display font-bold text-base mb-3">Minha conta</h2>

        <label className="text-xs font-semibold text-muted">Nome exibido</label>
        <div className="flex gap-2 mt-1 mb-1">
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="flex-1 rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={salvarNome}
            disabled={salvandoNome}
            className="rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50 whitespace-nowrap"
          >
            Salvar
          </button>
        </div>
        {mensagemNome && <p className="text-xs text-muted mb-4">{mensagemNome}</p>}

        <form onSubmit={trocarSenha} className="flex flex-col gap-2 mt-4 pt-4 border-t border-border">
          <label className="text-xs font-semibold text-muted">Trocar senha</label>
          <input
            type="password"
            value={senha1}
            onChange={(e) => setSenha1(e.target.value)}
            placeholder="Nova senha (mínimo 6 caracteres)"
            className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <input
            type="password"
            value={senha2}
            onChange={(e) => setSenha2(e.target.value)}
            placeholder="Confirme a nova senha"
            className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {mensagemSenha && (
            <p className={`text-xs ${mensagemSenha.tipo === 'ok' ? 'text-ok' : 'text-danger'}`}>{mensagemSenha.texto}</p>
          )}
          <button
            type="submit"
            disabled={salvandoSenha}
            className="self-start rounded-md2 border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
          >
            {salvandoSenha ? 'Salvando…' : 'Trocar senha'}
          </button>
        </form>
      </div>
    </div>
  );
}
