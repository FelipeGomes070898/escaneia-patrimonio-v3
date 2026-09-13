/** Reduz o tamanho de uma foto tirada pela câmera do celular antes de
 *  enviar (fotos de celular costumam vir com 3–8 MB). Redimensiona pro
 *  lado maior ter no máximo 1600px e comprime em JPEG. */
export async function comprimirImagem(arquivo: File, ladoMaximo = 1600, qualidade = 0.8): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0, largura, altura);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', qualidade));
    if (!blob) return arquivo;

    return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    // Se der qualquer problema (formato não suportado etc.), manda o original
    return arquivo;
  }
}

/** "Realça" uma foto de etiqueta apagada/desbotada pra ajudar a ler o
 *  número — não existe câmera de celular que enxergue luz ultravioleta de
 *  verdade, então em vez disso a gente estica o contraste da foto ao
 *  máximo (converte pra tons de cinza e empurra o mais claro pra branco e
 *  o mais escuro pra preto). Em etiquetas de metal gravado ou plástico
 *  desbotado isso costuma "revelar" números que a olho nu quase não dá
 *  pra ver. Usada só na hora de TENTAR ler automaticamente (pelo OCR e
 *  pela IA) — a foto guardada no cadastro continua sendo a original. */
export async function realcarEtiqueta(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return arquivo;
    ctx.drawImage(bitmap, 0, 0);

    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;

    // 1) Passa pra tons de cinza e descobre o intervalo real de brilho da
    //    foto (etiqueta desbotada normalmente só usa uma faixa pequena de
    //    cinza, nem chega perto do preto/branco puro).
    let min = 255;
    let max = 0;
    const cinzas = new Uint8ClampedArray(d.length / 4);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const cinza = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      cinzas[p] = cinza;
      if (cinza < min) min = cinza;
      if (cinza > max) max = cinza;
    }

    // 2) Estica esse intervalo pro preto/branco máximo — isso é o que
    //    costuma fazer um número quase invisível aparecer.
    const alcance = Math.max(1, max - min);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const v = Math.round(((cinzas[p] - min) / alcance) * 255);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob) return arquivo;
    return new File([blob], arquivo.name.replace(/\.\w+$/, '') + '-realce.jpg', { type: 'image/jpeg' });
  } catch {
    return arquivo;
  }
}
