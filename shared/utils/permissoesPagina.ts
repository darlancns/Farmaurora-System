import {
  canReadSection,
  canWriteSection,
  isAuthenticatedAnyApiPath,
  isWriteMethod,
  sectionForApiPath,
  type Role,
  type Section,
} from "./rbac";

/**
 * Permissão por página (cargos operacional e sócio) — camada aditiva sobre shared/utils/rbac.ts.
 *
 * - Cada conta pode ter um mapa `seção -> nível` gravado em `app_metadata.permissoes`.
 * - Níveis: "nenhum" (nem lê), "ver" (só leitura: GET) e "editar" (leitura e escrita).
 * - SEM mapa gravado (null/undefined) vale a regra do cargo, exatamente a de `canReadSection` /
 *   `canWriteSection`. COM mapa gravado, seção ausente = "nenhum" (fail-closed) e valor inválido = "nenhum".
 * - O mapa só vale para os cargos de ROLES_COM_PERMISSAO e só para as seções de SECOES_COM_PERMISSAO.
 *   Consultor e administrador, e as seções recados, config e admin, seguem sempre a regra do cargo.
 * - Seção nova (ex.: "compras"): entra em `Section` (rbac.ts), em SECOES_COM_PERMISSAO e em
 *   ROTA_INICIAL_POR_SECAO abaixo — o compilador acusa se faltar a rota. Nada mais muda.
 */

export type NivelPermissao = "nenhum" | "ver" | "editar";

export const NIVEIS_PERMISSAO: readonly NivelPermissao[] = ["nenhum", "ver", "editar"];

export function isNivelPermissao(value: unknown): value is NivelPermissao {
  return typeof value === "string" && (NIVEIS_PERMISSAO as readonly string[]).includes(value);
}

/**
 * Seções controladas pelo mapa, NA ORDEM em que `paginaInicial` as procura (a mesma ordem do menu).
 * Recados, Configurações e Contas (admin) ficam de fora de propósito.
 */
export const SECOES_COM_PERMISSAO = ["processos", "pagamentos", "patients"] as const satisfies readonly Section[];

export type SecaoComPermissao = (typeof SECOES_COM_PERMISSAO)[number];

/** Rota de cada seção controlada — a página inicial de quem só pode ler aquela seção. */
export const ROTA_INICIAL_POR_SECAO: Record<SecaoComPermissao, string> = {
  processos: "/processos",
  pagamentos: "/pagamentos",
  patients: "/prestacao",
};

/** Cargos que aceitam o mapa de permissões. */
export const ROLES_COM_PERMISSAO: readonly Role[] = ["socio", "operacional"];

/** Mapa seção -> nível. Seção ausente (com o mapa gravado) vale "nenhum". */
export type Permissoes = Partial<Record<Section, NivelPermissao>>;

/** O mínimo de um usuário que as funções abaixo precisam (AuthUser satisfaz). */
export interface UsuarioRbac {
  role: Role;
  permissoes?: Permissoes | null;
}

/** Rota de entrada de quem não pode ler nenhuma seção controlada: Recados é aberto a todos os cargos. */
export const ROTA_INICIAL_PADRAO = "/recados";

function secaoTemPermissao(secao: Section): boolean {
  return (SECOES_COM_PERMISSAO as readonly Section[]).includes(secao);
}

/**
 * Normaliza o que veio de `app_metadata.permissoes`:
 * - null/undefined → undefined (sem mapa: vale a regra do cargo);
 * - objeto → mapa completo, com TODAS as seções controladas; valor inválido ou ausente vira "nenhum";
 *   chaves desconhecidas são descartadas;
 * - qualquer outra coisa gravada (texto, número, lista, booleano) → tudo "nenhum": há algo gravado, só que
 *   ilegível, e na dúvida o acesso é negado (nunca volta para a regra do cargo).
 */
export function sanitizarPermissoes(bruto: unknown): Permissoes | undefined {
  if (bruto === null || bruto === undefined) return undefined;
  const origem: Record<string, unknown> =
    typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const mapa: Permissoes = {};
  for (const secao of SECOES_COM_PERMISSAO) {
    const valor = origem[secao];
    mapa[secao] = isNivelPermissao(valor) ? valor : "nenhum";
  }
  return mapa;
}

/**
 * Nível do usuário na seção quando o MAPA decide; null quando quem decide é a regra do cargo (sem mapa,
 * cargo que não usa mapa, ou seção fora de SECOES_COM_PERMISSAO).
 */
export function nivelDaSecao(user: UsuarioRbac, secao: Section): NivelPermissao | null {
  const mapa = user.permissoes;
  if (mapa === null || mapa === undefined) return null;
  if (!ROLES_COM_PERMISSAO.includes(user.role) || !secaoTemPermissao(secao)) return null;
  const valor = typeof mapa === "object" ? (mapa as Record<string, unknown>)[secao] : undefined;
  return isNivelPermissao(valor) ? valor : "nenhum";
}

/** Lê a seção? Sem mapa, é exatamente `canReadSection`. */
export function podeLer(user: UsuarioRbac, secao: Section): boolean {
  const nivel = nivelDaSecao(user, secao);
  return nivel === null ? canReadSection(user.role, secao) : nivel !== "nenhum";
}

/** Escreve na seção? Sem mapa, é exatamente `canWriteSection`. Só "editar" escreve. */
export function podeEscrever(user: UsuarioRbac, secao: Section): boolean {
  const nivel = nivelDaSecao(user, secao);
  return nivel === null ? canWriteSection(user.role, secao) : nivel === "editar";
}

/**
 * Página de entrada do usuário (depois do login e em "/"): a primeira seção controlada que ele lê, na ordem
 * do menu, ou /recados (aberto a todos). Nunca devolve uma página que o usuário não possa abrir, então o
 * guarda de navegação nunca redireciona a própria página inicial (sem loop). Sem mapa, é "/processos" para
 * todos os cargos, como sempre foi.
 */
export function paginaInicial(user: UsuarioRbac): string {
  for (const secao of SECOES_COM_PERMISSAO) {
    if (podeLer(user, secao)) return ROTA_INICIAL_POR_SECAO[secao];
  }
  return ROTA_INICIAL_PADRAO;
}

// ── Decisão de autorização das rotas /api ─────────────────────────────────────────────────────────

export const MENSAGEM_API_NAO_AUTENTICADO = "Não autenticado.";
export const MENSAGEM_API_ROTA_NAO_AUTORIZADA = "Rota não autorizada.";
export const MENSAGEM_API_SEM_PERMISSAO = "Sem permissão para esta operação.";

export type DecisaoApi =
  | { permitido: true }
  | { permitido: false; status: 401 | 403; mensagem: string };

const PERMITIDO: DecisaoApi = { permitido: true };

/**
 * A decisão do middleware de servidor (server/middleware/auth.ts), como função pura:
 * 1. fora de `/api/` → permitido (o middleware não se aplica);
 * 2. prefixo público (`opcoes.prefixosPublicos`, hoje nenhum) → permitido;
 * 3. sem sessão → 401;
 * 4. `/api/auth/**` → permitido a qualquer sessão;
 * 5. rota sem seção mapeada → 403 (nega por padrão);
 * 6. senão, escrita (POST/PUT/PATCH/DELETE) exige `podeEscrever` e leitura exige `podeLer`, → 403 se falhar.
 */
export function autorizarApi(
  user: UsuarioRbac | null | undefined,
  path: string,
  metodo: string,
  opcoes: { prefixosPublicos?: readonly string[] } = {},
): DecisaoApi {
  if (!path.startsWith("/api/")) return PERMITIDO;
  if ((opcoes.prefixosPublicos ?? []).some((prefixo) => path.startsWith(prefixo))) return PERMITIDO;

  if (!user) return { permitido: false, status: 401, mensagem: MENSAGEM_API_NAO_AUTENTICADO };

  if (isAuthenticatedAnyApiPath(path)) return PERMITIDO;

  const secao = sectionForApiPath(path);
  if (!secao) return { permitido: false, status: 403, mensagem: MENSAGEM_API_ROTA_NAO_AUTORIZADA };

  const permitido = isWriteMethod(metodo) ? podeEscrever(user, secao) : podeLer(user, secao);
  return permitido ? PERMITIDO : { permitido: false, status: 403, mensagem: MENSAGEM_API_SEM_PERMISSAO };
}
