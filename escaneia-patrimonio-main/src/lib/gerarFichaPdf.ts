import type { jsPDF as JsPDF } from 'jspdf';
import type { SistemaDados } from './govLookup';

/** Monta um PDF com uma página pra cada foto do item, uma da etiqueta do
 *  tombo, e uma última página com os dados do registro — a "ficha" do
 *  bem, do mesmo jeito que costuma ser guardado no Google Drive. */

interface DadosFicha {
  patrimonio: string;
  descricao: string;
  local: string;
  tipoCodigo: string;
  criadoPor: string;
  linkSistema: string;
  dadosGoverno: SistemaDados | null;
}

async function arquivoParaDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result as string);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

async function tamanhoImagem(dataUrl: string): Promise<{ largura: number; altura: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ largura: img.width, altura: img.height });
    img.onerror = () => resolve({ largura: 1, altura: 1 });
    img.src = dataUrl;
  });
}

async function adicionarPaginaFoto(doc: JsPDF, arquivo: File, legenda: string, primeiraPagina: boolean) {
  const dataUrl = await arquivoParaDataUrl(arquivo);
  const { largura, altura } = await tamanhoImagem(dataUrl);

  if (!primeiraPagina) doc.addPage();

  const larguraPagina = doc.internal.pageSize.getWidth();
  const alturaPagina = doc.internal.pageSize.getHeight();
  const margem = 15;
  const areaLargura = larguraPagina - margem * 2;
  const areaAltura = alturaPagina - margem * 2 - 10;

  const escala = Math.min(areaLargura / largura, areaAltura / altura);
  const w = largura * escala;
  const h = altura * escala;
  const x = (larguraPagina - w) / 2;
  const y = margem + 10;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(legenda, margem, margem);

  const formato = arquivo.type.includes('png') ? 'PNG' : 'JPEG';
  doc.addImage(dataUrl, formato, x, y, w, h);
}

function linhaTexto(doc: JsPDF, rotulo: string, valor: string, x: number, y: number): number {
  if (!valor) return y;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(rotulo.toUpperCase(), x, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const linhas = doc.splitTextToSize(valor, 180);
  doc.text(linhas, x, y + 5);
  return y + 5 + linhas.length * 5 + 3;
}

export async function gerarFichaPdf(
  fotosItem: File[],
  fotoTombo: File | null,
  dados: DadosFicha
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let primeira = true;

  for (let i = 0; i < fotosItem.length; i++) {
    await adicionarPaginaFoto(doc, fotosItem[i], `Foto do item ${fotosItem.length > 1 ? i + 1 + '/' + fotosItem.length : ''}`.trim(), primeira);
    primeira = false;
  }

  if (fotoTombo) {
    await adicionarPaginaFoto(doc, fotoTombo, 'Foto da etiqueta (tombamento)', primeira);
    primeira = false;
  }

  if (!primeira) doc.addPage();
  const margem = 15;
  let y = margem;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('Ficha de registro — Escaneia Patrimônio', margem, y);
  y += 10;

  y = linhaTexto(doc, 'Patrimônio', dados.patrimonio, margem, y);
  y = linhaTexto(doc, 'Descrição', dados.descricao, margem, y);
  y = linhaTexto(doc, 'Local', dados.local, margem, y);
  y = linhaTexto(doc, 'Tipo de leitura', dados.tipoCodigo, margem, y);
  y = linhaTexto(doc, 'Cadastrado por', dados.criadoPor, margem, y);
  y = linhaTexto(doc, 'Data do cadastro', new Date().toLocaleString('pt-BR'), margem, y);
  y = linhaTexto(doc, 'Link no sistema do governo', dados.linkSistema, margem, y);

  if (dados.dadosGoverno) {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Dados do sistema do governo', margem, y);
    y += 7;
    const rotulos: Record<string, string> = {
      tombamento: 'Tombamento',
      tombamentoAntigo: 'Tombamento antigo',
      lote: 'Lote',
      tipo: 'Tipo',
      classificacao: 'Classificação',
      estadoConservacao: 'Estado de conservação',
      disponivelBaixa: 'Disponível para baixa',
      unidade: 'Unidade',
      departamento: 'Departamento',
      responsavel: 'Responsável',
      formaIngresso: 'Forma de ingresso',
      dataEntrada: 'Data de entrada',
      valorAquisicao: 'Valor de aquisição',
      valorResidual: 'Valor residual',
      vidaUtil: 'Vida útil',
      categoria: 'Categoria'
    };
    for (const [chave, valor] of Object.entries(dados.dadosGoverno)) {
      if (chave === 'descricao' || !valor) continue;
      if (y > 270) {
        doc.addPage();
        y = margem;
      }
      y = linhaTexto(doc, rotulos[chave] || chave, String(valor), margem, y);
    }
  }

  return doc.output('blob');
}
