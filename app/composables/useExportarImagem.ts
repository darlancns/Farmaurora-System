import { domToBlob } from "modern-screenshot";
import { useToast } from "./useToast";
import { copiarImagemParaClipboard, baixarBlob } from "../utils/pagamentoExport";

// Gera PNG de um elemento e tenta copiar pro clipboard; se não der, baixa.
// modern-screenshot resolve @font-face web nativamente — não precisamos
// coletar/injetar fontEmbedCSS na mão como na versão antiga.
export function useExportarImagem() {
  const { showToast } = useToast();

  async function exportarParaImagem(elemento: HTMLElement, nomeArquivo: string): Promise<void> {
    let blob: Blob | null = null;
    try {
      // Garante que as fontes do documento já estão carregadas antes de
      // rasterizar (evita fallback no primeiro export da sessão).
      if (document.fonts?.ready) await document.fonts.ready;

      blob = await domToBlob(elemento, {
        scale: 2, // equivalente ao pixelRatio 2 → PNG de 920px de largura
        backgroundColor: "#ffffff",
      });
    } catch {
      blob = null;
    }

    if (!blob) {
      showToast("Não foi possível gerar a imagem");
      return;
    }

    if (await copiarImagemParaClipboard(blob)) {
      showToast("Copiado! Cole no WhatsApp");
      return;
    }

    baixarBlob(blob, nomeArquivo);
    showToast("Não deu pra copiar automaticamente — baixamos a imagem");
  }

  return { exportarParaImagem };
}
