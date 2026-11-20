import { createError } from "h3";
import type { AuthUser } from "../../shared/types/auth";
import {
  MENSAGEM_API_NAO_AUTENTICADO,
  MENSAGEM_API_SEM_PERMISSAO,
  podeEscrever,
  podeLer,
} from "../../shared/utils/permissoesPagina";

// Apoio dos handlers de /api/compras/**: a SEGUNDA camada de acesso. A primeira é o middleware (server/middleware/auth.ts → autorizarApi,
// que mapeia /api/compras para a seção "compras": GET = ver, os demais métodos = editar). Estas checagens dentro do handler usam as
// MESMAS funções (podeLer e podeEscrever, que respeitam o mapa de permissões da conta), então a rota continua segura mesmo se a seção
// for remapeada ou o handler for chamado por outro caminho.

/** Quem LÊ Compras (administrador e operacional; sócio; ou quem o mapa da conta libera com 'ver' ou 'editar'). */
export function exigirLeituraCompras(user: AuthUser | null | undefined): AuthUser {
  if (!user) throw createError({ statusCode: 401, statusMessage: MENSAGEM_API_NAO_AUTENTICADO });
  if (!podeLer(user, "compras")) throw createError({ statusCode: 403, statusMessage: MENSAGEM_API_SEM_PERMISSAO });
  return user;
}

/** Quem ESCREVE em Compras (administrador e operacional; ou quem o mapa libera com 'editar'). O sócio sem mapa só lê. */
export function exigirEscritaCompras(user: AuthUser | null | undefined): AuthUser {
  if (!user) throw createError({ statusCode: 401, statusMessage: MENSAGEM_API_NAO_AUTENTICADO });
  if (!podeEscrever(user, "compras")) throw createError({ statusCode: 403, statusMessage: MENSAGEM_API_SEM_PERMISSAO });
  return user;
}
