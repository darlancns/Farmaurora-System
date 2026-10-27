import { useState } from "#app";
import type { Ref } from "vue";
import { getErrorMessage } from "../utils/errorMessages";
import { createToastScheduler, type ToastOptions } from "../utils/toastScheduler";

// Estado de agendamento compartilhado entre todos os useToast() do navegador (o toast é um só).
let currentMessage: Ref<string | null> | null = null;
const scheduler = createToastScheduler({
  setMessage: (text) => {
    if (currentMessage) currentMessage.value = text;
  },
});

export function useToast() {
  const message = useState<string | null>("toast-message", () => null);
  currentMessage = message;

  function showToast(text: string, options?: ToastOptions): void {
    scheduler.show(text, options);
  }

  // Aviso que precisa ser lido (falha parcial, pendência): dura mais e não é sobrescrito por outro toast.
  function showAviso(text: string): void {
    scheduler.show(text, { protegido: true });
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

  return { message, showToast, showAviso, withToast };
}
