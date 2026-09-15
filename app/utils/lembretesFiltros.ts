import type { LembretePessoal } from "#shared/types/lembretePessoal";

// Mesmo padrão de app/utils/recadosFiltros.ts: concluído é definitivo (sem
// desmarcar depois — ajuste da Fase D2, igual Recado), então some da lista
// assim que concluido === true. Fixado primeiro, depois created_at desc.

function porFixadoEData(a: LembretePessoal, b: LembretePessoal): number {
  if (a.fixado !== b.fixado) return a.fixado ? -1 : 1;
  return b.createdAt.localeCompare(a.createdAt);
}

export function filtrarLembretesVisiveis(lembretes: LembretePessoal[]): LembretePessoal[] {
  return lembretes.filter((l) => !l.concluido).sort(porFixadoEData);
}
