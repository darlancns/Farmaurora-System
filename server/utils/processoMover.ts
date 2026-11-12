import { createError } from "h3";
import {
  isStatusProcesso,
  isStatusProcessoLegado,
  mensagemStatusLegado,
  STATUS_PROCESSO_LABELS,
  STATUS_PROCESSO_ORDER,
} from "../../shared/constants/processos";
import type { StatusProcesso } from "../../shared/types/processo";
import { isVersaoValida } from "./processoValidation";

// Corpo de POST /api/processos/:id/mover já validado.
export interface PedidoMover {
  status: StatusProcesso;
  // updated_at que o cliente viu (string opaca, como veio do servidor).
  versao: string;
}

/**
 * Valida o corpo `{ status, versao }`: `status` é um dos 5 (legado tem mensagem própria) e `versao` é obrigatória.
 * Qualquer outra coisa lança 400 (h3).
 */
export function lerPedidoMover(body: unknown): PedidoMover {
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
  return { status: b.status, versao: b.versao };
}
