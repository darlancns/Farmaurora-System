import { defineEventHandler, readBody, createError } from "h3";
import { getProcesso } from "../../utils/processosStore";
import { marcarAvisoChegadaVisto } from "../../utils/chegadaAvisosStore";
import { lerPedidoVisto } from "../../utils/chegadaValidation";
import type { AuthUser } from "../../../shared/types/auth";

/**
 * Olhinho ("Marcar como visto") do aviso "chegou?": SÓ o administrador, e a dispensa é POR USUÁRIO — some só para
 * quem marcou. Vale para processo + data prevista (idempotente: marcar de novo não falha). Se a data prevista for
 * adiada, o aviso volta. Não altera o processo.
 */
export default defineEventHandler(async (event): Promise<{ visto: true }> => {
  const user: AuthUser | null | undefined = event.context.user;
  if (!user || user.role !== "administrador") {
    throw createError({ statusCode: 403, statusMessage: "Apenas o administrador pode marcar o aviso como visto." });
  }

  const { processoId, dataPrevista } = lerPedidoVisto(await readBody(event));

  if (!(await getProcesso(processoId))) {
    throw createError({ statusCode: 404, statusMessage: "Processo não encontrado." });
  }

  await marcarAvisoChegadaVisto(user.id, processoId, dataPrevista);
  return { visto: true };
});
