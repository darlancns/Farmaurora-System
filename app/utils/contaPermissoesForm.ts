import {
  NIVEIS_PERMISSAO,
  ROLES_COM_PERMISSAO,
  SECOES_COM_PERMISSAO,
  podeEscrever,
  podeLer,
  type NivelPermissao,
  type Permissoes,
  type SecaoComPermissao,
} from "#shared/utils/permissoesPagina";
import type { Role } from "#shared/utils/rbac";

// Regras PURAS da tabela de permissões por página do formulário de conta (ContaFormModal.vue). As seções e os níveis
// vêm de shared/utils/permissoesPagina.ts — aqui só ficam os nomes da interface e a decisão do que enviar.

/** Nomes das seções na interface. `Record` tipado: seção nova em SECOES_COM_PERMISSAO exige o rótulo aqui. */
export const ROTULO_SECAO_PERMISSAO: Record<SecaoComPermissao, string> = {
  processos: "Processos",
  pagamentos: "Pagamentos",
  patients: "Prestação de Contas",
};

export const ROTULO_NIVEL_PERMISSAO: Record<NivelPermissao, string> = {
  nenhum: "Nenhum",
  ver: "Ver",
  editar: "Editar",
};

/** Os 3 níveis, na ordem da tela: Nenhum, Ver, Editar. */
export const NIVEIS_NA_TELA: readonly NivelPermissao[] = NIVEIS_PERMISSAO;

/** As seções, na ordem da tela (a de SECOES_COM_PERMISSAO). */
export const SECOES_NA_TELA: readonly SecaoComPermissao[] = SECOES_COM_PERMISSAO;

export const TEXTO_AJUDA_PERMISSOES =
  "Recados e Minha conta ficam sempre abertos. Configurações e Contas são só do administrador.";

export const AVISO_TUDO_NENHUM = "Esta conta só vai ver Recados e Minha conta.";

export const MENSAGEM_PERMISSAO_SALVA =
  "A mudança vale no servidor em instantes. A pessoa precisa recarregar a página para ver o menu atualizado.";

/** Valores da tabela: sempre as 3 seções, cada uma com um nível. */
export type ValoresPermissoes = Record<SecaoComPermissao, NivelPermissao>;

/** O cargo usa o mapa de permissões por página? (só sócio e operacional) */
export function usaMapaDePermissoes(role: Role): boolean {
  return ROLES_COM_PERMISSAO.includes(role);
}

export function valoresTudoNenhum(): ValoresPermissoes {
  return Object.fromEntries(SECOES_COM_PERMISSAO.map((secao) => [secao, "nenhum"])) as ValoresPermissoes;
}

export function estaTudoNenhum(valores: ValoresPermissoes): boolean {
  return SECOES_COM_PERMISSAO.every((secao) => valores[secao] === "nenhum");
}

/** Mapa gravado (ou parcial) -> valores completos; seção ausente = "nenhum", como no servidor. */
export function valoresDoMapa(mapa: Permissoes | null | undefined): ValoresPermissoes {
  const valores = valoresTudoNenhum();
  if (!mapa) return valores;
  for (const secao of SECOES_COM_PERMISSAO) valores[secao] = mapa[secao] ?? "nenhum";
  return valores;
}

/**
 * O que o CARGO dá hoje (a regra de uma conta sem mapa), seção a seção, com as mesmas funções do servidor e do menu:
 * escreve = "editar"; só lê = "ver"; senão "nenhum". É o que a tabela mostra numa conta sem mapa gravado.
 */
export function padraoDoCargo(role: Role): ValoresPermissoes {
  const valores = valoresTudoNenhum();
  for (const secao of SECOES_COM_PERMISSAO) {
    if (podeEscrever({ role }, secao)) valores[secao] = "editar";
    else if (podeLer({ role }, secao)) valores[secao] = "ver";
  }
  return valores;
}

export interface EntradaEnvioPermissoes {
  modo: "criacao" | "edicao";
  role: Role;
  valores: ValoresPermissoes;
  /** A pessoa mexeu em alguma linha da tabela (só conta na edição). */
  tocada: boolean;
  /** Edição de conta COM mapa gravado: a pessoa pediu "Restaurar padrão do cargo". */
  restaurar: boolean;
}

export type EnvioPermissoes = { incluir: false } | { incluir: true; valor: Permissoes | null };

/**
 * O que vai no campo `permissoes` do POST/PATCH (o servidor é estrito: ver parsePermissoesInput):
 * - cargo que não usa mapa (consultor, administrador): NUNCA envia — nem se a tabela foi mexida antes de trocar o cargo;
 * - criação: sempre o mapa completo;
 * - edição: "Restaurar padrão do cargo" envia null (apaga o mapa); tabela mexida envia o mapa completo; tabela intacta
 *   NÃO envia o campo (o servidor preserva o que a conta tem — inclusive "sem mapa" —, então abrir "Editar" no Bruno
 *   e salvar não grava mapa nele).
 */
export function permissoesParaEnvio(entrada: EntradaEnvioPermissoes): EnvioPermissoes {
  if (!usaMapaDePermissoes(entrada.role)) return { incluir: false };
  if (entrada.modo === "criacao") return { incluir: true, valor: { ...entrada.valores } };
  if (entrada.restaurar) return { incluir: true, valor: null };
  if (entrada.tocada) return { incluir: true, valor: { ...entrada.valores } };
  return { incluir: false };
}
