import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

// Relógio reativo que se atualiza a cada minuto (e ao voltar para a aba, que o navegador deixa dormindo): o sino
// reavalia os avisos que dependem da hora (o "chegou?" passa a valer às 13:00 de Brasília) sem ninguém recarregar
// a página. O instante é um Date comum; quem calcula converte para Brasília (shared/utils/dataBrasilia.ts).
export const INTERVALO_RELOGIO_MS = 60_000;

export function useRelogioMinuto(intervaloMs: number = INTERVALO_RELOGIO_MS): Ref<Date> {
  const agora = ref<Date>(new Date());
  let timer: ReturnType<typeof setInterval> | null = null;

  function atualizar(): void {
    agora.value = new Date();
  }

  function aoMudarVisibilidade(): void {
    if (document.visibilityState === "visible") atualizar();
  }

  // Só no navegador: nada de timer no render do servidor.
  onMounted(() => {
    atualizar();
    timer = setInterval(atualizar, intervaloMs);
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
  });

  onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer);
    timer = null;
    document.removeEventListener("visibilitychange", aoMudarVisibilidade);
  });

  return agora;
}
