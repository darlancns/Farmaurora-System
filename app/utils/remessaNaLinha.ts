import type { Processo } from "#shared/types/processo";
import { normalizarPasta } from "./processoBusca";

// Quando a linha do processo mostra "Remessa N" (Em andamento, desktop e mobile, e Entregues): SÓ quando o
// Nº Remessa é maior que 1 OU quando existe mais de um processo com a mesma pasta. O formulário e o detalhe mostram
// sempre o "Nº Remessa". Funções puras, testadas em tests/unit/remessaNaLinha.spec.ts.
//
// A contagem por pasta usa TODOS os processos carregados (Em andamento + Entregues), nunca só a lista filtrada pela
// busca/filtros — senão buscar por um paciente faria a "Remessa 1" de uma pasta repetida sumir.
//
// Pasta VAZIA (opcional: "", só espaços/hífens, ou null de linha antiga) não conta: processos sem pasta não são
// "a mesma pasta" entre si, então nunca mostram "Ordem N" por isso (só pelo próprio Nº Remessa > 1).

/** Pasta → quantos processos a têm. A chave ignora espaços, hífens e caixa ("2026 - 414" = "2026414"). */
export type ContagemPorPasta = ReadonlyMap<string, number>;

export function contarProcessosPorPasta(todos: readonly Pick<Processo, "pasta">[]): ContagemPorPasta {
  const contagem = new Map<string, number>();
  for (const { pasta } of todos) {
    const chave = normalizarPasta(pasta);
    if (chave === "") continue;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  return contagem;
}

/** A linha mostra "Remessa N"? `contagem` vem de `contarProcessosPorPasta(TODOS os processos)`. */
export function remessaVisivelNaLinha(
  processo: Pick<Processo, "pasta" | "numeroRemessa">,
  contagem: ContagemPorPasta,
): boolean {
  if (processo.numeroRemessa > 1) return true;
  const chave = normalizarPasta(processo.pasta);
  return chave !== "" && (contagem.get(chave) ?? 0) > 1;
}
