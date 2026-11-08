import { ref, type Ref } from "vue";
import type { Processo, ProcessoFormPatchPayload } from "#shared/types/processo";
import { ConflitoVersaoError } from "../utils/gravadorAtualizacoes";
import { useProcessos } from "./useProcessos";

// Texto do aviso dentro do modal de edição quando outra pessoa gravou o processo enquanto este formulário
// estava aberto (o servidor respondeu 409 e NÃO gravou nada).
export const MENSAGEM_CONFLITO_EDICAO =
  "Este processo foi alterado por outra pessoa enquanto você editava. Recarregue para ver a versão atual e refaça sua alteração.";

export type ResultadoSalvarEdicao = { tipo: "salvo" } | { tipo: "conflito" };
export type ResultadoRecarregarEdicao = { tipo: "recarregado" } | { tipo: "removido" };

// Fluxo de salvar/recarregar do formulário de EDIÇÃO de processo diante de um conflito de versão.
//
// - `salvar`: grava o patch. Conflito (409) NÃO é erro de tela genérico: vira `conflito = true` (o modal mostra o
//   aviso, segue aberto e o que a pessoa digitou fica intacto) e devolve { tipo: "conflito" }. Qualquer outro erro
//   é repassado a quem chamou. Não existe "salvar mesmo assim": reenviar a versão antiga dá 409 de novo.
// - `recarregar`: busca a linha atual e a coloca em `editingProcesso`; o formulário recarrega por ela (e passa a
//   usar a versão nova), descartando as alterações em andamento. Sem confirmação extra.
export function useConflitoEdicaoProcesso(editingProcesso: Ref<Processo | null>) {
  const { processos, patchProcesso, recarregarProcesso } = useProcessos();
  const conflito = ref(false);
  const recarregando = ref(false);

  function limpar(): void {
    conflito.value = false;
    recarregando.value = false;
  }

  async function salvar(id: string, payload: ProcessoFormPatchPayload): Promise<ResultadoSalvarEdicao> {
    try {
      await patchProcesso(id, payload);
      conflito.value = false;
      return { tipo: "salvo" };
    } catch (e) {
      if (e instanceof ConflitoVersaoError) {
        conflito.value = true;
        return { tipo: "conflito" };
      }
      throw e;
    }
  }

  async function recarregar(): Promise<ResultadoRecarregarEdicao> {
    const id = editingProcesso.value?.id;
    if (!id || recarregando.value) return { tipo: "recarregado" };

    recarregando.value = true;
    try {
      // Falha de rede/servidor lança: o aviso fica na tela e a pessoa pode tentar de novo.
      await recarregarProcesso(id);
      const atual = processos.value.find((p) => p.id === id);
      // Sumiu (404): o processo foi excluído enquanto o formulário estava aberto.
      if (!atual) return { tipo: "removido" };
      editingProcesso.value = atual;
      conflito.value = false;
      return { tipo: "recarregado" };
    } finally {
      recarregando.value = false;
    }
  }

  return { conflito, recarregando, salvar, recarregar, limpar };
}
