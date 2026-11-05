import { defineEventHandler, readBody, createError } from "h3";
import { createSupabaseAdminClient } from "../../../utils/supabaseServerClient";
import { listAllAuthUsers } from "../../../utils/authUser";
import { parseEmailProprio } from "../../../utils/contaValidation";
import { exigirUsuario, notificarEdicaoSemFalhar, verificarSenhaAtual } from "../../../utils/contaPropria";
import { isRole } from "#shared/utils/rbac";
import type { AlterarEmailResult } from "#shared/types/conta";

/**
 * Troca DIRETA o e-mail da PRÓPRIA conta, sem link de confirmação (Admin API com `email_confirm: true`).
 * Exige a senha atual; o e-mail vem duas vezes e o servidor confere (a pergunta "tem certeza?" é da tela).
 *
 * O `app_metadata` NÃO é tocado: cargo, nome e consultorNome ficam como estão. A mensagem da notificação
 * aos administradores nunca leva o e-mail (nem o antigo, nem o novo).
 */
export default defineEventHandler(async (event): Promise<AlterarEmailResult> => {
  const user = exigirUsuario(event);
  const { senhaAtual, email } = parseEmailProprio(await readBody(event));

  // Senha primeiro: quem não prova a senha atual não descobre se um e-mail já está cadastrado. (O e-mail
  // de `user` vem do cache de 8s do middleware — pode ser o ANTIGO logo após uma troca — então nada aqui
  // compara com `user.email`: a comparação "igual ao atual" usa o e-mail real, lido abaixo.)
  await verificarSenhaAtual(user.id, senhaAtual, "email");

  const admin = createSupabaseAdminClient();
  const contas = await listAllAuthUsers(admin);

  const propria = contas.find((conta) => conta.id === user.id);
  if (!propria) {
    throw createError({ statusCode: 404, statusMessage: "Conta não encontrada." });
  }
  if (email === (propria.email ?? "").trim().toLowerCase()) {
    throw createError({ statusCode: 400, statusMessage: "Esse já é o e-mail da sua conta." });
  }
  // Rede de segurança: conta que só é administrador pelo e-mail em NUXT_ADMIN_EMAILS (sem cargo gravado
  // em app_metadata) deixaria de ser administrador ao trocar de e-mail.
  if (!isRole((propria.app_metadata as Record<string, unknown> | undefined)?.role)) {
    throw createError({
      statusCode: 409,
      statusMessage: "O cargo da sua conta ainda não está gravado. Peça ao administrador antes de trocar o e-mail.",
    });
  }

  if (contas.some((conta) => conta.id !== user.id && (conta.email ?? "").toLowerCase() === email)) {
    throw createError({ statusCode: 409, statusMessage: "Já existe uma conta com esse e-mail." });
  }

  const { data, error } = await admin.auth.admin.updateUserById(user.id, { email, email_confirm: true });
  if (error) {
    const jaExiste = error.status === 422 || /already.*registered|already.*exists|email.*taken/i.test(error.message);
    throw createError({
      statusCode: jaExiste ? 409 : 502,
      statusMessage: jaExiste
        ? "Já existe uma conta com esse e-mail."
        : "Não foi possível alterar o e-mail agora. Tente novamente em instantes.",
    });
  }

  await notificarEdicaoSemFalhar(user, "email");
  return { email: data.user?.email ?? email };
});
