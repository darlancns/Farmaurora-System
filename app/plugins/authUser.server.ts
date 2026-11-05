import { defineNuxtPlugin, useRequestEvent, useState } from "#app";
import type { AuthUser } from "#shared/types/auth";

/**
 * Hidrata o estado de auth já no SSR.
 *
 * `server/middleware/auth.ts` já validou a sessão e deixou o usuário (com `role`
 * e `consultorNome` resolvidos) em `event.context.user`. Sem este plugin, o client
 * só descobria o cargo via `/api/auth/me` — um `await` no `authz.global.ts` que
 * segurava a montagem da página por uma ida completa à Vercel. Aqui o mesmo
 * usuário viaja no payload do SSR e `useAuth().load()` volta sem rede.
 *
 * Os dois `useState` usam as MESMAS chaves de `useAuth.ts` ("auth-user" e
 * "auth-user-loaded").
 *
 * Sem usuário no servidor (sessão ausente/inválida, `/login`) NÃO marca `loaded`:
 * o fluxo de login (`load(true)` em login.vue) e o `load()` do client seguem como
 * sempre. O `clear()` do logout continua zerando os dois estados no client.
 */
export default defineNuxtPlugin(() => {
  const user = useRequestEvent()?.context.user as AuthUser | null | undefined;
  if (!user) return;

  // Mesmo formato que /api/auth/me devolve (JSON): campos `undefined` somem.
  const serializado = JSON.parse(JSON.stringify(user)) as AuthUser;

  useState<AuthUser | null>("auth-user", () => null).value = serializado;
  useState<boolean>("auth-user-loaded", () => false).value = true;
});
