import { defineEventHandler } from "h3";
import type { AuthUser } from "#shared/types/auth";

/**
 * Identidade do usuário autenticado, já com `role`/`consultorNome` resolvidos
 * pelo middleware (incluindo a rede de segurança do fallback admin-email).
 *
 * O client usa isto como única fonte de verdade do cargo, em vez de decodificar
 * o JWT. O middleware garante 401 quando não há sessão.
 */
export default defineEventHandler((event): AuthUser | null => {
  return event.context.user;
});
