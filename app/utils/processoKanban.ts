import { normalizarStatusProcesso, STATUS_PROCESSO_LABELS, STATUS_PROCESSO_ORDER } from "#shared/constants/processos";
import type { Processo, StatusProcesso } from "#shared/types/processo";

// Regras puras do Kanban do Follow-Up (sem Vue): as 5 colunas, em que coluna cada processo cai e a ordem dentro
// da coluna. Testadas em tests/unit/processoKanban.spec.ts.

export interface ColunaKanban {
  // id estável (DOM e testes): kanban-coluna-<id>.
  id: string;
  status: StatusProcesso;
  rotulo: string;
}

const ID_DA_COLUNA: Record<StatusProcesso, string> = {
  elaboracao_fornecedores: "na-origem",
  em_transito: "em-transito",
  desembaraco: "desembaraco",
  liberado: "liberado",
  entregue: "entregue",
};

/** As 5 colunas, na ordem do fluxo (a mesma de STATUS_PROCESSO_ORDER). */
export const COLUNAS_KANBAN: readonly ColunaKanban[] = STATUS_PROCESSO_ORDER.map((status) => ({
  id: ID_DA_COLUNA[status],
  status,
  rotulo: STATUS_PROCESSO_LABELS[status],
}));

/** Coluna (status) do processo. Um status legado que escapasse cai na coluna do equivalente. */
export function colunaDoProcesso(processo: Pick<Processo, "status">): StatusProcesso {
  return normalizarStatusProcesso(processo.status);
}

// ── Ordem dentro da coluna: o mais ANTIGO em cima, por Pasta crescente ─────────────────────────────────────────
// A Pasta é "AAAA - N" (ex.: "2026 - 366"): ordena pelo ano e depois pelo número (como números: "2026 - 9" vem antes
// de "2026 - 10"). A leitura tolera espaços e o hífen colado ("2026-366", " 2026 -366 "). Depois das pastas no
// padrão vêm as fora do padrão (texto, em ordem alfabética com números naturais) e, por último, sem Pasta (vazia).
// Empate (mesma pasta, ex.: Nº Ordem 1 e 2 da mesma pasta) desempata pelo id, para a ordem nunca "pular".

const PASTA_RE = /^\s*(\d{4})\s*-\s*(\d+)\s*$/;

export interface ChavePasta {
  // 0 = no padrão; 1 = fora do padrão (texto); 2 = sem pasta.
  grupo: 0 | 1 | 2;
  ano: number;
  numero: number;
  texto: string;
}

export function chaveDaPasta(pasta: string | null | undefined): ChavePasta {
  const texto = typeof pasta === "string" ? pasta.trim() : "";
  if (texto === "") return { grupo: 2, ano: 0, numero: 0, texto: "" };
  const m = PASTA_RE.exec(texto);
  if (!m) return { grupo: 1, ano: 0, numero: 0, texto };
  return { grupo: 0, ano: Number(m[1]), numero: Number(m[2]), texto };
}

const COLLATOR = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });

export function compararPorPasta(a: Pick<Processo, "pasta" | "id">, b: Pick<Processo, "pasta" | "id">): number {
  const ka = chaveDaPasta(a.pasta);
  const kb = chaveDaPasta(b.pasta);
  if (ka.grupo !== kb.grupo) return ka.grupo - kb.grupo;
  if (ka.grupo === 0) {
    if (ka.ano !== kb.ano) return ka.ano - kb.ano;
    if (ka.numero !== kb.numero) return ka.numero - kb.numero;
  } else if (ka.grupo === 1) {
    const t = COLLATOR.compare(ka.texto, kb.texto);
    if (t !== 0) return t;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type ProcessosPorColuna = Record<StatusProcesso, Processo[]>;

/**
 * Agrupa por coluna numa passada só (não cinco `filter`) e ordena cada coluna por Pasta. Toda coluna existe no
 * resultado, mesmo vazia. A lista de entrada não é alterada.
 */
export function agruparPorColuna(processos: readonly Processo[]): ProcessosPorColuna {
  const grupos = Object.fromEntries(STATUS_PROCESSO_ORDER.map((s) => [s, [] as Processo[]])) as ProcessosPorColuna;
  for (const processo of processos) grupos[colunaDoProcesso(processo)].push(processo);
  for (const status of STATUS_PROCESSO_ORDER) grupos[status].sort(compararPorPasta);
  return grupos;
}
