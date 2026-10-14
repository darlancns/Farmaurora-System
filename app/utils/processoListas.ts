import type { Processo, StatusProcesso } from "#shared/types/processo";

// Regras de lista de /processos extraídas de app/pages/processos.vue (puras,
// testáveis em tests/unit/statusOutro.spec.ts).

/** Filtro de status da toolbar: "" = todos. "outro" filtra só os de status "Outro". */
export function filtrarPorStatus(processos: Processo[], status: StatusProcesso | ""): Processo[] {
  return status ? processos.filter((p) => p.status === status) : processos;
}

/** Abas: "Entregues" = status 'entregue'; "Em andamento" = TUDO o resto (inclusive 'outro'). */
export function separarAbas(processos: Processo[]): { andamento: Processo[]; entregues: Processo[] } {
  return {
    andamento: processos.filter((p) => p.status !== "entregue"),
    entregues: processos.filter((p) => p.status === "entregue"),
  };
}
