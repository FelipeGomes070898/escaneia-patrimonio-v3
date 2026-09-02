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
