/** Utilidades de formatação/leitura do número de patrimônio — mesma lógica
 *  usada no app anterior (scanner em PWA), portada pro site. */

export function onlyDigits(s: string): string {
  return (s || '').replace(/\D+/g, '');
}

/** Chave normalizada pra comparar patrimônios (só dígitos, sem zeros à
 *  esquerda supérfluos). */
export function patKey(patStr: string): string {
  const d = onlyDigits(patStr);
  return d.replace(/^0+(?=\d)/, '');
}

/** Formata uma sequência de dígitos no padrão XXX.XXX.XXX. */
export function formatPatrimonio(digits: string): string {
  const d = onlyDigits(digits);
  if (!d) return '';
  if (d.length <= 3) return d;
  const groups: string[] = [];
  let rest = d;
  while (rest.length > 3) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  groups.unshift(rest);
  return groups.join('.');
}

const DESCRICAO_KEYWORDS = [
  'CADEIRA', 'MESA', 'MONITOR', 'COMPUTADOR', 'CPU', 'NOTEBOOK', 'IMPRESSORA',
  'ARMARIO', 'ARMÁRIO', 'VENTILADOR', 'CONDICIONADO', 'TELEVISOR', 'TV',
  'PROJETOR', 'TECLADO', 'MOUSE', 'ESTABILIZADOR', 'BEBEDOURO', 'QUADRO',
  'ESTANTE', 'FILTRO', 'NO-BREAK', 'NOBREAK', 'GELADEIRA', 'FOGAO', 'FOGÃO',
  'BALCAO', 'BALCÃO', 'SOFA', 'SOFÁ', 'LONGARINA', 'ARQUIVO'
];

export interface CodigoParseado {
  tipo: string;
  valorBruto: string;
  patrimonio: string;
  link: string;
  descricaoSugerida: string;
}

/** Extrai patrimônio, link e descrição sugerida a partir do texto lido
 *  pela câmera (QR Code ou código de barras). */
export function parseCodigo(raw: string, formatName: string): CodigoParseado {
  const isQr = formatName === 'QR_CODE';
  const result: CodigoParseado = {
    tipo: isQr ? 'QR Code' : 'Código de Barras',
    valorBruto: raw,
    patrimonio: '',
    link: '',
    descricaoSugerida: ''
  };

  const urlMatch = raw.match(/https?:\/\/\S+/i);
  if (urlMatch) result.link = urlMatch[0];

  const dotted = raw.match(/\b\d{2,3}(?:\.\d{3}){1,3}\b/);
  if (dotted) {
    result.patrimonio = formatPatrimonio(dotted[0]);
  } else {
    const digitRuns = raw.match(/\d{6,15}/g);
    if (digitRuns && digitRuns.length) {
      const longest = digitRuns.reduce((a, b) => (b.length > a.length ? b : a));
      result.patrimonio = formatPatrimonio(longest);
    }
  }

  const upper = raw.toUpperCase();
  const found = DESCRICAO_KEYWORDS.find((k) => upper.includes(k));
  if (found) result.descricaoSugerida = found.charAt(0) + found.slice(1).toLowerCase();

  return result;
}

export function linkDoSistema(patrimonio: string): string {
  return 'https://e-estado.ro.gov.br/publico/bens/' + patKey(patrimonio);
}
