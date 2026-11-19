import { ROTULO_INATIVO_CADASTRO } from "#shared/constants/cadastros";
import { nomesConsultoresAtivos, situacaoDoConsultor, type ItemConsultor } from "#shared/utils/consultorRegra";
import type { AppSelectOption } from "../types/appSelect";

// Opções do select "Consultor" de TODAS as telas (Follow-Up, Prestação, DIR e Contas): "Selecione" + os consultores ATIVOS do
// Cadastro, em ordem alfabética (fonte única: lista "consultores"). Sem "Outro". Funções puras (tests/unit/consultorOptions.spec.ts).

/**
 * `atual` = o valor que o registro já tem. Se ele não está na lista ativa, entra como opção extra e continua selecionado, nunca
 * vira vazio, até a pessoa trocá-lo: "<valor> (inativo)" quando existe no Cadastro como inativo; o próprio valor, sem sufixo,
 * quando não existe no Cadastro (valor antigo ou literal: "A ser definido", "Braulio (3RB)", "Flavinha"…).
 * Só consultor ativo pode ser escolhido como valor novo.
 */
export function montarConsultorOptions(atual: string, itens: readonly ItemConsultor[]): AppSelectOption<string>[] {
  const ativos = nomesConsultoresAtivos(itens);
  const opcoes: AppSelectOption<string>[] = [{ value: "", label: "Selecione" }, ...ativos.map((nome) => ({ value: nome, label: nome }))];
  if (atual.trim() !== "" && !ativos.includes(atual)) {
    const inativo = situacaoDoConsultor(atual, itens) === "inativo";
    opcoes.push({ value: atual, label: inativo ? `${atual.trim()} ${ROTULO_INATIVO_CADASTRO}` : atual.trim() });
  }
  return opcoes;
}
