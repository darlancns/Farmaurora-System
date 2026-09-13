import { createError } from "h3";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthUser, AdminUserSummary } from "#shared/types/auth";
import type { ConsultorNome } from "#shared/types/Patient";
import { isRole, type Role } from "#shared/utils/rbac";
import { CONSULTORES } from "#shared/constants/consultores";

export function parseAdminEmails(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function isConsultorNome(value: unknown): value is ConsultorNome {
  return typeof value === "string" && (CONSULTORES as string[]).includes(value);
}

/**
 * Valida `role` (+ `consultorNome` quando o cargo é consultor) a partir de um
 * body cru. Regra única compartilhada por POST e PATCH de contas:
 * - `consultorNome` obrigatório e restrito à lista dos 7 SÓ para consultor;
 * - para os demais cargos, `consultorNome` é sempre ignorado.
 * Lança 400 (h3) em caso de valor inválido.
 */
export function parseRoleInput(body: { role?: unknown; consultorNome?: unknown }): {
  role: Role;
  consultorNome?: ConsultorNome;
} {
  if (!isRole(body.role)) {
    throw createError({
      statusCode: 400,
      statusMessage:
        'Cargo inválido. Use "consultor", "socio", "operacional" ou "administrador".',
    });
  }
  const role: Role = body.role;

  if (role === "consultor") {
    if (!isConsultorNome(body.consultorNome)) {
      throw createError({
        statusCode: 400,
        statusMessage:
          "Para o cargo consultor, informe um consultorNome válido (um dos 7 nomes da lista).",
      });
    }
    return { role, consultorNome: body.consultorNome };
  }

  return { role };
}

/**
 * app_metadata a gravar para um cargo. `consultorNome: null` quando não é
 * consultor — remove qualquer valor órfão de um cargo anterior (o GoTrue faz
 * merge raso de app_metadata e apaga chaves nulas).
 */
export function roleAppMetadata(role: Role, consultorNome?: ConsultorNome): Record<string, unknown> {
  return { role, consultorNome: role === "consultor" ? consultorNome : null };
}

const LIST_PER_PAGE = 1000;
const LIST_MAX_PAGES = 100; // trava de segurança (até ~100k contas)

/**
 * Lista TODAS as contas do Supabase Auth, paginando `listUsers` até o fim.
 * Fonte única de paginação para o GET de contas e para a contagem de admins.
 * Lança 502 (h3) se o Supabase falhar.
 */
export async function listAllAuthUsers(admin: SupabaseClient): Promise<User[]> {
  const all: User[] = [];
  for (let page = 1; page <= LIST_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: LIST_PER_PAGE });
    if (error) {
      throw createError({
        statusCode: 502,
        statusMessage: "Não foi possível listar as contas no Supabase Auth.",
      });
    }
    all.push(...data.users);
    // `nextPage` vem null na última página; o fallback cobre respostas sem ele.
    const hasNext = "nextPage" in data && (data as { nextPage?: number | null }).nextPage != null;
    if (!hasNext || data.users.length < LIST_PER_PAGE) break;
  }
  return all;
}

/** Quantas contas têm `app_metadata.role === "administrador"`. */
export async function countAdmins(admin: SupabaseClient): Promise<number> {
  const users = await listAllAuthUsers(admin);
  return users.filter((u) => toAdminUserSummary(u).role === "administrador").length;
}

/**
 * Trava anti-lockout compartilhada por DELETE e PATCH (demoção) de contas:
 * bloqueia mexer na ÚNICA conta `administrador` restante — vale para qualquer
 * conta, inclusive a própria. Lança 404 (h3) se a conta não existir e 400 (h3)
 * se a ação deixaria o sistema sem admin. Não lança nada no caminho feliz.
 */
export async function assertNotLastAdmin(
  admin: SupabaseClient,
  targetId: string,
  acao: "excluir" | "demover",
): Promise<void> {
  const users = await listAllAuthUsers(admin);
  const target = users.find((u) => u.id === targetId);
  if (!target) {
    throw createError({ statusCode: 404, statusMessage: "Conta não encontrada." });
  }
  const targetIsAdmin = toAdminUserSummary(target).role === "administrador";
  const adminCount = users.filter((u) => toAdminUserSummary(u).role === "administrador").length;
  if (targetIsAdmin && adminCount <= 1) {
    throw createError({
      statusCode: 400,
      statusMessage:
        acao === "excluir"
          ? "Não é possível excluir o único administrador restante."
          : "Não é possível remover o cargo do único administrador restante.",
    });
  }
}

/** Converte um `User` do Supabase no resumo não sensível exposto ao admin. */
export function toAdminUserSummary(user: User): AdminUserSummary {
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const role: Role = isRole(meta.role) ? meta.role : "consultor";
  const consultorNome =
    role === "consultor" && isConsultorNome(meta.consultorNome) ? meta.consultorNome : undefined;

  return {
    id: user.id,
    email: user.email ?? "",
    role,
    consultorNome,
    createdAt: user.created_at ?? "",
    lastSignInAt: user.last_sign_in_at ?? null,
  };
}

/**
 * Normaliza o usuário do Supabase num `AuthUser`, resolvendo o cargo a partir
 * de `app_metadata.role`.
 *
 * Rede de segurança da migração: se `app_metadata.role` estiver ausente e o
 * e-mail estiver em `NUXT_ADMIN_EMAILS`, trata como `administrador` (pra não
 * travar a conta atual antes de os metadados serem gravados). Qualquer outra
 * conta sem `role` definido cai no default mais restritivo (`consultor` sem
 * `consultorNome` → não vê nada e não acessa outras páginas).
 */
export function resolveAuthUser(user: User, adminEmails: string[]): AuthUser {
  const email = user.email ?? "";
  const meta = (user.app_metadata ?? {}) as Record<string, unknown>;

  let role: Role;
  if (isRole(meta.role)) {
    role = meta.role;
  } else if (email && adminEmails.includes(email.toLowerCase())) {
    role = "administrador";
  } else {
    role = "consultor";
  }

  let consultorNome: ConsultorNome | undefined;
  if (role === "consultor" && isConsultorNome(meta.consultorNome)) {
    consultorNome = meta.consultorNome;
  }

  return {
    id: user.id,
    email,
    role,
    consultorNome,
    isAdmin: role === "administrador",
  };
}
