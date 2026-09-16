import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { identificarItemNaFoto } from '@/lib/identificarItem';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TAMANHO_MAXIMO = 6 * 1024 * 1024; // 6 MB

/** Recebe a foto do item e devolve uma sugestão curta de descrição (ex:
 *  "Mesa de escritório"), usando IA de visão. Só usuários logados e
 *  aprovados podem chamar. Se a chave da IA não estiver configurada,
 *  devolve descricaoSugerida: null sem erro — a tela trata isso como "sem
 *  sugestão" e segue normal. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  }
  const { data: perfil } = await supabase.from('patrimonio_perfis').select('aprovado').eq('id', user.id).maybeSingle();
  if (!perfil?.aprovado) {
    return NextResponse.json({ error: 'Conta ainda não aprovada.' }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const arquivo = form?.get('arquivo');
  if (!arquivo || !(arquivo instanceof Blob)) {
    return NextResponse.json({ error: 'Nenhuma foto enviada.' }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: 'A foto é muito grande.' }, { status: 400 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const descricaoSugerida = await identificarItemNaFoto(buffer.toString('base64'));
  return NextResponse.json({ descricaoSugerida });
}
