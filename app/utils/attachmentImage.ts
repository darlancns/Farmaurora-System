/**
 * Garante que o print colado seja PNG antes de subir pro Storage (o bucket só
 * aceita image/png e o caminho do arquivo termina em .png). Já PNG passa direto;
 * outro formato de imagem (JPEG/WebP colado de um navegador, por exemplo) é
 * re-codificado num canvas. Qualquer falha vira um erro com mensagem clara —
 * nunca um anexo que some em silêncio.
 */
export async function ensurePngBlob(source: Blob): Promise<Blob> {
  if (source.type === "image/png") return source;
  if (!source.type.startsWith("image/")) {
    throw new Error("O conteúdo colado não é uma imagem. Cole um print (Ctrl+V).");
  }

  const failure = new Error(
    `Não foi possível converter a imagem (${source.type}) para PNG. Salve o print como PNG e cole de novo.`
  );

  try {
    const bitmap = await createImageBitmap(source);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      throw failure;
    }
    context.drawImage(bitmap, 0, 0);
    bitmap.close();

    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw failure;
    return png;
  } catch {
    throw failure;
  }
}
