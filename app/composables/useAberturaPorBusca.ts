import { computed, reactive, watch } from "vue";
import type { Processo } from "#shared/types/processo";
import {
  assinaturaDeResultados,
  avancarAberturaPorBusca,
  criarTermoBusca,
  type EstadoAbertura,
} from "../utils/processoBusca";

// Estado de abertura de uma lista de processos (grupos de consultor e detalhes das linhas) e a abertura
// automática quando há busca. A regra em si é pura (utils/processoBusca.ts); aqui só se liga o estado
// reativo. Vive na PÁGINA (uma instância por aba), não nas listas: assim trocar de aba não perde nada.
//
// Sem busca ele é só o estado manual de sempre (tudo recolhido no começo). O watch observa só o conjunto
// de resultados (e se há busca) e escreve nos Sets, que ele mesmo não observa — sem loop reativo.

export interface OpcoesAberturaPorBusca {
  termo: () => string;
  // Processos encontrados na aba (já com a busca e todos os filtros). Só é lido quando há termo.
  encontrados: () => readonly Processo[];
  // Lista com grupos por consultor? (o cargo consultor vê lista plana)
  agrupado: () => boolean;
}

export interface AberturaPorBusca {
  grupos: Set<string>;
  detalhes: Set<string>;
  /** Abre/fecha o grupo. Ao FECHAR, os detalhes abertos dos processos dele (`idsDoGrupo`) se fecham também. */
  alternarGrupo: (consultor: string, idsDoGrupo?: readonly string[]) => void;
  abrirGrupo: (consultor: string) => void;
  alternarDetalhe: (id: string) => void;
  definirDetalhe: (id: string, aberto: boolean) => void;
}

function substituir(alvo: Set<string>, origem: ReadonlySet<string>): void {
  alvo.clear();
  for (const item of origem) alvo.add(item);
}

export function useAberturaPorBusca(opcoes: OpcoesAberturaPorBusca): AberturaPorBusca {
  const grupos = reactive(new Set<string>());
  const detalhes = reactive(new Set<string>());

  let snapshot: EstadoAbertura | null = null;
  let assinatura: string | null = null;

  // Só muda quando começa/termina a busca ou quando o CONJUNTO de resultados muda (não a cada tecla).
  const chave = computed<string | null>(() =>
    criarTermoBusca(opcoes.termo()) ? assinaturaDeResultados(opcoes.encontrados(), opcoes.agrupado()) : null,
  );

  watch(
    chave,
    () => {
      const passo = avancarAberturaPorBusca({
        termo: opcoes.termo(),
        encontrados: opcoes.encontrados(),
        agrupado: opcoes.agrupado(),
        atual: { grupos, detalhes },
        snapshot,
        assinatura,
      });
      snapshot = passo.snapshot;
      assinatura = passo.assinatura;
      if (passo.estado.grupos !== grupos) substituir(grupos, passo.estado.grupos);
      if (passo.estado.detalhes !== detalhes) substituir(detalhes, passo.estado.detalhes);
    },
    { immediate: true },
  );

  function definirDetalhe(id: string, aberto: boolean): void {
    if (aberto) detalhes.add(id);
    else detalhes.delete(id);
  }

  return {
    grupos,
    detalhes,
    alternarGrupo(consultor, idsDoGrupo = []) {
      if (grupos.has(consultor)) {
        grupos.delete(consultor);
        for (const id of idsDoGrupo) detalhes.delete(id);
      } else {
        grupos.add(consultor);
      }
    },
    abrirGrupo(consultor) {
      grupos.add(consultor);
    },
    alternarDetalhe(id) {
      definirDetalhe(id, !detalhes.has(id));
    },
    definirDetalhe,
  };
}
