import { createError } from "h3";
import {
  isStatusProcesso,
  isStatusProcessoLegado,
  mensagemStatusLegado,
  STATUS_PROCESSO_LABELS,
  STATUS_PROCESSO_ORDER,
} from "../../shared/constants/processos";
import type { StatusProcesso } from "../../shared/types/processo";
import { ehDataFutura, parseDataISO } from "../../shared/utils/dataBrasilia";
import { isVersaoValida, MENSAGEM_DATA_ENTREGA_FUTURA, MENSAGEM_VERSAO_AUSENTE } from "./processoValidation";

// Corpo de POST /api/processos/:id/mover já validado.
export interface PedidoMover {
  status: StatusProcesso;
  // updated_at que o cliente viu (string opaca, como veio do servidor).
  versao: string;
  // "AAAA-MM-DD". Presente (e obrigatória) quando status === "entregue"; nos outros status é ignorada (fica ausente).
  dataEntrega?: string;
}

/**
 * Valida o corpo `{ status, versao, dataEntrega? }`: `status` é um dos 5 (legado tem mensagem própria) e `versao` é obrigatória.
 * Para "entregue", `dataEntrega` ("AAAA-MM-DD") é obrigatória: ausente (aba antiga, sem o modal) = 400 com a mensagem padrão
 * "Atualize a página"; inválida ou futura (depois de hoje em Brasília, `agora`) = 400. Qualquer outra coisa lança 400 (h3).
 */
export function lerPedidoMover(body: unknown, agora: Date = new Date()): PedidoMover {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};

  if (isStatusProcessoLegado(b.status)) {
    throw createError({ statusCode: 400, statusMessage: mensagemStatusLegado(b.status) });
  }
  if (!isStatusProcesso(b.status)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Status inválido. Use um destes: ${STATUS_PROCESSO_ORDER.map((s) => STATUS_PROCESSO_LABELS[s]).join(", ")}.`,
    });
  }
  if (!isVersaoValida(b.versao)) {
    throw createError({ statusCode: 400, statusMessage: "Atualize a página (Ctrl+Shift+R) e tente de novo." });
  }
  if (b.status !== "entregue") return { status: b.status, versao: b.versao };

  const bruto = typeof b.dataEntrega === "string" ? b.dataEntrega.trim() : b.dataEntrega;
  if (bruto === undefined || bruto === null || bruto === "") {
    throw createError({ statusCode: 400, statusMessage: MENSAGEM_VERSAO_AUSENTE });
  }
  if (typeof bruto !== "string" || !parseDataISO(bruto)) {
    throw createError({ statusCode: 400, statusMessage: "Data de entrega: data inválida. Use AAAA-MM-DD." });
  }
  if (ehDataFutura(bruto, agora)) {
    throw createError({ statusCode: 400, statusMessage: MENSAGEM_DATA_ENTREGA_FUTURA });
  }
  return { status: b.status, versao: b.versao, dataEntrega: bruto };
}
