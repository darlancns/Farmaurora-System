import { DESTINATARIO_TIPOS, TIPOS_RECADO } from "#shared/constants/recados";
import { ROLES } from "#shared/utils/rbac";
import type { NewRecadoDTO } from "#shared/types/recado";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Valida o payload de criar/editar recado. Edição usa o MESMO validador que
 * criação — PATCH substitui o recado inteiro (titulo/mensagem/tipo/
 * destinatário), não faz merge parcial, então a regra é idêntica nos dois
 * casos (ver server/api/recados/index.post.ts e [id].patch.ts).
 *
 * Regra de destinatário (mesmo padrão de parseRoleInput em authUser.ts):
 * - "cargo" exige `destinatarioCargo` num dos 4 cargos válidos;
 * - "pessoa" exige `destinatarioPessoaId` não vazio;
 * - "publico" ignora os dois (mesmo que venham preenchidos no body).
 */
export function isValidNewRecadoPayload(body: unknown): body is NewRecadoDTO {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.titulo)) return false;
  if (!isNonEmptyString(b.mensagem)) return false;
  if (!TIPOS_RECADO.includes(b.tipo as never)) return false;
  if (!DESTINATARIO_TIPOS.includes(b.destinatarioTipo as never)) return false;

  if (b.destinatarioTipo === "cargo") {
    return ROLES.includes(b.destinatarioCargo as never);
  }
  if (b.destinatarioTipo === "pessoa") {
    return isNonEmptyString(b.destinatarioPessoaId);
  }

  return true;
}
