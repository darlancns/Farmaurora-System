import { DIR_MEDICAMENTO_SEPARADOR } from "../constants/compraChecklist";

// O que a Compra manda para a DIR. Função PURA, usada pelo checklist (limite de 300 caracteres) e, depois, pelo "Encaminhar para a DIR".

interface ItemParaDir {
  readonly medicamento: string;
  readonly apresentacao: string;
}

interface OrdemParaDir {
  readonly itens: readonly ItemParaDir[];
}

const limpar = (v: string | null | undefined): string => (v ?? "").replace(/\s+/g, " ").trim();

/**
 * O texto do campo "medicamento" da linha da DIR para uma ordem: cada item vira `nome + " " + apresentação` (sem espaço sobrando,
 * em MAIÚSCULAS) e os itens são unidos por " + ". Item sem nome nem apresentação não entra. Ordem sem itens: "".
 *
 * Os itens saem na ordem do array (quem chama passa a ordem de `posicao`).
 */
export function textoMedicamentoDir(ordem: OrdemParaDir): string {
  return ordem.itens
    .map((i) => limpar(`${limpar(i.medicamento)} ${limpar(i.apresentacao)}`).toUpperCase())
    .filter((t) => t !== "")
    .join(DIR_MEDICAMENTO_SEPARADOR);
}
