import { ref } from "vue";
import type { AtualizacaoProcesso } from "#shared/types/processo";
import { useProcessos } from "./useProcessos";
import { adicionarAtualizacao, editarAtualizacao, excluirAtualizacao } from "../utils/atualizacoesLista";
import type { AlteracaoAtualizacoes } from "../utils/gravadorAtualizacoes";
import { getErrorMessage } from "../utils/errorMessages";

// Estado de envio e erro das ações sobre as atualizações de UM processo. As três ações (adicionar,
// editar, excluir) passam pelo MESMO caminho de gravação (useProcessos().alterarAtualizacoes: fila por
// processo + conferência de versão). Cada ação devolve `true` só se gravou — o componente limpa o campo
// ou fecha a edição apenas nesse caso; em falha, o texto digitado fica e `erro` traz a mensagem.
export function useAtualizacoesProcesso(processoId: () => string) {
  const { alterarAtualizacoes } = useProcessos();
  const salvando = ref(false);
  const erro = ref<string | null>(null);

  async function executar(alterar: AlteracaoAtualizacoes): Promise<boolean> {
    if (salvando.value) return false;
    salvando.value = true;
    erro.value = null;
    try {
      await alterarAtualizacoes(processoId(), alterar);
      return true;
    } catch (e) {
      erro.value = getErrorMessage(e, "Erro ao salvar a atualização.");
      return false;
    } finally {
      salvando.value = false;
    }
  }

  function adicionar(item: AtualizacaoProcesso): Promise<boolean> {
    return executar((lista) => adicionarAtualizacao(lista, item));
  }

  function editar(indice: number, esperado: AtualizacaoProcesso, item: AtualizacaoProcesso): Promise<boolean> {
    return executar((lista) => editarAtualizacao(lista, indice, item, esperado));
  }

  function excluir(indice: number, esperado: AtualizacaoProcesso): Promise<boolean> {
    return executar((lista) => excluirAtualizacao(lista, indice, esperado));
  }

  function limparErro(): void {
    erro.value = null;
  }

  return { salvando, erro, adicionar, editar, excluir, limparErro };
}
