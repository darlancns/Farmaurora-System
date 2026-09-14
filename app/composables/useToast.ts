import { useState } from "#app";
import { getErrorMessage } from "../utils/errorMessages";

let hideTimeoutId: ReturnType<typeof setTimeout> | undefined;

export function useToast() {
  const message = useState<string | null>("toast-message", () => null);

  function showToast(text: string): void {
    message.value = text;
    if (hideTimeoutId) clearTimeout(hideTimeoutId);
    hideTimeoutId = setTimeout(() => {
      message.value = null;
    }, 2200);
  }

  // Padrão repetido: roda a ação, toast de sucesso; em erro, toast de erro. Não
  // relança. Handlers com sucesso silencioso ou com limpeza em `finally` (fecham
  // um ConfirmDialog dê certo ou não) não usam este helper. Consolidado aqui
  // (era copiado igual em useBancoActions.ts e useGrupoActions.ts — item #11 do
  // ARCHITECTURE_REPORT.md).
  async function withToast(fn: () => Promise<void>, okMsg: string, errMsg: string): Promise<void> {
    try {
      await fn();
      showToast(okMsg);
    } catch (e) {
      showToast(getErrorMessage(e, errMsg));
    }
  }

  return { message, showToast, withToast };
}
