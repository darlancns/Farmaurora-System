import type { StatusPreCadastro } from "#shared/types/compra";

// Textos da decisão dos pré-cadastros de medicamento (Configurações → Cadastros → Medicamentos → Pendentes de aprovação). Funções puras
// (tests/unit/cadastrosPendentes.spec.ts).

const itensLigados = (n: number): string => (n === 0 ? "" : n === 1 ? " 1 item de compra ligado." : ` ${n} itens de compra ligados.`);

export const textoAprovado = (nome: string, itens: number): string => `"${nome}" aprovado e criado no Cadastro.${itensLigados(itens)}`;

export const textoVinculado = (nome: string, itens: number): string => `Vinculado a "${nome}" do Cadastro.${itensLigados(itens)}`;

export const textoRejeitado = (nome: string): string => `"${nome}" rejeitado. Os itens das compras seguem com o nome digitado.`;

/** Outra pessoa decidiu antes (409): diz o que ela decidiu, quando o servidor informou. */
export function textoJaDecidido(status: StatusPreCadastro | null): string {
  const o = status === "aprovado" ? " aprovado" : status === "rejeitado" ? " rejeitado" : " decidido";
  return `Este pré-cadastro já foi${o} por outra pessoa. A lista foi atualizada.`;
}

export const TITULO_CONFIRMAR_REJEITAR = "Rejeitar pré-cadastro";

export const textoConfirmarRejeitar = (nome: string): string =>
  `Rejeitar o pré-cadastro "${nome}"? Ele não será criado no Cadastro. Os itens das compras continuam com o nome digitado e passam a mostrar o aviso de pré-cadastro rejeitado. Isso não pode ser desfeito.`;
