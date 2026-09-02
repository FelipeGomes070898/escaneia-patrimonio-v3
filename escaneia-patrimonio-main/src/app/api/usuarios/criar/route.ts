import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function gerarSenhaTemporaria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 10; i++) senha += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return senha;
}

/** Cria uma conta nova (usada por gestor ou recrutador na tela de
 *  Usuários). Recrutador só pode criar colaboradores — isso é verificado
 *  aqui no servidor, não só escondido na tela, então não dá pra burlar. */
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Faça login para continuar.' }, { status: 401 });
  }

  const { data: meuPerfil } = await supabase
    .from('patrimonio_perfis')
    .select('role, aprovado')
    .eq('id', user.id)
    .maybeSingle();

  if (!meuPerfil?.aprovado || !['gestor', 'recrutador'].includes(meuPerfil.role)) {
    return NextResponse.json({ error: 'Sem permissão para cadastrar novos usuários.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const email = (body?.email || '').trim().toLowerCase();
  const nome = (body?.nome || '').trim();
  let role = body?.role || 'colaborador';

  if (!email || !nome) {
    return NextResponse.json({ error: 'Preencha nome e e-mail.' }, { status: 400 });
  }
  if (!['gestor', 'recrutador', 'colaborador'].includes(role)) {
    role = 'colaborador';
  }
  if (meuPerfil.role === 'recrutador' && role !== 'colaborador') {
    return NextResponse.json({ error: 'Recrutador só pode cadastrar colaboradores.' }, { status: 403 });
  }

  const senhaTemporaria = gerarSenhaTemporaria();

  try {
    const admin = createAdminClient();
    const { data: novoUsuario, error: erroCriar } = await admin.auth.admin.createUser({
      email,
      password: senhaTemporaria,
      email_confirm: true,
      user_metadata: { nome }
    });
    if (erroCriar || !novoUsuario?.user) {
      const jaExiste = erroCriar?.message?.toLowerCase().includes('already');
      return NextResponse.json(
        { error: jaExiste ? 'Já existe uma conta com esse e-mail.' : 'Não foi possível criar a conta.' },
        { status: 400 }
      );
    }

    // O gatilho do banco já criou o perfil como "colaborador" pendente —
    // aqui a gente ajusta pro papel escolhido e já aprova, já que quem
    // está cadastrando (gestor/recrutador) está confirmando essa pessoa.
    await admin
      .from('patrimonio_perfis')
      .update({ nome, role, aprovado: true })
      .eq('id', novoUsuario.user.id);

    return NextResponse.json({ ok: true, email, senhaTemporaria, role });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado ao criar a conta.' }, { status: 500 });
  }
}
