import { CONSULTORES_PROCESSO } from "#shared/constants/processos";
import type { ConsultorProcesso, Processo } from "#shared/types/processo";

export interface ProcessoGroup {
  consultor: ConsultorProcesso;
  processos: Processo[];
}

// Um grupo por consultor que tem processo, na ordem de CONSULTORES_PROCESSO
// (alfabética). Consultor sem processo não gera grupo.
export function agruparProcessosPorConsultor(processos: Processo[]): ProcessoGroup[] {
  return CONSULTORES_PROCESSO.map((consultor) => ({
    consultor,
    processos: processos.filter((p) => p.consultor === consultor),
  })).filter((group) => group.processos.length > 0);
}
