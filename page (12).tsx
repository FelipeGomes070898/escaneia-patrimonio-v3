import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function PainelPage() {
  const supabase = createClient();

  const { count: total } = await supabase
    .from('patrimonio_registros')
    .select('*', { count: 'exact', head: true });

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const { count: hojeCount } = await supabase
    .from('patrimonio_registros')
    .select('*', { count: 'exact', head: true })
    .gte('criado_em', hoje.toISOString());

  const { data: registros } = await supabase
    .from('patrimonio_registros')
    .select('id, patrimonio, descricao, local, criado_em, criado_por_nome')
    .order('criado_em', { ascending: false })
    .limit(8);

  const { data: paraContagemLocal } = await supabase
    .from('patrimonio_registros')
    .select('local');

  const porLocal: Record<string, number> = {};
  (paraContagemLocal || []).forEach((r: any) => {
    const nome = r.local || 'Sem local';
    porLocal[nome] = (porLocal[nome] || 0) + 1;
  });
  const rankingLocais = Object.entries(porLocal)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="font-display font-bold text-2xl">Painel geral</h1>
        <p className="text-sm text-muted mt-1">Resumo do levantamento de bens patrimoniais.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-surface rounded-lg2 border border-border p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Total cadastrado</p>
          <p className="font-display font-bold text-3xl mt-2">{total ?? 0}</p>
        </div>
        <div className="bg-surface rounded-lg2 border border-border p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Hoje</p>
          <p className="font-display font-bold text-3xl mt-2">{hojeCount ?? 0}</p>
        </div>
        <div className="bg-surface rounded-lg2 border border-border p-5 col-span-2 md:col-span-1">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">Locais com bens</p>
          <p className="font-display font-bold text-3xl mt-2">{Object.keys(porLocal).length}</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg2 border border-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold text-base">Últimos itens escaneados</h2>
          <Link href="/levantamento" className="text-sm font-semibold text-accent">
            Escanear novo item →
          </Link>
        </div>
        {registros && registros.length ? (
          <div className="flex flex-col divide-y divide-border">
            {registros.map((r: any) => (
              <div key={r.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{r.descricao || 'Sem descrição'}</p>
                  <p className="text-xs text-muted truncate">
                    Patrimônio {r.patrimonio || '—'} · {r.local || 'Sem local'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted">{formatarData(r.criado_em)}</p>
                  {r.criado_por_nome && <p className="text-xs text-muted">{r.criado_por_nome}</p>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted py-4">
            Nenhum item cadastrado ainda. <Link href="/levantamento" className="text-accent font-semibold">Comece o levantamento</Link>.
          </p>
        )}
      </div>

      {rankingLocais.length > 0 && (
        <div className="bg-surface rounded-lg2 border border-border p-5">
          <h2 className="font-display font-bold text-base mb-3">Bens por local</h2>
          <div className="flex flex-col gap-2">
            {rankingLocais.map(([nome, qtd]) => {
              const max = rankingLocais[0][1];
              const pct = Math.max(6, Math.round((qtd / max) * 100));
              return (
                <div key={nome} className="flex items-center gap-3">
                  <span className="text-sm w-32 shrink-0 truncate">{nome}</span>
                  <div className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: pct + '%' }} />
                  </div>
                  <span className="text-sm font-semibold w-8 text-right shrink-0">{qtd}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function formatarData(iso: string) {
  try {
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
