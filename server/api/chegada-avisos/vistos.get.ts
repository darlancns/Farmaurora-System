import { defineEventHandler, createError } from "h3";
import { listarAvisosChegadaVistos } from "../../utils/chegadaAvisosStore";
import type { AuthUser } from "../../../shared/types/auth";
import type { ChegadaAvisoVisto } from "../../../shared/types/chegadaAviso";

/** As dispensas do aviso "chegou?" do administrador logado (processo + data prevista). Só administrador. */
export default defineEventHandler(async (event): Promise<ChegadaAvisoVisto[]> => {
  const user: AuthUser | null | undefined = event.context.user;
  if (!user || user.role !== "administrador") {
    throw createError({ statusCode: 403, statusMessage: "Apenas o administrador vê as dispensas do aviso de chegada." });
  }
  return await listarAvisosChegadaVistos(user.id);
});
