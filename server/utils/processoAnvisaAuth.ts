import { createError } from "h3";
import type { AuthUser } from "../../shared/types/auth";
import { podeDarCienciaPrazoAnvisa } from "../../shared/utils/avisoPrazoAnvisa";

// Só o administrador e o operacional responsável (primeiro nome da conta = responsavel_operacional DA LINHA gravada,
// não o que vier no corpo) dão ciência no aviso da ANVISA. Mesma função que a tela usa para mostrar o botão "Ciente"
// (shared/utils/avisoPrazoAnvisa.ts, que segue a regra do alerta de Mandado). Lança 403 (h3) caso contrário.
export function assertPodeDarCienciaAnvisa(
  user: AuthUser | null | undefined,
  responsavelOperacionalDaLinha: string | undefined,
): void {
  if (user && podeDarCienciaPrazoAnvisa({ role: user.role, nome: user.nome }, responsavelOperacionalDaLinha)) return;
  throw createError({
    statusCode: 403,
    statusMessage:
      "Apenas o administrador ou o operacional responsável por este processo pode dar ciência do prazo da ANVISA.",
  });
}
