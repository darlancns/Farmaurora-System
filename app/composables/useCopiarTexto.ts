// Copiar um texto para a área de transferência: primeiro pelo navigator.clipboard (quando existe, em contexto seguro) e, se ele não
// existe ou recusa, por um <textarea> oculto com document.execCommand("copy"). Copia EXATAMENTE a string recebida (texto puro, nunca
// HTML). Devolve true/false: quem chama decide o toast ("Resumo copiado" ou o erro).

export interface AmbienteCopiar {
  /** navigator.clipboard (ou null quando o navegador não oferece). */
  clipboard: { writeText: (texto: string) => Promise<void> } | null;
  /** O documento onde o textarea de apoio é criado (null fora do navegador). */
  documento: Document | null;
}

function ambienteDoNavegador(): AmbienteCopiar {
  return {
    clipboard: typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function" ? navigator.clipboard : null,
    documento: typeof document !== "undefined" ? document : null,
  };
}

/** O plano B: textarea fora da tela + execCommand. Devolve se o navegador disse que copiou. O foco volta para onde estava. */
function copiarPorTextarea(texto: string, documento: Document): boolean {
  const anterior = documento.activeElement instanceof HTMLElement ? documento.activeElement : null;
  const area = documento.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.setAttribute("aria-hidden", "true");
  area.tabIndex = -1;
  area.style.position = "fixed";
  area.style.top = "0";
  area.style.left = "-9999px";
  area.style.opacity = "0";
  documento.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, texto.length);
    return typeof documento.execCommand === "function" && documento.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    area.remove();
    anterior?.focus();
  }
}

/** Copia o texto. true = copiou; false = nenhum dos dois caminhos funcionou. Nunca lança. */
export async function copiarTexto(texto: string, ambiente: AmbienteCopiar = ambienteDoNavegador()): Promise<boolean> {
  if (ambiente.clipboard) {
    try {
      await ambiente.clipboard.writeText(texto);
      return true;
    } catch {
      // Recusado (permissão, página sem foco): tenta o plano B.
    }
  }
  return ambiente.documento ? copiarPorTextarea(texto, ambiente.documento) : false;
}

export function useCopiarTexto(): { copiar: (texto: string) => Promise<boolean> } {
  return { copiar: (texto) => copiarTexto(texto) };
}
