'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Perfil {
  id: string;
  nome: string;
  email: string;
  role: string;
  aprovado: boolean;
  criado_em: string;
}

const NOME_PAPEL: Record<string, string> = {
  gestor: 'Gestor',
  recrutador: 'Recrutador',
  colaborador: 'Colaborador'
};

export default function UsuariosClient({
  perfis: perfisIniciais,
  contagem,
  meuId,
  meuRole
}: {
  perfis: Perfil[];
  contagem: Record<string, number>;
  meuId: string;
  meuRole: string;
}) {
  const supabase = createClient();
  const [perfis, setPerfis] = useState(perfisIniciais);
  const [carregandoId, setCarregandoId] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  const souGestor = meuRole === 'gestor';
  const possoGerenciar = meuRole === 'gestor' || meuRole === 'recrutador';

  // formulário de novo usuário
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('colaborador');
  const [criando, setCriando] = useState(false);
  const [resultado, setResultado] = useState<{ email: string; senhaTemporaria: string; role: string } | null>(null);
  const [erroForm, setErroForm] = useState('');

  async function aprovar(id: string) {
    setErro('');
    setCarregandoId(id);
    const { error } = await supabase.rpc('aprovar_usuario', { usuario_id: id });
    setCarregandoId(null);
    if (error) {
      setErro(error.message);
      return;
    }
    setPerfis((prev) => prev.map((p) => (p.id === id ? { ...p, aprovado: true } : p)));
  }

  async function promover(id: string, novoRole: string) {
    setErro('');
    setCarregandoId(id);
    const { error } = await supabase.rpc('promover_usuario', { usuario_id: id, novo_role: novoRole });
    setCarregandoId(null);
    if (error) {
      setErro(error.message);
      return;
    }
    setPerfis((prev) => prev.map((p) => (p.id === id ? { ...p, role: novoRole, aprovado: true } : p)));
  }

  async function revogar(id: string) {
    if (!confirm('Revogar o acesso dessa pessoa? Ela deixa de conseguir entrar no sistema, mas os itens que ela já cadastrou continuam salvos.')) return;
    setErro('');
    setCarregandoId(id);
    const { error } = await supabase.rpc('revogar_acesso', { usuario_id: id });
    setCarregandoId(null);
    if (error) {
      setErro(error.message);
      return;
    }
    setPerfis((prev) => prev.map((p) => (p.id === id ? { ...p, aprovado: false } : p)));
  }

  async function criarUsuario(e: React.FormEvent) {
    e.preventDefault();
    setErroForm('');
    setResultado(null);
    setCriando(true);
    try {
      const resp = await fetch('/api/usuarios/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, role })
      });
      const json = await resp.json();
      if (!resp.ok) {
        setErroForm(json.error || 'Não foi possível criar a conta.');
        return;
      }
      setResultado(json);
      setPerfis((prev) => [
        ...prev,
        { id: crypto.randomUUID(), nome, email: json.email, role: json.role, aprovado: true, criado_em: new Date().toISOString() }
      ]);
      setNome('');
      setEmail('');
      setRole('colaborador');
    } catch {
      setErroForm('Falha de conexão. Tente novamente.');
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Usuários / Equipe</h1>
          <p className="text-sm text-muted mt-1">Pessoas com acesso ao Escaneia Patrimônio.</p>
        </div>
        {possoGerenciar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="rounded-full bg-accent text-white font-semibold px-5 py-2.5 text-sm"
          >
            {mostrarForm ? 'Cancelar' : '+ Novo usuário'}
          </button>
        )}
      </div>

      {erro && <p className="text-sm text-danger">{erro}</p>}

      {mostrarForm && (
        <form onSubmit={criarUsuario} className="bg-surface rounded-lg2 border border-border p-5 flex flex-col gap-3">
          <h2 className="font-display font-bold text-base">Cadastrar novo usuário</h2>
          <div>
            <label className="text-xs font-semibold text-muted">Nome</label>
            <input
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1 w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent"
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
            />
          </div>
          {souGestor && (
            <div>
              <label className="text-xs font-semibold text-muted">Papel</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="mt-1 w-full rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-surface"
              >
                <option value="colaborador">Colaborador</option>
                <option value="recrutador">Recrutador</option>
                <option value="gestor">Gestor</option>
              </select>
            </div>
          )}
          {!souGestor && (
            <p className="text-xs text-muted">Recrutadores só podem cadastrar colaboradores.</p>
          )}

          {erroForm && <p className="text-sm text-danger">{erroForm}</p>}

          <button
            type="submit"
            disabled={criando}
            className="rounded-full bg-accent text-white font-semibold py-2.5 text-sm disabled:opacity-50"
          >
            {criando ? 'Criando…' : 'Criar conta'}
          </button>

          {resultado && (
            <div className="bg-ok/10 text-ok rounded-md2 px-4 py-3 text-sm">
              Conta criada para <strong>{resultado.email}</strong>. Senha temporária:{' '}
              <span className="font-mono font-bold">{resultado.senhaTemporaria}</span>
              <br />
              Passe essa senha pra pessoa por um canal seguro (WhatsApp, por exemplo) e peça pra ela trocar em
              Configurações depois do primeiro login.
            </div>
          )}
        </form>
      )}

      <div className="bg-surface rounded-lg2 border border-border overflow-hidden">
        <div className="flex flex-col divide-y divide-border">
          {perfis.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-5 py-4 flex-wrap">
              <div className="w-10 h-10 shrink-0 rounded-full bg-surface-2 border border-border flex items-center justify-center text-sm font-bold text-muted">
                {(p.nome || p.email || '?').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">
                  {p.nome || 'Sem nome'} {p.id === meuId && <span className="text-xs text-muted">(você)</span>}
                </p>
                <p className="text-xs text-muted truncate">{p.email}</p>
              </div>

              <div className="text-right shrink-0 mr-2">
                <p className="text-sm font-bold">{contagem[p.id] || 0}</p>
                <p className="text-xs text-muted">itens</p>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {!p.aprovado && <span className="text-xs font-bold text-warn bg-warn/10 px-2 py-1 rounded">Pendente</span>}

                {souGestor ? (
                  <select
                    value={p.role}
                    disabled={carregandoId === p.id}
                    onChange={(e) => promover(p.id, e.target.value)}
                    className="rounded-md2 border border-border px-2 py-1.5 text-xs font-semibold bg-surface disabled:opacity-50"
                  >
                    <option value="colaborador">Colaborador</option>
                    <option value="recrutador">Recrutador</option>
                    <option value="gestor">Gestor</option>
                  </select>
                ) : (
                  <span className="text-xs font-semibold text-muted">{NOME_PAPEL[p.role] || p.role}</span>
                )}

                {!p.aprovado && possoGerenciar && (
                  <button
                    onClick={() => aprovar(p.id)}
                    disabled={carregandoId === p.id}
                    className="text-xs font-semibold text-ok hover:underline disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                )}

                {souGestor && p.aprovado && p.id !== meuId && (
                  <button
                    onClick={() => revogar(p.id)}
                    disabled={carregandoId === p.id}
                    className="text-xs font-semibold text-danger hover:underline disabled:opacity-50"
                  >
                    Revogar
                  </button>
                )}
              </div>
            </div>
          ))}
          {perfis.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">Nenhum usuário cadastrado ainda.</p>}
        </div>
      </div>

      <div className="text-xs text-muted flex flex-col gap-1">
        <p><strong>Gestor</strong>: controla tudo, inclusive papéis e acesso de outras pessoas.</p>
        <p><strong>Recrutador</strong>: pode cadastrar e aprovar novos colaboradores, mas não pode revogar acesso nem promover ninguém.</p>
        <p><strong>Colaborador</strong>: faz o levantamento de bens normalmente.</p>
      </div>
    </div>
  );
}
