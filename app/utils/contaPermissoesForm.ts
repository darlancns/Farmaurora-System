import {
  NIVEIS_PERMISSAO,
  ROLES_COM_PERMISSAO,
  SECOES_COM_PERMISSAO,
  type NivelPermissao,
  type Permissoes,
  type SecaoComPermissao,
} from "#shared/utils/permissoesPagina";
import { canReadSection, canWriteSection, type Role } from "#shared/utils/rbac";
import { secaoDesligada } from "#shared/utils/secoesDesligadas";

// Regras PURAS da tabela de permissões por página do formulário de conta (ContaFormModal.vue). As seções e os níveis
// vêm de shared/utils/permissoesPagina.ts — aqui só ficam os nomes da interface e a decisão do que enviar.

/** Nomes das seções na interface. `Record` tipado: seção nova em SECOES_COM_PERMISSAO exige o rótulo aqui. */
export const ROTULO_SECAO_PERMISSAO: Record<SecaoComPermissao, string> = {
  processos: "Processos",
  pagamentos: "Pagamentos",
  patients: "Prestação de Contas",
  dir: "DIR",
  compras: "Compras",
};

export const ROTULO_NIVEL_PERMISSAO: Record<NivelPermissao, string> = {
  nenhum: "Nenhum",
  ver: "Ver",
  editar: "Editar",
};

/** Os 3 níveis, na ordem da tela: Nenhum, Ver, Editar. */
export const NIVEIS_NA_TELA: readonly NivelPermissao[] = NIVEIS_PERMISSAO;

/**
 * As seções que a tela MOSTRA, na ordem de SECOES_COM_PERMISSAO. Uma seção desligada por configuração (a DIR sem NUXT_PUBLIC_DIR_HABILITADA=true)
 * não tem linha na tela. O VALOR dela continua nos `valores`/no mapa (e o servidor continua aceitando a chave `dir`): nada se perde, e o que
 * estava gravado volta a aparecer quando a DIR for ligada.
 */
export function secoesNaTela(): SecaoComPermissao[] {
  return SECOES_COM_PERMISSAO.filter((secao) => !secaoDesligada(secao));
}

export const TEXTO_AJUDA_PERMISSOES =
  "Recados e Minha conta ficam sempre abertos. Configurações, Cadastros e Contas são só do administrador.";

export const AVISO_TUDO_NENHUM = "Esta conta só vai ver Recados e Minha conta.";

export const MENSAGEM_PERMISSAO_SALVA =
  "A mudança vale no servidor em instantes. A pessoa precisa recarregar a página para ver o menu atualizado.";

/** Valores da tabela: sempre todas as seções controladas, cada uma com um nível. */
export type ValoresPermissoes = Record<SecaoComPermissao, NivelPermissao>;

/** O cargo usa o mapa de permissões por página? (só sócio e operacional) */
export function usaMapaDePermissoes(role: Role): boolean {
  return ROLES_COM_PERMISSAO.includes(role);
}

export function valoresTudoNenhum(): ValoresPermissoes {
  return Object.fromEntries(SECOES_COM_PERMISSAO.map((secao) => [secao, "nenhum"])) as ValoresPermissoes;
}

/** Todas as seções que valem hoje estão em "nenhum"? (uma seção desligada por configuração não conta: a conta não a enxerga de qualquer jeito) */
export function estaTudoNenhum(valores: ValoresPermissoes): boolean {
  return SECOES_COM_PERMISSAO.every((secao) => secaoDesligada(secao) || valores[secao] === "nenhum");
}

/** Mapa gravado (ou parcial) -> valores completos; seção ausente = "nenhum", como no servidor. */
export function valoresDoMapa(mapa: Permissoes | null | undefined): ValoresPermissoes {
  const valores = valoresTudoNenhum();
  if (!mapa) return valores;
  for (const secao of SECOES_COM_PERMISSAO) valores[secao] = mapa[secao] ?? "nenhum";
  return valores;
}

/**
 * O que o CARGO dá hoje (a regra de uma conta sem mapa), seção a seção, com as regras do cargo do servidor (`canWriteSection` e
 * `canReadSection`): escreve = "editar"; só lê = "ver"; senão "nenhum". É o que a tabela mostra numa conta sem mapa gravado.
 *
 * De propósito NÃO passa por `podeLer`/`podeEscrever`: elas devolvem "nenhum" para uma seção desligada por configuração (a DIR), e
 * o padrão gravado numa conta que o administrador editasse com a DIR desligada tiraria a DIR dela para sempre. Assim o padrão do cargo
 * é o mesmo, ligada ou não.
 */
export function padraoDoCargo(role: Role): ValoresPermissoes {
  const valores = valoresTudoNenhum();
  for (const secao of SECOES_COM_PERMISSAO) {
    if (canWriteSection(role, secao)) valores[secao] = "editar";
    else if (canReadSection(role, secao)) valores[secao] = "ver";
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
