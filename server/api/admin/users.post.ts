import { defineEventHandler, readBody, createError } from "h3";
import { createSupabaseAdminClient } from "../../utils/supabaseServerClient";
import { parseRoleInput, parseNomeInput, roleAppMetadata } from "../../utils/authUser";
import { formatPasswordError } from "#shared/utils/authErrors";
import type { Role } from "#shared/utils/rbac";
import type { AuthUser } from "#shared/types/auth";
import type { ConsultorNome } from "#shared/types/Patient";

interface CreateUserBody {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  consultorNome?: unknown;
  nome?: unknown;
}

interface CreateUserResult {
  id: string;
  email: string;
  role: Role;
  consultorNome?: ConsultorNome;
  nome: string;
}

/**
 * Cria uma conta para um membro da equipe, já com o cargo (e o nome do
 * consultor, quando aplicável) gravado em `app_metadata`.
 *
 * Só administradores (e-mail em NUXT_ADMIN_EMAILS ou `role: "administrador"`)
 * podem chamar. Usa a service role key server-side para `auth.admin.createUser`
 * com `email_confirm: true`. Não há cadastro público.
 */
export default defineEventHandler(async (event): Promise<CreateUserResult> => {
  const user: AuthUser | null = event.context.user;

  if (!user || !user.isAdmin) {
    throw createError({
      statusCode: 403,
      statusMessage: "Acesso restrito a administradores.",
    });
  }

  const body = (await readBody(event)) as CreateUserBody;
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !email.includes("@") || password.length < 8) {
    throw createError({
      statusCode: 400,
      statusMessage:
        "Informe um e-mail válido e uma senha com pelo menos 8 caracteres.",
    });
  }

  // Validação de cargo/consultorNome compartilhada com o PATCH.
  const { role, consultorNome } = parseRoleInput(body);
  // Nome é obrigatório na criação — diferente da edição, onde contas antigas
  // podem ficar sem nome até serem preenchidas manualmente.
  const nome = parseNomeInput(body, { required: true });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: roleAppMetadata(role, consultorNome, nome),
  });

  if (error) {
    const alreadyExists =
      error.status === 422 ||
      /already.*registered|already.*exists|email.*taken/i.test(error.message);

    throw createError({
      statusCode: alreadyExists ? 409 : 502,
      statusMessage: alreadyExists
        ? "Já existe um usuário com esse e-mail."
        : formatPasswordError(error, "Não foi possível criar o usuário no Supabase Auth."),
    });
  }

  const created = data.user;
  if (!created?.email) {
    throw createError({
      statusCode: 502,
      statusMessage: "Supabase não retornou o usuário criado.",
    });
  }

  return { id: created.id, email: created.email, role, consultorNome, nome };
});
