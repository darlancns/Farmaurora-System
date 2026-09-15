import { createHash } from "node:crypto";
import { defineEventHandler, createError, getMethod, parseCookies, type H3Event } from "h3";
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

/**
 * Cache curto do resultado de `supabase.auth.getUser()`, chaveado por um hash
 * dos cookies de sessão (`sb-*`) — NUNCA pelo token em texto puro, pra não
 * virar um segredo em claro se este Map algum dia for logado/inspecionado.
 *
 * Por quê: `getUser()` revalida o JWT contra o servidor de Auth do Supabase a
 * CADA chamada (é o comportamento certo, diferente de `getSession()`, que só
 * lê o cookie local sem validar). Isso é necessário para segurança, mas uma
 * única navegação dispara várias requisições paralelas (ex.: pagamentos.vue
 * busca banco+despachante+transportadora+2x pix, e o NotificacaoBell global
 * soma mais 1–2) — cada uma pagando essa revalidação de novo, com os MESMOS
 * cookies. O cache evita repetir a validação de rede quando os cookies não
 * mudaram desde a última checagem, dentro de uma janela curta.
 *
 * Respostas às 3 perguntas de desenho (Parte B.2):
 *
 * 1) Logout: o `signOut()` do client Supabase apaga os cookies `sb-*` na hora
 *    (document.cookie, no browser client) — a PRÓXIMA requisição já chega sem
 *    esses cookies, então `cacheKeyFromCookies` retorna null e o cache é
 *    ignorado (nunca reaproveita um resultado "autenticado" pra uma request
 *    sem cookie de sessão). O único cenário residual é uma revogação feita
 *    NO SERVIDOR (ex.: admin desativa a conta) enquanto o cookie antigo ainda
 *    está no navegador — nesse caso o cache pode devolver "autenticado" por
 *    até SESSION_CACHE_TTL_MS a mais. Aceitável dado o TTL curto (8s): é a
 *    mesma ordem de grandeza de exposição que qualquer JWT de curta duração
 *    já tem por natureza, e não há invalidação ativa implementada para esse
 *    caso — se isso virar requisito real (ex.: exigência de revogação
 *    imediata), a solução correta é reduzir ainda mais o TTL ou remover o
 *    cache, não tentar "empurrar" um evento de invalidação pro servidor.
 *
 * 2) Vercel (serverless): este Map é estado de módulo de UMA instância de
 *    função. Instâncias diferentes (frias, ou uma rajada espalhada entre
 *    réplicas) não compartilham cache nenhum — cada uma faz sua própria
 *    validação na primeira vez que vê aquele conjunto de cookies. Isso é
 *    esperado e aceitável: o cache é "best effort" pra rajadas que caem na
 *    mesma instância quente (o caso comum de chamadas paralelas da mesma
 *    navegação), não uma garantia entre instâncias. Não degrada segurança
 *    nem corretude quando não bate — só volta ao comportamento de sempre
 *    (uma validação de rede por requisição).
 *
 * 3) TTL expira no meio de uma rajada: é só um cache miss — cai no `else`
 *    abaixo, chama `getUser()` normalmente e regrava o cache. Nenhum
 *    tratamento especial necessário; é exatamente o comportamento atual
 *    (pré-cache) para essa requisição específica.
 */
const SESSION_CACHE_TTL_MS = 8000;
const sessionCache = new Map<string, { user: AuthUser | null; expiresAt: number }>();

function cacheKeyFromCookies(event: H3Event): string | null {
  const cookies = parseCookies(event);
  const authCookies = Object.entries(cookies)
    .filter(([name]) => name.startsWith("sb-"))
    .sort(([a], [b]) => a.localeCompare(b));
  if (authCookies.length === 0) return null;

  const raw = authCookies.map(([name, value]) => `${name}=${value}`).join("&");
  return createHash("sha256").update(raw).digest("hex");
}

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
    const cacheKey = cacheKeyFromCookies(event);
    const cached = cacheKey ? sessionCache.get(cacheKey) : undefined;

    if (cached && cached.expiresAt > Date.now()) {
      authUser = cached.user;
    } else {
      if (cached) sessionCache.delete(cacheKey!); // expirado — não deixa lixo no Map

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

      if (cacheKey) {
        sessionCache.set(cacheKey, { user: authUser, expiresAt: Date.now() + SESSION_CACHE_TTL_MS });
      }
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
