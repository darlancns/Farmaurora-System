import { defineEventHandler, createError, getMethod } from "h3";
import { useRuntimeConfig } from "#imports";
import { createSupabaseServerClient } from "../utils/supabaseServerClient";
import { resolveAuthUser, parseAdminEmails } from "../utils/authUser";
import {
  sectionForApiPath,
  isAuthenticatedAnyApiPath,
  canReadSection,
  canWriteSection,
  isWriteMethod,
} from "#shared/utils/rbac";
import type { AuthUser } from "#shared/types/auth";

// Prefixos de API acessíveis sem sessão válida. Hoje não há nenhum — o login
// acontece client-side direto no Supabase.
const PUBLIC_API_PREFIXES: readonly string[] = [];

// Prefixos que exigem sessão mas nenhuma checagem de seção (ex.: "quem sou eu")
// vivem em shared/utils/rbac.ts (AUTHENTICATED_ANY_API_PREFIXES) — única exceção
// à regra de "nega por padrão" abaixo.

/**
 * Roda em toda request.
 *
 * - Anexa o usuário autenticado (ou null) em `event.context.user`, já com
 *   `role` e `consultorNome` resolvidos.
 * - Para `/api/**`: exige sessão (401) e autoriza por seção + método (403).
 *   O row-scoping do cargo `consultor` (só os próprios processos) fica nos
 *   handlers de `/api/processos` — o middleware só faz o controle grosso.
 * - Para requests de página (SSR), NÃO bloqueia — o middleware de rota
 *   client-side cuida do redirect após a hidratação.
 */
export default defineEventHandler(async (event) => {
  const path = event.path || "";
  const config = useRuntimeConfig(event);
  const url = String(config.public.supabaseUrl ?? "");
  const anonKey = String(config.public.supabaseAnonKey ?? "");

  let authUser: AuthUser | null = null;

  if (url && anonKey) {
    try {
      const supabase = createSupabaseServerClient(event);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        authUser = resolveAuthUser(user, parseAdminEmails(config.adminEmails));
      }
    } catch {
      authUser = null;
    }
  }

  event.context.user = authUser;

  if (!path.startsWith("/api/")) return;
  if (PUBLIC_API_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

  if (!authUser) {
    throw createError({ statusCode: 401, statusMessage: "Não autenticado." });
  }

  if (isAuthenticatedAnyApiPath(path)) return;

  const section = sectionForApiPath(path);
  if (!section) {
    // Nega por padrão: rota /api sem seção mapeada e fora da allowlist. Se uma
    // rota nova cair aqui, o certo é mapeá-la em sectionForApiPath, não afrouxar.
    throw createError({
      statusCode: 403,
      statusMessage: "Rota não autorizada.",
    });
  }

  const allowed = isWriteMethod(getMethod(event))
    ? canWriteSection(authUser.role, section)
    : canReadSection(authUser.role, section);

  if (!allowed) {
    throw createError({
      statusCode: 403,
      statusMessage: "Sem permissão para esta operação.",
    });
  }
});
