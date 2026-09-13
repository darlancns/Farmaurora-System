import { computed, type ComputedRef } from "vue";
import { useState } from "#app";
import type { AuthUser } from "#shared/types/auth";
import type { ConsultorNome } from "#shared/types/Patient";
import {
  canReadSection,
  canWriteSection,
  defaultRouteForRole,
  type Role,
  type Section,
} from "#shared/utils/rbac";

/**
 * Estado de autenticação/cargo no client. A fonte de verdade é `/api/auth/me`
 * (resolvido pelo server, incluindo o fallback admin-email), nunca o JWT
 * decodificado localmente.
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
  const consultorNome: ComputedRef<ConsultorNome | null> = computed(
    () => user.value?.consultorNome ?? null,
  );
  const isAdmin: ComputedRef<boolean> = computed(() => user.value?.role === "administrador");

  function canRead(section: Section): boolean {
    return role.value ? canReadSection(role.value, section) : false;
  }

  function canWrite(section: Section): boolean {
    return role.value ? canWriteSection(role.value, section) : false;
  }

  function homeRoute(): string {
    return role.value ? defaultRouteForRole(role.value) : "/inicio";
  }

  return { user, loaded, load, clear, role, consultorNome, isAdmin, canRead, canWrite, homeRoute };
}
