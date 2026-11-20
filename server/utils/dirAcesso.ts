import { createError } from "h3";
import type { AuthUser } from "../../shared/types/auth";
import {
  MENSAGEM_API_NAO_AUTENTICADO,
  MENSAGEM_API_SEM_PERMISSAO,
  podeEscrever,
  podeLer,
} from "../../shared/utils/permissoesPagina";

// Apoio dos handlers da DIR que precisam conferir a permissão DENTRO da rota (a primeira camada é o middleware, que mapeia /api/dir para a
// seção "dir"). Usa as MESMAS funções do middleware (podeLer, que respeita o mapa de permissões da conta).

/** Quem LÊ a DIR (administrador e operacional; ou quem o mapa da conta libera com 'ver' ou 'editar'). */
export function exigirLeituraDir(user: AuthUser | null | undefined): AuthUser {
  if (!user) throw createError({ statusCode: 401, statusMessage: MENSAGEM_API_NAO_AUTENTICADO });
  if (!podeLer(user, "dir")) throw createError({ statusCode: 403, statusMessage: MENSAGEM_API_SEM_PERMISSAO });
  return user;
}

/**
 * Quem ESCREVE na DIR (administrador e operacional; ou quem o mapa libera com 'editar'). Irmão de `exigirEscritaCompras`, com a MESMA mensagem
 * de 403. O Encaminhar para a DIR cria linhas na DIR por uma rota de Compras (que o middleware só confere como `compras`), então o handler
 * confere TAMBÉM esta permissão.
 */
export function exigirEscritaDir(user: AuthUser | null | undefined): AuthUser {
  if (!user) throw createError({ statusCode: 401, statusMessage: MENSAGEM_API_NAO_AUTENTICADO });
  if (!podeEscrever(user, "dir")) throw createError({ statusCode: 403, statusMessage: MENSAGEM_API_SEM_PERMISSAO });
  return user;
}
