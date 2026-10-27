import { ref } from "vue";

/**
 * Trava de envio em andamento. A guarda é uma variável síncrona (não só o `ref` que desabilita o
 * botão): dois submits no mesmo instante — duplo clique, Enter + clique — chegam antes de o Vue
 * re-renderizar, então só uma flag lida e escrita no mesmo tick os separa.
 *
 * `executar` devolve `false` (sem rodar nada) se já há um envio em andamento; senão roda `tarefa`
 * e libera a trava no `finally`, dê certo ou não.
 */
export function useTravaEnvio() {
  const emAndamento = ref(false);
  let travado = false;

  async function executar(tarefa: () => Promise<void>): Promise<boolean> {
    if (travado) return false;
    travado = true;
    emAndamento.value = true;
    try {
      await tarefa();
      return true;
    } finally {
      travado = false;
      emAndamento.value = false;
    }
  }

  return { emAndamento, executar };
}
