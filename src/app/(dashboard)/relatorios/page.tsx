import { createClient } from '@/lib/supabase/server';
import RelatoriosClient from '@/components/RelatoriosClient';

export const dynamic = 'force-dynamic';

export default async function RelatoriosPage() {
  const supabase = createClient();

  const { data: registros } = await supabase
    .from('patrimonio_registros')
    .select(
      'id, patrimonio, patrimonio_key, descricao, local, escola, criado_em, criado_por_nome, link, documento_pdf_url, foto_item_url, foto_tombo_url, sem_tombo, medida_largura_cm, medida_altura_cm, medida_profundidade_cm'
    )
    .order('criado_em', { ascending: false });

  const { data: salas } = await supabase.from('patrimonio_salas').select('nome').order('nome');
  const { data: escolas } = await supabase.from('patrimonio_escolas').select('nome').order('nome');

  return (
    <RelatoriosClient
      registros={registros || []}
      locais={(salas || []).map((s: any) => s.nome)}
      escolas={(escolas || []).map((e: any) => e.nome)}
    />
  );
}
