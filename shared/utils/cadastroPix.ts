import type { ListaCadastro } from "../types/Cadastro";
import { LISTAS_COM_PIX } from "../constants/cadastros";
import { podeLer, type UsuarioRbac } from "./permissoesPagina";

// Chave PIX dos Cadastros (despachantes e transportadoras) = DADO FINANCEIRO.
//
// REGRA DE VISIBILIDADE (uma só, usada pelo servidor e pela tela):
//   a chave só é devolvida/mostrada se o usuário é ADMINISTRADOR **ou** pode LER a seção "pagamentos" — pela mesma função
//   de permissão do resto do sistema (`podeLer`, que respeita o mapa de permissões por página de sócio e operacional e,
//   sem mapa, a regra do cargo). Para os demais o campo NÃO EXISTE na resposta (nem como null).
// Escrever a chave é SÓ do administrador (os handlers de POST/PATCH exigem o cargo; ver server/utils/cadastroAcesso.ts).

/** O usuário pode ver (e receber da API) a chave PIX dos Cadastros? */
export function podeVerPixCadastro(user: UsuarioRbac | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "administrador") return true;
  return podeLer(user, "pagamentos");
}

/** A lista guarda chave PIX? (despachantes e transportadoras) */
export function listaTemPix(lista: ListaCadastro): boolean {
  return LISTAS_COM_PIX.includes(lista);
}
