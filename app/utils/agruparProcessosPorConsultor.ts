import { situacaoDoConsultor, type ItemConsultor, type SituacaoConsultor } from "#shared/utils/consultorRegra";
import type { Processo } from "#shared/types/processo";

export interface ProcessoGroup {
  /** O valor gravado no processo, exatamente como está (a chave do grupo). "" = processo sem consultor. */
  consultor: string;
  /** Título do grupo: o consultor, ou "Sem consultor" quando o valor gravado é vazio. */
  rotulo: string;
  /** Diante do Cadastro: ativo, inativo (existe desativado) ou desconhecido (valor antigo que não existe mais). */
  situacao: SituacaoConsultor;
  processos: Processo[];
}

export const ROTULO_SEM_CONSULTOR = "Sem consultor";

// A mesma ordem alfabética pt-BR dos Cadastros (acento e caixa não atrapalham).
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

const ORDEM_SITUACAO: Record<SituacaoConsultor, number> = { ativo: 0, inativo: 1, desconhecido: 2 };

// Um grupo por consultor que TEM processo — nenhum processo é descartado. A fonte da lista é o Cadastro (`consultores`, ativos e
// inativos): primeiro os consultores ativos, depois os inativos e por último os valores que o Cadastro não conhece (valor antigo,
// literal, "Flavinha"…), cada bloco em ordem alfabética pt-BR. Consultor sem processo não gera grupo. Sem a lista (ainda não
// carregou), todos os valores contam como desconhecidos e saem em ordem alfabética.
export function agruparProcessosPorConsultor(processos: Processo[], consultores: readonly ItemConsultor[] = []): ProcessoGroup[] {
  const porValor = new Map<string, Processo[]>();
  for (const processo of processos) {
    const lista = porValor.get(processo.consultor);
    if (lista) lista.push(processo);
    else porValor.set(processo.consultor, [processo]);
  }

  const grupos: ProcessoGroup[] = [...porValor].map(([consultor, doConsultor]) => ({
    consultor,
    rotulo: consultor.trim() === "" ? ROTULO_SEM_CONSULTOR : consultor,
    situacao: situacaoDoConsultor(consultor, consultores),
    processos: doConsultor,
  }));

  return grupos.sort(
    (a, b) =>
      ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] ||
      COLLATOR.compare(a.rotulo, b.rotulo) ||
      a.rotulo.localeCompare(b.rotulo, "pt-BR"),
  );
}
