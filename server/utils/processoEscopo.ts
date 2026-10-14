import type { Processo } from "../../shared/types/processo";
import type { AuthUser } from "#shared/types/auth";
import { isRowScopedToOwnConsultor } from "#shared/utils/rbac";

// Escopo de linhas do cargo "consultor": só enxerga os próprios processos,
// comparando Processo.consultor com o nome gravado em app_metadata.consultorNome
// (AuthUser.consultorNome). Funções puras — sem h3/Supabase — pra serem testáveis
// (ver tests/unit/processoEscopo.spec.ts).

/** Lista visível ao usuário. Consultor sem nome → não vê nada; demais cargos → tudo. */
export function filtrarProcessosVisiveis(processos: Processo[], user: AuthUser | null): Processo[] {
  if (user && isRowScopedToOwnConsultor(user.role)) {
    if (!user.consultorNome) return [];
    return processos.filter((processo) => processo.consultor === user.consultorNome);
  }
  return processos;
}

/** Um processo específico é visível ao usuário? (consultor: só o próprio nome.) */
export function processoVisivelParaUsuario(processo: Processo, user: AuthUser | null): boolean {
  if (user && isRowScopedToOwnConsultor(user.role) && processo.consultor !== user.consultorNome) {
    return false;
  }
  return true;
}
