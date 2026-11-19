import { NOME_RESERVADO_CADASTRO, ROTULO_INATIVO_CADASTRO } from "../constants/cadastros";

// Regras puras de nome dos Cadastros (servidor, tela e testes usam as mesmas).

/**
 * Chave de comparação do nome: sem acento, sem diferença de caixa e com espaços repetidos colapsados. É a MESMA
 * normalização de `chaveFornecedor` (shared/utils/dirParser.ts) — "Care  PHARMA" e "care pharma" são o mesmo nome — e é
 * o que a coluna `nome_chave` (índice único, ativos e inativos) guarda.
 */
export function chaveCadastro(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Nome de medicamento: sempre em MAIÚSCULAS (o mesmo `toUpperCase` dos campos de medicamento do Follow-Up e da DIR). */
export function nomeEmMaiusculas(nome: string): string {
  return nome.toUpperCase();
}

/** "Outro" (em qualquer caixa/acento) é o sentinela dos selects das telas, não um item da lista. */
export function nomeReservadoCadastro(nome: string): boolean {
  return chaveCadastro(nome) === chaveCadastro(NOME_RESERVADO_CADASTRO);
}

interface ItemOrdenavel {
  nome: string;
  ativo: boolean;
}

const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function comparar(a: ItemOrdenavel, b: ItemOrdenavel): number {
  // "Outro" nunca é um item, mas se aparecer (dado antigo) fica por último, como nos selects das telas.
  const outroA = nomeReservadoCadastro(a.nome);
  const outroB = nomeReservadoCadastro(b.nome);
  if (outroA !== outroB) return outroA ? 1 : -1;
  return COLLATOR.compare(a.nome, b.nome) || a.nome.localeCompare(b.nome, "pt-BR");
}

/** Ativos primeiro e inativos depois; dentro de cada grupo, ordem alfabética pt-BR. Devolve uma cópia. */
export function ordenarCadastro<T extends ItemOrdenavel>(itens: readonly T[]): T[] {
  return [...itens].sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return comparar(a, b);
  });
}

/** Nome para exibir: o desativado leva " (inativo)". */
export function rotuloCadastro(item: ItemOrdenavel): string {
  return item.ativo ? item.nome : `${item.nome} ${ROTULO_INATIVO_CADASTRO}`;
}
