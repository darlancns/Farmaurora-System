import { createError } from "h3";
import { hojeBrasilia, parseDataBR, parseDataISO } from "../../shared/utils/dataBrasilia";

// Corpo de POST /api/processos/:id/chegada já validado.
export type PedidoChegada = { acao: "confirmar" } | { acao: "adiar"; novaDataISO: string };

/**
 * Valida o corpo: `{ acao: "confirmar" }` ou `{ acao: "adiar", novaData }`. `novaData` é DD/MM (ano corrente de
 * Brasília) ou DD/MM/AAAA, precisa existir no calendário e ser POSTERIOR a hoje (Brasília). Qualquer outra coisa
 * lança 400 (h3).
 */
export function lerPedidoChegada(body: unknown, agora: Date = new Date()): PedidoChegada {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (b.acao === "confirmar") return { acao: "confirmar" };

  if (b.acao === "adiar") {
    const novaDataISO = typeof b.novaData === "string" ? parseDataBR(b.novaData, agora) : null;
    if (!novaDataISO) {
      throw createError({ statusCode: 400, statusMessage: "Nova data inválida. Use DD/MM ou DD/MM/AAAA." });
    }
    if (novaDataISO <= hojeBrasilia(agora)) {
      throw createError({ statusCode: 400, statusMessage: "A nova data precisa ser depois de hoje." });
    }
    return { acao: "adiar", novaDataISO };
  }

  throw createError({ statusCode: 400, statusMessage: 'Ação inválida. Use "confirmar" ou "adiar".' });
}

/** Valida o corpo de POST /api/chegada-avisos/visto: processoId (texto) e dataPrevista ("YYYY-MM-DD" que existe). */
export function lerPedidoVisto(body: unknown): { processoId: string; dataPrevista: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const processoId = typeof b.processoId === "string" ? b.processoId.trim() : "";
  const dataPrevista = typeof b.dataPrevista === "string" ? b.dataPrevista.trim() : "";

  if (!processoId) {
    throw createError({ statusCode: 400, statusMessage: "Processo não informado." });
  }
  if (!parseDataISO(dataPrevista)) {
    throw createError({ statusCode: 400, statusMessage: "Data prevista inválida." });
  }
  return { processoId, dataPrevista };
}
