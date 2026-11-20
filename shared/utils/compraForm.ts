import { MODAL_COURIER_SIMPLES } from "../constants/processos";
import type { ItemCompra, OrdemCompra } from "../types/compra";

// Peças puras do formulário da Compra: ids novos, ordem e item vazios, posições recalculadas e o Courier Simples derivado.

/**
 * Id novo de uma ordem ("ord_...") ou de um item ("itm_..."). O servidor aceita 6 a 64 letras, números, "_" e "-" (COMPRA_ID_RE):
 * prefixo + crypto.randomUUID() (36 caracteres) cabe com folga. Sem crypto.randomUUID (navegador antigo, página sem HTTPS), cai num id aleatório
 * do mesmo formato.
 */
export function novoIdCompra(prefixo: "ord" | "itm"): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const unico = c?.randomUUID ? c.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
  return `${prefixo}_${unico}`;
}

export function itemVazio(posicao: number): ItemCompra {
  return {
    id: novoIdCompra("itm"),
    posicao,
    medicamento: "",
    medicamentoCadastroId: null,
    preCadastroId: null,
    apresentacao: "",
    referencia: "",
    laboratorio: "",
    quantidade: "",
    temperatura: "",
    valorUnitario: null,
    valorReal: null,
  };
}

/** Uma ordem vazia com UM item vazio (o servidor aceita rascunho parcial). */
export function ordemVazia(posicao: number): OrdemCompra {
  return {
    id: novoIdCompra("ord"),
    posicao,
    fornecedor: "",
    envio: "",
    cia: "",
    po: "",
    frete: null,
    freteReal: null,
    dirId: null,
    encaminhadaEm: null,
    itens: [itemVazio(1)],
  };
}

/** A posição (1..N) de cada ordem e de cada item é a ordem em que aparecem na tela. Não altera o recebido. */
export function renumerar(ordens: readonly OrdemCompra[]): OrdemCompra[] {
  return ordens.map((o, i) => ({ ...o, posicao: i + 1, itens: o.itens.map((it, j) => ({ ...it, posicao: j + 1 })) }));
}

/** Courier Simples da compra: verdadeiro quando há ordens e TODAS têm esse envio. É sempre derivado (não é campo editável). */
export function courierSimplesDasOrdens(ordens: readonly Pick<OrdemCompra, "envio">[]): boolean {
  return ordens.length > 0 && ordens.every((o) => o.envio === MODAL_COURIER_SIMPLES);
}
