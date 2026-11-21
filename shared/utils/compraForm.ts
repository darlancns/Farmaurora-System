import { PENDENCIAS_PADRAO } from "../constants/compra";
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

// ── Pendências: chips + texto livre ↔ pendencias[] ───────────────────────────────────────────────────────────

/** Separador do texto livre quando as entradas fora da lista padrão são mostradas juntas no campo "Outras pendências". */
export const SEPARADOR_PENDENCIAS_LIVRES = "; ";

export interface PendenciasNoFormulario {
  /** Os rótulos de PENDENCIAS_PADRAO marcados. */
  marcadas: string[];
  /** As entradas que NÃO estão na lista padrão, unidas por "; ". */
  livre: string;
}

/** pendencias[] da compra → o que o formulário mostra: chips marcados e o campo livre. */
export function pendenciasParaFormulario(pendencias: readonly string[]): PendenciasNoFormulario {
  const padrao = new Set<string>(PENDENCIAS_PADRAO);
  const marcadas = PENDENCIAS_PADRAO.filter((p) => pendencias.includes(p));
  const livres = pendencias.map((p) => p.trim()).filter((p) => p !== "" && !padrao.has(p));
  return { marcadas: [...marcadas], livre: livres.join(SEPARADOR_PENDENCIAS_LIVRES) };
}

/** O que o formulário mostra → pendencias[]: os chips marcados (pelo rótulo, na ordem da lista padrão) + UMA entrada final com o texto livre, se houver. */
export function pendenciasDoFormulario(marcadas: readonly string[], livre: string): string[] {
  const escolhidas = PENDENCIAS_PADRAO.filter((p) => marcadas.includes(p));
  const texto = livre.trim();
  return texto === "" ? [...escolhidas] : [...escolhidas, texto];
}

// ── O que a ordem já tem ─────────────────────────────────────────────────────────────────────────────────────

const tem = (v: string | null | undefined): boolean => (v ?? "").trim() !== "";

/** O item tem algum campo preenchido? (O que o formulário mostra: ids e posição não contam.) */
export function itemTemConteudo(i: ItemCompra): boolean {
  return (
    tem(i.medicamento) ||
    tem(i.apresentacao) ||
    tem(i.referencia) ||
    tem(i.laboratorio) ||
    tem(i.quantidade) ||
    tem(i.temperatura) ||
    i.valorUnitario !== null ||
    i.valorReal !== null ||
    tem(i.medicamentoCadastroId) ||
    tem(i.preCadastroId)
  );
}

/** A ordem tem qualquer campo ou item preenchido? É o que decide se "Remover ordem" pede confirmação. */
export function ordemTemConteudo(o: OrdemCompra): boolean {
  return tem(o.fornecedor) || tem(o.envio) || tem(o.cia) || tem(o.po) || o.frete !== null || o.freteReal !== null || o.itens.some(itemTemConteudo);
}
