import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { createClient } from '@/lib/supabase/server';
import { patKey } from '@/lib/patrimonio';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TAMANHO_MAXIMO = 15 * 1024 * 1024; // 15 MB

/** Tira acento/maiúscula/espaço extra de um texto, só pra comparar nomes
 *  de coluna sem depender de acentuação/maiúscula exatas (a mesma
 *  planilha pode vir "Descrição" numa escola e "DESCRICAO" noutra). */
function normalizar(s: any): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

interface ColunaMapeada {
  descricao: number;
  tombamento: number;
  tombamentoAntigo: number;
  ambiente: number;
  estadoConservacao: number;
  classificacao: number;
  cargaAtual: number;
  observacao: number;
}

/** Acha, numa linha de cabeçalho da planilha, em qual coluna está cada
 *  informação que a gente precisa — comparando por "contém tal palavra"
 *  em vez de nome exato, porque a mesma planilha do e-Estado varia um
 *  pouco o nome/pontuação da coluna de escola pra escola. Devolve null se
 *  essa linha não parecer ser um cabeçalho de planilha de bens (sem
 *  coluna de descrição e de tombamento, não dá pra usar). */
function mapearColunas(cabecalho: any[]): ColunaMapeada | null {
  const normalizado = cabecalho.map(normalizar);
  const acha = (...precisa: string[]) => normalizado.findIndex((c) => precisa.every((p) => c.includes(p)));

  const descricao = acha('DESCRI');
  const tombamento = normalizado.findIndex((c) => c.includes('TOMBAMENTO') && !c.includes('ANTIGO') && !c.includes('SUBSTITU'));
  if (descricao === -1 || tombamento === -1) return null;

  return {
    descricao,
    tombamento,
    tombamentoAntigo: acha('TOMBAMENTO', 'ANTIGO'),
    ambiente: acha('AMBIENTE') !== -1 ? acha('AMBIENTE') : acha('LOCALIZ'),
    estadoConservacao: acha('ESTADO', 'CONSERV'),
    classificacao: acha('CLASSIFICA'),
    cargaAtual: acha('CARGA'),
    observacao: acha('OBS')
  };
}

function valorCelula(row: ExcelJS.Row, indice: number): string {
  if (indice < 0) return '';
  const v = row.getCell(indice + 1).value;
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in (v as any)) return String((v as any).text || '').trim();
  if (typeof v === 'object' && 'richText' in (v as any)) {
    return ((v as any).richText || []).map((t: any) => t.text).join('').trim();
  }
  return String(v).trim();
}

/** Recebe a planilha oficial de levantamento (.xlsx) que a escola já usa
 *  com o e-Estado — Descrição, Tombamento, Ambiente, Estado de
 *  conservação, Classificação etc. — e guarda como uma lista de consulta
 *  rápida pra essa escola. Serve pra, na hora de escanear um tombo, achar
 *  a descrição/local oficiais na hora, sem depender do site do governo
 *  (que às vezes cai ou demora). Cada nova importação substitui a lista
 *  anterior dessa mesma escola (a planilha é sempre a "foto" mais recente
 *  do levantamento, não algo pra ir acumulando). */
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
  const escolaEnviada = String(form?.get('escola') || '').trim();
  if (!arquivo || !(arquivo instanceof Blob)) {
    return NextResponse.json({ error: 'Nenhuma planilha enviada.' }, { status: 400 });
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    return NextResponse.json({ error: 'A planilha é muito grande (máximo 15 MB).' }, { status: 400 });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as any);
  } catch {
    return NextResponse.json({ error: 'Não conseguimos abrir esse arquivo. Confira se é mesmo um .xlsx válido.' }, { status: 400 });
  }

  // Procura primeiro uma aba chamada algo como "LEVANTAMENTO..." (é o
  // formato padrão da planilha do e-Estado, com um item por linha); se não
  // achar, tenta cada aba em ordem até achar uma com cabeçalho reconhecível.
  let planilha =
    workbook.worksheets.find((ws) => normalizar(ws.name).includes('LEVANTAMENTO')) || null;
  let colunas: ColunaMapeada | null = null;
  let linhaCabecalho = 1;

  const abasParaTentar = planilha ? [planilha, ...workbook.worksheets.filter((w) => w !== planilha)] : workbook.worksheets;

  for (const aba of abasParaTentar) {
    // O cabeçalho de verdade pode não estar na linha 1 (às vezes tem um
    // título da tabela antes) — procura nas primeiras 5 linhas.
    for (let l = 1; l <= Math.min(5, aba.rowCount); l++) {
      const valores = aba.getRow(l).values as any[];
      const tentativa = mapearColunas(Array.isArray(valores) ? valores.slice(1) : []);
      if (tentativa) {
        planilha = aba;
        colunas = tentativa;
        linhaCabecalho = l;
        break;
      }
    }
    if (colunas) break;
  }

  if (!planilha || !colunas) {
    return NextResponse.json(
      { error: 'Não reconhecemos as colunas dessa planilha. Ela precisa ter pelo menos uma coluna de "Descrição" e uma de "Tombamento".' },
      { status: 400 }
    );
  }

  const linhas: {
    tombamento_key: string;
    tombamento: string;
    tombamento_antigo: string;
    descricao: string;
    ambiente: string;
    estado_conservacao: string;
    classificacao: string;
    observacao: string;
  }[] = [];
  const contagemEscola = new Map<string, number>();

  for (let l = linhaCabecalho + 1; l <= planilha.rowCount; l++) {
    const row = planilha.getRow(l);
    const tombamentoRaw = valorCelula(row, colunas.tombamento);
    const descricao = valorCelula(row, colunas.descricao);
    if (!tombamentoRaw || !descricao) continue; // linha vazia/sem dado útil — pula

    const chave = patKey(tombamentoRaw);
    if (!chave) continue;

    const carga = valorCelula(row, colunas.cargaAtual);
    if (carga) contagemEscola.set(carga, (contagemEscola.get(carga) || 0) + 1);

    linhas.push({
      tombamento_key: chave,
      tombamento: tombamentoRaw,
      tombamento_antigo: valorCelula(row, colunas.tombamentoAntigo),
      descricao,
      ambiente: valorCelula(row, colunas.ambiente),
      estado_conservacao: valorCelula(row, colunas.estadoConservacao),
      classificacao: valorCelula(row, colunas.classificacao),
      observacao: valorCelula(row, colunas.observacao)
    });
  }

  if (!linhas.length) {
    return NextResponse.json({ error: 'Não encontramos nenhuma linha com descrição e tombamento preenchidos nessa planilha.' }, { status: 400 });
  }

  // Se a pessoa não escolheu a escola manualmente, tenta adivinhar pela
  // coluna "Carga atual no e-Estado" (que normalmente repete o nome da
  // escola em toda linha).
  let escola = escolaEnviada;
  if (!escola && contagemEscola.size) {
    escola = Array.from(contagemEscola.entries()).sort((a, b) => b[1] - a[1])[0][0];
  }
  if (!escola) {
    return NextResponse.json(
      { error: 'Não conseguimos identificar a escola pela planilha. Escolha a escola manualmente antes de importar.' },
      { status: 400 }
    );
  }

  // Cada nova importação é a "foto" mais atual do levantamento dessa
  // escola — substitui a lista anterior em vez de ir empilhando.
  await supabase.from('patrimonio_planilha_itens').delete().eq('escola', escola);

  const LOTE = 500;
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE).map((l) => ({ ...l, escola }));
    const { error } = await supabase.from('patrimonio_planilha_itens').insert(lote);
    if (error) {
      return NextResponse.json({ error: 'Falha ao salvar: ' + error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, escola, total: linhas.length, aba: planilha.name });
}
