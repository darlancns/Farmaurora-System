import { PENDENCIAS_PADRAO } from "../constants/compra";
import { ciasAereasDoModal } from "../constants/processos";
import type { ItemCompra } from "../types/compra";
import { chaveCadastro } from "./cadastroNome";

// Peças puras do formulário da Compra: ids novos, medicamento vazio, posições recalculadas e as pendências (chips + texto livre).

/**
 * Id novo de um medicamento ("itm_..."). O servidor aceita 6 a 64 letras, números, "_" e "-" (COMPRA_ID_RE): prefixo + crypto.randomUUID()
 * (36 caracteres) cabe com folga. Sem crypto.randomUUID (navegador antigo, página sem HTTPS), cai num id aleatório do mesmo formato.
 */
export function novoIdCompra(prefixo: "itm"): string {
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
    medicamentoCadastroNome: null,
    preCadastroId: null,
    laboratorio: "",
    brand: "",
    quantidade: "",
    temperatura: "",
    valorUnitario: null,
    valorReal: null,
  };
}

/** A posição (1..N) de cada medicamento é a ordem em que aparece na tela. Não altera o recebido. */
export function renumerarItens(itens: readonly ItemCompra[]): ItemCompra[] {
  return itens.map((it, i) => ({ ...it, posicao: i + 1 }));
}

// ── Medicamentos da compra (a lista de itens que o formulário edita) ────────────────────────────────────────────

/** Troca os campos de UM medicamento (pelo id), sem mexer nos outros nem no recebido. Id que não existe: nada muda. */
export function atualizarItem(itens: readonly ItemCompra[], id: string, mudancas: Partial<ItemCompra>): ItemCompra[] {
  return itens.map((i) => (i.id === id ? { ...i, ...mudancas } : i));
}

/** Acrescenta um medicamento vazio no fim (até `max`; passou, devolve a lista como está). As posições seguem a ordem. */
export function adicionarItem(itens: readonly ItemCompra[], max: number): ItemCompra[] {
  if (itens.length >= max) return renumerarItens(itens);
  return renumerarItens([...itens, itemVazio(itens.length + 1)]);
}

/** Tira um medicamento (pelo id); nunca deixa a compra sem nenhum (com 1 só, a lista fica como está). */
export function removerItem(itens: readonly ItemCompra[], id: string): ItemCompra[] {
  if (itens.length <= 1) return renumerarItens(itens);
  return renumerarItens(itens.filter((i) => i.id !== id));
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

// ── Cia aérea depende do modal de envio ─────────────────────────────────────────────────────────────────────

/**
 * A cia que fica depois de o Envio mudar: a atual, se ela vale para o NOVO modal (comparada sem acento nem caixa, como o servidor; devolve o
 * nome canônico da lista), senão "" (a cia some; a pessoa escolhe de novo). Sem modal, nenhuma cia vale. Pura: o editor e o formulário
 * usam esta mesma função.
 */
export function ciaAposTrocaDeEnvio(envio: string, cia: string): string {
  const chave = chaveCadastro(cia);
  if (chave === "") return "";
  return ciasAereasDoModal(envio).find((c) => chaveCadastro(c) === chave) ?? "";
}
