import { createError, getRouterParam, type H3Event } from "h3";
import { LISTAS_CADASTRO } from "../../shared/constants/cadastros";
import type { ListaCadastro } from "../../shared/types/Cadastro";
import type { AuthUser } from "../../shared/types/auth";
import { podeVerPixCadastro } from "../../shared/utils/cadastroPix";

// Apoio dos handlers de /api/cadastros/**.

/**
 * Só o administrador escreve nos Cadastros. O middleware (server/middleware/auth.ts) já recusa a escrita de quem não
 * pode escrever na seção "config" — esta checagem dentro do handler é a segunda camada (o mesmo molde de
 * server/api/chegada-avisos/visto.post.ts), para o handler continuar seguro mesmo se a seção for remapeada.
 */
export function exigirAdministradorNosCadastros(user: AuthUser | null | undefined): AuthUser {
  if (!user || user.role !== "administrador") {
    throw createError({ statusCode: 403, statusMessage: "Apenas o administrador pode alterar os Cadastros." });
  }
  return user;
}

/**
 * O usuário recebe a chave PIX nas respostas? Só o administrador e quem LÊ a seção Pagamentos (pelo mapa de permissões
 * por página, quando houver; senão pela regra do cargo). A regra única está em shared/utils/cadastroPix.ts. Sem usuário: não.
 */
export function usuarioVePix(user: AuthUser | null | undefined): boolean {
  return podeVerPixCadastro(user);
}

/** A lista da rota (`/api/cadastros/:lista`): só as quatro conhecidas; qualquer outra é 404. */
export function listaDaRota(event: H3Event): ListaCadastro {
  const lista = getRouterParam(event, "lista");
  if (!lista || !(LISTAS_CADASTRO as readonly string[]).includes(lista)) {
    throw createError({ statusCode: 404, statusMessage: "Lista de cadastro não encontrada." });
  }
  return lista as ListaCadastro;
}
