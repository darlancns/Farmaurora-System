import { reactive } from "vue";

interface OutroSentinelState {
  select: string;
  outroTexto: string;
}

interface UseOutroSentinelReturn {
  state: OutroSentinelState;
  load: (valor: string | undefined) => void;
  build: () => string;
}

export function useOutroSentinel(opcoesFixas: readonly string[]): UseOutroSentinelReturn {
  const state = reactive<OutroSentinelState>({
    select: "",
    outroTexto: "",
  });

  function load(valor: string | undefined): void {
    if (!valor) {
      state.select = "";
      state.outroTexto = "";
      return;
    }
    if (opcoesFixas.includes(valor)) {
      state.select = valor;
      state.outroTexto = "";
      return;
    }
    state.select = "Outro";
    state.outroTexto = valor;
  }

  function build(): string {
    if (state.select === "Outro") return state.outroTexto.trim();
    return state.select;
  }

  return { state, load, build };
}
