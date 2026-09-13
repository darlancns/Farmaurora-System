import { onBeforeUnmount, onMounted } from "vue";

/**
 * Fecha ao pressionar Esc — mesmo listener de `document.addEventListener("keydown", ...)`
 * que os modais já tinham copiado cada um o seu, agora reaproveitável fora de
 * BaseModal.vue também, se precisar.
 */
export function useEscapeToClose(onClose: () => void): void {
  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") onClose();
  }

  onMounted(() => document.addEventListener("keydown", onKeydown));
  onBeforeUnmount(() => document.removeEventListener("keydown", onKeydown));
}
