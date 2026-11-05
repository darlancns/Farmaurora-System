import { defineEventHandler, readBody, createError } from "h3";
import { isAuthWeakPasswordError } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "../../../utils/supabaseServerClient";
import { parseSenhaProprio } from "../../../utils/contaValidation";
import { exigirUsuario, notificarEdicaoSemFalhar, verificarSenhaAtual } from "../../../utils/contaPropria";
import { formatPasswordError } from "#shared/utils/authErrors";
import type { AlterarSenhaResult } from "#shared/types/conta";

/**
 * Troca a senha da PRÓPRIA conta (qualquer cargo). Opcional, exige a senha atual.
 *
 * O id vem só da sessão. A senha atual é conferida com um client anon descartável e a nova é gravada
 * com a service role, igual ao reset do administrador. Nenhuma senha vai em log, erro ou notificação;
 * a resposta não devolve nada além de `atualizada`. A sessão atual continua válida (os cookies não mudam).
 */
export default defineEventHandler(async (event): Promise<AlterarSenhaResult> => {
  const user = exigirUsuario(event);
  const { senhaAtual, novaSenha } = parseSenhaProprio(await readBody(event));

  await verificarSenhaAtual(user.id, senhaAtual, "senha");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(user.id, { password: novaSenha });
  if (error) {
    const fraca = isAuthWeakPasswordError(error);
    throw createError({
      statusCode: fraca ? 400 : 502,
      statusMessage: formatPasswordError(error, "Não foi possível alterar a senha agora. Tente novamente."),
    });
  }

  await notificarEdicaoSemFalhar(user, "senha");
  return { atualizada: true };
});
