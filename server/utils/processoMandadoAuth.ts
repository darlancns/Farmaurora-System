import { createError } from "h3";
import type { AuthUser } from "../../shared/types/auth";
import { podeResolverAlertaMandado } from "../../shared/utils/mandadoPermissao";

// true quando o PATCH quer mexer no "resolvido" do alerta de Mandado (qualquer valor, inclusive false).
export function patchTocaAlertaMandado(body: Record<string, unknown>): boolean {
  return body.alertaMandadoResolvido !== undefined;
}

// Só o administrador e o operacional responsável (primeiro nome da conta = responsavel_operacional
// DA LINHA gravada hoje, não o que vier no corpo) podem resolver/reabrir o alerta. Mesma função
// que a tela usa pra mostrar o check (shared/utils/mandadoPermissao.ts). Lança 403 (h3) caso contrário.
export function assertPodeResolverMandado(
  user: AuthUser | null | undefined,
  responsavelOperacionalDaLinha: string | undefined,
): void {
  if (user && podeResolverAlertaMandado({ role: user.role, nome: user.nome }, responsavelOperacionalDaLinha)) {
    return;
  }
  throw createError({
    statusCode: 403,
    statusMessage:
      "Apenas o administrador ou o operacional responsável por este processo pode resolver o alerta de Mandado de Segurança.",
  });
}
