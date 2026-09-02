import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { baixarArquivoDrive } from '@/lib/googleDrive';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RegistroPlanilha {
  id: string;
  patrimonio: string;
  patrimonio_key: string;
  descricao: string | null;
  local: string | null;
  departamento_governo: string | null;
  foto_item_drive_id: string | null;
  criado_por_nome: string | null;
  criado_em: string;
}

const COR_DUPLICADO = 'FFFDE1D3'; // laranja bem clara
const COR_DUPLICADO_BORDA = 'FFE8590C';

/** Gera a planilha (XLSX) no formato "Planilha de Regularização e
 *  Disponibilização de bens" que a equipe já usava manualmente, com a
 *  foto do bem embutida na célula e as linhas de tombamento duplicado
 *  destacadas em laranja. Só quem está logado e aprovado pode gerar. */
export async function GET(request: NextRequest) {
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

  const { data: todos } = await supabase
    .from('patrimonio_registros')
    .select('id, patrimonio, patrimonio_key, descricao, local, departamento_governo, foto_item_drive_id, criado_por_nome, criado_em')
    .order('criado_em', { ascending: false });

  const registros = (todos || []) as RegistroPlanilha[];

  // Duplicado = mesmo tombamento aparece em mais de um registro — olhando
  // pra lista inteira, não só pra que ficou filtrada na tela.
  const contagem = new Map<string, number>();
  for (const r of registros) contagem.set(r.patrimonio_key, (contagem.get(r.patrimonio_key) || 0) + 1);

  const local = request.nextUrl.searchParams.get('local') || '';
  const busca = (request.nextUrl.searchParams.get('busca') || '').trim().toLowerCase();
  const filtrados = registros.filter((r) => {
    if (local && r.local !== local) return false;
    if (!busca) return true;
    return (
      (r.patrimonio || '').toLowerCase().includes(busca) ||
      (r.descricao || '').toLowerCase().includes(busca) ||
      (r.criado_por_nome || '').toLowerCase().includes(busca)
    );
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Escaneia Patrimônio';
  workbook.created = new Date();

  const planilha = workbook.addWorksheet('Regularização', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  planilha.columns = [
    { header: 'DESCRIÇÃO', key: 'descricao', width: 28 },
    { header: 'TOMBAMENTO', key: 'tombamento', width: 16 },
    { header: 'AMBIENTE', key: 'ambiente', width: 20 },
    { header: 'FOTO DO BEM', key: 'foto', width: 18 },
    { header: 'ONDE O TOMBAMENTO ESTÁ NO E-ESTADO', key: 'ondeGoverno', width: 30 },
    { header: 'NOVO TOMBAMENTO', key: 'novoTombamento', width: 18 },
    { header: 'ESCOLA INTERESSADA', key: 'escolaInteressada', width: 24 },
    { header: 'NOME DO GESTOR DA ESCOLA INTERESSADA', key: 'gestorEscola', width: 30 },
    { header: 'OBSERVAÇÃO', key: 'observacao', width: 34 }
  ];

  const linhaCabecalho = planilha.getRow(1);
  linhaCabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  linhaCabecalho.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F6F50' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  linhaCabecalho.height = 32;

  const ALTURA_LINHA = 62;

  for (const r of filtrados) {
    const duplicado = (contagem.get(r.patrimonio_key) || 0) > 1;
    const linha = planilha.addRow({
      descricao: r.descricao || '',
      tombamento: r.patrimonio,
      ambiente: r.local || '',
      foto: '',
      ondeGoverno: r.departamento_governo || '',
      novoTombamento: '',
      escolaInteressada: '',
      gestorEscola: '',
      observacao: duplicado ? '⚠ Tombamento cadastrado mais de uma vez — conferir.' : ''
    });
    linha.height = ALTURA_LINHA;
    linha.alignment = { vertical: 'middle', wrapText: true };

    if (duplicado) {
      linha.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_DUPLICADO } };
        cell.border = { top: { style: 'thin', color: { argb: COR_DUPLICADO_BORDA } }, bottom: { style: 'thin', color: { argb: COR_DUPLICADO_BORDA } } };
      });
    }

    if (r.foto_item_drive_id) {
      try {
        const buffer = await baixarArquivoDrive(r.foto_item_drive_id);
        const imageId = workbook.addImage({ buffer: buffer as any, extension: 'jpeg' });
        const linhaIndex = linha.number - 1; // addImage usa índice 0-based
        planilha.addImage(imageId, {
          tl: { col: 3.05, row: linhaIndex + 0.05 },
          ext: { width: 90, height: 78 }
        });
      } catch {
        // se a foto não puder ser baixada (removida do Drive, etc.), deixa a célula em branco
        linha.getCell('foto').value = 'foto indisponível';
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const nomeArquivo = `planilha-regularizacao-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(buffer as any, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`
    }
  });
}
