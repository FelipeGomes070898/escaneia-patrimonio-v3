'use client';

import { useMemo, useState } from 'react';

interface Registro {
  id: string;
  patrimonio: string;
  patrimonio_key?: string;
  descricao: string;
  local: string;
  criado_em: string;
  criado_por_nome: string | null;
  link: string;
  documento_pdf_url: string | null;
}

export default function RelatoriosClient({ registros, locais }: { registros: Registro[]; locais: string[] }) {
  const [busca, setBusca] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('');
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);

  // Marca como duplicado qualquer tombamento que aparece mais de uma vez
  // em TODOS os registros (não só nos filtrados) — mesma regra usada na
  // planilha exportada.
  const duplicados = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const r of registros) {
      const chave = r.patrimonio_key || r.patrimonio;
      contagem.set(chave, (contagem.get(chave) || 0) + 1);
    }
    return contagem;
  }, [registros]);

  function ehDuplicado(r: Registro) {
    const chave = r.patrimonio_key || r.patrimonio;
    return (duplicados.get(chave) || 0) > 1;
  }

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return registros.filter((r) => {
      if (filtroLocal && r.local !== filtroLocal) return false;
      if (!termo) return true;
      return (
        (r.patrimonio || '').toLowerCase().includes(termo) ||
        (r.descricao || '').toLowerCase().includes(termo) ||
        (r.criado_por_nome || '').toLowerCase().includes(termo)
      );
    });
  }, [registros, busca, filtroLocal]);

  async function exportarPlanilha() {
    setGerandoPlanilha(true);
    try {
      const params = new URLSearchParams();
      if (filtroLocal) params.set('local', filtroLocal);
      if (busca.trim()) params.set('busca', busca.trim());
      const resp = await fetch(`/api/relatorios/planilha?${params.toString()}`);
      if (!resp.ok) {
        const json = await resp.json().catch(() => null);
        throw new Error(json?.error || 'Não foi possível gerar a planilha.');
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planilha-regularizacao-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Não foi possível gerar a planilha.');
    } finally {
      setGerandoPlanilha(false);
    }
  }

  function exportarCsv() {
    const cabecalho = ['Patrimônio', 'Descrição', 'Local', 'Cadastrado por', 'Data', 'Link'];
    const linhas = filtrados.map((r) => [
      r.patrimonio,
      r.descricao || '',
      r.local || '',
      r.criado_por_nome || '',
      formatarData(r.criado_em),
      r.link || ''
    ]);
    const csv = [cabecalho, ...linhas]
      .map((linha) => linha.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `patrimonio-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Relatórios</h1>
          <p className="text-sm text-muted mt-1">{filtrados.length} de {registros.length} itens</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={exportarPlanilha}
            disabled={gerandoPlanilha}
            className="rounded-full bg-accent text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50"
          >
            {gerandoPlanilha ? 'Gerando planilha…' : 'Exportar planilha (XLSX)'}
          </button>
          <button
            onClick={exportarCsv}
            className="rounded-full border border-border font-semibold px-5 py-2.5 text-sm hover:bg-surface-2"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {Array.from(duplicados.values()).some((c) => c > 1) && (
        <p className="text-xs bg-warn/10 text-warn rounded-md2 px-3 py-2">
          ⚠ Existem tombamentos cadastrados mais de uma vez — as linhas em laranja abaixo (e na planilha exportada)
          marcam esses casos.
        </p>
      )}

      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por patrimônio, descrição ou responsável…"
          className="flex-1 min-w-[220px] rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-surface"
        />
        <select
          value={filtroLocal}
          onChange={(e) => setFiltroLocal(e.target.value)}
          className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-surface"
        >
          <option value="">Todos os locais</option>
          {locais.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-surface rounded-lg2 border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Patrimônio</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Descrição</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Local</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Cadastrado por</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Data</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Ficha</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((r) => {
              const duplicado = ehDuplicado(r);
              return (
                <tr key={r.id} className={`border-b border-border last:border-0 ${duplicado ? 'bg-warn/10' : ''}`}>
                  <td className="px-4 py-3 font-mono">
                    {r.patrimonio}
                    {duplicado && <span title="Tombamento cadastrado mais de uma vez" className="ml-1.5 text-warn">⚠</span>}
                  </td>
                  <td className="px-4 py-3">{r.descricao || '—'}</td>
                  <td className="px-4 py-3">{r.local || '—'}</td>
                  <td className="px-4 py-3">{r.criado_por_nome || '—'}</td>
                  <td className="px-4 py-3 text-muted">{formatarData(r.criado_em)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {r.documento_pdf_url ? (
                      <a href={r.documento_pdf_url} target="_blank" rel="noreferrer" className="text-accent font-semibold text-xs hover:underline">
                        Ver PDF
                      </a>
                    ) : (
                      <span className="text-muted text-xs">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatarData(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
