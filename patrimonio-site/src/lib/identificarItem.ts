/** Pergunta pra uma IA de visão (Google Gemini) o que é o objeto da foto,
 *  pra sugerir a descrição automaticamente — a mesma ideia de tirar print
 *  e perguntar pro Google/Gemini, só que já dentro do sistema. Se não
 *  tiver a chave configurada, ou der qualquer erro, simplesmente não
 *  sugere nada — nunca trava o cadastro.
 *
 *  Usa a Interactions API do Gemini (o jeito atual recomendado pelo
 *  Google desde meados de 2026 — o antigo endpoint "generateContent" com
 *  o modelo gemini-2.0-flash que a gente usava antes foi desativado) com
 *  o modelo gemini-3.1-flash-lite-image, que o próprio Google recomenda
 *  pra reconhecimento visual rápido — exatamente o nosso caso aqui. */

const MODELO = 'gemini-3.1-flash-lite-image';

const PROMPT = `Você está ajudando a catalogar bens patrimoniais de uma repartição pública brasileira (escolas, secretarias de educação). Olhe a foto e responda em português, de forma bem curta (3 a 6 palavras), só o nome/tipo do móvel ou equipamento principal que aparece — por exemplo: "Mesa de escritório", "Cadeira giratória", "Ventilador de teto", "Armário de aço", "Monitor de computador", "Bebedouro", "Ar-condicionado split". Não descreva cor, marca, estado de conservação nem escreva mais nada além do nome do item. Se não conseguir identificar com confiança o que é, responda exatamente: nao identificado`;

export async function identificarItemNaFoto(base64Jpeg: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: MODELO,
        input: [
          { type: 'text', text: PROMPT },
          { type: 'image', data: base64Jpeg, mime_type: 'image/jpeg' }
        ]
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const texto = json?.output_text as string | undefined;
    if (!texto) return null;

    const limpo = texto.replace(/["'.\n]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!limpo || limpo.length > 60 || /n[aã]o identificado/i.test(limpo)) return null;

    return limpo.charAt(0).toUpperCase() + limpo.slice(1);
  } catch {
    return null;
  }
}

/** Igual à de cima, mas em vez de olhar o item, essa lê a ETIQUETA/placa
 *  de tombamento — o número, a "Desc. analítica" (quando a etiqueta tem
 *  esse campo) e, se der pra ver, em que objeto ela está colada. É a
 *  peça que ajuda nas etiquetas antigas, apagadas ou riscadas, onde o
 *  OCR simples (tesseract) sozinho normalmente não dá conta: a IA de
 *  visão do Google costuma "adivinhar" dígitos parciais bem melhor do
 *  que um OCR genérico, principalmente numa foto já com contraste
 *  realçado (ver realcarEtiqueta em lib/imagem.ts). */
const PROMPT_ETIQUETA = `Você está ajudando a catalogar bens patrimoniais de uma repartição pública brasileira (escolas, secretarias de educação). Esta é uma foto de uma etiqueta ou placa de tombamento (adesivo, ou placa de metal/plástico) colada num móvel ou equipamento — pode estar velha, apagada, arranhada, enferrujada ou desbotada. Existem pelo menos dois formatos comuns: um mais novo, com QR Code, onde logo depois da palavra "Patrimônio:" já vem o número; e um mais antigo, numa tabela, onde depois de "PATRIMÔNIO" vem primeiro uma sigla do órgão (tipo "SEDUC") num quadrinho separado, e só depois dela vem o número de verdade (nesse caso o número NÃO é a sigla — continue procurando o número mesmo que ele venha depois de uma palavra). Olhe com bastante atenção, inclusive números ou letras parcialmente apagados, e responda em português EXATAMENTE neste formato, uma linha pra cada campo, sem escrever mais nada além disso:
NUMERO: (só os dígitos do número de patrimônio/tombamento impresso ou gravado na etiqueta, sem pontos nem espaços; se não conseguir ler nenhum número com confiança, escreva "nenhum")
DESCRICAO: (o texto curto que aparece ao lado de "Desc. analítica", "Desc. sintética" ou "Descrição" na etiqueta, se ela tiver esse campo; se a etiqueta não tiver esse campo ou não der pra ler, escreva "nenhuma")
ITEM: (nome curto, de 3 a 6 palavras, do móvel ou equipamento em que essa etiqueta está colada, se der pra ver no enquadramento da foto; se não der pra ver o objeto, escreva "nao identificado")`;

export interface LeituraEtiqueta {
  numero: string | null;
  descricaoAnalitica: string | null;
  item: string | null;
}

export async function lerEtiquetaComIA(base64Jpeg: string): Promise<LeituraEtiqueta | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const resp = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        model: MODELO,
        input: [
          { type: 'text', text: PROMPT_ETIQUETA },
          { type: 'image', data: base64Jpeg, mime_type: 'image/jpeg' }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const texto = json?.output_text as string | undefined;
    if (!texto) return null;

    const numeroM = texto.match(/NUMERO:\s*([^\n]+)/i);
    const descM = texto.match(/DESCRICAO:\s*([^\n]+)/i);
    const itemM = texto.match(/ITEM:\s*([^\n]+)/i);

    const campo = (v: string | undefined, negativo: RegExp): string | null => {
      const limpo = (v || '').replace(/["']/g, '').trim();
      if (!limpo || negativo.test(limpo)) return null;
      return limpo;
    };

    let numero = campo(numeroM?.[1], /nenhum/i);
    if (numero) numero = numero.replace(/\D+/g, '') || null;
    if (numero && numero.length < 4) numero = null; // muito curto pra ser um tombamento de verdade

    const descricaoAnalitica = campo(descM?.[1], /nenhuma/i);
    const item = campo(itemM?.[1], /n[aã]o identificado/i);

    if (!numero && !descricaoAnalitica && !item) return null;
    return { numero, descricaoAnalitica, item };
  } catch {
    return null;
  }
}
