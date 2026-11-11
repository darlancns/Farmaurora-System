import { defineEventHandler, readBody, createError } from "h3";
import { createSupabaseAdminClient } from "../../utils/supabaseServerClient";
import { parseContaInput, parseNomeInput, roleAppMetadata, valorPermissoesNoMetadata } from "../../utils/authUser";
import { formatPasswordError } from "#shared/utils/authErrors";
import type { Role } from "#shared/utils/rbac";
import type { Permissoes } from "#shared/utils/permissoesPagina";
import type { AuthUser } from "#shared/types/auth";
import type { ConsultorProcesso } from "#shared/types/processo";

interface CreateUserBody {
  email?: unknown;
  password?: unknown;
  role?: unknown;
  consultorNome?: unknown;
  nome?: unknown;
  permissoes?: unknown;
}

interface CreateUserResult {
  id: string;
  email: string;
  role: Role;
  consultorNome?: ConsultorProcesso;
  nome: string;
  /** Mapa gravado (socio/operacional) ou null (consultor/administrador). */
  permissoes: Permissoes | null;
}

/**
 * Cria uma conta para um membro da equipe, já com o cargo (e o nome do
 * consultor, quando aplicável) gravado em `app_metadata`.
 *
 * Só administradores (e-mail em NUXT_ADMIN_EMAILS ou `role: "administrador"`)
 * podem chamar. Usa a service role key server-side para `auth.admin.createUser`
 * com `email_confirm: true`. Não há cadastro público.
 *
 * Permissões por página (`permissoes`): conta socio/operacional criada sem o campo (ou com null) nasce com TODAS as
 * seções "nenhum"; com objeto, o mapa é validado com rigor (400 se houver seção desconhecida ou valor inválido) e
 * gravado. Consultor e administrador nunca recebem mapa (e um `permissoes` de verdade enviado para eles é 400).
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

  // Validação de cargo/consultorNome/permissoes compartilhada com o PATCH.
  const { role, consultorNome, permissoes } = parseContaInput(body, "criacao");
  // Nome é obrigatório na criação — diferente da edição, onde contas antigas
  // podem ficar sem nome até serem preenchidas manualmente.
  const nome = parseNomeInput(body, { required: true });

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: roleAppMetadata(role, consultorNome, nome, valorPermissoesNoMetadata(permissoes) ?? undefined),
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

  return {
    id: created.id,
    email: created.email,
    role,
    consultorNome,
    nome,
    permissoes: permissoes.acao === "gravar" ? permissoes.permissoes : null,
  };
});
