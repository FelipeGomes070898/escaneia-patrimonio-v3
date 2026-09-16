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

/** Botões de toque rápido pra descrição — mesma lista de itens comuns do
 *  app antigo (PWA), pra não precisar digitar na maioria dos casos: um
 *  toque já preenche a descrição e segue pro próximo passo. */
export const DESCRICOES_RAPIDAS = [
  'Cadeira', 'Mesa', 'Monitor', 'Computador', 'Teclado', 'Mouse',
  'Impressora', 'Armário', 'Ventilador', 'Ar-condicionado', 'Bebedouro', 'Estante'
];

const DESCRICAO_KEYWORDS = [
  'CADEIRA', 'MESA', 'MONITOR', 'COMPUTADOR', 'CPU', 'NOTEBOOK', 'IMPRESSORA',
  'ARMARIO', 'ARMÁRIO', 'VENTILADOR', 'CONDICIONADO', 'TELEVISOR', 'TV',
  'PROJETOR', 'TECLADO', 'MOUSE', 'ESTABILIZADOR', 'BEBEDOURO', 'QUADRO',
  'ESTANTE', 'FILTRO', 'NO-BREAK', 'NOBREAK', 'GELADEIRA', 'FOGAO', 'FOGÃO',
  'BALCAO', 'BALCÃO', 'SOFA', 'SOFÁ', 'LONGARINA', 'ARQUIVO'
];

/** As etiquetas mais novas do governo trazem, além do QR Code, uma breve
 *  descrição impressa — às vezes rotulada "Desc. analítica", às vezes
 *  "Desc. sintética" (ex: "CADEIRA GIRATÓRIA C...", "VENTILADOR DE PAREDE
 *  60CM NEW AMA") — bem mais específica que só adivinhar por palavra-
 *  chave. Essa mesma descrição normalmente também está dentro do próprio
 *  QR Code (o texto lido pela câmera), então dá pra aproveitar na hora,
 *  sem nem precisar esperar a busca no site do governo terminar.
 *  Etiquetas mais antigas podem não ter essa informação — nesse caso
 *  simplesmente não acha nada aqui e o sistema cai pro palpite por
 *  palavra-chave (ou pra busca no governo, ou pra digitação manual
 *  mesmo). */
const ROTULO_DESCRICAO_ANALITICA = /desc(?:ri[cç][aã]o)?\.?\s*(?:anal[ií]tica|sint[eé]tica)\.?\s*:?\s*/i;

/** Rótulos que costumam vir DEPOIS da descrição analítica na etiqueta —
 *  usados só pra saber onde cortar o texto capturado, caso o resto dos
 *  campos venha grudado sem quebra de linha. */
const PROXIMOS_ROTULOS = [
  'patrim', 'tombamento', 'lote', 'tipo', 'classifica', 'estado de conserv',
  'situa', 'dispon', 'setor', 'unidade', 'departamento', 'respons',
  'data de', 'forma de ingresso', 'valor de aquis', 'valor residual', 'vida útil', 'vida util'
];

function cortarNoProximoRotulo(texto: string): string {
  const baixo = texto.toLowerCase();
  let corte = texto.length;
  for (const rotulo of PROXIMOS_ROTULOS) {
    const idx = baixo.indexOf(rotulo);
    if (idx > 0 && idx < corte) corte = idx;
  }
  return texto.slice(0, corte).trim();
}

/** Preposições/artigos curtos que NÃO devem ser tratados como sigla — sem
 *  isso "DE"/"DA"/"DO" ficariam maiúsculos no meio da frase. */
const PALAVRINHAS_MINUSCULAS = new Set(['DE', 'DA', 'DO', 'DAS', 'DOS', 'E', 'EM', 'NO', 'NA', 'COM', 'PARA', 'PRA', 'A', 'O']);

/** Deixa um texto todo em maiúsculas (comum nas etiquetas impressas) mais
 *  legível, mas preserva siglas curtas (AMA, TV, CPU...) em maiúsculo. */
function legibilizarDescricao(texto: string): string {
  const limpo = texto.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
  if (!limpo) return '';
  if (limpo !== limpo.toUpperCase()) return limpo; // já não está tudo em caixa alta
  return limpo
    .split(' ')
    .map((palavra, i) => {
      const soLetras = palavra.replace(/[^A-ZÀ-Ü]/gi, '');
      if (PALAVRINHAS_MINUSCULAS.has(soLetras.toUpperCase())) {
        return i === 0 ? palavra.charAt(0) + palavra.slice(1).toLowerCase() : palavra.toLowerCase();
      }
      if (soLetras.length > 0 && soLetras.length <= 3) return palavra; // sigla, mantém
      return palavra.charAt(0) + palavra.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Procura uma "Desc. analítica" dentro do texto lido do QR Code/etiqueta.
 *  Retorna a descrição já formatada, ou vazio se essa etiqueta não tiver
 *  esse campo (etiquetas antigas, por exemplo). */
function extrairDescricaoAnalitica(raw: string): string {
  const linhas = raw.split(/\r?\n/);
  for (let i = 0; i < linhas.length; i++) {
    const m = linhas[i].match(ROTULO_DESCRICAO_ANALITICA);
    if (m) {
      let resto = linhas[i].slice((m.index || 0) + m[0].length);
      // Se a etiqueta não tiver quebra de linha real, o resto do texto
      // (patrimônio, lote etc.) pode ter vindo colado na mesma linha.
      if (!resto.trim() && linhas[i + 1]) resto = linhas[i + 1];
      const cortado = cortarNoProximoRotulo(resto);
      if (cortado) return legibilizarDescricao(cortado);
    }
  }
  return '';
}

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

  // O primeiro grupo (antes do primeiro ponto) pode ter só 1 dígito — por
  // exemplo "1.430.499" é um tombamento de 7 dígitos válido, não só
  // "430.499". Por isso aceita de 1 a 3 dígitos ali, não só 2-3.
  const dotted = raw.match(/\b\d{1,3}(?:\.\d{3}){1,3}\b/);
  if (dotted) {
    result.patrimonio = formatPatrimonio(dotted[0]);
  } else {
    const digitRuns = raw.match(/\d{6,15}/g);
    if (digitRuns && digitRuns.length) {
      const longest = digitRuns.reduce((a, b) => (b.length > a.length ? b : a));
      result.patrimonio = formatPatrimonio(longest);
    }
  }

  // Prioridade 1: a descrição analítica impressa/lida na etiqueta (ex:
  // "Ventilador de parede 60cm New Ama") — bem mais específica.
  const analitica = extrairDescricaoAnalitica(raw);
  if (analitica) {
    result.descricaoSugerida = analitica;
  } else {
    // Prioridade 2 (etiquetas sem esse campo): só um palpite genérico por
    // palavra-chave (ex: "Ventilador").
    const upper = raw.toUpperCase();
    const found = DESCRICAO_KEYWORDS.find((k) => upper.includes(k));
    if (found) result.descricaoSugerida = found.charAt(0) + found.slice(1).toLowerCase();
  }

  return result;
}

export function linkDoSistema(patrimonio: string): string {
  return 'https://e-estado.ro.gov.br/publico/bens/' + patKey(patrimonio);
}
