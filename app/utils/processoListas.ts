import type { Processo, StatusProcesso } from "#shared/types/processo";
import { cotacaoAsd } from "#shared/utils/cotacaoAsd";

// Regras de lista de /processos extraídas de app/pages/processos.vue (puras,
// testáveis em tests/unit/statusProcesso.spec.ts).

/** Filtro de status da toolbar: "" = todos. */
export function filtrarPorStatus(processos: Processo[], status: StatusProcesso | ""): Processo[] {
  return status ? processos.filter((p) => p.status === status) : processos;
}

/** Abas: "Entregues" = status 'entregue'; "Em andamento" = os outros 4 status. */
export function separarAbas(processos: Processo[]): { andamento: Processo[]; entregues: Processo[] } {
  return {
    andamento: processos.filter((p) => p.status !== "entregue"),
    entregues: processos.filter((p) => p.status === "entregue"),
  };
}

/** Filtro "Cotações" da toolbar: "" = todos; "asd" = só os processos sem a cotação da transportadora (shared/utils/cotacaoAsd). */
export type FiltroCotacao = "" | "asd";

export function filtrarPorCotacao(processos: Processo[], filtro: FiltroCotacao): Processo[] {
  return filtro === "asd" ? processos.filter(cotacaoAsd) : processos;
}

/** Filtro "Mandado de Segurança" da toolbar: "" = todos; "com_ms" = só os processos com "MS Anexado em" preenchido. */
export type FiltroMandado = "" | "com_ms";

/** O processo tem "MS Anexado em" (data em que o despachante anexou o Mandado de Segurança)? */
function temMsAnexado(processo: Pick<Processo, "datas">): boolean {
  return Boolean(processo.datas.msAnexadoEm?.trim());
}

export function filtrarPorMandado(processos: Processo[], filtro: FiltroMandado): Processo[] {
  return filtro === "com_ms" ? processos.filter(temMsAnexado) : processos;
}

/** Há ao menos um processo com MS anexado? O filtro "Mandado de Segurança" só aparece nesse caso. */
export function haProcessoComMs(processos: readonly Pick<Processo, "datas">[]): boolean {
  return processos.some(temMsAnexado);
}
