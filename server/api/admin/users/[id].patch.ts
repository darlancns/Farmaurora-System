import { defineEventHandler, readBody, getRouterParam, createError } from "h3";
import { createSupabaseAdminClient } from "../../../utils/supabaseServerClient";
import {
  parseContaInput,
  parseNomeInput,
  roleAppMetadataEdicao,
  toAdminUserSummary,
  assertNotLastAdmin,
  valorPermissoesNoMetadata,
} from "../../../utils/authUser";
import type { AuthUser, AdminUserSummary } from "#shared/types/auth";

interface PatchBody {
  role?: unknown;
  consultorNome?: unknown;
  nome?: unknown;
  permissoes?: unknown;
}

/**
 * Atualiza o cargo (e o nome do consultor, quando aplicável) de uma conta.
 *
 * Admin only. Mesma validação do POST (`parseRoleInput`). Se o novo cargo não
 * for consultor, `consultorNome` é apagado do app_metadata.
 *
 * Trava anti-lockout: não permite demover (tirar o cargo `administrador` de)
 * a ÚNICA conta administrador restante — vale para qualquer conta, inclusive
 * a própria.
 *
 * Permissões por página (`permissoes`, só socio/operacional): campo AUSENTE não mexe nas permissões da conta
 * (preserva o que estiver gravado, inclusive "sem mapa"); `null` apaga o mapa (volta ao padrão do cargo); objeto
 * grava o mapa completo, validado com rigor (400 com seção desconhecida ou valor inválido; seção ausente =
 * "nenhum"). Trocar o cargo para fora de socio/operacional apaga o mapa (null); trocar entre socio e operacional
 * mantém o mapa, a menos que venha outro. Para esses cargos, um `permissoes` de verdade no corpo é 400.
 */
export default defineEventHandler(async (event): Promise<AdminUserSummary> => {
  const user: AuthUser | null = event.context.user;
  if (!user || !user.isAdmin) {
    throw createError({ statusCode: 403, statusMessage: "Acesso restrito a administradores." });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "ID não informado." });
  }

  const body = (await readBody(event)) as PatchBody;
  const { role, consultorNome, permissoes } = parseContaInput(body, "edicao");
  // Nome não é obrigatório na edição — contas antigas podem ficar sem nome até serem preenchidas
  // manualmente pela mesma tela. Omitido, o nome atual da conta é PRESERVADO (roleAppMetadataEdicao).
  const nome = parseNomeInput(body, { required: false });

  const admin = createSupabaseAdminClient();

  // Só uma demoção (novo cargo ≠ administrador) pode causar lockout.
  if (role !== "administrador") {
    await assertNotLastAdmin(admin, id, "demover");
  }

  const { data, error } = await admin.auth.admin.updateUserById(id, {
    app_metadata: roleAppMetadataEdicao(role, consultorNome, nome, valorPermissoesNoMetadata(permissoes)),
  });

  if (error || !data.user) {
    const notFound = error?.status === 404;
    throw createError({
      statusCode: notFound ? 404 : 502,
      statusMessage: notFound
        ? "Conta não encontrada."
        : "Não foi possível atualizar a conta no Supabase Auth.",
    });
  }

  return toAdminUserSummary(data.user);
});
