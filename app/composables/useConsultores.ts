import { computed, type ComputedRef } from "vue";
import { nomesConsultoresAtivos, type ItemConsultor } from "#shared/utils/consultorRegra";
import { getErrorMessage } from "../utils/errorMessages";
import { useCadastros } from "./useCadastros";

// Consultores do Cadastro para as telas (Contas, Follow-Up, Prestação e DIR): UMA lista só, a lista "consultores" de
// Configurações → Cadastros. Estado compartilhado com a aba Cadastros (o mesmo useState de useCadastros.ts), então renomear ou
// desativar lá aparece nas outras telas na próxima carga. O servidor confere de novo toda gravação (consultoresCadastro.ts).

export interface UseConsultores {
  /** Todos os consultores do Cadastro (ativos e inativos), na ordem do servidor (ativos primeiro, alfabética pt-BR). */
  consultores: ComputedRef<ItemConsultor[]>;
  /** Só os ativos, em ordem alfabética pt-BR: as opções do select Consultor. */
  nomesAtivos: ComputedRef<string[]>;
  /** Carrega a lista. Devolve a mensagem de falha (a tela avisa) ou null; nunca lança. */
  carregarConsultores: () => Promise<string | null>;
}

export function useConsultores(): UseConsultores {
  const { itens, fetchLista } = useCadastros();
  const consultores = computed<ItemConsultor[]>(() => itens.value.consultores.map((c) => ({ nome: c.nome, ativo: c.ativo })));
  const nomesAtivos = computed<string[]>(() => nomesConsultoresAtivos(consultores.value));

  async function carregarConsultores(): Promise<string | null> {
    try {
      await fetchLista("consultores");
      return null;
    } catch (e) {
      return getErrorMessage(e, "Não foi possível carregar a lista de consultores.");
    }
  }

  return { consultores, nomesAtivos, carregarConsultores };
}
