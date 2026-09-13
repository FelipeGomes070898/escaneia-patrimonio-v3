import * as cheerio from 'cheerio';

/** Mesma extração de campos usada no app anterior (scanner em PWA), agora
 *  rodando no servidor com cheerio em vez de DOMParser no navegador — e
 *  sem precisar de proxy nenhum pra contornar CORS, porque fetch no
 *  servidor não tem essa restrição. */

const SISTEMA_FIELD_LABELS: Record<string, string> = {
  Tombamento: 'tombamento',
  'Tombamento Antigo': 'tombamentoAntigo',
  Lote: 'lote',
  Tipo: 'tipo',
  Classificação: 'classificacao',
  'Estado de conservação': 'estadoConservacao',
  'Disponível para Baixa': 'disponivelBaixa',
  Unidade: 'unidade',
  Departamento: 'departamento',
  Responsável: 'responsavel',
  'Forma de Ingresso': 'formaIngresso',
  'Data de Entrada': 'dataEntrada',
  'Valor de Aquisição': 'valorAquisicao',
  'Valor Residual': 'valorResidual',
  'Vida Útil': 'vidaUtil',
  'Vida útil': 'vidaUtil'
};

export type SistemaDados = Record<string, string> & {
  descricao?: string;
  categoria?: string;
};

export function parseSistemaBens(html: string): SistemaDados | null {
  const out: SistemaDados = {};
  try {
    const $ = cheerio.load(html);

    const h1 = $('h1, h2').first();
    const h1Text = h1.text().trim();
    if (h1Text) {
      out.descricao = h1Text.replace(/\s+/g, ' ');
      let prev = h1.prev();
      let hops = 0;
      while (prev.length && hops < 3) {
        const t = prev.text().trim();
        if (t && t.length < 60 && t === t.toUpperCase() && /[A-ZÀ-Ü]/.test(t)) {
          out.categoria = t;
          break;
        }
        prev = prev.prev();
        hops++;
      }
    }

    // Tabelas: pareia cabeçalho x valor por posição da coluna
    $('table').each((_, table) => {
      const headerCells = $(table).find('thead th, thead td').toArray();
      const bodyRow = $(table).find('tbody tr').first();
      const bodyCells = bodyRow.children().toArray();
      headerCells.forEach((th, i) => {
        const key = SISTEMA_FIELD_LABELS[$(th).text().trim()];
        const val = bodyCells[i] ? $(bodyCells[i]).text().trim().replace(/\s+/g, ' ') : '';
        if (key && val && !/^-+$/.test(val)) out[key] = val;
      });
    });

    // Texto corrido: "Rótulo: valor" em qualquer parte da página
    const text = $('body').text() || html;
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    lines.forEach((line) => {
      const m = line.match(/^([A-Za-zÀ-ÿ ]+?)\s*:\s*(.+)$/);
      if (m) {
        const key = SISTEMA_FIELD_LABELS[m[1].trim()];
        if (key && !out[key] && m[2].trim() && !/^-+$/.test(m[2].trim())) out[key] = m[2].trim();
      }
    });

    // Rótulo numa linha, valor na linha seguinte
    for (let i = 0; i < lines.length - 1; i++) {
      const key = SISTEMA_FIELD_LABELS[lines[i]];
      if (key && !out[key]) {
        const val = lines[i + 1];
        if (val && !SISTEMA_FIELD_LABELS[val] && !/^-+$/.test(val)) out[key] = val;
      }
    }
  } catch {
    // HTML inesperado — devolve o que conseguiu até aqui
  }
  return Object.keys(out).length ? out : null;
}

const ALLOWED_HOST = 'e-estado.ro.gov.br';

export async function buscarDadosDoGoverno(
  url: string
): Promise<{ data: SistemaDados } | { error: string; detail: string }> {
  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return { error: 'url_invalida', detail: 'URL inválida.' };
  }
  if (targetUrl.hostname !== ALLOWED_HOST) {
    return { error: 'dominio_nao_permitido', detail: 'Este endereço só busca páginas de ' + ALLOWED_HOST + '.' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(targetUrl.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EscaneiaPatrimonioBot/1.0)' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (resp.status === 404) {
      return { error: 'nao_encontrado', detail: 'Este tombamento não existe no sistema do governo (não encontrado).' };
    }
    if (!resp.ok) return { error: 'http_' + resp.status, detail: 'O sistema do governo respondeu com erro (HTTP ' + resp.status + ').' };
    const html = await resp.text();
    const data = parseSistemaBens(html);
    return data
      ? { data }
      : {
          error: 'sem_registro',
          detail: 'Não encontramos esse tombamento no sistema do governo. Confira se o número está certo — ou esse bem pode não ter registro lá.'
        };
  } catch (e: any) {
    clearTimeout(timeoutId);
    const isAbort = e && e.name === 'AbortError';
    return {
      error: isAbort ? 'timeout' : 'erro_rede',
      detail: isAbort ? 'Tempo esgotado ao buscar a página.' : 'Falha ao buscar: ' + (e?.message || String(e))
    };
  }
}
