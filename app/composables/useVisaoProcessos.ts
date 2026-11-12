import { computed, onMounted, ref, type ComputedRef, type Ref } from "vue";
import {
  DEFAULT_VISAO,
  lerVisaoSalva,
  salvarVisao,
  type ArmazenamentoVisao,
  type VisaoProcessos,
} from "../utils/processoVisao";

function armazenamentoDoNavegador(): ArmazenamentoVisao | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // acessar localStorage pode lançar (site data bloqueado)
  }
}

export interface VisaoProcessosControle {
  /** Visão escolhida (padrão DEFAULT_VISAO até o cliente montar e ler a preferência). */
  visao: Ref<VisaoProcessos>;
  /** Mostra a alternância Kanban | Lista? Só no cliente, depois de montar, e só para quem pode editar. */
  mostrarAlternancia: ComputedRef<boolean>;
  /** Mostra o Kanban? Mesmas condições + visão "kanban". */
  mostrarKanban: ComputedRef<boolean>;
  escolher: (visao: VisaoProcessos) => void;
}

/**
 * Alternância Kanban | Lista do Follow-Up. Nada disso existe no HTML do servidor: `montado` só vira true no
 * onMounted (cliente), quando o usuário já foi carregado — assim o primeiro render do cliente bate com o SSR (sem
 * alternância e com a Lista) e só depois aparece o que depende do cargo/permissão (o Vue não corrige atributos
 * divergentes na hidratação; ver o comentário do pb-20 em pages/processos.vue).
 */
export function useVisaoProcessos(podeEditar: () => boolean): VisaoProcessosControle {
  const montado = ref(false);
  // Mesmo com DEFAULT_VISAO = "kanban", o primeiro render (SSR e hidratação) é sempre a Lista: `mostrarKanban`
  // depende de `montado`, que só vira true no onMounted. O Kanban entra logo depois de montar, sem divergência.
  const visao = ref<VisaoProcessos>(DEFAULT_VISAO);

  onMounted(() => {
    visao.value = lerVisaoSalva(armazenamentoDoNavegador());
    montado.value = true;
  });

  const mostrarAlternancia = computed(() => montado.value && podeEditar());
  const mostrarKanban = computed(() => mostrarAlternancia.value && visao.value === "kanban");

  function escolher(nova: VisaoProcessos): void {
    visao.value = nova;
    salvarVisao(armazenamentoDoNavegador(), nova);
  }

  return { visao, mostrarAlternancia, mostrarKanban, escolher };
}
