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
