import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import type { AuthUser } from "#shared/types/auth";
import type { ConsultorProcesso } from "#shared/types/processo";
import type { Role, Section } from "#shared/utils/rbac";
import { paginaInicial, podeEscrever, podeLer } from "#shared/utils/permissoesPagina";

/**
 * Estado de autenticação/cargo no client. A fonte de verdade é `/api/auth/me`
 * (resolvido pelo server, incluindo o fallback admin-email), nunca o JWT
 * decodificado localmente.
 *
 * `canRead`/`canWrite`/`homeRoute` seguem o mapa de permissões por página da conta (`user.permissoes`, só
 * socio e operacional) e, sem mapa, a regra do cargo — a mesma decisão do servidor (shared/utils/permissoesPagina.ts).
 * Todo ponto da UI que usa `canWrite(secao)` para esconder botões ou virar somente leitura acompanha o mapa.
 */
export function useAuth() {
  const user = useState<AuthUser | null>("auth-user", () => null);
  const loaded = useState<boolean>("auth-user-loaded", () => false);

  async function load(force = false): Promise<AuthUser | null> {
    if (loaded.value && !force) return user.value;
    try {
      const res = await fetch("/api/auth/me");
      user.value = res.ok ? ((await res.json()) as AuthUser | null) : null;
    } catch {
      user.value = null;
    } finally {
      loaded.value = true;
    }
    return user.value;
  }

  function clear(): void {
    user.value = null;
    loaded.value = false;
  }

  const role: ComputedRef<Role | null> = computed(() => user.value?.role ?? null);
  const consultorNome: ComputedRef<ConsultorProcesso | null> = computed(
    () => user.value?.consultorNome ?? null,
  );
  const isAdmin: ComputedRef<boolean> = computed(() => user.value?.role === "administrador");

  function canRead(section: Section): boolean {
    return user.value ? podeLer(user.value, section) : false;
  }

  function canWrite(section: Section): boolean {
    return user.value ? podeEscrever(user.value, section) : false;
  }

  function homeRoute(): string {
    return user.value ? paginaInicial(user.value) : "/processos";
  }

  return { user, loaded, load, clear, role, consultorNome, isAdmin, canRead, canWrite, homeRoute };
}
