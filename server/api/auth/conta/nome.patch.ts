import { defineEventHandler, readBody, createError } from "h3";
import { createSupabaseAdminClient } from "../../../utils/supabaseServerClient";
import { parseNomeProprio } from "../../../utils/contaValidation";
import { exigirUsuario, notificarEdicaoSemFalhar } from "../../../utils/contaPropria";
import { MENSAGEM_NOME_BLOQUEADO, podeEditarNomeDaConta } from "#shared/utils/contaCampos";
import type { AlterarNomeResult } from "#shared/types/conta";

/**
 * Altera o nome de exibição da PRÓPRIA conta. Só sócio e administrador:
 * - consultor → 403 (o nome vira entidade única do sistema numa fase própria);
 * - operacional → 403 (o primeiro nome liga a conta ao alerta de Mandado de Segurança).
 *
 * Grava fazendo MERGE com o `app_metadata` atual (role, consultorNome etc. nunca se perdem) e ignora
 * qualquer `id`/`role`/`consultorNome` do body. Nome igual ao atual não grava nem notifica.
 */
export default defineEventHandler(async (event): Promise<AlterarNomeResult> => {
  const user = exigirUsuario(event);

  if (!podeEditarNomeDaConta(user.role)) {
    throw createError({
      statusCode: 403,
      statusMessage: MENSAGEM_NOME_BLOQUEADO[user.role] ?? "Peça ao administrador para alterar o seu nome.",
    });
  }

  const nome = parseNomeProprio(await readBody(event));

  const admin = createSupabaseAdminClient();
  const { data: atual, error: erroLeitura } = await admin.auth.admin.getUserById(user.id);
  if (erroLeitura || !atual.user) {
    const naoEncontrada = erroLeitura?.status === 404;
    throw createError({
      statusCode: naoEncontrada ? 404 : 502,
      statusMessage: naoEncontrada ? "Conta não encontrada." : "Não foi possível alterar o nome agora. Tente novamente.",
    });
  }

  const metadata = (atual.user.app_metadata ?? {}) as Record<string, unknown>;
  const nomeAtual = typeof metadata.nome === "string" ? metadata.nome.trim() : "";
  if (nome === nomeAtual) return { nome };

  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: { ...metadata, nome } });
  if (error) {
    throw createError({
      statusCode: 502,
      statusMessage: "Não foi possível alterar o nome agora. Tente novamente em instantes.",
    });
  }

  // A mensagem usa o nome de ANTES (como as pessoas conhecem a conta); o valor novo nunca vai nela.
  await notificarEdicaoSemFalhar(user, "nome");
  return { nome };
});
