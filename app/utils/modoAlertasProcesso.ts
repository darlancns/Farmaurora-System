import { podeEscrever, podeLer, type UsuarioRbac } from "#shared/utils/permissoesPagina";

/**
 * Como o sino trata os alertas DERIVADOS de Processo[] (Fornecedor, Mandado de Segurança e "chegou?"):
 * - "editar": o usuário lê e escreve em Processos — os alertas aparecem, contam no badge e têm os botões de ação
 *   (resolver Fornecedor/Mandado, [Sim, chegou], [Ainda não], olhinho do administrador);
 * - "ver": só lê Processos (conta com mapa de permissões em "ver") — os alertas aparecem na lista, SEM botões
 *   e FORA do badge (nada pode ser feito com eles);
 * - "nenhum": não recebe esses alertas (e a lista de processos nem é buscada para o sino).
 *
 * O consultor nunca recebeu esses alertas (lê Processos, mas só os próprios e sem escrita): continua "nenhum".
 * Sem mapa de permissões, socio, operacional e administrador são "editar", como era com `canWrite("processos")`.
 */
export type ModoAlertasProcesso = "nenhum" | "ver" | "editar";

export function modoAlertasProcesso(user: UsuarioRbac | null | undefined): ModoAlertasProcesso {
  if (!user || user.role === "consultor") return "nenhum";
  if (podeEscrever(user, "processos")) return "editar";
  if (podeLer(user, "processos")) return "ver";
  return "nenhum";
}
