import { defineEventHandler } from "h3";
import { listProcessos } from "../../utils/processosStore";
import type { Processo } from "../../../shared/types/processo";
import type { AuthUser } from "#shared/types/auth";
import { isRowScopedToOwnConsultor } from "#shared/utils/rbac";

export default defineEventHandler(async (event): Promise<Processo[]> => {
  const processos = await listProcessos();
  const user: AuthUser | null = event.context.user;

  // Cargo "consultor" só enxerga os próprios processos (comparando pelo nome
  // gravado em app_metadata.consultorNome). Sem nome → não vê nada.
  if (user && isRowScopedToOwnConsultor(user.role)) {
    if (!user.consultorNome) return [];
    return processos.filter((processo) => processo.consultor === user.consultorNome);
  }

  return processos;
});
