import { createError } from "h3";
import type { AuthUser } from "#shared/types/auth";
import type { Role } from "#shared/utils/rbac";
import { consultorExisteNoCadastro } from "./consultoresCadastro";

// Ligação da conta de login com um consultor do Cadastro (`app_metadata.consultorNome`). O nome só vale se EXISTE no Cadastro —
// ativo OU inativo: a conta de um consultor desativado continua funcionando (quem bloqueia o login é desativar a conta).
// A leitura do banco tem cache curto só de acertos (ver consultorExisteNoCadastro).

/**
 * Cadastro/edição de conta (POST/PATCH do administrador): o consultor escolhido tem que existir no Cadastro. Só confere o cargo
 * consultor. 400 com a mesma mensagem de sempre quando o nome não existe.
 */
export async function exigirConsultorDaContaNoCadastro(role: Role, consultorNome: string | undefined): Promise<void> {
  if (role !== "consultor" || consultorNome === undefined) return;
  if (!(await consultorExisteNoCadastro(consultorNome))) {
    throw createError({
      statusCode: 400,
      statusMessage: "Para o cargo consultor, informe um consultorNome válido (um dos consultores cadastrados).",
    });
  }
}

/**
 * Sessão (server/middleware/auth.ts): conta de consultor cujo nome NÃO existe no Cadastro fica como "consultor sem nome válido"
 * (não vê nenhum processo e não acessa outras páginas), o mesmo comportamento de sempre. Falha ao ler o Cadastro também (fecha,
 * nunca abre). Qualquer outro cargo, ou conta sem nome, passa direto sem tocar o banco.
 */
export async function conferirConsultorDaSessao(user: AuthUser): Promise<AuthUser> {
  if (user.role !== "consultor" || !user.consultorNome) return user;
  try {
    if (await consultorExisteNoCadastro(user.consultorNome)) return user;
  } catch (e) {
    console.error("[auth] não foi possível conferir o consultor da conta no Cadastro:", e);
  }
  const { consultorNome: _removido, ...semNome } = user;
  return semNome;
}
