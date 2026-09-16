'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { removerFotosDoStorage } from '@/lib/supabaseStorage';

interface Registro {
  id: string;
  patrimonio: string;
  patrimonio_key?: string;
  descricao: string;
  local: string;
  escola?: string | null;
  criado_em: string;
  criado_por_nome: string | null;
  link: string;
  documento_pdf_url: string | null;
  foto_item_url: string | null;
  foto_tombo_url: string | null;
  sem_tombo?: boolean;
  medida_largura_cm?: number | null;
  medida_altura_cm?: number | null;
  medida_profundidade_cm?: number | null;
}

const CHAVE_ESCOLA_ATUAL = 'escaneia_escola_atual';

function textoMedidas(r: Registro): string {
  const partes: string[] = [];
  if (r.medida_largura_cm) partes.push(`${r.medida_largura_cm}`);
  if (r.medida_altura_cm) partes.push(`${r.medida_altura_cm}`);
  if (r.medida_profundidade_cm) partes.push(`${r.medida_profundidade_cm}`);
  return partes.length ? partes.join(' × ') + ' cm' : '';
}

export default function RelatoriosClient({
  registros: registrosIniciais,
  locais,
  escolas
}: {
  registros: Registro[];
  locais: string[];
  escolas: string[];
}) {
  const supabase = createClient();

  // Cópia local da lista — precisa poder "encolher" na hora (sem recarregar
  // a página inteira) quando um item é excluído em "Bens registrados".
  const [registros, setRegistros] = useState<Registro[]>(registrosIniciais);

  const [busca, setBusca] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('');
  // Já chega filtrado pela escola que essa pessoa estava usando no
  // levantamento (lembrada nesse aparelho) — assim quem só cuida de uma
  // escola já vê direto os itens dela, sem precisar filtrar toda vez.
  const [filtroEscola, setFiltroEscola] = useState('');
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);
  const [mostrarProgresso, setMostrarProgresso] = useState(false);

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  useEffect(() => {
    try {
      const salva = window.localStorage.getItem(CHAVE_ESCOLA_ATUAL);
      if (salva) setFiltroEscola(salva);
    } catch {
      /* localStorage bloqueado — sem problema, só não vem pré-filtrado */
    }
  }, []);

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
      if (filtroEscola && (r.escola || '') !== filtroEscola) return false;
      if (!termo) return true;
      return (
        (r.patrimonio || '').toLowerCase().includes(termo) ||
        (r.descricao || '').toLowerCase().includes(termo) ||
        (r.criado_por_nome || '').toLowerCase().includes(termo)
      );
    });
  }, [registros, busca, filtroLocal, filtroEscola]);

  // Resumo "quem já fez o quê" — agrupa os itens (já filtrados pela escola
  // escolhida acima) por sala/local, mostrando quantos itens têm, quem
  // cadastrou e a última vez que alguém mexeu ali. É o jeito de, com 6
  // pessoas levantando salas diferentes na mesma escola, todo mundo ver
  // "Fulano já fez a sala 1, Fulano já fez a sala 2" sem precisar perguntar.
  const progresso = useMemo(() => {
    const base = filtroEscola ? registros.filter((r) => (r.escola || '') === filtroEscola) : filtrados;
    const porLocal = new Map<string, { itens: number; pessoas: Set<string>; ultimo: string }>();
    for (const r of base) {
      const chave = r.local || '(sem local informado)';
      const atual = porLocal.get(chave) || { itens: 0, pessoas: new Set<string>(), ultimo: '' };
      atual.itens += 1;
      if (r.criado_por_nome) atual.pessoas.add(r.criado_por_nome);
      if (!atual.ultimo || new Date(r.criado_em) > new Date(atual.ultimo)) atual.ultimo = r.criado_em;
      porLocal.set(chave, atual);
    }
    return Array.from(porLocal.entries())
      .map(([local, info]) => ({ local, ...info, pessoas: Array.from(info.pessoas) }))
      .sort((a, b) => a.local.localeCompare(b.local, 'pt-BR'));
  }, [registros, filtrados, filtroEscola]);

  async function exportarPlanilha() {
    setGerandoPlanilha(true);
    try {
      const params = new URLSearchParams();
      if (filtroLocal) params.set('local', filtroLocal);
      if (filtroEscola) params.set('escola', filtroEscola);
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
      a.download = `planilha-regularizacao${filtroEscola ? '-' + filtroEscola.replace(/[^a-zA-Z0-9]+/g, '-') : ''}-${new Date()
        .toISOString()
        .slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || 'Não foi possível gerar a planilha.');
    } finally {
      setGerandoPlanilha(false);
    }
  }

  function exportarCsv() {
    const cabecalho = ['Patrimônio', 'Descrição', 'Escola/unidade', 'Local', 'Medidas (L×A×P)', 'Cadastrado por', 'Data', 'Link'];
    const linhas = filtrados.map((r) => [
      r.patrimonio,
      r.descricao || '',
      r.escola || '',
      r.local || '',
      textoMedidas(r),
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
    a.download = `patrimonio${filtroEscola ? '-' + filtroEscola.replace(/[^a-zA-Z0-9]+/g, '-') : ''}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodos() {
    setSelecionados((prev) => {
      const todosSelecionados = filtrados.length > 0 && filtrados.every((r) => prev.has(r.id));
      if (todosSelecionados) return new Set();
      return new Set(filtrados.map((r) => r.id));
    });
  }

  const itensSelecionados = useMemo(() => filtrados.filter((r) => selecionados.has(r.id)), [filtrados, selecionados]);

  /** Apaga de vez os itens marcados — da tabela e das fotos guardadas no
   *  Storage (senão as fotos continuariam ocupando espaço escondidas). Só
   *  roda depois da pessoa confirmar na caixa de confirmação, exatamente
   *  pra não ter risco de excluir por engano. */
  async function confirmarExclusao() {
    if (!itensSelecionados.length) return;
    setExcluindo(true);
    setMensagem(null);
    try {
      const ids = itensSelecionados.map((r) => r.id);
      const { error } = await supabase.from('patrimonio_registros').delete().in('id', ids);
      if (error) throw error;

      // Melhor esforço — nunca trava a exclusão se uma foto específica não
      // puder ser removida do Storage.
      const urls = itensSelecionados.flatMap((r) => [r.foto_tombo_url, r.foto_item_url]);
      removerFotosDoStorage(supabase, urls);

      setRegistros((prev) => prev.filter((r) => !ids.includes(r.id)));
      setSelecionados(new Set());
      setConfirmandoExclusao(false);
      setMensagem({ tipo: 'ok', texto: `${ids.length} item(ns) excluído(s) do sistema.` });
    } catch (e: any) {
      setMensagem({ tipo: 'erro', texto: 'Não foi possível excluir. ' + (e?.message || '') });
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-2xl">Bens registrados</h1>
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

      {mensagem && (
        <div
          className={`rounded-md2 px-4 py-3 text-sm font-semibold ${
            mensagem.tipo === 'ok' ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'
          }`}
        >
          {mensagem.texto}
        </div>
      )}

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
          value={filtroEscola}
          onChange={(e) => setFiltroEscola(e.target.value)}
          className="rounded-md2 border border-border px-3 py-2 text-sm outline-none focus:border-accent bg-surface"
        >
          <option value="">Todas as escolas/unidades</option>
          {escolas.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
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

      <div className="bg-surface rounded-lg2 border border-border p-4">
        <button
          onClick={() => setMostrarProgresso((v) => !v)}
          className="w-full flex items-center justify-between text-left font-display font-bold text-sm"
        >
          <span>
            Progresso do levantamento{filtroEscola ? ` — ${filtroEscola}` : ''}
          </span>
          <span className="text-muted">{mostrarProgresso ? '▲' : '▼'}</span>
        </button>
        {!filtroEscola && (
          <p className="text-xs text-muted mt-1">
            Escolha uma escola/unidade no filtro acima pra ver aqui quem já cadastrou o quê em cada sala.
          </p>
        )}
        {mostrarProgresso && (
          <div className="mt-3 flex flex-col gap-2">
            {progresso.length === 0 && <p className="text-xs text-muted">Nenhum item cadastrado ainda.</p>}
            {progresso.map((p) => (
              <div key={p.local} className="flex items-center justify-between gap-3 border-b border-border last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{p.local}</p>
                  <p className="text-xs text-muted truncate">
                    {p.pessoas.length ? p.pessoas.join(', ') : 'sem responsável informado'} — última vez em {formatarData(p.ultimo)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-accent-soft text-accent-strong text-xs font-bold px-2.5 py-1">
                  {p.itens} {p.itens === 1 ? 'item' : 'itens'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {selecionados.size > 0 && (
        <div className="bg-warn/10 border border-warn/30 rounded-md2 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <span className="text-sm font-semibold">{selecionados.size} item(ns) marcado(s) pra excluir</span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelecionados(new Set())}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-semibold hover:bg-surface-2"
            >
              Limpar seleção
            </button>
            <button
              onClick={() => setConfirmandoExclusao(true)}
              className="rounded-full bg-danger text-white px-4 py-1.5 text-xs font-semibold"
            >
              Excluir selecionados ({selecionados.size})
            </button>
          </div>
        </div>
      )}

      {confirmandoExclusao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !excluindo && setConfirmandoExclusao(false)} />
          <div className="relative bg-surface rounded-lg2 border border-border p-5 max-w-md w-full flex flex-col gap-3 max-h-[85vh]">
            <h2 className="font-display font-bold text-base text-danger">Confirmar exclusão</h2>
            <p className="text-sm text-muted">
              Tem certeza que quer excluir {itensSelecionados.length} item(ns) do sistema? As fotos guardadas também
              serão apagadas. Essa ação não pode ser desfeita.
            </p>
            <div className="overflow-y-auto flex-1 border border-border rounded-md2 divide-y divide-border">
              {itensSelecionados.slice(0, 30).map((r) => (
                <div key={r.id} className="px-3 py-2 text-xs">
                  <span className="font-mono font-semibold">{r.sem_tombo ? 'Sem etiqueta' : r.patrimonio}</span>
                  {' — '}
                  {r.descricao || 'sem descrição'}
                  {r.local && <span className="text-muted"> · {r.local}</span>}
                </div>
              ))}
              {itensSelecionados.length > 30 && (
                <div className="px-3 py-2 text-xs text-muted">…e mais {itensSelecionados.length - 30} item(ns).</div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setConfirmandoExclusao(false)}
                disabled={excluindo}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-2 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarExclusao}
                disabled={excluindo}
                className="rounded-full bg-danger text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {excluindo ? 'Excluindo…' : 'Sim, excluir de vez'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface rounded-lg2 border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={filtrados.length > 0 && filtrados.every((r) => selecionados.has(r.id))}
                  onChange={alternarSelecaoTodos}
                  aria-label="Selecionar todos"
                />
              </th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Patrimônio</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Descrição</th>
              <th className="px-4 py-3 font-semibold text-muted text-xs uppercase tracking-wide">Escola</th>
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
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selecionados.has(r.id)}
                      onChange={() => alternarSelecao(r.id)}
                      aria-label={`Selecionar ${r.patrimonio}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {r.sem_tombo ? <span className="text-muted italic">Sem etiqueta</span> : r.patrimonio}
                    {duplicado && !r.sem_tombo && <span title="Tombamento cadastrado mais de uma vez" className="ml-1.5 text-warn">⚠</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.descricao || '—'}
                    {textoMedidas(r) && <span className="block text-xs text-muted mt-0.5">{textoMedidas(r)}</span>}
                  </td>
                  <td className="px-4 py-3">{r.escola || '—'}</td>
                  <td className="px-4 py-3">{r.local || '—'}</td>
                  <td className="px-4 py-3">{r.criado_por_nome || '—'}</td>
                  <td className="px-4 py-3 text-muted">{formatarData(r.criado_em)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-2 flex-wrap">
                      {r.foto_item_url && (
                        <a href={r.foto_item_url} target="_blank" rel="noreferrer" className="text-accent font-semibold text-xs hover:underline">
                          Ver foto
                        </a>
                      )}
                      {r.documento_pdf_url && (
                        <a href={r.documento_pdf_url} target="_blank" rel="noreferrer" className="text-accent font-semibold text-xs hover:underline">
                          Ver PDF
                        </a>
                      )}
                      {!r.foto_item_url && !r.documento_pdf_url && <span className="text-muted text-xs">—</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted">
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
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
