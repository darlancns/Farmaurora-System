import { onBeforeUnmount, onMounted } from "vue";

/**
 * Trava o scroll do body enquanto o componente estiver montado — mesmo
 * comportamento que BaseModal.vue já tinha isolado nele; extraído pra
 * NavMoreSheet.vue (sheet do BottomNav) também poder usar sem duplicar.
 */
export function useLockBodyScroll(): void {
  let previousOverflow = "";

  onMounted(() => {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  });

  onBeforeUnmount(() => {
    document.body.style.overflow = previousOverflow;
  });
}
