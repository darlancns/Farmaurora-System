import { onBeforeUnmount, onMounted } from "vue";

export const INTERVALO_MINIMO_RECARGA_MS = 60_000;

export interface OpcoesRecarregarAoVoltar {
  recarregar: () => Promise<unknown> | unknown;
  /** true = não recarrega agora (ex.: formulário de processo aberto, para não trocar os dados por baixo dele). */
  bloqueado: () => boolean;
  intervaloMinimoMs?: number;
  /** Relógio injetável (testes). */
  agora?: () => number;
}

/**
 * Decide se a volta à aba deve recarregar: a aba está visível, nada bloqueia e já passou o intervalo mínimo desde a
 * última recarga (ou da abertura da página). Pura, para testar sem DOM.
 */
export function deveRecarregar(params: {
  visivel: boolean;
  bloqueado: boolean;
  agora: number;
  ultimaRecarga: number;
  intervaloMinimoMs: number;
}): boolean {
  if (!params.visivel || params.bloqueado) return false;
  return params.agora - params.ultimaRecarga >= params.intervaloMinimoMs;
}

/**
 * Recarrega a lista quando a pessoa volta para a aba do navegador (visibilitychange ou focus), no máximo uma vez a
 * cada `intervaloMinimoMs` (padrão 60s) e nunca com o formulário aberto. Assim o quadro não fica dias desatualizado
 * numa aba esquecida, sem polling.
 */
export function useRecarregarAoVoltar(opcoes: OpcoesRecarregarAoVoltar): { verificar: () => void } {
  const intervalo = opcoes.intervaloMinimoMs ?? INTERVALO_MINIMO_RECARGA_MS;
  const agora = opcoes.agora ?? (() => Date.now());
  let ultimaRecarga = agora();
  let recarregando = false;

  function verificar(): void {
    if (recarregando) return;
    const visivel = typeof document === "undefined" || document.visibilityState !== "hidden";
    if (
      !deveRecarregar({
        visivel,
        bloqueado: opcoes.bloqueado(),
        agora: agora(),
        ultimaRecarga,
        intervaloMinimoMs: intervalo,
      })
    ) {
      return;
    }
    ultimaRecarga = agora();
    recarregando = true;
    void Promise.resolve()
      .then(() => opcoes.recarregar())
      .catch(() => {
        // erro de rede já aparece pelo estado de erro da lista; a próxima volta tenta de novo
      })
      .finally(() => {
        recarregando = false;
      });
  }

  onMounted(() => {
    ultimaRecarga = agora();
    document.addEventListener("visibilitychange", verificar);
    window.addEventListener("focus", verificar);
  });
  onBeforeUnmount(() => {
    document.removeEventListener("visibilitychange", verificar);
    window.removeEventListener("focus", verificar);
  });

  return { verificar };
}
